import { defaultTreeAdapter, parse, serialize } from "parse5";
import type { DefaultTreeAdapterTypes as T } from "parse5";
import { normalizeLine, type LineMark } from "../case-marks";
import type { ExtractedDocument } from "./document";
import { decode, readBytes } from "./text";

// The only file that knows about HTML. A page becomes what a person reads on it: the visible
// text in order, one line per block, each table row on one line, and the values in its forms
// (DESIGN 3-②). Markup, styles and scripts are left out; so is how the page looks.

/** Elements that start and end a line of their own. */
const BLOCK = new Set(
  "address article aside blockquote caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table tbody thead tfoot ul legend".split(" "),
);
/** Never shown to a reader. The title is kept as a line of its own. */
const SKIP = new Set(["script", "style", "noscript", "template", "head"]);

export async function extractHtml(path: string, encoding: string): Promise<ExtractedDocument> {
  const bytes = await readBytes(path);
  const declared = declaredCharset(bytes);
  const unreadable: string[] = [];
  let used = encoding;
  if (declared) {
    if (isSupported(declared)) used = declared;
    else unreadable.push(`HTML が宣言している文字コード ${declared} に対応していないので、${encoding} として読みました`);
  }
  const decoded = decode(bytes, used);
  const doc = parse(decoded.text);
  const lines = new Lines();
  const title = findTitle(doc);
  if (title) lines.push(`title: ${title}`);
  walk(doc, lines);
  // An image with no alt text leaves no text behind, so a vanished seal or chart is counted here.
  const images = collect(doc, (el) => el.tagName === "img").length;
  return { lines: [...lines.done(), `layout: 画像 ${images} 個`], pages: [], unreadable: [...unreadable, ...decoded.unreadable], undecodable: decoded.undecodable };
}

/** Text collected into lines; a block boundary ends the current line. */
class Lines {
  private out: string[] = [];
  private current = "";
  add(text: string): void {
    this.current += text;
  }
  push(line: string): void {
    this.flush();
    if (line.trim() !== "") this.out.push(line.trim());
  }
  flush(): void {
    const line = this.current.replace(/\s+/g, " ").trim();
    if (line !== "") this.out.push(line);
    this.current = "";
  }
  done(): string[] {
    this.flush();
    return this.out;
  }
}

function walk(node: T.ParentNode, lines: Lines): void {
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") {
      lines.add((child as T.TextNode).value);
      continue;
    }
    if (!("tagName" in child)) continue;
    const el = child as T.Element;
    const tag = el.tagName;
    if (SKIP.has(tag)) continue;
    if (tag === "br") lines.flush();
    else if (tag === "tr") lines.push(el.childNodes.filter(isCell).map((cell) => textOf(cell)).join(" | "));
    else if (tag === "pre") {
      lines.flush();
      for (const line of textOf(el, true).split("\n")) lines.push(line);
    } else if (tag === "input" || tag === "select" || tag === "textarea") lines.push(formValue(el));
    else if (tag === "img") lines.add(imageText(el));
    else if (BLOCK.has(tag)) {
      lines.flush();
      walk(el, lines);
      lines.flush();
    } else walk(el, lines);
  }
}

/** How a changed line and the place of missing lines look on the page (the tool's red). */
const CHANGED_STYLE = "outline: 3px solid #b42318; outline-offset: 1px; background-color: rgba(180, 35, 24, 0.1);";
const GONE_STYLE = "grid-column: 1 / -1; border-top: 3px solid #b42318; color: #b42318; font: bold 12px sans-serif; text-align: right; padding: 0 4px;";

/**
 * The page with its changed lines framed in red, and a red rule saying how many lines went missing
 * under the line before them, for drawing it in the tool. Lines are found as extractHtml reads
 * them: a table row, or a block with no block inside it. Nothing is added that runs.
 */
export function markLines(html: string, marks: LineMark[]): string {
  if (marks.length === 0) return html;
  const changed = new Set(marks.filter((m) => m.kind === "changed").map((m) => normalizeLine(m.text)));
  const gone = new Map(marks.flatMap((m) => (m.kind === "goneAfter" ? [[normalizeLine(m.text), m.count] as const] : [])));
  const doc = parse(html);
  markIn(doc, changed, gone);
  return serialize(doc);
}

function markIn(node: T.ParentNode, changed: Set<string>, gone: Map<string, number>): void {
  for (const child of [...node.childNodes]) {
    if (!("tagName" in child)) continue;
    const el = child as T.Element;
    if (SKIP.has(el.tagName)) continue;
    const line = el.tagName === "tr" ? rowLine(el) : BLOCK.has(el.tagName) && !hasBlockInside(el) ? textOf(el) : null;
    if (line !== null) {
      const key = normalizeLine(line);
      if (changed.has(key)) addStyle(el, CHANGED_STYLE);
      const count = gone.get(key);
      if (count !== undefined) insertAfter(el, goneMarker(el, count));
      if (el.tagName === "tr") continue;
    }
    markIn(el, changed, gone);
  }
}

/** A table row as one line: its cells joined, as extractHtml reads it. */
function rowLine(tr: T.Element): string {
  return tr.childNodes
    .filter(isCell)
    .map((cell) => textOf(cell))
    .join(" | ");
}

function hasBlockInside(el: T.Element): boolean {
  return collect(el, (n) => BLOCK.has(n.tagName) || n.tagName === "tr" || n.tagName === "br").length > 0;
}

function addStyle(el: T.Element, style: string): void {
  const existing = el.attrs.find((a) => a.name === "style");
  if (existing) existing.value = `${existing.value}; ${style}`;
  else el.attrs.push({ name: "style", value: style });
}

/** Under a row, a row of its own across the table; under anything else, a line of its own. */
function goneMarker(after: T.Element, count: number): T.Element {
  const text = `ここにあった ${count} 行が消えています`;
  if (after.tagName === "tr") {
    const row = defaultTreeAdapter.createElement("tr", after.namespaceURI, []);
    const cell = defaultTreeAdapter.createElement("td", after.namespaceURI, [
      { name: "colspan", value: String(Math.max(1, after.childNodes.filter(isCell).length)) },
      { name: "style", value: GONE_STYLE },
    ]);
    defaultTreeAdapter.insertText(cell, text);
    defaultTreeAdapter.appendChild(row, cell);
    return row;
  }
  const line = defaultTreeAdapter.createElement("div", after.namespaceURI, [{ name: "style", value: GONE_STYLE }]);
  defaultTreeAdapter.insertText(line, text);
  return line;
}

function insertAfter(el: T.Element, added: T.Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  const next = parent.childNodes[parent.childNodes.indexOf(el) + 1];
  if (next) defaultTreeAdapter.insertBefore(parent, added, next);
  else defaultTreeAdapter.appendChild(parent, added);
}

/** A form field as a line: its kind, name and value, so a changed or emptied value shows up. */
function formValue(el: T.Element): string {
  const name = attr(el, "name") ?? attr(el, "id") ?? "";
  if (el.tagName === "select") {
    const options = collect(el, (n) => n.tagName === "option");
    const chosen = options.filter((o) => attr(o, "selected") !== null);
    const shown = (chosen.length > 0 ? chosen : options.slice(0, 1)).map((o) => textOf(o)).join(", ");
    // The choices offered are part of the page too: a vanished option is a changed form.
    return `[select ${name}: ${shown}（選択肢 ${options.map((o) => textOf(o)).join(" / ")}）]`;
  }
  if (el.tagName === "textarea") return `[textarea ${name}: ${textOf(el, true)}]`;
  const type = (attr(el, "type") ?? "text").toLowerCase();
  const value = attr(el, "value") ?? "";
  if (type === "checkbox" || type === "radio") return `[${type} ${name}=${value}${attr(el, "checked") !== null ? " 選択" : ""}]`;
  return `[input ${type} ${name}: ${value}]`;
}

function textOf(el: T.Element, keepLines = false): string {
  let text = "";
  const visit = (n: T.ChildNode) => {
    if (n.nodeName === "#text") text += (n as T.TextNode).value;
    else if ("tagName" in n && !SKIP.has(n.tagName)) {
      // A field in a table cell is part of what the row says.
      if (n.tagName === "input" || n.tagName === "select" || n.tagName === "textarea") text += ` ${formValue(n)} `;
      else if (n.tagName === "img") text += imageText(n);
      else if (n.tagName === "br") text += keepLines ? "\n" : " ";
      else n.childNodes.forEach(visit);
    }
  };
  el.childNodes.forEach(visit);
  return keepLines ? text.replace(/\r\n/g, "\n").replace(/^\n/, "").replace(/\n$/, "") : text.replace(/\s+/g, " ").trim();
}

/** An image as text: its alt, the same in a table cell as anywhere else. */
function imageText(img: T.Element): string {
  const alt = attr(img, "alt");
  return alt ? `[画像: ${alt}]` : "";
}

function isCell(n: T.ChildNode): n is T.Element {
  return "tagName" in n && (n.tagName === "td" || n.tagName === "th");
}

function collect(node: T.ParentNode, match: (el: T.Element) => boolean): T.Element[] {
  const found: T.Element[] = [];
  for (const child of node.childNodes) {
    if (!("tagName" in child)) continue;
    if (match(child)) found.push(child);
    found.push(...collect(child, match));
  }
  return found;
}

function findTitle(doc: T.Document): string | null {
  const title = collect(doc, (el) => el.tagName === "title")[0];
  return title ? textOf(title) : null;
}

function attr(el: T.Element, name: string): string | null {
  return el.attrs.find((a) => a.name === name)?.value ?? null;
}

/** The charset a page declares near its start (<meta charset> or http-equiv), as browsers look for it. */
function declaredCharset(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString("latin1");
  const m = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function isSupported(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}
