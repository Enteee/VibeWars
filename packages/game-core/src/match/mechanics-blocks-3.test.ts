import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { NO_RANKS, type StatusId } from "../skills/status.js";
import { strikesOf } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Tactics stances that pay on a block (#1978): Wary Stance blocks attack
 * skills only, Soldier's Defense blocks only under a shout or chant,
 * Defensive Stance pays per melee attack skill on the bar when it ends,
 * and Auspicious Parry blocks one attack and pays when it ends. Nothing
 * crits.
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

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: { ...weapon, damageMin: weapon.damageMax },
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

/** A body that neither regenerates nor dies, with `equipment`. */
function body(
  id: string,
  team: number,
  spawn: Vec2,
  equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  skillBar: readonly string[] = [],
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: new Map([["warrior.tactics", 12]]),
    equipment,
    maxHealth: 1e6,
    maxEnergy: 100,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

/** `w`, holding `bar`, beside a sword-wielding foe `f` that can Power Attack. */
function duel(bar: readonly string[] = ["warrior.backbreaker"]): MatchSimulation {
  return new MatchSimulation({
    seed: "blocks-3",
    ruleset: RULES,
    participants: [
      body("w", 0, vec2(0, 0), SWORD, bar),
      body("f", 1, vec2(RANGE_MELEE / 2, 0), SWORD, ["warrior.power-attack"]),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** The `kind` events on `targetId` among `entries`. */
function eventsOn(
  entries: readonly CombatLogEntry[],
  targetId: string,
  kind: "attack-blocked" | "damage",
): number {
  return entries
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === kind && event.targetId === targetId).length;
}

/** `f` swings at `w` for `seconds`; the ticks' log. */
function swings(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  expect(sim.requestAttack("f", "w")).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `f` Power Attacks `w`; the log entry of the skill. */
function powerAttack(sim: MatchSimulation): CombatLogEntry {
  get(sim, "f").energy = 100;
  sim.setTarget("f", "w");
  expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 5 / DT; tick += 1) {
    const entry = sim.step(DT).log.find(({ skillId }) => skillId === "warrior.power-attack");
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error("Power Attack never landed");
}

/** Steps `sim` until `w` no longer holds `statusId`. */
function untilEnded(sim: MatchSimulation, statusId: StatusId): void {
  for (let tick = 0; tick < 30 / DT; tick += 1) {
    if (!get(sim, "w").statuses.has(statusId)) {
      return;
    }
    sim.step(DT);
  }
  throw new Error(`${statusId} never ended`);
}

describe("Wary Stance (#1978)", () => {
  it("does not block a plain swing, and gives nothing", () => {
    const sim = duel();
    get(sim, "w").energy = 50;
    get(sim, "w").statuses.apply("wary-stance", 1000, "w", NO_RANKS);
    const log = swings(sim, 5);
    expect(eventsOn(log, "w", "attack-blocked")).toBe(0);
    expect(eventsOn(log, "w", "damage")).toBeGreaterThan(0);
    expect(get(sim, "w").energy).toBe(50);
    expect(strikesOf(get(sim, "w"), "warrior.backbreaker")).toBe(0);
  });

  it("blocks an attack skill, for 5 Energy and 1 strike of adrenaline", () => {
    const sim = duel();
    get(sim, "w").energy = 50;
    get(sim, "w").statuses.apply("wary-stance", 1000, "w", NO_RANKS);
    const entry = powerAttack(sim);
    expect(entry.events.some(({ kind }) => kind === "attack-blocked")).toBe(true);
    expect(get(sim, "w").energy).toBe(55);
    expect(strikesOf(get(sim, "w"), "warrior.backbreaker")).toBe(1);
  });

  it("ends when the bearer uses a skill", () => {
    const sim = duel(["warrior.frenzy"]);
    get(sim, "w").energy = 50;
    get(sim, "w").statuses.apply("wary-stance", 1000, "w", NO_RANKS);
    expect(sim.requestSkill("w", 0)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(get(sim, "w").statuses.has("wary-stance")).toBe(false);
  });

  it("blocks every attack skill, blow or shot, and no plain attack", () => {
    const sim = duel();
    get(sim, "w").statuses.apply("wary-stance", 1000, "w", NO_RANKS);
    expect(blockChanceOf(get(sim, "w"), "melee", false)).toBe(0);
    expect(blockChanceOf(get(sim, "w"), "projectile", false)).toBe(0);
    expect(blockChanceOf(get(sim, "w"), "melee", true)).toBe(1);
    expect(blockChanceOf(get(sim, "w"), "projectile", true)).toBe(1);
  });
});

describe("Soldier's Defense (#1978)", () => {
  it("does not block without a shout or chant", () => {
    const sim = duel();
    get(sim, "w").statuses.apply("soldiers-defense", 1000, "w", NO_RANKS);
    expect(eventsOn(swings(sim, 5), "w", "attack-blocked")).toBe(0);
  });

  it("under a shout, blocks and gives 1 strike of adrenaline a block; the shout ending stops it", () => {
    const sim = duel();
    const w = get(sim, "w");
    w.statuses.apply("soldiers-defense", 1000, "w", NO_RANKS);
    w.statuses.apply("for-great-justice", 1000, "w", NO_RANKS);
    expect(blockChanceOf(w, "melee", false)).toBe(0.75);
    const log = swings(sim, 3);
    const blocked = eventsOn(log, "w", "attack-blocked");
    expect(blocked).toBeGreaterThan(0);
    expect(strikesOf(w, "warrior.backbreaker")).toBe(blocked);
    w.statuses.remove("for-great-justice");
    expect(blockChanceOf(w, "melee", false)).toBe(0);
    expect(w.statuses.has("soldiers-defense")).toBe(true);
  });
});

describe("Defensive Stance (#1978)", () => {
  /** Strikes `w` holds in Backbreaker once a short Defensive Stance ends, with `bar`. */
  function strikesAtEnd(bar: readonly string[]): number {
    const sim = duel(bar);
    get(sim, "w").statuses.apply("defensive-stance", 0.5, "w", NO_RANKS);
    untilEnded(sim, "defensive-stance");
    return strikesOf(get(sim, "w"), "warrior.backbreaker");
  }

  it("gives 1 strike per melee attack skill on the bar when it ends, at most 3", () => {
    expect(strikesAtEnd(["warrior.backbreaker", "warrior.gash"])).toBe(2);
    expect(
      strikesAtEnd([
        "warrior.backbreaker",
        "warrior.gash",
        "warrior.sever-artery",
        "warrior.eviscerate",
        "warrior.power-attack",
      ]),
    ).toBe(3);
  });

  it("does not count a bow attack skill", () => {
    expect(strikesAtEnd(["warrior.backbreaker", "ranger.power-shot"])).toBe(1);
  });
});

describe("Auspicious Parry (#1978)", () => {
  it("blocks the first attack, ends, and gives 3 strikes; the second attack hits", () => {
    const sim = duel();
    get(sim, "w").statuses.apply("auspicious-parry", 8, "w", NO_RANKS);
    expect(sim.requestAttack("f", "w")).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < 10 / DT; tick += 1) {
      log.push(...sim.step(DT).log);
      if (eventsOn(log, "w", "damage") > 0) {
        break;
      }
    }
    expect(eventsOn(log, "w", "attack-blocked")).toBe(1);
    expect(eventsOn(log, "w", "damage")).toBe(1);
    expect(get(sim, "w").statuses.has("auspicious-parry")).toBe(false);
    expect(strikesOf(get(sim, "w"), "warrior.backbreaker")).toBe(3);
  });
});
