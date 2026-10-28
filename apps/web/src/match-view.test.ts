import { describe, expect, it } from "vitest";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { toArenaSnapshot } from "./match-view.js";
import { ACTOR_RADIUS, CREATURE_RADIUS } from "./render/arena-snapshot.js";

function player(sessionId: string, knockdownRemaining: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 100,
    y: 100,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 400,
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
    knockdownRemaining,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    statuses: [],
  };
}

function match(players: readonly PlayerSnapshot[]): MatchSnapshot {
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
    summary: undefined,
  };
}

describe("toArenaSnapshot", () => {
  it("lays a body down while its knockdown lasts, and stands it up at 0 (#545)", () => {
    const arena = toArenaSnapshot(match([player("me", 0), player("down", 2.5)]), []);
    expect(arena.actors.map((actor) => [actor.id, actor.knockedDown])).toEqual([
      ["me", false],
      ["down", true],
    ]);
  });

  it("draws a creature smaller than a player, at the ruleset's radii (#1052)", () => {
    const minion: PlayerSnapshot = {
      ...player("me/c1", 0),
      creature: { ownerId: "me", kind: "minion" },
    };
    const arena = toArenaSnapshot(match([player("me", 0), minion]), []);
    expect(arena.actors.map((actor) => actor.radius)).toEqual([
      MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius,
      MINIMAL_GW_INSPIRED_PVP_V1.collision.creatureRadius,
    ]);
    expect([ACTOR_RADIUS, CREATURE_RADIUS]).toEqual([
      MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius,
      MINIMAL_GW_INSPIRED_PVP_V1.collision.creatureRadius,
    ]);
  });
});
