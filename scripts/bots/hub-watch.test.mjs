import { describe, expect, it } from "vitest";

import {
  ciMessage,
  closingPulls,
  EXCERPT_LINES,
  endedMessage,
  failedSpecs,
  listWatches,
  parseWatchRequest,
  parseWatches,
  supersededMessage,
} from "./hub-watch.mjs";

/** @type {import("./hub-watch.mjs").Watch} */
const WATCH = {
  id: "wabc123",
  employee: "developer-2",
  kind: "ci",
  pr: 739,
  sha: "abc1234def",
  note: null,
  created: 0,
};

describe("parseWatchRequest (#736)", () => {
  it("reads ci with and without a note, ls and rm", () => {
    expect(parseWatchRequest(["ci", "739"])).toEqual({ verb: "ci", pr: 739, note: null });
    expect(parseWatchRequest(["ci", "739", "--note", "then", "QA"])).toEqual({
      verb: "ci",
      pr: 739,
      note: "then QA",
    });
    expect(parseWatchRequest(["ls"])).toEqual({ verb: "ls" });
    expect(parseWatchRequest(["rm", "wabc123"])).toEqual({ verb: "rm", id: "wabc123" });
  });

  it("refuses any other words: no kind runs a command", () => {
    for (const argv of [
      [],
      ["ci"],
      ["ci", "#739"],
      ["ci", "0"],
      ["ci", "739", "--note"],
      ["ci", "739", "extra"],
      ["review", "739"],
      ["run", "echo"],
      ["ls", "all"],
      ["rm"],
    ]) {
      expect(parseWatchRequest(argv), argv.join(" ")).toHaveProperty("error");
    }
  });
});

describe("parseWatches (#736)", () => {
  it("reads the file hubd wrote", () => {
    expect(parseWatches(JSON.stringify([WATCH]))).toEqual({ watches: [WATCH] });
    expect(parseWatches("[]")).toEqual({ watches: [] });
  });

  it("discards one in another shape whole, naming whoever it can", () => {
    expect(parseWatches("{")).toEqual({ malformed: true, owners: [] });
    expect(
      parseWatches(JSON.stringify([WATCH, { ...WATCH, pr: "739" }, { employee: "qa-tester" }])),
    ).toEqual({ malformed: true, owners: ["developer-2", "qa-tester"] });
    expect(parseWatches(JSON.stringify({ watches: [] }))).toEqual({ malformed: true, owners: [] });
  });
});

describe("listWatches (#736)", () => {
  it("lists each watch with its age and note", () => {
    expect(listWatches([], 0)).toBe("no watches\n");
    expect(listWatches([{ ...WATCH, note: "then QA" }], 5 * 60_000)).toBe(
      "wabc123  ci #739 @ abc1234  5 min  note: then QA\n",
    );
  });
});

describe("closingPulls (#736)", () => {
  /** @param {number} number @param {string | null} body */
  const pull = (number, body) => ({ number, body, head: { sha: `sha${String(number)}` } });

  it("finds the open pull requests whose body closes the issue, by any closing keyword", () => {
    expect(
      closingPulls(
        [
          pull(1, "Closes #727"),
          pull(2, "fixes: #727\n"),
          pull(3, "Refs #727"),
          pull(4, "Closes #7270"),
          pull(5, "Resolved #727."),
          pull(6, null),
        ],
        727,
      ),
    ).toEqual([
      { number: 1, sha: "sha1" },
      { number: 2, sha: "sha2" },
      { number: 5, sha: "sha5" },
    ]);
  });

  it("says when the answer is not a list", () => {
    expect(closingPulls({ message: "Bad credentials" }, 1)).toBeNull();
  });
});

describe("failedSpecs (#736)", () => {
  it("names each failing spec once and keeps the first failure's lines, bounded", () => {
    const stamp = "2026-10-26T21:05:00.1234567Z ";
    const log = [
      `${stamp}Running 40 tests using 3 workers`,
      `${stamp}  1) [chromium] › e2e/builds.spec.ts:172:1 › the library shows icons ──────`,
      ...Array.from({ length: 60 }, (_, i) => `${stamp}    line ${String(i)}`),
      `${stamp}  2) [chromium] › e2e/gameplay.spec.ts:90:3 › a call shows ──`,
      `${stamp}  1) [chromium] › e2e/builds.spec.ts:172:1 › the library shows icons ─── Retry #1 ───`,
    ].join("\n");
    const found = failedSpecs(log);
    expect(found.specs).toEqual([
      "e2e/builds.spec.ts:172 › the library shows icons",
      "e2e/gameplay.spec.ts:90 › a call shows",
    ]);
    expect(found.excerpt).toHaveLength(EXCERPT_LINES);
    expect(found.excerpt[0]).toBe(
      "  1) [chromium] › e2e/builds.spec.ts:172:1 › the library shows icons ──────",
    );
  });

  it("finds nothing in a log with no failed spec", () => {
    expect(failedSpecs("all good\n")).toEqual({ specs: [], excerpt: [] });
  });
});

describe("the messages a watch sends (#736)", () => {
  it("says pass or fail, the failing jobs, specs and excerpt, then the note", () => {
    expect(ciMessage(WATCH, { pass: true })).toBe("CI on #739 @ abc1234: PASS.");
    expect(
      ciMessage(
        { ...WATCH, note: "then QA" },
        {
          pass: false,
          reason: "checks — failing: e2e (failure)",
          failed: [
            { name: "lint", conclusion: "failure", log: null },
            {
              name: "e2e",
              conclusion: "failure",
              log: { specs: ["e2e/a.spec.ts:3 › works"], excerpt: ["Error: boom"] },
            },
          ],
        },
      ),
    ).toBe(
      [
        "CI on #739 @ abc1234: FAIL. checks — failing: e2e (failure)",
        "- lint (failure)",
        "- e2e (failure)",
        "  e2e/a.spec.ts:3 › works",
        "  ```",
        "  Error: boom",
        "  ```",
        "note: then QA",
      ].join("\n"),
    );
  });

  it("says why a watch ended without a verdict, and when it moved to a new head", () => {
    expect(endedMessage(WATCH, "merged")).toBe(
      "#739 was merged; stopped watching CI on #739 @ abc1234.",
    );
    expect(endedMessage(WATCH, "cap")).toBe(
      "CI on #739 @ abc1234 did not finish within 90 min; stopped watching.",
    );
    expect(supersededMessage(WATCH, "fedcba98")).toBe(
      "CI on #739 @ abc1234: superseded by fedcba9, watching that.",
    );
  });
});
