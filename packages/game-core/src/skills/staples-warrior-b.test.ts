import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { applyEffects, resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Warrior staples (#2316): Charging Strike, Headbutt, Barbarous Slice,
 * Signet of Stamina, Soldier's Stance, Steady Stance and Lion's Comfort,
 * on today's primitives. Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["warrior.strength", rank],
    ["warrior.swordsmanship", rank],
    ["warrior.tactics", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);
const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** A float stream of 0.5: a blind attacker misses. */
const missing = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A sword Warrior at `ranks`, with `bar`'s adrenaline pools empty. */
function warrior(ranks = RANK_12, bar: readonly string[] = []): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    health: 100,
    maxHealth: 500,
    equipment: SWORD,
    attributeRanks: ranks,
    skillBar: [...bar],
    adrenaline: new Map(bar.map((id) => [id, 0])),
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(skillId: string, caster: Combatant, target: Combatant) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng: steady(),
      rules: RULES,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

/** `caster` swings its weapon at `target`, a plain attack. */
function swing(caster: Combatant, target: Combatant, rng = steady()) {
  return resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng,
    rules: RULES,
    exposed: () => false,
  });
}

/** `caster`'s non-attack skill `skillId` on `target`, itself by default. */
function cast(skillId: string, caster: Combatant, target = caster) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  });
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

/** A plain sword swing's damage at `ranks` under `steady`. */
function plainSwing(ranks: ReadonlyMap<string, number>): number {
  const [blow] = damageTo(swing(warrior(ranks), body("f")).events, "f");
  return blow ?? 0;
}

/** A sword attack skill's blow at `ranks`: Crippling Slash's, which adds none. */
function plainBlow(ranks: ReadonlyMap<string, number>): number {
  const [blow] = damageTo(attack("warrior.crippling-slash", warrior(ranks), body("f")).events, "f");
  return blow ?? 0;
}

describe("the seven are the corpus's (#2316)", () => {
  it.each([
    ["warrior.charging-strike", 3465, "stance", true, "strength", "energy", 5, 0, 5, RANGE_SPELL],
    ["warrior.headbutt", 1406, "skill", true, "strength", "energy", 10, 0.75, 10, RANGE_MELEE],
    [
      "warrior.barbarous-slice",
      1416,
      "attack",
      false,
      "swordsmanship",
      "adrenaline",
      6,
      0,
      0,
      RANGE_MELEE,
    ],
    [
      "warrior.signet-of-stamina",
      1411,
      "signet",
      false,
      "strength",
      undefined,
      0,
      0.25,
      20,
      RANGE_SPELL,
    ],
    ["warrior.soldiers-stance", 3156, "stance", true, "tactics", "energy", 5, 0, 8, RANGE_SPELL],
    ["warrior.steady-stance", 1701, "stance", true, "tactics", "energy", 5, 0, 4, RANGE_SPELL],
    ["warrior.lions-comfort", 1407, "skill", false, "strength", "adrenaline", 4, 1, 1, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, costKind, amount, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "warrior",
        attributeId: `warrior.${attribute}`,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
      expect(skill(id).cost).toEqual(
        costKind === undefined ? undefined : { kind: costKind, amount },
      );
    },
  );

  it("Headbutt is a touch skill", () => {
    expect(skill("warrior.headbutt").touch).toBe(true);
  });
});

describe("Charging Strike (#2316)", () => {
  it.each([
    [RANK_12, 8, 66],
    [RANK_0, 1, 10],
  ] as const)(
    "runs a third faster for its time, and its next melee hit deals more",
    (ranks, seconds, bonus) => {
      const caster = warrior(ranks);
      cast("warrior.charging-strike", caster);
      expect(caster.statuses.get("charging-strike")?.remainingSeconds).toBe(seconds);
      expect(aggregateModifiers(caster.statuses.active).moveSpeedMultiplier).toBe(1.33);
      const [blow] = damageTo(swing(caster, body("f")).events, "f");
      expect(blow).toBe(plainSwing(ranks) + bonus);
      expect(caster.statuses.has("charging-strike")).toBe(false);
    },
  );

  it("a miss keeps it", () => {
    const caster = warrior();
    cast("warrior.charging-strike", caster);
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    const { events } = swing(caster, body("f"), missing());
    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(caster.statuses.has("charging-strike")).toBe(true);
  });
});

describe("Headbutt (#2316)", () => {
  it.each([
    [RANK_12, 88],
    [RANK_0, 40],
  ] as const)(
    "the touched foe takes its damage, and the Warrior is Dazed 10 s",
    (ranks, damage) => {
      const caster = warrior(ranks);
      const foe = body("f");
      const { events } = cast("warrior.headbutt", caster, foe);
      expect(damageTo(events, "f")).toEqual([damage]);
      expect(caster.statuses.get("dazed")?.remainingSeconds).toBe(10);
      expect(foe.statuses.has("dazed")).toBe(false);
    },
  );
});

describe("Barbarous Slice (#2316)", () => {
  it.each([
    [RANK_12, 25, 13],
    [RANK_0, 5, 5],
  ] as const)("out of a stance, hits for more and Bleeds", (ranks, bonus, seconds) => {
    const foe = body("f");
    const { events } = attack("warrior.barbarous-slice", warrior(ranks), foe);
    const [blow] = damageTo(events, "f");
    expect(blow).toBe(plainBlow(ranks) + bonus);
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBe(seconds);
  });

  it("in a stance, hits for more and does not Bleed", () => {
    const caster = warrior();
    caster.statuses.apply("tiger-stance", 10, "w", NO_RANKS);
    const foe = body("f");
    const { events } = attack("warrior.barbarous-slice", caster, foe);
    expect(damageTo(events, "f")).toEqual([plainBlow(RANK_12) + 25]);
    expect(foe.statuses.has("bleeding")).toBe(false);
  });
});

describe("Signet of Stamina (#2316)", () => {
  it.each([
    [RANK_12, 250],
    [RANK_0, 50],
  ] as const)("adds maximum Health with no end of its own", (ranks, bonus) => {
    const caster = warrior(ranks);
    cast("warrior.signet-of-stamina", caster);
    expect(aggregateModifiers(caster.statuses.active).maxHealthBonus).toBe(bonus);
    expect(caster.statuses.get("signet-of-stamina")?.remainingSeconds).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("a miss keeps it, a hit ends it", () => {
    const caster = warrior();
    cast("warrior.signet-of-stamina", caster);
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    swing(caster, body("f"), missing());
    expect(caster.statuses.has("signet-of-stamina")).toBe(true);
    caster.statuses.remove("blind");
    swing(caster, body("f"));
    expect(caster.statuses.has("signet-of-stamina")).toBe(false);
  });
});

describe("Soldier's Stance (#2316)", () => {
  it.each([
    [RANK_12, 9],
    [RANK_0, 4],
  ] as const)("lasts its time", (ranks, seconds) => {
    const caster = warrior(ranks);
    cast("warrior.soldiers-stance", caster);
    expect(caster.statuses.get("soldiers-stance")?.remainingSeconds).toBe(seconds);
  });

  it.each(["watch-yourself", "defensive-anthem"] as const)(
    "attacks a third faster only while under a shout or chant: %s",
    (statusId) => {
      const caster = warrior();
      cast("warrior.soldiers-stance", caster);
      expect(aggregateModifiers(caster.statuses.active).attackDurationMultiplier).toBe(1);
      caster.statuses.apply(statusId, 10, "w", NO_RANKS);
      expect(aggregateModifiers(caster.statuses.active).attackDurationMultiplier).toBe(0.67);
    },
  );
});

describe("Lion's Comfort (#2316)", () => {
  const BAR = ["warrior.lions-comfort", "warrior.signet-of-stamina", "warrior.barbarous-slice"];

  it.each([
    [RANK_12, 98, 2],
    [RANK_0, 50, 0],
  ] as const)(
    "heals, gains whole strikes of adrenaline, and disables only the signets 12 s",
    (ranks, heal, strikes) => {
      const caster = warrior(ranks, BAR);
      const { events } = cast("warrior.lions-comfort", caster);
      expect(caster.health).toBe(100 + heal);
      expect(caster.adrenaline.get("warrior.barbarous-slice")).toBe(
        strikes * ADRENALINE_PER_STRIKE,
      );
      const disabled = events.flatMap((event) =>
        event.kind === "skill-disabled" ? [[event.skillId, event.seconds]] : [],
      );
      expect(disabled).toEqual([["warrior.signet-of-stamina", 12]]);
    },
  );
});

describe("Steady Stance, in a match (#2316)", () => {
  const BAR = ["warrior.steady-stance", "warrior.lions-comfort", "warrior.charging-strike"];

  function match(ranks: ReadonlyMap<string, number>): MatchSimulation {
    return new MatchSimulation({
      seed: "staples-warrior-b",
      participants: [
        {
          id: "w",
          team: 0,
          skillBar: [...BAR],
          attributeRanks: ranks,
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 50,
          spawn: vec2(0, 0),
          facing: 0,
        },
        {
          id: "f",
          team: 1,
          skillBar: [],
          attributeRanks: new Map(),
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 50,
          spawn: vec2(400, 0),
          facing: 0,
        },
      ],
    });
  }

  function get(sim: MatchSimulation, id = "w"): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  /** `w` uses bar slot `slot`, and the steps until its use is logged. */
  function use(sim: MatchSimulation, slot: number): CombatLogEntry[] {
    const id = BAR[slot] ?? "";
    const cost = skill(id).cost;
    if (cost?.kind === "adrenaline") {
      get(sim).adrenaline.set(id, cost.amount * ADRENALINE_PER_STRIKE);
    }
    expect(sim.requestSkill("w", slot)?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 2 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === id)) {
        break;
      }
    }
    return log;
  }

  function knockDown(sim: MatchSimulation): void {
    applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
      caster: get(sim, "f"),
      target: get(sim),
      rng: createRng(1),
      rules: RULES,
      surroundings: new Map(),
    });
  }

  it.each([
    [RANK_12, 3, 6],
    [RANK_0, 1, 1],
  ] as const)(
    "stops the next knockdown for whole strikes of adrenaline and Energy, and ends on it",
    (ranks, strikes, energy) => {
      const sim = match(ranks);
      use(sim, 0);
      const w = get(sim);
      expect(w.statuses.get("steady-stance")?.durationSeconds).toBe(10);
      w.adrenaline.set("warrior.lions-comfort", 0);
      w.energy = 10;
      const before = w.energy;
      knockDown(sim);
      expect(w.knockdownRemaining).toBe(0);
      expect(w.statuses.has("steady-stance")).toBe(false);
      sim.step(DT);
      expect(w.adrenaline.get("warrior.lions-comfort")).toBe(strikes * ADRENALINE_PER_STRIKE);
      expect(Math.round(w.energy - before)).toBe(energy);
    },
  );

  it("does not end until a knockdown is stopped", () => {
    const sim = match(RANK_12);
    use(sim, 0);
    for (let i = 0; i < 5 / DT; i += 1) {
      sim.step(DT);
    }
    expect(get(sim).statuses.has("steady-stance")).toBe(true);
  });
});

describe("Charging Strike, in a match (#2316)", () => {
  it("survives its own use, and ends on the next skill", () => {
    const BAR = ["warrior.charging-strike", "warrior.steady-stance"];
    const sim = new MatchSimulation({
      seed: "staples-warrior-b",
      participants: [
        {
          id: "w",
          team: 0,
          skillBar: [...BAR],
          attributeRanks: RANK_12,
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 50,
          spawn: vec2(0, 0),
          facing: 0,
        },
      ],
    });
    const w = sim.get("w")?.combatant;
    for (const slot of [0, 1]) {
      expect(sim.requestSkill("w", slot)?.check).toEqual({ ok: true });
      for (let i = 0; i < 1 / DT; i += 1) {
        sim.step(DT);
      }
      expect(w?.statuses.has("charging-strike")).toBe(slot === 0);
    }
  });
});
