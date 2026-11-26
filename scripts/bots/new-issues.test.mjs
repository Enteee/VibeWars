import { describe, expect, it } from "vitest";

import { createIssueBatch, newIssueMessage } from "./new-issues.mjs";

/**
 * @param {number} number
 * @param {string} [title]
 * @param {boolean} [landed]
 */
const issue = (number, title = `Issue ${String(number)}`, landed = true) => ({
  number,
  title,
  landed,
});

describe("createIssueBatch (#550)", () => {
  it("holds a batch until the window after its first issue has passed", () => {
    const batch = createIssueBatch({ windowMs: 60_000 });
    expect(batch.take(0)).toEqual([]);
    batch.add(issue(1), 1_000);
    batch.add(issue(2), 60_000);
    expect(batch.take(60_999)).toEqual([]);
    expect(batch.take(61_000)).toEqual([issue(1), issue(2)]);
    expect(batch.take(61_001)).toEqual([]);
  });

  it("starts the next batch's window at its own first issue", () => {
    const batch = createIssueBatch({ windowMs: 60_000 });
    batch.add(issue(1), 0);
    expect(batch.take(60_000)).toEqual([issue(1)]);
    batch.add(issue(2), 61_000);
    expect(batch.take(120_000)).toEqual([]);
    expect(batch.take(121_000)).toEqual([issue(2)]);
  });

  it("keeps all ten of a burst in one batch", () => {
    const batch = createIssueBatch({ windowMs: 60_000 });
    for (let n = 1; n <= 10; n += 1) {
      batch.add(issue(n), n);
    }
    expect(batch.take(60_001)).toHaveLength(10);
  });
});

describe("newIssueMessage (#550)", () => {
  it("names one issue", () => {
    expect(newIssueMessage([issue(551, "Music: loop")])).toBe(
      "#551 Music: loop is new in Backlog: rank it.",
    );
  });

  it("lists several in one line", () => {
    expect(
      newIssueMessage([issue(551, "Music: a"), issue(552, "Perf: b"), issue(553, "Lobby: c")]),
    ).toBe("3 new in Backlog, rank them: #551 Music: a; #552 Perf: b; #553 Lobby: c");
  });

  it("says what to do about an issue that did not land", () => {
    expect(newIssueMessage([issue(554, "Bots: d", false)])).toBe(
      "#554 Bots: d is not on the board: add it.",
    );
    expect(newIssueMessage([issue(551, "Music: a"), issue(554, "Bots: d", false)])).toBe(
      "#551 Music: a is new in Backlog: rank it. #554 Bots: d is not on the board: add it.",
    );
  });

  it("shows just the number when there is no title", () => {
    expect(newIssueMessage([issue(551, "")])).toBe("#551 is new in Backlog: rank it.");
  });

  it("cuts a long title to 60 characters", () => {
    const message = newIssueMessage([issue(551, "x".repeat(80))]);
    expect(message).toBe(`#551 ${"x".repeat(59)}… is new in Backlog: rank it.`);
  });
});
