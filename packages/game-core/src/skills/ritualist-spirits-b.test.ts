import { describe, expect, it } from "vitest";

import { RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { applyIntent } from "../match/apply-intent.js";
import { flagId, type FlagField } from "../match/flags.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { energyCostOf } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { raisedMaxEnergy } from "./overcast.js";
import { NO_RANKS } from "./status.js";
import { effectiveMaxHealth } from "./tick.js";
import type { Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Ritualist spirits (#2478), their PvP versions: Restoration's death
 * raises the party round it, Empowerment strengthens only allies holding
 * an item, and Soul Twisting cheapens a rank-scaled count of rituals.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RESTORATION = "ritualist.restoration";
const EMPOWERMENT = "ritualist.empowerment";
const SOUL_TWISTING = "ritualist.soul-twisting";
const RECUPERATION = "ritualist.recuperation";
const BAR = [RESTORATION, EMPOWERMENT, SOUL_TWISTING, RECUPERATION];
/** Nobody stands up on their own: only a resurrection raises. */
const NO_RESPAWN: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: false,
};
const FIELD: FlagField = {
  stand: vec2(1000, 300),
  spawns: [
    { team: 0, position: vec2(300, 300) },
    { team: 1, position: vec2(1700, 300) },
  ],
};

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, rank = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: id === "r" ? BAR : [],
    attributeRanks: new Map([
      ["ritualist.communing", rank],
      ["ritualist.spawning-power", rank],
      ["ritualist.restoration-magic", rank],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** `id` burns to death this tick. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  combatant.health = 0.2;
  sim.step(DT);
  expect(combatant.dead).toBe(true);
}

/** `r` casts `skillId` and steps until it is done; its spirit, if it made one. */
function cast(sim: MatchSimulation, skillId: string): Participant | undefined {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check.ok).toBe(true);
  stepFor(sim, skillOf(skillId).activationSeconds + DT * 2);
  return [...sim.participants()].find((p) => p.creature?.skillId === skillId && !p.combatant.dead);
}

describe("the corpus numbers (#2478)", () => {
  it.each([
    [RESTORATION, 963, 10, 3, 45, false, "ritualist.communing", "binding-ritual"],
    [EMPOWERMENT, 1747, 5, 3, 30, false, "ritualist.spawning-power", "binding-ritual"],
    [SOUL_TWISTING, 1240, 5, 0, 15, true, "ritualist.spawning-power", "skill"],
  ] as const)(
    "%s: gwId %d, %d Energy, %d s, %d s recharge",
    (id, gwId, energy, activation, recharge, elite, attributeId, type) => {
      const skill = skillOf(id);
      expect(skill.gwId).toBe(gwId);
      expect(skill.cost).toEqual({ kind: "energy", amount: energy });
      expect(skill.activationSeconds).toBe(activation);
      expect(skill.rechargeSeconds).toBe(recharge);
      expect(skill.elite).toBe(elite);
      expect(skill.attributeId).toBe(attributeId);
      expect(skill.type).toBe(type);
    },
  );
});

describe("Restoration (#2478)", () => {
  /** `r` with Restoration; ally `a` dead in its range, `far` dead out of it, foe `x` dead in it. */
  function restoration(rank = 12) {
    const sim = new MatchSimulation({
      seed: "restoration",
      matchRules: NO_RESPAWN,
      participants: [
        spec("r", 0, vec2(0, 0), rank),
        spec("a", 0, vec2(100, 0)),
        spec("far", 0, vec2(RANGE_SPIRIT * 3, 0)),
        spec("x", 1, vec2(0, 100)),
      ],
    });
    const spirit = cast(sim, RESTORATION);
    if (spirit === undefined) {
      throw new Error("no Restoration spirit");
    }
    for (const id of ["a", "far", "x"]) {
      kill(sim, id);
    }
    return { sim, spirit };
  }

  it("killed, it raises each dead party member in its range at 41% Health and no Energy", () => {
    const { sim, spirit } = restoration();
    spirit.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    spirit.combatant.health = 0.2;
    stepFor(sim, 2 * DT);
    expect(sim.get(spirit.id)).toBeUndefined();
    const a = get(sim, "a");
    expect(a.combatant.dead).toBe(false);
    expect(a.combatant.health).toBeCloseTo(410, 0);
    expect(a.combatant.energy).toBe(0);
    expect(a.respawnInSeconds).toBe(0);
    expect(get(sim, "far").combatant.dead).toBe(true);
    expect(get(sim, "x").combatant.dead).toBe(true);
  });

  it("expired at 30 s, it raises too, its caster's own corpse with them, at 5% at rank 0", () => {
    const { sim, spirit } = restoration(0);
    kill(sim, "r");
    stepFor(sim, 31);
    expect(sim.get(spirit.id)).toBeUndefined();
    for (const id of ["a", "r"]) {
      expect(get(sim, id).combatant.dead).toBe(false);
    }
    expect(get(sim, "a").combatant.health).toBeCloseTo(50, 0);
    expect(get(sim, "far").combatant.dead).toBe(true);
  });

  it("with no corpse in range, it does nothing to the living", () => {
    const sim = new MatchSimulation({
      seed: "restoration",
      matchRules: NO_RESPAWN,
      participants: [spec("r", 0, vec2(0, 0)), spec("a", 0, vec2(100, 0))],
    });
    cast(sim, RESTORATION);
    get(sim, "a").combatant.health = 500;
    const log = [];
    for (let i = 0; i < Math.round(31 / DT); i += 1) {
      log.push(...sim.step(DT).log.filter((entry) => entry.skillId === RESTORATION));
    }
    expect(log.flatMap((entry) => entry.events)).toEqual([]);
  });

  it("says what its death does", () => {
    expect(
      describeSkill(skillOf(RESTORATION), new Map(), EN_WORDS, EN_NAMES).effects.map(
        ({ text }) => text,
      ),
    ).toContain(
      "When it dies, dead party members in its range are resurrected with 5% Health and zero Energy",
    );
  });
});

describe("Empowerment (#2478)", () => {
  function empowerment(rank = 12) {
    const sim = new MatchSimulation({
      seed: "empowerment",
      participants: [spec("r", 0, vec2(0, 0), rank), spec("a", 0, vec2(100, 0))],
    });
    cast(sim, EMPOWERMENT);
    return sim;
  }

  it("leaves an ally in range holding nothing as it was", () => {
    const sim = empowerment();
    stepFor(sim, DT);
    const a = get(sim, "a").combatant;
    expect(a.statuses.has("empowerment")).toBe(false);
    expect(effectiveMaxHealth(a)).toBe(1000);
  });

  it("gives an ally holding ashes 39 maximum Health and 10 maximum Energy at rank 12, 15 at 0", () => {
    for (const [rank, bonus] of [
      [12, 39],
      [0, 15],
    ] as const) {
      const sim = empowerment(rank);
      const a = get(sim, "a").combatant;
      a.statuses.apply("protective-was-kaolai", 30, "r", NO_RANKS);
      stepFor(sim, DT);
      expect(a.statuses.has("empowerment")).toBe(true);
      expect(effectiveMaxHealth(a)).toBe(1000 + bonus);
      expect(raisedMaxEnergy(a)).toBe(110);
    }
  });

  it("follows a flag: on as it is picked up, off as it is dropped, Health clamped", () => {
    const sim = new MatchSimulation({
      seed: "empowerment-flag",
      bounds: { width: 2000, height: 600 },
      flagField: FIELD,
      participants: [spec("r", 0, vec2(200, 300)), spec("x", 1, vec2(1800, 300))],
    });
    cast(sim, EMPOWERMENT);
    const r = get(sim, "r").combatant;
    expect(r.statuses.has("empowerment")).toBe(false);
    expect(applyIntent(sim, "r", { kind: "target", targetSessionId: flagId(0) })).toBeNull();
    expect(applyIntent(sim, "r", { kind: "attack", targetId: flagId(0) })).toBeNull();
    for (let tick = 0; tick < 200 && !sim.carriesBundle("r"); tick += 1) {
      sim.step(DT);
    }
    expect(sim.carriesBundle("r")).toBe(true);
    sim.step(DT);
    expect(r.statuses.has("empowerment")).toBe(true);
    r.health = effectiveMaxHealth(r);
    expect(r.health).toBe(1039);
    sim.dropBundle("r");
    sim.step(DT);
    expect(r.statuses.has("empowerment")).toBe(false);
    expect(r.health).toBeLessThanOrEqual(1000);
  });

  it("says it needs an item", () => {
    expect(
      describeSkill(skillOf(EMPOWERMENT), new Map(), EN_WORDS, EN_NAMES).effects.map(
        ({ text }) => text,
      ),
    ).toContain(
      "Non-spirit allies in its range holding an item: +15 maximum health, +10 maximum energy",
    );
  });
});

describe("Soul Twisting (#2478)", () => {
  function twisting(rank: number) {
    const sim = new MatchSimulation({
      seed: "soul-twisting",
      participants: [spec("r", 0, vec2(0, 0), rank)],
    });
    cast(sim, SOUL_TWISTING);
    return { sim, r: get(sim, "r").combatant };
  }

  it("at rank 12: rituals cost 15 less, never under 5, recharge 45% faster, for 3 rituals", () => {
    const { sim, r } = twisting(12);
    expect(r.statuses.has("soul-twisting")).toBe(true);
    // Restoration's 10 floors at 5, not -5; Empowerment's 5 stays 5.
    expect(energyCostOf(skillOf(RESTORATION), r)).toBe(5);
    expect(energyCostOf(skillOf(EMPOWERMENT), r)).toBe(5);
    expect(energyCostOf(skillOf(SOUL_TWISTING), r)).toBe(5);
    cast(sim, RESTORATION);
    expect(r.cast.rechargeRemaining.get(RESTORATION)).toBeCloseTo(45 * 0.55, 0);
    expect(r.statuses.has("soul-twisting")).toBe(true);
    cast(sim, EMPOWERMENT);
    expect(r.statuses.has("soul-twisting")).toBe(true);
    cast(sim, RECUPERATION);
    expect(r.statuses.has("soul-twisting")).toBe(false);
  });

  it("at rank 0: ends after the one ritual, which still got the discount", () => {
    const { sim, r } = twisting(0);
    const before = r.energy;
    cast(sim, RESTORATION);
    expect(r.statuses.has("soul-twisting")).toBe(false);
    // 5 paid, not 10; a few pips of regeneration over the 3 s cast.
    expect(before - r.energy).toBeGreaterThan(3);
    expect(before - r.energy).toBeLessThanOrEqual(5);
    expect(r.cast.rechargeRemaining.get(RESTORATION)).toBeCloseTo(45 * 0.75, 0);
  });

  it("says its count scales", () => {
    expect(describeStatus("soul-twisting", undefined, EN_WORDS, EN_NAMES)).toContain(
      "your next 1...3 binding rituals cost",
    );
    expect(
      describeStatus(
        "soul-twisting",
        new Map([["ritualist.spawning-power", 0]]),
        EN_WORDS,
        EN_NAMES,
      ),
    ).toContain("your next binding ritual costs");
  });
});
