import { describe, expect, it } from "vitest";

import { vec2 } from "../vec2.js";
import { FLAG_STAND_ID, isCarriedObjectId } from "./carried.js";
import {
  STAND_HOLD_SECONDS,
  carriedFlag,
  dropFlag,
  flagId,
  flagRefusal,
  flagTargetPosition,
  flagTeamOf,
  initialFlags,
  stepFlags,
  type FlagAction,
  type FlagField,
  type FlagsState,
} from "./flags.js";

/**
 * The Guild Battle's flags (#1225), pure: who takes up a flag, who plants
 * one, where a dropped one lies, and when a held stand boosts.
 */

const DT = 0.05;
const FIELD: FlagField = {
  stand: vec2(1500, 1000),
  spawns: [
    { team: 0, position: vec2(560, 1000) },
    { team: 1, position: vec2(2440, 1000) },
  ],
};
const START = initialFlags(FIELD);

const take = (playerId: string, team: number, target: string): FlagAction => ({
  kind: "interact",
  playerId,
  team,
  targetId: target,
});

/** `actions` in one tick from `state`. */
const step = (state: FlagsState, ...actions: FlagAction[]) => stepFlags(FIELD, state, actions, DT);

/** `a` (team 0) carrying its flag, `x` (team 1) carrying its. */
const BOTH_CARRIED = step(START, take("a", 0, flagId(0)), take("x", 1, flagId(1)));

describe("flag ids", () => {
  it("names a team's flag and the stand, and no body", () => {
    expect(flagId(1)).toBe("flag/1");
    expect(flagTeamOf("flag/1")).toBe(1);
    expect(flagTeamOf("flag/")).toBeUndefined();
    expect(flagTeamOf("guild-lord/1")).toBeUndefined();
    expect(isCarriedObjectId(FLAG_STAND_ID)).toBe(true);
    expect(isCarriedObjectId("flag/0")).toBe(true);
    expect(isCarriedObjectId("peer-1")).toBe(false);
  });
});

describe("the start", () => {
  it("has every flag at its spawn and nobody holding the stand", () => {
    expect(START.flags).toEqual([
      { team: 0, place: { kind: "spawn" } },
      { team: 1, place: { kind: "spawn" } },
    ]);
    expect(START.stand).toEqual({ holder: undefined, heldSeconds: 0 });
    expect(flagTargetPosition(FIELD, START.flags, flagId(1))).toEqual(vec2(2440, 1000));
    expect(flagTargetPosition(FIELD, START.flags, FLAG_STAND_ID)).toEqual(FIELD.stand);
  });
});

describe("taking up a flag", () => {
  it("is only for its own team", () => {
    expect(flagRefusal(FIELD, START, "a", 0, flagId(0))).toBeUndefined();
    expect(flagRefusal(FIELD, START, "a", 0, flagId(1))).toBe("not-your-flag");
    const after = step(START, take("a", 0, flagId(1)));
    expect(after.flags).toEqual(START.flags);
  });

  it("puts it in the taker's hands", () => {
    const after = step(START, take("a", 0, flagId(0)));
    expect(carriedFlag(after.flags, "a")).toEqual({
      team: 0,
      place: { kind: "carried", carrierId: "a" },
    });
    // Carried, it is no longer anywhere to walk to.
    expect(flagTargetPosition(FIELD, after.flags, flagId(0))).toBeUndefined();
    expect(flagRefusal(FIELD, after, "b", 0, flagId(0))).toBe("no-target");
  });

  it("goes to the first of two teammates to reach it in a tick", () => {
    const after = step(START, take("a", 0, flagId(0)), take("b", 0, flagId(0)));
    expect(carriedFlag(after.flags, "a")).toBeDefined();
    expect(carriedFlag(after.flags, "b")).toBeUndefined();
  });

  it("can be a flag lying on the ground", () => {
    const dropped = dropFlag(BOTH_CARRIED, "a", vec2(900, 950));
    expect(flagTargetPosition(FIELD, dropped.flags, flagId(0))).toEqual(vec2(900, 950));
    const after = step(dropped, take("b", 0, flagId(0)));
    expect(carriedFlag(after.flags, "b")?.team).toBe(0);
  });
});

describe("dropping a flag", () => {
  it("leaves it on the ground where the carrier was, until its team takes it up", () => {
    const after = step(BOTH_CARRIED, { kind: "drop", carrierId: "a", position: vec2(800, 900) });
    expect(after.flags[0]).toEqual({
      team: 0,
      place: { kind: "ground", position: vec2(800, 900) },
    });
    expect(flagRefusal(FIELD, after, "x", 1, flagId(0))).toBe("not-your-flag");
  });

  it("does nothing for a player who carries none", () => {
    expect(dropFlag(START, "a", vec2(1, 1))).toEqual(START);
  });

  it("comes before a planting in the same tick, so a dead carrier plants nothing", () => {
    const after = step(
      BOTH_CARRIED,
      { kind: "drop", carrierId: "a", position: vec2(1490, 1000) },
      take("a", 0, FLAG_STAND_ID),
    );
    expect(after.stand.holder).toBeUndefined();
    expect(after.flags[0]?.place.kind).toBe("ground");
  });
});

describe("planting a flag", () => {
  it("needs a flag in hand", () => {
    expect(flagRefusal(FIELD, START, "a", 0, FLAG_STAND_ID)).toBe("no-flag-carried");
    expect(flagRefusal(FIELD, BOTH_CARRIED, "a", 0, FLAG_STAND_ID)).toBeUndefined();
  });

  it("puts it on the stand, and its team holds it from 0", () => {
    const after = step(BOTH_CARRIED, take("a", 0, FLAG_STAND_ID));
    expect(after.flags[0]).toEqual({ team: 0, place: { kind: "stand" } });
    expect(after.stand).toEqual({ holder: 0, heldSeconds: 0 });
    expect(after.boostTeam).toBeUndefined();
  });

  it("says so when the team's flag is on the stand already", () => {
    const after = step(BOTH_CARRIED, take("a", 0, FLAG_STAND_ID));
    expect(flagRefusal(FIELD, after, "b", 0, FLAG_STAND_ID)).toBe("flag-on-stand");
  });

  it("sends a foe's flag on the stand home to its spawn", () => {
    const held = step(BOTH_CARRIED, take("a", 0, FLAG_STAND_ID));
    const after = step(held, take("x", 1, FLAG_STAND_ID));
    expect(after.flags).toEqual([
      { team: 0, place: { kind: "spawn" } },
      { team: 1, place: { kind: "stand" } },
    ]);
    expect(after.stand).toEqual({ holder: 1, heldSeconds: 0 });
  });

  it("of two in one tick, keeps the later", () => {
    const after = step(BOTH_CARRIED, take("x", 1, FLAG_STAND_ID), take("a", 0, FLAG_STAND_ID));
    expect(after.stand.holder).toBe(0);
    expect(after.flags).toEqual([
      { team: 0, place: { kind: "stand" } },
      { team: 1, place: { kind: "spawn" } },
    ]);
  });
});

describe("holding the stand", () => {
  /** `state` stepped with nothing happening until `seconds` have passed, and the boosts on the way. */
  function hold(state: FlagsState, seconds: number): { state: FlagsState; boosts: number[] } {
    const boosts: number[] = [];
    let current = state;
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      const { boostTeam, ...next } = step(current);
      current = next;
      if (boostTeam !== undefined) {
        boosts.push(boostTeam);
      }
    }
    return { state: current, boosts };
  }

  const planted = step(BOTH_CARRIED, take("a", 0, FLAG_STAND_ID));

  it("boosts its holder once every 120 seconds held, and starts again", () => {
    const short = hold(planted, STAND_HOLD_SECONDS - 1);
    expect(short.boosts).toEqual([]);
    expect(short.state.stand.heldSeconds).toBeCloseTo(STAND_HOLD_SECONDS - 1);
    const once = hold(planted, STAND_HOLD_SECONDS);
    expect(once.boosts).toEqual([0]);
    expect(once.state.stand).toEqual({ holder: 0, heldSeconds: 0 });
    expect(hold(planted, 2 * STAND_HOLD_SECONDS).boosts).toEqual([0, 0]);
  });

  it("boosts nobody when nobody holds it", () => {
    expect(hold(START, STAND_HOLD_SECONDS + 1).boosts).toEqual([]);
  });

  it("starts the new holder from 0 when a foe takes it at 119 seconds", () => {
    const almost = hold(planted, STAND_HOLD_SECONDS - 1).state;
    const taken = step(almost, take("x", 1, FLAG_STAND_ID));
    expect(taken.boostTeam).toBeUndefined();
    expect(taken.stand).toEqual({ holder: 1, heldSeconds: 0 });
    expect(hold(taken, 1).boosts).toEqual([]);
    expect(hold(taken, STAND_HOLD_SECONDS).boosts).toEqual([1]);
  });

  it("keeps counting while its carrier drops something else", () => {
    const dropped = step(planted, { kind: "drop", carrierId: "x", position: vec2(2000, 1000) });
    expect(dropped.stand).toEqual({ holder: 0, heldSeconds: DT });
  });
});
