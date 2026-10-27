import { describe, expect, it } from "vitest";
import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { toArenaSnapshot } from "./match-view.js";

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
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining,
    healthPips: 0,
    energyPips: 0,
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
});
