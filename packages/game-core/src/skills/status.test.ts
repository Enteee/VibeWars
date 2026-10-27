import { describe, expect, it } from "vitest";

import {
  MAX_PIPS,
  STATUS_DEFINITIONS,
  StatusSet,
  aggregateModifiers,
  clampPips,
  getStatusDefinition,
  type StatusId,
} from "./status.js";
import { withAttackDuration } from "./testing.js";

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
        def.healthPips !== 0 ||
        def.healthPipsPerEnchantment !== undefined ||
        def.preventsKnockdown ||
        def.energyPips !== 0 ||
        def.armorModifier !== 0 ||
        def.armorReduction !== undefined ||
        def.moveSpeedMultiplier !== 1 ||
        def.attackMissChance !== 0 ||
        def.maxHealthLoss !== undefined ||
        def.healingMultiplier !== 1 ||
        def.weaponDamageMultiplier !== 1 ||
        def.attributeDelta !== 0 ||
        def.castTimeMultiplier !== 1 ||
        def.interruptsSpells ||
        def.attackDurationMultiplier !== 1 ||
        def.block !== undefined ||
        def.onAttackHit.length > 0 ||
        def.triggers.length > 0 ||
        def.nextSpells !== undefined ||
        def.nextAttackSkill !== undefined ||
        def.spellRechargeFaster !== 0;
      expect(hasEffect, `${id} has no mechanical effect`).toBe(true);
    }
  });

  it("keeps each condition's mechanical identity distinct", () => {
    // Burning should drain faster than bleeding — if these ever converge,
    // the two conditions stop being meaningfully different choices.
    expect(getStatusDefinition("burning").healthPips).toBeLessThan(
      getStatusDefinition("bleeding").healthPips,
    );
    expect(getStatusDefinition("crippled").moveSpeedMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("blind").attackMissChance).toBeGreaterThan(0.5);
    expect(getStatusDefinition("deep-wound").maxHealthLoss?.fraction).toBeGreaterThan(0);
    expect(getStatusDefinition("deep-wound").healingMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("dazed").castTimeMultiplier).toBeGreaterThan(1);
    expect(getStatusDefinition("weakness")).toMatchObject({
      weaponDamageMultiplier: 0.34,
      attributeDelta: -1,
      armorModifier: 0,
    });
  });

  it("counts health in GW1's pips", () => {
    expect(
      Object.fromEntries(
        ALL_STATUS_IDS.filter((id) => getStatusDefinition(id).healthPips !== 0).map((id) => [
          id,
          getStatusDefinition(id).healthPips,
        ]),
      ),
    ).toEqual({
      bleeding: -3,
      burning: -7,
      poison: -4,
      disease: -4,
      faintheartedness: -2,
      "parasitic-bond": -1,
      mending: 3,
      regeneration: 4,
      "weapon-of-warding": 4,
      "never-surrender": 4,
    });
  });

  it("counts energy in GW1's pips", () => {
    expect(
      Object.fromEntries(
        ALL_STATUS_IDS.filter((id) => getStatusDefinition(id).energyPips !== 0).map((id) => [
          id,
          getStatusDefinition(id).energyPips,
        ]),
      ),
    ).toEqual({ malaise: -1, "blood-ritual": 3 });
  });

  it("makes enchantments beneficial and hexes/conditions detrimental", () => {
    expect(getStatusDefinition("regeneration").healthPips).toBeGreaterThan(0);
    expect(getStatusDefinition("armor-boost").armorModifier).toBeGreaterThan(0);
    expect(getStatusDefinition("faintheartedness").healthPips).toBeLessThan(0);
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

  it("removes the newest first, so a cheap one covers an older one (#521)", () => {
    const set = new StatusSet();
    set.apply("guardian", 10, "a");
    set.apply("regeneration", 10, "a");
    expect(set.removeByCategory("enchantment", 1)).toEqual(["regeneration"]);
    expect(set.has("guardian")).toBe(true);
  });

  it("counts a re-application as the newest, whichever duration wins (#521)", () => {
    for (const duration of [5, 20]) {
      const set = new StatusSet();
      set.apply("guardian", 10, "a");
      set.apply("regeneration", 10, "a");
      set.apply("guardian", duration, "a");
      expect(set.removeByCategory("enchantment", 1), String(duration)).toEqual(["guardian"]);
    }
  });
});

describe("StatusSet removal by profession (#845)", () => {
  it("takes the newest of that profession's, past a newer one of another", () => {
    const set = new StatusSet();
    set.apply("mystic-regeneration", 10, "a");
    set.apply("fleeting-stability", 10, "a");
    set.apply("guardian", 10, "b");
    expect(set.removeByCategory("enchantment", 1, "dervish")).toEqual(["fleeting-stability"]);
    expect(set.has("mystic-regeneration")).toBe(true);
    expect(set.has("guardian")).toBe(true);
  });

  it("takes nothing when only another profession's are up", () => {
    const set = new StatusSet();
    set.apply("guardian", 10, "b");
    set.apply("regeneration", 10, "b");
    expect(set.removeByCategory("enchantment", 1, "dervish")).toEqual([]);
    expect(set.countByCategory("enchantment")).toBe(2);
  });

  it("ends what ends on a prevented knockdown, and nothing else", () => {
    const set = new StatusSet();
    set.apply("fleeting-stability", 10, "a");
    set.apply("mystic-regeneration", 10, "a");
    expect(set.endOnKnockdownPrevented()).toEqual(["fleeting-stability"]);
    expect(set.has("mystic-regeneration")).toBe(true);
    expect(set.endOnKnockdownPrevented()).toEqual([]);
  });
});

describe("StatusSet durationSeconds (#803)", () => {
  const order = (set: StatusSet) => set.active.map((status) => status.id);

  it("is the applied duration, and stays as the time runs down", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.advance(4);
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 6, durationSeconds: 10 });
  });

  it("restarts at a longer refresh, which moves to the end", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("burning", 5, "a");
    set.advance(4);
    set.apply("bleeding", 8, "b");
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 8, durationSeconds: 8 });
    expect(order(set)).toEqual(["burning", "bleeding"]);
  });

  it("keeps its length through a shorter refresh, which still moves to the end", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("burning", 5, "a");
    set.apply("bleeding", 3, "b");
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 10, durationSeconds: 10 });
    expect(order(set)).toEqual(["burning", "bleeding"]);
  });

  it("is the caught duration, and a catch never leaves more time than length (#765)", () => {
    const outbreak = { infected: new Set<string>() };
    const fresh = new StatusSet();
    fresh.catch("disease", 7, "a", outbreak);
    expect(fresh.get("disease")).toMatchObject({ remainingSeconds: 7, durationSeconds: 7 });

    const set = new StatusSet();
    set.apply("disease", 10, "a");
    set.advance(6);
    set.catch("disease", 8, "b", outbreak);
    expect(set.get("disease")).toMatchObject({ remainingSeconds: 8, durationSeconds: 10 });
    set.catch("disease", 12, "b", outbreak);
    expect(set.get("disease")).toMatchObject({ remainingSeconds: 12, durationSeconds: 12 });
  });
});

describe("StatusSet stances, one at a time (#523)", () => {
  it("a new stance ends the one that is up", () => {
    const set = new StatusSet();
    set.apply("sprint", 13, "a");
    set.apply("dash", 3, "a");
    expect(set.active.map((status) => status.id)).toEqual(["dash"]);
  });

  it("the same stance again restarts at its full duration, shorter or not", () => {
    const set = new StatusSet();
    set.apply("sprint", 13, "a");
    set.advance(10);
    set.apply("sprint", 13, "a");
    expect(set.get("sprint")?.remainingSeconds).toBe(13);
    set.apply("sprint", 5, "a");
    expect(set.get("sprint")?.remainingSeconds).toBe(5);
  });

  it("leaves the other categories alone, and they leave it alone", () => {
    const set = new StatusSet();
    set.apply("regeneration", 10, "a");
    set.apply("bleeding", 10, "b");
    set.apply("sprint", 13, "a");
    set.apply("dash", 3, "a");
    expect(set.countByCategory("enchantment")).toBe(1);
    expect(set.countByCategory("condition")).toBe(1);
    set.removeByCategory("enchantment");
    expect(set.has("dash")).toBe(true);
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

describe("StatusSet changes, for the triggers (#887)", () => {
  it("records a condition newly on the bearer, not its refresh", () => {
    const set = new StatusSet();
    set.apply("burning", 5, "a");
    set.apply("burning", 8, "b");
    set.apply("burning", 2, "c");
    expect(set.drainChanges()).toEqual([
      { kind: "gained-condition", id: "burning", durationSeconds: 5 },
    ]);
    expect(set.drainChanges()).toEqual([]);
  });

  it("records no gained condition for a hex, an enchantment or a stance", () => {
    const set = new StatusSet();
    set.apply("faintheartedness", 5, "a");
    set.apply("regeneration", 5, "a");
    set.apply("sprint", 5, "a");
    expect(set.drainChanges()).toEqual([]);
  });

  it("records a condition caught from an outbreak, once (#765)", () => {
    const set = new StatusSet();
    const outbreak = { infected: new Set<string>() };
    set.catch("disease", 6, "a", outbreak);
    set.catch("disease", 9, "a", outbreak);
    expect(set.drainChanges()).toEqual([
      { kind: "gained-condition", id: "disease", durationSeconds: 6 },
    ]);
  });

  it("records every ending with its source", () => {
    const set = new StatusSet();
    set.apply("parasitic-bond", 1, "expiry");
    set.apply("backfire", 10, "removed");
    set.apply("malaise", 10, "by-category");
    set.apply("watch-yourself", 10, "attacked");
    set.apply("glyph-of-lesser-energy", 10, "spells");
    set.apply("weapon-of-warding", 10, "attacks");
    set.apply("fleeting-stability", 10, "knockdown");
    set.drainChanges();

    set.advance(1);
    set.remove("backfire");
    set.removeByCategory("hex");
    for (let attack = 0; attack < 3; attack += 1) {
      set.countIncomingAttack();
    }
    set.countSpellStarted();
    set.countSpellStarted();
    set.endOnBearerAttack();
    set.endOnKnockdownPrevented();

    expect(set.drainChanges()).toEqual([
      { kind: "ended", id: "parasitic-bond", sourceId: "expiry" },
      { kind: "ended", id: "backfire", sourceId: "removed" },
      { kind: "ended", id: "malaise", sourceId: "by-category" },
      { kind: "ended", id: "watch-yourself", sourceId: "attacked" },
      { kind: "ended", id: "glyph-of-lesser-energy", sourceId: "spells" },
      { kind: "ended", id: "weapon-of-warding", sourceId: "attacks" },
      { kind: "ended", id: "fleeting-stability", sourceId: "knockdown" },
    ]);
  });

  it("ends every status on a death, each recorded with its source, in order (#940)", () => {
    const set = new StatusSet();
    set.apply("burning", 5, "a");
    set.apply("parasitic-bond", 10, "b");
    set.apply("regeneration", 10, "c");
    set.apply("sprint", 8, "d");
    set.drainChanges();

    set.endAll();

    expect(set.active).toEqual([]);
    expect(set.drainChanges()).toEqual([
      { kind: "ended", id: "burning", sourceId: "a" },
      { kind: "ended", id: "parasitic-bond", sourceId: "b" },
      { kind: "ended", id: "regeneration", sourceId: "c" },
      { kind: "ended", id: "sprint", sourceId: "d" },
    ]);
  });

  it("records nothing for a reset, or a removal of what is not there", () => {
    const set = new StatusSet();
    set.apply("parasitic-bond", 10, "a");
    set.drainChanges();
    set.clear();
    set.remove("parasitic-bond");
    expect(set.drainChanges()).toEqual([]);
  });
});

describe("clampPips", () => {
  it("clamps a net pip count to 10 either way", () => {
    expect(clampPips(0)).toBe(0);
    expect(clampPips(7)).toBe(7);
    expect(clampPips(-10)).toBe(-10);
    expect(clampPips(10)).toBe(10);
    expect(clampPips(-14)).toBe(-MAX_PIPS);
    expect(clampPips(23)).toBe(MAX_PIPS);
  });
});

describe("aggregateModifiers, health per enchantment (#845)", () => {
  const pips = (ids: StatusId[]): number =>
    aggregateModifiers(ids.map((id) => ({ id }))).healthPips;

  it("counts every enchantment, itself included, at most 3", () => {
    expect(pips([])).toBe(0);
    expect(pips(["mystic-regeneration"])).toBe(3);
    expect(pips(["mystic-regeneration", "guardian", "fleeting-stability"])).toBe(9);
    expect(pips(["mystic-regeneration", "guardian", "fleeting-stability", "armor-boost"])).toBe(9);
  });

  it("counts no condition, hex or stance, and adds to their pips", () => {
    expect(pips(["mystic-regeneration", "bleeding", "malaise", "heart-of-fury"])).toBe(3 - 3);
  });

  it("is clamped with the rest at MAX_PIPS", () => {
    expect(
      clampPips(pips(["mystic-regeneration", "regeneration", "guardian", "weapon-of-warding"])),
    ).toBe(MAX_PIPS);
  });
});

describe("aggregateModifiers", () => {
  it("returns neutral modifiers for no statuses", () => {
    const mods = aggregateModifiers([]);
    expect(mods.healthPips).toBe(0);
    expect(mods.energyPips).toBe(0);
    expect(mods.armorModifier).toBe(0);
    expect(mods.moveSpeedMultiplier).toBe(1);
    expect(mods.attackMissChance).toBe(0);
    expect(mods.maxHealthLoss).toBeUndefined();
    expect(mods.healingMultiplier).toBe(1);
    expect(mods.castTimeMultiplier).toBe(1);
  });

  it("sums additive health degeneration from stacked conditions", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("poison", 10, "a");
    const mods = aggregateModifiers(set.active);
    expect(mods.healthPips).toBe(
      getStatusDefinition("bleeding").healthPips + getStatusDefinition("poison").healthPips,
    );
  });

  it("lets a regeneration enchantment offset a degenerating condition", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a");
    set.apply("regeneration", 10, "a");
    // -3 + 4 = +1: the heal wins, which is exactly the counterplay a
    // regeneration skill is supposed to provide.
    expect(aggregateModifiers(set.active).healthPips).toBeGreaterThan(0);
  });

  it("sums armor modifiers, including a negative one", () => {
    const set = new StatusSet();
    set.apply("armor-boost", 10, "a");
    set.apply("healing-signet-armor", 10, "a");
    expect(aggregateModifiers(set.active).armorModifier).toBe(24 - 40);
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

describe("attack duration (ADR-0029)", () => {
  function multiplierWith(statuses: Partial<Record<StatusId, number>>): number {
    return withAttackDuration(statuses, () => {
      const set = new StatusSet();
      for (const id of Object.keys(statuses)) {
        set.apply(id as StatusId, 10, "a");
      }
      return aggregateModifiers(set.active).attackDurationMultiplier;
    });
  }

  it("is 1 with nothing on; Faintheartedness (#493) and Shadow of Fear (#918) are 50% slower, Heart of Fury 25% faster (#845), Frenzy 33% (#919)", () => {
    expect(aggregateModifiers([]).attackDurationMultiplier).toBe(1);
    const multipliers: Partial<Record<StatusId, number>> = {
      faintheartedness: 1.5,
      "heart-of-fury": 0.75,
      "shadow-of-fear": 1.5,
      frenzy: 0.67,
    };
    for (const id of ALL_STATUS_IDS) {
      const expected = multipliers[id] ?? 1;
      expect(getStatusDefinition(id).attackDurationMultiplier, id).toBe(expected);
    }
  });

  it("Heart of Fury and Faintheartedness multiply (#845)", () => {
    expect(
      aggregateModifiers([{ id: "heart-of-fury" }, { id: "faintheartedness" }])
        .attackDurationMultiplier,
    ).toBeCloseTo(0.75 * 1.5);
  });

  it("takes only the strongest speed-up", () => {
    expect(multiplierWith({ bleeding: 0.67 })).toBe(0.67);
    expect(multiplierWith({ bleeding: 0.67, poison: 0.75 })).toBe(0.67);
  });

  it("multiplies the strongest speed-up by the strongest slow-down", () => {
    expect(multiplierWith({ bleeding: 0.67, poison: 1.2 })).toBeCloseTo(0.804, 9);
    expect(multiplierWith({ bleeding: 0.67, poison: 1.2, burning: 1.1 })).toBeCloseTo(0.804, 9);
  });

  it("leaves the table as it was", () => {
    expect(getStatusDefinition("bleeding").attackDurationMultiplier).toBe(1);
  });
});

describe("StatusSet.countIncomingAttack (#524)", () => {
  it("ends a status after its endsAfterAttacks, and leaves the others", () => {
    const set = new StatusSet();
    set.apply("watch-yourself", 10, "w");
    set.apply("guardian", 10, "m");
    expect(set.countIncomingAttack()).toEqual([]);
    expect(set.countIncomingAttack()).toEqual([]);
    expect(set.countIncomingAttack()).toEqual(["watch-yourself"]);
    expect(set.has("watch-yourself")).toBe(false);
    expect(set.has("guardian")).toBe(true);
  });

  it("starts the count again when the status is applied anew", () => {
    const set = new StatusSet();
    set.apply("watch-yourself", 5, "w");
    set.countIncomingAttack();
    set.countIncomingAttack();
    set.apply("watch-yourself", 10, "w");
    expect(set.get("watch-yourself")?.attacksLeft).toBe(3);
  });
});
