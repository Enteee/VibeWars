import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { CHAIN_MARK_SECONDS } from "../skills/chain.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveAttackSkill, resolveSwing, swingIntervalSeconds } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

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

/** A rank-12 dagger assassin in Dark Escape. */
function escaping(): Combatant {
  const assassin = makeCombatant({
    id: "a",
    team: 0,
    equipment: wielding(WEAPONS.daggers, "assassin.dagger-mastery"),
    attributeRanks: new Map([["assassin.dagger-mastery", 12]]),
  });
  assassin.statuses.apply("dark-escape", 13, "a", NO_RANKS);
  return assassin;
}

const victim = (id = "t"): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

function swing(attacker: Combatant, target: Combatant, seed = 1): CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: NOWHERE,
  }).events;
}

function attackSkill(attacker: Combatant, id: string, target: Combatant): CombatEvent[] {
  return resolveAttackSkill(
    {
      surroundings: new Map(),
      skill: skill(id),
      caster: attacker,
      targets: [target],
      rng: createRng(1),
      rules: RULES.combat,
    },
    NOWHERE,
    [],
  );
}

const ended = (statusId: StatusId, targetId = "a"): CombatEvent => ({
  kind: "status-expired",
  targetId,
  statusId,
});

describe("Frenzy (#919)", () => {
  it("attacks 33% faster for 8 s and takes 160% damage, its PvP Strength-12 value (#1958)", () => {
    const frenzy = skill("warrior.frenzy");
    expect(frenzy.type).toBe("stance");
    expect(frenzy.cost).toEqual({ kind: "energy", amount: 5 });
    expect(frenzy.rechargeSeconds).toBe(4);
    expect(frenzy.effects).toEqual([
      { kind: "apply-status", statusId: "frenzy", durationSeconds: { flat: 8 } },
    ]);
    const warrior = makeCombatant({
      id: "w",
      equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    });
    const plain = swingIntervalSeconds(warrior);
    warrior.statuses.apply("frenzy", 8, "w", new Map([["warrior.strength", 12]]));
    expect(swingIntervalSeconds(warrior)).toBeCloseTo(plain * 0.67, 10);
    expect(aggregateModifiers(warrior.statuses.active).damageTakenMultiplier).toBe(1.6);
  });

  it("is replaced by Dark Escape, a stance like it: half damage, not double times half", () => {
    const both = makeCombatant({ id: "x" });
    both.statuses.apply("frenzy", 8, "x", NO_RANKS);
    both.statuses.apply("dark-escape", 13, "x", NO_RANKS);
    expect(both.statuses.active.map(({ id }) => id)).toEqual(["dark-escape"]);
    expect(aggregateModifiers(both.statuses.active).damageTakenMultiplier).toBe(0.5);
  });
});

describe("Dark Escape (#919)", () => {
  it("moves 25% faster for 13 s and takes half damage", () => {
    const darkEscape = skill("assassin.dark-escape");
    expect(darkEscape.attributeId).toBe("assassin.shadow-arts");
    expect(darkEscape.rechargeSeconds).toBe(30);
    expect(darkEscape.effects).toEqual([
      {
        kind: "apply-status",
        statusId: "dark-escape",
        durationSeconds: {
          scaling: { attributeId: "assassin.shadow-arts", atZero: 5, atTwelve: 13 },
        },
      },
    ]);
    const modifiers = aggregateModifiers([{ id: "dark-escape", ranks: NO_RANKS }]);
    expect(modifiers.moveSpeedMultiplier).toBe(1.25);
    expect(modifiers.damageTakenMultiplier).toBe(0.5);
  });

  it("ends when a swing hits", () => {
    const assassin = escaping();
    const events = swing(assassin, victim());
    expect(events.some((event) => event.kind === "damage")).toBe(true);
    expect(events).toContainEqual(ended("dark-escape"));
    expect(assassin.statuses.has("dark-escape")).toBe(false);
  });

  it("survives a blind miss", () => {
    const assassin = escaping();
    assassin.statuses.apply("blind", 10, "foe", NO_RANKS);
    let missed = 0;
    for (let seed = 0; seed < 20 && missed === 0; seed += 1) {
      const events = swing(assassin, victim(), seed);
      if (events.every((event) => event.kind === "attack-missed")) {
        missed += 1;
        expect(assassin.statuses.has("dark-escape")).toBe(true);
      }
    }
    expect(missed).toBe(1);
  });

  it("survives a block", () => {
    let blocked = 0;
    for (let seed = 0; seed < 20 && blocked === 0; seed += 1) {
      const assassin = escaping();
      const target = victim();
      target.statuses.apply("guardian", 10, "monk", NO_RANKS);
      const events = swing(assassin, target, seed);
      if (events.some((event) => event.kind === "attack-blocked")) {
        blocked += 1;
        expect(events.some((event) => event.kind === "damage")).toBe(false);
        expect(assassin.statuses.has("dark-escape")).toBe(true);
      }
    }
    expect(blocked).toBe(1);
  });

  it("ends when an attack skill hits", () => {
    const assassin = escaping();
    const events = attackSkill(assassin, "assassin.jagged-strike", victim());
    expect(events).toContainEqual(ended("dark-escape"));
    expect(assassin.statuses.has("dark-escape")).toBe(false);
  });

  it("ends at a dual attack's first blow that hits, before the second", () => {
    const assassin = escaping();
    const target = victim();
    assassin.chainMarks.set("t", { role: "off-hand", remainingSeconds: CHAIN_MARK_SECONDS });
    const events = attackSkill(assassin, "assassin.twisting-fangs", target);
    const blows = events.flatMap((event, index) =>
      event.kind === "damage" && event.targetId === "t" ? [index] : [],
    );
    const end = events.findIndex(
      (event) => event.kind === "status-expired" && event.statusId === "dark-escape",
    );
    expect(blows).toHaveLength(2);
    expect(end).toBeGreaterThan(blows[0] ?? Infinity);
    expect(end).toBeLessThan(blows[1] ?? -Infinity);
  });

  it("ends when an arrow hits, not when it is released", () => {
    const archer: ParticipantSpec = {
      id: "a",
      team: 0,
      skillBar: [],
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
      maxHealth: 1e6,
      spawn: vec2(0, 0),
      facing: 0,
    };
    const target = (spawn: Vec2): ParticipantSpec => ({
      ...archer,
      id: "t",
      team: 1,
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      spawn,
    });
    const match = new MatchSimulation({
      seed: "dark-escape",
      participants: [archer, target(vec2(600, 0))],
    });
    const shooter = match.get("a")?.combatant;
    shooter?.statuses.apply("dark-escape", 13, "a", NO_RANKS);
    match.requestAttack("a", "t");
    for (let i = 0; i < 5 * RULES.tickRateHz && match.projectiles.length === 0; i += 1) {
      match.step(DT);
    }
    expect(match.projectiles).toHaveLength(1);
    expect(shooter?.statuses.has("dark-escape")).toBe(true);
    const log: CombatEvent[] = [];
    for (let i = 0; i < 5 * RULES.tickRateHz && shooter?.statuses.has("dark-escape"); i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    expect(log.some((event) => event.kind === "damage" && event.targetId === "t")).toBe(true);
    expect(log).toContainEqual(ended("dark-escape"));
  });
});

describe("Natural Stride (#919)", () => {
  /** A ranger in Natural Stride, and what applying `effect` to it said. */
  function striding(): Combatant {
    const ranger = makeCombatant({ id: "r" });
    ranger.statuses.apply("natural-stride", 7, "r", NO_RANKS);
    return ranger;
  }

  function land(target: Combatant, statusId: StatusId): CombatEvent[] {
    return applyEffect(
      { kind: "apply-status", statusId, durationSeconds: { flat: 10 } },
      {
        caster: makeCombatant({ id: "c", team: 1 }),
        target,
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
      },
    );
  }

  it("runs 33% faster for 7 s and blocks about half of 1,000 swings", () => {
    const naturalStride = skill("ranger.natural-stride");
    expect(naturalStride.attributeId).toBe("ranger.wilderness-survival");
    expect(naturalStride.rechargeSeconds).toBe(12);
    expect(naturalStride.effects).toEqual([
      {
        kind: "apply-status",
        statusId: "natural-stride",
        durationSeconds: {
          scaling: { attributeId: "ranger.wilderness-survival", atZero: 1, atTwelve: 6.6 },
        },
      },
    ]);
    expect(
      aggregateModifiers([{ id: "natural-stride", ranks: NO_RANKS }]).moveSpeedMultiplier,
    ).toBe(1.33);
    const ranger = makeCombatant({ id: "r", health: 1e6, maxHealth: 1e6 });
    ranger.statuses.apply("natural-stride", 1e6, "r", NO_RANKS);
    const sword = makeCombatant({
      id: "w",
      equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    });
    const rng = createRng(919);
    let blocked = 0;
    for (let i = 0; i < 1000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target: { combatant: ranger, position: vec2(40, 0), creature: undefined },
        surroundings: new Map(),
        rng,
        rules: RULES.combat,
        exposed: NOWHERE,
      }).events;
      blocked += events.some((event) => event.kind === "attack-blocked") ? 1 : 0;
    }
    expect(blocked / 1000).toBeGreaterThan(0.45);
    expect(blocked / 1000).toBeLessThan(0.55);
  });

  it("ends when a hex lands, and says so", () => {
    const ranger = striding();
    expect(land(ranger, "faintheartedness")).toContainEqual(ended("natural-stride", "r"));
    expect(ranger.statuses.has("natural-stride")).toBe(false);
  });

  it("ends when an enchantment lands, a maintained one too", () => {
    const enchanted = striding();
    land(enchanted, "regeneration");
    expect(enchanted.statuses.has("natural-stride")).toBe(false);

    const maintained = striding();
    const events = applyEffect(
      { kind: "maintain-status", on: "target", statusId: "mending" },
      {
        caster: makeCombatant({ id: "m", team: 0 }),
        target: maintained,
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
      },
    );
    expect(events).toContainEqual(ended("natural-stride", "r"));
    expect(maintained.statuses.has("natural-stride")).toBe(false);
  });

  it("survives a condition, and a refresh of a hex it already bore", () => {
    const ranger = makeCombatant({ id: "r" });
    ranger.statuses.apply("faintheartedness", 10, "c", NO_RANKS);
    ranger.statuses.apply("natural-stride", 7, "r", NO_RANKS);
    expect(land(ranger, "bleeding")).not.toContainEqual(ended("natural-stride", "r"));
    land(ranger, "faintheartedness");
    expect(ranger.statuses.has("natural-stride")).toBe(true);
  });
});

describe("the three stances' tooltips (#919)", () => {
  it("say what each costs you", () => {
    expect(describeStatus("frenzy", new Map([["warrior.strength", 12]]))).toBe(
      "attacks 33% faster, takes 160% damage",
    );
    expect(describeStatus("dark-escape")).toBe(
      "moves at 125% speed, takes half damage, ends if the bearer hits with an attack",
    );
    expect(describeStatus("natural-stride")).toBe(
      "moves at 133% speed, 50% chance to block attacks, " +
        "ends if the bearer becomes hexed or enchanted",
    );
  });
});
