import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent, type SkillOutcome } from "./effects.js";
import { statAt } from "./scaling.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { attackDamageDeltaOf } from "./tick.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * Mesmer, Monk and Elementalist staples (#2367): Shared Burden, Signet of
 * Clumsiness, Healing Ribbon, Strength of Honor, Frigid Armor, Earthen
 * Shackles, Ether Prism and Slippery Ground. The corpus's numbers, at
 * rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "mesmer.illusion-magic",
  "monk.healing-prayers",
  "monk.smiting-prayers",
  "elementalist.water-magic",
  "elementalist.earth-magic",
  "elementalist.energy-storage",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

const BURDEN = "mesmer.shared-burden";
const CLUMSINESS = "mesmer.signet-of-clumsiness";
const RIBBON = "monk.healing-ribbon";
const HONOR = "monk.strength-of-honor";
const FRIGID = "elementalist.frigid-armor";
const SHACKLES = "elementalist.earthen-shackles";
const PRISM = "elementalist.ether-prism";
const SLIPPERY = "elementalist.slippery-ground";

const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `caster` lands `id` on `target` among `surroundings`. */
function land(
  id: string,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings,
): SkillOutcome {
  return resolveSkillEffects({
    skill: skill(id),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES.combat,
    surroundings,
  });
}

function wielding(weapon: Weapon): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId: "warrior.swordsmanship",
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function foe(id: string): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1e4, health: 1e4 });
}

function ally(id: string): Combatant {
  return makeCombatant({ id, maxHealth: 1e4, health: 100 });
}

function of(events: readonly CombatEvent[], kind: CombatEvent["kind"]): [string, number][] {
  return events.flatMap((event) =>
    event.kind === kind && "amount" in event && "targetId" in event
      ? [[event.targetId, event.amount] as [string, number]]
      : [],
  );
}

/**
 * Caster `c` at the origin; target `t` a spell's range away; `adjacent`
 * beside it; `nearby`, near it but not adjacent; `area`, in the area but
 * not nearby; `far`, beyond the area.
 */
function scene(rank: number, make: (id: string) => Combatant = foe) {
  const c = makeCombatant({ id: "c", attributeRanks: ranked(rank) });
  const t = make("t");
  const adjacent = make("adjacent");
  const nearby = make("nearby");
  const area = make("area");
  const far = make("far");
  const surroundings = placed(
    [c, vec2(0, 0)],
    [t, vec2(RANGE_SPELL * 0.8, 0)],
    [adjacent, vec2(RANGE_SPELL * 0.8, AREA_ADJACENT * 0.8)],
    [nearby, vec2(RANGE_SPELL * 0.8, -AREA_NEARBY * 0.9)],
    [area, vec2(RANGE_SPELL * 0.8 + AREA_IN_THE_AREA * 0.9, 0)],
    [far, vec2(RANGE_SPELL * 0.8, AREA_IN_THE_AREA * 1.5)],
  );
  return { c, t, adjacent, nearby, area, far, surroundings };
}

describe("the eight are the corpus's (#2367)", () => {
  it.each([
    // The PvP records' numbers (3186, 3193, 2999, 3398) on the base ids.
    [BURDEN, 900, "hex", true, "mesmer.illusion-magic", 10, 2, 20],
    [CLUMSINESS, 1657, "signet", false, "mesmer.illusion-magic", 0, 0.25, 12],
    [RIBBON, 2062, "spell", false, "monk.healing-prayers", 10, 1, 5],
    [HONOR, 243, "enchantment", false, "monk.smiting-prayers", 10, 2, 15],
    [FRIGID, 1261, "enchantment", false, "elementalist.water-magic", 5, 1, 20],
    [SHACKLES, 2000, "hex", false, "elementalist.earth-magic", 10, 1, 15],
    [PRISM, 1377, "skill", true, "elementalist.energy-storage", 5, 0, 20],
    [SLIPPERY, 2191, "spell", false, "elementalist.water-magic", 5, 1, 15],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attributeId, energy, activationSeconds, rechargeSeconds) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
      });
    },
  );
});

describe("Shared Burden (#2367)", () => {
  it.each([
    [12, 17],
    [0, 5],
  ])("at rank %i hexes the target and every foe in the area for %i s", (rank, seconds) => {
    const { c, t, adjacent, area, far, surroundings } = scene(rank);
    land(BURDEN, c, t, surroundings);
    for (const hexed of [t, adjacent, area]) {
      expect(hexed.statuses.get("shared-burden")?.remainingSeconds, hexed.id).toBe(seconds);
    }
    expect(far.statuses.has("shared-burden")).toBe(false);
    expect(c.statuses.has("shared-burden")).toBe(false);
  });

  it("slows moving, attacking and casting by a third", () => {
    expect(getStatusDefinition("shared-burden")).toMatchObject({
      moveSpeedMultiplier: 0.67,
      attackDurationMultiplier: 1.33,
      castTimeMultiplier: 1.33,
    });
  });
});

describe("Signet of Clumsiness (#2367)", () => {
  it.each([
    [12, 51],
    [0, 15],
  ])(
    "at rank %i on an attacking foe: it and adjacent foes are interrupted and take %i",
    (rank, damage) => {
      const { c, t, adjacent, nearby, surroundings } = scene(rank);
      t.attack = { targetId: "c", swingElapsed: 0, unreachableSeconds: 0 };
      const { events } = land(CLUMSINESS, c, t, surroundings);
      expect(of(events, "damage")).toEqual([
        ["t", damage],
        ["adjacent", damage],
      ]);
      expect(t.attack).toBeUndefined();
      expect(nearby.health).toBe(1e4);
      expect(adjacent.health).toBe(1e4 - damage);
    },
  );

  it("knocks down only those using an attack skill, picked before the interrupt", () => {
    const { c, t, adjacent, surroundings } = scene(12);
    t.cast.beginCast("warrior.wild-blow", "c", 1, undefined);
    adjacent.attack = { targetId: "c", swingElapsed: 0, unreachableSeconds: 0 };
    land(CLUMSINESS, c, t, surroundings);
    expect(t.knockdownRemaining).toBeGreaterThan(0);
    expect(adjacent.knockdownRemaining).toBe(0);
    expect(t.cast.activeCast).toBeUndefined();
  });

  it("does nothing to a foe that is not attacking", () => {
    const { c, t, adjacent, surroundings } = scene(12);
    adjacent.attack = { targetId: "c", swingElapsed: 0, unreachableSeconds: 0 };
    const { events } = land(CLUMSINESS, c, t, surroundings);
    expect(of(events, "damage")).toEqual([]);
    expect(adjacent.health).toBe(1e4);
  });
});

describe("Healing Ribbon (#2367)", () => {
  it.each([
    [12, 92, 82],
    [0, 20, 10],
  ])(
    "at rank %i heals the target %i and the two allies nearest it %i",
    (rank, first, second) => {
      const { c, t, surroundings } = scene(rank, ally);
      const { events } = land(RIBBON, c, t, surroundings);
      expect(of(events, "heal")).toEqual([
        ["t", first],
        ["adjacent", second],
        ["nearby", second],
      ]);
    },
  );

  it("is cast only on another ally", () => {
    expect(skill(RIBBON).target).toBe("single-other-ally");
  });
});

describe("Strength of Honor (#2367)", () => {
  it.each([
    [12, 4],
    [0, 1],
  ])("at rank %i adds %i to the ally's melee attacks while maintained", (rank, more) => {
    const c = makeCombatant({ id: "c", attributeRanks: ranked(rank) });
    const swordsman = makeCombatant({ id: "s", equipment: wielding(WEAPONS.sword) });
    land(HONOR, c, swordsman, placed([c, vec2(0, 0)], [swordsman, vec2(100, 0)]));
    expect(swordsman.statuses.has("strength-of-honor")).toBe(true);
    expect(attackDamageDeltaOf(swordsman)).toBe(more);
  });

  it("gives a bow attack nothing", () => {
    const c = makeCombatant({ id: "c", attributeRanks: ranked(12) });
    const archer = makeCombatant({ id: "a", equipment: wielding(WEAPONS.longbow) });
    land(HONOR, c, archer, placed([c, vec2(0, 0)], [archer, vec2(100, 0)]));
    expect(archer.statuses.has("strength-of-honor")).toBe(true);
    expect(attackDamageDeltaOf(archer)).toBe(0);
  });
});

describe("Frigid Armor (#2367)", () => {
  it.each([
    [12, 22, 34],
    [0, 10, 10],
  ])("at rank %i lasts %i s for +%i armor against physical damage", (rank, seconds, armor) => {
    const c = makeCombatant({ id: "c", attributeRanks: ranked(rank) });
    land(FRIGID, c, c, placed([c, vec2(0, 0)]));
    const status = c.statuses.get("frigid-armor");
    expect(status?.remainingSeconds).toBe(seconds);
    const [physical] = getStatusDefinition("frigid-armor").conditionalArmor;
    expect(physical?.conditions).toEqual([{ kind: "vs-physical" }]);
    expect(statAt(physical?.amount ?? 0, status?.ranks ?? NO_RANKS)).toBe(armor);
  });

  it("refuses a new Burning, and ends one already on you as it begins", () => {
    const c = makeCombatant({ id: "c", attributeRanks: ranked(12) });
    c.statuses.apply("burning", 5, "f", NO_RANKS);
    land(FRIGID, c, c, placed([c, vec2(0, 0)]));
    expect(c.statuses.has("burning")).toBe(false);
    expect(c.statuses.apply("burning", 5, "f", NO_RANKS)).toBe(false);
  });
});

describe("Slippery Ground (#2367)", () => {
  it("knocks down a target foe that is moving or Blind, not one that is neither", () => {
    const moving = scene(12);
    moving.t.moving = true;
    land(SLIPPERY, moving.c, moving.t, moving.surroundings);
    expect(moving.t.knockdownRemaining).toBeGreaterThan(0);

    const blind = scene(12);
    blind.t.statuses.apply("blind", 5, "f", NO_RANKS);
    land(SLIPPERY, blind.c, blind.t, blind.surroundings);
    expect(blind.t.knockdownRemaining).toBeGreaterThan(0);

    const still = scene(12);
    land(SLIPPERY, still.c, still.t, still.surroundings);
    expect(still.t.knockdownRemaining).toBe(0);
  });

  it("knocks down no adjacent foe, as its PvP text reaches the target alone", () => {
    const { c, t, adjacent, surroundings } = scene(12);
    t.moving = true;
    adjacent.moving = true;
    land(SLIPPERY, c, t, surroundings);
    expect(adjacent.knockdownRemaining).toBe(0);
  });

  it("fails half the time with Water Magic 4 or less", () => {
    expect(skill(SLIPPERY).failChanceUnless).toEqual({
      attributeId: "elementalist.water-magic",
      rank: 5,
      chance: 0.5,
    });
  });
});

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e4,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `e`, an Elementalist at `rank` with `bar`, `f` in spell range, `n` near `f`. */
function match(bar: readonly string[], rank: number) {
  const sim = new MatchSimulation({
    seed: "staples-mme-c",
    participants: [
      spec("e", 0, vec2(0, 0), { skillBar: [...bar], attributeRanks: ranked(rank) }),
      spec("f", 1, vec2(RANGE_SPELL * 0.8, 0)),
      spec("n", 1, vec2(RANGE_SPELL * 0.8, AREA_NEARBY * 0.8)),
      spec("x", 1, vec2(RANGE_SPELL * 0.8, AREA_IN_THE_AREA * 1.5)),
    ],
  });
  const get = (id: string): Combatant => {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  };
  return { sim, get };
}

describe("Earthen Shackles (#2367)", () => {
  it.each([
    [12, 17],
    [0, 5],
  ])(
    "at rank %i slows the target and nearby foes for 3 s, then Weakens them for %i s",
    (rank, weakness) => {
      const { sim, get } = match([SHACKLES], rank);
      sim.setTarget("e", "f");
      expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
      stepFor(sim, 1.5);
      for (const id of ["f", "n"]) {
        expect(get(id).statuses.has("earthen-shackles"), id).toBe(true);
      }
      expect(get("x").statuses.has("earthen-shackles")).toBe(false);
      expect(getStatusDefinition("earthen-shackles").moveSpeedMultiplier).toBe(0.1);

      stepFor(sim, 3);
      for (const id of ["f", "n"]) {
        expect(get(id).statuses.has("earthen-shackles"), id).toBe(false);
        const weak = get(id).statuses.get("weakness")?.remainingSeconds ?? 0;
        expect(weak, id).toBeGreaterThan(weakness - 3);
        expect(weak, id).toBeLessThanOrEqual(weakness);
      }
    },
  );
});

describe("Ether Prism (#2367)", () => {
  it.each([
    [12, 17],
    [0, 5],
  ])("at rank %i cuts damage taken by 75% for 3 s, then gives %i Energy", (rank, energy) => {
    const { sim, get } = match([PRISM], rank);
    get("e").energy = 10;
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    expect(get("e").statuses.has("ether-prism")).toBe(true);
    expect(getStatusDefinition("ether-prism").damageTakenMultiplier).toBe(0.25);

    const log = stepFor(sim, 3);
    expect(get("e").statuses.has("ether-prism")).toBe(false);
    const gained = log
      .filter((entry) => entry.skillId === PRISM)
      .flatMap((entry) => of(entry.events, "energy-gain"));
    expect(gained).toEqual([["e", energy]]);
  });
});
