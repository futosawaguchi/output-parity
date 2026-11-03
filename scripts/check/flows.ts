import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import { countLine, openCase, verdictColumn, waitForText } from "./browser";
import { Results, expect } from "./results";
import { replay } from "./screen";

// The round trips on the page (regression check 4b–4f, 4h, 4j, 4b', 5), against the checks' own
// server. The settings changed for a check are written back in `finally`, whatever happened.

const MINUTES = 60_000;

/** Run → cause → apply → undo → judge the bundled outputs again, on the estimate subject. Calls Claude. */
export async function claudeFlows(results: Results, base: string, browser: Browser, root: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/check`);
    await countLine(page);
    const ran = await results.step("4b", "実行して判定する（Claude を呼ぶ）", async () => {
      await page.getByRole("button", { name: "実行して判定する" }).click();
      await waitForText(page, "に実行", 4 * MINUTES);
      const verdicts = await verdictColumn(page);
      expect(verdicts.join("・") === "無害・要確認・壊れている・壊れている", `判定「${verdicts.join("・")}」`);
      await openCase(page, /入力 C/);
      await page.locator("canvas").nth(1).waitFor({ timeout: 30_000 });
      for (const want of ["計算", "素朴な diff", "Claude に送ったもの"]) await waitForText(page, want, 10_000);
      return verdicts.join("・");
    });
    if (!ran) return;
    const found = await results.step("4c", "入力 C の原因を探す（Claude を呼ぶ）", async () => {
      await page.getByRole("button", { name: /原因を探す/ }).click();
      await page.getByRole("button", { name: /work\/ に当てて/ }).waitFor({ timeout: 5 * MINUTES });
      for (const want of ["estimate.php:18", "この行は実在し", "1か所だけあり"]) await waitForText(page, want, 10_000);
    });
    if (!found) return;
    const applied = await results.step("4d", "work/ に当てて確かめる", async () => {
      await page.getByRole("button", { name: /work\/ に当てて/ }).click();
      await waitForText(page, "直りました: 入力 C は 残った差 3 行 → 差なし", 3 * MINUTES);
      const count = await countLine(page);
      expect(count === "4 件: 壊れている 1・無害 3", `当てたあとの件数「${count}」`);
      const record = await page.getByRole("link", { name: "確かめた記録を見る" }).getAttribute("href");
      const text = await (await fetch(base + record)).text();
      expect(text.includes("当てた直し方") && text.includes("原因探し（当てる前）"), "記録に当てた直し方か、当てる前に送ったものがありません");
      return count;
    });
    if (applied) {
      await results.step("4e", "元に戻す（work/ が原本と同じに戻る）", async () => {
        await page.getByRole("button", { name: "元に戻す" }).first().click();
        await page.waitForFunction(() => [...document.querySelectorAll("p")].some((p) => p.textContent?.trim() === "4 件: 壊れている 2・要確認 1・無害 1"), undefined, { timeout: 3 * MINUTES });
        const [original, work] = await Promise.all([
          readFile(join(root, "samples/estimate/app/estimate.php"), "utf8"),
          readFile(join(root, "work/estimate/estimate.php"), "utf8"),
        ]);
        expect(original === work, "work/estimate/estimate.php が原本と違います");
      });
    }
    await results.step("4f", "同梱の出力を Claude に判定し直させる（Claude を呼ぶ）", async () => {
      await page.getByRole("button", { name: "同梱の出力を Claude に判定し直させる" }).click();
      await waitForText(page, "判定し直した結果", 4 * MINUTES);
      const verdicts = await verdictColumn(page);
      expect(verdicts.join("・") === "無害・要確認・壊れている・壊れている", `判定「${verdicts.join("・")}」`);
      return verdicts.join("・");
    });
  } finally {
    await context.close();
  }
}

/**
 * Where PHP cannot run: the bundled round trip is shown instead of applying (4h, 4j). The PHP 7.4
 * path is broken in the settings for the time of the check. Run before any job of these subjects
 * exists in the server, or the page shows that job instead of the bundle.
 */
export async function withoutPhpFlows(results: Results, base: string, browser: Browser, root: string): Promise<void> {
  const files = ["samples/estimate/parity.config.jsonc", "samples/bookshop/parity.config.jsonc"].map((f) => join(root, f));
  const originals = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  try {
    await Promise.all(files.map((f, i) => writeFile(f, originals[i].replaceAll("/opt/homebrew/opt/php@7.4/bin/php\"", "/opt/homebrew/opt/php@7.4/bin/php-missing\""))));
    await results.step("4h", "php が無いとき（見積書）: 実行は押せず、同梱の当てて確かめた結果を見て戻せる", async () => {
      await page.goto(`${base}/check`);
      await waitForText(page, "この環境ではまだ実行できません", 30_000);
      expect(await page.getByRole("button", { name: "実行して判定する" }).isDisabled(), "実行ボタンが押せてしまいます");
      await replay(page, /入力 C/, "直りました: 入力 C", "4 件: 壊れている 1・無害 3", "4 件: 壊れている 2・要確認 1・無害 1");
    });
    await results.step("4j", "php が無いとき（架空書店）: 注文 21 が直り、注文 8 は当てる前の判定のまま", async () => {
      await page.goto(`${base}/check?subject=bookshop`);
      await countLine(page);
      await replay(page, /注文 21/, "直りました: 注文 21", "32 件: 壊れている 2・無害 30", "32 件: 壊れている 3・無害 29");
      await page.getByRole("button", { name: /当てて確かめた結果」を見る/ }).click();
      await waitForText(page, "直りました: 注文 21", 10_000);
      const row8 = await page.locator("tbody tr").filter({ hasText: /注文 8/ }).first().innerText();
      expect(row8.includes("当てる前の判定（差は同じ）"), `注文 8 の行「${row8.replace(/\s+/g, " ").slice(0, 60)}」`);
    });
  } finally {
    await Promise.all(files.map((f, i) => writeFile(f, originals[i])));
    await context.close();
  }
}

/** claude.send narrows what can be pressed (4b'): output stops the cause, none also stops rejudging, none at all stops loading. */
export async function sendScopeChecks(results: Results, base: string, root: string): Promise<void> {
  const file = join(root, "samples/estimate/parity.config.jsonc");
  const original = await readFile(file, "utf8");
  const state = async () => (await (await fetch(`${base}/api/runs?subject=estimate`)).json()) as { cannotRejudge: unknown; cannotAskClaude: unknown; cannotRun: { message: string } | null };
  try {
    await results.step("4b'", "送る範囲（claude.send）: output・none・書いていない", async () => {
      await writeFile(file, original.replace('"send": "output-and-source"', '"send": "output"'));
      let s = await state();
      expect(!s.cannotRejudge && !!s.cannotAskClaude, "output: 判定し直しは押せて、原因探しは押せないはず");
      await writeFile(file, original.replace('"send": "output-and-source"', '"send": "none"'));
      s = await state();
      expect(!!s.cannotRejudge && !!s.cannotAskClaude, "none: 判定し直しも原因探しも押せないはず");
      await writeFile(file, original.replace(/^\s*"claude": \{[^\n]*\n/m, ""));
      s = await state();
      expect(!!s.cannotRun?.message.includes("claude.send がありません"), `書いていないとき: 「${s.cannotRun?.message}」`);
    });
  } finally {
    await writeFile(file, original);
  }
}

/** TCPDF's 65 examples from the page: the one that matters first, the 64 harmless folded (5). */
export async function tcpdfOnPage(results: Results, base: string, browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  try {
    await results.step("5b", "TCPDF の例 65 本を画面から実行（畳む表示）", async () => {
      await page.goto(`${base}/check?subject=tcpdf-examples`);
      await page.getByRole("button", { name: "実行して判定する" }).click();
      await waitForText(page, "に実行", 5 * MINUTES);
      const count = await countLine(page);
      expect(count === "65 件: 壊れている 1・無害 64", `件数「${count}」`);
      const rows = await page.locator("tbody tr").count();
      expect(rows === 1, `畳んだ一覧が ${rows} 行（期待 1）`);
      await page.getByRole("button", { name: "無害 64 件も表示する" }).click();
      expect((await page.locator("tbody tr").count()) === 65, "無害を表示しても 65 行になりません");
      return count;
    });
  } finally {
    await context.close();
  }
}
