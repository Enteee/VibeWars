import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSkill, segment, vec2 } from "@vibewars/game-core";
import type { PlayerSnapshot, SkillSlot } from "@vibewars/game-session";

import {
  adrenalineFading,
  adrenalineFill,
  adrenalineGaugeHtml,
  castFailures,
  castFill,
  castingSlot,
  flashSlot,
  knockdownDrain,
  outOfRange,
  paintAdrenalineFill,
  paintCastFill,
  paintKnockdown,
  SLOT_FLASH_MS,
  slotAffordable,
  slotFlashes,
  wrongWeapon,
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

describe("knockdownDrain (#545)", () => {
  it("is nothing standing, and full as a knockdown lands", () => {
    expect(knockdownDrain(0, undefined)).toBeUndefined();
    expect(knockdownDrain(0, 4)).toBeUndefined();
    expect(knockdownDrain(4, undefined)).toEqual({ whole: 4, fraction: 1 });
  });

  it("drains against the most it has been since it went down", () => {
    expect(knockdownDrain(1, 4)).toEqual({ whole: 4, fraction: 0.25 });
    // A first snapshot taken a tick in reads full, not short.
    expect(knockdownDrain(3.95, undefined)).toEqual({ whole: 3.95, fraction: 1 });
  });
});

describe("paintKnockdown (#545)", () => {
  /** Just enough of an element for `paintKnockdown`, without jsdom. */
  function bar(): HTMLElement {
    const properties = new Map<string, string>();
    const classes = new Set<string>();
    return {
      dataset: {},
      style: {
        getPropertyValue: (name: string) => properties.get(name) ?? "",
        setProperty: (name: string, value: string) => properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name),
      },
      classList: {
        toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
        contains: (name: string) => classes.has(name),
      },
    } as unknown as HTMLElement;
  }

  it("greys the bar and drains it while down, and lights it the frame the body rises", () => {
    const skills = bar();
    paintKnockdown(skills, 4);
    expect(skills.classList.contains("is-knocked-down")).toBe(true);
    expect(skills.style.getPropertyValue("--knockdown-fill")).toBe("1");
    paintKnockdown(skills, 1);
    expect(skills.style.getPropertyValue("--knockdown-fill")).toBe("0.25");
    paintKnockdown(skills, 0);
    expect(skills.classList.contains("is-knocked-down")).toBe(false);
    expect(skills.style.getPropertyValue("--knockdown-fill")).toBe("");
    // The next knockdown measures itself, not the last one.
    paintKnockdown(skills, 2);
    expect(skills.style.getPropertyValue("--knockdown-fill")).toBe("1");
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

  it("marks no skill the target is wrong for: walking closer would not help (#599)", () => {
    const BLOOD_RITUAL = "necromancer.blood-ritual";
    const ally = (x: number) => self({ sessionId: "ally", x, team: 0 });
    expect(outOfRange([slot(BLOOD_RITUAL)], self({}), foe(1000), [])).toEqual([false]);
    expect(outOfRange([slot(BLOOD_RITUAL)], self({}), ally(1000), [])).toEqual([true]);
    expect(outOfRange([slot(FIREBALL)], self({}), ally(1000), [])).toEqual([false]);
  });

  it("marks a resurrection against a corpse only, and nothing else against it (#812)", () => {
    const RESTORE_LIFE = "monk.restore-life";
    const range = getSkill(RESTORE_LIFE)?.range ?? 0;
    const bar = [slot(RESTORE_LIFE), slot(FIREBALL)];
    const ally = (x: number, dead: boolean) => self({ sessionId: "ally", x, team: 0, dead });
    expect(range).toBeGreaterThan(0);
    expect(outOfRange(bar, self({}), ally(range + 1, true), [])).toEqual([true, false]);
    expect(outOfRange(bar, self({}), ally(range - 1, true), [])).toEqual([false, false]);
    expect(outOfRange(bar, self({}), ally(range + 1, false), [])).toEqual([false, false]);
  });

  it("marks no pet skill, and no resurrection against a dead creature (#1046)", () => {
    const COMFORT = "ranger.comfort-animal";
    const RESTORE_LIFE = "monk.restore-life";
    // Past both skills' range.
    const pet = self({
      sessionId: "r/c1",
      x: 1000,
      team: 0,
      dead: true,
      creature: { ownerId: "r", kind: "pet", mode: "guard" },
    });
    expect(outOfRange([slot(COMFORT), slot(RESTORE_LIFE)], self({}), pet, [])).toEqual([
      false,
      false,
    ]);
    expect(outOfRange([slot(COMFORT)], self({}), foe(5000), [])).toEqual([false]);
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
          { kind: "damage", targetId: "foe", amount: 10, critical: false },
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
          { kind: "damage", targetId: "me", amount: 10, critical: false },
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

describe("slotAffordable (#637)", () => {
  it("reads the bar's cost, so a discounted spell lights", () => {
    const poor = self({ energy: 3 });
    expect(slotAffordable(slot("fireball"), poor, 0)).toBe(false);
    // The host's next bar, with Glyph of Lesser Energy up.
    expect(slotAffordable({ ...slot("fireball"), energyCost: 0 }, poor, 0)).toBe(true);
  });

  it("asks the slot's own adrenaline of an adrenal skill, in strikes of 25, not energy (#463)", () => {
    const rush = { ...slot("rush"), energyCost: 0, adrenalineCost: 4 };
    expect(slotAffordable(rush, self({ energy: 0 }), 4 * 25 - 1)).toBe(false);
    expect(slotAffordable(rush, self({ energy: 0 }), 4 * 25)).toBe(true);
  });
});

describe("wrongWeapon (#417)", () => {
  // Swift Chop needs an axe, Barrage a bow, Distracting Blow any melee weapon.
  const bar = [
    slot("warrior.swift-chop"),
    slot("ranger.barrage"),
    slot("warrior.distracting-blow"),
    slot("elementalist.fireball"),
    null,
  ];

  it("marks an attack skill the weapon in hand cannot use, and nothing else", () => {
    expect(wrongWeapon(bar, self({ weaponId: "axe" }))).toEqual([false, true, false, false, false]);
    expect(wrongWeapon(bar, self({ weaponId: "longbow" }))).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(wrongWeapon(bar, self({ weaponId: "sword" }))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("marks every attack skill for fists, no weapon or one this client does not know", () => {
    for (const weaponId of ["unarmed", undefined, "trebuchet"]) {
      expect(wrongWeapon(bar, self({ weaponId })), String(weaponId)).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
    }
  });
});

describe("adrenalineFill (#826)", () => {
  const rush = { ...slot("rush"), energyCost: 0, adrenalineCost: 4 };

  it("is the slot's own units over its cost in strikes of 25", () => {
    expect(adrenalineFill(rush, 0)).toBe(0);
    expect(adrenalineFill(rush, 50)).toBe(0.5);
    expect(adrenalineFill(rush, 4 * 25)).toBe(1);
  });

  it("clamps an over-full slot to 1", () => {
    expect(adrenalineFill(rush, 4 * 25 + 30)).toBe(1);
  });

  it("is undefined for an energy skill", () => {
    expect(adrenalineFill(slot("fireball"), 100)).toBeUndefined();
  });

  it("is charged exactly when the slot is affordable, so a full slot is never dimmed", () => {
    const poor = self({ energy: 0 });
    expect(adrenalineFill(rush, 99)).toBeLessThan(1);
    expect(slotAffordable(rush, poor, 99)).toBe(false);
    expect(adrenalineFill(rush, 100)).toBe(1);
    expect(slotAffordable(rush, poor, 100)).toBe(true);
  });

  it("draws a gauge in an adrenaline skill's slot and none in an energy skill's", () => {
    expect(adrenalineGaugeHtml(rush)).toContain('class="adrenaline-gauge"');
    expect(adrenalineGaugeHtml(slot("fireball"))).toBe("");
  });
});

describe("paintAdrenalineFill (#826)", () => {
  /** Just enough of an element for `paintAdrenalineFill`, without jsdom. */
  function button(): HTMLElement & { writes: number } {
    const properties = new Map<string, string>();
    const element = {
      writes: 0,
      style: {
        getPropertyValue: (name: string) => properties.get(name) ?? "",
        setProperty: (name: string, value: string) => {
          element.writes += 1;
          properties.set(name, value);
        },
        removeProperty: (name: string) => {
          element.writes += 1;
          properties.delete(name);
        },
      },
    };
    return element as unknown as HTMLElement & { writes: number };
  }

  it("follows each new message, and writes only when the fill changes", () => {
    const slotButton = button();
    paintAdrenalineFill(slotButton, 0.25);
    expect(slotButton.style.getPropertyValue("--adrenaline-fill")).toBe("0.25");
    paintAdrenalineFill(slotButton, 0.25);
    expect(slotButton.writes).toBe(1);
    paintAdrenalineFill(slotButton, 1);
    expect(slotButton.style.getPropertyValue("--adrenaline-fill")).toBe("1");
    paintAdrenalineFill(slotButton, undefined);
    expect(slotButton.style.getPropertyValue("--adrenaline-fill")).toBe("");
    expect(slotButton.writes).toBe(3);
  });
});

describe("adrenalineFading (#828)", () => {
  it("blinks a slot holding any from 5 s before the loss, charged or not, and not before", () => {
    expect(adrenalineFading(25, 5)).toBe(true);
    expect(adrenalineFading(4 * 25, 0.5)).toBe(true);
    expect(adrenalineFading(25, 5.05)).toBe(false);
  });

  it("does not blink an empty slot, or once the window starts again", () => {
    expect(adrenalineFading(0, 2)).toBe(false);
    expect(adrenalineFading(0, null)).toBe(false);
    expect(adrenalineFading(25, 25)).toBe(false);
  });
});
