import { VERDICT_LABEL } from "@/lib/judge/verdict";
import type { Block, Cell } from "@/lib/record/doc";
import { Badge } from "./Badge";
import styles from "./doc.module.css";

/**
 * The record of what was checked (lib/record/doc.ts) as a page to read. Every text is a text node:
 * summaries from Claude and excerpts of outputs are shown, never interpreted as HTML.
 */
export function RecordView({ doc }: { doc: Block[] }) {
  return <article className={styles.doc}>{doc.map((b, i) => <BlockView key={i} block={b} />)}</article>;
}

function BlockView({ block: b }: { block: Block }) {
  switch (b.kind) {
    case "title":
      return <h1 className={styles.docTitle}>{b.text}</h1>;
    case "note":
      return <p className={styles.note}>{b.text}</p>;
    case "heading":
      return <h2 className={styles.heading}>{b.text}</h2>;
    case "paragraph":
      return <p className={b.strong ? styles.strong : styles.paragraph}><Inline text={b.text} /></p>;
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return (
        <List className={styles.list}>
          {b.items.map((item, i) => (
            <li key={i}>
              <Inline text={item.text} />
              {item.children && (
                <ul className={styles.subList}>
                  {item.children.map((c, j) => (
                    <li key={j}><Inline text={c} /></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((row, i) => (
                <tr key={i}>{row.map((c, j) => <td key={j}><CellView cell={c} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <div className={styles.code}>
          <p className={styles.codeLabel}>{b.label}</p>
          <pre>{b.text}</pre>
        </div>
      );
  }
}

/** A verdict cell: the coloured label, then who judged it and how, as the Markdown says it. */
function CellView({ cell }: { cell: Cell }) {
  if (typeof cell === "string") return <Inline text={cell} />;
  if (cell.verdict === "unjudged") return <span className={styles.muted}>{cell.text}</span>;
  const label = VERDICT_LABEL[cell.verdict];
  const rest = cell.text.startsWith(label) ? cell.text.slice(label.length).replace(/^（(.*)）$/, "$1") : cell.text;
  return (
    <>
      <Badge verdict={cell.verdict} small />
      {rest && <span className={styles.judgedBy}>{rest}</span>}
    </>
  );
}

/** Text with `code` spans, the one mark the record uses inside a line. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}
