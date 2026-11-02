import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { strikesOf } from "../skills/testing.js";
import { moveSpeedMultiplier } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Warrior skills keyed on Health or on who stands where (#2096): Thrill of
 * Victory and "You Will Die!" pay adrenaline on a Health comparison,
 * "You're All Alone!" conditions a lone foe, "Retreat!" speeds the party
 * up beside a dead ally, and Protector's Defense lends the allies beside
 * its bearer a block until the bearer moves. Nothing crits.
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
const HEALTH = 1e6;
/** Holds the strikes an adrenaline gain fills. */
const ADRENAL = "warrior.backbreaker";

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

/** A body that neither regenerates nor dies, with a sword and `skillBar`. */
function body(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: new Map([
      ["warrior.tactics", 12],
      ["warrior.strength", 12],
    ]),
    equipment: SWORD,
    maxHealth: HEALTH,
    maxEnergy: 100,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

function match(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "warrior-conditions", ruleset: RULES, participants });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function run(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `w` uses its first skill at `targetId`; the log until its entry, and that entry. */
function cast(sim: MatchSimulation, targetId: string): CombatLogEntry {
  sim.setTarget("w", targetId);
  expect(sim.requestSkill("w", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 5 / DT; tick += 1) {
    const entry = sim.step(DT).log.find(({ sourceId, skillId }) => {
      return sourceId === "w" && skillId !== undefined;
    });
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error("the skill never landed");
}

function damageOn(entry: CombatLogEntry, targetId: string): number {
  return entry.events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );
}

describe("Thrill of Victory (#2096)", () => {
  const duel = (): MatchSimulation =>
    match(
      body("w", 0, vec2(0, 0), ["warrior.thrill-of-victory", ADRENAL]),
      body("f", 1, vec2(RANGE_MELEE / 2, 0)),
    );

  // The hit itself fills 1 strike, as every melee hit does.
  it("compares Health after the blow: a foe it leaves with less gives 2 strikes", () => {
    const sim = duel();
    get(sim, "w").health = HEALTH / 2;
    // More Health than the attacker before the blow, less after it.
    get(sim, "f").health = HEALTH / 2 + 5;
    const entry = cast(sim, "f");
    expect(damageOn(entry, "f")).toBeGreaterThan(5);
    expect(strikesOf(get(sim, "w"), ADRENAL)).toBe(1 + 2);
  });

  it("gives no adrenaline against a foe still with more Health", () => {
    const sim = duel();
    get(sim, "w").health = HEALTH / 2;
    cast(sim, "f");
    expect(strikesOf(get(sim, "w"), ADRENAL)).toBe(1);
  });

  it("hits for 36 more than the plain swing", () => {
    const thrill = damageOn(cast(duel(), "f"), "f");
    const plain = match(body("w", 0, vec2(0, 0)), body("f", 1, vec2(RANGE_MELEE / 2, 0)));
    expect(plain.requestAttack("w", "f")).toEqual({ ok: true });
    const swing = run(plain, 3).find(({ sourceId }) => sourceId === "w");
    if (swing === undefined) {
      throw new Error("the plain swing never landed");
    }
    expect(thrill - damageOn(swing, "f")).toBeCloseTo(36, 0);
  });
});

describe('"You Will Die!" (#2096)', () => {
  const duel = (foeFraction: number): MatchSimulation => {
    const sim = match(
      body("w", 0, vec2(0, 0), ["warrior.you-will-die", ADRENAL]),
      body("f", 1, vec2(200, 0)),
    );
    get(sim, "f").health = HEALTH * foeFraction;
    return sim;
  };

  it("gives 3 strikes against a foe at 89% Health", () => {
    const sim = duel(0.89);
    cast(sim, "f");
    expect(strikesOf(get(sim, "w"), ADRENAL)).toBe(3);
  });

  it("gives none at exactly 90%", () => {
    const sim = duel(0.9);
    cast(sim, "f");
    expect(strikesOf(get(sim, "w"), ADRENAL)).toBe(0);
  });
});

describe('"You\'re All Alone!" (#2096)', () => {
  const alone = (allyUnits: number): MatchSimulation =>
    match(
      body("w", 0, vec2(0, 0), ["warrior.youre-all-alone"]),
      body("f", 1, vec2(200, 0)),
      body("g", 1, vec2(200, allyUnits)),
    );

  it("does nothing to a foe with an ally 80 units away", () => {
    const sim = alone(80);
    cast(sim, "f");
    expect(get(sim, "f").statuses.has("crippled")).toBe(false);
    expect(get(sim, "f").statuses.has("weakness")).toBe(false);
  });

  it("cripples and weakens a foe 90 units from its ally for 8 seconds", () => {
    const sim = alone(90);
    cast(sim, "f");
    expect(get(sim, "f").statuses.get("crippled")?.remainingSeconds).toBeCloseTo(8, 1);
    expect(get(sim, "f").statuses.get("weakness")?.remainingSeconds).toBeCloseTo(8, 1);
  });
});

describe('"Retreat!" (#2096)', () => {
  const party = (corpseUnits: number): MatchSimulation => {
    const sim = match(
      body("w", 0, vec2(0, 0), ["warrior.retreat"]),
      body("a", 0, vec2(0, 200)),
      body("d", 0, vec2(corpseUnits, 0)),
      body("f", 1, vec2(-2000, 0)),
    );
    get(sim, "d").health = 0;
    get(sim, "d").dead = true;
    return sim;
  };

  it("with a dead ally 300 units away, speeds the caster and an ally in earshot up", () => {
    const sim = party(300);
    cast(sim, "w");
    for (const id of ["w", "a"]) {
      expect(moveSpeedMultiplier(get(sim, id))).toBeCloseTo(1.33);
    }
    run(sim, 9.5);
    expect(get(sim, "a").statuses.has("retreat")).toBe(true);
    run(sim, 0.5);
    expect(get(sim, "a").statuses.has("retreat")).toBe(false);
  });

  it("with the corpse 400 units away, is spent for nothing", () => {
    const sim = party(400);
    get(sim, "w").energy = 50;
    cast(sim, "w");
    expect(get(sim, "w").energy).toBeLessThan(50);
    expect(get(sim, "w").statuses.has("retreat")).toBe(false);
    expect(get(sim, "a").statuses.has("retreat")).toBe(false);
  });
});

describe("Protector's Defense (#2096)", () => {
  /** `w` holds it; `a` beside it, `b` 60 units off, each swung at by a foe. */
  const guarded = (): MatchSimulation => {
    const sim = match(
      body("w", 0, vec2(0, 0), ["warrior.protectors-defense"]),
      body("a", 0, vec2(30, 0)),
      body("b", 0, vec2(0, 60)),
      body("f", 1, vec2(30 + RANGE_MELEE / 2, 0)),
      body("g", 1, vec2(0, 60 + RANGE_MELEE / 2)),
    );
    cast(sim, "w");
    sim.step(DT);
    return sim;
  };
  const count = (log: readonly CombatLogEntry[], targetId: string, kind: string): number =>
    log
      .flatMap(({ events }) => events)
      .filter((event) => event.kind === kind && "targetId" in event && event.targetId === targetId)
      .length;

  it("lends an adjacent ally a 75% block, and neither the bearer nor an ally 60 units off", () => {
    const sim = guarded();
    expect(get(sim, "a").statuses.has("protectors-defense-block")).toBe(true);
    expect(get(sim, "w").statuses.has("protectors-defense-block")).toBe(false);
    expect(get(sim, "b").statuses.has("protectors-defense-block")).toBe(false);
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
    expect(sim.requestAttack("g", "b")).toEqual({ ok: true });
    const log = run(sim, 6.5);
    const blocked = count(log, "a", "attack-blocked");
    const swings = blocked + count(log, "a", "damage");
    expect(swings).toBeGreaterThan(3);
    expect(blocked / swings).toBeGreaterThan(0.5);
    expect(count(log, "b", "attack-blocked")).toBe(0);
  });

  it("ends with one step of its bearer, and the block with it", () => {
    const sim = guarded();
    sim.setInputDirection("w", vec2(0, -1));
    sim.step(DT);
    expect(get(sim, "w").statuses.has("protectors-defense")).toBe(false);
    sim.step(DT);
    expect(get(sim, "a").statuses.has("protectors-defense-block")).toBe(false);
  });
});
