import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "@vibewars/game-session";

import {
  closestTarget,
  firstFollowed,
  nextFollowed,
  nextTabTarget,
  selfTargetIntent,
} from "./tab-target.js";

function player(sessionId: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    guildTag: undefined,
    guildCape: undefined,
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
    invulnerableSeconds: 0,
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
          leaderId: null,
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
          leaderId: null,
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

describe("nextFollowed (#480)", () => {
  // Seated in this order: team 1's first, then team 0's two, then team 1's second.
  const B1 = player("b1", { team: 1 });
  const A1 = player("a1", { team: 0 });
  const A2 = player("a2", { team: 0 });
  const B2 = player("b2", { team: 1 });
  const PET = player("pet", {
    team: 0,
    creature: {
      ownerId: "a1",
      kind: "minion",
      look: "bone-minion",
      mode: null,
      armedAttack: null,
      leaderId: null,
    },
  });
  const SEATS = [B1, A1, PET, A2, B2];

  it("follows team 0's first seat first", () => {
    expect(firstFollowed(SEATS)).toBe("a1");
    expect(firstFollowed([])).toBeUndefined();
  });

  it("cycles both teams in seat order, team 0 first, and wraps; never a creature", () => {
    const order: (string | undefined)[] = [];
    let current: string | undefined = "a1";
    for (let i = 0; i < 4; i += 1) {
      current = nextFollowed(SEATS, current, 1);
      order.push(current);
    }
    expect(order).toEqual(["a2", "b1", "b2", "a1"]);
  });

  it("goes back on Shift-Tab", () => {
    expect(nextFollowed(SEATS, "a1", -1)).toBe("b2");
    expect(nextFollowed(SEATS, "b1", -1)).toBe("a2");
  });

  it("skips the dead, from a dead one too", () => {
    const deadA1 = player("a1", { team: 0, dead: true });
    const deadA2 = player("a2", { team: 0, dead: true });
    expect(nextFollowed([B1, A1, deadA2, B2], "a1", 1)).toBe("b1");
    expect(nextFollowed([B1, deadA1, deadA2, B2], "a1", 1)).toBe("b1");
  });

  it("follows nobody new when everyone is dead, or nobody is there", () => {
    const allDead = SEATS.map((seat) => ({ ...seat, dead: true }));
    expect(nextFollowed(allDead, "a1", 1)).toBeUndefined();
    expect(nextFollowed([], undefined, 1)).toBeUndefined();
  });
});
