import { describe, expect, it } from "vitest";
import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import {
  attackClickIntents,
  attackKeyIntents,
  hasActionToCancel,
  isAttacking,
  isCasting,
  isWalking,
} from "./attack-key.js";

function player(sessionId: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 0,
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
    team: 0,
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
    statuses: [],
    ...overrides,
  };
}

function snapshot(players: PlayerSnapshot[]): MatchSnapshot {
  return {
    selfSessionId: "me",
    players,
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
    groundEffects: [],
    summary: undefined,
  };
}

describe("attackKeyIntents", () => {
  it("attacks the current target", () => {
    const match = snapshot([player("me", { targetSessionId: "far" }), player("far", { team: 1 })]);
    expect(attackKeyIntents(match)).toEqual([{ kind: "attack", targetId: "far" }]);
  });

  it("with no target, selects and attacks the nearest living enemy", () => {
    const match = snapshot([
      player("me"),
      player("ally", { x: 5 }),
      player("dead", { x: 10, team: 1, dead: true }),
      player("near", { x: 50, team: 1 }),
      player("far", { x: 90, team: 1 }),
    ]);
    expect(attackKeyIntents(match)).toEqual([
      { kind: "target", targetSessionId: "near" },
      { kind: "attack", targetId: "near" },
    ]);
  });

  it("sends nothing when there is nobody to attack", () => {
    expect(attackKeyIntents(snapshot([player("me"), player("ally", { x: 5 })]))).toEqual([]);
    expect(attackKeyIntents(snapshot([]))).toEqual([]);
  });
});

describe("isAttacking", () => {
  it("is whether self has an attack target", () => {
    expect(isAttacking(snapshot([player("me", { attackTargetSessionId: "x" })]))).toBe(true);
    expect(isAttacking(snapshot([player("me")]))).toBe(false);
  });
});

describe("attackClickIntents", () => {
  const match = snapshot([
    player("me"),
    player("ally", { x: 5 }),
    player("foe", { x: 90, team: 1 }),
    player("corpse", { x: 40, team: 1, dead: true }),
  ]);

  it("attacks a living enemy", () => {
    expect(attackClickIntents(match, "foe")).toEqual([{ kind: "attack", targetId: "foe" }]);
  });

  it("sends nothing for an ally, yourself, a corpse, empty ground or a stranger", () => {
    for (const hitId of ["ally", "me", "corpse", undefined, "gone"]) {
      expect(attackClickIntents(match, hitId)).toEqual([]);
    }
  });
});

describe("isCasting", () => {
  it("is whether self has a cast with an activation time running (#300)", () => {
    const casting = { castingSkillId: "fireball", castRemaining: 1, castTotal: 2 };
    expect(isCasting(snapshot([player("me", casting)]))).toBe(true);
    expect(isCasting(snapshot([player("me"), player("other", casting)]))).toBe(false);
    expect(isCasting(snapshot([player("me", { castingSkillId: "barrage" })]))).toBe(false);
  });
});

describe("isWalking", () => {
  it("is whether self is walking to a clicked point (#342)", () => {
    expect(isWalking(snapshot([player("me", { walking: true })]))).toBe(true);
    expect(isWalking(snapshot([player("me"), player("other", { walking: true })]))).toBe(false);
  });
});

describe("hasActionToCancel", () => {
  it("is a cast, an attack or a walk, so Esc stops any of them (#300, #342)", () => {
    expect(hasActionToCancel(snapshot([player("me")]))).toBe(false);
    expect(hasActionToCancel(snapshot([player("me", { walking: true })]))).toBe(true);
    expect(hasActionToCancel(snapshot([player("me", { attackTargetSessionId: "x" })]))).toBe(true);
    const casting = { castingSkillId: "fireball", castRemaining: 1, castTotal: 2 };
    expect(hasActionToCancel(snapshot([player("me", casting)]))).toBe(true);
  });
});
