import { parse } from "parse5";
import type { DefaultTreeAdapterTypes as T } from "parse5";
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
  return { lines: lines.done(), pages: [], unreadable: [...unreadable, ...decoded.unreadable] };
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
    else if (tag === "img") {
      const alt = attr(el, "alt");
      if (alt) lines.add(`[画像: ${alt}]`);
    } else if (BLOCK.has(tag)) {
      lines.flush();
      walk(el, lines);
      lines.flush();
    } else walk(el, lines);
  }
}

/** A form field as a line: its kind, name and value, so a changed or emptied value shows up. */
function formValue(el: T.Element): string {
  const name = attr(el, "name") ?? attr(el, "id") ?? "";
  if (el.tagName === "select") {
    const options = collect(el, (n) => n.tagName === "option");
    const chosen = options.filter((o) => attr(o, "selected") !== null);
    const shown = (chosen.length > 0 ? chosen : options.slice(0, 1)).map((o) => textOf(o)).join(", ");
    return `[select ${name}: ${shown}]`;
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
      else if (n.tagName === "br") text += keepLines ? "\n" : " ";
      else n.childNodes.forEach(visit);
    }
  };
  el.childNodes.forEach(visit);
  return keepLines ? text.replace(/\r\n/g, "\n").replace(/^\n/, "").replace(/\n$/, "") : text.replace(/\s+/g, " ").trim();
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
