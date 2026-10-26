import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSkill, segment, vec2 } from "@vibewars/game-core";
import type { PlayerSnapshot, SkillSlot } from "@vibewars/game-session";

import {
  castFailures,
  castFill,
  castingSlot,
  flashSlot,
  outOfRange,
  paintCastFill,
  SLOT_FLASH_MS,
  slotFlashes,
} from "./skill-slot-state.js";

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
    walking: false,
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

describe("castFill", () => {
  it("rises from 0 to 1 over the cast", () => {
    const at = (castRemaining: number) =>
      castFill(BAR, self({ castingSkillId: "flare", castTotal: 2, castRemaining }));
    expect(at(2)).toEqual({ slot: 1, fraction: 0 });
    expect(at(1)).toEqual({ slot: 1, fraction: 0.5 });
    expect(at(0)).toEqual({ slot: 1, fraction: 1 });
  });

  it("is nothing for an instant skill, or with no cast", () => {
    expect(castFill(BAR, self({ castingSkillId: "flare", castTotal: 0 }))).toBeUndefined();
    expect(castFill(BAR, self({}))).toBeUndefined();
  });
});

describe("paintCastFill", () => {
  /** Just enough of an element for `paintCastFill`, without jsdom. */
  function button(): HTMLElement {
    const properties = new Map<string, string>();
    const style = {
      getPropertyValue: (name: string) => properties.get(name) ?? "",
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
    };
    return { style } as unknown as HTMLElement;
  }

  it("sets --cast-fill while casting and clears it the frame the cast ends", () => {
    const slotButton = button();
    paintCastFill(slotButton, 0.25);
    expect(slotButton.style.getPropertyValue("--cast-fill")).toBe("0.25");
    paintCastFill(slotButton, undefined);
    expect(slotButton.style.getPropertyValue("--cast-fill")).toBe("");
  });
});

describe("outOfRange", () => {
  // Fireball reaches an enemy; Armor of Earth is on its caster alone.
  const FIREBALL = "elementalist.fireball";
  const RANGE = getSkill(FIREBALL)?.range ?? 0;
  const RANGED_BAR = [slot(FIREBALL), null, slot("elementalist.armor-of-earth")];
  const foe = (x: number, more: Partial<PlayerSnapshot> = {}) =>
    self({ sessionId: "foe", x, team: 1, ...more });

  it("marks a targeted skill one unit past its range, not one unit inside it", () => {
    expect(RANGE).toBeGreaterThan(0);
    expect(outOfRange(RANGED_BAR, self({}), foe(RANGE - 1), [])).toEqual([false, false, false]);
    expect(outOfRange(RANGED_BAR, self({}), foe(RANGE + 1), [])).toEqual([true, false, false]);
  });

  it("marks a targeted skill with a wall between caster and target", () => {
    const wall = segment(vec2(50, -100), vec2(50, 100));
    expect(outOfRange(RANGED_BAR, self({}), foe(100), [wall])).toEqual([true, false, false]);
  });

  it("marks no ally skill with a foe targeted, which the host casts on its caster", () => {
    const ORISON = "monk.orison-of-healing";
    const range = getSkill(ORISON)?.range ?? 0;
    const bar = [slot(ORISON)];
    expect(outOfRange(bar, self({}), foe(range + 1), [])).toEqual([false]);
    expect(outOfRange(bar, self({}), foe(range + 1, { team: 0 }), [])).toEqual([true]);
  });

  it("marks nothing with no target, or a dead one", () => {
    expect(outOfRange(RANGED_BAR, self({}), undefined, [])).toEqual([false, false, false]);
    expect(outOfRange(RANGED_BAR, self({}), foe(RANGE + 1, { dead: true }), [])).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("castFailures (#484)", () => {
  it("is this caster's interrupted and cancelled casts, in order, and no one else's", () => {
    expect(
      castFailures(
        [
          { kind: "interrupted", targetId: "foe", skillId: "ranger.troll-unguent" },
          { kind: "interrupted", targetId: "me", skillId: "meteor" },
          { kind: "damage", targetId: "foe", amount: 10 },
          { kind: "cancelled", targetId: "foe", skillId: "unknown" },
        ],
        "foe",
      ),
    ).toEqual([
      { skillId: "ranger.troll-unguent", kind: "interrupted" },
      { skillId: "unknown", kind: "cancelled" },
    ]);
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
