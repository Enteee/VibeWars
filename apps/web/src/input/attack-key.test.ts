import { describe, expect, it } from "vitest";

import type { MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import { attackKeyIntents, isAttacking } from "./attack-key.js";

function player(sessionId: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    health: 500,
    maxHealth: 500,
    energy: 20,
    maxEnergy: 50,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
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
