import { describe, expect, it } from "vitest";

import { vec2 } from "../vec2.js";
import { isCarriedObjectId } from "./carried.js";
import { flagId } from "./flags.js";
import {
  ALTAR_REACH_UNITS,
  carriedRelic,
  initialRelics,
  onAltar,
  relicId,
  relicRefusal,
  relicTargetPosition,
  relicTeamOf,
  stepRelics,
  type RelicAction,
  type RelicField,
  type RelicsState,
} from "./relics.js";

/**
 * A Relic Run's relics (#1374), pure: who takes up a relic, who scores
 * with it, where a dropped one lies, and who sends a foe's home.
 */

const FIELD: RelicField = {
  altar: vec2(1100, 700),
  spawns: [
    { team: 0, position: vec2(100, 700) },
    { team: 1, position: vec2(2100, 700) },
  ],
};
const START = initialRelics(FIELD);

const reach = (playerId: string, team: number, target: string): RelicAction => ({
  kind: "interact",
  playerId,
  team,
  targetId: target,
});

/** `actions` in one tick from `state`. */
const step = (state: RelicsState, ...actions: RelicAction[]) => stepRelics(FIELD, state, actions);

/** `a` (team 0) carrying its relic, `x` (team 1) carrying its. */
const BOTH_CARRIED = step(START, reach("a", 0, relicId(0)), reach("x", 1, relicId(1))).state;

/** Team 1's relic lying on the ground mid-map, `a` with empty hands. */
const FOE_LYING = step(BOTH_CARRIED, {
  kind: "drop",
  carrierId: "x",
  position: vec2(1300, 500),
}).state;

describe("relic ids", () => {
  it("names a team's relic, and no flag or body", () => {
    expect(relicId(1)).toBe("relic/1");
    expect(relicTeamOf("relic/1")).toBe(1);
    expect(relicTeamOf(flagId(1))).toBeUndefined();
    expect(relicTeamOf("peer-1")).toBeUndefined();
    expect(isCarriedObjectId(relicId(0))).toBe(true);
  });
});

describe("taking, carrying and scoring", () => {
  it("puts your own relic in your hands", () => {
    expect(START.relics).toEqual([
      { team: 0, place: { kind: "spawn" } },
      { team: 1, place: { kind: "spawn" } },
    ]);
    expect(relicTargetPosition(FIELD, START.relics, relicId(0))).toEqual(vec2(100, 700));
    expect(carriedRelic(BOTH_CARRIED.relics, "a")).toEqual({
      team: 0,
      place: { kind: "carried", carrierId: "a" },
    });
    expect(relicTargetPosition(FIELD, BOTH_CARRIED.relics, relicId(0))).toBeUndefined();
  });

  it("scores on the altar: a point for the team, and the relic goes home", () => {
    expect(onAltar(FIELD, vec2(1100 - ALTAR_REACH_UNITS, 700))).toBe(true);
    expect(onAltar(FIELD, vec2(1100 - ALTAR_REACH_UNITS - 1, 700))).toBe(false);
    const after = step(BOTH_CARRIED, { kind: "score", carrierId: "a" });
    expect(after.scored).toEqual([0]);
    expect(after.state.relics[0]).toEqual({ team: 0, place: { kind: "spawn" } });
    expect(after.state.relics[1]).toEqual(BOTH_CARRIED.relics[1]);
  });

  it("scores nothing for a player with no relic", () => {
    expect(step(START, { kind: "score", carrierId: "a" })).toEqual({ state: START, scored: [] });
  });

  it("scores before a death drop in the same tick", () => {
    const after = step(
      BOTH_CARRIED,
      { kind: "score", carrierId: "a" },
      { kind: "drop", carrierId: "a", position: vec2(1090, 700) },
    );
    expect(after.scored).toEqual([0]);
    expect(after.state.relics[0]?.place.kind).toBe("spawn");
  });
});

describe("dropping a relic", () => {
  it("leaves it where its carrier died, for their team to take up again", () => {
    const after = step(BOTH_CARRIED, { kind: "drop", carrierId: "a", position: vec2(600, 400) });
    expect(after.state.relics[0]).toEqual({
      team: 0,
      place: { kind: "ground", position: vec2(600, 400) },
    });
    const again = step(after.state, reach("b", 0, relicId(0)));
    expect(carriedRelic(again.state.relics, "b")?.team).toBe(0);
  });
});

describe("a foe's relic", () => {
  it("lying on the ground, goes home when a foe reaches it, and is never carried", () => {
    const empty = step(FOE_LYING, { kind: "score", carrierId: "a" }).state;
    expect(relicRefusal(FIELD, empty, "a", 0, relicId(1))).toBeUndefined();
    const after = step(empty, reach("a", 0, relicId(1)));
    expect(after.state.relics[1]).toEqual({ team: 1, place: { kind: "spawn" } });
    expect(carriedRelic(after.state.relics, "a")).toBeUndefined();
  });

  it("at its spawn, is refused", () => {
    expect(relicRefusal(FIELD, START, "a", 0, relicId(1))).toBe("not-your-relic");
    expect(step(START, reach("a", 0, relicId(1))).state).toEqual(START);
  });

  it("is returned once when two foes reach it in one tick", () => {
    const empty = step(FOE_LYING, { kind: "score", carrierId: "a" }).state;
    const after = step(empty, reach("a", 0, relicId(1)), reach("b", 0, relicId(1)));
    expect(after.state.relics[1]).toEqual({ team: 1, place: { kind: "spawn" } });
    expect(after.scored).toEqual([]);
  });

  it("needs empty hands: a carrier of their own cannot return it", () => {
    expect(relicRefusal(FIELD, FOE_LYING, "a", 0, relicId(1))).toBe("hands-full");
    const after = step(FOE_LYING, reach("a", 0, relicId(1)));
    expect(after.state).toEqual(FOE_LYING);
  });
});
