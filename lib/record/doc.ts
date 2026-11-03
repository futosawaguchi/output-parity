import type { Verdict } from "../judge/verdict";

// The record as a structure, written out twice: as Markdown to keep (toMarkdown) and as a page to
// read (app/check/record). Nothing parses Markdown back, so the two always say the same thing, and
// text from outputs or from Claude is only ever text on the page. Inline code is marked with
// backquotes in both. No Node imports: the page uses this file.

/** A table cell: plain text, or a verdict that the page shows with its colour. */
export type Cell = string | { verdict: Verdict | "unjudged"; text: string };

export type Block =
  | { kind: "title"; text: string }
  | { kind: "note"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; strong?: boolean }
  | { kind: "list"; ordered?: boolean; items: { text: string; children?: string[] }[] }
  | { kind: "table"; head: string[]; rows: Cell[][] }
  | { kind: "code"; label: string; text: string };

export type RecordDoc = Block[];

export function cellText(c: Cell): string {
  return typeof c === "string" ? c : c.text;
}

export function toMarkdown(doc: RecordDoc): string {
  return doc.map(blockToMarkdown).join("\n\n") + "\n";
}

function blockToMarkdown(b: Block): string {
  switch (b.kind) {
    case "title":
      return `# ${b.text}`;
    case "note":
      return `> ${b.text}`;
    case "heading":
      return `## ${b.text}`;
    case "paragraph":
      return b.strong ? `**${b.text}**` : b.text;
    case "list":
      return b.items
        .map((item, i) => [`${b.ordered ? `${i + 1}.` : "-"} ${item.text}`, ...(item.children ?? []).map((c) => `  - ${c}`)].join("\n"))
        .join("\n");
    case "table":
      return [
        `| ${b.head.map(cell).join(" | ")} |`,
        `|${b.head.map(() => "---").join("|")}|`,
        ...b.rows.map((r) => `| ${r.map((c) => cell(cellText(c))).join(" | ")} |`),
      ].join("\n");
    case "code":
      return `${b.label}:\n${fence(b.text)}`;
  }
}

/** The same record with every text passed through `f` (local paths and secrets are tidied this way). */
export function mapText(doc: RecordDoc, f: (s: string) => string): RecordDoc {
  const mapCell = (c: Cell): Cell => (typeof c === "string" ? f(c) : { ...c, text: f(c.text) });
  return doc.map((b): Block => {
    switch (b.kind) {
      case "list":
        return { ...b, items: b.items.map((i) => ({ text: f(i.text), children: i.children?.map(f) })) };
      case "table":
        return { ...b, head: b.head.map(f), rows: b.rows.map((r) => r.map(mapCell)) };
      case "code":
        return { ...b, label: f(b.label), text: f(b.text) };
      default:
        return { ...b, text: f(b.text) };
    }
  });
}

function cell(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

/** A code block that the text cannot close early. */
function fence(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const marks = "`".repeat(longest + 1);
  return `${marks}\n${text}\n${marks}`;
}
