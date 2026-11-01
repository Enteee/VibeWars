import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { makeCombatant, strikesOf } from "../skills/testing.js";
import { NO_RANKS } from "../skills/status.js";
import { KNOCKDOWN_SECONDS } from "../skills/types.js";
import { weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Blocks that pay or pay off (#1974): Distortion's Energy per block,
 * Shield Guardian's heal on a block, Furious Axe's and Leviathan's
 * Sweep's `onBlocked`, and Glass Arrows' Bleeding on a blocked arrow. A
 * block is a 75% roll, so each test steps, or tries seeds, until one
 * lands; nothing crits.
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

const AXE = wielding(WEAPONS.axe, "warrior.axe-mastery");
const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");
const BOW = wielding(WEAPONS.longbow, "ranger.marksmanship");

/** A body that neither regenerates nor dies, with `equipment`. */
function body(
  id: string,
  team: number,
  spawn: Vec2,
  equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  skillBar: readonly string[] = [],
  attributeRanks = new Map<string, number>(),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment,
    maxHealth: 1e6,
    maxEnergy: 100,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

function match(participants: ParticipantSpec[], seed = "blocks-2"): MatchSimulation {
  return new MatchSimulation({ seed, ruleset: RULES, participants });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** The blocks on `targetId` among `entries`. */
function blocksOn(entries: readonly CombatLogEntry[], targetId: string): number {
  return entries
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === "attack-blocked" && event.targetId === targetId).length;
}

/** `attackerId` attacks `targetId`, stepped until `done` holds; the ticks' log. */
function attackUntil(
  sim: MatchSimulation,
  attackerId: string,
  targetId: string,
  done: (log: readonly CombatLogEntry[]) => boolean,
  seconds = 60,
): CombatLogEntry[] {
  expect(sim.requestAttack(attackerId, targetId)).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    log.push(...sim.step(DT).log);
    if (done(log)) {
      return log;
    }
  }
  throw new Error(`never done in ${String(seconds)} s`);
}

describe("Distortion (#1974)", () => {
  function distorted(energy: number): MatchSimulation {
    const sim = match([body("m", 0, vec2(0, 0)), body("f", 1, vec2(RANGE_MELEE / 2, 0), SWORD)]);
    const mesmer = get(sim, "m");
    mesmer.energy = energy;
    mesmer.statuses.apply("distortion", 1000, "m", NO_RANKS);
    return sim;
  }

  it("at 10 Energy, three blocks leave 4 and the stance up", () => {
    const sim = distorted(10);
    attackUntil(sim, "f", "m", (log) => blocksOn(log, "m") === 3);
    expect(get(sim, "m").energy).toBe(4);
    expect(get(sim, "m").statuses.has("distortion")).toBe(true);
  });

  it("at 3 Energy, the second block still blocks, then ends it and takes nothing", () => {
    const sim = distorted(3);
    const log = attackUntil(sim, "f", "m", () => !get(sim, "m").statuses.has("distortion"));
    expect(blocksOn(log, "m")).toBe(2);
    expect(get(sim, "m").energy).toBe(1);
  });
});

describe("Shield Guardian (#1974)", () => {
  it("a block heals the blocker and an ally in earshot 30 each, and ends the blocker's copy only", () => {
    const sim = match([
      body("w", 0, vec2(0, 0)),
      body("a", 0, vec2(0, 200)),
      // The monk stands far off, so only the two bearers are in earshot.
      body("mo", 0, vec2(-5000, 0), undefined, [], new Map([["monk.protection-prayers", 12]])),
      body("f", 1, vec2(RANGE_MELEE / 2, 0), SWORD),
    ]);
    for (const id of ["w", "a"]) {
      get(sim, id).health = 5e5;
      get(sim, id).statuses.apply("shield-guardian", 1000, "mo", NO_RANKS);
    }
    const log = attackUntil(sim, "f", "w", (entries) => blocksOn(entries, "w") === 1);
    const heals = log
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "heal")
      .map((event) => [event.targetId, event.amount]);
    expect(heals).toEqual([
      ["w", 30],
      ["a", 30],
    ]);
    expect(get(sim, "w").statuses.has("shield-guardian")).toBe(false);
    expect(get(sim, "a").statuses.has("shield-guardian")).toBe(true);
  });
});

describe("blocked attack skills (#1974)", () => {
  /** `w`'s `skillId` at a foe under Shield of Deflection, under the first seed it is blocked. */
  function blocked(
    skillId: string,
    attributeId: string,
  ): { sim: MatchSimulation; entry: CombatLogEntry } {
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = match(
        [
          body(
            "w",
            0,
            vec2(0, 0),
            AXE,
            [skillId, "warrior.backbreaker"],
            new Map([[attributeId, 12]]),
          ),
          body("t", 1, vec2(AREA_ADJACENT - 10, 0)),
        ],
        `blocked-${String(seed)}`,
      );
      get(sim, "w").energy = 100;
      get(sim, "t").statuses.apply("shield-of-deflection", 1000, "t", NO_RANKS);
      sim.setTarget("w", "t");
      expect(sim.requestSkill("w", 0)?.check).toEqual({ ok: true });
      for (let tick = 0; tick < 3 / DT; tick += 1) {
        const entry = sim.step(DT).log.find((logged) => logged.skillId === skillId);
        if (entry !== undefined) {
          if (entry.events.some(({ kind }) => kind === "attack-blocked")) {
            return { sim, entry };
          }
          break;
        }
      }
    }
    throw new Error(`${skillId} was never blocked`);
  }

  it("Furious Axe, blocked, gives an adrenal skill 3 strikes", () => {
    const { sim } = blocked("warrior.furious-axe", "warrior.axe-mastery");
    expect(strikesOf(get(sim, "w"), "warrior.backbreaker")).toBe(3);
  });

  it("Leviathan's Sweep, blocked, knocks its target down and deals it 29", () => {
    const { sim, entry } = blocked("warrior.leviathans-sweep", "warrior.strength");
    expect(get(sim, "t").knockdownRemaining).toBeGreaterThan(KNOCKDOWN_SECONDS - 0.5);
    const dealt = entry.events.reduce(
      (sum, event) =>
        event.kind === "damage" && event.targetId === "t" ? sum + event.amount : sum,
      0,
    );
    expect(dealt).toBe(29);
  });
});

describe("Glass Arrows (#1974)", () => {
  it("arrows strike for +16; a sword's blows do not", () => {
    const archer = makeCombatant({ id: "archer", equipment: BOW });
    const swordsman = makeCombatant({ id: "swordsman", equipment: SWORD });
    archer.statuses.apply("glass-arrows", 30, "archer", NO_RANKS);
    swordsman.statuses.apply("glass-arrows", 30, "swordsman", NO_RANKS);
    expect(weaponSnapshotOf(archer).damageDelta).toBe(16);
    expect(weaponSnapshotOf(swordsman).damageDelta).toBe(0);
  });

  function prepared(equipment: ResolvedEquipment, spawn: Vec2): MatchSimulation {
    const sim = match([body("r", 0, vec2(0, 0), equipment), body("t", 1, spawn)]);
    get(sim, "r").statuses.apply("glass-arrows", 1000, "r", NO_RANKS);
    return sim;
  }

  it("a blocked arrow Bleeds its blocker for 18 s", () => {
    const sim = prepared(BOW, vec2(600, 0));
    get(sim, "t").statuses.apply("shield-of-deflection", 1000, "t", NO_RANKS);
    attackUntil(sim, "r", "t", (log) => blocksOn(log, "t") === 1);
    expect(get(sim, "t").statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(18, 0);
  });

  it("a blind archer's misses Bleed nobody", () => {
    const sim = prepared(BOW, vec2(600, 0));
    get(sim, "r").statuses.apply("blind", 1000, "t", NO_RANKS);
    const log = attackUntil(sim, "r", "t", (entries) =>
      entries.some((entry) => entry.events.some(({ kind }) => kind === "attack-missed")),
    );
    expect(blocksOn(log, "t")).toBe(0);
    expect(get(sim, "t").statuses.has("bleeding")).toBe(false);
  });

  it("a sword's blocked blow Bleeds nobody", () => {
    const sim = prepared(SWORD, vec2(RANGE_MELEE / 2, 0));
    get(sim, "t").statuses.apply("shield-of-deflection", 1000, "t", NO_RANKS);
    attackUntil(sim, "r", "t", (log) => blocksOn(log, "t") === 3);
    expect(get(sim, "t").statuses.has("bleeding")).toBe(false);
  });
});
