import { describe, expect, it } from "vitest";
import { vec2 } from "@vibewars/game-core";
import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import {
  EMPTY_SNAPSHOT,
  type ArenaSnapshot,
  type RenderableActor,
} from "../render/arena-snapshot.js";
import { createDoubleClick } from "./double-click.js";
import {
  calledTargetIntent,
  callTargetCall,
  middleClickAction,
  pingCall,
  secondaryClickIntents,
} from "./mouse-intents.js";

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
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
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
  groundEffects: [],
  traps: [],
  summary: undefined,
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
    attackCast: undefined,
    offhandId: undefined,
    profession: undefined,
    creatureLook: undefined,
    radius: 14,
    team,
    health: 500,
    maxHealth: 500,
    dead: false,
    exploited: false,
    knockedDown: false,
    castProgress: undefined,
    castType: undefined,
    statuses: [],
    enchanted: false,
    hexed: false,
    conditionCues: [],
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

describe("middleClickAction (#443)", () => {
  const dead = (id: string): MatchSnapshot => ({
    ...MATCH,
    players: MATCH.players.map((p) => (p.sessionId === id ? { ...p, dead: true } : p)),
  });

  it("calls a living foe, and pings a living ally's point and the ground (#1055)", () => {
    expect(middleClickAction(MATCH, ARENA, vec2(201, 2))).toEqual({
      kind: "call",
      call: { kind: "target", targetId: "foe" },
    });
    expect(middleClickAction(MATCH, ARENA, vec2(101, 2))).toEqual({
      kind: "call",
      call: { kind: "ping", x: 101, y: 2 },
    });
    expect(middleClickAction(MATCH, ARENA, vec2(150, 60))).toEqual({
      kind: "call",
      call: { kind: "ping", x: 150, y: 60 },
    });
  });

  it("does nothing on yourself, on a corpse, or while you are dead", () => {
    expect(middleClickAction(MATCH, ARENA, vec2(0, 0))).toEqual({ kind: "none" });
    expect(middleClickAction(dead("foe"), ARENA, vec2(200, 0))).toEqual({ kind: "none" });
    expect(middleClickAction(dead("me"), ARENA, vec2(150, 60))).toEqual({ kind: "none" });
  });
});

describe("the call keys (#443)", () => {
  const targeting = (targetId: string | undefined, selfDead = false): MatchSnapshot => ({
    ...MATCH,
    players: MATCH.players.map((p) =>
      p.sessionId === "me" ? { ...p, targetSessionId: targetId, dead: selfDead } : p,
    ),
  });

  it("calls your target when it is a living foe, and nothing else", () => {
    expect(callTargetCall(targeting("foe"))).toEqual({ kind: "target", targetId: "foe" });
    expect(callTargetCall(targeting("ally"))).toBeUndefined();
    expect(callTargetCall(targeting(undefined))).toBeUndefined();
    expect(callTargetCall(targeting("foe", true))).toBeUndefined();
  });

  it("pings under the pointer while you are alive and it is on the arena", () => {
    expect(pingCall(MATCH, vec2(5, 6))).toEqual({ kind: "ping", x: 5, y: 6 });
    expect(pingCall(MATCH, undefined)).toBeUndefined();
    expect(pingCall(targeting(undefined, true), vec2(5, 6))).toBeUndefined();
  });

  it("targets the foe your team called, unless there is none or it is already yours", () => {
    const called = { target: { targetId: "foe", callerId: "ally" }, pings: [] };
    expect(calledTargetIntent(targeting(undefined), called)).toEqual({
      kind: "target",
      targetSessionId: "foe",
    });
    expect(calledTargetIntent(targeting("ally"), called)).toEqual({
      kind: "target",
      targetSessionId: "foe",
    });
    expect(calledTargetIntent(targeting("foe"), called)).toBeUndefined();
    expect(calledTargetIntent(targeting(undefined), { target: null, pings: [] })).toBeUndefined();
  });
});
