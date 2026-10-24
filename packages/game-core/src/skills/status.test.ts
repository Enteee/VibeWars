import { describe, expect, it } from "vitest";

import {
  STATUS_DEFINITIONS,
  StatusSet,
  aggregateModifiers,
  getStatusDefinition,
  type StatusId,
} from "./status.js";

const ALL_STATUS_IDS = Object.keys(STATUS_DEFINITIONS) as StatusId[];

describe("status definitions", () => {
  it("defines all eight conditions the brief names", () => {
    for (const id of [
      "bleeding",
      "burning",
      "poison",
      "crippled",
      "blind",
      "weakness",
      "deep-wound",
      "dazed",
    ] as const) {
      expect(getStatusDefinition(id).category).toBe("condition");
    }
  });

  it("gives every status a self-consistent id and a non-empty name", () => {
    for (const id of ALL_STATUS_IDS) {
      const def = getStatusDefinition(id);
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it("gives every status at least one actual mechanical effect", () => {
    for (const id of ALL_STATUS_IDS) {
      const def = getStatusDefinition(id);
      const hasEffect =
        def.healthPerSecond !== 0 ||
        def.armorModifier !== 0 ||
        def.moveSpeedMultiplier !== 1 ||
        def.attackMissChance !== 0 ||
        def.maxHealthMultiplier !== 1 ||
        def.castTimeMultiplier !== 1;
      expect(hasEffect, `${id} has no mechanical effect`).toBe(true);
    }
  });

  it("keeps each condition's mechanical identity distinct", () => {
    // Burning should drain faster than bleeding — if these ever converge,
    // the two conditions stop being meaningfully different choices.
    expect(getStatusDefinition("burning").healthPerSecond).toBeLessThan(
      getStatusDefinition("bleeding").healthPerSecond,
    );
    expect(getStatusDefinition("crippled").moveSpeedMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("blind").attackMissChance).toBeGreaterThan(0.5);
    expect(getStatusDefinition("deep-wound").maxHealthMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("dazed").castTimeMultiplier).toBeGreaterThan(1);
  });

  it("makes enchantments beneficial and hexes/conditions detrimental", () => {
    expect(getStatusDefinition("regeneration").healthPerSecond).toBeGreaterThan(0);
    expect(getStatusDefinition("armor-boost").armorModifier).toBeGreaterThan(0);
    expect(getStatusDefinition("life-drain").healthPerSecond).toBeLessThan(0);
  });
});

describe("StatusSet apply/remove", () => {
  it("starts empty", () => {
    const set = new StatusSet();
    expect(set.size).toBe(0);
    expect(set.active).toEqual([]);
  });

  it("applies a status with a duration and source", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "attacker");
    expect(set.has("bleeding")).toBe(true);
    expect(set.get("bleeding")?.remainingSeconds).toBe(10);
    expect(set.get("bleeding")?.sourceId).toBe("attacker");
  });

  it("ignores a zero or negative duration", () => {
    const set = new StatusSet();
    set.apply("bleeding", 0, "a");
    set.apply("burning", -5, "a");
    expect(set.size).toBe(0);
  });

  it("does not stack durations — the longer one wins", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("bleeding", 5, "b");
    expect(set.get("bleeding")?.remainingSeconds).toBe(10);
    expect(set.get("bleeding")?.sourceId).toBe("a");
  });

  it("refreshes to a longer incoming duration", () => {
    const set = new StatusSet();
    set.apply("bleeding", 5, "a");
    set.apply("bleeding", 20, "b");
    expect(set.get("bleeding")?.remainingSeconds).toBe(20);
    expect(set.get("bleeding")?.sourceId).toBe("b");
  });

  it("removes a single status by id", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    expect(set.remove("bleeding")).toBe(true);
    expect(set.has("bleeding")).toBe(false);
    expect(set.remove("bleeding")).toBe(false);
  });

  it("counts statuses by category", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("burning", 10, "a");
    set.apply("regeneration", 10, "a");
    expect(set.countByCategory("condition")).toBe(2);
    expect(set.countByCategory("enchantment")).toBe(1);
    expect(set.countByCategory("hex")).toBe(0);
  });

  it("removes up to N statuses of one category, leaving other categories alone", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("burning", 10, "a");
    set.apply("poison", 10, "a");
    set.apply("regeneration", 10, "a");

    const removed = set.removeByCategory("condition", 2);
    expect(removed).toHaveLength(2);
    expect(set.countByCategory("condition")).toBe(1);
    expect(set.has("regeneration")).toBe(true);
  });

  it("removes every status of a category when no count is given", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("burning", 10, "a");
    set.apply("regeneration", 10, "a");
    expect(set.removeByCategory("condition")).toHaveLength(2);
    expect(set.countByCategory("condition")).toBe(0);
    expect(set.countByCategory("enchantment")).toBe(1);
  });

  it("removing from an empty category is harmless", () => {
    const set = new StatusSet();
    expect(set.removeByCategory("hex", 3)).toEqual([]);
  });
});

describe("StatusSet duration advance", () => {
  it("counts durations down", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.advance(3);
    expect(set.get("bleeding")?.remainingSeconds).toBeCloseTo(7, 10);
  });

  it("expires a status once its duration elapses and reports it", () => {
    const set = new StatusSet();
    set.apply("bleeding", 1, "a");
    expect(set.advance(1.5)).toEqual(["bleeding"]);
    expect(set.has("bleeding")).toBe(false);
  });

  it("expires several at once", () => {
    const set = new StatusSet();
    set.apply("bleeding", 1, "a");
    set.apply("burning", 1, "a");
    set.apply("poison", 10, "a");
    const expired = set.advance(2);
    expect(expired.sort()).toEqual(["bleeding", "burning"]);
    expect(set.has("poison")).toBe(true);
  });

  it("reports nothing when nothing expires", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    expect(set.advance(1)).toEqual([]);
  });
});

describe("aggregateModifiers", () => {
  it("returns neutral modifiers for no statuses", () => {
    const mods = aggregateModifiers([]);
    expect(mods.healthPerSecond).toBe(0);
    expect(mods.armorModifier).toBe(0);
    expect(mods.moveSpeedMultiplier).toBe(1);
    expect(mods.attackMissChance).toBe(0);
    expect(mods.maxHealthMultiplier).toBe(1);
    expect(mods.castTimeMultiplier).toBe(1);
  });

  it("sums additive health degeneration from stacked conditions", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("poison", 10, "a");
    const mods = aggregateModifiers(set.active);
    expect(mods.healthPerSecond).toBe(
      getStatusDefinition("bleeding").healthPerSecond +
        getStatusDefinition("poison").healthPerSecond,
    );
  });

  it("lets a regeneration enchantment offset a degenerating condition", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("regeneration", 10, "a");
    // -3 + 4 = +1: the heal wins, which is exactly the counterplay a
    // regeneration skill is supposed to provide.
    expect(aggregateModifiers(set.active).healthPerSecond).toBeGreaterThan(0);
  });

  it("sums armor modifiers, including a negative one", () => {
    const set = new StatusSet();
    set.apply("armor-boost", 10, "a");
    set.apply("weakness", 10, "a");
    expect(aggregateModifiers(set.active).armorModifier).toBe(24 - 20);
  });

  it("multiplies movement penalties rather than summing them", () => {
    const set = new StatusSet();
    set.apply("crippled", 10, "a");
    const mods = aggregateModifiers(set.active);
    expect(mods.moveSpeedMultiplier).toBe(0.5);
  });

  it("takes the worst miss chance rather than compounding it", () => {
    const set = new StatusSet();
    set.apply("blind", 10, "a");
    expect(aggregateModifiers(set.active).attackMissChance).toBe(
      getStatusDefinition("blind").attackMissChance,
    );
  });
});
