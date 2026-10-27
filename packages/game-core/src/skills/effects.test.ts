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
    applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    expect(ctx.target?.health).toBe(400);
  });

  it("emits a damage event with the amount actually applied", () => {
    const ctx = context();
    const events = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
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
    applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    expect(target.health).toBe(0);
  });

  it("reports only the damage actually dealt when it would overkill", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 30 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
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
    const events = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    expect(target.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "target" });
  });

  it("does nothing to an already-dead target", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 0, dead: true });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const events = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    expect(events).toEqual([]);
  });

  it("emits death exactly once even across repeated damage", () => {
    const target = makeCombatant({ id: "target", team: 1, health: 10 });
    const ctx = context(makeCombatant({ id: "caster" }), target);
    const first = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    const second = applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
      ctx,
    );
    const deaths = [...first, ...second].filter((e: CombatEvent) => e.kind === "death");
    expect(deaths).toHaveLength(1);
  });

  it("ignores non-positive damage", () => {
    const ctx = context();
    expect(
      applyEffect(
        { kind: "damage", amount: { flat: 0 }, type: "typeless", armorPenetration: 0 },
        ctx,
      ),
    ).toEqual([]);
    expect(
      applyEffect(
        { kind: "damage", amount: { flat: -50 }, type: "typeless", armorPenetration: 0 },
        ctx,
      ),
    ).toEqual([]);
    expect(ctx.target?.health).toBe(500);
  });

  it("does nothing when there is no target", () => {
    const ctx: SkillContext = {
      caster: makeCombatant({ id: "c" }),
      target: undefined,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    };
    expect(
      applyEffect(
        { kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 },
        ctx,
      ),
    ).toEqual([]);
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

  it("takes its loss off current health as it lands, reported as health lost, not damage", () => {
    const target = woundedAt(480);
    const events = applyEffect(deepWound, context(makeCombatant({ id: "caster" }), target));
    expect(target.health).toBe(384);
    expect(events).toContainEqual({
      kind: "health-lost",
      targetId: "target",
      amount: 96,
      statusId: "deep-wound",
    });
    expect(events.some((event) => event.kind === "damage")).toBe(false);
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
      kind: "health-lost",
      targetId: "target",
      amount: 49,
      statusId: "deep-wound",
    });
  });

  it("takes nothing more when re-applied while it is up", () => {
    const target = woundedAt(480);
    const ctx = context(makeCombatant({ id: "caster" }), target);
    applyEffect(deepWound, ctx);
    const events = applyEffect({ ...deepWound, durationSeconds: 30 }, ctx);
    expect(target.health).toBe(384);
    expect(events.some((event) => event.kind === "health-lost")).toBe(false);
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
    overcast: 0,
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
      { kind: "damage", amount: { flat: 30 }, type: "typeless", armorPenetration: 0 },
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

describe("if effects (#521)", () => {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1.combat;
  const damage = {
    kind: "damage",
    amount: { flat: 30 },
    type: "typeless",
    armorPenetration: 0,
  } as const;
  const ifInterrupted = {
    kind: "if",
    condition: { kind: "interrupted" },
    effects: [damage],
  } as const;
  const ifRemoved = {
    kind: "if",
    condition: { kind: "removed", category: "enchantment" },
    effects: [damage, { kind: "energy-gain", amount: { flat: 5 } }],
  } as const;

  /** A foe 1 s into casting `skillId`, which takes 3 s. */
  function casting(skillId: string): Combatant {
    const foe = makeCombatant({ id: "target", team: 1 });
    foe.cast.beginCast(skillId, foe.id, 3, undefined);
    return foe;
  }

  function run(effects: readonly SkillEffect[], target: Combatant): CombatEvent[] {
    return applyEffects(effects, {
      caster: makeCombatant({ id: "caster" }),
      target,
      rng: createRng(1),
      rules,
    });
  }

  it("lands after an interrupt that cancelled a cast, not after a missed one", () => {
    const interrupted = casting("ranger.troll-unguent");
    run([{ kind: "interrupt" }, ifInterrupted], interrupted);
    expect(interrupted.health).toBe(470);

    const idle = makeCombatant({ id: "target", team: 1 });
    const events = run([{ kind: "interrupt" }, ifInterrupted], idle);
    expect(events).toEqual([
      { kind: "interrupt-missed", targetId: "target", refusedSkillId: null },
    ]);
    expect(idle.health).toBe(500);
  });

  it("reads only what came before it", () => {
    const foe = casting("ranger.troll-unguent");
    run([ifInterrupted, { kind: "interrupt" }], foe);
    expect(foe.health).toBe(500);
  });

  it("interrupts only a spell or a chant with only: spell-or-chant", () => {
    const spellOrChant = [{ kind: "interrupt", only: "spell-or-chant" }, ifInterrupted] as const;
    for (const skillId of ["elementalist.fireball", "paragon.anthem-of-flame"]) {
      const foe = casting(skillId);
      run(spellOrChant, foe);
      expect(foe.cast.isCasting, skillId).toBe(false);
      expect(foe.health, skillId).toBe(470);
    }
    for (const skillId of ["warrior.distracting-blow", "ranger.troll-unguent"]) {
      const foe = casting(skillId);
      const events = run(spellOrChant, foe);
      expect(foe.cast.isCasting, skillId).toBe(true);
      // The miss names what it let through (#796).
      expect(events, skillId).toEqual([
        { kind: "interrupt-missed", targetId: "target", refusedSkillId: skillId },
      ]);
      expect(foe.health, skillId).toBe(500);
    }
  });

  it("a picky interrupt on an idle target refuses nothing: refusedSkillId is null (#796)", () => {
    const idle = makeCombatant({ id: "target", team: 1 });
    expect(run([{ kind: "interrupt", only: "spell-or-chant" }], idle)).toEqual([
      { kind: "interrupt-missed", targetId: "target", refusedSkillId: null },
    ]);
  });

  it("lands after a removal only when one of that category went", () => {
    const strip = { kind: "remove-status", category: "enchantment", count: 1 } as const;
    const enchanted = makeCombatant({ id: "target", team: 1 });
    enchanted.statuses.apply("guardian", 10, "ally");
    run([strip, ifRemoved], enchanted);
    expect(enchanted.health).toBe(470);

    const conditioned = makeCombatant({ id: "target", team: 1 });
    conditioned.statuses.apply("bleeding", 10, "foe");
    run(
      [{ kind: "remove-status", category: "condition", count: 1 }, strip, ifRemoved],
      conditioned,
    );
    expect(conditioned.health).toBe(500);
  });

  it("fires a caster effect inside it once for one target, and per target for several", () => {
    const skill: Skill = {
      id: "test.strip",
      name: "Strip",
      type: "spell",
      elite: false,
      profession: "mesmer",
      attributeId: undefined,
      cost: undefined,
      overcast: 0,
      activationSeconds: 0,
      rechargeSeconds: 0,
      range: 420,
      target: "single-enemy",
      area: undefined,
      attack: undefined,
      whileActivating: undefined,
      projectile: undefined,
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }, ifRemoved],
    };
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const [a, b, c] = ["a", "b", "c"].map((id) => makeCombatant({ id, team: 1 }));
    if (a === undefined || b === undefined || c === undefined) throw new Error("no targets");
    a.statuses.apply("guardian", 10, "ally");
    c.statuses.apply("regeneration", 10, "ally");

    const events = applySkillEffects({
      skill,
      caster,
      targets: [a, b, c],
      rng: createRng(1),
      rules,
    });

    expect(events.filter((event) => event.kind !== "status-removed")).toEqual([
      { kind: "damage", targetId: "a", amount: 30, critical: false },
      { kind: "energy-gain", targetId: "caster", amount: 5 },
      { kind: "damage", targetId: "c", amount: 30, critical: false },
      { kind: "energy-gain", targetId: "caster", amount: 5 },
    ]);
    expect(b.health).toBe(500);
    expect(caster.energy).toBe(20);
  });

  it("heals the caster, not the target, with recipient: caster", () => {
    const caster = makeCombatant({ id: "caster", health: 100 });
    const target = makeCombatant({ id: "target", team: 1, health: 100 });
    const events = applyEffect(
      { kind: "heal", recipient: "caster", amount: { flat: 40 } },
      { caster, target, rng: createRng(1), rules },
    );
    expect(events).toEqual([{ kind: "heal", targetId: "caster", amount: 40 }]);
    expect(target.health).toBe(100);
  });
});
