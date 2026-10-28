import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "@vibewars/game-session";

import { closestTarget, nextTabTarget, selfTargetIntent } from "./tab-target.js";

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
    team: 1,
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

  it("cycles a foe's creature with the foes, and skips your own (#1052)", () => {
    const players = [
      ME,
      player("me/c1", {
        team: 0,
        x: 5,
        creature: {
          ownerId: "me",
          kind: "minion",
          look: "bone-minion",
          mode: null,
          armedAttack: null,
        },
      }),
      player("foe/c1", {
        x: 15,
        creature: {
          ownerId: "foe",
          kind: "minion",
          look: "bone-minion",
          mode: null,
          armedAttack: null,
        },
      }),
      NEAR,
    ];
    expect(nextTabTarget(players, "me", undefined, 1)).toBe("near");
    expect(nextTabTarget(players, "me", "near", 1)).toBe("foe/c1");
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

describe("closestTarget (#1024)", () => {
  it("picks the nearest living foe, and stays on it when pressed again", () => {
    expect(closestTarget(PLAYERS, "me")).toBe("near");
    expect(closestTarget([ME, player("near", { x: 10, dead: true }), MID], "me")).toBe("mid");
    expect(closestTarget([ME, player("ally", { team: 0, x: 1 }), FAR], "me")).toBe("far");
  });

  it("breaks ties by id", () => {
    expect(closestTarget([ME, player("b", { x: 10 }), player("a", { y: 10 })], "me")).toBe("a");
  });

  it("finds nobody with no living foe, or no self", () => {
    expect(closestTarget([ME, player("ally", { team: 0 })], "me")).toBeUndefined();
    expect(closestTarget([NEAR], "me")).toBeUndefined();
  });
});

describe("selfTargetIntent (#1028)", () => {
  it("targets yourself when your target is someone else, or nobody", () => {
    const intent = { kind: "target", targetSessionId: "me" };
    expect(selfTargetIntent(PLAYERS, "me")).toEqual(intent);
    expect(selfTargetIntent([player("me", { targetSessionId: "near" }), NEAR], "me")).toEqual(
      intent,
    );
  });

  it("sends nothing when you are already your target, or not in the match", () => {
    expect(selfTargetIntent([player("me", { targetSessionId: "me" }), NEAR], "me")).toBeUndefined();
    expect(selfTargetIntent([NEAR], "me")).toBeUndefined();
  });
});
