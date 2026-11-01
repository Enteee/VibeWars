import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, MAX_RECHARGE_REDUCTION } from "./status.js";
import { resolveTargets } from "./targeting.js";
import { makeCombatant } from "./testing.js";
import { moveSpeedMultiplier } from "./tick.js";
import type { Combatant, Skill, SurroundingBody, Surroundings } from "./types.js";

/**
 * The Mesmer and Elementalist staples (#938): Cry of Frustration, Mantra
 * of Recovery, Ice Spikes and Deep Freeze, each landed on scripted foes;
 * the Mantra's faster recharge in a match.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["mesmer.domination-magic", 12],
  ["mesmer.fast-casting", 12],
  ["elementalist.water-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 30 });
}

/** A foe, 1 s into a 3 s cast of Fireball when `casting`. */
function foe(id: string, casting = false): Combatant {
  const combatant = makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000 });
  if (casting) {
    combatant.cast.beginCast("elementalist.fireball", combatant.id, 3, undefined);
  }
  return combatant;
}

/** `user` pays for `skillId` and it lands on `targets`, among `surroundings`. */
function use(
  user: Combatant,
  skillId: string,
  targets: readonly Combatant[],
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

function at(combatant: Combatant, position: Vec2): SurroundingBody {
  return { combatant, position, creature: undefined, corpseExploited: false };
}

describe("Cry of Frustration (#938)", () => {
  const CRY = "mesmer.cry-of-frustration";

  /** The target at the origin; `near` in its area, `far` just past it. */
  function crowd(targetCasting: boolean, nearCasting: boolean) {
    const target = foe("target", targetCasting);
    const near = foe("near", nearCasting);
    const far = foe("far", true);
    const surroundings: Surroundings = new Map([
      ["target", at(target, vec2(0, 0))],
      ["near", at(near, vec2(AREA_IN_THE_AREA, 0))],
      ["far", at(far, vec2(AREA_IN_THE_AREA + 1, 0))],
    ]);
    return { target, near, far, surroundings };
  }

  it("on a casting target: 63 to it and 47 to a casting foe in the area, both interrupted", () => {
    const { target, near, far, surroundings } = crowd(true, true);
    const events = use(caster(), CRY, [target], surroundings);
    expect(target.health).toBe(1000 - 63);
    expect(near.health).toBe(1000 - 47);
    expect(target.cast.activeCast).toBeUndefined();
    expect(near.cast.activeCast).toBeUndefined();
    expect(events.filter((event) => event.kind === "interrupted").map((e) => e.targetId)).toEqual([
      "target",
      "near",
    ]);
    expect(far.health).toBe(1000);
    expect(far.cast.activeCast).toBeDefined();
  });

  it("a foe in the area that is not casting still takes its 75%", () => {
    const { target, near, surroundings } = crowd(true, false);
    use(caster(), CRY, [target], surroundings);
    expect(near.health).toBe(1000 - 47);
  });

  it("on a target not using a skill: nothing, even to a casting foe beside it", () => {
    const { target, near, surroundings } = crowd(false, true);
    const user = caster();
    const events = use(user, CRY, [target], surroundings);
    expect(events.filter((event) => event.kind !== "interrupt-missed")).toEqual([]);
    expect(target.health).toBe(1000);
    expect(near.health).toBe(1000);
    expect(near.cast.activeCast).toBeDefined();
    expect(user.energy).toBe(20);
  });
});

describe("Ice Spikes and Deep Freeze (#938)", () => {
  /** Who `skillId`, aimed at a target at (300, 0), reaches of foes `offset` from it. */
  function reached(skillId: string, offsets: readonly number[]): string[] {
    const target = foe("target");
    const others = offsets.map((_, i) => foe(`foe-${String(i)}`));
    const user = caster();
    return resolveTargets({
      skill: skill(skillId),
      caster: user,
      casterPosition: vec2(0, 0),
      primary: at(target, vec2(300, 0)),
      candidates: [
        at(user, vec2(0, 0)),
        ...others.map((other, i) => at(other, vec2(300 + (offsets[i] ?? 0), 0))),
      ],
      losBlockers: [],
    }).map(({ id }) => id);
  }

  it("Ice Spikes reaches the target and adjacent foes, not one twice as far", () => {
    expect(reached("elementalist.ice-spikes", [AREA_ADJACENT, 2 * AREA_ADJACENT])).toEqual([
      "target",
      "foe-0",
    ]);
  });

  it("Deep Freeze reaches every foe in the area, not one past it", () => {
    expect(
      reached("elementalist.deep-freeze", [AREA_ADJACENT, AREA_IN_THE_AREA, AREA_IN_THE_AREA + 1]),
    ).toEqual(["target", "foe-0", "foe-1"]);
  });

  it.each([
    ["elementalist.ice-spikes", "ice-spikes", 68, 5],
    ["elementalist.deep-freeze", "deep-freeze", 70, 10],
  ] as const)("%s deals %s's cold and slows to 34% speed", (skillId, statusId, cold, seconds) => {
    const target = foe("target");
    use(caster(), skillId, [target]);
    expect(target.health).toBe(
      1000 - mitigate(skillDamage(cold, "cold", 0), target, RULES, "chest"),
    );
    expect(target.statuses.get(statusId)?.remainingSeconds).toBe(seconds);
    expect(moveSpeedMultiplier(target)).toBeCloseTo(0.34, 9);
  });

  it("on a foe Shard Storm already slows, the slows multiply, down to the 25% floor", () => {
    const target = foe("target");
    target.statuses.apply("shard-storm", 5, "caster", NO_RANKS);
    use(caster(), "elementalist.deep-freeze", [target]);
    expect(aggregateModifiers(target.statuses.active).moveSpeedMultiplier).toBeCloseTo(
      0.34 * 0.34,
      9,
    );
    expect(moveSpeedMultiplier(target)).toBe(0.25);
  });

  it("neither flies: GW1 drops them from the sky", () => {
    expect(skill("elementalist.ice-spikes").projectile).toBeUndefined();
    expect(skill("elementalist.deep-freeze").projectile).toBeUndefined();
  });
});

describe("Mantra of Recovery (#938)", () => {
  const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
  const MANTRA = 0;
  const CRY = 1;
  const SIGNET = 2;

  function match(): MatchSimulation {
    const spec = (id: string, team: number, x: number): ParticipantSpec => ({
      id,
      team,
      skillBar: ["mesmer.mantra-of-recovery", "mesmer.cry-of-frustration", "mesmer.leech-signet"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(x, 0),
      facing: 0,
    });
    return new MatchSimulation({
      seed: "mantra",
      participants: [spec("mesmer", 0, 0), spec("foe", 1, 200)],
    });
  }

  /** `slot`'s recharge, cast by the mesmer at the foe, after the Mantra when `mantra`. */
  function recharge(slot: number, mantra: boolean): number | undefined {
    const sim = match();
    if (mantra) {
      expect(sim.requestSkill("mesmer", MANTRA)?.check).toEqual({ ok: true });
      sim.step(DT);
    }
    sim.setTarget("mesmer", "foe");
    expect(sim.requestSkill("mesmer", slot)?.check).toEqual({ ok: true });
    for (let i = 0; i < 20; i += 1) {
      sim.step(DT);
    }
    const skillId = slot === CRY ? "mesmer.cry-of-frustration" : "mesmer.leech-signet";
    return sim.get("mesmer")?.combatant.cast.rechargeTotal.get(skillId);
  }

  it("lasts 17 s, and is an elite stance", () => {
    const user = caster();
    use(user, "mesmer.mantra-of-recovery", [user]);
    expect(user.statuses.get("mantra-of-recovery")?.remainingSeconds).toBe(17);
    expect(skill("mesmer.mantra-of-recovery")).toMatchObject({ type: "stance", elite: true });
  });

  it("a spell recharges in 67% of its time, a signet in all of it", () => {
    expect(recharge(CRY, false)).toBe(20);
    expect(recharge(CRY, true)).toBeCloseTo(20 * 0.67, 9);
    expect(recharge(SIGNET, true)).toBe(30);
  });

  it("two such statuses combine as 1 − Π(1 − f), at most 50% (#975)", () => {
    const one = aggregateModifiers([
      { id: "mantra-of-recovery", ranks: NO_RANKS },
    ]).spellRechargeFaster;
    const two = aggregateModifiers([
      { id: "mantra-of-recovery", ranks: NO_RANKS },
      { id: "weapon-of-quickening", ranks: NO_RANKS },
    ]).spellRechargeFaster;
    expect(one).toBeCloseTo(0.33, 9);
    expect(1 - 0.67 * 0.67).toBeGreaterThan(MAX_RECHARGE_REDUCTION);
    expect(two).toBe(MAX_RECHARGE_REDUCTION);
    expect(aggregateModifiers([]).spellRechargeFaster).toBe(0);
  });
});
