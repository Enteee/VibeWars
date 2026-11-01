import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";

import { getSkill } from "./catalog.js";
import {
  NO_RANKS,
  combinedHealingMultiplier,
  HEALING_MULTIPLIER_FLOOR,
  HEALTH_PER_PIP,
} from "./status.js";
import {
  advanceStatuses,
  attackMissChanceOf,
  clampMoveSpeed,
  effectiveActivationSeconds,
  effectiveMaxHealth,
  healingMultiplierOf,
  moveSpeedMultiplier,
  raisedMaxHealth,
  rankOf,
} from "./tick.js";
import { effectiveMaxEnergy, raisedMaxEnergy } from "./overcast.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

describe("advanceStatuses health change", () => {
  it("applies degeneration continuously, not in once-per-second lumps", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a", NO_RANKS); // -3 pips, 6 HP/s
    advanceStatuses(c, 0.05, 0); // one 20Hz tick
    expect(c.health).toBeCloseTo(500 - 6 * 0.05, 10);
  });

  it("accumulates degeneration correctly across many ticks", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a", NO_RANKS);
    for (let i = 0; i < 20; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBeCloseTo(494, 6);
  });

  it("counts a pip as 2 HP/s: +4 regeneration heals 8 a second", () => {
    const c = makeCombatant({ id: "c", health: 100 });
    c.statuses.apply("regeneration", 10, "a", NO_RANKS);
    advanceStatuses(c, 1, 0);
    expect(c.health).toBeCloseTo(100 + 4 * HEALTH_PER_PIP, 10);
  });

  it("clamps stacked degeneration to 10 pips: burning, bleeding and poison (-14) drain 20 HP/s", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("burning", 10, "a", NO_RANKS);
    c.statuses.apply("bleeding", 10, "a", NO_RANKS);
    c.statuses.apply("poison", 10, "a", NO_RANKS);
    advanceStatuses(c, 1, 0);
    expect(c.health).toBeCloseTo(480, 10);
  });

  it("does nothing when regeneration cancels degeneration: +4 against poison's -4", () => {
    const c = makeCombatant({ id: "c", health: 300 });
    c.statuses.apply("regeneration", 10, "a", NO_RANKS);
    c.statuses.apply("poison", 10, "a", NO_RANKS);
    const events = advanceStatuses(c, 1, 0);
    expect(c.health).toBe(300);
    expect(events.some((e) => e.kind === "damage" || e.kind === "heal")).toBe(false);
  });

  it("applies regeneration up to, but never past, maximum health", () => {
    const c = makeCombatant({ id: "c", health: 498, maxHealth: 500 });
    c.statuses.apply("regeneration", 10, "a", NO_RANKS); // +4 pips, 8 HP/s
    for (let i = 0; i < 40; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBe(500);
  });

  it("kills a combatant whose degeneration reaches zero health", () => {
    const c = makeCombatant({ id: "c", health: 1 });
    c.statuses.apply("burning", 10, "a", NO_RANKS);
    const events = advanceStatuses(c, 1, 0);
    expect(c.dead).toBe(true);
    expect(c.health).toBe(0);
    expect(events).toContainEqual({ kind: "death", targetId: "c" });
  });

  it("emits a damage event for degeneration and a heal event for regeneration", () => {
    const bleeding = makeCombatant({ id: "b", health: 500 });
    bleeding.statuses.apply("bleeding", 10, "a", NO_RANKS);
    expect(advanceStatuses(bleeding, 1, 0).some((e) => e.kind === "damage")).toBe(true);

    const regen = makeCombatant({ id: "r", health: 100 });
    regen.statuses.apply("regeneration", 10, "a", NO_RANKS);
    expect(advanceStatuses(regen, 1, 0).some((e) => e.kind === "heal")).toBe(true);
  });

  it("does nothing at all for a dead combatant", () => {
    const c = makeCombatant({ id: "c", health: 0, dead: true });
    c.statuses.apply("bleeding", 10, "a", NO_RANKS);
    expect(advanceStatuses(c, 1, 0)).toEqual([]);
  });

  it("emits no health event when no status changes health", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("crippled", 10, "a", NO_RANKS);
    const events = advanceStatuses(c, 1, 0);
    expect(events.some((e) => e.kind === "damage" || e.kind === "heal")).toBe(false);
  });
});

describe("advanceStatuses expiry", () => {
  it("emits status-expired when a status runs out", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("bleeding", 1, "a", NO_RANKS);
    const events = advanceStatuses(c, 1.5, 0);
    expect(events).toContainEqual({
      kind: "status-expired",
      targetId: "c",
      statusId: "bleeding",
    });
    expect(c.statuses.has("bleeding")).toBe(false);
  });

  it("stops degeneration once the condition expires", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 1, "a", NO_RANKS);
    advanceStatuses(c, 1, 0);
    const healthAfterExpiry = c.health;
    advanceStatuses(c, 5, 0);
    expect(c.health).toBe(healthAfterExpiry);
  });
});

describe("effectiveMaxHealth", () => {
  it("is the raw maximum with no statuses", () => {
    expect(effectiveMaxHealth(makeCombatant({ id: "c", maxHealth: 500 }))).toBe(500);
  });

  it("is reduced by deep wound: 20% of the maximum, at most 100", () => {
    const small = makeCombatant({ id: "c", maxHealth: 480 });
    small.statuses.apply("deep-wound", 10, "a", NO_RANKS);
    expect(effectiveMaxHealth(small)).toBe(384);
    const large = makeCombatant({ id: "c", maxHealth: 600 });
    large.statuses.apply("deep-wound", 10, "a", NO_RANKS);
    expect(effectiveMaxHealth(large)).toBe(500);
  });

  it("adds a raised maximum before deep wound's cut (#1359)", () => {
    const c = makeCombatant({ id: "c", maxHealth: 200 });
    c.statuses.apply("endure-pain", 16, "c", new Map([["warrior.strength", 12]]));
    expect(effectiveMaxHealth(c)).toBe(458);
    expect(raisedMaxHealth(c)).toBe(458);
    c.statuses.apply("deep-wound", 10, "a", NO_RANKS);
    // 20% of 458, not of 200, and under the cap of 100.
    expect(effectiveMaxHealth(c)).toBeCloseTo(366.4);
    expect(raisedMaxHealth(c)).toBe(458);
  });

  it("comes back whole when deep wound ends", () => {
    const c = makeCombatant({ id: "c", maxHealth: 480 });
    c.statuses.apply("deep-wound", 10, "a", NO_RANKS);
    c.statuses.remove("deep-wound");
    expect(effectiveMaxHealth(c)).toBe(480);
  });

  it("caps regeneration at the deep-wound-reduced maximum, not the raw one", () => {
    const c = makeCombatant({ id: "c", health: 390, maxHealth: 500 });
    c.statuses.apply("deep-wound", 100, "a", NO_RANKS);
    c.statuses.apply("regeneration", 100, "a", NO_RANKS);
    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBeLessThanOrEqual(400);
  });
});

describe("healingMultiplierOf", () => {
  it("is 1 with no status, and 0.8 while deep-wounded", () => {
    const c = makeCombatant({ id: "c" });
    expect(healingMultiplierOf(c)).toBe(1);
    c.statuses.apply("deep-wound", 10, "a", NO_RANKS);
    expect(healingMultiplierOf(c)).toBe(0.8);
  });

  it("multiplies reductions, never below 60%", () => {
    // A hypothetical second reduction: only deep wound reduces healing today.
    expect(combinedHealingMultiplier([0.8, 0.9])).toBeCloseTo(0.72, 10);
    expect(combinedHealingMultiplier([0.8, 0.5])).toBe(HEALING_MULTIPLIER_FLOOR);
    expect(HEALING_MULTIPLIER_FLOOR).toBe(0.6);
  });
});

describe("moveSpeedMultiplier", () => {
  it("is full speed with no status, and half while crippled", () => {
    const c = makeCombatant({ id: "c" });
    expect(moveSpeedMultiplier(c)).toBe(1);
    c.statuses.apply("crippled", 10, "a", NO_RANKS);
    expect(moveSpeedMultiplier(c)).toBe(0.5);
  });

  it("multiplies crippled with Armor of Earth's slow", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("crippled", 10, "a", NO_RANKS);
    c.statuses.apply("armor-boost", 10, "c", NO_RANKS);
    expect(moveSpeedMultiplier(c)).toBe(0.375);
  });

  it("clamps to [0.25, 1.33]", () => {
    expect(clampMoveSpeed(0.1)).toBe(0.25);
    expect(clampMoveSpeed(0.25)).toBe(0.25);
    expect(clampMoveSpeed(0.8)).toBe(0.8);
    expect(clampMoveSpeed(2)).toBe(1.33);
  });
});

describe("effectiveActivationSeconds", () => {
  const fireball = getSkill("elementalist.fireball");
  const swiftChop = getSkill("warrior.swift-chop");

  it("is the skill's own cast time when not dazed", () => {
    const c = makeCombatant({ id: "c" });
    expect(fireball && effectiveActivationSeconds(fireball, c)).toBe(fireball?.activationSeconds);
  });

  it("doubles while dazed", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("dazed", 10, "a", NO_RANKS);
    expect(fireball && effectiveActivationSeconds(fireball, c)).toBe(
      (fireball?.activationSeconds ?? 0) * 2,
    );
  });

  it("leaves an instant skill instant while dazed", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("dazed", 10, "a", NO_RANKS);
    expect(swiftChop?.activationSeconds).toBe(0);
    expect(swiftChop && effectiveActivationSeconds(swiftChop, c)).toBe(0);
  });
});

describe("attackMissChanceOf", () => {
  it("is 0 unblinded and 0.9 blind", () => {
    const c = makeCombatant({ id: "c" });
    expect(attackMissChanceOf(c)).toBe(0);
    c.statuses.apply("blind", 10, "a", NO_RANKS);
    expect(attackMissChanceOf(c)).toBe(0.9);
  });
});

describe("death by degeneration", () => {
  it("emits a death event that a caller can react to, without re-reading the flag", () => {
    // This is the exact shape the match room depends on: it keys its
    // "cancel the cast and start the respawn timer" branch off this
    // event, because TypeScript's narrowing would otherwise claim the
    // branch is unreachable after an earlier `dead` check.
    const c = makeCombatant({ id: "c", health: 2 });
    c.statuses.apply("burning", 10, "a", NO_RANKS);

    const events = advanceStatuses(c, 1, 0);

    expect(events.some((e) => e.kind === "death")).toBe(true);
    expect(c.dead).toBe(true);
  });

  it("emits no death event on a tick that merely damages", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("burning", 10, "a", NO_RANKS);
    expect(advanceStatuses(c, 1, 0).some((e) => e.kind === "death")).toBe(false);
  });
});

describe("effectiveActivationSeconds with Fast Casting (#527)", () => {
  const malaise = getSkill("necromancer.malaise");
  const faintheartedness = getSkill("necromancer.faintheartedness");
  const swiftChop = getSkill("warrior.swift-chop");
  if (malaise === undefined || faintheartedness === undefined || swiftChop === undefined) {
    throw new Error("catalog skill missing");
  }
  // No Mesmer spell is in the catalog yet: a 1 s hex of the Mesmer's.
  const mesmerHex: Skill = { ...malaise, profession: "mesmer", activationSeconds: 1 };
  const mesmer = (): Combatant =>
    makeCombatant({ id: "c", attributeRanks: new Map([["mesmer.fast-casting", 12]]) });

  it("casts a 2 s non-Mesmer spell in 1.149 s at rank 12", () => {
    expect(malaise.activationSeconds).toBe(2);
    expect(effectiveActivationSeconds(malaise, mesmer())).toBeCloseTo(1.149, 3);
  });

  it("leaves a 1 s non-Mesmer spell alone", () => {
    expect(faintheartedness.activationSeconds).toBe(1);
    expect(effectiveActivationSeconds(faintheartedness, mesmer())).toBe(1);
  });

  it("speeds a 1 s Mesmer spell to ×0.574", () => {
    expect(effectiveActivationSeconds(mesmerHex, mesmer())).toBeCloseTo(0.574, 3);
  });

  it("composes with dazed: ×1.149", () => {
    const c = mesmer();
    c.statuses.apply("dazed", 10, "a", NO_RANKS);
    expect(effectiveActivationSeconds(mesmerHex, c)).toBeCloseTo(1.149, 3);
  });

  it("casts a 3 s Resurrection Signet in 1.92 s at rank 12, dazed or not (#1100)", () => {
    const signet = getSkill("common.resurrection-signet");
    if (signet === undefined) {
      throw new Error("catalog skill missing");
    }
    expect(signet.activationSeconds).toBe(3);
    const c = mesmer();
    expect(effectiveActivationSeconds(signet, c)).toBeCloseTo(1.92, 9);
    c.statuses.apply("dazed", 10, "a", NO_RANKS);
    expect(effectiveActivationSeconds(signet, c)).toBeCloseTo(1.92, 9);
  });

  it("leaves an attack skill and a rank-0 caster alone", () => {
    expect(effectiveActivationSeconds(swiftChop, mesmer())).toBe(0);
    const slowAttack: Skill = { ...swiftChop, profession: "mesmer", activationSeconds: 2 };
    expect(effectiveActivationSeconds(slowAttack, mesmer())).toBe(2);
    expect(effectiveActivationSeconds(mesmerHex, makeCombatant({ id: "c" }))).toBe(1);
  });
});

describe("rankOf (#762)", () => {
  /** Swordsmanship 12, Tactics 0, and Strength 0 bought plus 1 from a rune. */
  const warrior = (): Combatant =>
    makeCombatant({
      id: "w",
      attributeRanks: new Map([
        ["warrior.swordsmanship", 12],
        ["warrior.tactics", 0],
        ["warrior.strength", 1],
        ["warrior.axe-mastery", 4],
      ]),
      equipment: {
        ...unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
        attributeBonuses: new Map([
          ["warrior.strength", 1],
          ["warrior.axe-mastery", 3],
        ]),
      },
    });

  it("is the sheet's rank, runes included, with nothing on", () => {
    const w = warrior();
    expect(rankOf(w, "warrior.swordsmanship")).toBe(12);
    expect(rankOf(w, "warrior.strength")).toBe(1);
    expect(rankOf(w, "warrior.axe-mastery")).toBe(4);
    expect(rankOf(w, "warrior.hammer-mastery")).toBe(0);
  });

  it("is one lower under weakness, but a rank bought at 0 stays, rune or not", () => {
    const w = warrior();
    w.statuses.apply("weakness", 10, "necro", NO_RANKS);
    expect(rankOf(w, "warrior.swordsmanship")).toBe(11);
    expect(rankOf(w, "warrior.tactics")).toBe(0);
    expect(rankOf(w, "warrior.hammer-mastery")).toBe(0);
    expect(rankOf(w, "warrior.strength")).toBe(1);
    // 1 bought and 3 from a rune: the bought rank is above 0, so it drops.
    expect(rankOf(w, "warrior.axe-mastery")).toBe(3);
  });
});

describe("rankOf with scoped boosts (#1941)", () => {
  /** A Ranger/Elementalist: Marksmanship 10, Fire 8, Water 0 bought, Expertise 0. */
  const archer = (): Combatant =>
    makeCombatant({
      id: "r",
      attributeRanks: new Map([
        ["ranger.marksmanship", 10],
        ["ranger.expertise", 0],
        ["elementalist.fire-magic", 8],
        ["elementalist.water-magic", 0],
        ["elementalist.energy-storage", 6],
        ["ritualist.spawning-power", 9],
        ["ritualist.channeling-magic", 3],
      ]),
    });

  it("raises one attribute: Expert's Dexterity's Marksmanship", () => {
    const r = archer();
    r.statuses.apply("experts-dexterity", 16, "r", NO_RANKS);
    expect(rankOf(r, "ranger.marksmanship")).toBe(11);
    expect(rankOf(r, "ranger.expertise")).toBe(0);
  });

  it("raises the elemental ones of a secondary Elementalist, a bought 0 too", () => {
    const r = archer();
    r.statuses.apply("glyph-of-elemental-power", 25, "r", NO_RANKS);
    expect(rankOf(r, "elementalist.fire-magic")).toBe(10);
    expect(rankOf(r, "elementalist.water-magic")).toBe(2);
    expect(rankOf(r, "elementalist.energy-storage")).toBe(6);
    expect(rankOf(r, "ranger.marksmanship")).toBe(10);
  });

  it("raises a profession's attributes, whatever the bearer's: Ritual Lord's", () => {
    const r = archer();
    r.statuses.apply("ritual-lord", 29, "r", NO_RANKS);
    expect(rankOf(r, "ritualist.spawning-power")).toBe(13);
    expect(rankOf(r, "ritualist.channeling-magic")).toBe(7);
    expect(rankOf(r, "elementalist.fire-magic")).toBe(8);
  });

  it("sums a boost with Weakness, which is still −1 to all", () => {
    const r = archer();
    r.statuses.apply("glyph-of-elemental-power", 25, "r", NO_RANKS);
    r.statuses.apply("weakness", 10, "foe", NO_RANKS);
    expect(rankOf(r, "elementalist.fire-magic")).toBe(9);
    expect(rankOf(r, "ranger.marksmanship")).toBe(9);
    // A net boost raises the bought 0; Weakness alone leaves it.
    expect(rankOf(r, "elementalist.water-magic")).toBe(1);
    expect(rankOf(r, "ranger.expertise")).toBe(0);
  });

  it("holds one glyph at a time: the newest replaces the older", () => {
    const r = archer();
    r.statuses.apply("glyph-of-elemental-power", 25, "r", NO_RANKS);
    r.statuses.apply("glyph-of-energy", Number.POSITIVE_INFINITY, "r", NO_RANKS);
    expect(rankOf(r, "elementalist.fire-magic")).toBe(10);
  });

  it("counts the deltas a resolving skill holds", () => {
    const r = archer();
    r.heldAttributeDeltas = [{ scope: "elemental", amount: 2 }];
    expect(rankOf(r, "elementalist.fire-magic")).toBe(10);
  });

  it("gives way to a set rank: Master of Magic beats a boost", () => {
    const r = archer();
    r.statuses.apply("glyph-of-elemental-power", 25, "r", NO_RANKS);
    r.statuses.apply("master-of-magic", 49, "r", NO_RANKS);
    expect(rankOf(r, "elementalist.fire-magic")).toBe(13);
    expect(rankOf(r, "elementalist.water-magic")).toBe(13);
  });
});

describe("a status damage pulse (#1501)", () => {
  /** What `c`'s pulses deal over `seconds` of 20 Hz ticks. */
  function pulses(c: Combatant, seconds: number): number[] {
    const dealt: number[] = [];
    for (let i = 0; i < Math.round(seconds * 20); i += 1) {
      advanceStatuses(c, 1 / 20, 0);
      dealt.push(...c.statuses.drainPulses().map(({ damage }) => damage));
    }
    return dealt;
  }

  it("grows by its growth each whole second, from its source, five in five seconds", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    advanceStatuses(c, 0.95, 0);
    expect(c.statuses.drainPulses()).toEqual([]);
    advanceStatuses(c, 0.05, 0);
    expect(c.statuses.drainPulses()).toEqual([{ id: "wastrels-demise", sourceId: "m", damage: 8 }]);
    expect(pulses(c, 5)).toEqual([16, 24, 32, 40]);
    expect(c.statuses.has("wastrels-demise")).toBe(false);
  });

  it("deals no partial pulse when it ends between two", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("wastrels-demise", 2.5, "m", NO_RANKS);
    expect(pulses(c, 4)).toEqual([8, 16]);
  });

  it("deals no pulse after it ended early", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    expect(pulses(c, 2.5)).toEqual([8, 16]);
    c.statuses.removeByCategory("hex");
    expect(pulses(c, 3)).toEqual([]);
  });

  it("starts the count again when renewed", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    expect(pulses(c, 3)).toEqual([8, 16, 24]);
    c.statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    expect(pulses(c, 2)).toEqual([8, 16]);
  });

  it("a big step deals every pulse it passes", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    advanceStatuses(c, 3, 0);
    expect(c.statuses.drainPulses().map(({ damage }) => damage)).toEqual([8, 16, 24]);
  });
});

describe("raised maximum energy (#1464)", () => {
  it("adds Mighty Was Vorizun's 30 to the ceiling, and overcast still lowers it", () => {
    const c = makeCombatant({ id: "c", maxEnergy: 25 });
    c.statuses.apply("mighty-was-vorizun", 51, "c", NO_RANKS);
    expect(raisedMaxEnergy(c)).toBe(55);
    expect(effectiveMaxEnergy(c)).toBe(55);
    c.overcast = 10;
    expect(raisedMaxEnergy(c)).toBe(55);
    expect(effectiveMaxEnergy(c)).toBe(45);
  });
});

describe("conditions that expire faster (#1464)", () => {
  it("runs a condition 42% faster under Pure Was Li Ming, and a hex at its rate", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("pure-was-li-ming", 17, "c", NO_RANKS);
    c.statuses.apply("bleeding", 10, "a", NO_RANKS);
    c.statuses.apply("faintheartedness", 10, "a", NO_RANKS);
    c.statuses.advance(1, false);
    expect(c.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(8.58);
    expect(c.statuses.get("faintheartedness")?.remainingSeconds).toBeCloseTo(9);
    expect(c.statuses.get("pure-was-li-ming")?.remainingSeconds).toBeCloseTo(16);
  });
});
