// What one check run found, item by item, printed as the table the regression check reports
// (.claude/skills/regression-check). A failed item does not stop the others: the point is to see
// everything that broke in one go.

export type Result = { id: string; what: string; ok: boolean; detail: string };

export class Results {
  readonly items: Result[] = [];

  add(id: string, what: string, ok: boolean, detail = ""): void {
    this.items.push({ id, what, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${id} ${what}${detail ? ` — ${detail}` : ""}`);
  }

  /** Runs one check; an exception is a failed item with its message, not the end of the run. */
  async step(id: string, what: string, check: () => Promise<string | void>): Promise<boolean> {
    const started = Date.now();
    try {
      const detail = (await check()) ?? "";
      this.add(id, what, true, `${detail}${detail ? "・" : ""}${seconds(started)}`);
      return true;
    } catch (e) {
      this.add(id, what, false, `${e instanceof Error ? e.message : String(e)}・${seconds(started)}`);
      return false;
    }
  }

  get failed(): number {
    return this.items.filter((r) => !r.ok).length;
  }

  table(): string {
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");
    return [
      "| # | 確かめたこと | 結果 |",
      "|---|---|---|",
      ...this.items.map((r) => `| ${r.id} | ${cell(r.what)} | ${r.ok ? "✅" : "❌"} ${cell(r.detail)} |`),
      "",
      this.failed === 0 ? `全部通りました（${this.items.length} 項目）` : `❌ ${this.failed} 項目が期待と違います（全 ${this.items.length} 項目）`,
    ].join("\n");
  }
}

/** Fails the current step with a message saying what was expected and what was seen. */
export function expect(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function seconds(since: number): string {
  return `${Math.round((Date.now() - since) / 1000)} 秒`;
}
