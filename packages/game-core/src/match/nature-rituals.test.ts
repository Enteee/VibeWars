import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { energyCostOf } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, damageTypeTaken, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth, moveSpeedMultiplier } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { landBlow, PLAIN_BLOW, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Nature rituals 1 (#1745): seven spirits, as Winnowing's, whose auras
 * reach non-spirits of both teams, and the four status primitives they
 * need: a dearer base cost, a barred resurrection, cancelled speed
 * boosts and elemental damage taken as cold.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** The dead stay down long enough for every test here. */
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};
const RES_SIGNET = "common.resurrection-signet";

/** Each ritual, its aura, and how long its spirit lives at rank 12. */
const RITUALS: readonly (readonly [string, StatusId, number])[] = [
  ["ranger.fertile-season", "fertile-season", 75],
  ["ranger.quickening-zephyr", "quickening-zephyr", 75],
  ["ranger.frozen-soil", "frozen-soil", 150],
  ["ranger.muddy-terrain", "muddy-terrain", 150],
  ["ranger.conflagration", "conflagration", 198],
  ["ranger.predatory-season", "predatory-season", 198],
  ["ranger.winter", "winter", 198],
];

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

const BOW: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [...RITUALS.map(([skillId]) => skillId), RES_SIGNET],
    attributeRanks: new Map([
      ["ranger.beast-mastery", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 480,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** `r` on team 0 at the origin with `a` beside it, `f` on team 1 in range. */
function match(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "nature-rituals",
    matchRules: MATCH,
    participants: [
      spec("r", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 200)),
      spec("f", 1, vec2(300, 0)),
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

function spirits(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter((p) => p.creature?.kind === "spirit");
}

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

/** `by` casts `skillId` from its bar, then steps until it has gone off. */
function ritual(sim: MatchSimulation, skillId: string, by = "r"): CombatEvent[] {
  const slot = get(sim, by).skillBar.indexOf(skillId);
  expect(sim.requestSkill(by, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, skillOf(skillId).activationSeconds + 0.5);
}

/** Kill `id` as burning would, so it lies there to be resurrected. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "f", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** A stream that always rolls `roll` and never crits. */
const steady = (roll = 10): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => 0.95 });

/** What a plain blow of `attacker` takes off `victim`. */
function struck(attacker: Combatant, victim: Combatant): number {
  const before = victim.health;
  landBlow(
    weaponSnapshotOf(attacker),
    attacker,
    victim,
    PLAIN_BLOW,
    false,
    steady(),
    RULES.combat,
    [],
  );
  return before - victim.health;
}

/** A victim whose armor against `type` is 160 higher than against anything else. */
function armoredAgainst(type: "cold" | "fire", id = "victim"): Combatant {
  return makeCombatant({
    id,
    team: 1,
    maxHealth: 1000,
    health: 1000,
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      conditionalArmor: [{ amount: 160, conditions: [{ kind: "vs-type", type }] }],
    },
  });
}

describe("energyCostMultiplier (#1745)", () => {
  it("raises the base cost by 30%, rounded half up: 5 is 7, 10 is 13, 25 is 33", () => {
    const zephyred = makeCombatant({ id: "z" });
    zephyred.statuses.project("quickening-zephyr", "r/c1", NO_RANKS);
    const plain = makeCombatant({ id: "p" });
    const cost = (id: string, who: Combatant) => energyCostOf(skillOf(id), who);
    expect(cost("ranger.winnowing", plain)).toBe(5);
    expect(cost("ranger.winnowing", zephyred)).toBe(7);
    expect(cost("ranger.frozen-soil", zephyred)).toBe(13);
    expect(cost("ranger.quickening-zephyr", zephyred)).toBe(33);
  });

  it("leaves a skill with no Energy cost at 0, an adrenal one included", () => {
    const zephyred = makeCombatant({ id: "z" });
    zephyred.statuses.project("quickening-zephyr", "r/c1", NO_RANKS);
    expect(energyCostOf(skillOf(RES_SIGNET), zephyred)).toBe(0);
    const adrenal = skillOf("warrior.sever-artery");
    expect(adrenal.cost?.kind).toBe("adrenaline");
    expect(energyCostOf(adrenal, zephyred)).toBe(0);
  });
});

describe("preventsResurrection (#1745)", () => {
  it("refuses a resurrection under Frozen Soil before anything is paid", () => {
    const sim = match();
    ritual(sim, "ranger.frozen-soil");
    kill(sim, "a");
    sim.setTarget("r", "a");
    const caster = get(sim, "r").combatant;
    const energy = caster.energy;
    expect(sim.requestSkill("r", 7)?.check).toEqual({ ok: false, reason: "cannot-resurrect" });
    expect(caster.energy).toBe(energy);
    expect(caster.cast.activeCast).toBeUndefined();
  });

  it("lets a resurrection already being cast go off when Frozen Soil comes", () => {
    const sim = match();
    kill(sim, "a");
    sim.setTarget("r", "a");
    expect(sim.requestSkill("r", 7)?.check).toEqual({ ok: true });
    stepFor(sim, 1);
    get(sim, "r").combatant.statuses.project("frozen-soil", "f/c1", NO_RANKS);
    const events = stepFor(sim, 2 + DT);
    expect(events).toContainEqual(expect.objectContaining({ kind: "resurrected", targetId: "a" }));
  });
});

describe("preventsSpeedBoosts (#1745)", () => {
  it("cancels a running stance's boost but keeps a slow", () => {
    const muddy = makeCombatant({ id: "m" });
    muddy.statuses.project("muddy-terrain", "r/c1", NO_RANKS);
    expect(moveSpeedMultiplier(muddy)).toBeCloseTo(0.9, 10);
    muddy.statuses.apply("natural-stride", 8, "m", NO_RANKS);
    expect(moveSpeedMultiplier(muddy)).toBeCloseTo(0.9, 10);
    muddy.statuses.apply("crippled", 8, "f", NO_RANKS);
    const crippled = aggregateModifiers([{ id: "crippled", ranks: NO_RANKS }]).moveSpeedMultiplier;
    expect(moveSpeedMultiplier(muddy)).toBeCloseTo(0.9 * crippled, 10);
  });
});

describe("elementalDamageTakenAs (#1745)", () => {
  it("turns elemental types into cold and leaves physical and the rest", () => {
    const winter = [{ id: "winter" as const }];
    expect(damageTypeTaken("fire", winter)).toBe("cold");
    expect(damageTypeTaken("lightning", winter)).toBe("cold");
    expect(damageTypeTaken("earth", winter)).toBe("cold");
    expect(damageTypeTaken("piercing", winter)).toBe("piercing");
    expect(damageTypeTaken("holy", winter)).toBe("holy");
    expect(damageTypeTaken("fire", [])).toBe("fire");
  });

  it("makes Conflagration's fire arrows cold on a bearer of Winter", () => {
    const ranger = makeCombatant({ id: "ranger", equipment: BOW });
    const plain = struck(ranger, armoredAgainst("cold"));
    ranger.statuses.project("conflagration", "r/c1", NO_RANKS);
    // Fire now, so armor against cold does nothing.
    expect(struck(ranger, armoredAgainst("cold"))).toBe(plain);
    expect(struck(ranger, armoredAgainst("fire"))).toBeLessThan(plain);
    // Under Winter the fire is cold: armor against cold counts again.
    const wintered = armoredAgainst("cold");
    wintered.statuses.project("winter", "r/c2", NO_RANKS);
    expect(struck(ranger, wintered)).toBeLessThan(plain);
    const fireArmored = armoredAgainst("fire");
    fireArmored.statuses.project("winter", "r/c2", NO_RANKS);
    expect(struck(ranger, fireArmored)).toBe(plain);
  });

  it("turns a spell's fire cold too", () => {
    /** What 50 fire damage takes off `victim`. */
    const burnt = (victim: Combatant): number => {
      applyEffect(
        { kind: "damage", type: "fire", armorPenetration: 0, amount: { flat: 50 } },
        {
          caster: makeCombatant({ id: "caster" }),
          target: victim,
          rng: createRng(1),
          rules: RULES.combat,
          surroundings: new Map(),
        },
      );
      return 1000 - victim.health;
    };
    expect(burnt(armoredAgainst("cold"))).toBe(50);
    const wintered = armoredAgainst("cold");
    wintered.statuses.project("winter", "r/c1", NO_RANKS);
    expect(burnt(wintered)).toBeLessThan(50);
    const fireArmored = armoredAgainst("fire");
    fireArmored.statuses.project("winter", "r/c1", NO_RANKS);
    expect(burnt(fireArmored)).toBe(50);
  });
});

describe("nature rituals 1 (#1745)", () => {
  it.each(RITUALS)(
    "%s plants a 210 Health spirit whose aura both teams wear and spirits do not",
    (skillId, statusId, lives) => {
      const sim = match();
      ritual(sim, skillId);
      const [spirit, ...others] = spirits(sim);
      expect(others).toEqual([]);
      expect(spirit?.combatant.maxHealth).toBe(210);
      expect(spirit?.creature?.expiresInSeconds).toBeCloseTo(lives - 0.5 - DT, 5);
      expect(["r", "a", "f"].map((id) => get(sim, id).combatant.statuses.has(statusId))).toEqual([
        true,
        true,
        true,
      ]);
      expect(spirit?.combatant.statuses.has(statusId)).toBe(false);
    },
  );

  it("Fertile Season: +130 maximum Health and +8 armor", () => {
    const sim = match();
    const f = get(sim, "f").combatant;
    const before = effectiveMaxHealth(f);
    ritual(sim, "ranger.fertile-season");
    expect(effectiveMaxHealth(f)).toBe(before + 130);
    expect(aggregateModifiers(f.statuses.active).armorModifier).toBe(8);
  });

  it("Quickening Zephyr: a 5 Energy ritual costs 7 and recharges in half the time", () => {
    const sim = match();
    ritual(sim, "ranger.quickening-zephyr");
    const r = get(sim, "r").combatant;
    expect(energyCostOf(skillOf("ranger.muddy-terrain"), r)).toBe(7);
    const energy = r.energy;
    expect(sim.requestSkill("r", 3)?.check).toEqual({ ok: true });
    // Paid as the cast starts, after the aftercast of the one before.
    stepFor(sim, 1);
    expect(r.energy).toBeCloseTo(energy - 7, 0);
    stepFor(sim, 2);
    // 30 s halved, started as the cast ended, under a second ago.
    const recharge = r.cast.rechargeRemaining.get("ranger.muddy-terrain") ?? 0;
    expect(recharge).toBeGreaterThan(14);
    expect(recharge).toBeLessThanOrEqual(15);
  });

  it("Muddy Terrain: 10% slower", () => {
    const sim = match();
    ritual(sim, "ranger.muddy-terrain");
    expect(moveSpeedMultiplier(get(sim, "f").combatant)).toBeCloseTo(0.9, 10);
  });

  it("Conflagration: a bow's blows deal fire, an axe's stay slashing", () => {
    const ranger = makeCombatant({ id: "ranger", equipment: BOW });
    const warrior = makeCombatant({ id: "warrior", equipment: AXE });
    ranger.statuses.project("conflagration", "r/c1", NO_RANKS);
    warrior.statuses.project("conflagration", "r/c1", NO_RANKS);
    expect(weaponSnapshotOf(ranger).damageType).toBe("fire");
    expect(weaponSnapshotOf(warrior).damageType).toBe("slashing");
  });

  it("Predatory Season: heals 20% weaker, and each hit heals its attacker 5 of that", () => {
    const sim = match(spec("w", 0, vec2(260, 0), { equipment: AXE, startHealthFraction: 0.5 }));
    ritual(sim, "ranger.predatory-season");
    const w = get(sim, "w").combatant;
    expect(aggregateModifiers(w.statuses.active).healingMultiplier).toBeCloseTo(0.8, 10);
    expect(sim.requestAttack("w", "f")).toEqual({ ok: true });
    const events = stepFor(sim, 4);
    const hits = events.filter((event) => event.kind === "damage" && event.targetId === "f");
    const heals = events.filter((event) => event.kind === "heal" && event.targetId === "w");
    expect(hits.length).toBeGreaterThan(0);
    expect(heals).toEqual(hits.map(() => ({ kind: "heal", targetId: "w", amount: 4 })));
  });

  it("describes each aura", () => {
    const line = (skillId: string) =>
      describeSkill(
        skillOf(skillId),
        new Map([
          ["ranger.beast-mastery", 12],
          ["ranger.wilderness-survival", 12],
        ]),
      ).effects.map(({ text }) => text)[1];
    expect(RITUALS.map(([skillId]) => line(skillId))).toEqual([
      "Non-spirit creatures in its range: +8 armor, +130 maximum health",
      "Non-spirit creatures in its range: skills recharge 50% faster, skills cost 30% more Energy",
      "Non-spirit creatures in its range: cannot use resurrection skills",
      "Non-spirit creatures in its range: moves at 90% speed, speed boosts have no effect",
      "Non-spirit creatures in its range: bow attacks deal fire damage",
      "Non-spirit creatures in its range: −20% healing, your physical attacks: You gain 5 health",
      "Non-spirit creatures in its range: elemental damage taken is cold damage",
    ]);
  });
});
