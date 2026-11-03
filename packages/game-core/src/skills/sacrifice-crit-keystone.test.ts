import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_EARSHOT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import { STATUS_DEFINITIONS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { attackDamageDeltaOf, statusRanks } from "./tick.js";
import { fireChangeTriggers } from "./triggers.js";
import type { Combatant, SkillEffect, Surroundings } from "./types.js";
import { attackDurationSeconds, criticalChance, weaponSnapshotOf } from "./weapon-attack.js";

/**
 * The sacrifice trigger, weapon-gated crits, signet echoes and
 * self-charging pulses (#2275): Masochism, Way of the Assassin, Keystone
 * Signet, Agony and Grenth's Aura, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "necromancer.soul-reaping",
  "assassin.critical-strikes",
  "mesmer.fast-casting",
  "ritualist.channeling-magic",
  "dervish.wind-prayers",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** `bearer` wears `statusId` from itself, at its own ranks. */
function wearing(bearer: Combatant, statusId: StatusId): Combatant {
  bearer.statuses.apply(statusId, 20, bearer.id, statusRanks(statusId, bearer));
  return bearer;
}

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
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  return applyEffects(effects, {
    caster,
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings,
  });
}

/** Whatever `bearer`'s statuses recorded, fired as the simulation's drain does. */
function drain(bearer: Combatant): CombatEvent[] {
  return bearer.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(bearer, change, () => [], {
      sourceOf: (id) => (id === bearer.id ? bearer : undefined),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    }).flatMap(({ events }) => events),
  );
}

function skill(id: string) {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** `id` uses its skill in `slot` at `targetId`, stepped until it and its aftercast are done. */
function cast(sim: MatchSimulation, id: string, slot: number, targetId: string): void {
  sim.setTarget(id, targetId);
  const skillId = get(sim, id).combatant.skillBar[slot];
  expect(sim.requestSkill(id, slot)?.check.ok, String(skillId)).toBe(true);
  for (let tick = 0; tick < 200; tick += 1) {
    if (sim.step(DT).log.some((entry) => entry.sourceId === id && entry.skillId === skillId)) {
      stepFor(sim, 1);
      return;
    }
  }
  throw new Error(`${String(skillId)} never landed`);
}

describe("the five are the corpus's, on their base ids (#2275)", () => {
  it.each([
    ["necromancer.masochism", 2139, "enchantment", "necromancer.soul-reaping", 5, 1, 20, false],
    ["assassin.way-of-the-assassin", 1649, "stance", "assassin.critical-strikes", 5, 0, 12, true],
    ["ritualist.agony", 2205, "binding-ritual", "ritualist.channeling-magic", 10, 3, 30, false],
    ["dervish.grenths-aura", 2013, "enchantment", "dervish.wind-prayers", 10, 0, 10, false],
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
        range: RANGE_SPELL,
      });
    },
  );

  it("Keystone Signet is a free elite signet, 1 s, 15 s; Grenth's Aura a flash", () => {
    expect(skill("mesmer.keystone-signet")).toMatchObject({
      gwId: 63,
      type: "signet",
      attributeId: "mesmer.fast-casting",
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 15,
      elite: true,
    });
    expect(skill("dervish.grenths-aura").flash).toBe(true);
  });
});

describe("Masochism: bearer-sacrifices-health (#2275)", () => {
  it.each([
    [12, 3],
    [0, 1],
  ] as const)("at Soul Reaping %i gives %i Energy for each sacrifice", (rank, energy) => {
    const n = wearing(
      makeCombatant({ id: "n", energy: 0, attributeRanks: ranked(rank) }),
      "masochism",
    );
    apply([{ kind: "sacrifice-health", percentOfMax: 10 }], n, n);
    drain(n);
    expect(n.health).toBe(450);
    expect(n.energy).toBe(energy);
    apply([{ kind: "sacrifice-health", percentOfMax: 10 }], n, n);
    drain(n);
    expect(n.energy).toBe(2 * energy);
  });

  it("answers an Infuse Health's sacrifice too, once whatever its size", () => {
    const n = wearing(
      makeCombatant({ id: "n", energy: 0, attributeRanks: ranked(12) }),
      "masochism",
    );
    const ally = makeCombatant({ id: "a", health: 100 });
    apply([{ kind: "give-health", fractionOfCurrent: 0.5, healPercent: { flat: 100 } }], n, ally);
    drain(n);
    expect(n.health).toBe(250);
    expect(n.energy).toBe(3);
  });

  it("gives nothing for Health loss that is no sacrifice, nor for a sacrifice that kills", () => {
    const n = wearing(
      makeCombatant({ id: "n", energy: 0, attributeRanks: ranked(12) }),
      "masochism",
    );
    const foe = makeCombatant({ id: "f", team: 1 });
    apply([{ kind: "lose-health", recipient: "target", amount: { flat: 40 } }], foe, n);
    drain(n);
    expect(n.health).toBe(460);
    expect(n.energy).toBe(0);

    n.health = 30;
    apply([{ kind: "sacrifice-health", percentOfMax: 10 }], n, n);
    expect(n.dead).toBe(true);
    expect(drain(n)).toEqual([]);
    expect(n.energy).toBe(0);
  });
});

describe("Way of the Assassin: criticalChanceBonusWeapon (#2275)", () => {
  const DAGGERS = wielding(WEAPONS.daggers, "assassin.dagger-mastery");
  const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

  it.each([
    [12, 0.29, 0.83],
    [0, 0.05, 0.95],
  ] as const)(
    "at Critical Strikes %i adds %d to the crit chance and attacks at %d, with daggers only",
    (rank, bonus, multiplier) => {
      for (const [equipment, held] of [
        [DAGGERS, true],
        [SWORD, false],
      ] as const) {
        const bare = makeCombatant({ id: "a", equipment, attributeRanks: ranked(rank) });
        const before = criticalChance(weaponSnapshotOf(bare), RULES.combat);
        const sin = wearing(
          makeCombatant({ id: "a", equipment, attributeRanks: ranked(rank) }),
          "way-of-the-assassin",
        );
        expect(criticalChance(weaponSnapshotOf(sin), RULES.combat) - before).toBeCloseTo(
          held ? bonus : 0,
          9,
        );
        expect(attackDurationSeconds(sin, 1)).toBeCloseTo(held ? multiplier : 1, 9);
      }
    },
  );

  it("turns on and off as the weapon changes mid-stance", () => {
    const sin = wearing(
      makeCombatant({ id: "a", equipment: SWORD, attributeRanks: ranked(12) }),
      "way-of-the-assassin",
    );
    const onSword = criticalChance(weaponSnapshotOf(sin), RULES.combat);
    sin.equipment = DAGGERS;
    const onDaggers = criticalChance(weaponSnapshotOf(sin), RULES.combat);
    sin.equipment = SWORD;
    expect(onDaggers).toBeGreaterThan(onSword);
    expect(criticalChance(weaponSnapshotOf(sin), RULES.combat)).toBe(onSword);
  });
});

describe("Keystone Signet: recharge-others signet, NextSkill at skill-target (#2275)", () => {
  const MIDNIGHT = "mesmer.signet-of-midnight";
  const ILLUSIONS = "mesmer.signet-of-illusions";

  /**
   * Mesmer `m` with Keystone, a foe signet and a self signet; its target
   * `t` 200 away, foe `a` adjacent to `t`, foe `far` well beyond it.
   */
  function arena(rank: number): MatchSimulation {
    return new MatchSimulation({
      seed: "keystone-signet",
      participants: [
        spec("m", 0, vec2(0, 0), {
          skillBar: ["mesmer.keystone-signet", MIDNIGHT, ILLUSIONS],
          attributeRanks: ranked(rank),
        }),
        spec("t", 1, vec2(200, 0)),
        spec("a", 1, vec2(200, AREA_ADJACENT - 10)),
        spec("far", 1, vec2(200, -200)),
      ],
    });
  }

  const recharge = (sim: MatchSimulation, skillId: string) =>
    get(sim, "m").combatant.cast.rechargeRemaining.get(skillId) ?? 0;

  it("recharges every other signet, not itself", () => {
    const sim = arena(12);
    cast(sim, "m", 1, "t");
    expect(recharge(sim, MIDNIGHT)).toBeGreaterThan(0);
    cast(sim, "m", 0, "m");
    expect(recharge(sim, MIDNIGHT)).toBe(0);
    expect(recharge(sim, "mesmer.keystone-signet")).toBeGreaterThan(0);
  });

  it.each([
    [12, 5, 51],
    [0, 0, 0],
  ] as const)(
    "at Fast Casting %i answers %i foe signets, each %i to the foes beside the target",
    (rank, uses, damage) => {
      const sim = arena(rank);
      cast(sim, "m", 0, "m");
      const status = () => get(sim, "m").combatant.statuses.get("keystone-signet");
      expect(status()?.skillsLeft ?? 0).toBe(uses);

      cast(sim, "m", 2, "m");
      expect(status()?.skillsLeft ?? 0, "a signet at no foe uses none").toBe(uses);

      const health = (id: string) => get(sim, id).combatant.health;
      const [t, a, far] = [health("t"), health("a"), health("far")];
      cast(sim, "m", 1, "t");
      expect(a - health("a")).toBeCloseTo(damage, 0);
      expect(health("t"), "the target is not splashed").toBe(t);
      expect(health("far")).toBe(far);
      expect(status()?.skillsLeft ?? 0).toBe(Math.max(0, uses - 1));
    },
  );

  it("interrupts the foes beside the target", () => {
    const sim = arena(12);
    cast(sim, "m", 0, "m");
    const nextSkill = STATUS_DEFINITIONS["keystone-signet"].nextSkill;
    expect(nextSkill?.at).toBe("skill-target");
    expect(JSON.stringify(nextSkill?.effects)).toContain('"interrupt"');
  });
});

describe("Agony: chargesSourcePerHit on a projected pulse (#2275)", () => {
  /** Ritualist `r` at the origin; foes `f` and `g` in earshot, `out` beyond it. */
  function ritual(rank: number): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "agony",
      participants: [
        spec("r", 0, vec2(0, 0), { skillBar: ["ritualist.agony"], attributeRanks: ranked(rank) }),
        spec("f", 1, vec2(150, 0)),
        spec("g", 1, vec2(-150, 0)),
        spec("out", 1, vec2(0, AREA_EARSHOT + 300)),
      ],
    });
    cast(sim, "r", 0, "r");
    return sim;
  }

  function spirit(sim: MatchSimulation): Participant {
    const found = [...sim.participants()].find((p) => p.creature?.kind === "spirit");
    if (found === undefined) {
      throw new Error("no spirit");
    }
    return found;
  }

  const health = (sim: MatchSimulation, id: string) => get(sim, id).combatant.health;

  it.each([
    [12, 9],
    [0, 3],
  ] as const)(
    "at Channeling Magic %i each foe in earshot loses %i a second, and the spirit as much for each",
    (rank, loss) => {
      const sim = ritual(rank);
      const spiritId = spirit(sim).id;
      const before = { f: health(sim, "f"), g: health(sim, "g"), s: health(sim, spiritId) };
      stepFor(sim, 2);
      expect(before.f - health(sim, "f")).toBe(2 * loss);
      expect(before.g - health(sim, "g")).toBe(2 * loss);
      expect(health(sim, "out")).toBe(500);
      expect(before.s - health(sim, spiritId)).toBe(4 * loss);
    },
  );

  it("costs the spirit nothing with no foe in earshot, and a foe's clock restarts as it comes back", () => {
    const sim = ritual(12);
    const spiritId = spirit(sim).id;
    get(sim, "f").position = vec2(AREA_EARSHOT + 300, 0);
    get(sim, "g").position = vec2(-AREA_EARSHOT - 300, 0);
    stepFor(sim, 0.1);
    const full = health(sim, spiritId);
    stepFor(sim, 3);
    expect(health(sim, spiritId)).toBe(full);

    get(sim, "f").position = vec2(150, 0);
    const f = health(sim, "f");
    stepFor(sim, 0.9);
    expect(health(sim, "f")).toBe(f);
    stepFor(sim, 0.2);
    expect(f - health(sim, "f")).toBe(9);
    expect(full - health(sim, spiritId)).toBe(9);
  });

  it("is not damage: armor does not soften it", () => {
    const pulse = STATUS_DEFINITIONS.agony.pulse;
    expect(pulse?.effects.map(({ kind }) => kind)).toEqual(["lose-health"]);
  });
});

describe("Grenth's Aura (#2275)", () => {
  const SCYTHE = wielding(WEAPONS.scythe, "dervish.scythe-mastery");
  const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

  it.each([
    [12, 21],
    [0, 5],
  ] as const)(
    "at Wind Prayers %i: scythe hits deal %i less, and the cast steals as much",
    (rank, amount) => {
      const d = makeCombatant({
        id: "d",
        equipment: SCYTHE,
        attributeRanks: ranked(rank),
        health: 300,
      });
      const near = makeCombatant({ id: "near", team: 1 });
      const far = makeCombatant({ id: "far", team: 1 });
      apply(
        skill("dervish.grenths-aura").effects,
        d,
        d,
        placed([d, vec2(0, 0)], [near, vec2(AREA_ADJACENT - 5, 0)], [far, vec2(300, 0)]),
      );
      expect(near.health).toBe(500 - amount);
      expect(far.health).toBe(500);
      expect(d.health).toBe(300 + amount);
      expect(attackDamageDeltaOf(d)).toBe(-amount);

      d.equipment = SWORD;
      expect(attackDamageDeltaOf(d), "with a sword, no less damage").toBe(0);
    },
  );

  it("steals on a hit only with a scythe", () => {
    const rider = STATUS_DEFINITIONS["grenths-aura"].onAttackHit;
    expect(rider?.weapon).toBe("scythe");
    expect(rider?.effects).toEqual([
      {
        kind: "life-steal",
        amount: { scaling: { attributeId: "dervish.wind-prayers", atZero: 5, atTwelve: 21 } },
      },
    ]);
  });
});
