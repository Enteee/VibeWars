import { describe, expect, it } from "vitest";

import { decideStayTogether, type StayTogetherInput } from "./stay-together.js";

/** The host's decision on Stay together (#882), on its own. */

const [KEY_A, KEY_B] = ["b", "a"].map((digit) => digit.repeat(64)) as [string, string];

function decide(fields: Partial<StayTogetherInput>) {
  return decideStayTogether({
    teamSize: 2,
    winners: ["p1", "p2"],
    votes: new Map(),
    gone: new Set(),
    timedOut: false,
    ...fields,
  });
}

describe("decideStayTogether", () => {
  it("waits until every winner has voted", () => {
    expect(decide({ votes: new Map([["p1", KEY_A]]) })).toEqual({ kind: "waiting" });
  });

  it("forms the party from every winner's key, sorted, told to each", () => {
    expect(
      decide({
        votes: new Map([
          ["p1", KEY_A],
          ["p2", KEY_B],
        ]),
      }),
    ).toEqual({ kind: "formed", members: [KEY_B, KEY_A], to: ["p1", "p2"] });
  });

  it.each<[string, Partial<StayTogetherInput>]>([
    [
      "one no",
      {
        votes: new Map([
          ["p1", KEY_A],
          ["p2", null],
        ]),
      },
    ],
    ["a winner gone", { votes: new Map([["p1", KEY_A]]), gone: new Set(["p2"]) }],
    ["the window out", { votes: new Map([["p1", KEY_A]]), timedOut: true }],
    ["a winner missing at the end", { winners: ["p1"], votes: new Map([["p1", KEY_A]]) }],
    [
      "two winners with one key",
      {
        votes: new Map([
          ["p1", KEY_A],
          ["p2", KEY_A],
        ]),
      },
    ],
  ])("splits on %s, telling only those who said yes and are here", (_, fields) => {
    const decision = decide(fields);
    expect(decision.kind).toBe("split");
    expect(decision.kind === "split" ? decision.to : []).toEqual(
      [...(fields.votes ?? new Map<string, string | null>())]
        .filter(([peerId, key]) => key !== null && !(fields.gone ?? new Set()).has(peerId))
        .map(([peerId]) => peerId),
    );
  });
});
