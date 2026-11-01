import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { applyIntent } from "../match/apply-intent.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkill, resolveSwing } from "./weapon-attack.js";

/**
 * Ritualist weapon spells 3 (#1654): Resilient, Ghostly, Guided,
 * Sundering, Shadow, Warmonger's, Wailing, Nightmare, Fury and Renewal,
 * at the corpus's rank-12 numbers.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const NOWHERE = (): boolean => false;
/** Every float high: no block, no crit, no double strike. */
const HIGH: SimulationRng = Object.assign(createRng(1654), { nextFloat: () => 0.99 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A rank-12 swordsman under `statusId`. */
function swordsman(statusId?: StatusId): Combatant {
  const sword = makeCombatant({
    id: "attacker",
    team: 0,
    maxEnergy: 100,
    energy: 0,
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
  });
  if (statusId !== undefined) {
    sword.statuses.apply(statusId, 20, "ritualist", NO_RANKS);
  }
  return sword;
}

function foe(id = "dummy") {
  return {
    combatant: makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 }),
    position: vec2(40, 0),
    creature: undefined,
    corpseExploited: false,
  };
}

function swing(who: Combatant, target: ReturnType<typeof foe>, rng: SimulationRng = HIGH) {
  return resolveSwing({
    attacker: who,
    target,
    surroundings: new Map(),
    rng,
    rules: RULES.combat,
    exposed: NOWHERE,
  }).events;
}

function powerAttack(who: Combatant, target: Combatant, rng: SimulationRng = HIGH) {
  return resolveAttackSkill(
    {
      skill: skill("warrior.power-attack"),
      caster: who,
      targets: [target],
      rng,
      rules: RULES.combat,
      surroundings: new Map(),
    },
    NOWHERE,
    [],
  );
}

const kinds = (events: readonly CombatEvent[]): string[] =>
  events.flatMap((event) =>
    event.kind === "damage" || event.kind === "attack-blocked" ? [event.kind] : [],
  );

const damageTo = (events: readonly CombatEvent[], id: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );

describe("the ten are the corpus's (#1654)", () => {
  it.each([
    ["resilient-weapon", 787, false, "restoration-magic", 10, 1, 6, 10],
    ["ghostly-weapon", 2206, false, "communing", 3, 0.25, 1, 17],
    ["guided-weapon", 1259, false, "communing", 5, 2, 12, 9],
    ["sundering-weapon", 2148, false, "communing", 5, 1, 10, 9],
    ["weapon-of-shadow", 983, false, "restoration-magic", 10, 1, 20, 6],
    ["warmongers-weapon", 1751, false, "channeling-magic", 10, 1, 30, 11],
    ["wailing-weapon", 794, false, "channeling-magic", 5, 1, 15, 12],
    ["nightmare-weapon", 795, false, "channeling-magic", 5, 1, 10, 12],
    ["weapon-of-fury", 1749, true, "channeling-magic", 5, 1, 8, 17],
    ["weapon-of-renewal", 2149, false, "spawning-power", 5, 1, 10, 17],
  ] as const)(
    "%s: gwId %i, elite %s, %s, %i energy, %d s, %i s recharge, %i s",
    (id, gwId, elite, attribute, energy, activation, recharge, seconds) => {
      expect(skill(`ritualist.${id}`)).toMatchObject({
        gwId,
        type: "weapon-spell",
        elite,
        attributeId: `ritualist.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target: id === "ghostly-weapon" ? "single-other-ally" : "single-ally",
        effects: [{ kind: "apply-status", statusId: id, durationSeconds: seconds }],
      });
    },
  );

  it("describes the new primitives", () => {
    expect(describeStatus("resilient-weapon")).toMatch(
      /while under a condition or hex: \+5 Health regeneration, \+24 armor/,
    );
    expect(describeStatus("guided-weapon")).toMatch(/attacks cannot be blocked/);
    expect(describeStatus("nightmare-weapon")).toMatch(/attacks deal 42 less damage/);
  });
});

describe("Resilient Weapon (#1654)", () => {
  it("gives +5 regeneration and +24 armor only while hexed or under a condition", () => {
    const ally = makeCombatant({ id: "ally" });
    ally.statuses.apply("resilient-weapon", 10, "r", NO_RANKS);
    expect(aggregateModifiers(ally.statuses.active)).toMatchObject({
      healthPips: 0,
      armorModifier: 0,
    });
    ally.statuses.apply("bleeding", 5, "x", NO_RANKS);
    // Bleeding's own −3 plus the weapon's +5.
    expect(aggregateModifiers(ally.statuses.active)).toMatchObject({
      healthPips: 2,
      armorModifier: 24,
    });
    ally.statuses.remove("bleeding");
    expect(aggregateModifiers(ally.statuses.active)).toMatchObject({
      healthPips: 0,
      armorModifier: 0,
    });
    ally.statuses.apply("lamentation", 5, "x", NO_RANKS);
    expect(aggregateModifiers(ally.statuses.active).armorModifier).toBe(24);
  });
});

describe("Ghostly and Guided Weapon (#1654)", () => {
  it("Ghostly Weapon: one attack past a block, then it ends", () => {
    const sword = swordsman("ghostly-weapon");
    const target = foe();
    target.combatant.statuses.apply("bonettis-defense", 1e6, "dummy", NO_RANKS);
    const blocked = Object.assign(createRng(1654), { nextFloat: () => 0 });
    expect(kinds(swing(sword, target, blocked))).toEqual(["damage"]);
    expect(sword.statuses.has("ghostly-weapon")).toBe(false);
    expect(kinds(swing(sword, target, blocked))).toEqual(["attack-blocked"]);
  });

  it("Guided Weapon: every attack past a stance's block, nothing spent", () => {
    const sword = swordsman("guided-weapon");
    const target = foe();
    target.combatant.statuses.apply("bonettis-defense", 1e6, "dummy", NO_RANKS);
    const blocked = Object.assign(createRng(1654), { nextFloat: () => 0 });
    expect(kinds(swing(sword, target, blocked))).toEqual(["damage"]);
    expect(kinds(powerAttack(sword, target.combatant, blocked))).toEqual(["damage"]);
    expect(kinds(swing(sword, target, blocked))).toEqual(["damage"]);
    expect(sword.statuses.has("guided-weapon")).toBe(true);
  });
});

describe("Sundering and Nightmare Weapon (#1654)", () => {
  it("Sundering Weapon: Cracked Armor for 17 s on each of 3 hits, then it ends", () => {
    const sword = swordsman("sundering-weapon");
    expect(aggregateModifiers(sword.statuses.active).attackArmorPenetration).toBe(0.1);
    const target = foe();
    swing(sword, target);
    expect(target.combatant.statuses.get("cracked-armor")?.remainingSeconds).toBe(17);
    swing(sword, target);
    expect(sword.statuses.has("sundering-weapon")).toBe(true);
    swing(sword, target);
    expect(sword.statuses.has("sundering-weapon")).toBe(false);
  });

  it("Nightmare Weapon: a blow 42 lighter, never below 0, steals 42, and ends on the 3rd hit", () => {
    const fixedRoll = (roll: number): SimulationRng =>
      Object.assign(createRng(1654), { nextFloat: () => 0.99, nextInt: () => roll });
    expect(damageTo(swing(swordsman(), foe(), fixedRoll(60)), "dummy")).toEqual([60]);
    const sword = swordsman("nightmare-weapon");
    sword.health = 100;
    const target = foe();
    expect(damageTo(swing(sword, target, fixedRoll(60)), "dummy")).toEqual([18]);
    expect(sword.health).toBe(142);
    // A 22 blow less 42 deals nothing, and still steals.
    expect(damageTo(swing(sword, target, fixedRoll(22)), "dummy").every((n) => n === 0)).toBe(true);
    expect(sword.health).toBe(184);
    expect(sword.statuses.has("nightmare-weapon")).toBe(true);
    swing(sword, target, fixedRoll(15));
    expect(sword.statuses.has("nightmare-weapon")).toBe(false);
  });
});

describe("Warmonger's and Wailing Weapon (#1654)", () => {
  function caster(skillId: string): ReturnType<typeof foe> {
    const target = foe();
    target.combatant.cast.beginCast(skillId, "attacker", 3, undefined);
    return target;
  }

  it("Warmonger's interrupts a caster, never an attacker", () => {
    const casting = caster("elementalist.fireball");
    swing(swordsman("warmongers-weapon"), casting);
    expect(casting.combatant.cast.activeCast).toBeUndefined();

    const striking = caster("warrior.power-attack");
    swing(swordsman("warmongers-weapon"), striking);
    expect(striking.combatant.cast.activeCast?.skillId).toBe("warrior.power-attack");
  });

  it("Wailing interrupts an attack skill, never a caster", () => {
    const striking = caster("warrior.power-attack");
    swing(swordsman("wailing-weapon"), striking);
    expect(striking.combatant.cast.activeCast).toBeUndefined();

    const casting = caster("elementalist.fireball");
    swing(swordsman("wailing-weapon"), casting);
    expect(casting.combatant.cast.activeCast?.skillId).toBe("elementalist.fireball");
  });
});

describe("Weapon of Renewal (#1654)", () => {
  it("a swing gives nothing; the first attack skill to hit gives 6 Energy and ends it", () => {
    const sword = swordsman("weapon-of-renewal");
    const target = foe();
    swing(sword, target);
    expect(sword.energy).toBe(0);
    expect(sword.statuses.has("weapon-of-renewal")).toBe(true);
    sword.energy = 10;
    powerAttack(sword, target.combatant);
    expect(sword.energy).toBe(16);
    expect(sword.statuses.has("weapon-of-renewal")).toBe(false);
  });
});

describe("in a match (#1654)", () => {
  function body(id: string, team: number, spawn: Vec2, weapon = WEAPONS.sword): ParticipantSpec {
    const attributeId =
      weapon === WEAPONS.sword ? "warrior.swordsmanship" : "ritualist.channeling-magic";
    return {
      id,
      team,
      skillBar: [],
      attributeRanks: new Map([[attributeId, 12]]),
      equipment: wielding(weapon, attributeId),
      maxHealth: 1e4,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  /** `w` wielding `weapon` against `x`, a sword, 30 apart. */
  function match(weapon = WEAPONS.sword): MatchSimulation {
    return new MatchSimulation({
      seed: "ritualist-weapons-3",
      participants: [body("w", 0, vec2(0, 0), weapon), body("x", 1, vec2(30, 0))],
    });
  }

  function get(sim: MatchSimulation, id: string): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  function stepFor(sim: MatchSimulation, seconds: number): void {
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      sim.step(DT);
    }
  }

  it("Resilient Weapon's regeneration is credited to its caster", () => {
    const sim = match();
    const w = get(sim, "w");
    w.health = 5000;
    w.statuses.apply("bleeding", 10, "x", NO_RANKS);
    w.statuses.apply("resilient-weapon", 10, "rit", NO_RANKS);
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < Math.round(1 / DT); tick += 1) {
      log.push(...sim.step(DT).log);
    }
    const regenerated = log.filter(
      (entry) =>
        entry.cause === "degeneration" &&
        entry.events.some((event) => event.kind === "heal" && event.targetId === "w"),
    );
    expect(regenerated.length).toBeGreaterThan(0);
    expect(regenerated.every((entry) => entry.sourceId === "rit")).toBe(true);
  });

  it.each([
    ["sword", WEAPONS.sword],
    ["wand", WEAPONS.wand],
  ] as const)(
    "Nightmare Weapon: a %s's three hits deal no damage and steal 42 each",
    (_name, weapon) => {
      const sim = match(weapon);
      const w = get(sim, "w");
      const x = get(sim, "x");
      w.statuses.apply("nightmare-weapon", 12, "w", NO_RANKS);
      w.health = 5000;
      expect(applyIntent(sim, "w", { kind: "attack", targetId: "x" })).toBeNull();
      stepFor(sim, 10);
      expect(w.statuses.has("nightmare-weapon")).toBe(false);
      // Three steals of 42, then plain blows after it ended.
      expect(w.health).toBe(5000 + 3 * 42);
      expect(x.health).toBeLessThan(x.maxHealth - 3 * 42);
    },
  );

  it("Weapon of Shadow blinds whoever hits its bearer, and whoever it hits", () => {
    const struck = match();
    get(struck, "w").statuses.apply("weapon-of-shadow", 6, "w", NO_RANKS);
    expect(applyIntent(struck, "x", { kind: "attack", targetId: "w" })).toBeNull();
    stepFor(struck, 3);
    expect(get(struck, "x").statuses.has("blind")).toBe(true);

    const striking = match();
    get(striking, "w").statuses.apply("weapon-of-shadow", 6, "w", NO_RANKS);
    expect(applyIntent(striking, "w", { kind: "attack", targetId: "x" })).toBeNull();
    stepFor(striking, 3);
    expect(get(striking, "x").statuses.has("blind")).toBe(true);
  });

  it("Weapon of Fury: 1 Energy per hit and twice the adrenaline", () => {
    const run = (fury: boolean) => {
      const sim = match();
      const w = get(sim, "w");
      w.energy = 0;
      if (fury) {
        w.statuses.apply("weapon-of-fury", 17, "w", NO_RANKS);
      }
      expect(applyIntent(sim, "w", { kind: "attack", targetId: "x" })).toBeNull();
      stepFor(sim, 4);
      const hits = get(sim, "x").maxHealth - get(sim, "x").health > 0;
      return { energy: w.energy, hits };
    };
    const plain = run(false);
    const furious = run(true);
    expect(plain.hits).toBe(true);
    expect(furious.energy).toBeGreaterThan(plain.energy);
    expect(
      aggregateModifiers([{ id: "weapon-of-fury", ranks: NO_RANKS }]).adrenalineGainFaster,
    ).toBe(1);
  });
});
