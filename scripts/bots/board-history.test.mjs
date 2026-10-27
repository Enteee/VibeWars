import { describe, expect, it } from "vitest";

import { historyText, movesBetween, parseHistory } from "./board-history.mjs";

const REPO = "Enteee/VibeWars";

/**
 * @param {Record<number, string>} columns issue → column
 * @returns {import("./hub-board.mjs").BoardState}
 */
function board(columns) {
  return {
    format: 1,
    epoch: "e",
    rev: 1,
    floor: 0,
    sweptAt: 0,
    at: 0,
    stale: false,
    removed: [],
    cards: Object.entries(columns).map(([number, status]) => ({
      rev: 1,
      item: { id: `I${number}`, status, content: { number: Number(number), repository: REPO } },
    })),
  };
}

const AT = { repo: REPO, by: "qa-tester", ts: 1000 };

describe("movesBetween", () => {
  it("writes one line per card that changed column", () => {
    const moves = movesBetween(
      board({ 1: "Ready", 2: "QA" }),
      board({ 1: "In Progress", 2: "QA" }),
      AT,
    );
    expect(moves).toEqual([
      { ts: 1000, issue: 1, from: "Ready", to: "In Progress", by: "qa-tester" },
    ]);
  });

  it("has a card new to the board come from null, and one that left go to null", () => {
    const moves = movesBetween(board({ 2: "Done" }), board({ 1: "Backlog" }), AT);
    expect(moves).toEqual([
      { ts: 1000, issue: 1, from: null, to: "Backlog", by: "qa-tester" },
      { ts: 1000, issue: 2, from: "Done", to: null, by: "qa-tester" },
    ]);
  });

  it("writes nothing when nothing moved", () => {
    expect(movesBetween(board({ 1: "Ready" }), board({ 1: "Ready" }), AT)).toEqual([]);
  });
});

describe("parseHistory", () => {
  it("reads back what was appended", () => {
    const moves = movesBetween(board({}), board({ 3: "Ready" }), AT);
    expect(parseHistory(historyText(moves))).toEqual(moves);
  });

  it("skips a malformed line and keeps the rest", () => {
    const good = '{"ts":1,"issue":2,"from":null,"to":"Ready","by":"github"}';
    const text = `${good}\n{"ts":\nnot json\n{"ts":"x","issue":2}\n${good}\n`;
    expect(parseHistory(text)).toHaveLength(2);
  });
});
