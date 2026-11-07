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
  primaryClickIntents,
  secondaryClickIntents,
} from "./mouse-intents.js";

function player(sessionId: string, team: number, x: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: undefined,
    guildCape: undefined,
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
    invulnerableSeconds: 0,
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
  score: [0, 0],
  elapsedSeconds: 0,
  phase: "active",
  winningTeam: undefined,
  endReason: undefined,
  projectiles: [],
  groundEffects: [],
  traps: [],
  flags: [],
  stand: undefined,
  aggression: [],
  relics: [],
  altar: undefined,
  altarHolder: undefined,
  altarHeldSeconds: 0,
  capturePoints: [],
  summary: undefined,
};

function body(id: string, x: number, team: RenderableActor["team"]): RenderableActor {
  return {
    id,
    name: id,
    guildTag: undefined,
    cape: undefined,
    bot: false,
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
    invulnerable: false,
    conditionCues: [],
  };
}

const ARENA: ArenaSnapshot = {
  ...EMPTY_SNAPSHOT,
  actors: [body("me", 0, "self"), body("ally", 100, "ally"), body("foe", 200, "enemy")],
};

describe("secondaryClickIntents", () => {
  it("targets the enemy under the pointer", () => {
    expect(
      secondaryClickIntents(MATCH, ARENA, vec2(202, 3), createDoubleClick(), 0, false),
    ).toEqual([{ kind: "target", targetSessionId: "foe" }]);
  });

  it("targets and attacks on a double right click on an enemy", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 0, false);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 200, false)).toEqual([
      { kind: "target", targetSessionId: "foe" },
      { kind: "attack", targetId: "foe" },
    ]);
  });

  it("only targets an ally, however often it is clicked", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(100, 0), double, 0, false);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(100, 0), double, 200, false)).toEqual([
      { kind: "target", targetSessionId: "ally" },
    ]);
  });

  it("targets a flag lying on the ground, and walks to it on a double (#1225)", () => {
    const arena: ArenaSnapshot = {
      ...ARENA,
      flags: [
        { id: "flag/0", side: "ally", position: vec2(0, 300), carried: false, onStand: false },
      ],
      stand: { id: "flag-stand", position: vec2(500, 300), holder: undefined },
    };
    const double = createDoubleClick();
    expect(secondaryClickIntents(MATCH, arena, vec2(5, 290), double, 0, false)).toEqual([
      { kind: "target", targetSessionId: "flag/0" },
    ]);
    expect(secondaryClickIntents(MATCH, arena, vec2(5, 290), double, 200, false)).toEqual([
      { kind: "target", targetSessionId: "flag/0" },
      { kind: "attack", targetId: "flag/0" },
    ]);
    expect(
      secondaryClickIntents(MATCH, arena, vec2(520, 310), createDoubleClick(), 0, false),
    ).toEqual([{ kind: "target", targetSessionId: "flag-stand" }]);
  });

  it("targets the stand or a flag under your own body, not yourself (#1299)", () => {
    const arena: ArenaSnapshot = {
      ...ARENA,
      flags: [{ id: "flag/0", side: "ally", position: vec2(0, 0), carried: false, onStand: false }],
      stand: { id: "flag-stand", position: vec2(200, 0), holder: undefined },
    };
    expect(secondaryClickIntents(MATCH, arena, vec2(0, 0), createDoubleClick(), 0, false)).toEqual([
      { kind: "target", targetSessionId: "flag/0" },
    ]);
    const onStand: ArenaSnapshot = {
      ...arena,
      flags: [],
      stand: { id: "flag-stand", position: vec2(0, 0), holder: undefined },
    };
    const double = createDoubleClick();
    expect(secondaryClickIntents(MATCH, onStand, vec2(0, 0), double, 0, false)).toEqual([
      { kind: "target", targetSessionId: "flag-stand" },
    ]);
    expect(secondaryClickIntents(MATCH, onStand, vec2(0, 0), double, 200, false)).toEqual([
      { kind: "target", targetSessionId: "flag-stand" },
      { kind: "attack", targetId: "flag-stand" },
    ]);
  });

  it("targets a foe standing on the stand, not the stand (#1299)", () => {
    const arena: ArenaSnapshot = {
      ...ARENA,
      stand: { id: "flag-stand", position: vec2(200, 0), holder: undefined },
    };
    expect(
      secondaryClickIntents(MATCH, arena, vec2(200, 0), createDoubleClick(), 0, false),
    ).toEqual([{ kind: "target", targetSessionId: "foe" }]);
  });

  it("targets yourself with no flag object under you", () => {
    expect(secondaryClickIntents(MATCH, ARENA, vec2(0, 0), createDoubleClick(), 0, false)).toEqual([
      { kind: "target", targetSessionId: "me" },
    ]);
  });

  it("sends nothing for the ground, and a click there breaks a double", () => {
    const double = createDoubleClick();
    secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 0, false);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(150, 80), double, 100, false)).toEqual([]);
    expect(secondaryClickIntents(MATCH, ARENA, vec2(200, 0), double, 200, false)).toEqual([
      { kind: "target", targetSessionId: "foe" },
    ]);
  });
});

describe("clicks with the names key held (#2738)", () => {
  // The foe's name tag, well above its body at (200, 0).
  const NAME = vec2(200, -40);
  const HELD: ArenaSnapshot = {
    ...ARENA,
    tagBoxes: new Map([["foe", { x: 180, y: -45, width: 40, height: 12 }]]),
  };

  it("targets on a second right click without attacking, on the body or the name", () => {
    for (const world of [vec2(200, 0), NAME]) {
      const double = createDoubleClick();
      const first = secondaryClickIntents(MATCH, HELD, world, double, 0, true);
      const second = secondaryClickIntents(MATCH, HELD, world, double, 200, true);
      expect(first).toEqual([{ kind: "target", targetSessionId: "foe" }]);
      expect(second).toEqual([{ kind: "target", targetSessionId: "foe" }]);
    }
  });

  it("misses the name without the key", () => {
    expect(secondaryClickIntents(MATCH, HELD, NAME, createDoubleClick(), 0, false)).toEqual([]);
  });

  it("targets and attacks a foe with one left click on its body or name, and does not walk", () => {
    for (const world of [NAME, vec2(200, 0)]) {
      expect(primaryClickIntents(MATCH, HELD, world, true)).toEqual([
        { kind: "target", targetSessionId: "foe" },
        { kind: "attack", targetId: "foe" },
      ]);
    }
  });

  it("only targets an ally with a left click", () => {
    expect(primaryClickIntents(MATCH, HELD, vec2(100, 0), true)).toEqual([
      { kind: "target", targetSessionId: "ally" },
    ]);
  });

  it("walks with a left click on the ground, on yourself, or without the key", () => {
    expect(primaryClickIntents(MATCH, HELD, vec2(150, 80), true)).toEqual([
      {
        kind: "walk-to",
        x: 150,
        y: 80,
      },
    ]);
    expect(primaryClickIntents(MATCH, HELD, vec2(0, 0), true)).toEqual([
      { kind: "walk-to", x: 0, y: 0 },
    ]);
    expect(primaryClickIntents(MATCH, HELD, vec2(200, 0), false)).toEqual([
      {
        kind: "walk-to",
        x: 200,
        y: 0,
      },
    ]);
  });

  it("calls a foe with a wheel click on its name", () => {
    expect(middleClickAction(MATCH, HELD, NAME, true)).toEqual({
      kind: "call",
      call: { kind: "target", targetId: "foe" },
    });
  });
});

describe("middleClickAction (#443)", () => {
  const dead = (id: string): MatchSnapshot => ({
    ...MATCH,
    players: MATCH.players.map((p) => (p.sessionId === id ? { ...p, dead: true } : p)),
  });

  it("calls a living foe, and pings a living ally's point and the ground (#1055)", () => {
    expect(middleClickAction(MATCH, ARENA, vec2(201, 2), false)).toEqual({
      kind: "call",
      call: { kind: "target", targetId: "foe" },
    });
    expect(middleClickAction(MATCH, ARENA, vec2(101, 2), false)).toEqual({
      kind: "call",
      call: { kind: "ping", x: 101, y: 2 },
    });
    expect(middleClickAction(MATCH, ARENA, vec2(150, 60), false)).toEqual({
      kind: "call",
      call: { kind: "ping", x: 150, y: 60 },
    });
  });

  it("does nothing on yourself, on a corpse, or while you are dead", () => {
    expect(middleClickAction(MATCH, ARENA, vec2(0, 0), false)).toEqual({ kind: "none" });
    expect(middleClickAction(dead("foe"), ARENA, vec2(200, 0), false)).toEqual({ kind: "none" });
    expect(middleClickAction(dead("me"), ARENA, vec2(150, 60), false)).toEqual({ kind: "none" });
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
    const called = { target: { targetId: "foe", callerId: "ally" }, pings: [], strokes: [] };
    expect(calledTargetIntent(targeting(undefined), called)).toEqual({
      kind: "target",
      targetSessionId: "foe",
    });
    expect(calledTargetIntent(targeting("ally"), called)).toEqual({
      kind: "target",
      targetSessionId: "foe",
    });
    expect(calledTargetIntent(targeting("foe"), called)).toBeUndefined();
    expect(
      calledTargetIntent(targeting(undefined), { target: null, pings: [], strokes: [] }),
    ).toBeUndefined();
  });
});
