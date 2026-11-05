import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_EARSHOT, RANGE_COMPASS } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MatchSimulation } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { beginRecharge } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects } from "./effects.js";
import { aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { criticalChance, weaponSnapshotOf } from "./weapon-attack.js";

/**
 * Warrior shouts that count (#2320): "I Will Avenge You!", "Fear Me!",
 * "None Shall Pass!", "On Your Knees!" and Burst of Aggression, on the
 * dead-ally and knocked-down counts, a recharge shorter by seconds, a
 * stance recharge, an adrenaline loss and a crit against a still foe.
 * Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["warrior.strength", rank],
    ["warrior.swordsmanship", rank],
    ["warrior.tactics", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);
const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};
const BOW: ResolvedEquipment = {
  ...SWORD,
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
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

function warrior(ranks = RANK_12, equipment = SWORD): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 30,
    maxEnergy: 50,
    health: 500,
    maxHealth: 500,
    equipment,
    attributeRanks: ranks,
  });
}

const foe = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 20, maxEnergy: 30, health: 1e6, maxHealth: 1e6 });
const ally = (id: string): Combatant => makeCombatant({ id, team: 0, health: 500, maxHealth: 500 });
const dead = (combatant: Combatant): Combatant => {
  combatant.dead = true;
  combatant.health = 0;
  return combatant;
};

/** The caster at the origin, each other where given. */
function around(caster: Combatant, others: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    [[caster, vec2(0, 0)] as const, ...others].map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

function cast(skillId: string, caster: Combatant, surroundings: Surroundings) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [caster],
    rng: steady(),
    rules: RULES,
    surroundings,
  });
}

describe("the five, as the corpus has them (#2320)", () => {
  it.each([
    ["warrior.i-will-avenge-you", 333, "shout", { kind: "energy", amount: 5 }, 45],
    ["warrior.fear-me", 366, "shout", { kind: "adrenaline", amount: 4 }, 4],
    ["warrior.none-shall-pass", 891, "shout", { kind: "energy", amount: 5 }, 45],
    ["warrior.on-your-knees", 906, "shout", { kind: "adrenaline", amount: 6 }, 0],
    ["warrior.burst-of-aggression", 1413, "stance", { kind: "energy", amount: 5 }, 12],
  ] as const)("%s", (id, gwId, type, cost, recharge) => {
    const found = skill(id);
    expect(found.gwId).toBe(gwId);
    expect(found.type).toBe(type);
    expect(found.cost).toEqual(cost);
    expect(found.activationSeconds).toBe(0);
    expect(found.rechargeSeconds).toBe(recharge);
    expect(found.elite).toBe(false);
  });
});

describe('"I Will Avenge You!" (#2320)', () => {
  it.each([
    [RANK_12, 6],
    [RANK_0, 3],
  ] as const)("gives 10 s for each dead ally in compass range", (ranks, pips) => {
    const w = warrior(ranks);
    cast(
      "warrior.i-will-avenge-you",
      w,
      around(w, [
        [dead(ally("a")), vec2(RANGE_COMPASS - 10, 0)],
        [dead(ally("b")), vec2(0, 300)],
        [dead(ally("far")), vec2(RANGE_COMPASS + 50, 0)],
        [ally("alive"), vec2(100, 0)],
        [dead(foe("f")), vec2(100, 0)],
      ]),
    );
    expect(w.statuses.get("i-will-avenge-you")?.durationSeconds).toBe(20);
    const modifiers = aggregateModifiers(w.statuses.active);
    expect(modifiers.healthPips).toBe(pips);
    expect(modifiers.attackDurationMultiplier).toBe(0.75);
  });

  it("gives nothing with no dead ally", () => {
    const w = warrior();
    const { events } = cast("warrior.i-will-avenge-you", w, around(w, [[ally("a"), vec2(10, 0)]]));
    expect(w.statuses.has("i-will-avenge-you")).toBe(false);
    expect(events).toEqual([]);
  });

  it("refreshes to the new count on a recast, not adding", () => {
    const w = warrior();
    const one = around(w, [[dead(ally("a")), vec2(10, 0)]]);
    cast("warrior.i-will-avenge-you", w, one);
    cast("warrior.i-will-avenge-you", w, one);
    expect(w.statuses.get("i-will-avenge-you")?.durationSeconds).toBe(10);
  });
});

describe('"Fear Me!" (#2320)', () => {
  it.each([
    [RANK_12, 5, 12, 0.25],
    [RANK_0, 2, 1, 0.05],
  ] as const)(
    "drains foes in earshot, and gives a crit chance against still foes",
    (ranks, energy, seconds, crit) => {
      const w = warrior(ranks);
      const near = foe("near");
      const far = foe("far");
      const friend = ally("a");
      friend.energy = 20;
      cast(
        "warrior.fear-me",
        w,
        around(w, [
          [near, vec2(AREA_EARSHOT - 10, 0)],
          [far, vec2(AREA_EARSHOT + 50, 0)],
          [friend, vec2(10, 0)],
        ]),
      );
      expect(near.energy).toBe(20 - energy);
      expect(far.energy).toBe(20);
      expect(friend.energy).toBe(20);
      expect(w.statuses.get("fear-me")?.durationSeconds).toBe(seconds);

      const snapshot = weaponSnapshotOf(w);
      const still = foe("still");
      const moving = foe("moving");
      moving.moving = true;
      expect(criticalChance(snapshot, RULES, still) - criticalChance(snapshot, RULES, moving)).toBe(
        crit,
      );
    },
  );

  it("never drains below 0 Energy", () => {
    const w = warrior();
    const poor = foe("p");
    poor.energy = 2;
    cast("warrior.fear-me", w, around(w, [[poor, vec2(10, 0)]]));
    expect(poor.energy).toBe(0);
  });

  it("gives a bow nothing, still foe or not", () => {
    const w = warrior(RANK_12, BOW);
    cast("warrior.fear-me", w, around(w, []));
    const snapshot = weaponSnapshotOf(w);
    const without = weaponSnapshotOf(warrior(RANK_12, BOW));
    expect(criticalChance(snapshot, RULES, foe("still"))).toBe(
      criticalChance(without, RULES, foe("still")),
    );
  });
});

describe('"None Shall Pass!" (#2320)', () => {
  const moving = (id: string): Combatant => {
    const it = foe(id);
    it.moving = true;
    return it;
  };

  it.each([
    [RANK_12, 2, 14],
    [RANK_0, 2, 2],
    [RANK_12, 4, 25],
  ] as const)(
    "knocks down moving foes in earshot, its recharge shorter for each",
    (ranks, count, shorter) => {
      const w = warrior(ranks);
      const movers = Array.from({ length: count }, (_, i) => moving(`m${String(i)}`));
      const still = foe("still");
      const down = moving("down");
      down.knockdownRemaining = 1;
      const far = moving("far");
      const outcome = cast(
        "warrior.none-shall-pass",
        w,
        around(w, [
          ...movers.map((each, i) => [each, vec2(10 * (i + 1), 0)] as const),
          [still, vec2(20, 0)],
          [down, vec2(30, 0)],
          [far, vec2(AREA_EARSHOT + 50, 0)],
        ]),
      );
      for (const each of movers) {
        expect(each.knockdownRemaining).toBeGreaterThan(0);
      }
      expect(still.knockdownRemaining).toBe(0);
      expect(far.knockdownRemaining).toBe(0);
      expect(outcome.rechargeShorterSeconds).toBe(shorter);
    },
  );

  it("shortens nothing when it knocks nobody down", () => {
    const w = warrior();
    expect(cast("warrior.none-shall-pass", w, around(w, [])).rechargeShorterSeconds).toBe(0);
  });
});

describe('"On Your Knees!" (#2320)', () => {
  it("recharges every stance when an adjacent foe is knocked down", () => {
    const w = warrior();
    beginRecharge(w.cast, skill("warrior.burst-of-aggression"), 12);
    beginRecharge(w.cast, skill("warrior.fear-me"), 4);
    const down = foe("d");
    down.knockdownRemaining = 1;
    cast("warrior.on-your-knees", w, around(w, [[down, vec2(AREA_ADJACENT - 10, 0)]]));
    expect(w.cast.rechargeRemaining.get("warrior.burst-of-aggression") ?? 0).toBe(0);
    expect(w.cast.rechargeRemaining.get("warrior.fear-me")).toBe(4);
  });

  it("recharges nothing with no adjacent foe down", () => {
    const w = warrior();
    beginRecharge(w.cast, skill("warrior.burst-of-aggression"), 12);
    const down = foe("d");
    down.knockdownRemaining = 1;
    cast(
      "warrior.on-your-knees",
      w,
      around(w, [
        [foe("up"), vec2(10, 0)],
        [down, vec2(AREA_ADJACENT + 50, 0)],
      ]),
    );
    expect(w.cast.rechargeRemaining.get("warrior.burst-of-aggression")).toBe(12);
  });
});

describe("in a match (#2320)", () => {
  const BAR = [
    "warrior.burst-of-aggression",
    "warrior.on-your-knees",
    "warrior.none-shall-pass",
    "warrior.steady-stance",
  ];

  function match(ranks: ReadonlyMap<string, number>, foeAt = vec2(2000, 0)): MatchSimulation {
    return new MatchSimulation({
      seed: "mech-warrior-shouts-counts",
      participants: [
        {
          id: "w",
          team: 0,
          skillBar: [...BAR],
          attributeRanks: ranks,
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 50,
          spawn: vec2(0, 0),
          facing: 0,
        },
        {
          id: "f",
          team: 1,
          skillBar: [],
          attributeRanks: new Map(),
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 50,
          spawn: foeAt,
          facing: 0,
        },
      ],
    });
  }

  function get(sim: MatchSimulation, id = "w"): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  function use(sim: MatchSimulation, slot: number): void {
    const id = BAR[slot] ?? "";
    const cost = skill(id).cost;
    if (cost?.kind === "adrenaline") {
      get(sim).adrenaline.set(id, cost.amount * ADRENALINE_PER_STRIKE);
    }
    expect(sim.requestSkill("w", slot)?.check).toEqual({ ok: true });
    sim.step(DT);
  }

  const run = (sim: MatchSimulation, seconds: number): void => {
    for (let i = 0; i < seconds / DT; i += 1) {
      sim.step(DT);
    }
  };

  it.each([
    [RANK_12, 8],
    [RANK_0, 2],
  ] as const)(
    "Burst of Aggression lasts its seconds, and takes all adrenaline as it ends",
    (ranks, seconds) => {
      const sim = match(ranks);
      use(sim, 0);
      const w = get(sim);
      expect(w.statuses.get("burst-of-aggression")?.durationSeconds).toBe(seconds);
      expect(aggregateModifiers(w.statuses.active).attackDurationMultiplier).toBe(0.67);
      w.adrenaline.set("warrior.on-your-knees", 3 * ADRENALINE_PER_STRIKE);
      run(sim, seconds + 1);
      expect(w.statuses.has("burst-of-aggression")).toBe(false);
      expect(w.adrenaline.get("warrior.on-your-knees")).toBe(0);
    },
  );

  it("Burst of Aggression takes the adrenaline when another stance replaces it", () => {
    const sim = match(RANK_12);
    use(sim, 0);
    const w = get(sim);
    w.adrenaline.set("warrior.on-your-knees", 3 * ADRENALINE_PER_STRIKE);
    use(sim, 3);
    expect(w.statuses.has("burst-of-aggression")).toBe(false);
    sim.step(DT);
    expect(w.adrenaline.get("warrior.on-your-knees")).toBe(0);
  });

  it('"On Your Knees!" loses all adrenaline, its own included, with nothing to recharge', () => {
    const sim = match(RANK_12);
    const w = get(sim);
    use(sim, 1);
    w.adrenaline.set("warrior.on-your-knees", 6 * ADRENALINE_PER_STRIKE);
    w.adrenaline.set("warrior.none-shall-pass", 0);
    expect(sim.requestSkill("w", 1)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(w.adrenaline.get("warrior.on-your-knees")).toBe(0);
  });

  it('"None Shall Pass!" recharges 45 s less what it knocked down', () => {
    const sim = match(RANK_12, vec2(100, 0));
    const f = get(sim, "f");
    f.moving = true;
    use(sim, 2);
    expect(f.knockdownRemaining).toBeGreaterThan(0);
    const left = get(sim).cast.rechargeRemaining.get("warrior.none-shall-pass") ?? 0;
    expect(left).toBeCloseTo(45 - 7, 5);
  });
});

describe("tooltips (#2320)", () => {
  const text = (id: string): string =>
    describeSkill(skill(id), RANK_12)
      .effects.map(({ text }) => text)
      .join(" | ");

  it("say what each counts", () => {
    expect(text("warrior.i-will-avenge-you")).toContain("dead ally");
    expect(text("warrior.none-shall-pass")).toContain(
      "This skill recharges 7 seconds faster for each foe knocked down (maximum 25)",
    );
    expect(text("warrior.on-your-knees")).toContain("Lose all adrenaline");
    expect(text("warrior.on-your-knees")).toContain(
      "If any adjacent foe is knocked down: recharges all your stances",
    );
  });
});
