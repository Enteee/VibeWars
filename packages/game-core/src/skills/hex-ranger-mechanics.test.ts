import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { energyCostOf, payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, untargetableByFoeSpells } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { attackDurationSeconds } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Monk and Ranger mechanics (#2189): Spell Shield, Withdraw Hexes,
 * Convert Hexes, Melandru's Resilience, Expert Focus and Rapid Fire.
 * Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["monk.divine-favor", 12],
  ["monk.protection-prayers", 12],
  ["ranger.wilderness-survival", 12],
  ["ranger.expertise", 12],
  ["ranger.marksmanship", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS, EN_WORDS, EN_NAMES).effects.map(({ text }) => text);
}

function wielding(weapon: Weapon): Combatant["equipment"] {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId: weapon.id === "axe" ? "warrior.axe-mastery" : "ranger.marksmanship",
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

describe("the six are the corpus's (#2189)", () => {
  it.each([
    ["monk.spell-shield", 957, "enchantment", false, "monk.divine-favor", 10, 1, 30],
    ["monk.withdraw-hexes", 942, "spell", true, "monk.divine-favor", 5, 1, 5],
    ["monk.convert-hexes", 303, "spell", false, "monk.protection-prayers", 15, 1, 12],
    ["ranger.melandrus-resilience", 451, "stance", true, "ranger.wilderness-survival", 5, 0, 15],
    ["ranger.expert-focus", 2145, "preparation", false, "ranger.expertise", 10, 2, 12],
    ["ranger.rapid-fire", 2068, "preparation", false, "ranger.marksmanship", 5, 2, 12],
  ] as const)("%s", (id, gwId, type, elite, attributeId, energy, activation, recharge) => {
    expect(skill(id)).toMatchObject({
      gwId,
      type,
      elite,
      attributeId,
      cost: { kind: "energy", amount: energy },
      activationSeconds: activation,
      rechargeSeconds: recharge,
    });
  });

  it("their tooltips say what is new", () => {
    expect(described("monk.spell-shield").join(" ")).toContain(
      "cannot be the target of enemy spells while casting spells",
    );
    expect(described("monk.withdraw-hexes")).toContain(
      "This skill takes 2 seconds longer to recharge for each hex removed",
    );
    expect(described("monk.withdraw-hexes")).toContain(
      "50% failure chance with Divine Favor 4 or less",
    );
    expect(described("monk.convert-hexes").join(" ")).toContain(
      "+10 armor for each Necromancer hex removed",
    );
    expect(described("ranger.melandrus-resilience").join(" ")).toContain(
      "+4 Health regeneration for each condition on you",
    );
    expect(described("ranger.expert-focus").join(" ")).toContain("bow attack skills");
    expect(described("ranger.rapid-fire").join(" ")).toContain(
      "attacks 33% faster while wielding a bow",
    );
  });
});

describe("Spell Shield's casting gate (#2189)", () => {
  it("holds only while its bearer is casting a spell", () => {
    const shielded = [{ id: "spell-shield" as const }];
    expect(untargetableByFoeSpells(shielded, true)).toBe(true);
    expect(untargetableByFoeSpells(shielded, false)).toBe(false);
    // Spell Breaker holds either way.
    expect(untargetableByFoeSpells([{ id: "spell-breaker" }], false)).toBe(true);
  });
});

describe("Convert Hexes (#2189)", () => {
  function convert(target: Combatant): void {
    const monk = makeCombatant({ id: "monk", attributeRanks: RANKS });
    payCost(skill("monk.convert-hexes"), monk);
    applySkillEffects({
      surroundings: new Map(),
      skill: skill("monk.convert-hexes"),
      caster: monk,
      targets: [target],
      rng: createRng(1),
      rules: RULES.combat,
    });
  }

  it("removes every hex, and gives +10 armor for each Necromancer one", () => {
    const ally = makeCombatant({ id: "ally" });
    ally.statuses.apply("faintheartedness", 10, "foe", NO_RANKS);
    ally.statuses.apply("price-of-failure", 10, "foe", NO_RANKS);
    ally.statuses.apply("empathy", 10, "foe", NO_RANKS);
    convert(ally);
    expect(ally.statuses.countByCategory("hex")).toBe(0);
    expect(ally.statuses.get("convert-hexes")).toMatchObject({ remainingSeconds: 18, stacks: 2 });
    expect(aggregateModifiers(ally.statuses.active).armorModifier).toBe(20);
  });

  it("with no Necromancer hex removes the rest and gives no armor", () => {
    const ally = makeCombatant({ id: "ally" });
    ally.statuses.apply("empathy", 10, "foe", NO_RANKS);
    convert(ally);
    expect(ally.statuses.countByCategory("hex")).toBe(0);
    expect(ally.statuses.has("convert-hexes")).toBe(false);
  });
});

describe("Melandru's Resilience (#2189)", () => {
  it("gives +4 Health and +1 Energy pips for each condition and hex, recounted", () => {
    const ranger = makeCombatant({ id: "ranger" });
    const pips = () => {
      const without = aggregateModifiers(
        ranger.statuses.active.filter(({ id }) => id !== "melandrus-resilience"),
      );
      const all = aggregateModifiers(ranger.statuses.active);
      return [all.healthPips - without.healthPips, all.energyPips - without.energyPips];
    };
    ranger.statuses.apply("melandrus-resilience", 18, "ranger", NO_RANKS);
    expect(pips()).toEqual([0, 0]);
    ranger.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    ranger.statuses.apply("faintheartedness", 10, "foe", NO_RANKS);
    expect(pips()).toEqual([8, 2]);
    ranger.statuses.end("bleeding");
    expect(pips()).toEqual([4, 1]);
  });
});

describe("Expert Focus (#2189)", () => {
  it("bow attack skills cost 2 less; other attacks and other skills do not", () => {
    const ranger = makeCombatant({ id: "ranger" });
    ranger.statuses.apply("expert-focus", 24, "ranger", RANKS);
    expect(energyCostOf(skill("ranger.power-shot"), ranger)).toBe(8);
    expect(energyCostOf(skill("ranger.hunters-shot"), ranger)).toBe(3);
    expect(energyCostOf(skill("warrior.power-attack"), ranger)).toBe(
      skill("warrior.power-attack").cost?.amount,
    );
    expect(energyCostOf(skill("ranger.rapid-fire"), ranger)).toBe(5);
  });

  it("never takes a cost below 0", () => {
    // Expertise 15 makes Hunter's Shot 2 already.
    const ranger = makeCombatant({
      id: "ranger",
      attributeRanks: new Map([["ranger.expertise", 15]]),
    });
    expect(energyCostOf(skill("ranger.hunters-shot"), ranger)).toBe(2);
    ranger.statuses.apply("expert-focus", 24, "ranger", RANKS);
    expect(energyCostOf(skill("ranger.hunters-shot"), ranger)).toBe(0);
  });

  it("at Expertise 0 takes 1 off", () => {
    const ranger = makeCombatant({ id: "ranger" });
    ranger.statuses.apply("expert-focus", 24, "ranger", NO_RANKS);
    expect(energyCostOf(skill("ranger.power-shot"), ranger)).toBe(9);
  });
});

describe("Rapid Fire (#2189)", () => {
  it("attacks 33% faster only while wielding a bow", () => {
    const archer = makeCombatant({ id: "archer", equipment: wielding(WEAPONS.flatbow) });
    archer.statuses.apply("rapid-fire", 21, "archer", NO_RANKS);
    expect(attackDurationSeconds(archer, 2)).toBeCloseTo(1.34);
    const axeman = makeCombatant({ id: "axeman", equipment: wielding(WEAPONS.axe) });
    axeman.statuses.apply("rapid-fire", 21, "axeman", NO_RANKS);
    expect(attackDurationSeconds(axeman, 2)).toBe(2);
  });
});

describe("in a match (#2189)", () => {
  const BAR = [
    "monk.spell-shield",
    "monk.withdraw-hexes",
    "monk.convert-hexes",
    "monk.banish",
    "ranger.expert-focus",
    "ranger.power-shot",
    "ranger.rapid-fire",
    "ranger.melandrus-resilience",
  ] as const;
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
    (typeof BAR)[number],
    number
  >;

  function body(
    id: string,
    team: number,
    spawn: Vec2,
    ranks: ReadonlyMap<string, number> = RANKS,
  ): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: new Map([...ranks, ["monk.smiting-prayers", 12]]),
      equipment: wielding(WEAPONS.flatbow),
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /** Monk `m` and its adjacent ally `a`; foe `f` in spell range of both. */
  function match(ranks?: ReadonlyMap<string, number>, seed = "hex-ranger-mechanics") {
    const sim = new MatchSimulation({
      seed,
      participants: [
        body("m", 0, vec2(0, 0), ranks),
        body("a", 0, vec2(30, 0)),
        body("f", 1, vec2(300, 0)),
      ],
    });
    for (const participant of sim.participants()) {
      participant.combatant.health = 5000;
      participant.combatant.energy = 1000;
    }
    return sim;
  }

  function get(sim: MatchSimulation, id: string): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  function cast(
    sim: MatchSimulation,
    who: string,
    skillId: (typeof BAR)[number],
    targetId: string,
  ): CombatLogEntry[] {
    sim.setTarget(who, targetId);
    expect(sim.requestSkill(who, SLOT[skillId])?.check).toEqual({ ok: true });
    return stepFor(sim, skill(skillId).activationSeconds + 0.25);
  }

  function events(log: readonly CombatLogEntry[]): CombatEvent[] {
    return log.flatMap((entry) => entry.events);
  }

  it("Spell Shield: a foe's spell at its bearer is refused only while the bearer casts a spell", () => {
    const sim = match();
    cast(sim, "m", "monk.spell-shield", "m");
    expect(get(sim, "m").statuses.has("spell-shield")).toBe(true);
    // Not casting: targetable.
    sim.setTarget("f", "m");
    expect(sim.requestSkill("f", SLOT["monk.banish"])?.check).toEqual({ ok: true });

    const casting = match();
    get(casting, "m").statuses.apply("spell-shield", 17, "m", NO_RANKS);
    casting.setTarget("m", "a");
    expect(casting.requestSkill("m", SLOT["monk.convert-hexes"])?.check).toEqual({ ok: true });
    stepFor(casting, 0.25);
    casting.setTarget("f", "m");
    expect(casting.requestSkill("f", SLOT["monk.banish"])?.check).toEqual({
      ok: false,
      reason: "invalid-target-untargetable",
    });
  });

  it("Spell Shield ending early disables all its bearer's skills for 5 s at Divine Favor 12", () => {
    const sim = match();
    cast(sim, "m", "monk.spell-shield", "m");
    get(sim, "m").statuses.end("spell-shield");
    const disabled = events(stepFor(sim, DT)).filter(
      (event) => event.kind === "skill-disabled" && event.targetId === "m",
    );
    // Every skill but Spell Shield, whose own 30 s recharge outlasts it.
    expect(disabled.map((event) => event.kind === "skill-disabled" && event.skillId)).toEqual(
      BAR.filter((id) => id !== "monk.spell-shield"),
    );
    expect(disabled[0]).toMatchObject({ seconds: 5 });
    expect(sim.requestSkill("m", SLOT["monk.convert-hexes"])?.check.ok).toBe(false);
  });

  it("Spell Shield at Divine Favor 0 disables for 8 s", () => {
    const sim = match(new Map([...RANKS, ["monk.divine-favor", 0]]));
    cast(sim, "m", "monk.spell-shield", "m");
    get(sim, "m").statuses.end("spell-shield");
    const disabled = events(stepFor(sim, DT)).find(
      (event) => event.kind === "skill-disabled" && event.targetId === "m",
    );
    expect(disabled).toMatchObject({ seconds: 8 });
  });

  it("Withdraw Hexes clears the ally and adjacent allies, 2 s more recharge a hex", () => {
    const sim = match();
    get(sim, "a").statuses.apply("faintheartedness", 20, "f", NO_RANKS);
    get(sim, "a").statuses.apply("empathy", 20, "f", NO_RANKS);
    get(sim, "m").statuses.apply("price-of-failure", 20, "f", NO_RANKS);
    const log = cast(sim, "m", "monk.withdraw-hexes", "a");
    expect(get(sim, "a").statuses.countByCategory("hex")).toBe(0);
    expect(get(sim, "m").statuses.countByCategory("hex")).toBe(0);
    expect(events(log)).toContainEqual({
      kind: "recharge-lengthened",
      targetId: "m",
      skillId: "monk.withdraw-hexes",
      seconds: 6,
    });
    // 5 s, and 6 more, less the quarter second stepped since.
    expect(get(sim, "m").cast.rechargeRemaining.get("monk.withdraw-hexes")).toBeCloseTo(10.75);
  });

  it("Withdraw Hexes with no hex removed recharges as it is", () => {
    const sim = match();
    const log = cast(sim, "m", "monk.withdraw-hexes", "a");
    expect(events(log).some((event) => event.kind === "recharge-lengthened")).toBe(false);
    expect(get(sim, "m").cast.rechargeRemaining.get("monk.withdraw-hexes")).toBeCloseTo(4.75);
  });

  it("Withdraw Hexes fails half the time below Divine Favor 5: paid, base recharge, no hex removed", () => {
    const low = new Map([...RANKS, ["monk.divine-favor", 4]]);
    const outcomes = Array.from({ length: 12 }, (_, i) => {
      const sim = match(low, `withdraw-fail-${String(i)}`);
      get(sim, "a").statuses.apply("faintheartedness", 20, "f", NO_RANKS);
      const before = get(sim, "m").energy;
      const log = cast(sim, "m", "monk.withdraw-hexes", "a");
      const failed = events(log).some(
        (event) => event.kind === "spell-failed" && event.skillId === "monk.withdraw-hexes",
      );
      if (failed) {
        expect(get(sim, "a").statuses.has("faintheartedness")).toBe(true);
        expect(get(sim, "m").energy).toBeLessThan(before);
        expect(get(sim, "m").cast.rechargeRemaining.get("monk.withdraw-hexes")).toBeCloseTo(4.75);
      } else {
        expect(get(sim, "a").statuses.has("faintheartedness")).toBe(false);
      }
      return failed;
    });
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
  });

  it("Withdraw Hexes never fails at Divine Favor 5", () => {
    const enough = new Map([...RANKS, ["monk.divine-favor", 5]]);
    for (let i = 0; i < 12; i += 1) {
      const sim = match(enough, `withdraw-fail-${String(i)}`);
      get(sim, "a").statuses.apply("faintheartedness", 20, "f", NO_RANKS);
      cast(sim, "m", "monk.withdraw-hexes", "a");
      expect(get(sim, "a").statuses.has("faintheartedness")).toBe(false);
    }
  });

  /** The extra damage Expert Focus's hit on `f` deals, at `ranks`. */
  function expertFocusDamage(ranks?: ReadonlyMap<string, number>): number[] {
    const sim = match(ranks);
    cast(sim, "m", "ranger.expert-focus", "m");
    sim.setTarget("m", "f");
    expect(sim.requestSkill("m", SLOT["ranger.power-shot"])?.check).toEqual({ ok: true });
    const hit = stepFor(sim, 4).filter((entry) => entry.skillId === "ranger.expert-focus");
    return events(hit).flatMap((event) =>
      event.kind === "damage" && event.targetId === "f" ? [event.amount] : [],
    );
  }

  it("Expert Focus: a bow attack skill's hit deals 8 more at Expertise 12, 1 at 0", () => {
    expect(expertFocusDamage()).toEqual([8]);
    expect(expertFocusDamage(new Map([...RANKS, ["ranger.expertise", 0]]))).toEqual([1]);
  });
});
