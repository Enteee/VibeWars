import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import {
  getStatusDefinition,
  type StatusId,
  type StatusTrigger,
  type TriggerEffect,
} from "./status.js";
import type { Combatant, Skill, SkillEffect } from "./types.js";

/**
 * Unwritten corpus skills (#2500): Attacker's Insight, Shield of Force and
 * Burning Shield, each on the model skill it reads like. The corpus's
 * numbers at rank 12 and at rank 0, triggers included. Nothing crits.
 */

const RULES: Ruleset = {
  ...MINIMAL_GW_INSPIRED_PVP_V1,
  combat: {
    ...MINIMAL_GW_INSPIRED_PVP_V1.combat,
    criticalBaseChance: 0,
    criticalChancePerRank: 0,
  },
};
const DT = 1 / RULES.tickRateHz;

const INSIGHT = "dervish.attackers-insight";
const FORCE = "dervish.shield-of-force";
const BURNING = "paragon.burning-shield";
const HAMSTRING = "warrior.hamstring";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function wielding(
  weapon: Weapon,
  attributeId: string,
  offhandId?: ResolvedEquipment["offhandId"],
): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
    offhandId,
  };
}

/** A body that does not die, at `ranks`, facing its foes. */
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
    maxHealth: 1e6,
    maxEnergy: 100,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
    ...extra,
  };
}

function simOf(participants: readonly ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({ seed: "unwritten-b-2500", ruleset: RULES, participants });
  for (const participant of sim.participants()) {
    participant.combatant.energy = participant.combatant.maxEnergy;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `id` uses its skill in `slot` on itself, and a tick passes. */
function useOnSelf(sim: MatchSimulation, id: string, slot: number): void {
  sim.setTarget(id, id);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  stepFor(sim, DT);
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function blocksOf(log: readonly CombatLogEntry[], targetId: string): number {
  return events(log).filter(
    (event) => event.kind === "attack-blocked" && event.targetId === targetId,
  ).length;
}

/** The whole seconds `status` landed on `combatant` for. */
function lasts(combatant: Combatant, status: StatusId): number | undefined {
  return combatant.statuses.get(status)?.durationSeconds;
}

function triggersOf(status: StatusId): readonly StatusTrigger[] {
  return getStatusDefinition(status).triggers;
}

/** Every `apply-status` duration under `effects`, a splash's included. */
function durations(effects: readonly (SkillEffect | TriggerEffect)[]): unknown[] {
  return effects.flatMap((effect) =>
    effect.kind === "apply-status"
      ? [effect.durationSeconds]
      : effect.kind === "splash" || effect.kind === "if"
        ? durations(effect.effects)
        : [],
  );
}

describe("Attacker's Insight (#2500)", () => {
  const wind = (rank: number) => new Map([["dervish.wind-prayers", rank]]);

  /** `d` at `rank` in Attacker's Insight; `f`, a foe swinging at it from beside. */
  function insight(rank: number) {
    const sim = simOf([
      spec("d", 0, vec2(0, 0), { skillBar: [INSIGHT], attributeRanks: wind(rank) }),
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
    ]);
    useOnSelf(sim, "d", 0);
    expect(sim.requestAttack("f", "d")).toEqual({ ok: true });
    return sim;
  }

  it("is the corpus's: gwId 1764, a 10-energy flash enchantment, instant, 10 s recharge", () => {
    expect(skill(INSIGHT)).toMatchObject({
      gwId: 1764,
      type: "enchantment",
      flash: true,
      elite: false,
      attributeId: "dervish.wind-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 10,
      target: "self",
    });
  });

  it("lasts 3...10 s and its Weakness 3...15 s: 8.6 and 12.6 at rank 12", () => {
    expect(durations(skill(INSIGHT).effects)).toEqual([
      { scaling: { attributeId: "dervish.wind-prayers", atZero: 3, atTwelve: 8.6 } },
    ]);
    expect(triggersOf("attackers-insight")).toMatchObject([{ on: "ends", target: "bearer" }]);
    expect(durations(triggersOf("attackers-insight")[0]?.effects ?? [])).toEqual([
      { scaling: { attributeId: "dervish.wind-prayers", atZero: 3, atTwelve: 12.6 } },
    ]);
    expect(getStatusDefinition("attackers-insight")).toMatchObject({
      block: { chance: 0.5, against: "all" },
      blockWhileAttacking: true,
    });
  });

  it.each([
    [12, 9, 13],
    [0, 3, 3],
  ])(
    "at rank %i it lasts %i s, blocks only while attacking, and Weakens an adjacent foe %i s as it ends",
    (rank, seconds, weakness) => {
      const sim = insight(rank);
      const d = get(sim, "d");
      expect(lasts(d, "attackers-insight")).toBe(seconds);
      // Idle, it blocks nothing.
      expect(blocksOf(stepFor(sim, 1), "d")).toBe(0);
      expect(sim.requestAttack("d", "f")).toEqual({ ok: true });
      const log = stepFor(sim, seconds);
      expect(d.statuses.has("attackers-insight")).toBe(false);
      if (rank === 12) {
        expect(blocksOf(log, "d")).toBeGreaterThan(0);
      }
      expect(lasts(get(sim, "f"), "weakness")).toBe(weakness);
    },
  );
});

describe("Shield of Force (#2500)", () => {
  const earth = (rank: number) => new Map([["dervish.earth-prayers", rank]]);

  /** `d` at `rank` in Shield of Force; `f` beside it, `g` beside it too, idle. */
  function shielded(rank: number) {
    const sim = simOf([
      spec("d", 0, vec2(0, 0), { skillBar: [FORCE], attributeRanks: earth(rank) }),
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      spec("g", 1, vec2(-RANGE_MELEE / 2, 0)),
    ]);
    useOnSelf(sim, "d", 0);
    return sim;
  }

  it("is the corpus's: gwId 2201, a 10-energy flash enchantment, instant, 12 s recharge", () => {
    expect(skill(FORCE)).toMatchObject({
      gwId: 2201,
      type: "enchantment",
      flash: true,
      elite: false,
      attributeId: "dervish.earth-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 12,
      target: "self",
    });
  });

  it("lasts 1...16 s and its Weakness 5...20 s: 13 and 17 at rank 12", () => {
    expect(durations(skill(FORCE).effects)).toEqual([
      { scaling: { attributeId: "dervish.earth-prayers", atZero: 1, atTwelve: 13 } },
    ]);
    expect(triggersOf("shield-of-force")).toMatchObject([
      { on: "bearer-blocks", target: "bearer" },
    ]);
    expect(durations(triggersOf("shield-of-force")[0]?.effects ?? [])).toEqual([
      { scaling: { attributeId: "dervish.earth-prayers", atZero: 5, atTwelve: 17 } },
    ]);
    expect(getStatusDefinition("shield-of-force")).toMatchObject({
      block: { chance: 1, against: "all" },
      endsWhenTriggered: true,
    });
    expect(lasts(get(shielded(0), "d"), "shield-of-force")).toBe(1);
  });

  it("blocks the next attack, knocks down and Weakens the attacking foe beside it for 17 s, and ends", () => {
    const sim = shielded(12);
    expect(lasts(get(sim, "d"), "shield-of-force")).toBe(13);
    expect(sim.requestAttack("f", "d")).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT && blocksOf(log, "d") === 0; i += 1) {
      log.push(...sim.step(DT).log);
    }
    expect(blocksOf(log, "d")).toBe(1);
    stepFor(sim, 2 * DT);
    const f = get(sim, "f");
    const g = get(sim, "g");
    expect(f.knockdownRemaining).toBeGreaterThan(0);
    expect(lasts(f, "weakness")).toBe(17);
    // `g`, beside it but not attacking, is spared.
    expect(g.knockdownRemaining).toBe(0);
    expect(g.statuses.has("weakness")).toBe(false);
    expect(get(sim, "d").statuses.has("shield-of-force")).toBe(false);
  });
});

describe("Burning Shield (#2500)", () => {
  const SWORD_AND_SHIELD = wielding(WEAPONS.sword, "warrior.swordsmanship", "shield");
  const SWORD_AND_FOCUS = wielding(WEAPONS.sword, "warrior.swordsmanship", "focus");
  const leadership = (rank: number) => new Map([["paragon.leadership", rank]]);

  /** `p` at `rank`, holding `equipment`, uses Burning Shield; `f`, a swordsman beside it. */
  function burning(rank: number, equipment = SWORD_AND_SHIELD) {
    const sim = simOf([
      spec("p", 0, vec2(0, 0), {
        skillBar: [BURNING],
        attributeRanks: leadership(rank),
        equipment,
      }),
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), {
        skillBar: [HAMSTRING],
        equipment: SWORD_AND_FOCUS,
      }),
    ]);
    useOnSelf(sim, "p", 0);
    return sim;
  }

  it("is the corpus's: gwId 2208, a 5-energy skill, instant, 20 s recharge", () => {
    expect(skill(BURNING)).toMatchObject({
      gwId: 2208,
      type: "skill",
      flash: false,
      elite: false,
      attributeId: "paragon.leadership",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0,
      rechargeSeconds: 20,
      target: "self",
    });
  });

  it("lasts 3...9 s and its Burning 1...6 s: 7.8 and 5 at rank 12", () => {
    expect(durations(skill(BURNING).effects)).toEqual([
      { scaling: { attributeId: "paragon.leadership", atZero: 3, atTwelve: 7.8 } },
    ]);
    expect(triggersOf("burning-shield")).toMatchObject([
      { on: "bearer-blocks", blocked: "melee", target: "offender" },
      { on: "bearer-blocks", blocked: "projectile", effects: [] },
    ]);
    expect(durations(triggersOf("burning-shield")[0]?.effects ?? [])).toEqual([
      { scaling: { attributeId: "paragon.leadership", atZero: 1, atTwelve: 5 } },
    ]);
    expect(getStatusDefinition("burning-shield")).toMatchObject({
      block: { chance: 1, against: "all", attackSkillsOnly: true },
      endsWhenTriggered: true,
    });
    expect(lasts(get(burning(12), "p"), "burning-shield")).toBe(8);
    expect(lasts(get(burning(0), "p"), "burning-shield")).toBe(3);
  });

  it("with no shield in hand, nothing lands", () => {
    expect(get(burning(12, SWORD_AND_FOCUS), "p").statuses.has("burning-shield")).toBe(false);
  });

  it("lets a plain swing through, blocks the melee attack skill, sets its attacker on fire for 5 s and ends", () => {
    const sim = burning(12);
    const p = get(sim, "p");
    expect(sim.requestAttack("f", "p")).toEqual({ ok: true });
    const swings = stepFor(sim, 2.5);
    expect(blocksOf(swings, "p")).toBe(0);
    expect(p.statuses.has("burning-shield")).toBe(true);

    sim.setTarget("f", "p");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 3 / DT && blocksOf(log, "p") === 0; i += 1) {
      log.push(...sim.step(DT).log);
    }
    expect(blocksOf(log, "p")).toBe(1);
    stepFor(sim, 2 * DT);
    expect(lasts(get(sim, "f"), "burning")).toBe(5);
    expect(p.statuses.has("burning-shield")).toBe(false);
  });
});
