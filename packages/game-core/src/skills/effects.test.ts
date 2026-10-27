import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffect, applyEffects, applySkillEffects, type CombatEvent } from "./effects.js";
import { HEALTH_PER_PIP } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses, effectiveMaxHealth } from "./tick.js";
import type { Combatant, Skill, SkillContext, SkillEffect } from "./types.js";

function context(
  caster = makeCombatant({ id: "caster" }),
  target = makeCombatant({ id: "target", team: 1 }),
): SkillContext {
  return { caster, target, rng: createRng(1), rules: MINIMAL_GW_INSPIRED_PVP_V1.combat };
}

describe("damage effect", () => {
  it("reduces target health by a flat amount", () => {
    const ctx = context();
    applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(ctx.target?.health).toBe(400);
  });

  it("emits a damage event with the amount actually applied", () => {
    const ctx = context();
    const events = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "target",
      amount: 100,
      critical: false,
    });
  });

  it("clamps health at zero rather than going negative", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(target.health).toBe(0);
  });

  it("reports only the damage actually dealt when it would overkill", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "target",
      amount: 30,
      critical: false,
    });
  });

  it("flags death and emits a death event when health reaches zero", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(target.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "target" });
  });

  it("does nothing to an already-dead target", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 0, dead: true });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    expect(events).toEqual([]);
  });

  it("emits death exactly once even across repeated damage", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 10 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const first = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    const second = applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx);
    const deaths = [...first, ...second].filter((e: CombatEvent) => e.kind === "death");
    expect(deaths).toHaveLength(1);
  });

  it("ignores non-positive damage", () => {
    const ctx = context();
    expect(applyEffect({ kind: "damage", amount: { flat: 0 }, type: "typeless" }, ctx)).toEqual([]);
    expect(applyEffect({ kind: "damage", amount: { flat: -50 }, type: "typeless" }, ctx)).toEqual(
      [],
    );
    expect(ctx.target?.health).toBe(500);
  });

  it("does nothing when there is no target", () => {
    const ctx: SkillContext = {
      caster: makeCombatant({ id: "c" }),
      target: undefined,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    };
    expect(applyEffect({ kind: "damage", amount: { flat: 100 }, type: "typeless" }, ctx)).toEqual(
      [],
    );
  });
});

describe("heal effect", () => {
  it("restores health", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 300 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx);
    expect(target.health).toBe(400);
  });

  it("never exceeds maximum health", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 480 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx);
    expect(target.health).toBe(500);
    expect(events).toContainEqual({ kind: "heal", targetId: "target", amount: 20 });
  });

  it("emits nothing when already at full health", () => {
    const ctx = context();
    expect(applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx)).toEqual([]);
  });

  it("cannot resurrect a dead target", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 0, dead: true });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    expect(applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx)).toEqual([]);
    expect(target.health).toBe(0);
    expect(target.dead).toBe(true);
  });
});

describe("deep wound (#764)", () => {
  const deepWound: SkillEffect = {
    kind: "apply-status",
    statusId: "deep-wound",
    durationSeconds: 20,
  };

  function woundedAt(health: number, maxHealth = 480): Combatant {
    return makeCombatant({ id: "target", team: 1, health, maxHealth });
  }

  it("takes its loss off current health as it lands, reported as damage", () => {
    const target = woundedAt(480);
    const events = applyEffect(deepWound, context(makeCombatant({ id: "caster" }), target));
    expect(target.health).toBe(384);
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "target",
      amount: 96,
      critical: false,
    });
  });

  it("takes at most 100", () => {
    const target = woundedAt(600, 600);
    applyEffect(deepWound, context(makeCombatant({ id: "caster" }), target));
    expect(target.health).toBe(500);
  });

  it("never kills: at 50 health with 96 to lose, it leaves 1", () => {
    const target = woundedAt(50);
    const events = applyEffect(deepWound, context(makeCombatant({ id: "caster" }), target));
    expect(target.health).toBe(1);
    expect(target.dead).toBe(false);
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "target",
      amount: 49,
      critical: false,
    });
  });

  it("takes nothing more when re-applied while it is up", () => {
    const target = woundedAt(480);
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect(deepWound, ctx);
    const events = applyEffect({ ...deepWound, durationSeconds: 30 }, ctx);
    expect(target.health).toBe(384);
    expect(events.some((event) => event.kind === "damage")).toBe(false);
    expect(target.statuses.get("deep-wound")?.remainingSeconds).toBe(30);
  });

  it("weakens a heal by 20%, and never heals past the reduced maximum", () => {
    const target = woundedAt(200);
    target.statuses.apply("deep-wound", 20, "caster");
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx);
    expect(target.health).toBe(280);
    expect(events).toContainEqual({ kind: "heal", targetId: "target", amount: 80 });
    target.health = 350;
    applyEffect({ kind: "heal", amount: { flat: 100 } }, ctx);
    expect(target.health).toBe(384);
  });

  it("leaves regeneration pips at full strength", () => {
    const target = woundedAt(200);
    target.statuses.apply("deep-wound", 20, "caster");
    target.statuses.apply("regeneration", 20, "caster");
    advanceStatuses(target, 1, 0);
    expect(target.health).toBeCloseTo(200 + 4 * HEALTH_PER_PIP, 9);
  });

  it("gives maximum health back when it ends, and leaves current health where it is", () => {
    const target = woundedAt(480);
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect(deepWound, ctx);
    applyEffect({ kind: "remove-status", category: "condition", count: 1 }, ctx);
    expect(effectiveMaxHealth(target)).toBe(480);
    expect(target.health).toBe(384);
  });
});

describe("energy-gain effect", () => {
  it("restores the caster's energy, not the target's", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const target = makeCombatant({ id: "target", team: 1, energy: 10 });
    const ctx = context(caster, target);
    applyEffect({ kind: "energy-gain", amount: { flat: 15 } }, ctx);
    expect(caster.energy).toBe(25);
    expect(target.energy).toBe(10);
  });

  it("clamps at maximum energy", () => {
    const caster = makeCombatant({ id: "caster", energy: 45 });
    const ctx = context(caster);
    const events = applyEffect({ kind: "energy-gain", amount: { flat: 20 } }, ctx);
    expect(caster.energy).toBe(50);
    expect(events).toContainEqual({ kind: "energy-gain", targetId: "caster", amount: 5 });
  });
});

describe("sacrifice-health effect", () => {
  it("costs the caster a percentage of MAXIMUM health, not current", () => {
    const caster = makeCombatant({ id: "caster", health: 200, maxHealth: 500 });
    const ctx = context(caster);
    applyEffect({ kind: "sacrifice-health", percentOfMax: 10 }, ctx);
    expect(caster.health).toBe(150);
  });

  it("can kill the caster", () => {
    const caster = makeCombatant({ id: "caster", health: 20, maxHealth: 500 });
    const ctx = context(caster);
    const events = applyEffect({ kind: "sacrifice-health", percentOfMax: 10 }, ctx);
    expect(caster.health).toBe(0);
    expect(caster.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "caster" });
  });
});

describe("applyEffects", () => {
  it("applies every effect in order and concatenates their events", () => {
    const caster = makeCombatant({ id: "caster", health: 500, maxHealth: 500 });
    const target = makeCombatant({ id: "target", team: 1, health: 300 });
    const ctx = context(caster, target);

    const events = applyEffects(
      [
        { kind: "sacrifice-health", percentOfMax: 10 },
        { kind: "heal", amount: { flat: 100 } },
      ],
      ctx,
    );

    expect(caster.health).toBe(450);
    expect(target.health).toBe(400);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("sacrifice");
    expect(events[1]?.kind).toBe("heal");
  });

  it("returns an empty list for no effects", () => {
    expect(applyEffects([], context())).toEqual([]);
  });
});

describe("applySkillEffects", () => {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1.combat;
  const skill: Skill = {
    id: "test.blood-splash",
    name: "Blood Splash",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: undefined,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: 420,
    target: "single-enemy",
    area: {
      radius: 81,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    effects: [
      { kind: "sacrifice-health", percentOfMax: 10 },
      { kind: "damage", amount: { flat: 30 }, type: "typeless" },
      { kind: "energy-gain", amount: { flat: 5 } },
    ],
  };

  it("fires caster effects once however many are hit, the rest once per target", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const targets = ["a", "b", "c"].map((id) => makeCombatant({ id, team: 1 }));

    const events = applySkillEffects({ skill, caster, targets, rng: createRng(1), rules });

    expect(events).toEqual([
      { kind: "sacrifice", targetId: "caster", amount: 50 },
      { kind: "damage", targetId: "a", amount: 30, critical: false },
      { kind: "damage", targetId: "b", amount: 30, critical: false },
      { kind: "damage", targetId: "c", amount: 30, critical: false },
      { kind: "energy-gain", targetId: "caster", amount: 5 },
    ]);
    expect(caster.health).toBe(450);
    expect(caster.energy).toBe(15);
  });

  it("still fires caster effects with nobody hit", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const events = applySkillEffects({ skill, caster, targets: [], rng: createRng(1), rules });
    expect(events.map((event) => event.kind)).toEqual(["sacrifice", "energy-gain"]);
  });

  it("is applyEffects exactly, for one target", () => {
    const run = (apply: (caster: Combatant, target: Combatant) => CombatEvent[]) => {
      const caster = makeCombatant({ id: "caster", energy: 10 });
      const target = makeCombatant({ id: "t", team: 1 });
      return { events: apply(caster, target), caster, target };
    };
    expect(
      run((caster, target) =>
        applySkillEffects({ skill, caster, targets: [target], rng: createRng(1), rules }),
      ),
    ).toEqual(
      run((caster, target) =>
        applyEffects(skill.effects, { caster, target, rng: createRng(1), rules }),
      ),
    );
  });
});
