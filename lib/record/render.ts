import { formatsOf } from "../case-output";
import { VERDICT_LABEL, type CaseVerdict } from "../judge/verdict";
import type { CaseReport, RunReport } from "../pipeline";
import { describeOutcome } from "../runner/outcome";
import { describeDelta, describeRemaining, remainingOf } from "../fix/verify";
import type { SentRecord } from "../sent-log";
import type { NewOnly } from "./deprecations";
import { toMarkdown, type Block, type Cell, type RecordDoc } from "./doc";

// The record of what was checked (DESIGN 4-5 "1 への答え"): the document the previous person never
// left. One Markdown page from a report. It says where the outputs came from, every case (none is
// left out, unjudged ones included), what was applied, what was sent to Claude, and what this
// record cannot say. Built as a structure (doc.ts) and written out as Markdown or as a page.
// No Node imports; paths and secrets are tidied by the caller (build.ts).

export type RecordOptions = {
  createdAt: Date;
  /** Deprecation warnings only the new environment printed (deprecations.ts). */
  deprecations: NewOnly;
};

/** How many deprecation lines are quoted; the rest are counted. */
const QUOTED_DEPRECATIONS = 5;
const EXAMPLE_CHARS = 60;

export function renderRecord(report: RunReport, opts: RecordOptions): string {
  return toMarkdown(recordDoc(report, opts));
}

export function recordDoc(report: RunReport, opts: RecordOptions): RecordDoc {
  return [
    { kind: "title", text: `確かめた入力の記録 — ${report.configName}` },
    { kind: "note", text: "output-parity が実行の結果から作った記録です。出力の抜き書き（金額・名前など）を含むことがあります。人に渡す前に読んでください。" },
    ...conclusion(report),
    ...where(report, opts.createdAt),
    ...caseTable(report),
    ...causes(report),
    ...fix(report),
    ...sent(report),
    ...deprecations(report, opts.deprecations),
    ...cannotSay(),
  ];
}

type Group = "broken" | "needs_review" | "unjudged" | "harmless";
const GROUP_LABEL: Record<Group, string> = { ...VERDICT_LABEL, unjudged: "未判定" };

function groupOf(c: CaseReport): Group {
  return (c.verdict ?? c.carried)?.verdict ?? "unjudged";
}

function conclusion(report: RunReport): Block[] {
  const count = (g: Group) => report.cases.filter((c) => groupOf(c) === g).length;
  const same = report.cases.filter((c) => groupOf(c) === "harmless" && isSame(c)).length;
  const groups = (["broken", "needs_review", "unjudged", "harmless"] as Group[]).filter((g) => count(g) > 0);
  const line = `${report.cases.length} 件: ${groups.map((g) => `${GROUP_LABEL[g]} ${count(g)}${g === "harmless" && same > 0 ? `（うち差なし ${same}）` : ""}`).join("・")}`;
  const blocking = (["broken", "needs_review", "unjudged"] as Group[]).filter((g) => count(g) > 0);
  const verdict =
    blocking.length === 0
      ? "試した入力では、旧と新の出力は同じか、違いは無害だと確かめました。"
      : `このままでは移せません。${blocking.map((g) => `${GROUP_LABEL[g]} ${count(g)} 件`).join("・")}を先に見てください。`;
  return [
    { kind: "heading", text: "結論" },
    { kind: "paragraph", text: line },
    { kind: "paragraph", text: verdict, strong: true },
  ];
}

function isSame(c: CaseReport): boolean {
  const r = remainingOf(c);
  return r.kind === "lines" && r.count === 0;
}

function where(report: RunReport, createdAt: Date): Block[] {
  const origin = {
    run: "この手元で、旧と新のプログラムを実行して比べました。",
    rejudge: "出力は同梱のもの（作者の手元で実行したもの）です。この手元では実行していません。判定だけを、この手元で Claude にし直しました。",
    bundled: "同梱の結果です（作者の手元で実行・判定し、リポジトリに入れたもの）。この手元では実行も判定もしていません。",
  }[report.origin];
  const fixed = report.fixAttempt ? "直し方を work/ の写しに当てて、全入力を流し直した結果です（旧の出力は当てる前のもの）。" : "";
  const env = report.environments;
  return [
    { kind: "heading", text: "どこで・何を確かめたか" },
    {
      kind: "list",
      items: [
        `出どころ: ${origin}${fixed}`,
        `実行: ${time(report.startedAt)} 〜 ${time(report.finishedAt)}（この記録を作ったのは ${time(createdAt.toISOString())}）`,
        `題材: ${report.configName}（${report.subjectId}）`,
        `説明: ${oneLine(report.configDescription)}`,
        `旧: ${env.old.label}（\`${env.old.command}\`）`,
        `新: ${env.new.label}（\`${env.new.command}\`）`,
        `出力の形式: ${describeFormats(report)}`,
      ].map((text) => ({ text })),
    },
  ];
}

function caseTable(report: RunReport): Block[] {
  const rows = report.cases.map((c): Cell[] => {
    const old = c.runs.find((r) => r.slot === "old");
    const neu = c.runs.find((r) => r.slot === "new");
    const input = [c.label, c.description, inputOf(c)].filter(Boolean).join(" / ");
    const ran = `${old ? describeOutcome(old.outcome) : "—"} / ${neu ? describeOutcome(neu.outcome) : "—"}`;
    return [input, ran, describeRemaining(remainingOf(c)), dropped(c), { verdict: groupOf(c), text: verdictOf(c, report) }, summaryOf(c)];
  });
  return [
    { kind: "heading", text: "入力ごとの結果" },
    { kind: "table", head: ["入力", "旧 / 新の終わり方", "残った差", "揺れとして落とした差", "判定", "要約"], rows },
    { kind: "paragraph", text: "揺れとして落とした差: 新の環境で2回動かして変わった部分（生成日時・文書 ID など）だけが違う行です。行が増えた・消えた差は落としていません。" },
  ];
}

/** What the case gave the program: its arguments, or the page it opened. */
function inputOf(c: CaseReport): string {
  const run = c.runs.find((r) => r.slot === "old");
  if (!run) return "";
  if (run.request) return `\`${run.request}\``;
  // The output file the tool asked for is a path of this run, not part of the input.
  const args = run.args.map((a) => (a.includes(`${c.caseId}/${run.slot}/output.`) ? "{出力}" : a));
  return args.length > 0 ? `\`${args.join(" ")}\`` : "";
}

function dropped(c: CaseReport): string {
  if (c.comparison.kind !== "compared") return "—";
  if (c.comparison.baseline.kind === "unavailable") return "見分けていません（落とした差なし）";
  const explained = c.comparison.changes.filter((ch) => ch.explainedByBaseline);
  if (explained.length === 0) return "なし";
  const first = explained[0];
  return `${explained.length} か所（例: 「${clip(first.oldLines[0] ?? "")}」→「${clip(first.newLines[0] ?? "")}」）`;
}

function verdictOf(c: CaseReport, report: RunReport): string {
  if (c.verdict) return `${VERDICT_LABEL[c.verdict.verdict]}（${judgedBy(c.verdict)}）`;
  if (c.carried) return `${VERDICT_LABEL[c.carried.verdict]}（当てる前の判定。差は当てる前と同じで、判定し直していない）`;
  return report.judgeHeld ? "未判定（Claude に送る件数が多いので、送る前に止めた）" : "未判定";
}

function judgedBy(v: CaseVerdict): string {
  const by = v.judgedBy;
  if (by.kind === "machine") return "機械";
  if (by.kind === "claude") return `Claude ${by.model}`;
  return `判定できませんでした: ${by.reason}`;
}

function summaryOf(c: CaseReport): string {
  return (c.verdict ?? c.carried)?.summary ?? "";
}

function causes(report: RunReport): Block[] {
  const found = report.cases.flatMap((c) => (c.cause?.kind === "found" ? [{ c, cause: c.cause }] : []));
  if (found.length === 0) return [];
  return [
    { kind: "heading", text: "原因（Claude がソースを読んで指したところ）" },
    {
      kind: "list",
      items: found.map(({ c, cause }) => ({
        text: `${c.label}: ${oneLine(cause.summary)}`,
        children: cause.candidates.map((k) => `\`${k.file}:${k.line}\` ${oneLine(k.change)}`),
      })),
    },
  ];
}

function fix(report: RunReport): Block[] {
  const a = report.fixAttempt;
  if (!a) return [];
  const label = report.cases.find((c) => c.caseId === a.caseId)?.label ?? a.caseId;
  const where = a.applied.kind === "applied" ? `\`${a.applied.file}:${a.applied.line}\`` : `\`${a.edit.file}\``;
  const blocks: Block[] = [
    { kind: "heading", text: "当てた直し方" },
    { kind: "paragraph", text: `${label} の原因として、${where} を書き換えました。` },
    { kind: "code", label: "書き換える前", text: a.edit.oldText },
    { kind: "code", label: "書き換えたあと", text: a.edit.newText },
  ];
  // A second edit is made on top of the first: the copy holds all of them, so the record names them all.
  if (a.earlier && a.earlier.length > 0) {
    blocks.splice(2, 0, { kind: "paragraph", text: `この前に、次の直し方を順に当ててありました（${a.earlier.length} つ）。` }, ...a.earlier.flatMap((e, i): Block[] => [
      { kind: "code", label: `${i + 1} つ目（${e.file}）書き換える前`, text: e.oldText },
      { kind: "code", label: `${i + 1} つ目（${e.file}）書き換えたあと`, text: e.newText },
    ]), { kind: "paragraph", text: "そのうえで、最後に当てた直し方:" });
  }
  if (a.applied.kind === "refused") {
    blocks.push({ kind: "paragraph", text: `当てられませんでした: ${a.applied.message}` });
  } else if (a.verification) {
    const outcome = { fixed: "直りました", notFixed: "差が残りました", worse: "ほかの入力が悪くなりました", changed: "ほかの入力の差が変わりました" }[a.verification.outcome];
    const changed = a.verification.deltas.filter((d) => d.changed || describeRemaining(d.before) !== describeRemaining(d.after));
    blocks.push({ kind: "paragraph", text: `結果: ${outcome}`, strong: true });
    if (changed.length > 0) blocks.push({ kind: "list", items: changed.map((d) => ({ text: `${d.label}: ${describeDelta(d)}` })) });
  }
  blocks.push({ kind: "paragraph", text: "当てたのは work/ の写しです。本番へ移すのは人です（この道具は本番に触りません）。" });
  return blocks;
}

function sent(report: RunReport): Block[] {
  // After an edit, what was sent before it (the verdicts, the cause that led to the edit) is part
  // of the same round trip; the same sending may be reached twice (a carried verdict), so by file.
  const sources = [
    ...report.cases.map((c) => ({ c, before: false })),
    ...(report.fixAttempt?.original.cases ?? []).map((c) => ({ c, before: true })),
  ];
  const byFile = new Map<string, { label: string; what: string; rec: SentRecord }>();
  for (const { c, before } of sources) {
    for (const [rec, carried] of [[c.verdict?.sent, before], [c.carried?.sent, true], [c.cause?.sent, before]] as const) {
      if (rec && !byFile.has(rec.file)) {
        byFile.set(rec.file, { label: c.label, what: `${rec.purpose === "cause" ? "原因探し" : "判定"}${carried ? "（当てる前）" : ""}`, rec });
      }
    }
  }
  const items = [...byFile.values()];
  const folder = report.origin === "bundled" ? "同梱の sent/" : "runs/sent/";
  const heading: Block = { kind: "heading", text: "Claude に送ったもの" };
  if (items.length === 0) return [heading, { kind: "paragraph", text: "何も送っていません（機械で決まったか、判定していません）。" }];
  const chars = items.reduce((n, i) => n + i.rec.chars, 0);
  const masked = items.reduce((n, i) => n + i.rec.masked, 0);
  return [
    heading,
    {
      kind: "paragraph",
      text:
        `${items.length} 回・合わせて ${chars.toLocaleString("ja-JP")} 字。` +
        (masked > 0 ? `パスワードや鍵に見える値 ${masked} 個を *** にしてから送りました。` : "パスワードや鍵に見える値はありませんでした。") +
        `送った全文は ${folder} にあります。`,
    },
    { kind: "list", items: items.map((i) => ({ text: `${i.label}・${i.what}: ${i.rec.chars.toLocaleString("ja-JP")} 字（${i.rec.file}）` })) },
  ];
}

function deprecations(report: RunReport, { deprecations: found, cutCaseIds }: NewOnly): Block[] {
  const heading: Block = { kind: "heading", text: "新の環境でだけ出た「廃止予定」の警告（参考）" };
  const labelOf = (id: string) => report.cases.find((c) => c.caseId === id)?.label ?? id;
  const cut =
    cutCaseIds.length > 0
      ? `標準エラー出力が長すぎて途中で切った入力が ${cutCaseIds.length} 件あり（${cutCaseIds.slice(0, 3).map(labelOf).join("・")}${cutCaseIds.length > 3 ? " ほか" : ""}）、切ったあとの警告は数えていません。`
      : "";
  const note =
    "判定には使っていません（Claude にも送っていません）。いまの出力に影響していなくても、次にバージョンを上げたときに壊れる候補です。" +
    "警告を出さない設定（PHP の error_reporting、Python の既定の警告フィルタなど）では数えられません。" +
    cut;
  if (found.length === 0) return [heading, { kind: "paragraph", text: `見つかりませんでした。${note}` }];
  const byFile = new Map<string, number>();
  for (const d of found) byFile.set(d.file ?? "（ファイル名なし）", (byFile.get(d.file ?? "（ファイル名なし）") ?? 0) + 1);
  const cases = new Set(found.flatMap((d) => d.caseIds));
  return [
    heading,
    { kind: "paragraph", text: note },
    { kind: "paragraph", text: `${found.length} 種類（${cases.size} 件の入力で）: ${[...byFile].map(([f, n]) => `${f} ${n}`).join("・")}` },
    {
      kind: "list",
      items: [
        ...found.slice(0, QUOTED_DEPRECATIONS).map((d) => ({
          text: `${oneLine(d.message)}（${d.caseIds.length} 件: ${d.caseIds.slice(0, 3).map(labelOf).join("・")}${d.caseIds.length > 3 ? " ほか" : ""}）`,
        })),
        ...(found.length > QUOTED_DEPRECATIONS ? [{ text: `ほか ${found.length - QUOTED_DEPRECATIONS} 種類` }] : []),
      ],
    },
  ];
}

function cannotSay(): Block[] {
  return [
    { kind: "heading", text: "この記録で言えないこと" },
    {
      kind: "list",
      ordered: true,
      items: [
        "試していない入力については、何も言えません。この表に無い入力は確かめていません。",
        "出力以外の副作用（DB の更新・メールの送信など）は見ていません。",
        "見た目は一部しか比べていません（色・太字・文字の重なり・罫線や図形・画像の中身・フォントの置き換わり、HTML のリンク先などの属性は見ていません）。",
        "手元と本番は、環境が完全には同じではありません（細かいバージョン・拡張・設定）。手元で一致しても、本番で保証したことにはなりません。",
      ].map((text) => ({ text })),
    },
  ];
}

/** "html（utf-8）" or, when cases are read differently, "html（utf-8）31 件・text（shift_jis）1 件". */
function describeFormats(report: RunReport): string {
  const formats = formatsOf(report);
  if (formats.length === 1 && !report.cases.some((c) => c.output)) return `${report.outputFormat}${report.outputEncoding ? `（${report.outputEncoding}）` : ""}`;
  return formats.map((f) => `${f.format}（${f.encoding}）${f.count} 件`).join("・");
}

function time(iso: string): string {
  return `${new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）`;
}

function clip(s: string): string {
  const t = oneLine(s);
  return t.length > EXAMPLE_CHARS ? `${t.slice(0, EXAMPLE_CHARS)}…` : t;
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

