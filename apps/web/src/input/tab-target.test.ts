import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "@vibewars/game-session";

import { nextTabTarget } from "./tab-target.js";

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
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 1,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    statuses: [],
    ...overrides,
  };
}

const ME = player("me", { team: 0 });
const NEAR = player("near", { x: 10 });
const MID = player("mid", { x: 20 });
const FAR = player("far", { x: 30 });
const PLAYERS = [FAR, ME, MID, NEAR];

describe("nextTabTarget", () => {
  it("targets the nearest enemy first", () => {
    expect(nextTabTarget(PLAYERS, "me", undefined, 1)).toBe("near");
  });

  it("walks outward with each Tab, and wraps", () => {
    const order: (string | undefined)[] = [];
    let current: string | undefined;
    for (let i = 0; i < 4; i += 1) {
      current = nextTabTarget(PLAYERS, "me", current, 1);
      order.push(current);
    }
    expect(order).toEqual(["near", "mid", "far", "near"]);
  });

  it("goes backwards with Shift-Tab, starting from the farthest", () => {
    expect(nextTabTarget(PLAYERS, "me", undefined, -1)).toBe("far");
    expect(nextTabTarget(PLAYERS, "me", "near", -1)).toBe("far");
    expect(nextTabTarget(PLAYERS, "me", "far", -1)).toBe("mid");
  });

  it("skips the dead and allies", () => {
    const players = [
      ME,
      player("ally", { team: 0, x: 1 }),
      player("corpse", { x: 2, dead: true }),
      MID,
    ];
    expect(nextTabTarget(players, "me", undefined, 1)).toBe("mid");
    expect(nextTabTarget(players, "me", "mid", 1)).toBe("mid");
  });

  it("starts from the nearest again when the current target has died", () => {
    const players = [ME, NEAR, player("mid", { x: 20, dead: true }), FAR];
    expect(nextTabTarget(players, "me", "mid", 1)).toBe("near");
  });

  it("orders equal distances by id", () => {
    const players = [ME, player("b", { x: 10 }), player("a", { y: 10 }), player("c", { x: -10 })];
    expect(nextTabTarget(players, "me", undefined, 1)).toBe("a");
    expect(nextTabTarget(players, "me", "a", 1)).toBe("b");
    expect(nextTabTarget(players, "me", "b", 1)).toBe("c");
  });

  it("finds nobody with no enemy, or no self", () => {
    expect(nextTabTarget([ME, player("ally", { team: 0 })], "me", undefined, 1)).toBeUndefined();
    expect(nextTabTarget([NEAR], "me", undefined, 1)).toBeUndefined();
  });
});
