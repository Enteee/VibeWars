import { describe, expect, it } from "vitest";
import { vec2 } from "@vibewars/game-core";
import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import {
  EMPTY_SNAPSHOT,
  type ArenaSnapshot,
  type RenderableActor,
} from "../render/arena-snapshot.js";
import { createDoubleClick } from "./double-click.js";
import { secondaryClickIntents } from "./mouse-intents.js";

function player(sessionId: string, team: number, x: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 500,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    statuses: [],
  };
}

const MATCH: MatchSnapshot = {
  selfSessionId: "me",
  players: [player("me", 0, 0), player("ally", 0, 100), player("foe", 1, 200)],
  scoreTeam0: 0,
  scoreTeam1: 0,
  elapsedSeconds: 0,
  phase: "active",
  winningTeam: undefined,
  endReason: undefined,
  projectiles: [],
};

function body(id: string, x: number, team: RenderableActor["team"]): RenderableActor {
  return {
    id,
    name: id,
    position: vec2(x, 0),
    facing: 0,
    weaponId: undefined,
    swingElapsed: 0,
    swingTotal: 0,
    offhandId: undefined,
    profession: undefined,
    radius: 14,
    team,
    health: 500,
    maxHealth: 500,
    dead: false,
    castProgress: undefined,
    statuses: [],
  };
}

const ARENA: ArenaSnapshot = {
  ...EMPTY_SNAPSHOT,
  actors: [body("me", 0, "self"), body("ally", 100, "ally"), body("foe", 200, "enemy")],
};

describe("secondaryClickIntents", () => {
  it("targets the enemy under the pointer", () => {
    expect(secondaryClickIntents(MATCH, ARENA, vec2(202, 3), createDoubleClick(), 0)).toEqual([
      { kind: "target", targetSessionId: "foe" },
    ]);
  });

  it("targets and attacks on a double right click on an enemy", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 0);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 200)).toEqual([
      { kind: "target", targetSessionId: "foe" },
      { kind: "attack", targetId: "foe" },
    ]);
  });

  it("only targets an ally, however often it is clicked", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(100, 0), double, 0);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(100, 0), double, 200)).toEqual([
      { kind: "target", targetSessionId: "ally" },
    ]);
  });

  it("sends nothing for the ground, and a click there breaks a double", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 0);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(150, 80), double, 100)).toEqual([]);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 200)).toEqual([
      { kind: "target", targetSessionId: "foe" },
    ]);
  });
});
