import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applyEffects } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses } from "./tick.js";
import type { Combatant, SkillEffect } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Interrupts (brief §14 — "a critical GW1-inspired mechanic").
 *
 * These tests encode the property that makes interrupting a *skill*
 * rather than a button: it only works inside the target's cast window.
 * Too early or too late and it is wasted.
 */

const TICK = 1 / 20;

function cast(caster: Combatant, skillId: string, target: Combatant | undefined): void {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`unknown skill ${skillId}`);
  }
  payCost(skill, caster);
  caster.cast.beginCast(skill.id, target?.id, skill.activationSeconds, skill.whileActivating);
}

function resolve(caster: Combatant, target: Combatant | undefined): void {
  const completed = caster.cast.advance(TICK);
  if (completed === undefined) {
    return;
  }
  const skill = getSkill(completed.skillId);
  if (skill === undefined) {
    return;
  }
  applyEffects(skill.effects, {
    surroundings: new Map(),
    caster,
    target,
    rng: createRng(1),
    rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
  });
  caster.cast.startRecharge(skill.id, skill.rechargeSeconds);
}

describe("interrupt mechanic", () => {
  it("cancels a cast that is in progress, and the skill never fires", () => {
    const ranger = makeCombatant({ id: "ranger", team: 0 });
    const victim = makeCombatant({ id: "victim", team: 1, health: 100, maxHealth: 500 });

    // Victim starts the slow 3s Troll Unguent self-heal.
    cast(victim, "ranger.troll-unguent", victim);
    for (let i = 0; i < 10; i += 1) {
      resolve(victim, victim);
    }
    expect(victim.cast.isCasting).toBe(true);

    // Ranger interrupts mid-cast.
    const events = applyEffects(getSkill("warrior.distracting-blow")?.effects ?? [], {
      surroundings: new Map(),
      caster: ranger,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "victim",
      skillId: "ranger.troll-unguent",
    });
    expect(victim.cast.isCasting).toBe(false);

    // Let plenty of time pass: the interrupted heal must never land.
    for (let i = 0; i < 100; i += 1) {
      resolve(victim, victim);
    }
    expect(victim.statuses.has("regeneration")).toBe(false);
  });

  it("is wasted when the target is not casting — timing is the skill", () => {
    const ranger = makeCombatant({ id: "ranger", team: 0 });
    const victim = makeCombatant({ id: "victim", team: 1 });

    const events = applyEffects(getSkill("warrior.distracting-blow")?.effects ?? [], {
      surroundings: new Map(),
      caster: ranger,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(events).toContainEqual({
      kind: "interrupt-missed",
      targetId: "victim",
      refusedSkillId: null,
    });
  });

  it("applies Dazed whether or not the interrupt itself landed", () => {
    const ranger = makeCombatant({ id: "ranger", team: 0 });
    const idle = makeCombatant({ id: "idle", team: 1 });

    applyEffects(getSkill("ranger.broad-head-arrow")?.effects ?? [], {
      surroundings: new Map(),
      caster: ranger,
      target: idle,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(idle.statuses.has("dazed")).toBe(true);
  });

  it("a cast that completes before the interrupt arrives cannot be stopped", () => {
    const ranger = makeCombatant({ id: "ranger", team: 0 });
    const victim = makeCombatant({ id: "victim", team: 1, health: 100 });

    cast(victim, "ranger.troll-unguent", victim);
    // Let the full 3s cast finish (60 ticks at 20Hz).
    for (let i = 0; i < 61; i += 1) {
      resolve(victim, victim);
    }
    expect(victim.statuses.has("regeneration")).toBe(true);

    const events = applyEffects(getSkill("warrior.distracting-blow")?.effects ?? [], {
      surroundings: new Map(),
      caster: ranger,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    // Too late: nothing to interrupt, and the heal is already running.
    expect(events).toContainEqual({
      kind: "interrupt-missed",
      targetId: "victim",
      refusedSkillId: null,
    });
    expect(victim.statuses.has("regeneration")).toBe(true);
  });

  it("an interrupted caster has still paid the skill's energy cost", () => {
    const victim = makeCombatant({ id: "victim", team: 1, energy: 50 });
    const ranger = makeCombatant({ id: "ranger", team: 0 });

    cast(victim, "ranger.troll-unguent", victim);
    const energyAfterPaying = victim.energy;
    expect(energyAfterPaying).toBe(45);

    applyEffects(getSkill("warrior.distracting-blow")?.effects ?? [], {
      surroundings: new Map(),
      caster: ranger,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    // The energy is gone and the skill did nothing — that is the real
    // cost of being interrupted, and why interrupts are so valuable.
    expect(victim.energy).toBe(energyAfterPaying);
    expect(victim.statuses.has("regeneration")).toBe(false);
  });
});

describe("status-driven combat scenarios", () => {
  it("bleeding from an attack genuinely degenerates the target over time", () => {
    const warrior = makeCombatant({ id: "war", team: 0 });
    const victim = makeCombatant({ id: "victim", team: 1, health: 500 });

    applyEffects(getSkill("warrior.sever-artery")?.effects ?? [], {
      surroundings: new Map(),
      caster: warrior,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    const healthAfterHit = victim.health;
    expect(victim.statuses.has("bleeding")).toBe(true);

    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(victim, TICK, 0);
    }
    // 5 seconds of a -3 pip bleed: 6 HP/s.
    expect(victim.health).toBeCloseTo(healthAfterHit - 30, 5);
  });

  it("condition removal cures the bleed and stops the degeneration", () => {
    const monk = makeCombatant({ id: "monk", team: 0 });
    const ally = makeCombatant({ id: "ally", team: 0, health: 400 });
    ally.statuses.apply("bleeding", 20, "enemy", NO_RANKS);

    const events = applyEffects(getSkill("monk.mend-condition")?.effects ?? [], {
      surroundings: new Map(),
      caster: monk,
      target: ally,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(events.filter((e) => e.kind === "status-removed")).toHaveLength(1);
    expect(ally.statuses.countByCategory("condition")).toBe(0);

    const healthAfterCure = ally.health;
    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(ally, TICK, 0);
    }
    expect(ally.health).toBe(healthAfterCure);
  });

  it("a self-enchantment is applied to the caster, not to a selected enemy", () => {
    const ele = makeCombatant({ id: "ele", team: 0 });
    const enemy = makeCombatant({ id: "enemy", team: 1 });

    // A self-targeted skill resolves against the caster.
    applyEffects(getSkill("elementalist.armor-of-earth")?.effects ?? [], {
      surroundings: new Map(),
      caster: ele,
      target: ele,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(ele.statuses.has("armor-boost")).toBe(true);
    expect(enemy.statuses.has("armor-boost")).toBe(false);
  });

  it("a self-targeted skill passes activation checks with no target selected", () => {
    const ele = makeCombatant({ id: "ele", team: 0 });
    const skill = getSkill("elementalist.armor-of-earth");
    expect(skill).toBeDefined();
    if (skill === undefined) return;

    const check = canActivate({
      skill,
      caster: ele,
      casterPosition: vec2(0, 0),
      target: undefined,
      targetPosition: undefined,
      targetCreatureKind: undefined,
      targetCreatureOwnerId: undefined,
      rechargeRemaining: new Map(),
      spent: new Set(),
      isCasting: false,
      skillBar: [skill.id],
      losBlockers: [],
    });
    expect(check.ok).toBe(true);
  });

  it("a hex applied by a skill drains the victim's health over its duration", () => {
    const necro = makeCombatant({
      id: "necro",
      team: 0,
      attributeRanks: new Map([["necromancer.curses", 12]]),
    });
    const victim = makeCombatant({ id: "victim", team: 1, health: 500 });

    applyEffects(getSkill("necromancer.faintheartedness")?.effects ?? [], {
      surroundings: new Map(),
      caster: necro,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(victim.statuses.countByCategory("hex")).toBe(1);
    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(victim, TICK, 0);
    }
    expect(victim.health).toBeLessThan(500);
  });
});

describe("an interrupted skill (ADR-0029)", () => {
  it("starts recharging, as if it had been used", () => {
    const victim = makeCombatant({ id: "victim", team: 1 });
    const ranger = makeCombatant({ id: "ranger", team: 0 });
    cast(victim, "ranger.troll-unguent", victim);

    applyEffects([{ kind: "interrupt" }], {
      surroundings: new Map(),
      caster: ranger,
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

    expect(victim.cast.rechargeRemaining.get("ranger.troll-unguent")).toBe(
      getSkill("ranger.troll-unguent")?.rechargeSeconds,
    );
  });
});

describe("applying Dazed (#546)", () => {
  const daze = (victim: Combatant) =>
    applyEffects(getSkill("ranger.broad-head-arrow")?.effects ?? [], {
      surroundings: new Map(),
      caster: makeCombatant({ id: "ranger", team: 0 }),
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });

  it("interrupts a spell being cast: Broad Head Arrow shuts a spell-caster down", () => {
    const victim = makeCombatant({ id: "victim", team: 1 });
    cast(victim, "necromancer.faintheartedness", undefined);
    const events = daze(victim);
    expect(events.map((event) => event.kind)).toEqual(["status-applied", "interrupted"]);
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "victim",
      skillId: "necromancer.faintheartedness",
    });
    expect(victim.cast.isCasting).toBe(false);
    expect(victim.cast.rechargeRemaining.has("necromancer.faintheartedness")).toBe(true);
  });

  it("interrupts again a target already dazed", () => {
    const victim = makeCombatant({ id: "victim", team: 1 });
    victim.statuses.apply("dazed", 10, "ranger", NO_RANKS);
    cast(victim, "monk.orison-of-healing", victim);
    expect(daze(victim)).toContainEqual({
      kind: "interrupted",
      targetId: "victim",
      skillId: "monk.orison-of-healing",
    });
    expect(victim.cast.isCasting).toBe(false);
  });

  it("leaves a signet or a non-spell skill alone, and says nothing about it", () => {
    for (const skillId of ["warrior.healing-signet", "ranger.troll-unguent"]) {
      const victim = makeCombatant({ id: "victim", team: 1 });
      cast(victim, skillId, victim);
      expect(
        daze(victim).map((event) => event.kind),
        skillId,
      ).toEqual(["status-applied"]);
      expect(victim.cast.isCasting, skillId).toBe(true);
      expect(victim.statuses.has("dazed"), skillId).toBe(true);
    }
  });

  it("dazes a target that is not casting, with no wasted interrupt", () => {
    const victim = makeCombatant({ id: "victim", team: 1 });
    expect(daze(victim).map((event) => event.kind)).toEqual(["status-applied"]);
  });
});

describe("interrupting a plain swing (#1709)", () => {
  /** A foe `swingElapsed` seconds into a swing at `x`. */
  const swinging = (swingElapsed = 0.8): Combatant => {
    const victim = makeCombatant({ id: "victim", team: 1 });
    victim.attack = { targetId: "x", swingElapsed, unreachableSeconds: 0 };
    return victim;
  };
  const hit = (effects: readonly SkillEffect[], victim: Combatant) =>
    applyEffects(effects, {
      surroundings: new Map(),
      caster: makeCombatant({ id: "caster", team: 0 }),
      target: victim,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });
  const effectsOf = (skillId: string): readonly SkillEffect[] => getSkill(skillId)?.effects ?? [];
  const missed = { kind: "interrupt-missed", targetId: "victim", refusedSkillId: null };

  it("drops the blow under way and starts the swing over, at the same foe", () => {
    const victim = swinging();
    const events = hit(effectsOf("warrior.distracting-blow"), victim);
    expect(events).toContainEqual({ kind: "attack-interrupted", targetId: "victim" });
    expect(events).not.toContainEqual(missed);
    expect(victim.attack).toEqual({ targetId: "x", swingElapsed: 0, unreachableSeconds: 0 });
  });

  it("Lightning Javelin interrupts an auto-attacking foe (#1664)", () => {
    const victim = swinging();
    const events = hit(effectsOf("elementalist.lightning-javelin"), victim);
    expect(events).toContainEqual({ kind: "attack-interrupted", targetId: "victim" });
    expect(victim.attack?.swingElapsed).toBe(0);
  });

  it("is a miss for one that interrupts only a skill or a spell", () => {
    for (const only of ["skill", "spell", "spell-or-chant"] as const) {
      const victim = swinging();
      const events = hit([{ kind: "interrupt", only }], victim);
      expect(events).toEqual([missed]);
      expect(victim.attack?.swingElapsed).toBe(0.8);
    }
  });

  it("is a miss on a foe walking to its target, or between swings", () => {
    const approaching = swinging();
    approaching.moving = true;
    expect(hit([{ kind: "interrupt" }], approaching)).toEqual([missed]);
    expect(hit([{ kind: "interrupt" }], swinging(0))).toEqual([missed]);
  });

  it("is a miss on an uninterruptible foe", () => {
    const victim = swinging();
    victim.statuses.apply("tranquil-was-tanasen", 30, "victim", NO_RANKS);
    expect(hit([{ kind: "interrupt" }], victim)).toEqual([missed]);
    expect(victim.attack?.swingElapsed).toBe(0.8);
  });

  it("disables nothing, as a swing is no skill: Distracting Shot", () => {
    const events = hit(effectsOf("ranger.distracting-shot"), swinging());
    expect(events).toContainEqual({ kind: "attack-interrupted", targetId: "victim" });
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });

  it("knocks no one down, as that action was no skill: Psychic Instability", () => {
    const events = hit(effectsOf("mesmer.psychic-instability"), swinging());
    expect(events).toContainEqual({ kind: "attack-interrupted", targetId: "victim" });
    expect(events.some((event) => event.kind === "knocked-down")).toBe(false);
  });

  it("is told once when one resolution interrupts the same swing twice", () => {
    const events = hit([{ kind: "interrupt" }, { kind: "interrupt" }], swinging());
    expect(events).toEqual([{ kind: "attack-interrupted", targetId: "victim" }]);
  });

  it("leaves a swing alone while a cast is under way, and interrupts the cast", () => {
    const victim = swinging();
    cast(victim, "ranger.troll-unguent", victim);
    victim.attack = { targetId: "x", swingElapsed: 0.8, unreachableSeconds: 0 };
    const events = hit([{ kind: "interrupt" }], victim);
    expect(events).toEqual([
      { kind: "interrupted", targetId: "victim", skillId: "ranger.troll-unguent" },
    ]);
    expect(victim.attack.swingElapsed).toBe(0.8);
  });
});
