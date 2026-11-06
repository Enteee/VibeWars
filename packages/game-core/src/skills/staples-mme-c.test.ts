import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { aggregateModifiers, getStatusDefinition, NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import { attackDamageDeltaOf } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mesmer, Monk and Elementalist staples (#2367): Shared Burden, Signet of
 * Clumsiness, Healing Ribbon, Strength of Honor, Earthen Shackles, Ether
 * Prism and Slippery Ground, each scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "mesmer.illusion-magic",
  "monk.healing-prayers",
  "monk.smiting-prayers",
  "elementalist.earth-magic",
  "elementalist.energy-storage",
  "elementalist.water-magic",
];
const R12: ReadonlyMap<string, number> = new Map(ATTRIBUTES.map((id) => [id, 12]));
const R0: ReadonlyMap<string, number> = new Map();

const BURDEN = "mesmer.shared-burden";
const CLUMSINESS = "mesmer.signet-of-clumsiness";
const RIBBON = "monk.healing-ribbon";
const HONOR = "monk.strength-of-honor";
const SHACKLES = "elementalist.earthen-shackles";
const PRISM = "elementalist.ether-prism";
const SLIPPERY = "elementalist.slippery-ground";

const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
const SWORD: ResolvedEquipment = {
  ...unarmed,
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};
const BOW: ResolvedEquipment = {
  ...unarmed,
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const caster = (ranks: ReadonlyMap<string, number>): Combatant =>
  makeCombatant({ id: "c", team: 0, energy: 30, attributeRanks: ranks });
const foe = (id: string): Combatant => makeCombatant({ id, team: 1, health: 500, maxHealth: 500 });
const ally = (id: string): Combatant => makeCombatant({ id, team: 0, health: 100, maxHealth: 500 });

/** `skillId` lands on `target` at the origin, `by` and `others` where given. */
function use(
  skillId: string,
  by: Combatant,
  target: Combatant,
  others: readonly (readonly [Combatant, Vec2])[] = [],
): CombatEvent[] {
  const placed = [[by, vec2(-200, 0)] as const, [target, vec2(0, 0)] as const, ...others];
  return resolveSkillEffects({
    surroundings: new Map(
      placed.map(([combatant, position]) => [
        combatant.id,
        { combatant, position, creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster: by,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  }).events;
}

function damages(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

function autoAttacking(combatant: Combatant): Combatant {
  combatant.attack = { targetId: "c", swingElapsed: 0, unreachableSeconds: 0 };
  return combatant;
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  attributeRanks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment: unarmed,
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `c` with `bar` at `ranks`; `foe`, `near` beside it and `far` beyond every area. */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number>) {
  return new MatchSimulation({
    seed: "staples-mme-c",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("foe", 1, vec2(100, 0), [], R0),
      spec("near", 1, vec2(100 + AREA_NEARBY - 10, 0), [], R0),
      spec("far", 1, vec2(100 + AREA_NEARBY + 100, 0), [], R0),
    ],
  });
}

function get(match: MatchSimulation, id: string): Combatant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

describe("the seven are the corpus's (#2367)", () => {
  it.each([
    [BURDEN, 900, "hex", true, 10, 2, 20, "mesmer.illusion-magic", "single-enemy"],
    [
      CLUMSINESS,
      1657,
      "signet",
      false,
      undefined,
      0.25,
      12,
      "mesmer.illusion-magic",
      "single-enemy",
    ],
    [RIBBON, 2062, "spell", false, 10, 1, 5, "monk.healing-prayers", "single-other-ally"],
    [HONOR, 243, "enchantment", false, 10, 2, 15, "monk.smiting-prayers", "single-ally"],
    [SHACKLES, 2000, "hex", false, 10, 1, 15, "elementalist.earth-magic", "single-enemy"],
    [PRISM, 1377, "skill", true, 5, 0, 20, "elementalist.energy-storage", "self"],
    [SLIPPERY, 2191, "spell", false, 5, 1, 15, "elementalist.water-magic", "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, attributeId, target) => {
      const found = skill(id);
      expect(found).toMatchObject({
        gwId,
        type,
        elite,
        activationSeconds,
        rechargeSeconds,
        attributeId,
        target,
        range: RANGE_SPELL,
        overcast: 0,
      });
      expect(found.cost).toEqual(
        energy === undefined ? undefined : { kind: "energy", amount: energy },
      );
    },
  );

  it("Strength of Honor is maintained, and Slippery Ground fails half the time below Water Magic 5", () => {
    expect(skill(HONOR).effects).toEqual([
      { kind: "maintain-status", on: "target", statusId: "strength-of-honor" },
    ]);
    expect(skill(SLIPPERY).failChanceUnless).toEqual({
      attributeId: "elementalist.water-magic",
      rank: 5,
      chance: 0.5,
    });
  });
});

describe("Shared Burden (#2367)", () => {
  it.each([
    ["rank 12", R12, 17],
    ["rank 0", R0, 5],
  ])("at %s, hexes the target and foes in the area for its seconds", (_, ranks, seconds) => {
    const target = foe("f");
    const near = foe("n");
    const far = foe("x");
    const friend = ally("a");
    use(BURDEN, caster(ranks), target, [
      [near, vec2(AREA_IN_THE_AREA - 10, 0)],
      [far, vec2(AREA_IN_THE_AREA + 50, 0)],
      [friend, vec2(10, 0)],
    ]);
    for (const hit of [target, near]) {
      expect(hit.statuses.get("shared-burden")?.durationSeconds).toBe(seconds);
    }
    expect(far.statuses.has("shared-burden")).toBe(false);
    expect(friend.statuses.has("shared-burden")).toBe(false);
  });

  it("slows moving, attacking and casting by a third", () => {
    const target = foe("f");
    use(BURDEN, caster(R12), target);
    const mods = aggregateModifiers(target.statuses.active);
    expect(mods.moveSpeedMultiplier).toBe(0.67);
    expect(mods.attackDurationMultiplier).toBe(1.33);
    expect(mods.castTimeMultiplier).toBe(1.33);
  });
});

describe("Signet of Clumsiness (#2367)", () => {
  it.each([
    ["rank 12", R12, 51],
    ["rank 0", R0, 15],
  ])(
    "at %s, an attacking target and its adjacent foes are interrupted and take its damage",
    (_, ranks, damage) => {
      const target = autoAttacking(foe("f"));
      const swinging = foe("s");
      swinging.cast.beginCast("warrior.power-attack", "c", 1, undefined);
      const idle = foe("i");
      const far = foe("x");
      const events = use(CLUMSINESS, caster(ranks), target, [
        [swinging, vec2(AREA_ADJACENT - 5, 0)],
        [idle, vec2(0, AREA_ADJACENT - 5)],
        [far, vec2(AREA_ADJACENT + 50, 0)],
      ]);
      for (const hit of ["f", "s", "i"]) {
        expect(damages(events, hit), hit).toEqual([damage]);
      }
      expect(damages(events, "x")).toEqual([]);
      // Only the one using an attack skill falls.
      expect(swinging.knockdownRemaining).toBeGreaterThan(0);
      expect(target.knockdownRemaining).toBe(0);
      expect(idle.knockdownRemaining).toBe(0);
      expect(swinging.cast.activeCast).toBeUndefined();
    },
  );

  it("does nothing to a target that is not attacking", () => {
    const target = foe("f");
    const swinging = foe("s");
    swinging.cast.beginCast("warrior.power-attack", "c", 1, undefined);
    const events = use(CLUMSINESS, caster(R12), target, [[swinging, vec2(AREA_ADJACENT - 5, 0)]]);
    expect(events.filter((event) => event.kind === "damage")).toEqual([]);
    expect(swinging.knockdownRemaining).toBe(0);
    expect(swinging.cast.activeCast?.skillId).toBe("warrior.power-attack");
  });
});

describe("Healing Ribbon (#2367)", () => {
  it.each([
    ["rank 12", R12, 92, 82],
    ["rank 0", R0, 20, 10],
  ])("at %s, heals the target and up to 2 allies near it", (_, ranks, main, splash) => {
    const target = ally("t");
    const [a, b, d] = [ally("a"), ally("b"), ally("d")];
    const far = ally("x");
    use(RIBBON, caster(ranks), target, [
      [a, vec2(AREA_NEARBY - 10, 0)],
      [b, vec2(0, AREA_NEARBY - 10)],
      [d, vec2(-(AREA_NEARBY - 10), 0)],
      [far, vec2(AREA_NEARBY + 100, 0)],
    ]);
    expect(target.health).toBe(100 + main);
    const healed = [a, b, d].filter((each) => each.health > 100);
    expect(healed).toHaveLength(2);
    for (const each of healed) {
      expect(each.health).toBe(100 + splash);
    }
    expect(far.health).toBe(100);
  });
});

describe("Strength of Honor (#2367)", () => {
  it.each([
    ["rank 12", R12, 4],
    ["rank 0", R0, 1],
  ])("at %s, the ally's melee attacks deal its damage more", (_, ranks, more) => {
    const target = makeCombatant({ id: "t", team: 0, equipment: SWORD });
    use(HONOR, caster(ranks), target);
    expect(target.statuses.has("strength-of-honor")).toBe(true);
    expect(attackDamageDeltaOf(target)).toBe(more);
  });

  it("gives a bow nothing", () => {
    const target = makeCombatant({ id: "t", team: 0, equipment: BOW });
    use(HONOR, caster(R12), target);
    expect(target.statuses.has("strength-of-honor")).toBe(true);
    expect(attackDamageDeltaOf(target)).toBe(0);
  });
});

describe("Earthen Shackles (#2367)", () => {
  it.each([
    ["rank 12", R12, 17],
    ["rank 0", R0, 5],
  ])(
    "at %s, slows the target and nearby foes 90% for 3 s, then weakens them for its seconds",
    (_, ranks, seconds) => {
      const match = arena([SHACKLES], ranks);
      match.setTarget("c", "foe");
      expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
      stepFor(match, 1.05);
      for (const id of ["foe", "near"]) {
        const hit = get(match, id);
        expect(hit.statuses.has("earthen-shackles"), id).toBe(true);
        expect(aggregateModifiers(hit.statuses.active).moveSpeedMultiplier).toBe(0.1);
        expect(hit.statuses.has("weakness")).toBe(false);
      }
      expect(get(match, "far").statuses.has("earthen-shackles")).toBe(false);
      stepFor(match, 3);
      for (const id of ["foe", "near"]) {
        const hit = get(match, id);
        expect(hit.statuses.has("earthen-shackles"), id).toBe(false);
        expect(hit.statuses.get("weakness")?.durationSeconds, id).toBe(seconds);
      }
      expect(get(match, "far").statuses.has("weakness")).toBe(false);
    },
  );
});

describe("Ether Prism (#2367)", () => {
  it.each([
    ["rank 12", R12, 17],
    ["rank 0", R0, 5],
  ])("at %s, a quarter of the damage for 3 s, then its energy", (_, ranks, energy) => {
    const match = arena([PRISM], ranks);
    const c = get(match, "c");
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
    stepFor(match, DT);
    expect(aggregateModifiers(c.statuses.active).damageTakenMultiplier).toBe(0.25);
    c.energy = 10;
    stepFor(match, 3.1);
    expect(c.statuses.has("ether-prism")).toBe(false);
    expect(Math.floor(c.energy)).toBe(10 + energy);
  });

  it("cannot be stripped: it is a skill effect", () => {
    expect(getStatusDefinition("ether-prism").category).toBe("skill-effect");
  });
});

describe("Slippery Ground (#2367)", () => {
  it("knocks down a target that is moving, or Blind", () => {
    const moving = foe("m");
    moving.moving = true;
    use(SLIPPERY, caster(R12), moving);
    expect(moving.knockdownRemaining).toBeGreaterThan(0);

    const blind = foe("b");
    blind.statuses.apply("blind", 5, "c", NO_RANKS);
    use(SLIPPERY, caster(R12), blind);
    expect(blind.knockdownRemaining).toBeGreaterThan(0);
  });

  it("leaves a still, seeing target standing, and never reaches its neighbours", () => {
    const still = foe("s");
    const beside = foe("n");
    beside.moving = true;
    use(SLIPPERY, caster(R12), still, [[beside, vec2(AREA_ADJACENT - 5, 0)]]);
    expect(still.knockdownRemaining).toBe(0);
    expect(beside.knockdownRemaining).toBe(0);
  });
});
