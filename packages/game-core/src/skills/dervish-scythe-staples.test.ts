import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import { moveSpeedMultiplier } from "./tick.js";
import { fireTriggers, type FiredTrigger } from "./triggers.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { attackHitRiders, resolveSwing } from "./weapon-attack.js";

/**
 * The Dervish scythe staples (#939): Vow of Strength, Sand Shards, Pious
 * Haste and Victorious Sweep, each on a scripted Dervish among scripted
 * foes. Every combatant wears reference armor, so a splash lands for
 * exactly its stated amount.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.earth-prayers", 12],
  ["dervish.mysticism", 12],
]);
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function dervish(weapon: Weapon = WEAPONS.scythe, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({
    id: "dervish",
    attributeRanks: RANKS,
    equipment: wielding(
      weapon,
      weapon === WEAPONS.scythe ? "dervish.scythe-mastery" : "warrior.swordsmanship",
    ),
    ...overrides,
  });
}

function foe(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000, ...overrides });
}

function around(...placed: readonly [Combatant, Vec2][]): Surroundings {
  return new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `user` pays for `skillId` and it lands on `targets`. */
function use(user: Combatant, skillId: string, ...targets: Combatant[]): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

function damageTo(events: readonly CombatEvent[]): Record<string, number[]> {
  const dealt: Record<string, number[]> = {};
  for (const event of events) {
    if (event.kind === "damage") {
      (dealt[event.targetId] ??= []).push(event.amount);
    }
  }
  return dealt;
}

describe("Vow of Strength (#939)", () => {
  /** The Dervish attacks: every trigger on it answers, as the simulation fires them. */
  function attacks(bearer: Combatant, surroundings: Surroundings): CombatEvent[] {
    return fireTriggers(
      bearer,
      "bearer-attacks",
      {
        sourceOf: (id) => surroundings.get(id)?.combatant,
        rng: createRng(1),
        rules: RULES,
        surroundings,
        usedSkill: undefined,
      },
      new Set(),
    ).flatMap(({ events }) => events);
  }

  it("is an elite 15 s enchantment the Dervish casts on itself", () => {
    const self = dervish();
    use(self, "dervish.vow-of-strength", self);
    expect(skill("dervish.vow-of-strength").elite).toBe(true);
    expect(self.statuses.get("vow-of-strength")?.remainingSeconds).toBe(15);
  });

  it("with a scythe, each attack deals 22 slashing to every adjacent foe, its target included", () => {
    const self = dervish();
    self.statuses.apply("vow-of-strength", 15, "dervish", NO_RANKS);
    const target = foe("target");
    const beside = foe("beside");
    const far = foe("far");
    const ally = makeCombatant({ id: "ally", team: 0 });
    const surroundings = around(
      [self, vec2(0, 0)],
      [target, vec2(40, 0)],
      [beside, vec2(0, -30)],
      [far, vec2(100, 0)],
      [ally, vec2(10, 0)],
    );
    expect(damageTo(attacks(self, surroundings))).toEqual({ target: [22], beside: [22] });
    expect(damageTo(attacks(self, surroundings))).toEqual({ target: [22], beside: [22] });
    expect(far.health).toBe(1000);
    expect(ally.health).toBe(ally.maxHealth);
  });

  it("with a sword, an attack deals nothing", () => {
    const self = dervish(WEAPONS.sword);
    self.statuses.apply("vow-of-strength", 15, "dervish", NO_RANKS);
    const target = foe("target");
    expect(attacks(self, around([self, vec2(0, 0)], [target, vec2(40, 0)]))).toEqual([]);
    expect(target.health).toBe(1000);
  });
});

describe("Sand Shards (#939)", () => {
  it("is a 30 s flash enchantment on the Dervish", () => {
    const self = dervish();
    use(self, "dervish.sand-shards", self);
    expect(skill("dervish.sand-shards").activationSeconds).toBe(0);
    expect(self.statuses.get("sand-shards")?.remainingSeconds).toBe(30);
    expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(4);
    expect(describeStatus("sand-shards")).toContain("ends after 4 hits with a scythe");
  });

  it("four scythe hits splash 50 earth on the foe beside the one hit, then it ends", () => {
    const self = dervish();
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const target = foe("target");
    const beside = foe("beside");
    const surroundings = around([self, vec2(0, 0)], [target, vec2(40, 0)], [beside, vec2(40, 30)]);
    /** One hit: the splash, under Sand Shards' own name, and what ended. */
    const hit = (): { fired: FiredTrigger[]; ended: CombatEvent[] } => {
      const fired: FiredTrigger[] = [];
      const ended = attackHitRiders(
        self,
        target,
        self.equipment.mainHand,
        false,
        0,
        createRng(1),
        RULES,
        surroundings,
        fired,
        [],
      );
      return { fired, ended };
    };
    const splash = (fired: readonly FiredTrigger[]) =>
      fired.map(({ sourceId, skillId, events }) => ({
        sourceId,
        skillId,
        dealt: damageTo(events),
      }));
    for (let count = 1; count <= 3; count += 1) {
      expect(splash(hit().fired)).toEqual([
        { sourceId: "dervish", skillId: "dervish.sand-shards", dealt: { beside: [50] } },
      ]);
      expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(4 - count);
    }
    const fourth = hit();
    expect(splash(fourth.fired)).toEqual([
      { sourceId: "dervish", skillId: "dervish.sand-shards", dealt: { beside: [50] } },
    ]);
    expect(fourth.ended).toEqual([
      { kind: "status-expired", targetId: "dervish", statusId: "sand-shards" },
    ]);
    expect(self.statuses.has("sand-shards")).toBe(false);
    expect(hit()).toEqual({ fired: [], ended: [] });
    expect(beside.health).toBe(1000 - 4 * 50);
    expect(target.health).toBe(1000);
  });

  it("a sword hit splashes nothing and spends nothing", () => {
    const self = dervish(WEAPONS.sword);
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const target = foe("target");
    const surroundings = around(
      [self, vec2(0, 0)],
      [target, vec2(40, 0)],
      [foe("beside"), vec2(40, 30)],
    );
    const fired: FiredTrigger[] = [];
    expect(
      attackHitRiders(
        self,
        target,
        self.equipment.mainHand,
        false,
        0,
        createRng(1),
        RULES,
        surroundings,
        fired,
        [],
      ),
    ).toEqual([]);
    expect(fired).toEqual([]);
    expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(4);
  });

  it("a swing that cleaves three foes spends three hits", () => {
    const self = dervish();
    self.statuses.apply("sand-shards", 30, "dervish", NO_RANKS);
    const target = foe("target");
    const surroundings = around(
      [self, vec2(0, 0)],
      [target, vec2(40, 0)],
      [foe("near"), vec2(40, 10)],
      [foe("mid"), vec2(40, -20)],
    );
    resolveSwing({
      attacker: self,
      target: { combatant: target, position: vec2(40, 0), creature: undefined },
      surroundings,
      rng: createRng(5),
      rules: RULES,
      exposed: NOWHERE,
    });
    expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(1);
  });

  it("a recast resets its hits to 4", () => {
    const self = dervish();
    // A second into it: the recast's 30 s is the longer.
    self.statuses.apply("sand-shards", 29, "dervish", NO_RANKS);
    const target = foe("target");
    const surroundings = around([self, vec2(0, 0)], [target, vec2(40, 0)]);
    attackHitRiders(
      self,
      target,
      self.equipment.mainHand,
      false,
      0,
      createRng(1),
      RULES,
      surroundings,
      [],
      [],
    );
    expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(3);
    use(self, "dervish.sand-shards", self);
    expect(self.statuses.get("sand-shards")?.hitsLeft).toBe(4);
  });
});

describe("Pious Haste (#939)", () => {
  it("without a Dervish enchantment: 25% faster for 6 s", () => {
    const self = dervish();
    use(self, "dervish.pious-haste", self);
    expect(self.statuses.get("pious-haste")?.remainingSeconds).toBe(6);
    expect(self.statuses.has("pious-haste-run")).toBe(false);
    expect(moveSpeedMultiplier(self)).toBe(1.25);
  });

  it("with Vow of Strength up: Vow goes, and the Dervish runs 50% faster", () => {
    const self = dervish();
    self.statuses.apply("vow-of-strength", 15, "dervish", NO_RANKS);
    use(self, "dervish.pious-haste", self);
    expect(self.statuses.has("vow-of-strength")).toBe(false);
    expect(self.statuses.has("pious-haste")).toBe(false);
    expect(self.statuses.get("pious-haste-run")?.remainingSeconds).toBe(6);
    expect(aggregateModifiers(self.statuses.active).moveSpeedMultiplier).toBe(1.5);
    // ADR-0019's clamp, as Dash's 50% meets it.
    expect(moveSpeedMultiplier(self)).toBe(1.33);
  });
});

describe("Victorious Sweep (#939)", () => {
  it("is a melee attack of +21", () => {
    expect(skill("dervish.victorious-sweep").attack?.weapon).toBe("melee");
  });

  it("against a target with less health, the Dervish gains 70", () => {
    const self = dervish(WEAPONS.scythe, { health: 300 });
    const events = use(self, "dervish.victorious-sweep", foe("target", { health: 200 }));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "heal", targetId: "dervish", amount: 70 }),
    );
    expect(self.health).toBe(370);
  });

  it("against a target with more health or the same, nothing", () => {
    for (const health of [300, 1000]) {
      const self = dervish(WEAPONS.scythe, { health: 300 });
      expect(use(self, "dervish.victorious-sweep", foe("target", { health }))).toEqual([]);
      expect(self.health).toBe(300);
    }
  });
});
