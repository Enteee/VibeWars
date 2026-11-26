import { describe, expect, it } from "vitest";

import { preMatchLine } from "./pre-match-line.js";

describe("the line before a match starts (#3818)", () => {
  it("counts who is in while it waits", () => {
    expect(
      preMatchLine({
        phase: "waiting",
        preMatch: { joined: 3, expected: 4, secondsLeft: null, spawns: [] },
      }),
    ).toBe("Waiting for players: 3/4");
  });

  it("says it starts anyway once a late player has had long enough", () => {
    expect(
      preMatchLine({
        phase: "waiting",
        preMatch: { joined: 3, expected: 4, secondsLeft: 8, spawns: [] },
      }),
    ).toBe("Waiting for players: 3/4, starting anyway in 8 s");
  });

  it("counts down to the start", () => {
    expect(
      preMatchLine({
        phase: "countdown",
        preMatch: { joined: 4, expected: 4, secondsLeft: 7, spawns: [] },
      }),
    ).toBe("Match starts in 7");
  });

  it("says nothing once it has started", () => {
    expect(preMatchLine({ phase: "active", preMatch: null })).toBeUndefined();
    expect(preMatchLine({ phase: "finished", preMatch: null })).toBeUndefined();
  });
});
