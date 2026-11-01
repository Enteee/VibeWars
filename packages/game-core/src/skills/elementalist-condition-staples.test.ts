import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import type { StatusId } from "./status.js";
import { resolveTargets, type TargetCandidate } from "./targeting.js";
import { makeCombatant } from "./testing.js";
import { KNOCKDOWN_SECONDS, type Combatant, type RadiusArea, type Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * The Elementalist condition staples (#997): Water Trident, Searing
 * Flames, Ebon Hawk and Stoning, each landed on a scripted foe. The
 * projectiles in flight, and one skill setting up the next, are
 * `match/elementalist-conditions.test.ts`'s.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["elementalist.water-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.fire-magic", 12],
]);
const WATER_TRIDENT = "elementalist.water-trident";
const SEARING_FLAMES = "elementalist.searing-flames";
const EBON_HAWK = "elementalist.ebon-hawk";
const STONING = "elementalist.stoning";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A skill's area, which these all centre in a radius, never the party (#1013). */
function radiusArea(id: string): RadiusArea {
  const area = skill(id).area;
  if (area === undefined || area.origin === "party") {
    throw new Error(`${id} hits no radius area`);
  }
  return area;
}

function caster(): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 30 });
}

function foe(id = "foe", overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000, ...overrides });
}

function at(combatant: Combatant, position: Vec2): TargetCandidate {
  return { combatant, position, creature: undefined };
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

/** What `amount` of `type` damage at no armor penetration does to `victim`. */
function elemental(amount: number, type: "cold" | "earth" | "fire", victim: Combatant): number {
  return mitigate(skillDamage(amount, type, 0), victim, RULES, "chest", createRng(1));
}

function remaining(combatant: Combatant, statusId: StatusId): number | undefined {
  return combatant.statuses.active.find(({ id }) => id === statusId)?.remainingSeconds;
}

describe("Water Trident (#997)", () => {
  it("is an elite 5 e, 1 s, 3 s Water Magic projectile at up to three foes", () => {
    const trident = skill(WATER_TRIDENT);
    expect([
      trident.elite,
      trident.type,
      trident.cost,
      trident.activationSeconds,
      trident.rechargeSeconds,
      radiusArea(WATER_TRIDENT).radius,
      radiusArea(WATER_TRIDENT).maxTargets,
    ]).toEqual([true, "spell", { kind: "energy", amount: 5 }, 1, 3, AREA_ADJACENT, 3]);
    expect(trident.projectile).toBeDefined();
  });

  it("strikes a standing foe for 74 cold and leaves it up", () => {
    const target = foe();
    use(caster(), WATER_TRIDENT, target);
    expect(target.health).toBe(1000 - elemental(74, "cold", target));
    expect(target.knockdownRemaining).toBe(0);
  });

  it("knocks down each moving foe it strikes, and only those", () => {
    const first = foe("first", { moving: true });
    const second = foe("second", { moving: true });
    const still = foe("still");
    use(caster(), WATER_TRIDENT, first, second, still);
    for (const struck of [first, second, still]) {
      expect(struck.health).toBe(1000 - elemental(74, "cold", struck));
    }
    expect([first, second, still].map(({ knockdownRemaining }) => knockdownRemaining)).toEqual([
      KNOCKDOWN_SECONDS,
      KNOCKDOWN_SECONDS,
      0,
    ]);
  });

  it("reaches its target and the nearest two adjacent foes, not a fourth or one beyond", () => {
    const elementalist = caster();
    const target = foe("target");
    const near = foe("near");
    const nearer = foe("nearer");
    const fourth = foe("fourth");
    const beyond = foe("beyond");
    const targets = resolveTargets({
      skill: skill(WATER_TRIDENT),
      caster: elementalist,
      casterPosition: vec2(0, 0),
      primary: at(target, vec2(300, 0)),
      candidates: [
        at(near, vec2(300, 20)),
        at(nearer, vec2(300, -10)),
        at(fourth, vec2(300 + AREA_ADJACENT, 0)),
        at(beyond, vec2(300 - AREA_ADJACENT - 1, 0)),
      ],
      losBlockers: [],
    });
    expect(targets.map(({ id }) => id)).toEqual(["target", "nearer", "near"]);
  });

  it("against Fleeting Stability: no knockdown, the damage lands", () => {
    const target = foe("foe", { moving: true });
    target.statuses.apply("fleeting-stability", 10, "foe", NO_RANKS);
    use(caster(), WATER_TRIDENT, target);
    expect(target.knockdownRemaining).toBe(0);
    expect(target.health).toBe(1000 - elemental(74, "cold", target));
  });
});

describe("Searing Flames (#997)", () => {
  it("is an elite 15 e, 1 s, 2 s Fire Magic spell over the target's area, with no flight", () => {
    const flames = skill(SEARING_FLAMES);
    expect([
      flames.elite,
      flames.cost,
      flames.activationSeconds,
      flames.rechargeSeconds,
      radiusArea(SEARING_FLAMES).radius,
      flames.projectile,
    ]).toEqual([true, { kind: "energy", amount: 15 }, 1, 2, AREA_NEARBY, undefined]);
  });

  it("sets a foe not on fire Burning for 6 s, and does not strike it", () => {
    const target = foe();
    const events = use(caster(), SEARING_FLAMES, target);
    expect(remaining(target, "burning")).toBe(6);
    expect(events.filter((event) => event.kind === "damage")).toEqual([]);
    expect(target.health).toBe(1000);
  });

  it("strikes a foe already on fire for 82 fire, and leaves its Burning as it was", () => {
    const target = foe();
    target.statuses.apply("burning", 2, "paragon", NO_RANKS);
    use(caster(), SEARING_FLAMES, target);
    expect(target.health).toBe(1000 - elemental(82, "fire", target));
    expect(remaining(target, "burning")).toBe(2);
  });

  it("gives each foe in a mixed group its own branch", () => {
    const burning = foe("burning");
    burning.statuses.apply("burning", 3, "paragon", NO_RANKS);
    const unburnt = foe("unburnt");
    use(caster(), SEARING_FLAMES, burning, unburnt);
    expect(burning.health).toBe(1000 - elemental(82, "fire", burning));
    expect(remaining(burning, "burning")).toBe(3);
    expect(unburnt.health).toBe(1000);
    expect(remaining(unburnt, "burning")).toBe(6);
  });

  it("reaches a foe nearby its target, not one beyond", () => {
    const elementalist = caster();
    const target = foe("target");
    const nearby = foe("nearby");
    const beyond = foe("beyond");
    const targets = resolveTargets({
      skill: skill(SEARING_FLAMES),
      caster: elementalist,
      casterPosition: vec2(0, 0),
      primary: at(target, vec2(300, 0)),
      candidates: [at(nearby, vec2(300, AREA_NEARBY)), at(beyond, vec2(300 + AREA_NEARBY + 1, 0))],
      losBlockers: [],
    });
    expect(targets.map(({ id }) => id)).toEqual(["target", "nearby"]);
  });
});

describe("Ebon Hawk (#997)", () => {
  it("strikes for 70 earth and weakens for 13 s", () => {
    const target = foe();
    use(caster(), EBON_HAWK, target);
    expect(target.health).toBe(1000 - elemental(70, "earth", target));
    expect(remaining(target, "weakness")).toBe(13);
  });
});

describe("Stoning (#997)", () => {
  it("strikes a foe without Weakness for 93 earth and leaves it up", () => {
    const target = foe();
    use(caster(), STONING, target);
    expect(target.health).toBe(1000 - elemental(93, "earth", target));
    expect(target.knockdownRemaining).toBe(0);
  });

  it("knocks a Weakened foe down as well", () => {
    const target = foe();
    target.statuses.apply("weakness", 5, "necromancer", NO_RANKS);
    use(caster(), STONING, target);
    expect(target.health).toBe(1000 - elemental(93, "earth", target));
    expect(target.knockdownRemaining).toBe(KNOCKDOWN_SECONDS);
  });

  it("knocks a Weakened caster out of its cast, which recharges", () => {
    const target = foe("foe", { energy: 25 });
    target.statuses.apply("weakness", 5, "necromancer", NO_RANKS);
    target.cast.beginCast("elementalist.fireball", target.id, 2, undefined);
    use(caster(), STONING, target);
    expect(target.cast.activeCast).toBeUndefined();
    expect(target.cast.rechargeRemaining.get("elementalist.fireball")).toBe(
      skill("elementalist.fireball").rechargeSeconds,
    );
  });
});
