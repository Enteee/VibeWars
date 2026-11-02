import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { removedCategories } from "../match/bot/skill-intent.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { armorMultiplier } from "./damage.js";
import { applySkillEffects } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

/**
 * Elementalist staples 4 (#2232), at rank 12: Obsidian Flame (its PvP
 * split), Invoke Lightning, Teinai's Wind, Crystal Wave and Energy Blast.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const OBSIDIAN_FLAME = "elementalist.obsidian-flame";
const INVOKE_LIGHTNING = "elementalist.invoke-lightning";
const TEINAIS_WIND = "elementalist.teinais-wind";
const CRYSTAL_WAVE = "elementalist.crystal-wave";
const ENERGY_BLAST = "elementalist.energy-blast";

/** A 25% armor-penetrating packet against the 60-armor reference. */
const lightning = (amount: number): number =>
  Math.round(amount * armorMultiplier(RULES.combat.armorReferenceLevel * 0.75, RULES.combat));

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function spec(id: string, team: number, x: number, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["elementalist.air-magic", 12],
      ["elementalist.earth-magic", 12],
      ["elementalist.energy-storage", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn: vec2(x, 0),
    facing: 0,
  };
}

/** The caster `c`, its target `f` at 200, `g` adjacent to `f` and `h` away from both. */
function match(
  skillBar: readonly string[],
  more: readonly ParticipantSpec[] = [],
  foeBar: readonly string[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "ele-staples-4",
    participants: [
      spec("c", 0, 0, skillBar),
      spec("f", 1, 200, foeBar),
      spec("g", 1, 220, foeBar),
      spec("h", 1, 600, []),
      ...more,
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` uses slot `slot` at `targetId`; the log until its cast and aftercast are done. */
function cast(sim: MatchSimulation, slot: number, targetId: string): CombatLogEntry[] {
  const caster = get(sim, "c").combatant;
  caster.energy = 50;
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; caster.cast.activeCast !== undefined || caster.cast.inAftercast; i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** The damage `skillId` dealt `targetId` in `log`. */
function damage(log: readonly CombatLogEntry[], skillId: string, targetId: string): number {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap(({ events }) => events)
    .reduce(
      (sum, event) =>
        event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
      0,
    );
}

function interrupted(log: readonly CombatLogEntry[], targetId: string): boolean {
  return log
    .flatMap(({ events }) => events)
    .some((event) => event.kind === "interrupted" && event.targetId === targetId);
}

describe("the five are the corpus's (#2232)", () => {
  it.each([
    [OBSIDIAN_FLAME, 219, false, "earth-magic", 5, 1.5, 5, 5],
    [INVOKE_LIGHTNING, 1664, true, "air-magic", 10, 1, 6, 5],
    [TEINAIS_WIND, 1081, false, "air-magic", 10, 1, 8, 0],
    [CRYSTAL_WAVE, 217, false, "earth-magic", 15, 0.75, 15, 0],
    [ENERGY_BLAST, 2193, false, "energy-storage", 5, 1.5, 20, 0],
  ])("%s", (id, gwId, elite, attribute, energy, activation, recharge, overcast) => {
    const found = skill(id);
    expect(found.gwId).toBe(gwId);
    expect(found.type).toBe("spell");
    expect(found.elite).toBe(elite);
    expect(found.attributeId).toBe(`elementalist.${attribute}`);
    expect(found.cost).toEqual({ kind: "energy", amount: energy });
    expect(found.activationSeconds).toBe(activation);
    expect(found.rechargeSeconds).toBe(recharge);
    expect(found.overcast).toBe(overcast);
  });
});

describe("Obsidian Flame (#2232)", () => {
  it("strikes for the PvP 78, armor ignored, and adds 5 Overcast", () => {
    const sim = match([OBSIDIAN_FLAME]);
    const log = cast(sim, 0, "f");
    expect(damage(log, OBSIDIAN_FLAME, "f")).toBe(78);
    expect(damage(log, OBSIDIAN_FLAME, "g")).toBe(0);
    // 5, less what has worn off since the cast began.
    expect(get(sim, "c").combatant.overcast).toBeGreaterThan(4);
  });
});

describe("Invoke Lightning (#2232)", () => {
  it("strikes the target and two foes near it for 74 at 25% penetration, no fourth", () => {
    const sim = match([INVOKE_LIGHTNING], [spec("i", 1, 240, []), spec("j", 1, 260, [])]);
    const log = cast(sim, 0, "f");
    expect(damage(log, INVOKE_LIGHTNING, "f")).toBe(lightning(74));
    const struck = ["g", "h", "i", "j"].filter((id) => damage(log, INVOKE_LIGHTNING, id) > 0);
    expect(struck).toHaveLength(2);
    expect(struck).not.toContain("h");
    // 5, less what has worn off since the cast began.
    expect(get(sim, "c").combatant.overcast).toBeGreaterThan(4);
  });

  it("with one foe in range strikes only that foe", () => {
    const sim = new MatchSimulation({
      seed: "ele-staples-4",
      participants: [spec("c", 0, 0, [INVOKE_LIGHTNING]), spec("f", 1, 200, [])],
    });
    const log = cast(sim, 0, "f");
    expect(damage(log, INVOKE_LIGHTNING, "f")).toBe(lightning(74));
    expect(
      log.flatMap(({ events }) => events).filter(({ kind }) => kind === "damage"),
    ).toHaveLength(1);
  });
});

describe("Teinai's Wind (#2232)", () => {
  it("a Burning foe takes 34 + 72 and is interrupted; an adjacent one not Burning only 34", () => {
    // `f` and `g` are both casting at `c`; only `f` is Burning.
    const sim = match([TEINAIS_WIND], [], [OBSIDIAN_FLAME]);
    get(sim, "f").combatant.statuses.apply("burning", 10, "c", NO_RANKS);
    for (const id of ["f", "g"]) {
      sim.setTarget(id, "c");
      expect(sim.requestSkill(id, 0)?.check.ok).toBe(true);
    }
    const log = cast(sim, 0, "f");
    expect(damage(log, TEINAIS_WIND, "f")).toBe(106);
    expect(interrupted(log, "f")).toBe(true);
    expect(damage(log, TEINAIS_WIND, "g")).toBe(34);
    expect(interrupted(log, "g")).toBe(false);
    expect(damage(log, TEINAIS_WIND, "h")).toBe(0);
  });

  it("a Burning foe not casting is only struck", () => {
    const sim = match([TEINAIS_WIND]);
    get(sim, "f").combatant.statuses.apply("burning", 10, "c", NO_RANKS);
    const log = cast(sim, 0, "f");
    expect(damage(log, TEINAIS_WIND, "f")).toBe(106);
    expect(interrupted(log, "f")).toBe(false);
  });
});

describe("Crystal Wave (#2232)", () => {
  it("an adjacent foe with 3 conditions takes 58 + 3 × 13 and is cured; one with none takes 58", () => {
    const sim = match([CRYSTAL_WAVE], [spec("n", 1, 25, []), spec("m", 1, -25, [])]);
    const sick = get(sim, "n").combatant.statuses;
    for (const id of ["bleeding", "crippled", "weakness"] as const) {
      sick.apply(id, 20, "c", NO_RANKS);
    }
    const log = cast(sim, 0, "c");
    expect(damage(log, CRYSTAL_WAVE, "n")).toBe(97);
    expect(sick.countByCategory("condition")).toBe(0);
    expect(damage(log, CRYSTAL_WAVE, "m")).toBe(58);
    expect(damage(log, CRYSTAL_WAVE, "f")).toBe(0);
  });

  it("ignores armor: a foe in twice the reference armor still takes 58", () => {
    const armored: ParticipantSpec = {
      ...spec("n", 1, 25, []),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel * 2),
    };
    const sim = match([CRYSTAL_WAVE], [armored]);
    expect(damage(cast(sim, 0, "c"), CRYSTAL_WAVE, "n")).toBe(58);
  });

  it("with no adjacent foe the energy is spent and nothing happens", () => {
    const sim = match([CRYSTAL_WAVE]);
    const log = cast(sim, 0, "c");
    expect(log.flatMap(({ events }) => events).some((event) => event.kind === "damage")).toBe(
      false,
    );
    expect(get(sim, "c").combatant.energy).toBeLessThan(50 - 15 + 1);
  });

  it("is no cleanse a bot casts on itself: it cures foes", () => {
    expect(removedCategories(skill(CRYSTAL_WAVE))).toEqual([]);
  });
});

describe("Energy Blast (#2232)", () => {
  /** `energy` before the cost; the damage Energy Blast deals a foe. */
  function blast(energy: number): number {
    const caster = makeCombatant({
      id: "c",
      energy,
      maxEnergy: 200,
      attributeRanks: new Map([["elementalist.energy-storage", 12]]),
    });
    const foe = makeCombatant({ id: "f", team: 1 });
    payCost(skill(ENERGY_BLAST), caster);
    return applySkillEffects({
      surroundings: new Map(),
      skill: skill(ENERGY_BLAST),
      caster,
      targets: [foe],
      rng: createRng(1),
      rules: RULES.combat,
    }).reduce(
      (sum, event) =>
        event.kind === "damage" && event.targetId === "f" ? sum + event.amount : sum,
      0,
    );
  }

  // The corpus's 1...2 is 1.8 at rank 12; the wiki's progression rounds it
  // to 2 for each point, as every per-count amount is.
  it("deals 2 for each whole point of Energy left after its 5", () => {
    expect(blast(50)).toBe(90);
    expect(blast(15.9)).toBe(20);
  });

  it("deals nothing at 0 Energy left, and never more than 130", () => {
    expect(blast(5)).toBe(0);
    expect(blast(100)).toBe(130);
    expect(blast(200)).toBe(130);
  });
});
