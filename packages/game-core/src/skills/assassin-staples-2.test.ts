import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Surroundings } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * Assassin staples 2 (#1041): Leaping Mantis Sting cripples a runner,
 * Jungle Strike hurts a crippled foe and its neighbours, Trampling Ox
 * knocks a crippled foe down, Falling Spider strikes only a fallen one.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function assassin(): Combatant {
  return makeCombatant({
    id: "a",
    team: 0,
    equipment: {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.daggers,
        attributeId: "assassin.dagger-mastery",
        damageType: WEAPONS.daggers.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    attributeRanks: new Map([["assassin.dagger-mastery", 12]]),
  });
}

const body = (id: string, team = 1): Combatant =>
  makeCombatant({ id, team, health: 1e6, maxHealth: 1e6 });

function resolve(
  skillId: string,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`missing ${skillId}`);
  }
  return resolveAttackSkill(
    { skill, caster, targets: [target], rng: steady(), rules: RULES, surroundings },
    () => false,
    [],
  );
}

const standing = (...placed: [Combatant, Vec2][]): Surroundings =>
  new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const crippled = (target: Combatant): Combatant => {
  target.statuses.apply("crippled", 10, "x", NO_RANKS);
  return target;
};

describe("Leaping Mantis Sting (#1041)", () => {
  it("cripples a foe that walked last tick for 13 s", () => {
    const target = body("t");
    target.moving = true;
    resolve("assassin.leaping-mantis-sting", assassin(), target);
    expect(target.statuses.get("crippled")?.remainingSeconds).toBe(13);
  });

  it("does not cripple a standing foe, and opens a chain either way", () => {
    const caster = assassin();
    const target = body("t");
    resolve("assassin.leaping-mantis-sting", caster, target);
    expect(target.statuses.has("crippled")).toBe(false);
    expect(caster.chainMarks.get("t")?.role).toBe("lead");
  });
});

describe("Jungle Strike (#1041)", () => {
  /** A lead-marked foe with a foe on each side of it and an ally beside it, all adjacent. */
  function strike(isCrippled: boolean): CombatEvent[] {
    const caster = assassin();
    const target = isCrippled ? crippled(body("t")) : body("t");
    caster.chainMarks.set("t", { role: "lead", remainingSeconds: 15 });
    const step = AREA_ADJACENT / 2;
    return resolve(
      "assassin.jungle-strike",
      caster,
      target,
      standing(
        [caster, vec2(-step, 0)],
        [target, vec2(0, 0)],
        [body("north"), vec2(0, step)],
        [body("south"), vec2(0, -step)],
        [body("ally", 0), vec2(step, 0)],
      ),
    );
  }

  it("on a crippled foe: the blow, 25 more, and 25 to each adjacent foe, none to the ally", () => {
    const events = strike(true);
    const [blow, extra] = damageTo(events, "t");
    expect(blow).toBeGreaterThan(0);
    // 25 piercing through the reference armor of a test body.
    expect(extra).toBeGreaterThan(0);
    expect(damageTo(events, "north")).toEqual([extra]);
    expect(damageTo(events, "south")).toEqual([extra]);
    expect(damageTo(events, "ally")).toEqual([]);
  });

  it("on a foe that is not crippled: the blow only", () => {
    const events = strike(false);
    expect(damageTo(events, "t")).toHaveLength(1);
    expect(damageTo(events, "north")).toEqual([]);
    expect(damageTo(events, "south")).toEqual([]);
  });
});

describe("Trampling Ox (#1041)", () => {
  const knockdowns = (events: readonly CombatEvent[]): CombatEvent[] =>
    events.filter((event) => event.kind === "knocked-down");

  function trample(target: Combatant): CombatEvent[] {
    const caster = assassin();
    caster.chainMarks.set("t", { role: "off-hand", remainingSeconds: 15 });
    return resolve("assassin.trampling-ox", caster, target);
  }

  it("knocks a crippled foe down once, for 2 s, across both blows", () => {
    const target = crippled(body("t"));
    const events = trample(target);
    expect(damageTo(events, "t")).toHaveLength(2);
    expect(knockdowns(events)).toHaveLength(1);
    expect(target.knockdownRemaining).toBe(2);
  });

  it("strikes a foe that is not crippled twice, and knocks nothing down", () => {
    const events = trample(body("t"));
    expect(damageTo(events, "t")).toHaveLength(2);
    expect(knockdowns(events)).toEqual([]);
  });
});

describe("Falling Spider (#1041)", () => {
  it("on a knocked-down foe: +31 and Poison for 17 s", () => {
    const target = body("t");
    target.knockdownRemaining = 2;
    const events = resolve("assassin.falling-spider", assassin(), target);
    expect(damageTo(events, "t")).toHaveLength(1);
    expect(target.statuses.get("poison")?.remainingSeconds).toBe(17);
  });

  it("on a standing foe: missed out of sequence", () => {
    expect(resolve("assassin.falling-spider", assassin(), body("t"))).toEqual([
      { kind: "attack-missed", targetId: "t", reason: "out-of-sequence" },
    ]);
  });
});
