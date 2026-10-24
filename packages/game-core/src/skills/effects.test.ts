import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffect, applyEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { SkillContext } from "./types.js";

function context(
  caster = makeCombatant({ id: "caster" }),
  target = makeCombatant({ id: "target", team: 1 }),
): SkillContext {
  return { caster, target, rng: createRng(1), rules: MINIMAL_GW_INSPIRED_PVP_V1.combat };
}

describe("damage effect", () => {
  it("reduces target health by a flat amount", () => {
    const ctx = context();
    applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(ctx.target?.health).toBe(400);
  });

  it("emits a damage event with the amount actually applied", () => {
    const ctx = context();
    const events = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(events).toContainEqual({ kind: "damage", targetId: "target", amount: 100 });
  });

  it("clamps health at zero rather than going negative", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(target.health).toBe(0);
  });

  it("reports only the damage actually dealt when it would overkill", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(events).toContainEqual({ kind: "damage", targetId: "target", amount: 30 });
  });

  it("flags death and emits a death event when health reaches zero", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(target.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "target" });
  });

  it("does nothing to an already-dead target", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 0, dead: true });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    expect(events).toEqual([]);
  });

  it("emits death exactly once even across repeated damage", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 10 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const first = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    const second = applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx);
    const deaths = [...first, ...second].filter((e: CombatEvent) => e.kind === "death");
    expect(deaths).toHaveLength(1);
  });

  it("ignores non-positive damage", () => {
    const ctx = context();
    expect(applyEffect({ kind: "damage", amount: { flat: 0 } }, ctx)).toEqual([]);
    expect(applyEffect({ kind: "damage", amount: { flat: -50 } }, ctx)).toEqual([]);
    expect(ctx.target?.health).toBe(500);
  });

  it("does nothing when there is no target", () => {
    const ctx: SkillContext = {
      caster: makeCombatant({ id: "c" }),
      target: undefined,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    };
    expect(applyEffect({ kind: "damage", amount: { flat: 100 } }, ctx)).toEqual([]);
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
