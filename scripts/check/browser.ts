import { chromium, type Browser, type Page } from "playwright-core";

// The checks drive the page in the Chrome already on this machine, without showing a window
// (playwright-core downloads no browser of its own).

export async function openBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    throw new Error("Google Chrome を起動できません。画面の確認には Chrome が要ります");
  }
}

/** The "31 件: …" line above the list. */
export async function countLine(page: Page): Promise<string> {
  const line = page.locator("p").filter({ hasText: /^\d+ 件:/ }).first();
  await line.waitFor({ timeout: 30_000 });
  return (await line.innerText()).trim();
}

/** The verdict column of the list, top to bottom. */
export async function verdictColumn(page: Page): Promise<string[]> {
  return page.locator("tbody tr").evaluateAll((rows) => rows.map((r) => (r.querySelectorAll("td")[2] as HTMLElement | undefined)?.innerText.split("\n")[0].trim() ?? ""));
}

export async function openCase(page: Page, label: RegExp): Promise<void> {
  await page.locator("tbody tr").filter({ hasText: label }).first().click();
}

/** Waits until the page says `text`, for up to `ms`. Long ones are runs and calls to Claude. */
export async function waitForText(page: Page, text: string, ms: number): Promise<void> {
  await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: ms });
}
