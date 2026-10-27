import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import {
  applyEffect,
  applyEffects,
  applySkillEffects,
  applyStatus,
  resolveSkillEffects,
  type CombatEvent,
} from "./effects.js";
import { HEALTH_PER_PIP } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses, effectiveMaxHealth } from "./tick.js";
import type {
  Combatant,
  EffectCondition,
  Skill,
  SkillContext,
  SkillEffect,
  UnconditionalEffect,
} from "./types.js";

function context(
  caster = makeCombatant({ id: "caster" }),
  target = makeCombatant({ id: "target", team: 1 }),
): SkillContext {
  return {
    caster,
    target,
    rng: createRng(1),
    rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    surroundings: new Map(),
  };
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
      surroundings: new Map(),
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

describe("energy-loss effect (#793)", () => {
  const loss: SkillEffect = { kind: "energy-loss", amount: { flat: 8 } };

  it("takes energy from the target, not the caster, and says how much", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const target = makeCombatant({ id: "target", team: 1, energy: 20 });
    const events = applyEffects([loss], context(caster, target));
    expect(target.energy).toBe(12);
    expect(caster.energy).toBe(10);
    expect(events).toEqual([{ kind: "energy-loss", targetId: "target", amount: 8 }]);
  });

  it("takes only the whole points the target has, and nothing below 0", () => {
    const target = makeCombatant({ id: "target", team: 1, energy: 5.5 });
    const events = applyEffects([loss], context(makeCombatant({ id: "caster" }), target));
    expect(target.energy).toBe(0.5);
    expect(events).toEqual([{ kind: "energy-loss", targetId: "target", amount: 5 }]);
  });

  it("emits nothing when the target has no energy to lose", () => {
    const target = makeCombatant({ id: "target", team: 1, energy: 0 });
    expect(applyEffects([loss], context(makeCombatant({ id: "caster" }), target))).toEqual([]);
  });

  it("leaves maximum energy alone", () => {
    const target = makeCombatant({ id: "target", team: 1, energy: 20 });
    applyEffects([loss], context(makeCombatant({ id: "caster" }), target));
    expect(target.maxEnergy).toBe(makeCombatant({ id: "fresh" }).maxEnergy);
  });

  it("scales a perEnergyLost damage and gain with what was actually lost", () => {
    const effects: SkillEffect[] = [
      loss,
      {
        kind: "damage",
        amount: { flat: 9 },
        type: "typeless",
        armorPenetration: 0,
        perEnergyLost: true,
      },
      { kind: "energy-gain", amount: { flat: 2 }, perEnergyLost: true },
    ];
    const caster = makeCombatant({ id: "caster", energy: 0 });
    const target = makeCombatant({ id: "target", team: 1, energy: 3 });
    const events = applyEffects(effects, context(caster, target));
    expect(events).toEqual([
      { kind: "energy-loss", targetId: "target", amount: 3 },
      { kind: "damage", targetId: "target", amount: 27, critical: false },
      { kind: "energy-gain", targetId: "caster", amount: 6 },
    ]);
  });

  it("deals and gives nothing per point with no loss before it", () => {
    const caster = makeCombatant({ id: "caster", energy: 0 });
    const target = makeCombatant({ id: "target", team: 1, energy: 0 });
    const events = applyEffects(
      [
        loss,
        {
          kind: "damage",
          amount: { flat: 9 },
          type: "typeless",
          armorPenetration: 0,
          perEnergyLost: true,
        },
        { kind: "energy-gain", amount: { flat: 2 }, perEnergyLost: true },
      ],
      context(caster, target),
    );
    expect(events).toEqual([]);
    expect(target.health).toBe(500);
    expect(caster.energy).toBe(0);
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

    const events = applySkillEffects({
      surroundings: new Map(),
      skill,
      caster,
      targets,
      rng: createRng(1),
      rules,
    });

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
    const events = applySkillEffects({
      surroundings: new Map(),
      skill,
      caster,
      targets: [],
      rng: createRng(1),
      rules,
    });
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
        applySkillEffects({
          surroundings: new Map(),
          skill,
          caster,
          targets: [target],
          rng: createRng(1),
          rules,
        }),
      ),
    ).toEqual(
      run((caster, target) =>
        applyEffects(skill.effects, {
          surroundings: new Map(),
          caster,
          target,
          rng: createRng(1),
          rules,
        }),
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
      surroundings: new Map(),
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

  it("a second interrupt in one resolution is no miss: the first one landed (#817)", () => {
    const foe = casting("elementalist.fireball");
    expect(run([{ kind: "interrupt" }, { kind: "interrupt" }], foe)).toEqual([
      { kind: "interrupted", targetId: "target", skillId: "elementalist.fireball" },
    ]);
  });

  it("an interrupt on a target another resolution interrupted is a miss", () => {
    const foe = casting("elementalist.fireball");
    run([{ kind: "interrupt" }], foe);
    expect(run([{ kind: "interrupt" }], foe)).toEqual([
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
      surroundings: new Map(),
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
      { surroundings: new Map(), caster, target, rng: createRng(1), rules },
    );
    expect(events).toEqual([{ kind: "heal", targetId: "caster", amount: 40 }]);
    expect(target.health).toBe(100);
  });
});

describe("state conditions (#794)", () => {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1.combat;
  const heal = (flat: number): UnconditionalEffect => ({ kind: "heal", amount: { flat } });
  /** Heals 10, and 100 more if `condition` holds. */
  const healIf = (condition: EffectCondition): SkillEffect[] => [
    heal(10),
    { kind: "if", condition, effects: [heal(100)] },
  ];
  const healed = (effects: SkillEffect[], caster: Combatant, target: Combatant): number => {
    const before = target.health;
    applyEffects(effects, { surroundings: new Map(), caster, target, rng: createRng(1), rules });
    return target.health - before;
  };
  const at = (health: number, id = "target"): Combatant =>
    makeCombatant({ id, health, maxHealth: 500 });

  it("target-health-below: holds below the fraction, not at it", () => {
    const below = healIf({ kind: "target-health-below", fraction: 0.5 });
    expect(healed(below, at(100), at(249))).toBe(110);
    expect(healed(below, at(100), at(250))).toBe(10);
    expect(healed(below, at(100), at(400))).toBe(10);
  });

  it("target-health-below: is a share of the maximum a deep wound left", () => {
    // 500 less deep wound's 100 is 400, so half is 200, not 250.
    const wounded = at(190);
    wounded.statuses.apply("deep-wound", 20, "caster");
    const below = healIf({ kind: "target-health-below", fraction: 0.5 });
    expect(healed(below, at(100), wounded)).toBe(110 * 0.8);
    const notBelow = at(210);
    notBelow.statuses.apply("deep-wound", 20, "caster");
    expect(healed(below, at(100), notBelow)).toBe(10 * 0.8);
  });

  it("is read before the first effect, so a heal cannot lift its target out of its bonus", () => {
    // The first heal takes 240 to 340, over half; the bonus still lands.
    const effects: SkillEffect[] = [
      heal(100),
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.5 },
        effects: [heal(100)],
      },
    ];
    expect(healed(effects, at(100), at(240))).toBe(200);
  });

  it("target-has and caster-has: a status of the category, on whom they name", () => {
    const hexed = at(100);
    hexed.statuses.apply("malaise", 10, "foe");
    const enchanted = at(100, "caster");
    enchanted.statuses.apply("regeneration", 10, "caster");
    const targetHex = healIf({ kind: "target-has", category: "hex" });
    expect(healed(targetHex, at(100, "caster"), hexed)).toBe(110);
    expect(healed(targetHex, hexed, at(100))).toBe(10);
    const casterEnchanted = healIf({ kind: "caster-has", category: "enchantment" });
    expect(healed(casterEnchanted, enchanted, at(100))).toBe(110);
    expect(healed(casterEnchanted, at(100, "caster"), enchanted)).toBe(10);
  });

  it("target-casting: a spell being cast, not a chant, an attack skill or nothing", () => {
    const casting = (skillId: string | undefined): Combatant => {
      const target = at(100);
      if (skillId !== undefined) {
        target.cast.beginCast(skillId, target.id, 3, undefined);
      }
      return target;
    };
    const spell = healIf({ kind: "target-casting", spell: true });
    expect(healed(spell, at(100, "caster"), casting("elementalist.fireball"))).toBe(110);
    for (const skillId of ["paragon.anthem-of-flame", "warrior.distracting-blow", undefined]) {
      expect(healed(spell, at(100, "caster"), casting(skillId)), String(skillId)).toBe(10);
    }
  });

  it("is read per target", () => {
    const skill: Skill = {
      id: "test.word",
      name: "Word",
      type: "spell",
      elite: false,
      profession: "monk",
      attributeId: undefined,
      cost: undefined,
      overcast: 0,
      activationSeconds: 0,
      rechargeSeconds: 0,
      range: 420,
      target: "single-ally",
      area: undefined,
      attack: undefined,
      whileActivating: undefined,
      projectile: undefined,
      effects: healIf({ kind: "target-health-below", fraction: 0.5 }),
    };
    const low = at(100, "low");
    const high = at(400, "high");
    applySkillEffects({
      surroundings: new Map(),
      skill,
      caster: at(500, "caster"),
      targets: [low, high],
      rng: createRng(1),
      rules,
    });
    expect(low.health).toBe(210);
    expect(high.health).toBe(410);
  });
});

describe("resurrect effect (#812)", () => {
  const RESURRECT: UnconditionalEffect = {
    kind: "resurrect",
    healthPercent: { scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 56 } },
    energyPercent: { scaling: { attributeId: "monk.healing-prayers", atZero: 42, atTwelve: 80 } },
  };
  const monk = (rank: number) =>
    makeCombatant({ id: "caster", attributeRanks: new Map([["monk.healing-prayers", rank]]) });
  const corpse = () => {
    const target = makeCombatant({
      id: "target",
      health: 0,
      maxHealth: 480,
      energy: 7,
      maxEnergy: 30,
      adrenaline: new Map([["warrior.backbreaker", 100]]),
      dead: true,
    });
    applyStatus(target, "bleeding", 10, "foe");
    return target;
  };

  it("brings the dead back with the shares of health and energy its rank gives", () => {
    const target = corpse();
    const events = applyEffect(RESURRECT, context(monk(12), target));
    expect(target.dead).toBe(false);
    expect(target.health).toBe(Math.floor(480 * 0.56));
    expect(target.energy).toBe(Math.floor(30 * 0.8));
    expect(events).toEqual([
      { kind: "resurrected", targetId: "target", healthFraction: 0.56, energyFraction: 0.8 },
    ]);
  });

  it("rounds down, but never to 0 health", () => {
    const target = makeCombatant({ id: "target", health: 0, maxHealth: 3, dead: true });
    applyEffect(RESURRECT, context(monk(0), target));
    expect(target.health).toBe(1);
  });

  it("comes back with no effects and no adrenaline", () => {
    const target = corpse();
    applyEffect(RESURRECT, context(monk(12), target));
    expect(target.statuses.active).toEqual([]);
    expect([...target.adrenaline.values()]).toEqual([0]);
  });

  it("leaves the living as they are, with no event", () => {
    const target = makeCombatant({ id: "target", health: 100 });
    expect(applyEffect(RESURRECT, context(monk(12), target))).toEqual([]);
    expect(target.health).toBe(100);
  });
});

describe("losing your own enchantment (#845)", () => {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1.combat;
  const lose = {
    kind: "remove-status",
    category: "enchantment",
    count: 1,
    profession: "dervish",
    from: "caster",
  } as const;
  const ifLost: SkillEffect = {
    kind: "if",
    condition: { kind: "removed", category: "enchantment", from: "caster" },
    effects: [{ kind: "damage", amount: { flat: 30 }, type: "typeless", armorPenetration: 0 }],
  };
  const skill = (effects: readonly SkillEffect[]): Skill => ({
    id: "test.pious",
    name: "Pious",
    type: "spell",
    elite: false,
    profession: "dervish",
    attributeId: undefined,
    cost: undefined,
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 20,
    range: 420,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    effects,
  });
  const dervish = (): Combatant => {
    const caster = makeCombatant({ id: "caster" });
    caster.statuses.apply("mystic-regeneration", 10, "caster");
    caster.statuses.apply("fleeting-stability", 10, "caster");
    return caster;
  };
  const foes = (): Combatant[] => ["a", "b"].map((id) => makeCombatant({ id, team: 1 }));

  it("loses one from the caster, once however many are hit", () => {
    const caster = dervish();
    const targets = foes();
    const events = applySkillEffects({
      surroundings: new Map(),
      skill: skill([lose]),
      caster,
      targets,
      rng: createRng(1),
      rules,
    });
    expect(events).toEqual([
      { kind: "status-removed", targetId: "caster", statusId: "fleeting-stability" },
    ]);
    expect(caster.statuses.has("mystic-regeneration")).toBe(true);
  });

  it("leaves a target's enchantments alone", () => {
    const targets = foes();
    targets[0]?.statuses.apply("mystic-regeneration", 10, "a");
    applySkillEffects({
      surroundings: new Map(),
      skill: skill([lose]),
      caster: dervish(),
      targets,
      rng: createRng(1),
      rules,
    });
    expect(targets[0]?.statuses.has("mystic-regeneration")).toBe(true);
  });

  it("then holds 'removed from the caster' for every target", () => {
    const targets = foes();
    applySkillEffects({
      surroundings: new Map(),
      skill: skill([lose, ifLost]),
      caster: dervish(),
      targets,
      rng: createRng(1),
      rules,
    });
    expect(targets.map((target) => target.health)).toEqual([470, 470]);
  });

  it("holds it for none, with no Dervish enchantment to lose", () => {
    const caster = makeCombatant({ id: "caster" });
    caster.statuses.apply("guardian", 10, "monk");
    const targets = foes();
    const events = applySkillEffects({
      surroundings: new Map(),
      skill: skill([lose, ifLost]),
      caster,
      targets,
      rng: createRng(1),
      rules,
    });
    expect(events).toEqual([]);
    expect(caster.statuses.has("guardian")).toBe(true);
    expect(targets.map((target) => target.health)).toEqual([500, 500]);
  });

  it("does not take a target's removal for the caster's", () => {
    const strip = { kind: "remove-status", category: "enchantment", count: 1 } as const;
    const target = makeCombatant({ id: "a", team: 1 });
    target.statuses.apply("guardian", 10, "a");
    applySkillEffects({
      surroundings: new Map(),
      skill: skill([strip, ifLost]),
      caster: makeCombatant({ id: "caster" }),
      targets: [target],
      rng: createRng(1),
      rules,
    });
    expect(target.health).toBe(500);
  });

  it("shortens the recharge only when the condition held", () => {
    const faster = {
      kind: "if",
      condition: { kind: "removed", category: "enchantment", from: "caster" },
      effects: [{ kind: "recharge-faster", fraction: 0.75 }],
    } as const;
    const resolve = (caster: Combatant): number =>
      resolveSkillEffects({
        surroundings: new Map(),
        skill: skill([lose, faster]),
        caster,
        targets: foes(),
        rng: createRng(1),
        rules,
      }).rechargeFraction;
    expect(resolve(dervish())).toBe(0.75);
    expect(resolve(makeCombatant({ id: "caster" }))).toBe(0);
  });
});

describe("a knockdown prevented (#845)", () => {
  it("does nothing to the bearer and ends Fleeting Stability", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("fleeting-stability", 9, "target");
    expect(
      applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target)),
    ).toEqual([{ kind: "status-removed", targetId: "target", statusId: "fleeting-stability" }]);
    expect(target.knockdownRemaining).toBe(0);

    applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target));
    expect(target.knockdownRemaining).toBe(2);
  });

  it("still stops one landing on the tick it would run out", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("fleeting-stability", 0.05, "target");
    applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target));
    expect(target.knockdownRemaining).toBe(0);
  });

  it("is not spent on someone already down", () => {
    const target = makeCombatant({ id: "target", team: 1, knockdownRemaining: 1 });
    target.statuses.apply("fleeting-stability", 9, "target");
    expect(
      applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target)),
    ).toEqual([]);
    expect(target.statuses.has("fleeting-stability")).toBe(true);
  });
});
