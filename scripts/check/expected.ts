// What each subject is expected to give, case by case: what is left of the difference and the
// verdict ("未判定" when nothing judged it). Written from the regression check's expectations;
// change them together with the samples (.claude/skills/regression-check).

export type CaseExpectation = { default?: string; cases: Record<string, string> };

const SAME = "差なし / 無害（機械）";

export const WITHOUT_CLAUDE: Record<string, CaseExpectation> = {
  estimate: {
    cases: { "case-a": SAME, "case-b": "残った差 3 行 / 未判定", "case-c": "残った差 3 行 / 未判定", "case-d": "出力なし / 壊れている（機械）" },
  },
  worklog: {
    cases: { "case-a": SAME, "case-b": "残った差 3 行 / 未判定", "case-c": "残った差 3 行 / 未判定" },
  },
  bookshop: {
    default: SAME,
    cases: {
      list: "残った差 2 行 / 未判定",
      export: "残った差 4 行 / 未判定",
      "order-8": "残った差 2 行 / 未判定",
      ...Object.fromEntries([4, 12, 19, 21, 25].map((n) => [`order-${n}`, "残った差 1 行 / 未判定"])),
      "order-27": "出力なし / 壊れている（機械）",
    },
  },
  "tcpdf-examples": { default: SAME, cases: { example_050: "出力なし / 壊れている（機械）" } },
};

/** The estimate subject judged by Claude (`npm run samples -- --judge`). */
export const WITH_CLAUDE: CaseExpectation = {
  cases: {
    "case-a": SAME,
    "case-b": "残った差 3 行 / 要確認（Claude）",
    "case-c": "残った差 3 行 / 壊れている（Claude）",
    "case-d": "出力なし / 壊れている（機械）",
  },
};
