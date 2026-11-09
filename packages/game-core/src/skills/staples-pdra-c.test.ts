import { describe, expect, it } from "vitest";

import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
} from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Assassin, Ritualist and Dervish staples (#2368): Golden Skull Strike,
 * Fox's Promise, Seeping Wound, Shameful Fear, Blinding Powder, Clamor of
 * Souls, Spirit Channeling, Renewing Surge and Mystic Corruption, on
 * today's primitives. Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["assassin.dagger-mastery", rank],
    ["assassin.critical-strikes", rank],
    ["assassin.deadly-arts", rank],
    ["assassin.shadow-arts", rank],
    ["ritualist.channeling-magic", rank],
    ["ritualist.spawning-power", rank],
    ["dervish.mysticism", rank],
    ["warrior.swordsmanship", rank],
    // Shelter, the spirit some of them read, at a fixed rank.
    ["ritualist.communing", 12],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

const GOLDEN = "assassin.golden-skull-strike";
const FOX = "assassin.foxs-promise";
const SEEPING = "assassin.seeping-wound";
const SHAMEFUL = "assassin.shameful-fear";
const POWDER = "assassin.blinding-powder";
const CLAMOR = "ritualist.clamor-of-souls";
const CHANNELING = "ritualist.spirit-channeling";
const SURGE = "ritualist.renewing-surge";
const MYSTIC = "dervish.mystic-corruption";
const SHELTER = "ritualist.shelter";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const DAGGERS = wielding(WEAPONS.daggers, "assassin.dagger-mastery");
const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

/** A float stream of 0.3: no crit, a 75% block holds, a Blind miss lands. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.3 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the nine are the corpus's (#2368)", () => {
  it.each([
    [GOLDEN, 1635, "attack", true, "dagger-mastery", 10, 0, 15, RANGE_MELEE, "single-enemy"],
    [FOX, 1640, "enchantment", true, "dagger-mastery", 10, 1, 20, RANGE_SPELL, "self"],
    [SEEPING, 1034, "hex", true, "critical-strikes", 10, 0.25, 10, RANGE_SPELL, "single-enemy"],
    [SHAMEFUL, 927, "hex", false, "deadly-arts", 10, 1, 10, RANGE_SPELL, "single-enemy"],
    [POWDER, 973, "spell", false, "shadow-arts", 5, 0.25, 20, RANGE_SPELL, "single-enemy"],
    [CLAMOR, 1215, "spell", true, "channeling-magic", 10, 1, 8, RANGE_SPELL, "single-enemy"],
    [CHANNELING, 1231, "enchantment", true, "spawning-power", 5, 1, 30, RANGE_SPELL, "self"],
    [SURGE, 1478, "hex", false, "channeling-magic", 5, 1, 15, RANGE_SPELL, "single-enemy"],
    // The PvP split's numbers (3467) on the base record's id.
    [MYSTIC, 1755, "enchantment", false, "mysticism", 5, 0, 10, RANGE_SPELL, "self"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge, range, target) => {
      const [profession = ""] = id.split(".");
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );

  it("Mystic Corruption is a flash enchantment", () => {
    expect(skill(MYSTIC).flash).toBe(true);
  });
});

/** An assassin with `equipment` at `ranks`. */
const assassin = (equipment = DAGGERS, ranks = RANK_12): Combatant =>
  makeCombatant({
    id: "a",
    team: 0,
    energy: 50,
    maxEnergy: 50,
    health: 500,
    maxHealth: 500,
    equipment,
    attributeRanks: ranks,
  });

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** A foe in Bonetti's Defense: 75% block against all attacks. */
function guarded(): Combatant {
  const foe = body("f");
  foe.statuses.apply("bonettis-defense", 10, "f", NO_RANKS);
  return foe;
}

function strike(skillId: string, caster: Combatant, target: Combatant) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng: blocking(),
      rules: RULES.combat,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

function swing(caster: Combatant, target: Combatant) {
  return resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), floors: 1, layer: 0, creature: undefined },
    surroundings: new Map(),
    rng: blocking(),
    rules: RULES.combat,
    exposed: () => false,
  });
}

const blocked = (events: readonly { readonly kind: string }[]): boolean =>
  events.some(({ kind }) => kind === "attack-blocked");

describe("Golden Skull Strike (#2368)", () => {
  it.each([
    [RANK_12, 10],
    [RANK_0, 1],
  ] as const)("Dazes 1...12 seconds on a hit while enchanted (%#)", (ranks, seconds) => {
    const caster = assassin(DAGGERS, ranks);
    caster.statuses.apply("spirit-channeling", 10, "a", NO_RANKS);
    const foe = body("f");
    strike(GOLDEN, caster, foe);
    expect(foe.statuses.get("dazed")?.remainingSeconds).toBeCloseTo(seconds, 5);
  });

  it("Dazes nothing unenchanted", () => {
    const foe = body("f");
    strike(GOLDEN, assassin(), foe);
    expect(foe.statuses.has("dazed")).toBe(false);
  });

  it("Dazes nothing when blocked, enchanted or not", () => {
    const caster = assassin();
    caster.statuses.apply("spirit-channeling", 10, "a", NO_RANKS);
    const foe = guarded();
    expect(blocked(strike(GOLDEN, caster, foe).events)).toBe(true);
    expect(foe.statuses.has("dazed")).toBe(false);
  });
});

describe("Fox's Promise (#2368)", () => {
  /** `caster` under Fox's Promise at `ranks`, cast as a match would. */
  function promised(caster: Combatant, ranks = RANK_12): Combatant {
    const sim = match([FOX], ranks);
    press(sim, FOX);
    stepFor(sim, 1.5);
    const status = get(sim, "r").combatant.statuses.get("foxs-promise");
    if (status === undefined) {
      throw new Error("no Fox's Promise");
    }
    caster.statuses.apply("foxs-promise", status.remainingSeconds, "a", status.ranks);
    return caster;
  }

  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)("lasts 5...20 seconds (%#)", (ranks, seconds) => {
    const sim = match([FOX], ranks);
    press(sim, FOX);
    stepFor(sim, 1 + DT);
    const remaining = get(sim, "r").combatant.statuses.get("foxs-promise")?.remainingSeconds;
    expect(remaining).toBeGreaterThan(seconds - 0.5);
    expect(remaining).toBeLessThanOrEqual(seconds);
  });

  it("a dagger swing against a blocking stance is not blocked, and it holds", () => {
    expect(blocked(swing(assassin(), guarded()).events)).toBe(true);
    const caster = promised(assassin());
    expect(blocked(swing(caster, guarded()).events)).toBe(false);
    expect(caster.statuses.has("foxs-promise")).toBe(true);
  });

  it("a sword swing is blocked, and the failed hit ends it", () => {
    const caster = promised(assassin(SWORD));
    expect(blocked(swing(caster, guarded()).events)).toBe(true);
    expect(caster.statuses.has("foxs-promise")).toBe(false);
  });

  it("a Blinded miss ends it", () => {
    const caster = promised(assassin());
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    swing(caster, body("f"));
    expect(caster.statuses.has("foxs-promise")).toBe(false);
  });
});

/** A participant at `spawn`; `r` is team 0 at the origin. */
function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

function match(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "staples-pdra-c",
    participants: [
      spec("r", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks, equipment: DAGGERS }),
      ...others,
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e4;
    participant.combatant.health = 1e4;
    // Room for every Energy gain to show in full.
    participant.combatant.energy = 50;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `r` uses `skillId` on `targetId`. */
function press(sim: MatchSimulation, skillId: string, targetId?: string): void {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
}

/** `r` uses `skillId` on `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatLogEntry[] {
  press(sim, skillId, targetId);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** The events `skillId` caused in `log`. */
const of = (log: readonly CombatLogEntry[], skillId: string): CombatEvent[] =>
  log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const energyTo = (events: readonly CombatEvent[], targetId = "r"): number[] =>
  events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === targetId ? [event.amount] : [],
  );

const secondsOf = (
  sim: MatchSimulation,
  id: string,
  statusId: Parameters<Combatant["statuses"]["get"]>[0],
) => get(sim, id).combatant.statuses.get(statusId)?.remainingSeconds;

describe("Seeping Wound (#2368)", () => {
  it.each([
    [RANK_12, 6, 21],
    [RANK_0, 1, 5],
  ] as const)(
    "slows 33% for 1...7 seconds, and deals 5...25 each second to a conditioned foe (%#)",
    (ranks, seconds, damage) => {
      const sim = match([SEEPING], ranks, spec("f", 1, vec2(300, 0)));
      get(sim, "f").combatant.statuses.apply("bleeding", 30, "x", NO_RANKS);
      const log = cast(sim, SEEPING, "f");
      const remaining = secondsOf(sim, "f", "seeping-wound") ?? 0;
      expect(remaining).toBeGreaterThan(seconds - 0.2);
      expect(remaining).toBeLessThanOrEqual(seconds);
      const hits = damageTo(of([...log, ...stepFor(sim, 8)], SEEPING), "f");
      expect(hits.length).toBe(Math.floor(seconds));
      for (const hit of hits) {
        expect(hit).toBeCloseTo(damage, 0);
      }
    },
  );

  it("deals nothing to a foe with no condition", () => {
    const sim = match([SEEPING], RANK_12, spec("f", 1, vec2(300, 0)));
    const log = cast(sim, SEEPING, "f");
    expect(damageTo(of([...log, ...stepFor(sim, 8)], SEEPING), "f")).toEqual([]);
  });

  it("moves 33% slower", () => {
    expect(aggregateModifiers([{ id: "seeping-wound", ranks: NO_RANKS }]).moveSpeedMultiplier).toBe(
      0.67,
    );
  });
});

describe("Shameful Fear (#2368)", () => {
  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)("deals 5...20 each second the foe moves, for 10 seconds (%#)", (ranks, damage) => {
    const sim = match([SHAMEFUL], ranks, spec("f", 1, vec2(300, 0)));
    const log = cast(sim, SHAMEFUL, "f");
    expect(secondsOf(sim, "f", "shameful-fear")).toBeCloseTo(10, 0);
    sim.setInputDirection("f", vec2(0, 1));
    const hits = damageTo(of([...log, ...stepFor(sim, 11)], SHAMEFUL), "f");
    expect(hits.length).toBe(10);
    for (const hit of hits) {
      expect(hit).toBeCloseTo(damage, 0);
    }
  });

  it("deals nothing to a foe that stands still", () => {
    const sim = match([SHAMEFUL], RANK_12, spec("f", 1, vec2(300, 0)));
    const log = cast(sim, SHAMEFUL, "f");
    expect(damageTo(of([...log, ...stepFor(sim, 11)], SHAMEFUL), "f")).toEqual([]);
  });

  it("moves 10% faster, unless speed boosts are barred", () => {
    const fear = { id: "shameful-fear", ranks: NO_RANKS } as const;
    expect(aggregateModifiers([fear]).moveSpeedMultiplier).toBeCloseTo(1.1);
    const mud = { id: "muddy-terrain", ranks: NO_RANKS } as const;
    expect(aggregateModifiers([fear, mud]).moveSpeedMultiplier).toBeCloseTo(0.9);
  });
});

describe("Blinding Powder (#2368)", () => {
  const near = (x: number) => [
    spec("f", 1, vec2(x, 0)),
    spec("g", 1, vec2(x + AREA_ADJACENT - 5, 0)),
    spec("h", 1, vec2(x + AREA_ADJACENT + 40, 0)),
  ];

  it.each([
    [RANK_12, 13],
    [RANK_0, 3],
  ] as const)(
    "after an off-hand attack, Blinds the target and adjacent foes 3...15 seconds (%#)",
    (ranks, seconds) => {
      const sim = match([GOLDEN, POWDER], ranks, ...near(RANGE_MELEE - 5));
      cast(sim, GOLDEN, "f");
      cast(sim, POWDER, "f");
      stepFor(sim, DT);
      for (const id of ["f", "g"]) {
        const remaining = secondsOf(sim, id, "blind") ?? 0;
        expect(remaining, id).toBeGreaterThan(seconds - 0.2);
        expect(remaining, id).toBeLessThanOrEqual(seconds);
      }
      expect(get(sim, "h").combatant.statuses.has("blind")).toBe(false);
    },
  );

  it("without an off-hand mark, is paid for and Blinds nobody", () => {
    const sim = match([POWDER], RANK_12, ...near(300));
    const before = get(sim, "r").combatant.energy;
    cast(sim, POWDER, "f");
    stepFor(sim, DT);
    expect(get(sim, "r").combatant.energy).toBeLessThan(before - 4);
    for (const id of ["f", "g", "h"]) {
      expect(get(sim, id).combatant.statuses.has("blind"), id).toBe(false);
    }
  });
});

describe("Clamor of Souls (#2368)", () => {
  const foes = () => [
    spec("f", 1, vec2(300, 0)),
    spec("g", 1, vec2(300 + AREA_NEARBY - 5, 0)),
    spec("h", 1, vec2(300 + 2 * AREA_NEARBY, 0)),
  ];

  it.each([
    [RANK_12, 54],
    [RANK_0, 10],
  ] as const)("strikes the target and nearby foes for 10...65 lightning (%#)", (ranks, damage) => {
    const sim = match([CLAMOR], ranks, ...foes());
    const events = of(cast(sim, CLAMOR, "f"), CLAMOR);
    const [hit = 0] = damageTo(events, "f");
    expect(hit).toBeCloseTo(damage, 0);
    expect(damageTo(events, "g")).toEqual([hit]);
    expect(damageTo(events, "h")).toEqual([]);
  });

  it("gives 10 Energy once with a spirit in earshot, or holding a bundle, and none alone", () => {
    const alone = match([CLAMOR], RANK_12, ...foes());
    expect(energyTo(of(cast(alone, CLAMOR, "f"), CLAMOR))).toEqual([]);

    const spirit = match([CLAMOR, SHELTER], RANK_12, ...foes());
    cast(spirit, SHELTER);
    expect(energyTo(of(cast(spirit, CLAMOR, "f"), CLAMOR))).toEqual([10]);

    const item = match([CLAMOR], RANK_12, ...foes());
    get(item, "r").combatant.statuses.apply("protective-was-kaolai", 60, "r", NO_RANKS);
    expect(energyTo(of(cast(item, CLAMOR, "f"), CLAMOR))).toEqual([10]);
  });
});

describe("Spirit Channeling (#2368)", () => {
  it.each([
    [RANK_12, 5],
    [RANK_0, 1],
  ] as const)("gives +1...6 Energy regeneration for 12 seconds (%#)", (ranks, pips) => {
    const sim = match([CHANNELING], ranks);
    cast(sim, CHANNELING);
    const r = get(sim, "r").combatant;
    expect(r.statuses.get("spirit-channeling")?.remainingSeconds).toBeCloseTo(12, 0);
    expect(aggregateModifiers(r.statuses.active).energyPips).toBeCloseTo(pips, 5);
  });

  it.each([
    [RANK_12, 10],
    [RANK_0, 3],
  ] as const)("gives 3...12 Energy with a spirit in earshot, none alone (%#)", (ranks, energy) => {
    const alone = match([CHANNELING], ranks);
    expect(energyTo(of(cast(alone, CHANNELING), CHANNELING))).toEqual([]);

    const near = match([CHANNELING, SHELTER], ranks);
    cast(near, SHELTER);
    const [gain = 0] = energyTo(of(cast(near, CHANNELING), CHANNELING));
    expect(gain).toBeCloseTo(energy, 5);
  });
});

describe("Renewing Surge (#2368)", () => {
  it.each([
    [RANK_12, 10, 7],
    [RANK_0, 2, 1],
  ] as const)(
    "deals 2...12 each second for 8 seconds, then gives 1...8 Energy (%#)",
    (ranks, damage, energy) => {
      const sim = match([SURGE], ranks, spec("f", 1, vec2(300, 0)));
      const log = [...cast(sim, SURGE, "f"), ...stepFor(sim, 9)];
      const hits = damageTo(of(log, SURGE), "f");
      expect(hits.length).toBe(8);
      for (const hit of hits) {
        expect(hit).toBeCloseTo(damage, 0);
      }
      const [gain = 0, ...more] = energyTo(of(log, SURGE));
      expect(gain).toBeCloseTo(energy, 5);
      expect(more).toEqual([]);
    },
  );

  it("gives the Energy when removed early too", () => {
    const sim = match([SURGE], RANK_12, spec("f", 1, vec2(300, 0)));
    cast(sim, SURGE, "f");
    stepFor(sim, 2);
    get(sim, "f").combatant.statuses.removeByCategory("hex", 1);
    const [gain = 0] = energyTo(of(stepFor(sim, DT), SURGE));
    expect(gain).toBe(7);
  });

  it("gives a dead caster nothing", () => {
    const sim = match([SURGE], RANK_12, spec("f", 1, vec2(300, 0)));
    cast(sim, SURGE, "f");
    const r = get(sim, "r").combatant;
    r.statuses.apply("burning", 20, "y", NO_RANKS);
    r.health = 0.2;
    stepFor(sim, DT);
    expect(r.dead).toBe(true);
    expect(energyTo(of(stepFor(sim, 9), SURGE))).toEqual([]);
  });
});

describe("Mystic Corruption (#2368)", () => {
  const around = () => [
    spec("f", 1, vec2(AREA_ADJACENT - 5, 0)),
    spec("g", 1, vec2(-(AREA_ADJACENT - 5), 0)),
    spec("h", 1, vec2(AREA_ADJACENT + 40, 0)),
  ];

  it.each([
    [RANK_12, false, 5],
    [RANK_0, false, 2],
    [RANK_12, true, 10],
    [RANK_0, true, 4],
  ] as const)(
    "Diseases adjacent foes 2...6 seconds, twice as long already enchanted (%#)",
    (ranks, enchanted, seconds) => {
      const sim = match([MYSTIC], ranks, ...around());
      if (enchanted) {
        get(sim, "r").combatant.statuses.apply("spirit-channeling", 30, "r", NO_RANKS);
      }
      cast(sim, MYSTIC);
      stepFor(sim, DT);
      for (const id of ["f", "g"]) {
        const remaining = secondsOf(sim, id, "disease") ?? 0;
        expect(remaining, id).toBeGreaterThan(seconds - 0.2);
        expect(remaining, id).toBeLessThanOrEqual(seconds);
      }
      expect(get(sim, "h").combatant.statuses.has("disease")).toBe(false);
      expect(secondsOf(sim, "r", "mystic-corruption")).toBeCloseTo(20, 0);
    },
  );

  /** `r` under Mystic Corruption, with Diseased allies near and far. */
  function diseased() {
    const sim = match(
      [MYSTIC],
      RANK_12,
      spec("near", 0, vec2(0, AREA_EARSHOT - 10)),
      spec("far", 0, vec2(0, AREA_EARSHOT + 100)),
    );
    cast(sim, MYSTIC);
    for (const id of ["r", "near", "far"]) {
      get(sim, id).combatant.statuses.apply("disease", 60, "x", NO_RANKS);
    }
    return sim;
  }

  it("cures you and party members in earshot of Disease as it ends", () => {
    const sim = diseased();
    stepFor(sim, 21);
    expect(get(sim, "r").combatant.statuses.has("mystic-corruption")).toBe(false);
    expect(get(sim, "r").combatant.statuses.has("disease")).toBe(false);
    expect(get(sim, "near").combatant.statuses.has("disease")).toBe(false);
    expect(get(sim, "far").combatant.statuses.has("disease")).toBe(true);
  });

  it("cures when stripped too", () => {
    const sim = diseased();
    get(sim, "r").combatant.statuses.removeByCategory("enchantment", 1);
    stepFor(sim, DT);
    expect(get(sim, "r").combatant.statuses.has("disease")).toBe(false);
    expect(get(sim, "near").combatant.statuses.has("disease")).toBe(false);
    expect(get(sim, "far").combatant.statuses.has("disease")).toBe(true);
  });
});
