import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant, strikesOf } from "./testing.js";
import type { Combatant, SkillEffect, Surroundings } from "./types.js";

/**
 * Conditions on the move (#2259): a gained condition spread to the
 * bearer's allies, a transfer counted by rank with copies to the foes
 * beside its target, and adrenaline paid to the effect's target.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CURSES = "necromancer.curses";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    spawn,
    facing: 0,
  };
}

describe("spread-gained-condition to the bearer's allies (#2259)", () => {
  /**
   * Mesmer `m` at the origin; its hexed foe `h` 300 away, with foe `b`
   * beside it, foe `c` beside `b` but out of `h`'s area, and foe `far`
   * well away; `m`'s ally `a` beside `h`.
   */
  function arena(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "condition-movement",
      participants: [
        spec("m", 0, vec2(0, 0)),
        spec("h", 1, vec2(300, 0)),
        spec("b", 1, vec2(380, 0)),
        spec("c", 1, vec2(460, 0)),
        spec("far", 1, vec2(300, 400)),
        spec("a", 0, vec2(320, 0)),
      ],
    });
    statuses(match, "h").apply("fevered-dreams", 13, "m", NO_RANKS);
    return match;
  }

  function statuses(match: MatchSimulation, id: string) {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant.statuses;
  }

  it("reaches the hexed foe's allies in the area, as the caster's, and not the caster's side", () => {
    const match = arena();
    statuses(match, "h").apply("bleeding", 10, "x", NO_RANKS);
    match.step(DT);

    expect(statuses(match, "b").get("bleeding")?.sourceId).toBe("m");
    expect(statuses(match, "b").get("bleeding")?.remainingSeconds).toBeCloseTo(10, 0);
    for (const id of ["c", "far", "a", "m"]) {
      expect(statuses(match, id).has("bleeding"), id).toBe(false);
    }
  });

  it("ignores a condition the bearer already has", () => {
    const match = arena();
    statuses(match, "h").apply("bleeding", 10, "x", NO_RANKS);
    match.step(DT);
    statuses(match, "b").remove("bleeding");
    statuses(match, "h").apply("bleeding", 20, "x", NO_RANKS);
    match.step(DT);

    expect(statuses(match, "b").has("bleeding")).toBe(false);
  });

  it("does not chain from a copy, even onto another Fevered Dreams", () => {
    const match = arena();
    statuses(match, "b").apply("fevered-dreams", 13, "m", NO_RANKS);
    statuses(match, "h").apply("poison", 10, "x", NO_RANKS);
    match.step(DT);

    expect(statuses(match, "b").has("poison")).toBe(true);
    expect(statuses(match, "c").has("poison")).toBe(false);
  });
});

/** Whoever is where, for an effect that reads positions. */
function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

function apply(
  effects: readonly SkillEffect[],
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings,
): CombatEvent[] {
  return applyEffects(effects, {
    caster,
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings,
    usedSkill: undefined,
  });
}

describe("transfer-conditions by rank, with copies (#2259)", () => {
  const SENDING: SkillEffect = {
    kind: "transfer-conditions",
    from: "caster",
    count: { scaling: { attributeId: CURSES, atZero: 1, atTwelve: 2.6 } },
    durationMultiplier: 1,
    copyToFoesWithin: AREA_ADJACENT,
  };
  const CONDITIONS: readonly StatusId[] = ["bleeding", "poison", "blind", "crippled"];

  /** A caster at `rank` bearing four conditions, its foe `t`, and those round `t`. */
  function scene(rank: number) {
    const caster = makeCombatant({ id: "n", team: 0, attributeRanks: new Map([[CURSES, rank]]) });
    CONDITIONS.forEach((id, at) => caster.statuses.apply(id, 10 + at, "x", NO_RANKS));
    const target = makeCombatant({ id: "t", team: 1 });
    const beside = makeCombatant({ id: "beside", team: 1 });
    const byCaster = makeCombatant({ id: "by-caster", team: 1 });
    const ally = makeCombatant({ id: "ally", team: 0 });
    const surroundings = placed(
      [caster, vec2(0, 0)],
      [target, vec2(200, 0)],
      [beside, vec2(200 + AREA_ADJACENT - 5, 0)],
      [byCaster, vec2(10, 0)],
      [ally, vec2(200, 10)],
    );
    return { caster, target, beside, byCaster, ally, surroundings };
  }

  const conditions = (combatant: Combatant): StatusId[] =>
    combatant.statuses.active.flatMap(({ id }) => (CONDITIONS.includes(id) ? [id] : [])).sort();

  it.each([
    [12, ["blind", "crippled", "poison"]],
    [0, ["crippled"]],
  ] as const)("at rank %i moves the newest, %j, with copies beside the target", (rank, moved) => {
    const { caster, target, beside, byCaster, ally, surroundings } = scene(rank);
    apply([SENDING], caster, target, surroundings);

    expect(conditions(target)).toEqual(moved);
    expect(conditions(beside)).toEqual(moved);
    expect(beside.statuses.get("crippled")?.sourceId).toBe("n");
    expect(beside.statuses.get("crippled")?.remainingSeconds).toBe(13);
    expect(conditions(caster)).toEqual(
      CONDITIONS.filter((id) => !new Set<StatusId>(moved).has(id)).sort(),
    );
    expect(conditions(byCaster)).toEqual([]);
    expect(conditions(ally)).toEqual([]);
  });

  it("moves them all with a count of { flat: Infinity }", () => {
    const { caster, target, surroundings } = scene(0);
    apply([{ ...SENDING, count: { flat: Infinity } }], caster, target, surroundings);
    expect(conditions(target)).toEqual([...CONDITIONS].sort());
    expect(conditions(caster)).toEqual([]);
  });
});

describe('adrenaline-gain to recipient: "target" (#2259)', () => {
  const GAIN: SkillEffect = {
    kind: "adrenaline-gain",
    strikes: { scaling: { attributeId: "necromancer.blood-magic", atZero: 0, atTwelve: 1.6 } },
    recipient: "target",
  };

  it.each([
    [12, 2],
    [0, 0],
  ] as const)(
    "at the caster's rank %i pays the target %i strikes, the caster none",
    (rank, strikes) => {
      const caster = makeCombatant({
        id: "n",
        attributeRanks: new Map([["necromancer.blood-magic", rank]]),
        adrenaline: new Map([["warrior.sever-artery", 0]]),
      });
      const target = makeCombatant({ id: "w", adrenaline: new Map([["warrior.sever-artery", 0]]) });
      apply([GAIN], caster, target, new Map());

      expect(strikesOf(target, "warrior.sever-artery")).toBe(strikes);
      expect(strikesOf(caster, "warrior.sever-artery")).toBe(0);
    },
  );
});
