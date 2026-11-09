import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import { effectiveActivationSeconds } from "./tick.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Mechanics (#2459): Twin Moon Sweep's release takes a Dervish
 * enchantment and heals before its blows, which it gated; Signet of Rage
 * counts the adrenal skills on its target's bar; Stolen Speed hastens its
 * own caster's spells at its bearers; Savannah Heat's pulses grow by the
 * second. Numbers are the corpus's, at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SCYTHE_MASTERY = "dervish.scythe-mastery";
const SMITING = "monk.smiting-prayers";
const FAST = "mesmer.fast-casting";
const FIRE = "elementalist.fire-magic";
const SWEEP = "dervish.twin-moon-sweep";
const RAGE = "monk.signet-of-rage";
const STOLEN = "mesmer.stolen-speed";
const SAVANNAH = "elementalist.savannah-heat";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A stream that rolls `roll` and floats `float`: 0.95 never blocks, 0.1 does at Guardian's 50%. */
const steady = (roll = 10, float = 0.95): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: SCYTHE_MASTERY,
    damageType: weaponDamageType(WEAPONS.scythe, SCYTHE_MASTERY),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e4,
    maxEnergy: 100,
    startHealthFraction: 1,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Each damage `skillId` dealt `targetId` in `log`, in order. */
function hits(log: readonly CombatLogEntry[], skillId: string, targetId: string): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) =>
      event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
    );
}

describe("#2459's data", () => {
  it.each([
    [SWEEP, 1487, "attack", false, SCYTHE_MASTERY, { kind: "adrenaline", amount: 7 }, 0, 0],
    [RAGE, 1269, "signet", false, SMITING, undefined, 1, 20],
    [STOLEN, 880, "hex", true, FAST, { kind: "energy", amount: 5 }, 1, 12],
    [SAVANNAH, 1380, "spell", true, FIRE, { kind: "energy", amount: 15 }, 2, 25],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s",
    (id, gwId, type, elite, attributeId, cost, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: id === SWEEP ? RANGE_MELEE : RANGE_SPELL,
        target: "single-enemy",
      });
      expect(skill(id).cost).toEqual(cost);
    },
  );
});

/** A Dervish at `rank` Scythe Mastery, hurt, so its heals show. */
function dervish(rank: number): Combatant {
  return makeCombatant({
    id: "dervish",
    attributeRanks: new Map([[SCYTHE_MASTERY, rank]]),
    equipment: SCYTHE,
    maxHealth: 1000,
    health: 100,
  });
}

/** Twin Moon Sweep from `self` on a foe a step away, and what it did. */
function sweep(
  self: Combatant,
  rng = steady(),
  target = makeCombatant({ id: "foe", team: 1, maxHealth: 1000, health: 1000 }),
): CombatEvent[] {
  const at = (combatant: Combatant, position: Vec2) =>
    [
      combatant.id,
      { combatant, position, floors: 1, layer: 0, creature: undefined, corpseExploited: false },
    ] as const;
  const surroundings: Surroundings = new Map([at(self, vec2(0, 0)), at(target, vec2(30, 0))]);
  return resolveAttackSkill(
    {
      surroundings,
      skill: skill(SWEEP),
      caster: self,
      targets: [target],
      rng,
      rules: RULES.combat,
    },
    () => false,
    [],
  );
}

const healsOf = (events: readonly CombatEvent[]): number[] =>
  events.flatMap((event) =>
    event.kind === "heal" && event.targetId === "dervish" ? [event.amount] : [],
  );
const blowsOf = (events: readonly CombatEvent[]): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === "foe" ? [event.amount] : [],
  );

describe("Twin Moon Sweep (#2459)", () => {
  it.each([
    [0, [10]],
    [12, [18]],
  ] as const)("at rank %i with no Dervish enchantment heals %j and strikes once", (rank, heals) => {
    const events = sweep(dervish(rank));
    expect(healsOf(events)).toEqual(heals);
    expect(blowsOf(events)).toHaveLength(1);
  });

  it.each([
    [0, [10, 10]],
    [12, [18, 26]],
  ] as const)("at rank %i taking one heals %j and strikes twice", (rank, heals) => {
    const self = dervish(rank);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const events = sweep(self);
    expect(healsOf(events)).toEqual(heals);
    expect(self.statuses.has("sand-shards")).toBe(false);
    expect(blowsOf(events)).toHaveLength(2);
  });

  it("strikes each of its two blows for 25% less than its one", () => {
    const [single = 0] = blowsOf(sweep(dervish(12)));
    const self = dervish(12);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const twice = blowsOf(sweep(self));
    expect(single).toBeGreaterThan(0);
    for (const blow of twice) {
      expect(blow).toBeCloseTo(single * 0.75, -0.5);
    }
  });

  it("cannot be blocked only if it took an enchantment, read before the release took it", () => {
    const guarded = (): Combatant => {
      const foe = makeCombatant({ id: "foe", team: 1, maxHealth: 1000, health: 1000 });
      foe.statuses.apply("guardian", 30, "monk", NO_RANKS);
      return foe;
    };
    const bare = sweep(dervish(12), steady(10, 0.1), guarded());
    expect(bare.filter(({ kind }) => kind === "attack-blocked")).toHaveLength(1);
    const self = dervish(12);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const taken = sweep(self, steady(10, 0.1), guarded());
    expect(taken.filter(({ kind }) => kind === "attack-blocked")).toHaveLength(0);
    expect(blowsOf(taken)).toHaveLength(2);
  });

  it("heals on its release, hit or miss", () => {
    const self = dervish(12);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    self.statuses.apply("blind", 30, "foe", NO_RANKS);
    const events = sweep(self, steady(10, 0.1));
    expect(blowsOf(events)).toEqual([]);
    expect(healsOf(events)).toEqual([18, 26]);
  });

  it("never takes another profession's enchantment, and takes one of two", () => {
    const guarded = dervish(12);
    guarded.statuses.apply("guardian", 30, "monk", NO_RANKS);
    expect(healsOf(sweep(guarded))).toEqual([18]);
    expect(guarded.statuses.has("guardian")).toBe(true);
    const both = dervish(12);
    both.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    both.statuses.apply("staggering-force", 30, "dervish", NO_RANKS);
    sweep(both);
    expect(
      ["sand-shards", "staggering-force"].filter((id) => both.statuses.has(id as "sand-shards")),
    ).toHaveLength(1);
  });

  it("says its release on its card", () => {
    expect(
      describeSkill(skill(SWEEP), new Map([[SCYTHE_MASTERY, 12]]), EN_WORDS, EN_NAMES).effects.map(
        ({ text }) => text,
      ),
    ).toEqual([
      "As it is used: you gain 18 health",
      "As it is used: lose 1 Dervish enchantment",
      "As it is used: if an enchantment was removed: you gain 26 health",
      "If you have a Dervish enchantment: cannot be blocked",
      "Strikes twice, each dealing 25% less damage; if you have no dervish enchantment, only 1",
    ]);
  });
});

describe("Signet of Rage (#2459)", () => {
  it.each([
    [0, [], 5],
    [12, [], 41],
    [0, ["warrior.backbreaker", "warrior.sever-artery", "elementalist.fireball"], 15],
    [12, ["warrior.backbreaker", "warrior.sever-artery", "elementalist.fireball"], 59],
  ] as const)("at rank %i on a foe with %j deals %i", (rank, bar, damage) => {
    const sim = new MatchSimulation({
      seed: "rage",
      participants: [
        spec("c", 0, vec2(0, 0), [RAGE], new Map([[SMITING, rank]])),
        spec("foe", 1, vec2(200, 0), bar, new Map()),
      ],
    });
    sim.setTarget("c", "foe");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(hits(stepFor(sim, 1.5), RAGE, "foe")).toEqual([damage]);
  });
});

describe("Stolen Speed (#2459)", () => {
  const FIREBALL = skill("elementalist.fireball");
  const mesmer = makeCombatant({ id: "mesmer" });
  const ally = makeCombatant({ id: "ally" });
  const hexed = (by: string, statusId: "stolen-speed" | "arcane-conundrum"): Combatant => {
    const foe = makeCombatant({ id: "foe", team: 1 });
    foe.statuses.apply(statusId, 8, by, NO_RANKS);
    return foe;
  };
  const plain = effectiveActivationSeconds(FIREBALL, mesmer, makeCombatant({ id: "x", team: 1 }));

  it("halves its own caster's spells at the bearer", () => {
    expect(effectiveActivationSeconds(FIREBALL, mesmer, hexed("mesmer", "stolen-speed"))).toBe(
      plain / 2,
    );
  });

  it("leaves an ally's spells, and Arcane Conundrum's caster's, as they were", () => {
    expect(effectiveActivationSeconds(FIREBALL, ally, hexed("mesmer", "stolen-speed"))).toBe(plain);
    expect(effectiveActivationSeconds(FIREBALL, mesmer, hexed("mesmer", "arcane-conundrum"))).toBe(
      plain,
    );
  });

  it("doubles the bearer's own spells", () => {
    const foe = hexed("mesmer", "stolen-speed");
    expect(effectiveActivationSeconds(FIREBALL, foe, mesmer)).toBe(plain * 2);
  });

  it.each([
    [0, 1],
    // 8.2, whole as every scaled number is.
    [12, 8],
  ] as const)("at rank %i lasts %d s on its target and an adjacent foe", (rank, seconds) => {
    const sim = new MatchSimulation({
      seed: "stolen",
      participants: [
        spec("c", 0, vec2(0, 0), [STOLEN], new Map([[FAST, rank]])),
        spec("foe", 1, vec2(200, 0), [], new Map()),
        spec("next", 1, vec2(210, 0), [], new Map()),
      ],
    });
    sim.setTarget("c", "foe");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    const bearer = get(sim, "foe").combatant;
    for (let i = 0; i < 100 && !bearer.statuses.has("stolen-speed"); i += 1) {
      sim.step(DT);
    }
    expect(bearer.statuses.get("stolen-speed")?.remainingSeconds).toBeCloseTo(seconds, 0);
    expect(get(sim, "next").combatant.statuses.get("stolen-speed")?.remainingSeconds).toBeCloseTo(
      seconds,
      0,
    );
  });
});

describe("Savannah Heat (#2459)", () => {
  it.each([
    [0, [5, 10, 15, 20, 25]],
    [12, [17, 34, 51, 68, 85]],
  ] as const)("at rank %i pulses %j, one a second", (rank, pulses) => {
    const sim = new MatchSimulation({
      seed: "savannah",
      participants: [
        spec("c", 0, vec2(0, 0), [SAVANNAH], new Map([[FIRE, rank]])),
        spec("foe", 1, vec2(300, 0), [], new Map()),
      ],
    });
    sim.setTarget("c", "foe");
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(hits(stepFor(sim, 9), SAVANNAH, "foe")).toEqual(pulses);
  });
});
