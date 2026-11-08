import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import { getStatusDefinition, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Magnitude, Skill } from "./types.js";
import { criticalChance, doubleStrikeChance, weaponSnapshotOf } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Single-skill mechanics (#2504): Scorpion Wire, Expunge Enchantments,
 * Locust's Fury, Second Wind, Spirit Siphon, Ghostly Haste and Way of the
 * Master. Each the corpus's record, each scaled number at ranks 0 and 12,
 * and one behaviour each; what needs a match is in
 * `match/mechanics-offence-singles.test.ts`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const ATTRIBUTES = [
  "assassin.deadly-arts",
  "assassin.critical-strikes",
  "assassin.dagger-mastery",
  "ritualist.channeling-magic",
  "ritualist.spawning-power",
  "warrior.swordsmanship",
];
const ranksAt = (rank: number): ReadonlyMap<string, number> =>
  new Map(ATTRIBUTES.map((id) => [id, rank]));

/** A float stream of 0.9: nothing left to chance happens. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function holding(weapon: "daggers" | "sword"): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId: weapon === "daggers" ? "assassin.dagger-mastery" : "warrior.swordsmanship",
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function use(skillId: string, caster: Combatant, targets: Combatant[]): CombatEvent[] {
  return applySkillEffects({
    skill: skill(skillId),
    caster,
    targets,
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  });
}

/** `bearer` wearing `statusId` for a minute, from itself, at `rank`. */
function wearing(bearer: Combatant, statusId: StatusId, rank = 12): Combatant {
  bearer.statuses.apply(statusId, 60, bearer.id, ranksAt(rank));
  return bearer;
}

/** The first magnitude of `kind` in `skillId`'s effects, at `rank`. */
function scaled(
  skillId: string,
  pick: (effect: Skill["effects"][number]) => Magnitude | undefined,
  rank: number,
): number {
  for (const effect of skill(skillId).effects) {
    const magnitude = pick(effect);
    if (magnitude !== undefined) {
      return resolveMagnitudeAtRanks(magnitude, ranksAt(rank));
    }
  }
  throw new Error(`no magnitude in ${skillId}`);
}

/** `skillId`'s tooltip at 12, its effects' lines joined. */
const described = (skillId: string): string =>
  describeSkill(skill(skillId), ranksAt(12), EN_WORDS, EN_NAMES)
    .effects.map(({ text }) => text)
    .join("; ");

const duration = (effect: Skill["effects"][number]): Magnitude | undefined =>
  effect.kind === "apply-status" ? effect.durationSeconds : undefined;

describe("the corpus's record (#2504)", () => {
  it.each([
    [
      "assassin.scorpion-wire",
      815,
      "hex",
      "assassin.deadly-arts",
      false,
      5,
      1,
      10,
      RANGE_SPELL / 2,
    ],
    [
      "assassin.expunge-enchantments",
      990,
      "skill",
      "assassin.deadly-arts",
      false,
      10,
      0.75,
      30,
      RANGE_MELEE,
    ],
    [
      "assassin.locusts-fury",
      1030,
      "enchantment",
      "assassin.critical-strikes",
      true,
      10,
      0.5,
      10,
      RANGE_SPELL,
    ],
    ["elementalist.second-wind", 1088, "spell", undefined, true, 5, 1, 5, RANGE_SPELL],
    [
      "ritualist.spirit-siphon",
      1228,
      "spell",
      "ritualist.channeling-magic",
      false,
      5,
      0.25,
      3,
      RANGE_SPELL,
    ],
    [
      "ritualist.ghostly-haste",
      1244,
      "enchantment",
      "ritualist.spawning-power",
      false,
      10,
      1,
      20,
      RANGE_SPELL,
    ],
    [
      "assassin.way-of-the-master",
      2187,
      "enchantment",
      "assassin.critical-strikes",
      false,
      5,
      0.25,
      30,
      RANGE_SPELL,
    ],
  ] as const)(
    "%s is %i, a %s of %s, elite %s, %i Energy, %f s, %i s recharge",
    (id, gwId, type, attributeId, elite, energy, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );

  it.each([
    ["assassin.scorpion-wire", 8, 18],
    ["assassin.locusts-fury", 10, 30],
    ["ritualist.ghostly-haste", 5, 25],
    ["assassin.way-of-the-master", 60, 60],
  ] as const)("%s lasts %f s at 0 and %f s at 12", (id, atZero, atTwelve) => {
    expect(scaled(id, duration, 0)).toBeCloseTo(atZero, 9);
    expect(scaled(id, duration, 12)).toBeCloseTo(atTwelve, 9);
  });
});

describe("Scorpion Wire (#2504)", () => {
  it("fires past 75', GW1's 900 of earshot's 1,012: 311, and ends", () => {
    const definition = getStatusDefinition("scorpion-wire");
    expect(definition.triggers).toMatchObject([
      { on: "source-bearer-apart", apartBeyond: 311, target: "bearer" },
    ]);
    expect(Math.round((AREA_EARSHOT * 900) / 1012)).toBe(311);
    expect(definition.endsWhenTriggered).toBe(true);
    expect(described("assassin.scorpion-wire")).toContain(
      "the next time it is more than 311 from you: shadow steps to the target, and knocks down for 2s",
    );
  });
});

describe("Expunge Enchantments (#2504)", () => {
  const disable = (effect: Skill["effects"][number]): Magnitude | undefined =>
    effect.kind === "disable-own-skills" ? effect.seconds : undefined;

  it("disables for 8 s at 0, falling to 5 s at 12", () => {
    expect(scaled("assassin.expunge-enchantments", disable, 0)).toBeCloseTo(8, 9);
    expect(scaled("assassin.expunge-enchantments", disable, 12)).toBeCloseTo(5, 9);
  });

  it("strips 1, and 1 more for each other non-attack skill it disables", () => {
    const caster = makeCombatant({
      id: "a",
      team: 0,
      attributeRanks: ranksAt(12),
      skillBar: [
        "assassin.expunge-enchantments",
        "elementalist.fireball",
        "assassin.way-of-the-assassin",
        "assassin.jagged-strike",
      ],
    });
    const foe = makeCombatant({ id: "f", team: 1 });
    for (const id of [
      "locusts-fury",
      "way-of-the-master",
      "ghostly-haste",
      "ether-prodigy",
    ] as const) {
      foe.statuses.apply(id, 60, "f", ranksAt(0));
    }

    const events = use("assassin.expunge-enchantments", caster, [foe]);

    const disabled = events.flatMap((event) =>
      event.kind === "skill-disabled" ? [event.skillId] : [],
    );
    expect(disabled).toEqual(["elementalist.fireball", "assassin.way-of-the-assassin"]);
    expect(foe.statuses.countByCategory("enchantment")).toBe(1);
  });

  it("with no other non-attack skill, strips only the 1", () => {
    const caster = makeCombatant({
      id: "a",
      team: 0,
      attributeRanks: ranksAt(12),
      skillBar: ["assassin.expunge-enchantments", "assassin.jagged-strike"],
    });
    const foe = makeCombatant({ id: "f", team: 1 });
    foe.statuses.apply("locusts-fury", 60, "f", ranksAt(0));
    foe.statuses.apply("way-of-the-master", 60, "f", ranksAt(0));

    use("assassin.expunge-enchantments", caster, [foe]);

    expect(foe.statuses.countByCategory("enchantment")).toBe(1);
    expect(described("assassin.expunge-enchantments")).toContain(
      "All of your other non-attack skills are disabled",
    );
  });
});

describe("Locust's Fury (#2504)", () => {
  it("adds 50% to the daggers' chance to double strike, and nothing with a sword", () => {
    const daggers = makeCombatant({
      id: "a",
      equipment: holding("daggers"),
      attributeRanks: ranksAt(0),
    });
    const before = doubleStrikeChance(daggers, WEAPONS.daggers);
    wearing(daggers, "locusts-fury");
    expect(doubleStrikeChance(daggers, WEAPONS.daggers) - before).toBeCloseTo(0.5, 9);

    const sword = wearing(
      makeCombatant({ id: "b", equipment: holding("sword"), attributeRanks: ranksAt(0) }),
      "locusts-fury",
    );
    expect(doubleStrikeChance(sword, WEAPONS.sword)).toBe(0);
  });

  it("never past certain", () => {
    const daggers = wearing(
      makeCombatant({ id: "a", equipment: holding("daggers"), attributeRanks: ranksAt(16) }),
      "locusts-fury",
    );
    daggers.statuses.apply("locusts-fury", 60, "x", ranksAt(16));
    expect(doubleStrikeChance(daggers, WEAPONS.daggers)).toBeLessThanOrEqual(1);
  });
});

describe("Second Wind (#2504)", () => {
  it("gives 1 Energy and 5 Health for each point of Overcast, then strips every enchantment", () => {
    const caster = makeCombatant({ id: "e", team: 0, energy: 10, maxEnergy: 50, health: 300 });
    caster.overcast = 7;
    caster.statuses.apply("ether-prodigy", 60, "e", ranksAt(0));
    caster.statuses.apply("way-of-the-master", 60, "e", ranksAt(0));

    use("elementalist.second-wind", caster, [caster]);

    expect(caster.energy).toBe(17);
    expect(caster.health).toBe(335);
    expect(caster.statuses.countByCategory("enchantment")).toBe(0);
  });

  it("with no Overcast, gives nothing and still strips", () => {
    const caster = makeCombatant({ id: "e", team: 0, energy: 10, maxEnergy: 50, health: 300 });
    caster.statuses.apply("ether-prodigy", 60, "e", ranksAt(0));

    use("elementalist.second-wind", caster, [caster]);

    expect(caster.energy).toBe(10);
    expect(caster.health).toBe(300);
    expect(caster.statuses.countByCategory("enchantment")).toBe(0);
  });
});

describe("Spirit Siphon (#2504)", () => {
  const share = (effect: Skill["effects"][number]): Magnitude | undefined =>
    effect.kind === "drain-nearest-spirit-energy" ? effect.percent : undefined;

  it("gives 30% at 0 and 54% at 12", () => {
    expect(scaled("ritualist.spirit-siphon", share, 0)).toBeCloseTo(30, 9);
    expect(scaled("ritualist.spirit-siphon", share, 12)).toBeCloseTo(54, 9);
  });
});

describe("Ghostly Haste (#2504)", () => {
  it("takes 25% off a spell's recharge in earshot of a spirit, and says so", () => {
    expect(getStatusDefinition("ghostly-haste").spellRechargeFasterNearSpirit).toBe(0.25);
    expect(described("ritualist.ghostly-haste")).toContain(
      "spells cast in earshot of a spirit recharge 25% faster",
    );
  });
});

describe("Way of the Master (#2504)", () => {
  const bonus = (bearer: Combatant): number => {
    const bare = criticalChance(weaponSnapshotOf(bearer), RULES);
    wearing(bearer, "way-of-the-master", bearer.attributeRanks.get("assassin.critical-strikes"));
    return criticalChance(weaponSnapshotOf(bearer), RULES) - bare;
  };

  it.each([
    [0, 0.03],
    [12, 0.27],
  ])("at Critical Strikes %i adds %f to a sword's crit chance", (rank, added) => {
    const sword = makeCombatant({
      id: "a",
      equipment: holding("sword"),
      attributeRanks: ranksAt(rank),
    });
    expect(bonus(sword)).toBeCloseTo(added, 9);
  });

  it("adds nothing with daggers, nor empty-handed", () => {
    const daggers = makeCombatant({
      id: "a",
      equipment: holding("daggers"),
      attributeRanks: ranksAt(12),
    });
    expect(bonus(daggers)).toBe(0);
    const bare = makeCombatant({
      id: "b",
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      attributeRanks: ranksAt(12),
    });
    expect(bonus(bare)).toBe(0);
  });

  it("says which weapon it is not", () => {
    expect(described("assassin.way-of-the-master")).toContain(
      "while holding a weapon other than daggers",
    );
  });
});
