import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { stateHolds, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, StateCondition, Surroundings } from "./types.js";
import { landBlow, PLAIN_BLOW, resolveAttackSkill, weaponSnapshotOf } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * The Dervish earth bar (#1021): Eremite's Attack strikes every adjacent
 * foe while it has a Dervish enchantment to lose; Staggering Force and
 * Dust Cloak turn the Dervish's attacks to earth; all three enchantments
 * hurt the foes nearby when they end, however they end.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const NOWHERE = (): boolean => false;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.earth-prayers", 12],
]);
const DERVISH_ENCHANTMENT: StateCondition = {
  kind: "caster-has",
  category: "enchantment",
  profession: "dervish",
};

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
  ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: weaponDamageType(WEAPONS.scythe, "dervish.scythe-mastery"),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function dervish(): Combatant {
  return makeCombatant({ id: "dervish", attributeRanks: RANKS, equipment: SCYTHE });
}

function foe(id: string, equipment?: ResolvedEquipment): Combatant {
  return makeCombatant({
    id,
    team: 1,
    maxHealth: 1000,
    health: 1000,
    ...(equipment === undefined ? {} : { equipment }),
  });
}

/** A Warrior's armor (#759): 80, and +20 against physical damage. */
const WARRIOR_ARMOR: ResolvedEquipment = {
  ...unarmedResolvedEquipment(80),
  conditionalArmor: [{ amount: 20, conditions: [{ kind: "vs-physical" }] }],
};

/**
 * The dervish at the origin, its target a step away, four more foes
 * adjacent to the target, and `far`, out of reach of any cleave.
 */
function crowd(self: Combatant): {
  readonly target: Combatant;
  readonly surroundings: Surroundings;
} {
  const placed: [Combatant, Vec2][] = [
    [self, vec2(0, 0)],
    [foe("target"), vec2(30, 0)],
    [foe("near1"), vec2(30, 10)],
    [foe("near2"), vec2(30, -20)],
    [foe("near3"), vec2(60, 0)],
    [foe("near4"), vec2(30, 30)],
    [foe("far"), vec2(30 + AREA_ADJACENT + 1, 0)],
  ];
  const surroundings: Surroundings = new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
  return { target: placed[1]?.[0] ?? foe("missing"), surroundings };
}

function eremites(self: Combatant, rng = steady()): CombatEvent[] {
  const { target, surroundings } = crowd(self);
  return resolveAttackSkill(
    {
      surroundings,
      skill: skill("dervish.eremites-attack"),
      caster: self,
      targets: [target],
      rng,
      rules: RULES,
    },
    NOWHERE,
    [],
  );
}

/** Each foe struck, in order, and what it took. */
const damage = (events: readonly CombatEvent[]): [string, number][] =>
  events.flatMap((event) => (event.kind === "damage" ? [[event.targetId, event.amount]] : []));

describe("a Dervish enchantment, read on the caster (#1021)", () => {
  it("counts only that profession's: a Monk's Guardian is not one, Sand Shards is", () => {
    const self = dervish();
    const target = foe("target");
    self.statuses.apply("guardian", 10, "monk", NO_RANKS);
    expect(stateHolds(DERVISH_ENCHANTMENT, self, target, new Map())).toBe(false);
    expect(
      stateHolds({ kind: "caster-has", category: "enchantment" }, self, target, new Map()),
    ).toBe(true);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    expect(stateHolds(DERVISH_ENCHANTMENT, self, target, new Map())).toBe(true);
    expect(self.statuses.countByCategory("enchantment", "dervish")).toBe(1);
    expect(self.statuses.countByCategory("enchantment")).toBe(2);
  });
});

describe("Eremite's Attack (#1021)", () => {
  it("without a Dervish enchantment: +8, the scythe's 2 cleave victims, nothing removed", () => {
    const self = dervish();
    self.statuses.apply("guardian", 10, "monk", NO_RANKS);
    const plain = damage(eremites(self));
    expect(plain.map(([id]) => id)).toEqual(["target", "near1", "near2"]);
    expect(self.statuses.has("guardian")).toBe(true);

    const bare = dervish();
    expect(damage(eremites(bare))).toEqual(plain);
  });

  it("with Sand Shards: every adjacent foe, +8 more until Sand Shards' 4th hit spends it", () => {
    const [[, base] = ["", 0]] = damage(eremites(dervish()));
    const self = dervish();
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const hits = damage(eremites(self));
    expect(hits.map(([id]) => id).sort()).toEqual(["near1", "near2", "near3", "near4", "target"]);
    // Every foe wears the same armor. The victims were picked wide at the
    // hit; the bonus is read per blow, and the 5th comes after the 4th hit
    // ended Sand Shards, the only Dervish enchantment.
    expect(hits.map(([, amount]) => amount)).toEqual(
      [16, 16, 16, 16, 8].map((more) => base + more - 8),
    );
    expect(self.statuses.has("sand-shards")).toBe(false);
  });

  it("loses only the newest Dervish enchantment, once, however many it struck", () => {
    const self = dervish();
    self.statuses.apply("vow-of-strength", 15, "dervish", NO_RANKS);
    self.statuses.apply("staggering-force", 30, "dervish", NO_RANKS);
    const events = eremites(self);
    expect(damage(events)).toHaveLength(5);
    expect(
      events.filter((event) => event.kind === "status-removed" && event.targetId === "dervish"),
    ).toEqual([expect.objectContaining({ statusId: "staggering-force" })]);
    expect(self.statuses.has("vow-of-strength")).toBe(true);
  });

  it("blocked by every victim: nothing hit, nothing removed", () => {
    const self = dervish();
    self.statuses.apply("staggering-force", 30, "dervish", NO_RANKS);
    const { target, surroundings } = crowd(self);
    for (const { combatant } of surroundings.values()) {
      if (combatant.team === 1) {
        combatant.statuses.apply("guardian", 10, combatant.id, NO_RANKS);
      }
    }
    const events = resolveAttackSkill(
      {
        surroundings,
        skill: skill("dervish.eremites-attack"),
        caster: self,
        targets: [target],
        rng: steady(10, 0.1),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
    expect(damage(events)).toEqual([]);
    expect(self.statuses.has("staggering-force")).toBe(true);
  });

  it("says both halves on its card", () => {
    expect(
      describeSkill(skill("dervish.eremites-attack"), RANKS).effects.map(({ text }) => text),
    ).toEqual([
      "+8 damage",
      "If you have a Dervish enchantment: +8 damage",
      "Hits up to 2 adjacent foes too",
      "If you have a Dervish enchantment: hits every adjacent foe",
      "Lose 1 Dervish enchantment",
    ]);
  });
});

describe("earth attacks (#1021)", () => {
  it("Staggering Force turns the weapon's roll to earth; the blow's own type still wins", () => {
    const self = dervish();
    expect(weaponSnapshotOf(self).damageType).toBe("slashing");
    self.statuses.apply("staggering-force", 30, "dervish", NO_RANKS);
    expect(weaponSnapshotOf(self).damageType).toBe("earth");
    // A Warrior meets an earth blow with 80 armor, not 100.
    const struck = (victim: Combatant, blow = PLAIN_BLOW): number => {
      const events: CombatEvent[] = [];
      landBlow(weaponSnapshotOf(self), self, victim, blow, false, steady(), RULES, events);
      return damage(events)[0]?.[1] ?? 0;
    };
    const plain80 = struck(foe("plain", unarmedResolvedEquipment(80)));
    expect(struck(foe("warrior", WARRIOR_ARMOR))).toBe(plain80);
    // A blow that names its own physical type meets the Warrior's 100.
    expect(
      struck(foe("warrior", WARRIOR_ARMOR), { ...PLAIN_BLOW, damageType: "piercing" }),
    ).toBeLessThan(plain80);
    // Without it, the Warrior's +20 against physical counts.
    const bare = dervish();
    const events: CombatEvent[] = [];
    landBlow(
      weaponSnapshotOf(bare),
      bare,
      foe("warrior", WARRIOR_ARMOR),
      PLAIN_BLOW,
      false,
      steady(),
      RULES,
      events,
    );
    expect(damage(events)[0]?.[1]).toBeLessThan(plain80);
  });

  it("the tooltips say what the enchantments do", () => {
    expect(describeStatus("staggering-force")).toBe(
      "attacks deal earth damage. When it ends: nearby foes suffer Cracked Armor for 8s (−20 armor (not below 60))",
    );
    expect(describeStatus("dust-cloak")).toBe(
      "attacks deal earth damage. When it ends: nearby foes suffer Blind for 3s (90% of attacks miss)",
    );
    expect(describeStatus("aura-of-thorns")).toBe(
      "when it ends: nearby foes suffer Crippled for 7s (moves at 50% speed)",
    );
  });
});

describe("the earth enchantments in a match (#1021)", () => {
  const BAR = [
    "dervish.staggering-force",
    "dervish.dust-cloak",
    "dervish.aura-of-thorns",
    "dervish.wounding-strike",
    "dervish.eremites-attack",
  ];

  function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: team === 0 ? BAR : [],
      attributeRanks: RANKS,
      equipment: team === 0 ? SCYTHE : unarmedResolvedEquipment(RULES.armorReferenceLevel),
      maxHealth: 5000,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /** The dervish at the origin, `a` and `b` nearby, `away` out of nearby range. */
  function arena(): { readonly match: MatchSimulation; readonly self: Combatant } {
    const match = new MatchSimulation({
      seed: "earth",
      participants: [
        spec("d", 0, vec2(0, 0)),
        spec("a", 1, vec2(30, 0)),
        spec("b", 1, vec2(0, 50)),
        spec("away", 1, vec2(AREA_NEARBY + 20, 0)),
      ],
    });
    const self = match.get("d")?.combatant;
    if (self === undefined) {
      throw new Error("no dervish");
    }
    self.energy = 1000;
    return { match, self };
  }

  function foeOf(match: MatchSimulation, id: string): Combatant {
    const found = match.get(id)?.combatant;
    if (found === undefined) {
      throw new Error(`no ${id}`);
    }
    return found;
  }

  function steps(match: MatchSimulation, seconds: number): CombatEvent[] {
    const log: CombatEvent[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    return log;
  }

  it("Staggering Force strikes the foes nearby for 34 earth, not one further off", () => {
    const { match } = arena();
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log = steps(match, 0.5);
    expect(damage(log)).toEqual([
      ["a", 34],
      ["b", 34],
    ]);
  });

  it("stripped by Wounding Strike, Staggering Force cracks the armor of every foe nearby", () => {
    const { match, self } = arena();
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    steps(match, 0.5);
    expect(self.statuses.has("staggering-force")).toBe(true);
    match.setTarget("d", "a");
    expect(match.requestSkill("d", 3)?.check).toEqual({ ok: true });
    steps(match, 1.5);
    expect(self.statuses.has("staggering-force")).toBe(false);
    expect(foeOf(match, "a").statuses.get("cracked-armor")?.remainingSeconds).toBeGreaterThan(7);
    expect(foeOf(match, "b").statuses.has("cracked-armor")).toBe(true);
    expect(foeOf(match, "away").statuses.has("cracked-armor")).toBe(false);
  });

  it("Dust Cloak running out after 30 s blinds the foes nearby for 3 s", () => {
    const { match, self } = arena();
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
    steps(match, 29.5);
    expect(self.statuses.has("dust-cloak")).toBe(true);
    expect(foeOf(match, "a").statuses.has("blind")).toBe(false);
    steps(match, 1);
    expect(self.statuses.has("dust-cloak")).toBe(false);
    expect(foeOf(match, "a").statuses.has("blind")).toBe(true);
    expect(foeOf(match, "b").statuses.has("blind")).toBe(true);
    expect(foeOf(match, "away").statuses.has("blind")).toBe(false);
  });

  it("Aura of Thorns bleeds the foes nearby, and cripples them when its bearer dies", () => {
    const { match, self } = arena();
    expect(match.requestSkill("d", 2)?.check).toEqual({ ok: true });
    steps(match, 0.5);
    expect(foeOf(match, "a").statuses.get("bleeding")?.remainingSeconds).toBeGreaterThan(12);
    expect(foeOf(match, "b").statuses.has("bleeding")).toBe(true);
    expect(foeOf(match, "away").statuses.has("bleeding")).toBe(false);
    expect(foeOf(match, "a").statuses.has("crippled")).toBe(false);
    self.health = 1;
    expect(match.requestAttack("a", "d")).toEqual({ ok: true });
    steps(match, 3);
    expect(self.dead).toBe(true);
    expect(foeOf(match, "a").statuses.has("crippled")).toBe(true);
    expect(foeOf(match, "b").statuses.has("crippled")).toBe(true);
    expect(foeOf(match, "away").statuses.has("crippled")).toBe(false);
  });

  it("a recast of Aura of Thorns while it is up is no end: it cripples nobody", () => {
    const { match, self } = arena();
    expect(match.requestSkill("d", 2)?.check).toEqual({ ok: true });
    steps(match, 10.5);
    expect(match.requestSkill("d", 2)?.check).toEqual({ ok: true });
    steps(match, 0.5);
    expect(self.statuses.has("aura-of-thorns")).toBe(true);
    expect(foeOf(match, "a").statuses.has("crippled")).toBe(false);
    expect(foeOf(match, "b").statuses.has("crippled")).toBe(false);
  });

  it("Staggering Force up, then Eremite's Attack into a clump: all struck, armor cracked round it", () => {
    // Each body clear of the next (two radii, 28), each within 40 of `t`.
    const match = new MatchSimulation({
      seed: "clump",
      participants: [
        spec("d", 0, vec2(0, 0)),
        spec("t", 1, vec2(35, 0)),
        spec("c1", 1, vec2(35, 32)),
        spec("c2", 1, vec2(35, -32)),
        spec("c3", 1, vec2(68, 0)),
      ],
    });
    const self = foeOf(match, "d");
    self.energy = 1000;
    // Put on, not cast: its strike would set the clump moving.
    self.statuses.apply("staggering-force", 30, "d", NO_RANKS);
    match.setTarget("d", "t");
    expect(match.requestSkill("d", 4)?.check).toEqual({ ok: true });
    const log: CombatEvent[] = [];
    for (let i = 0; i < 60 && !foeOf(match, "c3").statuses.has("cracked-armor"); i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    expect(new Set(damage(log).map(([id]) => id))).toEqual(new Set(["t", "c1", "c2", "c3"]));
    expect(self.statuses.countByCategory("enchantment", "dervish")).toBe(0);
    for (const id of ["t", "c1", "c2", "c3"]) {
      expect(foeOf(match, id).statuses.has("cracked-armor"), id).toBe(true);
    }
  });
});
