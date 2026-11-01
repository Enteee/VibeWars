import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
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
import { moveSpeedMultiplier } from "./tick.js";
import { KNOCKDOWN_SECONDS, type Combatant, type Skill } from "./types.js";
import { attackDurationSeconds } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * The Elementalist and Necromancer staples (#918): Lightning Strike, Mind
 * Shock, Shard Storm and Shadow of Fear, each landed on a scripted foe.
 * Shard Storm in flight is `match/projectiles.test.ts`'s.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["elementalist.air-magic", 12],
  ["elementalist.water-magic", 12],
  ["necromancer.curses", 12],
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

/** What `amount` lightning at 25% armor penetration does to `victim`. */
function lightning(amount: number, victim: Combatant): number {
  return mitigate(skillDamage(amount, "lightning", 0.25), victim, RULES, "chest");
}

describe("Lightning Strike (#918)", () => {
  it("strikes for 33 lightning at 25% armor penetration, as Lightning Orb's formula", () => {
    const target = foe();
    const events = use(caster(), "elementalist.lightning-strike", target);
    const expected = lightning(33, target);
    expect(expected).toBeGreaterThan(
      mitigate(skillDamage(33, "lightning", 0), target, RULES, "chest"),
    );
    expect(events).toEqual([
      expect.objectContaining({ kind: "damage", targetId: "foe", amount: expected }),
    ]);
    expect(target.health).toBe(1000 - expected);
  });
});

describe("Mind Shock (#918)", () => {
  it("with more energy than its target: twice 42 lightning and a knockdown", () => {
    const target = foe("foe", { energy: 10 });
    // 30 energy, 5 of it paid: still 25 against 10.
    const events = use(caster(), "elementalist.mind-shock", target);
    const each = lightning(42, target);
    expect(events.map((event) => event.kind)).toEqual(["damage", "damage", "knocked-down"]);
    expect(events).toContainEqual({
      kind: "knocked-down",
      targetId: "foe",
      durationSeconds: KNOCKDOWN_SECONDS,
    });
    expect(target.health).toBe(1000 - 2 * each);
    expect(target.knockdownRemaining).toBe(KNOCKDOWN_SECONDS);
  });

  it("with equal energy, after its cost is paid: one hit, no knockdown", () => {
    const target = foe("foe", { energy: 25 });
    const events = use(caster(), "elementalist.mind-shock", target);
    expect(events.map((event) => event.kind)).toEqual(["damage"]);
    expect(target.health).toBe(1000 - lightning(42, target));
    expect(target.knockdownRemaining).toBe(0);
  });

  it("against Fleeting Stability: the bonus lands, the knockdown is prevented", () => {
    const target = foe("foe", { energy: 0 });
    target.statuses.apply("fleeting-stability", 10, "foe", NO_RANKS);
    const events = use(caster(), "elementalist.mind-shock", target);
    expect(events.filter((event) => event.kind === "damage")).toHaveLength(2);
    expect(target.knockdownRemaining).toBe(0);
  });

  it("is elite, and its exhaustion lowers maximum energy by 10 a cast", () => {
    expect(skill("elementalist.mind-shock").elite).toBe(true);
    const elementalist = caster();
    use(elementalist, "elementalist.mind-shock", foe());
    expect(effectiveMaxEnergy(elementalist)).toBe(elementalist.maxEnergy - 10);
    use(elementalist, "elementalist.mind-shock", foe());
    expect(effectiveMaxEnergy(elementalist)).toBe(elementalist.maxEnergy - 20);
  });
});

describe("Shard Storm (#918)", () => {
  it("deals 70 cold and slows its target to 34% speed for 5 s", () => {
    const target = foe();
    use(caster(), "elementalist.shard-storm", target);
    expect(target.health).toBe(1000 - mitigate(skillDamage(70, "cold", 0), target, RULES, "chest"));
    expect(target.statuses.has("shard-storm")).toBe(true);
    expect(target.statuses.active.find(({ id }) => id === "shard-storm")?.remainingSeconds).toBe(5);
    expect(moveSpeedMultiplier(target)).toBeCloseTo(0.34, 9);
  });

  it("is a hex spell that flies", () => {
    expect(skill("elementalist.shard-storm").type).toBe("hex");
    expect(skill("elementalist.shard-storm").projectile).toBeDefined();
  });
});

describe("Shadow of Fear (#918)", () => {
  const SHADOW = "necromancer.shadow-of-fear";

  function at(combatant: Combatant, position: Vec2): TargetCandidate {
    return { combatant, position, creature: undefined };
  }

  it("hexes its target and every foe adjacent to it, no farther, no ally", () => {
    const necromancer = caster();
    const target = foe("target");
    const adjacent = foe("adjacent");
    const twice = foe("twice");
    const ally = makeCombatant({ id: "ally", team: 0 });
    const targets = resolveTargets({
      skill: skill(SHADOW),
      caster: necromancer,
      casterPosition: vec2(0, 0),
      primary: at(target, vec2(300, 0)),
      candidates: [
        at(necromancer, vec2(0, 0)),
        at(adjacent, vec2(300 + AREA_ADJACENT, 0)),
        at(twice, vec2(300 - 2 * AREA_ADJACENT, 0)),
        at(ally, vec2(300, AREA_ADJACENT / 2)),
      ],
      losBlockers: [],
    });
    expect(targets.map(({ id }) => id)).toEqual(["target", "adjacent"]);

    use(necromancer, SHADOW, ...targets);
    for (const hexed of [target, adjacent]) {
      expect(
        hexed.statuses.active.find(({ id }) => id === "shadow-of-fear")?.remainingSeconds,
      ).toBe(25);
    }
    expect(twice.statuses.has("shadow-of-fear")).toBe(false);
    expect(ally.statuses.has("shadow-of-fear")).toBe(false);
  });

  it("makes a hexed attacker's attacks take half as long again", () => {
    const target = foe();
    use(caster(), SHADOW, target);
    expect(attackDurationSeconds(target, 1.33)).toBeCloseTo(1.33 * 1.5, 9);
  });

  it("with Faintheartedness too, attacks are no slower than with either", () => {
    const target = foe();
    use(caster(), SHADOW, target);
    use(caster(), "necromancer.faintheartedness", target);
    expect(attackDurationSeconds(target, 1)).toBeCloseTo(1.5, 9);
  });
});
