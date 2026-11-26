import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant, withStatusDefinitions } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome } from "./weapon-attack.js";

/**
 * Warrior and Necromancer staples (#2406): Primal Rage, Pulverizing
 * Smash, Renewing Smash, Mokele Smash, Oppressive Gaze and Envenom
 * Enchantments, on today's primitives. Every scaled number at rank 12
 * and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["warrior.strength", rank],
    ["warrior.hammer-mastery", rank],
    ["necromancer.blood-magic", rank],
    ["necromancer.curses", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

const PRIMAL = "warrior.primal-rage";
const PULVERIZING = "warrior.pulverizing-smash";
const RENEWING = "warrior.renewing-smash";
const MOKELE = "warrior.mokele-smash";
const GAZE = "necromancer.oppressive-gaze";
const ENVENOM = "necromancer.envenom-enchantments";

const HAMMER: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.hammer,
    attributeId: "warrior.hammer-mastery",
    damageType: WEAPONS.hammer.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

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

describe("the six are the corpus's (#2406)", () => {
  const FOE = "single-enemy";

  it.each([
    // The PvP split's numbers (3458) on the base record's id.
    [PRIMAL, 831, "stance", true, "strength", "energy", 5, 0, 4, RANGE_SPELL, "self"],
    [PULVERIZING, 2008, "attack", false, "hammer-mastery", "adrenaline", 4, 0, 0, RANGE_MELEE, FOE],
    // The PvP split's numbers (3143) on the base record's id.
    [RENEWING, 994, "attack", false, "hammer-mastery", "energy", 5, 0, 30, RANGE_MELEE, FOE],
    [MOKELE, 1409, "attack", false, "hammer-mastery", "energy", 5, 0, 12, RANGE_MELEE, FOE],
    [GAZE, 864, "spell", false, "blood-magic", "energy", 10, 1, 10, RANGE_SPELL, FOE],
    [ENVENOM, 936, "spell", false, "curses", "energy", 5, 1, 15, RANGE_SPELL, FOE],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, costKind, amount, activation, recharge, range, target) => {
      const [profession = ""] = id.split(".");
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: costKind, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );
});

/** A hammer Warrior at `ranks`, with `bar`'s adrenaline pools empty. */
function warrior(ranks = RANK_12, bar: readonly string[] = []): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    health: 100,
    maxHealth: 500,
    equipment: HAMMER,
    attributeRanks: ranks,
    skillBar: [...bar],
    adrenaline: new Map(bar.map((id) => [id, 0])),
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** A foe knocked down for a while yet. */
function down(): Combatant {
  const foe = body("f");
  foe.knockdownRemaining = 2;
  return foe;
}

/** A standing foe in Bonetti's Defense: 75% block against all attacks. */
function guarded(): Combatant {
  const foe = body("f");
  foe.statuses.apply("bonettis-defense", 10, "f", NO_RANKS);
  return foe;
}

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(skillId: string, caster: Combatant, target: Combatant, rng = steady()) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng,
      rules: RULES.combat,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

/** `caster`'s non-attack skill `skillId` on itself. */
function cast(skillId: string, caster: Combatant) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [caster],
    rng: steady(),
    rules: RULES.combat,
    surroundings: new Map(),
  });
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const energyTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === targetId ? [event.amount] : [],
  );

const strikesTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "adrenaline-gained" && event.targetId === targetId ? [event.strikes] : [],
  );

/** A hammer attack skill's blow at `ranks`: Belly Smash's on a standing foe, which adds none. */
function plainBlow(ranks: ReadonlyMap<string, number>): number {
  const [blow] = damageTo(attack("warrior.belly-smash", warrior(ranks), body("f")).events, "f");
  return blow ?? 0;
}

/** `caster` Blinded, so a `blocking` stream misses. */
function blinded(caster: Combatant): Combatant {
  caster.statuses.apply("blind", 10, "f", NO_RANKS);
  return caster;
}

/** Nothing landed: a block or a Blinded miss. */
const failed = (events: readonly CombatEvent[]): boolean =>
  events.some(({ kind }) => kind === "attack-blocked" || kind === "attack-missed");

describe("Primal Rage (#2406)", () => {
  it.each([
    [RANK_12, 7, 1.6],
    [RANK_0, 1, 2],
  ] as const)(
    "attacks and moves 33% faster for its time, and takes more damage (%#)",
    (ranks, seconds, taken) => {
      const caster = warrior(ranks);
      cast(PRIMAL, caster);
      expect(caster.statuses.get("primal-rage")?.remainingSeconds).toBe(seconds);
      const modifiers = aggregateModifiers(caster.statuses.active);
      expect(modifiers.attackDurationMultiplier).toBe(0.67);
      expect(modifiers.moveSpeedMultiplier).toBe(1.33);
      expect(modifiers.damageTakenMultiplier).toBeCloseTo(taken, 6);
    },
  );
});

describe("Pulverizing Smash (#2406)", () => {
  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)(
    "on a knocked-down foe, Weakens and Deep Wounds 5...20 seconds (%#)",
    (ranks, seconds) => {
      const foe = down();
      const { events } = attack(PULVERIZING, warrior(ranks), foe);
      expect(damageTo(events, "f")).toEqual([plainBlow(ranks)]);
      expect(foe.statuses.get("weakness")?.remainingSeconds).toBe(seconds);
      expect(foe.statuses.get("deep-wound")?.remainingSeconds).toBe(seconds);
    },
  );

  it("on a standing foe, the blow lands and nothing else", () => {
    const foe = body("f");
    const { events } = attack(PULVERIZING, warrior(), foe);
    expect(damageTo(events, "f")).toEqual([plainBlow(RANK_12)]);
    expect(foe.statuses.has("weakness")).toBe(false);
    expect(foe.statuses.has("deep-wound")).toBe(false);
  });

  it("a Blinded miss on a knocked-down foe gives nothing", () => {
    const foe = down();
    expect(failed(attack(PULVERIZING, blinded(warrior()), foe, blocking()).events)).toBe(true);
    expect(foe.statuses.has("weakness")).toBe(false);
    expect(foe.statuses.has("deep-wound")).toBe(false);
  });
});

describe("Mokele Smash (#2406)", () => {
  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)("hits for +5...20 and gains 2 strikes of adrenaline (%#)", (ranks, bonus) => {
    const caster = warrior(ranks, [MOKELE, PULVERIZING]);
    const { events } = attack(MOKELE, caster, body("f"));
    expect(damageTo(events, "f")).toEqual([plainBlow(ranks) + bonus]);
    expect(strikesTo(events, "w")).toEqual([2]);
  });

  it("blocked, or missed Blind, gains none", () => {
    const caster = warrior(RANK_12, [MOKELE, PULVERIZING]);
    const block = attack(MOKELE, caster, guarded(), blocking()).events;
    expect(failed(block)).toBe(true);
    expect(strikesTo(block, "w")).toEqual([]);
    const miss = attack(MOKELE, blinded(caster), body("f"), blocking()).events;
    expect(failed(miss)).toBe(true);
    expect(strikesTo(miss, "w")).toEqual([]);
    expect(caster.adrenaline.get(PULVERIZING)).toBe(0);
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
    seed: "staples-wrn-c",
    participants: [
      spec("r", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks, equipment: HAMMER }),
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

/** `r` uses `skillId` on `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId: string): CombatLogEntry[] {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `remaining` is `seconds`, less the step since it landed. */
function lasts(remaining: number | undefined, seconds: number): void {
  expect(remaining).toBeGreaterThan(seconds - 0.2);
  expect(remaining).toBeLessThanOrEqual(seconds);
}

/** The events `skillId` caused in `log`. */
const of = (log: readonly CombatLogEntry[], skillId: string): CombatEvent[] =>
  log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

describe("Renewing Smash, in a match (#2406)", () => {
  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)(
    "on a knocked-down foe, hits for +5...20, gains 3 Energy and recharges at once (%#)",
    (ranks, bonus) => {
      const sim = match([RENEWING], ranks, spec("f", 1, vec2(RANGE_MELEE - 5, 0)));
      get(sim, "f").combatant.knockdownRemaining = 5;
      const events = of(use(sim, RENEWING, "f"), RENEWING);
      const [blow = 0] = damageTo(events, "f");
      expect(blow).toBeGreaterThan(bonus);
      expect(energyTo(events, "r")).toEqual([3]);
      expect(get(sim, "r").combatant.cast.rechargeRemaining.has(RENEWING)).toBe(false);
    },
  );

  it("on a standing foe, the blow lands, no Energy, and it keeps its 30 s recharge", () => {
    const sim = match([RENEWING], RANK_12, spec("f", 1, vec2(RANGE_MELEE - 5, 0)));
    const events = of(use(sim, RENEWING, "f"), RENEWING);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(energyTo(events, "r")).toEqual([]);
    const left = get(sim, "r").combatant.cast.rechargeRemaining.get(RENEWING) ?? 0;
    expect(left).toBeGreaterThan(29);
    expect(left).toBeLessThanOrEqual(30);
  });

  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)("hits for +5...20 (%#)", (ranks, bonus) => {
    const { events } = attack(RENEWING, warrior(ranks), body("f"));
    expect(damageTo(events, "f")).toEqual([plainBlow(ranks) + bonus]);
  });

  it("a Blinded miss on a knocked-down foe gives nothing, and keeps its recharge", () => {
    const sim = match([RENEWING], RANK_12, spec("f", 1, vec2(RANGE_MELEE - 5, 0)));
    get(sim, "f").combatant.knockdownRemaining = 5;
    blinded(get(sim, "r").combatant);
    // Blind made sure, as the match rolls its own: every swing misses.
    const events = withStatusDefinitions({ blind: { attackMissChance: 1 } }, () =>
      of(use(sim, RENEWING, "f"), RENEWING),
    );
    expect(damageTo(events, "f")).toEqual([]);
    expect(energyTo(events, "r")).toEqual([]);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.has(RENEWING)).toBe(true);
  });
});

describe("Mokele Smash, in a match (#2406)", () => {
  it("gains its 2 strikes on top of the hit's own", () => {
    const sim = match([MOKELE, PULVERIZING], RANK_12, spec("f", 1, vec2(RANGE_MELEE - 5, 0)));
    const r = get(sim, "r").combatant;
    r.adrenaline.set(PULVERIZING, 0);
    use(sim, MOKELE, "f");
    expect(r.adrenaline.get(PULVERIZING)).toBe(3 * ADRENALINE_PER_STRIKE);
  });
});

describe("Oppressive Gaze (#2406)", () => {
  /** `f` the target at range, `g` adjacent to it, `h` past adjacent. */
  const foes = () => [
    spec("f", 1, vec2(300, 0)),
    spec("g", 1, vec2(300 + AREA_ADJACENT - 5, 0)),
    spec("h", 1, vec2(300 + AREA_ADJACENT + 40, 0)),
  ];

  it.each([
    [RANK_12, 26, 10],
    [RANK_0, 10, 3],
  ] as const)(
    "strikes the target and adjacent foes for 10...30 shadow; the conditioned are Poisoned and Weakened 3...12 seconds (%#)",
    (ranks, damage, seconds) => {
      const sim = match([GAZE], ranks, ...foes());
      get(sim, "g").combatant.statuses.apply("bleeding", 30, "x", NO_RANKS);
      const events = of(use(sim, GAZE, "f"), GAZE);
      expect(damageTo(events, "f")).toEqual([damage]);
      expect(damageTo(events, "g")).toEqual([damage]);
      expect(damageTo(events, "h")).toEqual([]);
      const g = get(sim, "g").combatant.statuses;
      lasts(g.get("poison")?.remainingSeconds, seconds);
      lasts(g.get("weakness")?.remainingSeconds, seconds);
      const f = get(sim, "f").combatant.statuses;
      expect(f.has("poison")).toBe(false);
      expect(f.has("weakness")).toBe(false);
    },
  );

  it("a target with a condition is Poisoned and Weakened too", () => {
    const sim = match([GAZE], RANK_12, ...foes());
    get(sim, "f").combatant.statuses.apply("bleeding", 30, "x", NO_RANKS);
    const events = of(use(sim, GAZE, "f"), GAZE);
    expect(damageTo(events, "f")).toEqual([26]);
    const f = get(sim, "f").combatant.statuses;
    lasts(f.get("poison")?.remainingSeconds, 10);
    lasts(f.get("weakness")?.remainingSeconds, 10);
    expect(get(sim, "g").combatant.statuses.has("poison")).toBe(false);
  });
});

describe("Envenom Enchantments (#2406)", () => {
  const ENCHANTMENTS = ["spirit-channeling", "foxs-promise", "mystic-corruption"] as const;

  /** `r` casts Envenom Enchantments on `f`, who bears `count` enchantments. */
  function envenom(ranks: ReadonlyMap<string, number>, count: number): Combatant {
    const sim = match([ENVENOM], ranks, spec("f", 1, vec2(300, 0)));
    const f = get(sim, "f").combatant;
    for (const id of ENCHANTMENTS.slice(0, count)) {
      f.statuses.apply(id, 60, "f", NO_RANKS);
    }
    use(sim, ENVENOM, "f");
    return f;
  }

  const enchantments = (foe: Combatant): number =>
    foe.statuses.active.filter(({ id }) => ENCHANTMENTS.some((e) => e === id)).length;

  it.each([
    // 8.6 s rounds to 9 for each before they add: 18, not 17.
    [RANK_12, 18],
    [RANK_0, 6],
  ] as const)(
    "with three, strips one and Poisons 3...10 seconds for each of the two left (%#)",
    (ranks, seconds) => {
      const foe = envenom(ranks, 3);
      expect(enchantments(foe)).toBe(2);
      lasts(foe.statuses.get("poison")?.remainingSeconds, seconds);
    },
  );

  it("with one, strips it and Poisons nothing", () => {
    const foe = envenom(RANK_12, 1);
    expect(enchantments(foe)).toBe(0);
    expect(foe.statuses.has("poison")).toBe(false);
  });

  it("with none, does nothing", () => {
    const foe = envenom(RANK_12, 0);
    expect(foe.statuses.has("poison")).toBe(false);
  });
});
