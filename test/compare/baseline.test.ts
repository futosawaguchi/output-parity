import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBaseline, unstableLines } from "../../lib/compare/baseline";
import { diffLines } from "../../lib/compare/line-diff";

test("lines that differ between two runs of the same environment are unstable", () => {
  const first = ["date: 10:00:01", "body", "id: aaa"];
  const second = ["date: 10:00:02", "body", "id: bbb"];
  assert.deepEqual([...unstableLines(first, second).keys()].sort(), [0, 2]);
});

test("identical runs have no unstable lines", () => {
  assert.equal(unstableLines(["a", "b"], ["a", "b"]).size, 0);
});

test("a replaced unstable line is explained by the baseline", () => {
  const old = ["date: 09:00", "body"];
  const now = ["date: 10:00", "body"];
  const changes = applyBaseline(diffLines(old, now), unstableLines(now, ["date: 10:01", "body"]));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].explainedByBaseline, true);
});

test("a removed line is never explained, even next to unstable lines", () => {
  const old = ["date: 09:00", "row A", "total"];
  const now = ["date: 10:00", "total"];
  const changes = applyBaseline(diffLines(old, now), unstableLines(now, ["date: 10:01", "total"]));
  assert.ok(changes.some((c) => c.oldLines.includes("row A") && !c.explainedByBaseline));
});

test("a replaced stable line stays unexplained even when it neighbours an unstable one", () => {
  const old = ["date: 09:00", "producer: v1", "body"];
  const now = ["date: 10:00", "producer: v2", "body"];
  const changes = applyBaseline(diffLines(old, now), unstableLines(now, ["date: 10:01", "producer: v2", "body"]));
  assert.deepEqual(
    changes.map((c) => [c.newLines, c.explainedByBaseline]),
    [
      [["date: 10:00"], true],
      [["producer: v2"], false],
    ],
  );
});

test("without a baseline nothing is explained", () => {
  const changes = applyBaseline(diffLines(["a"], ["b"]), new Map());
  assert.equal(changes[0].explainedByBaseline, false);
});

test("in an unstable line only the parts that changed are set aside", () => {
  // The issue time changes on every run; the total on the same line does not.
  const unstable = unstableLines(["発行 10:00:01 合計 72,000"], ["発行 10:00:05 合計 72,000"]);
  const changes = applyBaseline(diffLines(["発行 09:59:58 合計 72,000"], ["発行 10:00:01 合計 72,000"]), unstable);
  assert.equal(changes[0].explainedByBaseline, true);
});

test("a changed amount on the same line as a timestamp is not hidden by the baseline", () => {
  const unstable = unstableLines(["発行 10:00:01 合計 57,000"], ["発行 10:00:05 合計 57,000"]);
  const changes = applyBaseline(diffLines(["発行 09:59:58 合計 72,000"], ["発行 10:00:01 合計 57,000"]), unstable);
  assert.equal(changes[0].explainedByBaseline, false);
});

test("a timestamp is one piece, so a run crossing a minute does not count as a real change", () => {
  const unstable = unstableLines(["at 10:00:01 x"], ["at 10:00:03 x"]);
  assert.equal(applyBaseline(diffLines(["at 09:59:59 x"], ["at 10:00:01 x"]), unstable)[0].explainedByBaseline, true);
});

test("a random id is one piece, whatever mix of letters and digits it has", () => {
  const unstable = unstableLines(["id 0: f9519d9ca9fc4713"], ["id 0: 77454a5f67191296"]);
  assert.equal(applyBaseline(diffLines(["id 0: 8a575c10d9d180ab"], ["id 0: f9519d9ca9fc4713"]), unstable)[0].explainedByBaseline, true);
});

test("Japanese text right next to a number stays a separate piece", () => {
  const unstable = unstableLines(["発行10:00:01合計57,000"], ["発行10:00:05合計57,000"]);
  assert.equal(applyBaseline(diffLines(["発行09:59:58合計72,000"], ["発行10:00:01合計57,000"]), unstable)[0].explainedByBaseline, false);
});

test("a line the second run could not pair up is never set aside", () => {
  // The second run printed one line fewer, so which parts change cannot be told: the total is kept.
  const unstable = unstableLines(["発行 10:00:01", "合計 57,000"], ["合計 57,000"]);
  assert.equal(unstable.get(0), "whole");
  const changes = applyBaseline(diffLines(["発行 09:59:58 合計 72,000"], ["発行 10:00:01 合計 57,000"]), new Map([[0, "whole" as const]]));
  assert.equal(changes[0].explainedByBaseline, false);
});

test("in a CSV row, a changed amount next to a timestamp is not hidden by the baseline", () => {
  const unstable = unstableLines(["2026-11-02 10:00:05,1001,57000"], ["2026-11-02 10:00:07,1001,57000"]);
  const changes = applyBaseline(diffLines(["2026-11-02 10:00:01,1001,72000"], ["2026-11-02 10:00:05,1001,57000"]), unstable);
  assert.equal(changes[0].explainedByBaseline, false);
});

test("in a CSV row, a timestamp that changes on every run is still set aside", () => {
  const unstable = unstableLines(["2026-11-02 10:00:05,1001,57000"], ["2026-11-02 10:00:07,1001,57000"]);
  const changes = applyBaseline(diffLines(["2026-11-02 10:00:01,1001,57000"], ["2026-11-02 10:00:05,1001,57000"]), unstable);
  assert.equal(changes[0].explainedByBaseline, true);
});

// A fixed-width record: type (1), created yyyymmddhhmmss (14), count (4), total (10), with no separator.
const record = (created: string, total: string) => `H${created}0003${total}`;

test("in a fixed-width record, a changed amount after a timestamp is not hidden by the baseline", () => {
  const unstable = unstableLines([record("20261107100005", "0000057000")], [record("20261107100007", "0000057000")]);
  const changes = applyBaseline(diffLines([record("20261107100001", "0000072000")], [record("20261107100005", "0000057000")]), unstable);
  assert.equal(changes[0].explainedByBaseline, false);
});

test("in a fixed-width record, a timestamp whose minute rolls over between old and new is still set aside", () => {
  const unstable = unstableLines([record("20261107100001", "0000057000")], [record("20261107100003", "0000057000")]);
  const changes = applyBaseline(diffLines([record("20261107095958", "0000057000")], [record("20261107100001", "0000057000")]), unstable);
  assert.equal(changes[0].explainedByBaseline, true);
});

test("full-width digits are pieces too, so a full-width amount next to a full-width time is not hidden", () => {
  const unstable = unstableLines(["合計金額５７，０００円（１０：００：０５発行）"], ["合計金額５７，０００円（１０：００：０９発行）"]);
  const changes = applyBaseline(diffLines(["合計金額７２，０００円（１０：００：０１発行）"], ["合計金額５７，０００円（１０：００：０５発行）"]), unstable);
  assert.equal(changes[0].explainedByBaseline, false);
});

test("an amount before a time in the same piece is not hidden (a file name)", () => {
  const unstable = unstableLines(["estimate_57000_20261107100005.pdf"], ["estimate_57000_20261107100007.pdf"]);
  assert.equal(applyBaseline(diffLines(["estimate_72000_20261107100001.pdf"], ["estimate_57000_20261107100005.pdf"]), unstable)[0].explainedByBaseline, false);
  assert.equal(applyBaseline(diffLines(["estimate_57000_20261107095958.pdf"], ["estimate_57000_20261107100005.pdf"]), unstable)[0].explainedByBaseline, true);
});

test("a short value right after a time is kept when something other than a digit separates them", () => {
  const unstable = unstableLines(["D20261107100005-2"], ["D20261107100007-2"]);
  assert.equal(applyBaseline(diffLines(["D20261107100001-3"], ["D20261107100005-2"]), unstable)[0].explainedByBaseline, false);
});

test("a random id whose letters change is set aside whole, however many characters agree by chance", () => {
  const unstable = unstableLines(["uuid:a2bd23ec-4862"], ["uuid:a7c1f5d0-4862"]);
  assert.equal(applyBaseline(diffLines(["uuid:9f00e1b2-77aa"], ["uuid:a2bd23ec-4862"]), unstable)[0].explainedByBaseline, true);
});

test("two runs ten seconds apart agree on the last digit by chance, and the time is still set aside", () => {
  const time = (t: string) => [`meta CreationDate: D:${t}+00'00'`];
  const unstable = unstableLines(time("20261107133328"), time("20261107133338"));
  assert.equal(applyBaseline(diffLines(time("20261107133322"), time("20261107133328")), unstable)[0].explainedByBaseline, true);
});
