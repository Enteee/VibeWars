import { TEST_BUILDS } from "@vibewars/game-core/testing";
import { describe, expect, it } from "vitest";

import { ARENA } from "./match-harness.test-support.js";
import { participantSpec, type SeatSetup } from "./match-setup.js";

const build = TEST_BUILDS[0];
if (build === undefined) {
  throw new Error("no test build");
}

const seat = (bot: boolean, holds: boolean): SeatSetup => ({
  id: "player-1",
  team: 0,
  build,
  teammates: 0,
  bot,
  holds,
  startMorale: 0,
});

describe("participantSpec", () => {
  it("plays a bot's build, and leaves a human's seat to its player", () => {
    expect(participantSpec(ARENA, seat(true, false)).behaviour?.kind).toBe("play-build");
    expect(participantSpec(ARENA, seat(false, false)).behaviour).toBeUndefined();
  });

  it("stands a held bot still (#4146)", () => {
    expect(participantSpec(ARENA, seat(true, true)).behaviour).toEqual({ kind: "idle" });
  });
});
