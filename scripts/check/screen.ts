// The page without Claude (regression check 4a, 4i, 4k, 4l, and 6 in a fresh clone): the bundled
// results as someone opening the tool sees them, the pages it opens, and the guards on what it serves.
// Usage: npm run check:screen     builds the app, starts it on port 3100 and drives it in Chrome

import { request } from "node:http";
import type { Browser, Page } from "playwright-core";
import { countLine, openBrowser, openCase, waitForText } from "./browser";
import { Results, expect } from "./results";
import { buildApp, startApp } from "./server";

export type ScreenMode = "local" | "clone";

export async function screenChecks(results: Results, base: string, browser: Browser, mode: ScreenMode): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const tag = mode === "clone" ? "6" : "4";
  try {
    await results.step(`${tag}a`, "見積書の同梱: 題材のカード・件数・PDF 2 枚・原因", async () => {
      await page.goto(`${base}/check`);
      const count = await countLine(page);
      const cards = await page.locator("nav[aria-label=題材] button").count();
      expect(cards === 4, `題材のカードが ${cards} 枚（期待 4）`);
      expect((await page.locator("nav[aria-label=題材] button[aria-current=page]").innerText()).includes("見積書"), "選ばれている題材が見積書ではありません");
      expect(count === "4 件: 壊れている 2・要確認 1・無害 1", `件数「${count}」`);
      await openCase(page, /入力 C/);
      await page.locator("canvas").nth(1).waitFor({ timeout: 30_000 });
      await waitForText(page, "estimate.php:18", 10_000);
      return count;
    });

    await results.step(`${tag}l`, "確かめた記録のページ・Markdown・送った全文のページ", async () => {
      const recordHref = await page.getByRole("link", { name: "確かめた記録を見る" }).getAttribute("href");
      const markdownHref = await page.getByRole("link", { name: "Markdown で保存" }).getAttribute("href");
      const sentHref = await page.getByRole("link", { name: "送った全文を見る" }).first().getAttribute("href");
      expect(!!recordHref?.startsWith("/check/record?") && !!sentHref?.startsWith("/check/sent/"), `リンク先 ${recordHref} ${sentHref}`);
      const other = await page.context().newPage();
      try {
        await other.goto(base + recordHref);
        // The record streams in after the page's frame.
        await waitForText(other, "この記録で言えないこと", 30_000);
        const text = await other.locator("body").innerText();
        for (const want of ["このままでは移せません", "この記録で言えないこと", "18 種類（3 件の入力で）", "この手元では実行も判定もしていません"]) {
          expect(text.includes(want), `記録のページに「${want}」がありません`);
        }
        expect(!(await other.content()).includes("/Users/"), "記録のページにホームのパスがあります");
        await other.goto(base + sentHref);
        await other.locator("h1").waitFor({ timeout: 30_000 });
        expect((await other.locator("h1").innerText()).includes("のために送った全文"), "送った全文のページの見出しが違います");
      } finally {
        await other.close();
      }
      const md = await fetch(base + markdownHref);
      const body = await md.text();
      expect(/attachment/.test(md.headers.get("content-disposition") ?? ""), "Markdown がファイルとして返りません");
      expect(body.startsWith("# 確かめた入力の記録"), "Markdown の先頭が違います");
    });

    await results.step(`${tag}i`, "架空書店の同梱: 件数・並び・開いたページ・画面で見る・HTTP 500", async () => {
      await page.goto(`${base}/check?subject=bookshop`);
      const count = await countLine(page);
      expect(count === "31 件: 壊れている 3・無害 28", `件数「${count}」`);
      const firstThree = await page.locator("tbody tr td:nth-child(2) > span:first-child").evaluateAll((spans) => spans.slice(0, 3).map((s) => (s as HTMLElement).innerText.trim()));
      expect(firstThree.join("・") === "注文 8・注文 21・注文 27", `一覧の上の 3 件が「${firstThree.join("・")}」`);
      await openCase(page, /注文 8/);
      await waitForText(page, "GET /order.php?id=8", 10_000);
      await waitForText(page, "HTTP 200", 10_000);
      const frames = await page.locator("iframe").evaluateAll((fs) => fs.map((f) => f.getAttribute("sandbox")));
      expect(frames.length === 2 && frames.every((s) => s === ""), `画面の枠 ${JSON.stringify(frames)}（期待: sandbox="" が 2 つ）`);
      await page.getByRole("button", { name: "比べた文字で見る" }).click();
      expect((await page.locator("iframe").count()) === 0, "比べた文字に切り替わりません");
      await openCase(page, /注文 27/);
      await waitForText(page, "出力なし（HTTP 500）", 10_000);
      return count;
    });

    await results.step(`${tag}i2`, "作業日報の同梱: 件数", async () => {
      await page.goto(`${base}/check?subject=worklog`);
      const count = await countLine(page);
      expect(count === "3 件: 壊れている 2・無害 1", `件数「${count}」`);
      return count;
    });

    await results.step(`${tag}k`, "守り: 画面の描き方（CSP）・PDF は描かない・ほかの Host は 403", async () => {
      const page8 = await fetch(`${base}/api/outputs/bundled/order-8/new?subject=bookshop&view=page&charset=utf-8`);
      const csp = page8.headers.get("content-security-policy") ?? "";
      expect(csp.startsWith("default-src 'none'") && csp.includes("sandbox") && page8.headers.get("x-content-type-options") === "nosniff", `CSP「${csp}」`);
      const pdf = await fetch(`${base}/api/outputs/bundled/case-c/new?subject=estimate&view=page&charset=utf-8`);
      expect(pdf.status === 404, `PDF に view=page で ${pdf.status}（期待 404）`);
      for (const path of ["/check/record?subject=estimate&from=bundled", "/api/runs", "/check/sent/20261103-103652-order-8-judge-872a.txt?subject=bookshop"]) {
        const status = await statusWithHost(base, path, "evil.example");
        expect(status === 403, `${path} がほかの Host で ${status}（期待 403）`);
      }
    });

    if (mode === "clone") await cloneOnly(results, base, page);
  } finally {
    await context.close();
  }
}

/** What someone who cloned the repository sees: nothing can run, the bundled round trip can be followed. */
async function cloneOnly(results: Results, base: string, page: Page): Promise<void> {
  await results.step("6b", "clone: 見積書は実行の前に止まり、同梱の「当てて確かめた結果」で直りましたが見られる", async () => {
    await page.goto(`${base}/check`);
    await waitForText(page, "実行に要るものがありません", 30_000);
    expect(await page.getByRole("button", { name: "実行して判定する" }).isDisabled(), "実行ボタンが押せてしまいます");
    await replay(page, /入力 C/, "直りました: 入力 C", "4 件: 壊れている 1・無害 3", "4 件: 壊れている 2・要確認 1・無害 1");
  });
  await results.step("6c", "clone: TCPDF の題材は composer の案内で止まる", async () => {
    await page.goto(`${base}/check?subject=tcpdf-examples`);
    await waitForText(page, "caseGroups のファイルを探すフォルダがありません", 30_000);
  });
}

/**
 * The bundled run after its edit, shown where nothing can be applied (regression check 4h, 4j, 6):
 * "直りました", the counts after it, the record of the round trip, and "元に戻す" back to the bundle.
 */
export async function replay(page: Page, label: RegExp, fixed: string, after: string, before: string): Promise<void> {
  await openCase(page, label);
  await page.getByRole("button", { name: /当てて確かめた結果」を見る/ }).click();
  await waitForText(page, fixed, 10_000);
  const count = await countLine(page);
  expect(count === after, `当てたあとの件数「${count}」（期待 ${after}）`);
  const href = await page.getByRole("link", { name: "確かめた記録を見る" }).getAttribute("href");
  expect(!!href?.includes("from=bundled-fix"), `記録が当てたあとの同梱を指していません: ${href}`);
  // The page frames of an HTML case resize as they load and move the page: let it settle first.
  const undo = page.getByRole("button", { name: "元に戻す" }).first();
  await undo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await undo.click();
  await page.waitForFunction((t) => [...document.querySelectorAll("p")].some((p) => p.textContent?.trim() === t), before, { timeout: 10_000 });
}

/** The status of a request addressed to another host name (DNS rebinding), which fetch cannot send. */
function statusWithHost(base: string, path: string, host: string): Promise<number> {
  const url = new URL(path, base);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}


if (import.meta.url === `file://${process.argv[1]}`) {
  const results = new Results();
  (async () => {
    const browser = await openBrowser();
    await results.step("4-", "画面のサーバを組み立てて立てる（ポート 3100）", async () => void (await buildApp(process.cwd())));
    const server = await startApp(process.cwd(), 3100);
    try {
      await screenChecks(results, server.base, browser, "local");
    } finally {
      await browser.close();
      await server.stop();
    }
    console.log(`\n${results.table()}`);
    process.exit(results.failed === 0 ? 0 : 1);
  })();
}
