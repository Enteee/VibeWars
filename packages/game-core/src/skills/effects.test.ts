import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import {
  applyDamage,
  applyRedirectedDamage,
  applyEffect,
  applyEffects,
  applySkillEffects,
  applyStatus,
  resolveSkillEffects,
  type CombatEvent,
} from "./effects.js";
import { chainAllows } from "./chain.js";
import { effectiveMaxEnergy } from "./overcast.js";
import { NO_RANKS, HEALTH_PER_PIP, getStatusDefinition, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses, effectiveMaxHealth } from "./tick.js";
import { vec2 } from "../vec2.js";
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

describe("damage or life steal from a foe (#1022)", () => {
  const hit = { kind: "damage", amount: { flat: 50 }, type: "fire", armorPenetration: 0 } as const;
  const steal = { kind: "life-steal", amount: { flat: 30 } } as const;

  /** A target under Vengeful Weapon, and what it recorded. */
  function vengeful(team = 1): {
    ctx: SkillContext;
    target: Combatant;
    offenders: () => string[];
  } {
    const target = makeCombatant({ id: "target", team });
    const ctx = context(undefined, target);
    target.statuses.apply("vengeful-weapon", 8, "rit", NO_RANKS);
    target.statuses.drainChanges();
    return {
      ctx,
      target,
      offenders: () =>
        target.statuses
          .drainChanges()
          .flatMap((change) => (change.kind === "took-damage-from-foe" ? [change.offenderId] : [])),
    };
  }

  it("a packet from a foe records its dealer", () => {
    const { ctx, offenders } = vengeful();
    applyEffect(hit, ctx);
    expect(offenders()).toEqual(["caster"]);
  });

  it("a steal from a foe records its caster", () => {
    const { ctx, offenders } = vengeful();
    applyEffect(steal, ctx);
    expect(offenders()).toEqual(["caster"]);
  });

  it("a packet from an ally, or from no one, records nothing", () => {
    const ally = vengeful(0);
    applyEffect(hit, ally.ctx);
    expect(ally.offenders()).toEqual([]);

    const nobody = vengeful();
    applyDamage(nobody.target, 50, "fire", false, [], undefined);
    expect(nobody.offenders()).toEqual([]);
  });

  it("a packet Reversal of Fortune reverses records nothing", () => {
    const { ctx, offenders } = vengeful();
    ctx.target?.statuses.apply("reversal-of-fortune", 8, "monk", NO_RANKS);
    ctx.target?.statuses.drainChanges();
    applyEffect(hit, ctx);
    expect(offenders()).toEqual([]);
  });
});

describe("Symbiotic Bond's redirect (#1108)", () => {
  /** A bonded pet at full Health, with `owner` as the bond's source. */
  function bonded(): Combatant {
    const pet = makeCombatant({ id: "pet", team: 0 });
    pet.statuses.apply("symbiotic-bond", 264, "owner", NO_RANKS);
    pet.statuses.drainChanges();
    return pet;
  }

  function redirected(pet: Combatant): unknown[] {
    return pet.statuses.drainChanges().filter((change) => change.kind === "redirected-damage");
  }

  it("keeps 13 of a 25 physical hit and records 12 for its source", () => {
    const pet = bonded();
    const events: CombatEvent[] = [];
    applyDamage(pet, 25, "slashing", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "pet", amount: 13, critical: false }]);
    expect(redirected(pet)).toEqual([
      { kind: "redirected-damage", toId: "owner", amount: 12, toClosestMinion: false },
    ]);
  });

  it("does not split elemental damage", () => {
    const pet = bonded();
    const events: CombatEvent[] = [];
    applyDamage(pet, 25, "fire", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "pet", amount: 25, critical: false }]);
    expect(redirected(pet)).toEqual([]);
  });

  it("comes after Reversal of Fortune, which negates the whole hit", () => {
    const pet = bonded();
    pet.health = 100;
    pet.statuses.apply("reversal-of-fortune", 8, "monk", NO_RANKS);
    applyDamage(pet, 25, "slashing", false, [], undefined);
    expect(pet.health).toBe(125);
    expect(redirected(pet)).toEqual([]);
  });
});

describe("Dark Bond's redirect (#1986)", () => {
  function bound(): Combatant {
    const necromancer = makeCombatant({ id: "n", team: 0 });
    necromancer.statuses.apply("dark-bond", 54, "n", NO_RANKS);
    necromancer.statuses.drainChanges();
    return necromancer;
  }

  function redirected(bearer: Combatant): unknown[] {
    return bearer.statuses.drainChanges().filter((change) => change.kind === "redirected-damage");
  }

  it("keeps 26 of a 101 fire hit and records 75, rounded down, for the closest minion", () => {
    const necromancer = bound();
    const events: CombatEvent[] = [];
    applyDamage(necromancer, 101, "fire", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "n", amount: 26, critical: false }]);
    expect(redirected(necromancer)).toEqual([
      { kind: "redirected-damage", toId: "n", amount: 75, toClosestMinion: true },
    ]);
  });

  it("splits a typeless hit, but never a share already redirected", () => {
    const necromancer = bound();
    applyDamage(necromancer, 100, "typeless", false, [], undefined);
    expect(redirected(necromancer)).toHaveLength(1);
    const events: CombatEvent[] = [];
    applyRedirectedDamage(necromancer, 75, events);
    expect(events).toEqual([{ kind: "damage", targetId: "n", amount: 75, critical: false }]);
    expect(redirected(necromancer)).toEqual([]);
  });

  it("gives way to a newer Symbiotic Bond on a physical hit, and keeps an elemental one", () => {
    const necromancer = bound();
    necromancer.statuses.apply("symbiotic-bond", 264, "ranger", NO_RANKS);
    necromancer.statuses.drainChanges();
    applyDamage(necromancer, 100, "slashing", false, [], undefined);
    expect(redirected(necromancer)).toEqual([
      { kind: "redirected-damage", toId: "ranger", amount: 50, toClosestMinion: false },
    ]);
    applyDamage(necromancer, 100, "fire", false, [], undefined);
    expect(redirected(necromancer)).toEqual([
      { kind: "redirected-damage", toId: "n", amount: 75, toClosestMinion: true },
    ]);
  });
});

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
    target.statuses.apply("deep-wound", 20, "caster", NO_RANKS);
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
    target.statuses.apply("deep-wound", 20, "caster", NO_RANKS);
    target.statuses.apply("regeneration", 20, "caster", NO_RANKS);
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

  it("never takes energy above upTo, and from above it neither gains nor loses (#1359)", () => {
    const gain: SkillEffect = { kind: "energy-gain", amount: { flat: 3 }, upTo: 22 };
    const below = makeCombatant({ id: "caster", energy: 20 });
    expect(applyEffect(gain, context(below))).toEqual([
      { kind: "energy-gain", targetId: "caster", amount: 2 },
    ]);
    expect(below.energy).toBe(22);
    const above = makeCombatant({ id: "caster", energy: 30 });
    expect(applyEffect(gain, context(above))).toEqual([]);
    expect(above.energy).toBe(30);
  });
});

describe("energy-gain to its target (#1485)", () => {
  it("fills the target's energy with toTarget, and the caster's without", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const target = makeCombatant({ id: "target", energy: 10 });
    expect(
      applyEffect(
        { kind: "energy-gain", amount: { flat: 2 }, toTarget: true },
        context(caster, target),
      ),
    ).toEqual([{ kind: "energy-gain", targetId: "target", amount: 2 }]);
    expect([caster.energy, target.energy]).toEqual([10, 12]);
    applyEffect({ kind: "energy-gain", amount: { flat: 2 } }, context(caster, target));
    expect([caster.energy, target.energy]).toEqual([12, 12]);
  });

  it("gives a target at full energy nothing, and none to its caster either", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const target = makeCombatant({ id: "target", energy: 50 });
    const gain: SkillEffect = { kind: "energy-gain", amount: { flat: 2 }, toTarget: true };
    expect(applyEffect(gain, context(caster, target))).toEqual([]);
    expect([caster.energy, target.energy]).toEqual([10, 50]);
  });
});

describe("a raised maximum (#1359)", () => {
  // Endure Pain at Strength 12: +258 (#1976).
  const STRENGTH_12: ReadonlyMap<string, number> = new Map([["warrior.strength", 12]]);

  it("raises health with the maximum as it lands, and a refresh raises nothing", () => {
    const c = makeCombatant({ id: "c", health: 480, maxHealth: 480 });
    applyStatus(c, "endure-pain", 16, "c", STRENGTH_12);
    expect(effectiveMaxHealth(c)).toBe(738);
    expect(c.health).toBe(738);
    applyStatus(c, "endure-pain", 16, "c", STRENGTH_12);
    expect(c.health).toBe(738);
  });

  it("with a Deep Wound, raises health no higher than the cut maximum", () => {
    const c = makeCombatant({ id: "c", health: 480, maxHealth: 480 });
    applyStatus(c, "deep-wound", 10, "a", NO_RANKS);
    expect(c.health).toBe(384);
    applyStatus(c, "endure-pain", 16, "c", STRENGTH_12);
    // 20% of 738 is past the cap: 638, not 384 + 258.
    expect(effectiveMaxHealth(c)).toBe(638);
    expect(c.health).toBe(638);
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

  it("heals perEnergyLost: 3 lost, 3 times the amount; none lost, no heal (#1627)", () => {
    const heal: SkillEffect = {
      kind: "heal",
      amount: { flat: 56 },
      recipient: "caster",
      perEnergyLost: true,
    };
    const caster = makeCombatant({ id: "caster", health: 100 });
    applyEffects([loss, heal], context(caster, makeCombatant({ id: "t", team: 1, energy: 3 })));
    expect(caster.health).toBe(100 + 3 * 56);
    const dry = makeCombatant({ id: "dry", health: 100 });
    applyEffects([loss, heal], context(dry, makeCombatant({ id: "t", team: 1, energy: 0 })));
    expect(dry.health).toBe(100);
  });

  it("an effect inside an `if` reads the ones before it there (#1627)", () => {
    const caster = makeCombatant({ id: "caster", energy: 0 });
    const target = makeCombatant({ id: "target", team: 1, energy: 3 });
    const events = applyEffects(
      [
        {
          kind: "if",
          condition: { kind: "target-health-above", fraction: 0 },
          effects: [loss, { kind: "energy-gain", amount: { flat: 2 }, perEnergyLost: true }],
        },
      ],
      context(caster, target),
    );
    expect(events).toContainEqual({ kind: "energy-gain", targetId: "caster", amount: 6 });
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

describe("life-steal effect (#935)", () => {
  const steal = (flat: number): UnconditionalEffect => ({ kind: "life-steal", amount: { flat } });

  it("takes from the target what the caster gains, armor or not", () => {
    const caster = makeCombatant({ id: "caster", health: 300 });
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("armor-boost", 10, "target", NO_RANKS);
    const events = applyEffect(steal(52), context(caster, target));
    expect(events).toEqual([
      { kind: "life-stolen", targetId: "target", amount: 52 },
      { kind: "heal", targetId: "caster", amount: 52 },
    ]);
    expect(target.health).toBe(448);
    expect(caster.health).toBe(352);
  });

  it("takes no more than the target has", () => {
    const caster = makeCombatant({ id: "caster", health: 300 });
    const target = makeCombatant({ id: "target", team: 1, health: 20 });
    const events = applyEffect(steal(39), context(caster, target));
    expect(events).toEqual([
      { kind: "life-stolen", targetId: "target", amount: 20 },
      { kind: "heal", targetId: "caster", amount: 20 },
      { kind: "death", targetId: "target" },
    ]);
    expect(target.dead).toBe(true);
    expect(caster.health).toBe(320);
  });

  it("still takes from the target when the caster is full, with no heal", () => {
    const caster = makeCombatant({ id: "caster", health: 490 });
    const target = makeCombatant({ id: "target", team: 1 });
    expect(applyEffect(steal(39), context(caster, target))).toEqual([
      { kind: "life-stolen", targetId: "target", amount: 39 },
      { kind: "heal", targetId: "caster", amount: 10 },
    ]);
    expect(applyEffect(steal(39), context(caster, target))).toEqual([
      { kind: "life-stolen", targetId: "target", amount: 39 },
    ]);
    expect(target.health).toBe(422);
  });

  it("is not a heal: deep wound does not shrink the gain", () => {
    const caster = makeCombatant({ id: "caster", health: 300 });
    caster.statuses.apply("deep-wound", 10, "target", NO_RANKS);
    const target = makeCombatant({ id: "target", team: 1 });
    applyEffect(steal(52), context(caster, target));
    expect(caster.health).toBe(352);
  });

  it("does nothing from a dead caster or to a dead target", () => {
    const deadCaster = makeCombatant({ id: "caster", health: 0, dead: true });
    const target = makeCombatant({ id: "target", team: 1 });
    expect(applyEffect(steal(39), context(deadCaster, target))).toEqual([]);
    expect(target.health).toBe(500);

    const caster = makeCombatant({ id: "caster", health: 300 });
    const deadTarget = makeCombatant({ id: "target", team: 1, health: 0, dead: true });
    expect(applyEffect(steal(39), context(caster, deadTarget))).toEqual([]);
    expect(caster.health).toBe(300);
  });

  it("is not physical damage: a Mark of Pain bearer records nothing", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("mark-of-pain", 30, "caster", NO_RANKS);
    applyEffect(steal(39), context(makeCombatant({ id: "caster", health: 300 }), target));
    expect(target.statuses.drainChanges()).toEqual([]);
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
    gwId: undefined,
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
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

  it("gives the caster its status once however many are hit, with itself as source (#1367)", () => {
    const caster = makeCombatant({ id: "caster" });
    const targets = ["a", "b", "c"].map((id) => makeCombatant({ id, team: 1 }));
    const events = applySkillEffects({
      surroundings: new Map(),
      skill: {
        ...skill,
        effects: [
          { kind: "damage", amount: { flat: 30 }, type: "cold", armorPenetration: 0 },
          { kind: "caster-gains-status", statusId: "ice-spear", durationSeconds: 5 },
        ],
      },
      caster,
      targets,
      rng: createRng(1),
      rules,
    });
    expect(
      events.filter((event) => event.kind === "status-applied").map((event) => event.targetId),
    ).toEqual(["caster"]);
    expect(caster.statuses.get("ice-spear")).toMatchObject({
      sourceId: "caster",
      remainingSeconds: 5,
    });
    for (const target of targets) {
      expect(target.statuses.has("ice-spear")).toBe(false);
    }
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

  it("interrupts only a spell with only: spell, not a chant (#1008)", () => {
    const spellOnly = [{ kind: "interrupt", only: "spell" }, ifInterrupted] as const;
    for (const skillId of [
      "elementalist.fireball",
      "mesmer.backfire",
      "monk.guardian",
      "ritualist.weapon-of-warding",
    ]) {
      const foe = casting(skillId);
      run(spellOnly, foe);
      expect(foe.cast.isCasting, skillId).toBe(false);
      expect(foe.health, skillId).toBe(470);
    }
    for (const skillId of ["paragon.anthem-of-flame", "warrior.healing-signet"]) {
      const foe = casting(skillId);
      const events = run(spellOnly, foe);
      expect(foe.cast.isCasting, skillId).toBe(true);
      expect(events, skillId).toEqual([
        { kind: "interrupt-missed", targetId: "target", refusedSkillId: skillId },
      ]);
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
    enchanted.statuses.apply("guardian", 10, "ally", NO_RANKS);
    run([strip, ifRemoved], enchanted);
    expect(enchanted.health).toBe(470);

    const conditioned = makeCombatant({ id: "target", team: 1 });
    conditioned.statuses.apply("bleeding", 10, "foe", NO_RANKS);
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
      gwId: undefined,
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
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
      corpse: undefined,
      companion: undefined,
      petAttack: undefined,
      projectile: undefined,
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }, ifRemoved],
    };
    const caster = makeCombatant({ id: "caster", energy: 10 });
    const [a, b, c] = ["a", "b", "c"].map((id) => makeCombatant({ id, team: 1 }));
    if (a === undefined || b === undefined || c === undefined) throw new Error("no targets");
    a.statuses.apply("guardian", 10, "ally", NO_RANKS);
    c.statuses.apply("regeneration", 10, "ally", NO_RANKS);

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
  const heal = (flat: number): UnconditionalEffect => ({
    kind: "heal",
    amount: { flat },
  });
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
    wounded.statuses.apply("deep-wound", 20, "caster", NO_RANKS);
    const below = healIf({ kind: "target-health-below", fraction: 0.5 });
    expect(healed(below, at(100), wounded)).toBe(110 * 0.8);
    const notBelow = at(210);
    notBelow.statuses.apply("deep-wound", 20, "caster", NO_RANKS);
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
    hexed.statuses.apply("malaise", 10, "foe", NO_RANKS);
    const enchanted = at(100, "caster");
    enchanted.statuses.apply("regeneration", 10, "caster", NO_RANKS);
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

  it("target-less-health: the target's health below the caster's, absolute; equal is not less (#939)", () => {
    const less = healIf({ kind: "target-less-health" });
    expect(healed(less, at(300, "caster"), at(299))).toBe(110);
    expect(healed(less, at(300, "caster"), at(300))).toBe(10);
    // A share would say 50% of 1000 is less than 80% of 500: health is absolute.
    const big = makeCombatant({ id: "target", health: 500, maxHealth: 1000 });
    expect(healed(less, at(400, "caster"), big)).toBe(10);
  });

  it("target-knocked-down: holds while knockdown remains, not at 0 (#985)", () => {
    const down = healIf({ kind: "target-knocked-down" });
    const knocked = (remaining: number): Combatant => {
      const target = at(100);
      target.knockdownRemaining = remaining;
      return target;
    };
    expect(healed(down, at(100, "caster"), knocked(0.1))).toBe(110);
    expect(healed(down, at(100, "caster"), knocked(0))).toBe(10);
    // The caster being down is not read.
    const downCaster = at(100, "caster");
    downCaster.knockdownRemaining = 2;
    expect(healed(down, downCaster, knocked(0))).toBe(10);
  });

  it("target-moving: holds for a target that walked last tick, not the caster (#997)", () => {
    const moving = healIf({ kind: "target-moving" });
    const walking = (id: string): Combatant => {
      const combatant = at(100, id);
      combatant.moving = true;
      return combatant;
    };
    expect(healed(moving, at(100, "caster"), walking("target"))).toBe(110);
    expect(healed(moving, at(100, "caster"), at(100))).toBe(10);
    expect(healed(moving, walking("caster"), at(100))).toBe(10);
  });

  it("target-has-status / target-lacks-status: read that one status on the target (#997)", () => {
    const has = (statusId: StatusId) => healIf({ kind: "target-has-status", statusId });
    const lacks = (statusId: StatusId) => healIf({ kind: "target-lacks-status", statusId });
    const bearing = (statusId: StatusId): Combatant => {
      const target = at(100);
      target.statuses.apply(statusId, 10, "caster", NO_RANKS);
      return target;
    };
    for (const statusId of ["burning", "weakness"] as const) {
      expect(healed(has(statusId), at(100, "caster"), bearing(statusId))).toBe(110);
      expect(healed(has(statusId), at(100, "caster"), at(100))).toBe(10);
      expect(healed(lacks(statusId), at(100, "caster"), bearing(statusId))).toBe(10);
      expect(healed(lacks(statusId), at(100, "caster"), at(100))).toBe(110);
    }
    // Another condition is not this one.
    expect(healed(has("burning"), at(100, "caster"), bearing("bleeding"))).toBe(10);
    expect(healed(lacks("burning"), at(100, "caster"), bearing("bleeding"))).toBe(110);
    // The caster's own status is not read.
    const burningCaster = bearing("burning");
    expect(healed(has("burning"), burningCaster, at(100, "other"))).toBe(10);
  });

  it("caster-wields: the caster's main hand is of the class, the target's is not read (#939)", () => {
    const holding = (weapon: Weapon, id: string): Combatant =>
      makeCombatant({
        id,
        health: 100,
        maxHealth: 500,
        equipment: {
          ...unarmedResolvedEquipment(rules.armorReferenceLevel),
          mainHand: {
            weapon,
            attributeId: undefined,
            damageType: "slashing",
            requirementMet: true,
            creatureDamageScale: undefined,
          },
        },
      });
    const scythe = healIf({ kind: "caster-wields", weapon: "scythe" });
    expect(healed(scythe, holding(WEAPONS.scythe, "caster"), at(100))).toBe(110);
    expect(
      healed(scythe, holding(WEAPONS.sword, "caster"), holding(WEAPONS.scythe, "target")),
    ).toBe(10);
    const melee = healIf({ kind: "caster-wields", weapon: "melee" });
    expect(healed(melee, holding(WEAPONS.sword, "caster"), at(100))).toBe(110);
    expect(healed(melee, holding(WEAPONS.flatbow, "caster"), at(100))).toBe(10);
  });

  it("is read per target", () => {
    const skill: Skill = {
      id: "test.word",
      name: "Word",
      type: "spell",
      gwId: undefined,
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
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
      corpse: undefined,
      companion: undefined,
      petAttack: undefined,
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
    health: {
      kind: "percent",
      percent: { scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 56 } },
    },
    energyPercent: { scaling: { attributeId: "monk.healing-prayers", atZero: 42, atTwelve: 80 } },
    perPartyMemberWithin: undefined,
    at: "corpse",
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
    applyStatus(target, "bleeding", 10, "foe", NO_RANKS);
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
    gwId: undefined,
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects,
  });
  const dervish = (): Combatant => {
    const caster = makeCombatant({ id: "caster" });
    caster.statuses.apply("mystic-regeneration", 10, "caster", NO_RANKS);
    caster.statuses.apply("fleeting-stability", 10, "caster", NO_RANKS);
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
    targets[0]?.statuses.apply("mystic-regeneration", 10, "a", NO_RANKS);
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
    caster.statuses.apply("guardian", 10, "monk", NO_RANKS);
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
    target.statuses.apply("guardian", 10, "a", NO_RANKS);
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
    target.statuses.apply("fleeting-stability", 9, "target", NO_RANKS);
    expect(
      applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target)),
    ).toEqual([{ kind: "status-removed", targetId: "target", statusId: "fleeting-stability" }]);
    expect(target.knockdownRemaining).toBe(0);

    applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target));
    expect(target.knockdownRemaining).toBe(2);
  });

  it("still stops one landing on the tick it would run out", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("fleeting-stability", 0.05, "target", NO_RANKS);
    applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target));
    expect(target.knockdownRemaining).toBe(0);
  });

  it("is not spent on someone already down", () => {
    const target = makeCombatant({ id: "target", team: 1, knockdownRemaining: 1 });
    target.statuses.apply("fleeting-stability", 9, "target", NO_RANKS);
    expect(
      applyEffect({ kind: "knockdown", durationSeconds: 2 }, context(undefined, target)),
    ).toEqual([]);
    expect(target.statuses.has("fleeting-stability")).toBe(true);
  });
});

describe("lengthen-recharge (#949)", () => {
  const effect = {
    kind: "lengthen-recharge",
    of: "target-last-skill",
    seconds: { flat: 47 },
  } as const;

  it("lengthens the skill its target just used", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    expect(
      applyEffect(effect, {
        ...context(undefined, target),
        usedSkill: { skillId: "skill.a", key: "skill.a" },
      }),
    ).toEqual([
      { kind: "recharge-lengthened", targetId: "target", skillId: "skill.a", seconds: 47 },
    ]);
    expect(target.cast.rechargeRemaining.get("skill.a")).toBe(47);
  });

  it("does nothing without a skill just used", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    expect(applyEffect(effect, context(undefined, target))).toEqual([]);
    expect(target.cast.rechargeRemaining.size).toBe(0);
  });

  describe("of this skill (#1519)", () => {
    const censure = getSkill("monk.word-of-censure");
    const resolve = (health: number) => {
      if (censure === undefined) {
        throw new Error("missing skill");
      }
      const caster = makeCombatant({ id: "caster" });
      const target = makeCombatant({ id: "target", team: 1, health, maxHealth: 1000 });
      return {
        caster,
        outcome: resolveSkillEffects({
          surroundings: new Map(),
          skill: censure,
          caster,
          targets: [target],
          rng: createRng(1),
          rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
        }),
      };
    };

    it("lengthens the resolving skill's recharge once, for its starter to add", () => {
      const { caster, outcome } = resolve(400);
      expect(outcome.rechargeLongerSeconds).toBe(20);
      expect(outcome.events).toContainEqual({
        kind: "recharge-lengthened",
        targetId: "caster",
        skillId: "monk.word-of-censure",
        seconds: 20,
      });
      // Nothing recharges yet: the recharge it lengthens starts after.
      expect(caster.cast.rechargeRemaining.size).toBe(0);
    });

    it("reads the health before the damage: at 60% nothing", () => {
      expect(resolve(600).outcome.rechargeLongerSeconds).toBe(0);
    });

    it("does nothing applied on its own, outside a resolution", () => {
      const target = makeCombatant({ id: "target", team: 1 });
      expect(
        applyEffect(
          { kind: "lengthen-recharge", of: "this-skill", seconds: { flat: 20 } },
          { ...context(undefined, target), usedSkill: { skillId: "skill.a", key: "skill.a" } },
        ),
      ).toEqual([]);
      expect(target.cast.rechargeRemaining.size).toBe(0);
    });
  });
});

describe("an invulnerable target (#1208)", () => {
  const invulnerable = (): Combatant =>
    makeCombatant({ id: "target", team: 1, invulnerableRemaining: 3 });

  it("takes no damage, and says it is invulnerable once (#1233)", () => {
    const target = invulnerable();
    const events: CombatEvent[] = [];
    applyDamage(target, 120, "fire", false, events, undefined);
    expect(events).toEqual([{ kind: "invulnerable", targetId: "target" }]);
    expect(target.health).toBe(target.maxHealth);
  });

  it("has no life stolen, and its stealer gains none", () => {
    const caster = makeCombatant({ id: "caster", health: 300 });
    const target = invulnerable();
    expect(
      applyEffect({ kind: "life-steal", amount: { flat: 40 } }, context(caster, target)),
    ).toEqual([{ kind: "invulnerable", targetId: "target" }]);
    expect(target.health).toBe(target.maxHealth);
    expect(caster.health).toBe(300);
  });

  it("refuses a hex and a condition, and takes any other status", () => {
    const target = invulnerable();
    expect(applyStatus(target, "malaise", 10, "caster", NO_RANKS)).toBeUndefined();
    expect(applyStatus(target, "deep-wound", 10, "caster", NO_RANKS)).toBeUndefined();
    expect(target.statuses.has("malaise") || target.statuses.has("deep-wound")).toBe(false);
    expect(applyStatus(target, "armor-boost", 10, "caster", NO_RANKS)).toBe(0);
    expect(target.statuses.has("armor-boost")).toBe(true);
  });

  it("says it is invulnerable once for a hex a skill puts on it, and gains none (#1233)", () => {
    const target = invulnerable();
    const events = applyEffect(
      { kind: "apply-status", statusId: "malaise", durationSeconds: 10 },
      context(makeCombatant({ id: "caster" }), target),
    );
    expect(events).toEqual([{ kind: "invulnerable", targetId: "target" }]);
    expect(target.statuses.has("malaise")).toBe(false);
  });

  it("is healed by an ally as ever, and says nothing of invulnerability (#1233)", () => {
    const ally = makeCombatant({ id: "target", team: 0, health: 100, invulnerableRemaining: 3 });
    const events = applyEffect(
      { kind: "heal", amount: { flat: 50 } },
      context(makeCombatant({ id: "caster" }), ally),
    );
    expect(events.some(({ kind }) => kind === "invulnerable")).toBe(false);
    expect(ally.health).toBe(150);
  });
});

describe("removing by what an earlier removal took (#1205)", () => {
  const stripAll = {
    kind: "remove-status",
    category: "enchantment",
    count: "all",
    from: "caster",
  } as const;
  const hexPerEnchantment = (max: number) =>
    ({
      kind: "remove-status",
      category: "hex",
      count: 0,
      from: "caster",
      perRemoved: { category: "enchantment", max: { flat: max } },
    }) as const;
  const healPerEnchantment = {
    kind: "heal",
    amount: { flat: 50 },
    perRemoved: "enchantment",
  } as const;

  function enchantedAndHexed(enchantments: readonly StatusId[]): SkillContext {
    const caster = makeCombatant({ id: "caster", health: 100, maxHealth: 1000 });
    for (const id of enchantments) {
      caster.statuses.apply(id, 30, "caster", NO_RANKS);
    }
    for (const id of ["malaise", "faintheartedness", "empathy"] as const) {
      caster.statuses.apply(id, 30, "foe", NO_RANKS);
    }
    return context(caster, caster);
  }

  const removed = (events: readonly CombatEvent[], category: string) =>
    events.filter(
      (event) =>
        event.kind === "status-removed" &&
        getStatusDefinition(event.statusId).category === category,
    ).length;

  it('takes every status of its category with count "all"', () => {
    const ctx = enchantedAndHexed(["guardian", "armor-boost", "vow-of-strength"]);
    const events = applyEffects([stripAll], ctx);
    expect(removed(events, "enchantment")).toBe(3);
    expect(ctx.caster.statuses.countByCategory("enchantment")).toBe(0);
  });

  it("takes one for each status an earlier removal took, its count ignored", () => {
    const ctx = enchantedAndHexed(["guardian", "armor-boost"]);
    const events = applyEffects([stripAll, hexPerEnchantment(7)], ctx);
    expect(removed(events, "hex")).toBe(2);
    expect(ctx.caster.statuses.countByCategory("hex")).toBe(1);
  });

  it("takes no more than its maximum", () => {
    const ctx = enchantedAndHexed(["guardian", "armor-boost", "vow-of-strength"]);
    const events = applyEffects([stripAll, hexPerEnchantment(1)], ctx);
    expect(removed(events, "hex")).toBe(1);
  });

  it("takes none, and heals none, when the earlier removal took nothing", () => {
    const ctx = enchantedAndHexed([]);
    const events = applyEffects([stripAll, healPerEnchantment, hexPerEnchantment(7)], ctx);
    expect(events).toEqual([]);
    expect(ctx.caster.statuses.countByCategory("hex")).toBe(3);
  });

  it("heals once, for each status the earlier removal took", () => {
    const ctx = enchantedAndHexed(["guardian", "armor-boost"]);
    const events = applyEffects([stripAll, healPerEnchantment], ctx);
    expect(events.filter((event) => event.kind === "heal")).toEqual([
      { kind: "heal", targetId: "caster", amount: 100 },
    ]);
  });
});

describe("spread-conditions (#1501)", () => {
  const spread = { kind: "spread-conditions", radius: AREA_ADJACENT } as const;

  /** `target` at the origin with bleeding 4 s and crippled 2 s; who stands where. */
  function scene() {
    const caster = makeCombatant({ id: "caster", team: 0 });
    const target = makeCombatant({ id: "target", team: 1 });
    const adjacent = makeCombatant({ id: "adjacent", team: 1 });
    const beyond = makeCombatant({ id: "beyond", team: 1 });
    const friend = makeCombatant({ id: "friend", team: 0 });
    target.statuses.apply("bleeding", 4, "x", NO_RANKS);
    target.statuses.apply("crippled", 2, "x", NO_RANKS);
    target.statuses.apply("barbs", 10, "x", NO_RANKS);
    const at = (combatant: Combatant, x: number) =>
      [
        combatant.id,
        { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
      ] as const;
    const ctx: SkillContext = {
      ...context(caster, target),
      surroundings: new Map([
        at(caster, -200),
        at(target, 0),
        at(adjacent, AREA_ADJACENT),
        at(beyond, AREA_ADJACENT + 1),
        at(friend, 10),
      ]),
    };
    return { ctx, target, adjacent, beyond, friend };
  }

  const left = (combatant: Combatant, id: StatusId) =>
    combatant.statuses.active.find((status) => status.id === id)?.remainingSeconds;

  it("copies every condition with the time it has left onto adjacent foes, and the target keeps its own", () => {
    const { ctx, target, adjacent, beyond, friend } = scene();
    applyEffect(spread, ctx);
    expect(left(adjacent, "bleeding")).toBe(4);
    expect(left(adjacent, "crippled")).toBe(2);
    // A hex is no condition.
    expect(adjacent.statuses.has("barbs")).toBe(false);
    expect(left(target, "bleeding")).toBe(4);
    expect(left(target, "crippled")).toBe(2);
    expect(beyond.statuses.active).toEqual([]);
    expect(friend.statuses.active).toEqual([]);
    expect(adjacent.statuses.active.every(({ sourceId }) => sourceId === "caster")).toBe(true);
  });

  it("a longer one already on a foe wins", () => {
    const { ctx, adjacent } = scene();
    adjacent.statuses.apply("bleeding", 8, "x", NO_RANKS);
    applyEffect(spread, ctx);
    expect(left(adjacent, "bleeding")).toBe(8);
    expect(left(adjacent, "crippled")).toBe(2);
  });

  it("a target with no conditions spreads nothing", () => {
    const { ctx, target, adjacent } = scene();
    target.statuses.removeByCategory("condition", 2);
    expect(applyEffect(spread, ctx)).toEqual([]);
    expect(adjacent.statuses.active).toEqual([]);
  });
});

describe("uninterruptible and skill armor penetration (#1464)", () => {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1.combat;

  /** A foe 1 s into casting Troll Unguent, which takes 3 s. */
  function casting(): Combatant {
    const foe = makeCombatant({ id: "target", team: 1 });
    foe.cast.beginCast("ranger.troll-unguent", foe.id, 3, undefined);
    return foe;
  }

  it("refuses an interrupt, and the rest of the skill still lands", () => {
    const foe = casting();
    foe.statuses.apply("tranquil-was-tanasen", 17, "target", NO_RANKS);
    const events = applyEffects(
      [
        { kind: "interrupt" },
        { kind: "damage", amount: { flat: 30 }, type: "typeless", armorPenetration: 0 },
      ],
      { ...context(undefined, foe), rules },
    );
    expect(foe.cast.activeCast?.skillId).toBe("ranger.troll-unguent");
    expect(events.some((event) => event.kind === "interrupted")).toBe(false);
    expect(foe.health).toBe(470);
  });

  /** What `amount` lightning damage takes off a fresh foe, from a caster holding Cruel's ashes. */
  function lightning(armorPenetration: number, profession: SkillContext["profession"]): number {
    const caster = makeCombatant({ id: "caster" });
    caster.statuses.apply("cruel-was-daoshen", 51, "caster", NO_RANKS);
    const foe = makeCombatant({ id: "target", team: 1 });
    applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "lightning", armorPenetration },
      { ...context(caster, foe), profession },
    );
    return 500 - foe.health;
  }

  /** The same, from a caster holding nothing. */
  function plain(armorPenetration: number): number {
    const foe = makeCombatant({ id: "target", team: 1 });
    applyEffect(
      { kind: "damage", amount: { flat: 100 }, type: "lightning", armorPenetration },
      context(undefined, foe),
    );
    return 500 - foe.health;
  }

  it("adds Cruel's 10% to a Ritualist skill's damage, on top of its own", () => {
    expect(lightning(0, "ritualist")).toBe(plain(0.1));
    expect(lightning(0.25, "ritualist")).toBe(plain(0.35));
  });

  it("adds nothing to another profession's skill, or to what is no skill's", () => {
    expect(lightning(0.25, "elementalist")).toBe(plain(0.25));
    expect(lightning(0, undefined)).toBe(plain(0));
  });
});

describe("off-hand chain-mark and overcast (#1580)", () => {
  it("an off-hand chain-mark lets a dual attack follow, and a lead does not", () => {
    const dual = getSkill("assassin.death-blossom");
    if (dual === undefined) {
      throw new Error("missing assassin.death-blossom");
    }
    const ctx = context();
    applyEffect({ kind: "chain-mark", role: "lead" }, ctx);
    expect(chainAllows(ctx.caster, dual, "target")).toBe(false);
    applyEffect({ kind: "chain-mark", role: "off-hand" }, ctx);
    expect(ctx.caster.chainMarks.get("target")?.role).toBe("off-hand");
    expect(chainAllows(ctx.caster, dual, "target")).toBe(true);
  });

  it("overcast lowers the target's ceiling and takes the energy above it", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    const ctx = context(undefined, target);
    applyEffect({ kind: "overcast", amount: { flat: 10 } }, ctx);
    expect(target.overcast).toBe(10);
    expect(effectiveMaxEnergy(target)).toBe(40);
    expect(target.energy).toBe(40);
    expect(ctx.caster.overcast).toBe(0);
  });
});

describe("perUsedSkillEnergy (#1614)", () => {
  const share = (usedSkill: SkillContext["usedSkill"]): CombatEvent[] => {
    const caster = makeCombatant({ id: "caster" });
    caster.energy = 0;
    caster.health = 1;
    return applyEffects(
      [
        { kind: "energy-gain", amount: { flat: 0.3 }, perUsedSkillEnergy: true },
        {
          kind: "heal",
          amount: { flat: 3.6 },
          recipient: "caster",
          perUsedSkillEnergy: true,
        },
      ],
      { ...context(caster), usedSkill },
    );
  };

  it("is the share of the used skill's base energy cost, rounded half up", () => {
    // Flare's 5: 1.5 is 2 energy, 18 Health; Searing Flames' 15: 4.5 is 5.
    expect(share({ skillId: "elementalist.flare", key: "elementalist.flare" })).toEqual([
      { kind: "energy-gain", targetId: "caster", amount: 2 },
      { kind: "heal", targetId: "caster", amount: 18 },
    ]);
    expect(
      share({ skillId: "elementalist.searing-flames", key: "elementalist.searing-flames" })[0],
    ).toEqual({ kind: "energy-gain", targetId: "caster", amount: 5 });
  });

  it("gives nothing without a used skill, or for one with no energy cost", () => {
    expect(share(undefined)).toEqual([]);
    expect(share({ skillId: "warrior.cleave", key: "warrior.cleave" })).toEqual([]);
  });
});
