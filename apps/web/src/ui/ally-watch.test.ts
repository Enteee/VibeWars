import { describe, expect, it } from "vitest";

import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { allyWatchView, toggleWatch } from "./ally-watch.js";

const ally = {
  sessionId: "ally",
  name: "Kaja",
  health: 120,
  maxHealth: 480,
  dead: false,
} as const satisfies Partial<PlayerSnapshot>;

function match(players: readonly Pick<PlayerSnapshot, keyof typeof ally>[]): MatchSnapshot {
  return {
    selfSessionId: "me",
    players: players.map((player) => ({
      x: 0,
      y: 0,
      facing: 0,
      targetSessionId: undefined,
      attackTargetSessionId: undefined,
      walking: false,
      energy: 0,
      maxEnergy: 0,
      overcast: 0,
      morale: 0,
      armor: 0,
      weaponId: undefined,
      offhandId: undefined,
      primaryProfession: undefined,
      secondaryProfession: undefined,
      team: 0,
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
      ...player,
    })),
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

describe("watching an ally (#443)", () => {
  it("shows the watched ally's name and health", () => {
    expect(allyWatchView(match([ally]), "ally")).toEqual({
      name: "Kaja",
      healthPercent: 25,
      health: 120,
      maxHealth: 480,
      dead: false,
    });
  });

  it("stays open and says so when they die; closes when they leave", () => {
    expect(allyWatchView(match([{ ...ally, dead: true, health: 0 }]), "ally")?.dead).toBe(true);
    expect(allyWatchView(match([]), "ally")).toBeUndefined();
    expect(allyWatchView(match([ally]), undefined)).toBeUndefined();
  });

  it("toggles on the same ally, and switches to another", () => {
    expect(toggleWatch(undefined, "a")).toBe("a");
    expect(toggleWatch("a", "a")).toBeUndefined();
    expect(toggleWatch("a", "b")).toBe("b");
  });
});
