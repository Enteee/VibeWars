import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyDamage, applyEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, ownSkillBoost, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * Vengeance, Healing Burst, Hypochondria, Iron Mist and Chilling Winds
 * (#2311): damage dealt and death on end, a Divine Favor party heal, an
 * area condition gather, foe-targeted own-skill modifiers with Overcast,
 * and a next-hex duration. The corpus's numbers, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "monk.healing-prayers",
  "monk.divine-favor",
  "elementalist.earth-magic",
  "elementalist.air-magic",
  "elementalist.water-magic",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));
const DP: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: true,
};

const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  rank: number,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: ranked(rank),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** `id` uses its skill in `slot` on `targetId`, and the activation runs out. */
function cast(sim: MatchSimulation, id: string, slot: number, targetId: string): void {
  sim.setTarget(id, targetId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  stepFor(sim, skill(get(sim, id).skillBar[slot] ?? "").activationSeconds + 0.1);
}

describe("the five are the corpus's (#2311)", () => {
  it.each([
    ["monk.vengeance", 315, "enchantment", undefined, 10, 4, 30, false],
    ["monk.healing-burst", 1118, "spell", "monk.healing-prayers", 5, 0.75, 6, true],
    ["mesmer.hypochondria", 1334, "spell", undefined, 5, 0.25, 7, false],
    ["elementalist.iron-mist", 216, "enchantment", "elementalist.earth-magic", 10, 1, 20, false],
    ["elementalist.chilling-winds", 1368, "hex", "elementalist.air-magic", 5, 1, 8, false],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
      });
    },
  );

  it("Vengeance raises the dead only", () => {
    expect(skill("monk.vengeance").target).toBe("single-dead-ally");
  });
});

describe("Vengeance (#2311)", () => {
  /** `m` raises `a` with Vengeance; `x`, a foe, far off. */
  function raised(rules: MatchRules = DP) {
    const sim = new MatchSimulation({
      seed: "vengeance",
      matchRules: rules,
      participants: [
        spec("a", 0, vec2(0, 0), [], 0),
        spec("m", 0, vec2(60, 0), ["monk.vengeance"], 0),
        spec("x", 1, vec2(900, 0), [], 0),
      ],
    });
    const a = get(sim, "a");
    a.statuses.apply("burning", 10, "x", NO_RANKS);
    a.health = 0.2;
    sim.step(DT);
    expect(a.dead).toBe(true);
    expect(a.morale).toBe(rules.deathPenalty ? -15 : 0);
    cast(sim, "m", 0, "a");
    return { sim, a };
  }

  it("brings the ally back at full Health and full Energy, enchanted for 30 s", () => {
    const { a } = raised();
    expect(a.dead).toBe(false);
    expect(a.health).toBe(a.maxHealth);
    expect(a.energy).toBe(a.maxEnergy);
    expect(a.statuses.get("vengeance")?.remainingSeconds).toBeGreaterThan(29);
  });

  it("the ally dies when it runs out, paying no death penalty", () => {
    const { sim, a } = raised();
    stepFor(sim, 29);
    expect(a.dead).toBe(false);
    stepFor(sim, 1.5);
    expect(a.dead).toBe(true);
    expect(a.morale).toBe(-15);
  });

  it("removed early, the ally dies at once", () => {
    const { sim, a } = raised();
    stepFor(sim, 6);
    a.statuses.remove("vengeance");
    sim.step(DT);
    expect(a.dead).toBe(true);
    // Its corpse is not spent, as Unyielding Aura's is (#2470).
    expect(sim.get("a")?.corpseExploited).toBe(false);
    expect(a.morale).toBe(-15);
  });

  it("killed while enchanted, it pays no death penalty; with none, a death costs 15%", () => {
    const { sim, a } = raised();
    stepFor(sim, 6);
    a.statuses.apply("burning", 10, "x", NO_RANKS);
    a.health = 0.2;
    sim.step(DT);
    expect(a.dead).toBe(true);
    expect(a.morale).toBe(-15);
  });

  it("with the match's death penalty off, the end-death still kills", () => {
    const { sim, a } = raised({ ...DP, deathPenalty: false });
    stepFor(sim, 31);
    expect(a.dead).toBe(true);
    expect(a.morale).toBe(0);
  });

  it("deals 25% more of every damage; without it, as dealt", () => {
    const target = makeCombatant({ id: "t", team: 1, health: 1000, maxHealth: 1000 });
    const dealer = makeCombatant({ id: "d", team: 0 });
    const plain: CombatEvent[] = [];
    applyDamage(target, 100, "fire", false, plain, dealer);
    dealer.statuses.apply("vengeance", 30, "m", NO_RANKS);
    const more: CombatEvent[] = [];
    applyDamage(target, 100, "fire", false, more, dealer);
    expect(plain).toContainEqual(expect.objectContaining({ kind: "damage", amount: 100 }));
    expect(more).toContainEqual(expect.objectContaining({ kind: "damage", amount: 125 }));
  });

  it("describes all three", () => {
    const text = describeStatus("vengeance");
    expect(text).toContain("+25% damage");
    expect(text).toContain("no death penalty");
    expect(text).toContain("dies when it ends");
  });
});

describe("Healing Burst (#2311)", () => {
  /**
   * `m` heals `a`; `b` is in earshot of `a`, `c` beyond it, and `m`
   * itself too far off to share in it. Each starts at 100 Health.
   */
  function burst(rank: number) {
    const sim = new MatchSimulation({
      seed: "healing-burst",
      participants: [
        spec("m", 0, vec2(-400, 0), ["monk.healing-burst", "monk.smite"], rank),
        spec("a", 0, vec2(0, 0), [], 0),
        spec("b", 0, vec2(AREA_EARSHOT - 20, 0), [], 0),
        spec("c", 0, vec2(0, AREA_EARSHOT + 60), [], 0),
        spec("x", 1, vec2(-300, 300), [], 0),
      ],
    });
    for (const id of ["m", "a", "b", "c"]) {
      get(sim, id).health = 100;
    }
    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.75 + 0.1);
    return sim;
  }

  it.each([
    [12, 100 + 38, 38],
    [0, 20, 0],
  ])("at rank %i, the target gains %i and the party in its earshot %i", (rank, onA, onB) => {
    const sim = burst(rank);
    expect(Math.round(get(sim, "a").health)).toBe(100 + onA);
    expect(Math.round(get(sim, "b").health)).toBe(100 + onB);
    expect(Math.round(get(sim, "c").health)).toBe(100);
    expect(Math.round(get(sim, "m").health)).toBe(100);
  });

  it("disables the caster's Smiting Prayers", () => {
    const sim = burst(12);
    stepFor(sim, 1);
    sim.setTarget("m", "x");
    expect(sim.requestSkill("m", 1)?.check.ok).toBe(false);
  });

  it("says what the party gains", () => {
    const lines = describeSkill(skill("monk.healing-burst"), ranked(12)).effects.map(
      ({ text }) => text,
    );
    expect(lines.join("\n")).toContain("Divine Favor bonus");
  });
});

describe("Hypochondria (#2311)", () => {
  function gather(withFoes: boolean) {
    const mesmer = makeCombatant({ id: "m", team: 0 });
    const target = makeCombatant({ id: "t", team: 1 });
    const near = makeCombatant({ id: "n", team: 1 });
    const far = makeCombatant({ id: "f", team: 1 });
    const ally = makeCombatant({ id: "a", team: 0 });
    target.statuses.apply("weakness", 5, "z", NO_RANKS);
    near.statuses.apply("bleeding", 8, "z", NO_RANKS);
    near.statuses.apply("poison", 12, "z", NO_RANKS);
    far.statuses.apply("burning", 4, "z", NO_RANKS);
    ally.statuses.apply("crippled", 6, "z", NO_RANKS);
    const surroundings = withFoes
      ? placed(
          [mesmer, vec2(-300, 0)],
          [target, vec2(0, 0)],
          [near, vec2(AREA_IN_THE_AREA - 10, 0)],
          [far, vec2(AREA_IN_THE_AREA + 30, 0)],
          [ally, vec2(0, 20)],
        )
      : placed([mesmer, vec2(-300, 0)], [target, vec2(0, 0)]);
    applyEffects(skill("mesmer.hypochondria").effects, {
      caster: mesmer,
      target,
      rng: steady(),
      rules: RULES.combat,
      surroundings,
      usedSkill: undefined,
    });
    return { target, near, far, ally };
  }

  const conditions = (combatant: Combatant): string[] =>
    combatant.statuses.active.map(({ id }) => id).sort();

  it("moves every condition of each foe in the area onto the target, with its time", () => {
    const { target, near, far, ally } = gather(true);
    expect(conditions(target)).toEqual(["bleeding", "poison", "weakness"]);
    expect(target.statuses.get("poison")?.remainingSeconds).toBe(12);
    expect(conditions(near)).toEqual([]);
    expect(conditions(far)).toEqual(["burning"]);
    expect(conditions(ally)).toEqual(["crippled"]);
  });

  it("with no other foe nearby, nothing moves and the target keeps its own", () => {
    const { target } = gather(false);
    expect(conditions(target)).toEqual(["weakness"]);
  });

  it("says where they come from", () => {
    const lines = describeSkill(skill("mesmer.hypochondria")).effects.map(({ text }) => text);
    expect(lines).toContain("Moves all conditions from foes in the area around it to the target");
  });
});

describe("Iron Mist (#2311)", () => {
  function misted(rank: number): Combatant {
    const elementalist = makeCombatant({ id: "e", attributeRanks: ranked(rank) });
    applyEffects(skill("elementalist.iron-mist").effects, {
      caster: elementalist,
      target: elementalist,
      rng: steady(),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    });
    return elementalist;
  }

  it.each([
    [12, 14],
    [0, 8],
  ])("at rank %i lasts %i s", (rank, seconds) => {
    expect(misted(rank).statuses.get("iron-mist")?.remainingSeconds).toBeCloseTo(seconds, 6);
  });

  it("speeds and Overcasts an Air spell at a foe; not one at an ally, nor a Fire spell", () => {
    const { active } = misted(12).statuses;
    expect(ownSkillBoost(active, skill("elementalist.lightning-orb"))).toMatchObject({
      activationMultiplier: 0.67,
      rechargeFaster: 0.33,
      overcast: 2,
    });
    for (const id of ["elementalist.windborne-speed", "elementalist.flare"]) {
      expect(ownSkillBoost(active, skill(id))).toMatchObject({
        activationMultiplier: 1,
        rechargeFaster: 0,
        overcast: 0,
      });
    }
  });

  it("each Air spell at a foe Overcasts 2 as it begins, and +15 armor holds", () => {
    const sim = new MatchSimulation({
      seed: "iron-mist",
      participants: [
        spec("e", 0, vec2(0, 0), ["elementalist.iron-mist", "elementalist.lightning-orb"], 12),
        spec("x", 1, vec2(300, 0), [], 0),
      ],
    });
    cast(sim, "e", 0, "e");
    stepFor(sim, 1);
    const e = get(sim, "e");
    expect(e.overcast).toBe(0);
    sim.setTarget("e", "x");
    expect(sim.requestSkill("e", 1)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(e.overcast).toBeCloseTo(2, 1);
    expect(describeStatus("iron-mist")).toContain("Overcast you by 2");
    expect(describeStatus("iron-mist")).toContain("that target a foe");
  });
});

describe("Chilling Winds (#2311)", () => {
  function chilled(rank: number) {
    const sim = new MatchSimulation({
      seed: "chilling-winds",
      participants: [
        spec("e", 0, vec2(0, 0), ["elementalist.chilling-winds"], rank),
        spec("x", 1, vec2(300, 0), [], 0),
        spec("y", 1, vec2(300 + AREA_ADJACENT / 2, 0), [], 0),
        spec("z", 1, vec2(300, AREA_ADJACENT * 3), [], 0),
      ],
    });
    cast(sim, "e", 0, "x");
    return sim;
  }

  it.each([
    [12, 54],
    [0, 30],
  ])("at rank %i strikes the target and adjacent foes for %i cold, hexing them 10 s", (rank) => {
    const sim = chilled(rank);
    for (const id of ["x", "y"]) {
      expect(get(sim, id).health).toBeLessThan(1000);
      expect(get(sim, id).statuses.get("chilling-winds")?.remainingSeconds).toBeGreaterThan(9.5);
    }
    expect(get(sim, "z").health).toBe(1000);
    expect(get(sim, "z").statuses.has("chilling-winds")).toBe(false);
  });

  /** A foe hexed with Chilling Winds at `rank`. */
  function chilledFoe(rank: number): Combatant {
    const foe = makeCombatant({ id: "f", team: 1, health: 5000, maxHealth: 5000 });
    foe.statuses.apply("chilling-winds" satisfies StatusId, 10, "w", ranked(rank));
    return foe;
  }

  /** `id`, a rank-12 Elementalist's, lands on `foe`. */
  function land(foe: Combatant, id: string): void {
    const elementalist = makeCombatant({ id: "e", attributeRanks: ranked(12) });
    applyEffects(skill(id).effects, {
      caster: elementalist,
      target: foe,
      rng: steady(),
      rules: RULES.combat,
      surroundings: placed([elementalist, vec2(0, 0)], [foe, vec2(300, 0)]),
      usedSkill: undefined,
    });
  }

  it.each([
    [12, 1.85],
    [0, 1.25],
  ])("at rank %i, the next Water Magic hex lasts ×%d, once", (rank, times) => {
    const foe = chilledFoe(rank);
    land(foe, "elementalist.ice-spikes");
    expect(foe.statuses.get("ice-spikes")?.remainingSeconds).toBeCloseTo(5 * times, 6);
    foe.statuses.remove("ice-spikes");
    land(foe, "elementalist.ice-spikes");
    expect(foe.statuses.get("ice-spikes")?.remainingSeconds).toBe(5);
    expect(foe.statuses.has("chilling-winds")).toBe(true);
  });

  it("an Air Magic hex neither lasts longer nor spends it", () => {
    const foe = chilledFoe(12);
    land(foe, "elementalist.lightning-surge");
    land(foe, "elementalist.ice-spikes");
    expect(foe.statuses.get("ice-spikes")?.remainingSeconds).toBeCloseTo(5 * 1.85, 6);
  });

  it("says what it lengthens", () => {
    expect(describeStatus("chilling-winds", ranked(12))).toContain(
      "the next Water Magic hex on the bearer lasts 85% longer",
    );
  });
});
