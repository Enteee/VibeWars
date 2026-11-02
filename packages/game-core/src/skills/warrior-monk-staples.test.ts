import { describe, expect, it } from "vitest";

import { divineFavorHeal } from "../primary-attributes.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses, effectiveMaxHealth } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * The Warrior and Monk staples (#936): Protective Spirit's cap on a hit,
 * Infuse Health's gift of health, and what their tooltips say. Cyclone
 * Axe and "For Great Justice!" act in a match: `match/warrior-monk-staples.test.ts`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const INFUSE = "monk.infuse-health";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A bearer of 480 max health, at full, under Protective Spirit. */
function spirited(overrides: Partial<Combatant> = {}): Combatant {
  const bearer = makeCombatant({ id: "b", maxHealth: 480, health: 480, ...overrides });
  bearer.statuses.apply("protective-spirit", 19, "monk", NO_RANKS);
  return bearer;
}

/** `amount` typeless damage: armor never touches it. */
const typeless = (amount: number) => skillDamage(amount, "typeless", 0);

describe("Protective Spirit (#936)", () => {
  it("is a 10 e, ¼ s, 5 s enchantment on any ally for 19 s", () => {
    const spirit = skill("monk.protective-spirit");
    expect(spirit).toMatchObject({
      type: "enchantment",
      attributeId: "monk.protection-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0.25,
      rechargeSeconds: 5,
      target: "single-ally",
      effects: [
        {
          kind: "apply-status",
          statusId: "protective-spirit",
          durationSeconds: {
            scaling: { attributeId: "monk.protection-prayers", atZero: 5, atTwelve: 19.4 },
          },
        },
      ],
    });
  });

  it("caps a hit at 10% of max health: 48 of 480; a hit under it is unchanged", () => {
    expect(mitigate(typeless(200), spirited(), RULES, "chest", createRng(1))).toBe(48);
    expect(mitigate(typeless(48), spirited(), RULES, "chest", createRng(1))).toBe(48);
    expect(mitigate(typeless(30), spirited(), RULES, "chest", createRng(1))).toBe(30);
    expect(
      mitigate(
        typeless(200),
        makeCombatant({ id: "x", maxHealth: 480 }),
        RULES,
        "chest",
        createRng(1),
      ),
    ).toBe(200);
  });

  it("caps last, after Frenzy's 160%: 40 is 64, and still 48", () => {
    const frenzied = spirited();
    frenzied.statuses.apply("frenzy", 8, "b", new Map([["warrior.strength", 12]]));
    expect(mitigate(typeless(20), frenzied, RULES, "chest", createRng(1))).toBe(32);
    expect(mitigate(typeless(40), frenzied, RULES, "chest", createRng(1))).toBe(48);
  });

  it("caps at 10% of the max a deep wound leaves: 38 of 384", () => {
    const wounded = spirited();
    wounded.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    expect(effectiveMaxHealth(wounded)).toBe(384);
    expect(mitigate(typeless(200), wounded, RULES, "chest", createRng(1))).toBe(38);
  });

  it("keeps the lowest of two caps, and none without one", () => {
    expect(aggregateModifiers([]).maxDamageFractionPerHit).toBeUndefined();
    expect(
      aggregateModifiers([
        { id: "protective-spirit", ranks: NO_RANKS },
        { id: "frenzy", ranks: NO_RANKS },
      ]).maxDamageFractionPerHit,
    ).toBe(0.1);
  });

  it("does not cap degeneration", () => {
    const bleeding = spirited({ maxHealth: 20, health: 20 });
    bleeding.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    bleeding.statuses.apply("poison", 10, "foe", NO_RANKS);
    const events = advanceStatuses(bleeding, 1, 0);
    // −7 pips is 14 a second; the cap would be 2.
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", amount: 14 }));
  });

  it("says so", () => {
    expect(describeStatus("protective-spirit")).toBe(
      "damage from a single hit is capped at 10% of max health",
    );
  });
});

describe("Infuse Health (#936)", () => {
  function monk(health: number, ranks: [string, number][] = []): Combatant {
    return makeCombatant({
      id: "monk",
      health,
      maxHealth: 500,
      attributeRanks: new Map([["monk.healing-prayers", 12], ...ranks]),
    });
  }

  function ally(overrides: Partial<Combatant> = {}): Combatant {
    return makeCombatant({ id: "ally", health: 100, maxHealth: 1000, ...overrides });
  }

  function infuse(user: Combatant, target: Combatant): CombatEvent[] {
    payCost(skill(INFUSE), user);
    return applySkillEffects({
      surroundings: new Map(),
      skill: skill(INFUSE),
      caster: user,
      targets: [target],
      rng: createRng(1),
      rules: RULES,
    });
  }

  it("is a 10 e, ¼ s spell on another ally with no recharge", () => {
    expect(skill(INFUSE)).toMatchObject({
      type: "spell",
      attributeId: "monk.healing-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0.25,
      rechargeSeconds: 0,
      target: "single-other-ally",
    });
  });

  it("loses half the caster's health, floored, and heals 129% of it at rank 12", () => {
    const user = monk(401);
    const target = ally();
    expect(infuse(user, target)).toEqual([
      { kind: "sacrifice", targetId: "monk", amount: 200 },
      { kind: "heal", targetId: "ally", amount: 258 },
    ]);
    expect(user.health).toBe(201);
    expect(target.health).toBe(358);
    expect(user.energy).toBe(40);
  });

  it("heals 100% of it at rank 0", () => {
    const user = makeCombatant({ id: "monk", health: 400 });
    const target = ally();
    infuse(user, target);
    expect(target.health).toBe(300);
  });

  it("at 1 health loses nothing and heals nothing, and still costs its energy", () => {
    const user = monk(1);
    const target = ally();
    expect(infuse(user, target)).toEqual([]);
    expect(user.health).toBe(1);
    expect(user.dead).toBe(false);
    expect(target.health).toBe(100);
    expect(user.energy).toBe(40);
  });

  it("on an ally at full health still costs the health, and heals nothing", () => {
    const user = monk(400);
    const target = ally({ health: 1000 });
    expect(infuse(user, target)).toEqual([{ kind: "sacrifice", targetId: "monk", amount: 200 }]);
    expect(user.health).toBe(200);
  });

  it("gets Divine Favor's bonus, as Orison of Healing does", () => {
    const user = monk(400, [["monk.divine-favor", 12]]);
    const target = ally();
    expect(infuse(user, target)).toEqual([
      { kind: "sacrifice", targetId: "monk", amount: 200 },
      { kind: "heal", targetId: "ally", amount: 258 },
      { kind: "heal", targetId: "ally", amount: divineFavorHeal(12) },
    ]);
  });

  it("is weakened by a healing reduction on the ally, not on the caster", () => {
    const user = monk(400);
    user.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    const target = ally();
    target.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    infuse(user, target);
    expect(user.health).toBe(200);
    expect(target.health).toBeCloseTo(100 + 258 * 0.8, 6);
  });

  it("says what it costs and what it gives", () => {
    const described = describeSkill(skill(INFUSE), new Map([["monk.healing-prayers", 12]]));
    expect(described.effects.map(({ text }) => text)).toEqual([
      "Lose half your health; heal for 129% of it",
    ]);
  });
});

describe('Cyclone Axe and "For Great Justice!" (#936)', () => {
  it("Cyclone Axe is a 5 e, 4 s axe attack on every foe adjacent to you", () => {
    expect(skill("warrior.cyclone-axe")).toMatchObject({
      type: "attack",
      attributeId: "warrior.axe-mastery",
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 4,
      area: { origin: "caster", affects: "enemies", maxTargets: undefined, includesCaster: false },
      attack: {
        weapon: "axe",
        bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 4, atTwelve: 10.4 } },
      },
    });
    expect(describeSkill(skill("warrior.cyclone-axe")).targetText).toBe(
      "One foe, and foes adjacent around you",
    );
  });

  it('"For Great Justice!" is a 5 e, 45 s shout: 8 s of one more strike per hit', () => {
    expect(skill("warrior.for-great-justice")).toMatchObject({
      type: "shout",
      attributeId: undefined,
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 45,
      target: "self",
      effects: [
        { kind: "apply-status", statusId: "for-great-justice", durationSeconds: { flat: 8 } },
      ],
    });
    expect(
      aggregateModifiers([{ id: "for-great-justice", ranks: NO_RANKS }]).extraStrikesPerHit,
    ).toBe(1);
    expect(describeStatus("for-great-justice")).toBe("gain 1 more strike of adrenaline per hit");
  });
});
