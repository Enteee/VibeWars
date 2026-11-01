import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { resolveTargets, type TargetCandidate } from "./targeting.js";
import { makeCombatant } from "./testing.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Eight GW1 PvP staples the engine runs with no new mechanic (#522):
 * attack skills with a bonus, a condition or an interrupt, and two area
 * conditions. Each is cast the way the simulation casts it: checked,
 * paid, its targets picked, then resolved.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A stream that never misses blind, never blocks and rolls `roll`. */
const steady = (roll = 10, float = 0.95): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

/** Every float 0.5: a blind attacker misses (90%). */
const missing = (): SimulationRng => steady(10, 0.5);

/** Every adrenaline skill in the catalog, charged to its cost (#463). */
function chargedAdrenaline(): Map<string, number> {
  return new Map(
    IMPLEMENTED_SKILLS.flatMap((each) =>
      each.cost?.kind === "adrenaline" ? [[each.id, each.cost.amount * ADRENALINE_PER_STRIKE]] : [],
    ),
  );
}

function holding(id: string, team: number, weapon: Weapon, attributeId: string): Combatant {
  return makeCombatant({
    id,
    team,
    equipment: {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon,
        attributeId,
        damageType: weapon.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    attributeRanks: new Map([[attributeId, 12]]),
    adrenaline: chargedAdrenaline(),
  });
}

const foe = (id: string, team = 1): Combatant =>
  makeCombatant({ id, team, health: 1e6, maxHealth: 1e6 });

/** Whether `caster` may use `id` on `target`, `RANGE_MELEE` away. */
function check(caster: Combatant, id: string, target: Combatant) {
  return canActivate({
    skill: skill(id),
    caster,
    casterPosition: vec2(0, 0),
    target,
    targetPosition: vec2(RANGE_MELEE, 0),
    targetCreatureKind: undefined,
    targetCreatureOwnerId: undefined,
    rechargeRemaining: new Map(),
    spent: new Set(),
    isCasting: false,
    skillBar: [id, null, null, null, null, null, null, null],
    losBlockers: [],
  });
}

/** One attack skill's blow at `target`, after its check and its cost. */
function strike(caster: Combatant, id: string, target: Combatant, rng = steady()): CombatEvent[] {
  expect(check(caster, id, target)).toEqual({ ok: true });
  payCost(skill(id), caster);
  return resolveAttackSkill(
    { surroundings: new Map(), skill: skill(id), caster, targets: [target], rng, rules: RULES },
    NOWHERE,
    [],
  );
}

/** A non-attack skill cast at `primary` (at `at`), landing on everyone in its area. */
function land(
  caster: Combatant,
  id: string,
  primary: TargetCandidate,
  others: readonly TargetCandidate[],
): CombatEvent[] {
  const targets = resolveTargets({
    skill: skill(id),
    caster,
    casterPosition: vec2(0, 0),
    primary,
    candidates: [primary, ...others],
    losBlockers: [],
  });
  payCost(skill(id), caster);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(id),
    caster,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

const at = (combatant: Combatant, position: Vec2): TargetCandidate => ({
  combatant,
  position,
  creature: undefined,
});

describe("the weapon each attack needs (#522)", () => {
  it.each([
    ["assassin.jagged-strike", WEAPONS.daggers, "assassin.dagger-mastery", WEAPONS.sword],
    ["warrior.sever-artery", WEAPONS.sword, "warrior.swordsmanship", WEAPONS.axe],
    ["warrior.eviscerate", WEAPONS.axe, "warrior.axe-mastery", WEAPONS.sword],
    ["warrior.executioners-strike", WEAPONS.axe, "warrior.axe-mastery", WEAPONS.hammer],
    ["ranger.punishing-shot", WEAPONS.longbow, "ranger.marksmanship", WEAPONS.spear],
  ])("%s is used with its weapon and refused with another", (id, right, attributeId, wrong) => {
    expect(check(holding("a", 0, right, attributeId), id, foe("t"))).toEqual({ ok: true });
    expect(check(holding("a", 0, wrong, attributeId), id, foe("t"))).toEqual({
      ok: false,
      reason: "wrong-weapon",
    });
  });
});

describe("conditions on a hit (#522)", () => {
  it.each([
    ["assassin.jagged-strike", WEAPONS.daggers, "assassin.dagger-mastery", "bleeding", 17],
    ["warrior.sever-artery", WEAPONS.sword, "warrior.swordsmanship", "bleeding", 21],
    ["warrior.eviscerate", WEAPONS.axe, "warrior.axe-mastery", "deep-wound", 17],
  ] as const)(
    "%s lands %s for its rank-12 %i s, and nothing on a blind miss",
    (id, weapon, attr, status, seconds) => {
      const hit = foe("t");
      strike(holding("a", 0, weapon, attr), id, hit);
      expect(hit.statuses.get(status)?.remainingSeconds).toBe(seconds);

      const blind = holding("a", 0, weapon, attr);
      blind.statuses.apply("blind", 10, "foe", NO_RANKS);
      const missed = foe("t");
      expect(strike(blind, id, missed, missing())).toEqual([
        { kind: "attack-missed", targetId: "t" },
      ]);
      expect(missed.statuses.has(status)).toBe(false);
      expect(missed.health).toBe(missed.maxHealth);
    },
  );
});

describe("bonus damage (#522)", () => {
  const damage = (events: readonly CombatEvent[]) =>
    events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);

  /**
   * The damage of one blow of `id` minus one of Sever Artery, which has
   * no bonus, from the same weapon on the same roll.
   */
  function bonusOf(id: string, weapon: Weapon, attributeId: string): number {
    const plain = (caster: Combatant) =>
      resolveAttackSkill(
        {
          surroundings: new Map(),
          skill: skill("warrior.sever-artery"),
          caster,
          targets: [foe("t")],
          rng: steady(),
          rules: RULES,
        },
        NOWHERE,
        [],
      );
    return (
      damage(strike(holding("a", 0, weapon, attributeId), id, foe("t"))) -
      damage(plain(holding("a", 0, weapon, attributeId)))
    );
  }

  it("Executioner's Strike adds +34 at Axe Mastery 12, and Eviscerate +38", () => {
    expect(bonusOf("warrior.executioners-strike", WEAPONS.axe, "warrior.axe-mastery")).toBe(34);
    expect(bonusOf("warrior.eviscerate", WEAPONS.axe, "warrior.axe-mastery")).toBe(38);
  });

  it("Punishing Shot adds +18 at Marksmanship 12", () => {
    expect(bonusOf("ranger.punishing-shot", WEAPONS.longbow, "ranger.marksmanship")).toBe(18);
  });
});

describe("Punishing Shot (#522)", () => {
  /** A foe halfway through a 3 s Troll Unguent. */
  function casting(): Combatant {
    const target = foe("t");
    target.cast.beginCast("ranger.troll-unguent", "t", 3, undefined);
    return target;
  }

  it("interrupts its target's cast on a hit", () => {
    const target = casting();
    const events = strike(
      holding("a", 0, WEAPONS.longbow, "ranger.marksmanship"),
      "ranger.punishing-shot",
      target,
    );
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "t",
      skillId: "ranger.troll-unguent",
    });
    expect(target.cast.isCasting).toBe(false);
  });

  it("interrupts nothing when it misses", () => {
    const ranger = holding("a", 0, WEAPONS.longbow, "ranger.marksmanship");
    ranger.statuses.apply("blind", 10, "foe", NO_RANKS);
    const target = casting();
    strike(ranger, "ranger.punishing-shot", target, missing());
    expect(target.cast.isCasting).toBe(true);
  });
});

describe("Throw Dirt (#522)", () => {
  it("is a touch skill: refused beyond melee range", () => {
    const ranger = makeCombatant({ id: "a", team: 0 });
    const far = canActivate({
      skill: skill("ranger.throw-dirt"),
      caster: ranger,
      casterPosition: vec2(0, 0),
      target: foe("t"),
      targetPosition: vec2(RANGE_MELEE * 3, 0),
      targetCreatureKind: undefined,
      targetCreatureOwnerId: undefined,
      rechargeRemaining: new Map(),
      spent: new Set(),
      isCasting: false,
      skillBar: ["ranger.throw-dirt", null, null, null, null, null, null, null],
      losBlockers: [],
    });
    expect(far).toEqual({ ok: false, reason: "out-of-range" });
  });

  it("blinds the touched foe and the foes adjacent to it, not one further out nor an ally", () => {
    const target = foe("t");
    const adjacent = foe("adjacent");
    const outside = foe("outside");
    const ally = foe("ally", 0);
    const ranger = makeCombatant({
      id: "a",
      team: 0,
      attributeRanks: new Map([["ranger.expertise", 12]]),
    });
    land(ranger, "ranger.throw-dirt", at(target, vec2(40, 0)), [
      at(adjacent, vec2(40 + AREA_ADJACENT, 0)),
      at(outside, vec2(40 + AREA_ADJACENT + 1, 0)),
      at(ally, vec2(40, 10)),
    ]);
    expect(target.statuses.get("blind")?.remainingSeconds).toBe(13);
    expect(adjacent.statuses.get("blind")?.remainingSeconds).toBe(13);
    expect(outside.statuses.has("blind")).toBe(false);
    expect(ally.statuses.has("blind")).toBe(false);
  });
});

describe("Enfeebling Blood (#522)", () => {
  it("weakens the target and every nearby foe, and not one outside the radius", () => {
    const target = foe("t");
    const nearby = foe("nearby");
    const outside = foe("outside");
    land(
      makeCombatant({ id: "a", team: 0 }),
      "necromancer.enfeebling-blood",
      at(target, vec2(300, 0)),
      [at(nearby, vec2(300 + AREA_NEARBY, 0)), at(outside, vec2(300 + AREA_NEARBY + 1, 0))],
    );
    expect(target.statuses.get("weakness")?.remainingSeconds).toBe(13);
    expect(nearby.statuses.get("weakness")?.remainingSeconds).toBe(13);
    expect(outside.statuses.has("weakness")).toBe(false);
  });

  it("costs its caster 1 energy and the 17% sacrifice once, however many foes it reaches", () => {
    const necro = makeCombatant({ id: "a", team: 0, health: 500, maxHealth: 500 });
    const foes = [1, 2, 3].map((i) => at(foe(`f${String(i)}`), vec2(300, i * 10)));
    const [first, ...rest] = foes;
    if (first === undefined) {
      throw new Error("no foe");
    }
    const events = land(necro, "necromancer.enfeebling-blood", first, rest);

    expect(necro.energy).toBe(49);
    expect(necro.health).toBe(500 - 85);
    expect(events.filter((event) => event.kind === "status-applied")).toHaveLength(3);
  });
});
