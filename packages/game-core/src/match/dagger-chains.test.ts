import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { RANGE_MELEE } from "../distances.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyStatus } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Dagger chains in a running match (#831): an off-hand attack hits only
 * after its attacker's lead attack hit the same target; out of sequence
 * it is paid for, misses and recharges at once.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const JAGGED_STRIKE = 0;
const FOX_FANGS = 1;
const WILD_STRIKE = 2;
const BLACK_LOTUS_STRIKE = 3;
const DEATH_BLOSSOM = 4;
const MOEBIUS_STRIKE = 5;

function daggers(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.daggers,
      attributeId: "assassin.dagger-mastery",
      damageType: WEAPONS.daggers.damageType,
      requirementMet: true,
    },
  };
}

/** A rank-12 assassin with daggers and the chain attacks. */
function assassin(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [
      "assassin.jagged-strike",
      "assassin.fox-fangs",
      "assassin.wild-strike",
      "assassin.black-lotus-strike",
      "assassin.death-blossom",
      "assassin.moebius-strike",
    ],
    attributeRanks: new Map([
      ["assassin.dagger-mastery", 12],
      ["assassin.critical-strikes", 0],
    ]),
    equipment: daggers(),
    maxEnergy: 60,
    spawn,
    facing: 0,
  };
}

/** A sturdy foe in reach that does nothing but, when asked, Sprint. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: ["warrior.sprint"],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `id` uses `slot`, which must be legal, and the match runs until its blow and recovery are done. */
function use(match: MatchSimulation, id: string, slot: number): CombatLogEntry {
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  const skillId = get(match, id).skillBar[slot];
  const entry = stepFor(match, 1).find(
    (logged) => logged.cause === "skill" && logged.sourceId === id && logged.skillId === skillId,
  );
  if (entry === undefined) {
    throw new Error(`${String(skillId)} never resolved`);
  }
  return entry;
}

const NEAR = vec2(RANGE_MELEE / 2, 0);

function fight(): MatchSimulation {
  return new MatchSimulation({
    seed: "chain",
    participants: [
      assassin("a", vec2(0, 0)),
      assassin("b", vec2(0, RANGE_MELEE / 2)),
      dummy("foe", NEAR),
    ],
  });
}

const outOfSequence = (entry: CombatLogEntry) =>
  entry.events.some(
    (event) => event.kind === "attack-missed" && event.reason === "out-of-sequence",
  );

const damageTo = (entry: CombatLogEntry, targetId: string) =>
  entry.events.filter((event) => event.kind === "damage" && event.targetId === targetId).length;

describe("dagger chains (#831)", () => {
  it("Fox Fangs without a lead attack misses, costs its 5 energy and recharges at once", () => {
    const match = fight();
    const before = get(match, "a").combatant.energy;
    const entry = use(match, "a", FOX_FANGS);
    expect(outOfSequence(entry)).toBe(true);
    expect(damageTo(entry, "foe")).toBe(0);
    expect(before - get(match, "a").combatant.energy).toBeCloseTo(5, 0);
    expect(get(match, "a").combatant.cast.rechargeRemaining.has("assassin.fox-fangs")).toBe(false);
  });

  it("Jagged Strike then Fox Fangs hits, recharging as usual", () => {
    const match = fight();
    use(match, "a", JAGGED_STRIKE);
    const entry = use(match, "a", FOX_FANGS);
    expect(outOfSequence(entry)).toBe(false);
    expect(damageTo(entry, "foe")).toBe(1);
    expect(get(match, "a").combatant.cast.rechargeRemaining.has("assassin.fox-fangs")).toBe(true);
  });

  it("an off-hand after an off-hand is out of sequence", () => {
    const match = fight();
    use(match, "a", JAGGED_STRIKE);
    use(match, "a", FOX_FANGS);
    expect(outOfSequence(use(match, "a", WILD_STRIKE))).toBe(true);
  });

  it("auto-attacks between the lead and the off-hand do not break the chain", () => {
    const match = fight();
    use(match, "a", JAGGED_STRIKE);
    // The lead started an auto-attack on the foe: let it swing a few times.
    const swings = stepFor(match, 4).filter(
      (entry) => entry.cause === "weapon" && entry.sourceId === "a",
    );
    expect(swings.length).toBeGreaterThan(0);
    expect(outOfSequence(use(match, "a", FOX_FANGS))).toBe(false);
  });

  it("another assassin's lead attack opens nothing for you", () => {
    const match = fight();
    use(match, "b", JAGGED_STRIKE);
    expect(outOfSequence(use(match, "a", FOX_FANGS))).toBe(true);
  });

  it("the lead mark is gone 15 s after the hit", () => {
    const match = fight();
    use(match, "a", JAGGED_STRIKE);
    stepFor(match, 15);
    expect(outOfSequence(use(match, "a", FOX_FANGS))).toBe(true);
  });

  it("Wild Strike ends the target's stance", () => {
    const match = fight();
    expect(match.requestSkill("foe", 0)?.check).toEqual({ ok: true });
    use(match, "a", JAGGED_STRIKE);
    expect(get(match, "foe").combatant.statuses.get("sprint")).toBeDefined();
    use(match, "a", WILD_STRIKE);
    expect(get(match, "foe").combatant.statuses.get("sprint")).toBeUndefined();
  });

  it("Black Lotus Strike gives energy only on a hexed target", () => {
    const plain = fight();
    const gained = (entry: CombatLogEntry) =>
      entry.events.filter((event) => event.kind === "energy-gain" && event.targetId === "a");
    expect(gained(use(plain, "a", BLACK_LOTUS_STRIKE))).toEqual([]);

    const hexed = fight();
    applyStatus(get(hexed, "foe").combatant, "malaise", 30, "b");
    // Critical Strikes 0: 5 energy.
    expect(gained(use(hexed, "a", BLACK_LOTUS_STRIKE))).toEqual([
      { kind: "energy-gain", targetId: "a", amount: 5 },
    ]);
  });
});

describe("dual attacks and Moebius Strike (#885)", () => {
  it("lead, off-hand, Death Blossom, Moebius, Death Blossom all hit; Moebius readies the dual", () => {
    const match = fight();
    // Below half health, so Moebius recharges Death Blossom's 6 s at once.
    get(match, "foe").combatant.health = 4e5;
    const chain = [JAGGED_STRIKE, FOX_FANGS, DEATH_BLOSSOM, MOEBIUS_STRIKE, DEATH_BLOSSOM];
    // A dual's recovery outlasts the second `use` waits: let each finish
    // first. Death Blossom comes round again 4 s later, short of its 6 s
    // recharge.
    const hits = chain.map((slot) => {
      const hit = damageTo(use(match, "a", slot), "foe");
      stepFor(match, 1);
      return hit;
    });
    expect(hits).toEqual([1, 1, 2, 1, 2]);
  });

  it("Death Blossom is out of sequence after a lead attack", () => {
    const match = fight();
    use(match, "a", JAGGED_STRIKE);
    expect(outOfSequence(use(match, "a", DEATH_BLOSSOM))).toBe(true);
  });
});
