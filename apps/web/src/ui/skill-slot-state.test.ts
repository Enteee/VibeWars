import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, SkillSlot } from "../net/match-connection.js";
import { castingSlot, flashSlot, SLOT_FLASH_MS, slotFlashes } from "./skill-slot-state.js";

function slot(id: string): SkillSlot {
  return {
    id,
    name: id,
    energyCost: 5,
    adrenalineCost: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
  };
}

const BAR = [slot("fireball"), slot("flare"), slot("meteor")];

function self(cast: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    sessionId: "me",
    name: "me",
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
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    statuses: [],
    ...cast,
  };
}

describe("castingSlot", () => {
  it("is the slot holding the skill being cast", () => {
    expect(castingSlot(BAR, self({ castingSkillId: "flare", castTotal: 2 }))).toBe(1);
  });

  it("is nothing with no cast, an instant, or a skill not on the bar", () => {
    expect(castingSlot(BAR, self({}))).toBeUndefined();
    expect(castingSlot(BAR, undefined)).toBeUndefined();
    expect(castingSlot(BAR, self({ castingSkillId: "flare", castTotal: 0 }))).toBeUndefined();
    expect(castingSlot(BAR, self({ castingSkillId: "unknown", castTotal: 2 }))).toBeUndefined();
  });
});

describe("slotFlashes", () => {
  it("maps this player's interrupted and cancelled casts to their slots", () => {
    expect(
      slotFlashes(
        [
          { kind: "interrupted", targetId: "me", skillId: "meteor" },
          { kind: "cancelled", targetId: "me", skillId: "fireball" },
        ],
        "me",
        BAR,
      ),
    ).toEqual([
      { slot: 2, kind: "interrupted" },
      { slot: 0, kind: "cancelled" },
    ]);
  });

  it("ignores another player's casts, other events and a skill not on the bar", () => {
    expect(
      slotFlashes(
        [
          { kind: "interrupted", targetId: "them", skillId: "meteor" },
          { kind: "damage", targetId: "me", amount: 10 },
          { kind: "cancelled", targetId: "me", skillId: "unknown" },
        ],
        "me",
        BAR,
      ),
    ).toEqual([]);
  });
});

describe("flashSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Just enough of an element for `flashSlot`, without jsdom. */
  function button(): Element {
    const classes = new Set<string>();
    const classList = {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      contains: (name: string) => classes.has(name),
    };
    return { classList } as unknown as Element;
  }

  it("holds the class for SLOT_FLASH_MS, then drops it", () => {
    const slotButton = button();
    flashSlot(slotButton, "interrupted");
    vi.advanceTimersByTime(SLOT_FLASH_MS - 1);
    expect(slotButton.classList.contains("is-interrupted")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(slotButton.classList.contains("is-interrupted")).toBe(false);
  });

  it("a new flash replaces the old one and restarts the clock", () => {
    const slotButton = button();
    flashSlot(slotButton, "interrupted");
    vi.advanceTimersByTime(300);
    flashSlot(slotButton, "cancelled");
    expect(slotButton.classList.contains("is-interrupted")).toBe(false);
    vi.advanceTimersByTime(300);
    expect(slotButton.classList.contains("is-cancelled")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(slotButton.classList.contains("is-cancelled")).toBe(false);
  });
});
