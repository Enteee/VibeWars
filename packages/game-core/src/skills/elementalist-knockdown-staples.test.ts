import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { effectiveMaxEnergy } from "./overcast.js";
import { resolveTargets, type TargetCandidate } from "./targeting.js";
import { makeCombatant } from "./testing.js";
import { effectiveActivationSeconds } from "./tick.js";
import { KNOCKDOWN_SECONDS, type Combatant, type Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * The Elementalist knockdown staples (#985): Blinding Flash, Shock,
 * Aftershock and Meteor, each landed on a scripted foe. Shock into
 * Aftershock in a running match is `match/elementalist-knockdown.test.ts`'s.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["elementalist.air-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.fire-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 30, ...overrides });
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
function elemental(amount: number, type: "earth" | "fire", victim: Combatant): number {
  return mitigate(skillDamage(amount, type, 0), victim, RULES, "chest");
}

describe("Blinding Flash (#985)", () => {
  it("is an 8 s Air Magic spell that blinds its target for 7 s", () => {
    const flash = skill("elementalist.blinding-flash");
    expect([flash.type, flash.rechargeSeconds, flash.activationSeconds]).toEqual([
      "spell",
      8,
      0.75,
    ]);
    const target = foe();
    use(caster(), "elementalist.blinding-flash", target);
    expect(target.statuses.active.find(({ id }) => id === "blind")?.remainingSeconds).toBe(7);
  });

  it("leaves a longer blind as it is", () => {
    const target = foe();
    target.statuses.apply("blind", 13, "ranger", NO_RANKS);
    use(caster(), "elementalist.blinding-flash", target);
    expect(target.statuses.active.find(({ id }) => id === "blind")?.remainingSeconds).toBe(13);
  });
});

describe("Shock (#985)", () => {
  it("is a touch skill, not a spell: Dazed does not slow it", () => {
    const shock = skill("elementalist.shock");
    expect(shock.type).toBe("skill");
    expect(shock.range).toBe(RANGE_MELEE);
    const dazed = caster();
    dazed.statuses.apply("dazed", 10, "foe", NO_RANKS);
    expect(effectiveActivationSeconds(shock, dazed)).toBe(0.75);
  });

  it("knocks down for 2 s and strikes for 50 lightning at 25% armor penetration", () => {
    const target = foe();
    const events = use(caster(), "elementalist.shock", target);
    const expected = mitigate(skillDamage(50, "lightning", 0.25), target, RULES, "chest");
    expect(expected).toBeGreaterThan(
      mitigate(skillDamage(50, "lightning", 0), target, RULES, "chest"),
    );
    expect(events.map((event) => event.kind)).toEqual(["knocked-down", "damage"]);
    expect(target.knockdownRemaining).toBe(KNOCKDOWN_SECONDS);
    expect(target.health).toBe(1000 - expected);
  });

  it("against Fleeting Stability: no knockdown, the damage lands", () => {
    const target = foe();
    target.statuses.apply("fleeting-stability", 10, "foe", NO_RANKS);
    const events = use(caster(), "elementalist.shock", target);
    expect(target.knockdownRemaining).toBe(0);
    expect(events.filter((event) => event.kind === "damage")).toHaveLength(1);
    expect(target.health).toBeLessThan(1000);
  });

  it("against a foe already down: no second knockdown, the damage lands", () => {
    const target = foe();
    target.knockdownRemaining = 0.5;
    const events = use(caster(), "elementalist.shock", target);
    expect(events.map((event) => event.kind)).toEqual(["damage"]);
    expect(target.knockdownRemaining).toBe(0.5);
  });

  it("adds 10 exhaustion a use", () => {
    const elementalist = caster();
    use(elementalist, "elementalist.shock", foe());
    expect(effectiveMaxEnergy(elementalist)).toBe(elementalist.maxEnergy - 10);
  });
});

describe("Aftershock (#985)", () => {
  const AFTERSHOCK = "elementalist.aftershock";

  it("strikes every foe nearby the caster, not an ally, the caster or a foe beyond 81", () => {
    const elementalist = caster();
    const near = foe("near");
    const edge = foe("edge");
    const far = foe("far");
    const ally = makeCombatant({ id: "ally", team: 0, maxHealth: 1000, health: 1000 });
    const targets = resolveTargets({
      skill: skill(AFTERSHOCK),
      caster: elementalist,
      casterPosition: vec2(0, 0),
      primary: at(elementalist, vec2(0, 0)),
      candidates: [
        at(elementalist, vec2(0, 0)),
        at(near, vec2(30, 0)),
        at(edge, vec2(0, AREA_NEARBY)),
        at(far, vec2(AREA_NEARBY + 1, 0)),
        at(ally, vec2(10, 0)),
      ],
      losBlockers: [],
    });
    expect(targets.map(({ id }) => id)).toEqual(["near", "edge"]);
  });

  it("deals 85 earth to a standing foe and 85 + 56 to a knocked-down one", () => {
    const standing = foe("standing");
    const down = foe("down");
    down.knockdownRemaining = 0.1;
    use(caster(), AFTERSHOCK, standing, down);
    expect(standing.health).toBe(1000 - elemental(85, "earth", standing));
    expect(down.health).toBe(1000 - elemental(85, "earth", down) - elemental(56, "earth", down));
  });

  it("with no foe nearby, still costs its energy", () => {
    const elementalist = caster();
    expect(use(elementalist, AFTERSHOCK)).toEqual([]);
    expect(elementalist.energy).toBe(20);
  });
});

describe("Meteor (#985)", () => {
  const METEOR = "elementalist.meteor";

  it("strikes its target and each adjacent foe for 91 fire and knocks them down", () => {
    const elementalist = caster();
    const target = foe("target");
    const adjacent = foe("adjacent");
    const beyond = foe("beyond");
    const targets = resolveTargets({
      skill: skill(METEOR),
      caster: elementalist,
      casterPosition: vec2(0, 0),
      primary: at(target, vec2(300, 0)),
      candidates: [
        at(adjacent, vec2(300 + AREA_ADJACENT, 0)),
        at(beyond, vec2(300 - AREA_NEARBY, 0)),
      ],
      losBlockers: [],
    });
    expect(targets.map(({ id }) => id)).toEqual(["target", "adjacent"]);

    use(elementalist, METEOR, ...targets);
    for (const struck of [target, adjacent]) {
      expect(struck.health).toBe(1000 - elemental(91, "fire", struck));
      expect(struck.knockdownRemaining).toBe(KNOCKDOWN_SECONDS);
    }
    expect(beyond.health).toBe(1000);
  });

  it("knocks a casting foe out of its cast, which recharges", () => {
    const target = foe("foe", { energy: 25 });
    target.cast.beginCast("elementalist.fireball", target.id, 2, undefined);
    use(caster(), METEOR, target);
    expect(target.cast.activeCast).toBeUndefined();
    expect(target.cast.rechargeRemaining.get("elementalist.fireball")).toBe(
      skill("elementalist.fireball").rechargeSeconds,
    );
  });

  it("is a 2 s spell with 10 exhaustion", () => {
    const meteor = skill(METEOR);
    expect([
      meteor.type,
      meteor.activationSeconds,
      meteor.rechargeSeconds,
      meteor.overcast,
    ]).toEqual(["spell", 2, 30, 10]);
  });
});
