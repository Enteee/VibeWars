import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { energyCostOf } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveActivationSeconds } from "../skills/tick.js";
import type { FiredTrigger } from "../skills/triggers.js";
import type { Combatant, Skill, Surroundings } from "../skills/types.js";
import { attackHitRiders, resolveSwing } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Enchantment party moves (#1975): Air of Enchantment's cheaper
 * enchantments on its bearer, Order of Apostasy's party strip and its
 * price, Dark Apostasy's strip on a critical hit, and Jaundiced Gaze's
 * next enchantment, each at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** 10 Energy, 2 s, on the caster. */
const TEN = "mesmer.illusion-of-weakness";
/** 15 Energy, on an ally. */
const FIFTEEN = "monk.spell-breaker";
/** 1 Energy, on the caster. */
const ONE = "necromancer.blood-renewal";
/** Another 10 Energy, 2 s, on the caster. */
const TEN_TOO = "monk.blessed-aura";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function spec(id: string, x: number): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [TEN, FIFTEEN, ONE, TEN_TOO],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn: vec2(x, 0),
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** A caster `c` and an ally `a` beside it. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "enchant-party",
    participants: [spec("c", 0), spec("a", 60)],
  });
}

/** The Energy `c` pays as it begins `skillId` on `targetId`. */
function paid(sim: MatchSimulation, skillId: string, targetId: string): number {
  const caster = get(sim, "c").combatant;
  sim.setTarget("c", targetId);
  const before = caster.energy;
  expect(sim.requestSkill("c", get(sim, "c").skillBar.indexOf(skillId))?.check.ok).toBe(true);
  return before - caster.energy;
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

function around(...combatants: readonly Combatant[]): Surroundings {
  return new Map(
    combatants.map((combatant, index) => [
      combatant.id,
      { combatant, position: vec2(index * 40, 0), creature: undefined, corpseExploited: false },
    ]),
  );
}

/** How long the cast `caster` is in takes; `undefined` when it casts nothing. */
function castSeconds(caster: Combatant): number | undefined {
  return caster.cast.activeCast?.totalSeconds;
}

function healthLost(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "health-loss" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("Air of Enchantment (#1975)", () => {
  it("cuts 10 off each enchantment cast on its bearer, never below 1", () => {
    const air = (sim: MatchSimulation): MatchSimulation => {
      get(sim, "c").combatant.statuses.apply("air-of-enchantment", 9, "x", NO_RANKS);
      return sim;
    };
    expect(paid(air(match()), TEN, "c")).toBe(1);
    expect(paid(air(match()), FIFTEEN, "c")).toBe(5);
    expect(paid(air(match()), ONE, "c")).toBe(1);
    // The same 15 at an ally without it: full price.
    expect(paid(air(match()), FIFTEEN, "a")).toBe(15);
  });

  it("names no target on the skill bar, and spares an area enchantment", () => {
    const bearer = makeCombatant({ id: "b" });
    bearer.statuses.apply("air-of-enchantment", 9, "x", NO_RANKS);
    expect(energyCostOf(skill(FIFTEEN), bearer)).toBe(15);
    expect(energyCostOf(skill(FIFTEEN), bearer, bearer)).toBe(5);
    expect(energyCostOf(skill("necromancer.order-of-pain"), bearer, bearer)).toBe(10);
  });

  it("comes off after Jaundiced Gaze's: 10 − 8 = 2, then floor 1", () => {
    const bearer = makeCombatant({ id: "b" });
    bearer.statuses.apply("air-of-enchantment", 9, "x", NO_RANKS);
    bearer.statuses.apply("jaundiced-gaze", 16, "b", NO_RANKS);
    expect(energyCostOf(skill(TEN), bearer, bearer)).toBe(1);
  });
});

describe("Order of Apostasy (#1975)", () => {
  const necromancer = (): Combatant =>
    makeCombatant({ id: "n", maxHealth: 480, health: 480, energy: 50 });
  const ally = (weapon: Weapon, attributeId: string): Combatant => {
    const bearer = makeCombatant({ id: "a", equipment: wielding(weapon, attributeId) });
    bearer.statuses.apply("order-of-apostasy", 5, "n", NO_RANKS);
    return bearer;
  };
  const foe = (): Combatant => makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
  const hit = (attacker: Combatant, victim: Combatant, surroundings: Surroundings) => {
    const fired: FiredTrigger[] = [];
    attackHitRiders(
      attacker,
      victim,
      attacker.equipment.mainHand,
      false,
      0,
      createRng(1),
      RULES.combat,
      surroundings,
      fired,
      [],
    );
    return fired.flatMap(({ events }) => events);
  };

  it("an ally's sword hit strips a Monk enchantment, and the Necromancer loses 4%", () => {
    const n = necromancer();
    const a = ally(WEAPONS.sword, "warrior.swordsmanship");
    const f = foe();
    f.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
    const events = hit(a, f, around(n, a, f));
    expect(f.statuses.has("vital-blessing")).toBe(false);
    expect(healthLost(events, "n")).toEqual([20]);
    expect(n.health).toBe(460);
  });

  it("strips a Mesmer enchantment at no price", () => {
    const n = necromancer();
    const a = ally(WEAPONS.sword, "warrior.swordsmanship");
    const f = foe();
    f.statuses.apply("arcane-echo", 30, "x", NO_RANKS);
    const events = hit(a, f, around(n, a, f));
    expect(f.statuses.has("arcane-echo")).toBe(false);
    expect(healthLost(events, "n")).toEqual([]);
    expect(n.health).toBe(480);
  });

  it("fires beside Order of Pain on the same hit", () => {
    const n = necromancer();
    const a = ally(WEAPONS.sword, "warrior.swordsmanship");
    a.statuses.apply("order-of-pain", 5, "n", NO_RANKS);
    const f = foe();
    f.statuses.apply("arcane-echo", 30, "x", NO_RANKS);
    hit(a, f, around(n, a, f));
    expect(f.statuses.has("arcane-echo")).toBe(false);
    expect(f.health).toBe(1000 - 13);
  });

  it("a wand's hit strips nothing", () => {
    const n = necromancer();
    const a = ally(WEAPONS.wand, "elementalist.fire-magic");
    const f = foe();
    f.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
    hit(a, f, around(n, a, f));
    expect(f.statuses.has("vital-blessing")).toBe(true);
    expect(n.health).toBe(480);
  });

  it("can kill the Necromancer, and a dead one loses nothing", () => {
    const n = makeCombatant({ id: "n", maxHealth: 480, health: 10 });
    const a = ally(WEAPONS.sword, "warrior.swordsmanship");
    const f = foe();
    f.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
    f.statuses.apply("judges-insight", 30, "x", NO_RANKS);
    hit(a, f, around(n, a, f));
    expect(n.dead).toBe(true);
    hit(a, f, around(n, a, f));
    expect(f.statuses.countByCategory("enchantment")).toBe(0);
    expect(n.health).toBe(0);
  });
});

describe("Dark Apostasy (#1975)", () => {
  const swing = (criticalBaseChance: number, energy: number) => {
    const attacker = makeCombatant({
      id: "a",
      energy,
      equipment: wielding(WEAPONS.daggers, "assassin.dagger-mastery"),
    });
    attacker.statuses.apply("dark-apostasy", 14, "a", NO_RANKS);
    const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
    victim.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
    victim.statuses.apply("arcane-echo", 30, "x", NO_RANKS);
    resolveSwing({
      attacker,
      target: { combatant: victim, position: vec2(40, 0), creature: undefined },
      surroundings: around(attacker, victim),
      rng: createRng(3),
      rules: { ...RULES.combat, criticalBaseChance, criticalChancePerRank: 0 },
      exposed: () => false,
    });
    return { attacker, victim };
  };

  it("a critical hit strips one enchantment for 4 Energy", () => {
    const { attacker, victim } = swing(1, 20);
    // Critical Strikes at rank 0 gives none back.
    expect(attacker.energy).toBe(16);
    expect(victim.statuses.countByCategory("enchantment")).toBe(1);
    expect(attacker.statuses.has("dark-apostasy")).toBe(true);
  });

  it("short of 4 Energy, the strip stands and Dark Apostasy ends", () => {
    const { attacker, victim } = swing(1, 3);
    expect(attacker.energy).toBe(3);
    expect(victim.statuses.countByCategory("enchantment")).toBe(1);
    expect(attacker.statuses.has("dark-apostasy")).toBe(false);
  });

  it("a hit that is not critical strips nothing", () => {
    const { attacker, victim } = swing(0, 20);
    expect(attacker.energy).toBe(20);
    expect(victim.statuses.countByCategory("enchantment")).toBe(2);
  });
});

describe("Jaundiced Gaze (#1975)", () => {
  it("the next enchantment costs 8 less and casts 1 s faster; the one after, full", () => {
    const sim = match();
    const caster = get(sim, "c").combatant;
    caster.statuses.apply("jaundiced-gaze", 16, "c", NO_RANKS);
    expect(effectiveActivationSeconds(skill(TEN), caster)).toBe(1);
    expect(paid(sim, TEN, "c")).toBe(2);
    expect(castSeconds(caster)).toBe(1);
    expect(caster.statuses.has("jaundiced-gaze")).toBe(false);
    for (let i = 0; caster.cast.activeCast !== undefined || caster.cast.inAftercast; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      sim.step(DT);
    }
    // Illusion of Weakness recharges: another 10 Energy, 2 s enchantment.
    expect(paid(sim, TEN_TOO, "c")).toBe(10);
    expect(castSeconds(caster)).toBe(2);
  });

  it("puts nothing on its caster when the foe has no enchantment", () => {
    const sim = new MatchSimulation({
      seed: "jaundiced",
      participants: [
        { ...spec("c", 0), skillBar: ["necromancer.jaundiced-gaze"] },
        { ...spec("f", 100), team: 1 },
      ],
    });
    const caster = get(sim, "c").combatant;
    sim.setTarget("c", "f");
    expect(sim.requestSkill("c", 0)?.check.ok).toBe(true);
    for (let i = 0; caster.cast.activeCast !== undefined; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      sim.step(DT);
    }
    expect(caster.statuses.has("jaundiced-gaze")).toBe(false);
    get(sim, "f").combatant.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
    for (let i = 0; !caster.statuses.has("jaundiced-gaze"); i++) {
      expect(i).toBeLessThan(20 * RULES.tickRateHz);
      if (castSeconds(caster) === undefined && !caster.cast.inAftercast) {
        sim.requestSkill("c", 0);
      }
      sim.step(DT);
    }
    expect(get(sim, "f").combatant.statuses.has("vital-blessing")).toBe(false);
  });
});
