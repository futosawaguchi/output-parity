import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta";
import { z } from "zod";
import type { EnvironmentSummaries } from "../config";
import { classifyApiError } from "../judge/api-failure";
import { JUDGE_MODEL } from "../judge/call-claude";
import type { CaseReport, ProgressEvent } from "../pipeline";
import { redactSecrets } from "../redact";
import type { SentRecord, SentRecorder } from "../sent-log";
import { checkEdit, checkLine, type EditCheck, type LineCheck } from "./check-cause";
import { buildCauseMessage, CAUSE_SYSTEM_PROMPT } from "./prompt";
import { CauseResponseSchema } from "./schema";
import type { ReadScope } from "./read-scope";
import { listDir, readLines, searchText } from "./source-tools";

export type CauseCandidate = {
  file: string;
  line: number;
  code: string;
  change: string;
  why: string;
  /** A single replacement the tool can apply after a person presses the button. */
  edit: { file: string; oldText: string; newText: string } | null;
  /** What a person does when there is no single replacement (a dependency upgrade, for example). */
  steps: string[];
  /** The machine's check of the answer (check-cause.ts). */
  lineCheck: LineCheck;
  editCheck: EditCheck | null;
};

export type CauseReport = (
  | { kind: "found"; summary: string; candidates: CauseCandidate[]; model: string; reads: string[] }
  | { kind: "failed"; reason: string; nextStep: string }
) & {
  /** Everything sent to Claude while looking (after redaction): the first message and every file it read. */
  sent?: SentRecord;
};

export type CauseOptions = {
  /** What Claude may read: the source that produced the outputs (work/ after a run, the original for the bundled run), minus hidden paths. */
  scope: ReadScope;
  environments: EnvironmentSummaries;
  /** Keeps what is sent (DESIGN 7-4e ④). Left out in tests. */
  record?: SentRecorder;
  onProgress?: (event: ProgressEvent) => void;
};

/** Claude may read for a while, but not forever. Each turn is one request. */
const MAX_TURNS = 20;
const TIME_LIMIT_MS = 10 * 60 * 1000;

/**
 * Asks Claude where in the source a case's difference comes from (DESIGN 8「原因特定」).
 * Claude reads the source itself with read-only tools; it gets nothing that can write.
 * The client is passed in, so this module never reads the API key.
 */
export async function locateCause(client: Anthropic, c: CaseReport, opts: CauseOptions): Promise<CauseReport> {
  // Everything that goes out passes through here: secrets masked, the text kept (DESIGN 7-4e ③④).
  const transcript = [CAUSE_SYSTEM_PROMPT];
  let masked = 0;
  const maskedKinds = new Set<string>();
  const send = (label: string, text: string): string => {
    const r = redactSecrets(text);
    masked += r.count;
    r.kinds.forEach((k) => maskedKinds.add(k));
    transcript.push(`--- ${label}\n${r.text}`);
    return r.text;
  };
  const report = await askForCause(client, c, opts, send);
  const sent = await opts.record?.({ caseId: c.caseId, purpose: "cause", text: transcript.join("\n\n"), masked, maskedKinds: [...maskedKinds] });
  return { ...report, sent };
}

async function askForCause(client: Anthropic, c: CaseReport, opts: CauseOptions, send: (label: string, text: string) => string): Promise<CauseReport> {
  const reads: string[] = [];
  const say = (message: string) => opts.onProgress?.({ caseId: c.caseId, message });
  const tools = [
    betaZodTool({
      name: "list_files",
      description: "ソースのディレクトリの中のファイルとディレクトリを一覧する（ディレクトリは末尾に /）",
      inputSchema: z.object({ path: z.string().describe("ソースのディレクトリからの相対パス。直下なら .") }),
      run: async ({ path }) => {
        say(`Claude が ${path} の中を見ています`);
        return send(`list_files ${path}`, await listDir(opts.scope, path));
      },
    }),
    betaZodTool({
      name: "read_file",
      description: `ファイルを行番号つきで読む。1回に最大300行`,
      inputSchema: z.object({
        path: z.string().describe("ソースのディレクトリからの相対パス"),
        start_line: z.number().int().optional().describe("読み始める行（1から）。省略すると1"),
        end_line: z.number().int().optional().describe("読み終える行。省略すると300行分"),
      }),
      run: async ({ path, start_line, end_line }) => {
        reads.push(path);
        say(`Claude が ${path} を読んでいます${start_line ? `（${start_line} 行目から）` : ""}`);
        return send(`read_file ${path} ${start_line ?? 1}-${end_line ?? ""}`, await readLines(opts.scope, path, start_line, end_line));
      },
    }),
    betaZodTool({
      name: "search_text",
      description: "文字列（正規表現ではない）を含む行を、ファイル:行 の形で探す",
      inputSchema: z.object({
        text: z.string(),
        path: z.string().optional().describe("探す範囲。ソースのディレクトリからの相対パス。省略すると全体"),
      }),
      run: async ({ text, path }) => {
        say(`Claude が「${text}」を探しています`);
        return send(`search_text 「${text}」 ${path ?? "."}`, await searchText(opts.scope, text, path));
      },
    }),
  ];

  say("Claude が原因を探し始めました");
  let final: BetaMessage | undefined;
  try {
    const runner = client.beta.messages.toolRunner(
      {
        model: JUDGE_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: betaZodOutputFormat(CauseResponseSchema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: CAUSE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: send("最初のメッセージ", await buildCauseMessage(c, opts.environments, opts.scope.root)) }],
        tools,
        max_iterations: MAX_TURNS,
        // Reading takes several turns; streaming keeps each long turn from timing out.
        stream: true,
      },
      { signal: AbortSignal.timeout(TIME_LIMIT_MS) },
    );
    for await (const turn of runner) final = await turn.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) {
      return failed(`原因探しが ${TIME_LIMIT_MS / 60000} 分で終わりませんでした`, "もう一度「原因を探す」を押してください");
    }
    const f = classifyApiError(e, "原因探し");
    return { kind: "failed", reason: f.reason, nextStep: f.nextStep };
  }

  if (!final) return failed("Claude から返事がありませんでした", "もう一度「原因を探す」を押してください");
  if (final.stop_reason === "refusal") return failed("Claude が原因探しを断りました", "もう一度押してください。続く場合は人がソースを確認してください");
  if (final.stop_reason === "max_tokens") return failed("返事が途中で切れました（出力の上限に達しました）", "もう一度押してください");
  if (final.stop_reason === "tool_use") {
    return failed(`ソースを ${MAX_TURNS} 回読んでも答えが出ませんでした`, "もう一度押すか、人がソースを確認してください");
  }
  const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = CauseResponseSchema.safeParse(safeJson(text));
  if (!parsed.success) return failed("原因探しの返事が決めた形になっていませんでした", "もう一度押してください");

  const candidates = await Promise.all(
    parsed.data.candidates.map(async (k): Promise<CauseCandidate> => {
      const edit = k.edit && { file: k.edit.file, oldText: k.edit.old_text, newText: k.edit.new_text };
      return {
        file: k.file,
        line: k.line,
        code: k.code,
        change: k.change,
        why: k.why,
        edit,
        steps: k.steps,
        lineCheck: await checkLine(opts.scope.root, k.file, k.line, k.code),
        editCheck: edit && (await checkEdit(opts.scope.root, edit.file, edit.oldText)),
      };
    }),
  );
  return { kind: "found", summary: parsed.data.summary, candidates, model: final.model, reads: [...new Set(reads)] };
}

function failed(reason: string, nextStep: string): CauseReport {
  return { kind: "failed", reason, nextStep };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
