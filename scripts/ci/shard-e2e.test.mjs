import { describe, expect, it } from "vitest";

import { listTests, shardFilters, tableFromListOutput } from "./shard-e2e.mjs";

const report = JSON.stringify({
  suites: [
    {
      file: "a.spec.ts",
      specs: [{ title: "top", file: "a.spec.ts", line: 3 }],
      suites: [{ title: "group", specs: [{ title: "inner", file: "a.spec.ts", line: 9 }] }],
    },
    {
      file: "b.spec.ts",
      specs: [
        { title: "loop", file: "b.spec.ts", line: 5 },
        { title: "loop", file: "b.spec.ts", line: 5 },
      ],
    },
  ],
});

describe("listTests", () => {
  it("keys a test by file, describes and title", () => {
    expect(listTests(report).map((t) => t.key)).toEqual([
      "e2e/a.spec.ts › top",
      "e2e/a.spec.ts › group › inner",
      "e2e/b.spec.ts › loop",
      "e2e/b.spec.ts › loop",
    ]);
  });
});

describe("shardFilters", () => {
  const tests = listTests(report);
  const durations = { "e2e/a.spec.ts › top": 50, "e2e/a.spec.ts › group › inner": 20 };

  it("puts every test group in exactly one shard", () => {
    const all = [1, 2, 3].flatMap((s) => shardFilters(tests, durations, s, 3));
    expect(all.sort()).toEqual(["e2e/a.spec.ts:3", "e2e/a.spec.ts:9", "e2e/b.spec.ts:5"]);
  });

  it("keeps tests that share a line together", () => {
    const shards = [1, 2].map((s) => shardFilters(tests, durations, s, 2));
    expect(shards.filter((f) => f.includes("e2e/b.spec.ts:5"))).toHaveLength(1);
  });

  it("packs the heaviest group first, alone", () => {
    expect(shardFilters(tests, durations, 1, 2)).toEqual(["e2e/b.spec.ts:5"]);
  });

  it("refuses an empty shard rather than run everything", () => {
    expect(() => shardFilters(tests, durations, 4, 4)).toThrow("has no tests");
  });

  it("refuses a shard outside 1..total", () => {
    expect(() => shardFilters(tests, durations, 0, 2)).toThrow("not a shard");
    expect(() => shardFilters(tests, durations, 3, 2)).toThrow("not a shard");
  });
});

describe("tableFromListOutput", () => {
  it("reads seconds, milliseconds and minutes", () => {
    const out = [
      "  ✓   1 [chromium] › e2e/a.spec.ts:3:1 › top (1.5s)",
      "  ✓   2 [chromium] › e2e/a.spec.ts:9:1 › group › inner (250ms)",
      "  ✓   3 [chromium] › e2e/b.spec.ts:5:1 › long (1.5m)",
      "noise",
    ].join("\n");
    expect(tableFromListOutput(out)).toEqual({
      "e2e/a.spec.ts › group › inner": 0.3,
      "e2e/a.spec.ts › top": 1.5,
      "e2e/b.spec.ts › long": 90,
    });
  });
});
