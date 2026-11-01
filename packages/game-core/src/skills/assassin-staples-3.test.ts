import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * Assassin staples 3 (#1580): Golden Lotus Strike, Golden Phoenix
 * Strike, Exhausting Assault, Mantis Touch, Palm Strike, Signet of Toxic
 * Shock and Beguiling Haze. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["assassin.dagger-mastery", 12],
  ["assassin.deadly-arts", 12],
  ["assassin.shadow-arts", 12],
  ["assassin.critical-strikes", 12],
]);

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function assassin(): Combatant {
  return makeCombatant({
    id: "a",
    team: 0,
    energy: 10,
    equipment: {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.daggers,
        attributeId: "assassin.dagger-mastery",
        damageType: WEAPONS.daggers.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    attributeRanks: RANKS,
  });
}

const body = (id: string, team = 1): Combatant =>
  makeCombatant({ id, team, health: 1e6, maxHealth: 1e6 });

/** A Golden Phoenix Strike's enchantment on `caster`. */
function enchant(caster: Combatant): Combatant {
  caster.statuses.apply("mystic-regeneration", 15, caster.id, NO_RANKS);
  return caster;
}

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(
  skillId: string,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  return resolveAttackSkill(
    { skill: skill(skillId), caster, targets: [target], rng: steady(), rules: RULES, surroundings },
    () => false,
    [],
  );
}

/** `caster`'s non-attack skill `skillId` lands on `target`. */
function land(skillId: string, caster: Combatant, target: Combatant): CombatEvent[] {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  }).events;
}

const standing = (...placed: [Combatant, Vec2][]): Surroundings =>
  new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const missed = (events: readonly CombatEvent[], targetId: string): boolean =>
  events.some(
    (event) =>
      event.kind === "attack-missed" &&
      event.targetId === targetId &&
      event.reason === "out-of-sequence",
  );

const secondsOf = (target: Combatant, statusId: string): number | undefined =>
  [...target.statuses.active].find((status) => status.id === statusId)?.remainingSeconds;

/** `target` is casting `skillId`, with time left to cut. */
function casting(target: Combatant, skillId: string): Combatant {
  target.cast.beginCast(skillId, undefined, 3, undefined);
  return target;
}

/** A plain dagger blow's damage under `steady`: Fox Fangs' without its bonus. */
function plainBlow(): number {
  const caster = assassin();
  const foe = body("f");
  caster.chainMarks.set(foe.id, { role: "lead", remainingSeconds: 10 });
  const [blow] = damageTo(attack("assassin.fox-fangs", caster, foe), foe.id);
  return (blow ?? 0) - 22;
}

describe("the seven are the corpus's (#1580)", () => {
  it.each([
    ["assassin.golden-lotus-strike", 1026, "attack", false, "dagger-mastery", 5, 0, 5],
    ["assassin.golden-phoenix-strike", 989, "attack", false, "dagger-mastery", 5, 0, 8],
    ["assassin.exhausting-assault", 975, "attack", false, "dagger-mastery", 5, 0.5, 8],
    ["assassin.mantis-touch", 974, "skill", false, "deadly-arts", 5, 0.75, 10],
    ["assassin.palm-strike", 1045, "skill", true, "critical-strikes", 5, 0.75, 7],
    ["assassin.beguiling-haze", 799, "spell", true, "shadow-arts", 10, 0.25, 20],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `assassin.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: type === "spell" ? RANGE_SPELL : RANGE_MELEE,
      });
    },
  );

  it("Signet of Toxic Shock: gwId 1647, a free signet, 1 s, 15 s recharge", () => {
    expect(skill("assassin.signet-of-toxic-shock")).toMatchObject({
      gwId: 1647,
      type: "signet",
      elite: false,
      attributeId: "assassin.deadly-arts",
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 15,
    });
  });

  it("says Mantis Touch and Palm Strike count as off-hand attacks", () => {
    for (const id of ["assassin.mantis-touch", "assassin.palm-strike"]) {
      const texts = describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
      expect(texts, id).toContain("Counts as an off-hand attack");
    }
  });

  it("says Exhausting Assault's target suffers 10 overcast", () => {
    const texts = describeSkill(skill("assassin.exhausting-assault"), RANKS).effects.map(
      ({ text }) => text,
    );
    expect(texts.join(" ")).toMatch(/target suffers 10 overcast/);
  });
});

describe("Golden Lotus Strike", () => {
  it("strikes for +17 and opens a chain", () => {
    const caster = assassin();
    const foe = body("f");
    expect(damageTo(attack("assassin.golden-lotus-strike", caster, foe), foe.id)).toEqual([
      plainBlow() + 17,
    ]);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("lead");
  });

  it("gives 7 energy only to an enchanted Assassin", () => {
    const bare = assassin();
    attack("assassin.golden-lotus-strike", bare, body("f"));
    expect(bare.energy).toBe(10);
    const enchanted = enchant(assassin());
    attack("assassin.golden-lotus-strike", enchanted, body("f"));
    expect(enchanted.energy).toBe(17);
  });
});

describe("Golden Phoenix Strike", () => {
  it("misses an unenchanted Assassin's foe: no damage, no splash, no mark", () => {
    const caster = assassin();
    const foe = body("f");
    const near = body("n");
    const events = attack(
      "assassin.golden-phoenix-strike",
      caster,
      foe,
      standing([caster, vec2(0, 0)], [foe, vec2(30, 0)], [near, vec2(30, 30)]),
    );
    expect(missed(events, foe.id)).toBe(true);
    expect(damageTo(events, foe.id)).toEqual([]);
    expect(damageTo(events, near.id)).toEqual([]);
    expect(caster.chainMarks.has(foe.id)).toBe(false);
  });

  it("enchanted, strikes for +26, opens a chain, and hurts adjacent foes for 26", () => {
    const caster = enchant(assassin());
    const foe = body("f");
    const near = body("n");
    const far = body("x");
    const events = attack(
      "assassin.golden-phoenix-strike",
      caster,
      foe,
      standing(
        [caster, vec2(0, 0)],
        [foe, vec2(30, 0)],
        [near, vec2(30, AREA_ADJACENT - 5)],
        [far, vec2(30, AREA_ADJACENT * 3)],
      ),
    );
    expect(damageTo(events, foe.id)[0]).toBe(plainBlow() + 26);
    expect(damageTo(events, near.id)).toEqual([26]);
    expect(damageTo(events, far.id)).toEqual([]);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("off-hand");
  });
});

describe("Exhausting Assault", () => {
  it("misses out of sequence without a lead mark, even after Mantis Touch", () => {
    const caster = assassin();
    const foe = casting(body("f"), "elementalist.fireball");
    expect(missed(attack("assassin.exhausting-assault", caster, foe), foe.id)).toBe(true);
    land("assassin.mantis-touch", caster, foe);
    expect(missed(attack("assassin.exhausting-assault", caster, foe), foe.id)).toBe(true);
    expect(foe.cast.activeCast?.skillId).toBe("elementalist.fireball");
    expect(foe.overcast).toBe(0);
  });

  it("after a lead, strikes twice, cuts the spell once and leaves 10 overcast", () => {
    const caster = assassin();
    const foe = casting(body("f"), "elementalist.fireball");
    attack("assassin.golden-lotus-strike", caster, foe);
    const events = attack("assassin.exhausting-assault", caster, foe);
    expect(damageTo(events, foe.id)).toHaveLength(2);
    expect(events.filter((event) => event.kind === "interrupted")).toHaveLength(1);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(foe.overcast).toBe(10);
  });

  it("cuts a chant with no overcast: a chant is not a spell", () => {
    const caster = assassin();
    const foe = casting(body("f"), "paragon.anthem-of-flame");
    attack("assassin.golden-lotus-strike", caster, foe);
    const events = attack("assassin.exhausting-assault", caster, foe);
    expect(events.filter((event) => event.kind === "interrupted")).toHaveLength(1);
    expect(foe.overcast).toBe(0);
  });
});

describe("Mantis Touch", () => {
  it("cripples for 17 s and leaves an off-hand mark Death Blossom follows", () => {
    const caster = assassin();
    const foe = body("f");
    land("assassin.mantis-touch", caster, foe);
    expect(secondsOf(foe, "crippled")).toBe(17);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("off-hand");
    const events = attack("assassin.death-blossom", caster, foe);
    expect(missed(events, foe.id)).toBe(false);
    expect(damageTo(events, foe.id).length).toBeGreaterThan(0);
  });
});

describe("Palm Strike", () => {
  it("deals 54, cripples for 4 s and counts as an off-hand attack", () => {
    const caster = assassin();
    const foe = body("f");
    const events = land("assassin.palm-strike", caster, foe);
    expect(damageTo(events, foe.id)).toEqual([54]);
    expect(secondsOf(foe, "crippled")).toBe(4);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("off-hand");
  });
});

describe("Signet of Toxic Shock", () => {
  it("deals 82 to a poisoned foe and nothing to a clean one", () => {
    const poisoned = body("p");
    poisoned.statuses.apply("poison", 10, "x", NO_RANKS);
    expect(damageTo(land("assassin.signet-of-toxic-shock", assassin(), poisoned), "p")).toEqual([
      82,
    ]);
    const clean = body("c");
    expect(damageTo(land("assassin.signet-of-toxic-shock", assassin(), clean), "c")).toEqual([]);
  });
});

describe("Beguiling Haze", () => {
  it("steps the Assassin to the foe and dazes it for 8 s", () => {
    const caster = assassin();
    const foe = body("f");
    const events = land("assassin.beguiling-haze", caster, foe);
    expect(events).toContainEqual({ kind: "shadow-stepped", targetId: caster.id, toId: foe.id });
    expect(secondsOf(foe, "dazed")).toBe(8);
  });
});
