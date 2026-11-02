import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { KNOCKDOWN_SECONDS, type ChainRole, type Combatant, type Skill } from "./types.js";

/**
 * Assassin staples 6 (#2233): Entangling Asp, Assault Enchantments and
 * Hidden Caltrops. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["assassin.deadly-arts", 12],
  ["assassin.shadow-arts", 12],
]);

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const assassin = (): Combatant => makeCombatant({ id: "a", team: 0, attributeRanks: RANKS });

const body = (id: string): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

/** `caster`'s mark of `role` on `target`, as if its chain led there. */
function marked(caster: Combatant, target: Combatant, role: ChainRole): Combatant {
  caster.chainMarks.set(target.id, { role, remainingSeconds: 10 });
  return caster;
}

/** `caster`'s skill `skillId` lands on `target`. */
function land(skillId: string, caster: Combatant, target: Combatant) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES.combat,
    surroundings: new Map(),
  });
}

describe("the three are the corpus's (#2233)", () => {
  it.each([
    ["assassin.entangling-asp", 784, "spell", false, "deadly-arts", 10, 1, 20, RANGE_MELEE],
    ["assassin.assault-enchantments", 1643, "skill", true, undefined, 5, 0.25, 8, RANGE_MELEE],
    ["assassin.hidden-caltrops", 1642, "hex", true, "shadow-arts", 5, 1, 12, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: attribute === undefined ? undefined : `assassin.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );
});

describe("Entangling Asp (#2233)", () => {
  it("after a lead attack: knocks down and Poisons for 17 s, and the mark stays", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "lead");
    land("assassin.entangling-asp", caster, foe);
    expect(foe.knockdownRemaining).toBe(KNOCKDOWN_SECONDS);
    expect(foe.statuses.get("poison")?.remainingSeconds).toBe(17);
    expect(caster.chainMarks.get("f")?.role).toBe("lead");
  });

  it("Poisons a foe already knocked down", () => {
    const caster = assassin();
    const foe = body("f");
    foe.knockdownRemaining = 1;
    marked(caster, foe, "lead");
    land("assassin.entangling-asp", caster, foe);
    expect(foe.statuses.get("poison")?.remainingSeconds).toBe(17);
  });

  it("without the lead mark does nothing", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "off-hand");
    land("assassin.entangling-asp", caster, foe);
    expect(foe.knockdownRemaining).toBe(0);
    expect(foe.statuses.has("poison")).toBe(false);
  });
});

describe("Assault Enchantments (#2233)", () => {
  /** A foe with two enchantments and a hex. */
  function enchanted(): Combatant {
    const foe = body("f");
    foe.statuses.apply("shadow-refuge", 6, "f", NO_RANKS);
    foe.statuses.apply("way-of-the-fox", 30, "f", NO_RANKS);
    foe.statuses.apply("shadow-prison", 10, "x", NO_RANKS);
    return foe;
  }

  it("after a dual attack: strips every enchantment, nothing else", () => {
    const caster = assassin();
    const foe = enchanted();
    marked(caster, foe, "dual");
    land("assassin.assault-enchantments", caster, foe);
    expect(foe.statuses.has("shadow-refuge")).toBe(false);
    expect(foe.statuses.has("way-of-the-fox")).toBe(false);
    expect(foe.statuses.has("shadow-prison")).toBe(true);
  });

  it("without the dual mark does nothing", () => {
    const caster = assassin();
    const foe = enchanted();
    marked(caster, foe, "lead");
    land("assassin.assault-enchantments", caster, foe);
    expect(foe.statuses.has("shadow-refuge")).toBe(true);
    expect(foe.statuses.has("way-of-the-fox")).toBe(true);
  });
});

describe("Hidden Caltrops (#2233)", () => {
  const CALTROPS = 0;

  /** A rank-12 assassin with Hidden Caltrops, an Assassin and a Warrior skill. */
  function arena(): MatchSimulation {
    const sin: ParticipantSpec = {
      id: "sin",
      team: 0,
      skillBar: ["assassin.hidden-caltrops", "assassin.shadow-refuge", "warrior.sprint"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn: vec2(0, 0),
      facing: 0,
    };
    const foe: ParticipantSpec = {
      id: "foe",
      team: 1,
      skillBar: [],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(60),
      spawn: vec2(300, 0),
      facing: Math.PI,
    };
    const match = new MatchSimulation({ seed: "caltrops", participants: [sin, foe] });
    match.setTarget("sin", "foe");
    expect(match.requestSkill("sin", CALTROPS)?.check).toEqual({ ok: true });
    for (let i = 0; i < 100; i += 1) {
      if (match.step(DT).log.some((logged) => logged.skillId === "assassin.hidden-caltrops")) {
        return match;
      }
    }
    throw new Error("Hidden Caltrops never resolved");
  }

  function get(match: MatchSimulation, id: string) {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  function stepFor(match: MatchSimulation, seconds: number): void {
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      match.step(DT);
    }
  }

  it("slows its foe 50% for 8 s", () => {
    expect(getStatusDefinition("hidden-caltrops").moveSpeedMultiplier).toBe(0.5);
    const match = arena();
    expect(
      get(match, "foe").combatant.statuses.get("hidden-caltrops")?.remainingSeconds,
    ).toBeCloseTo(8, 0);
    expect(get(match, "foe").combatant.statuses.has("crippled")).toBe(false);
  });

  it("disables only the caster's non-Assassin skills, for 3 s", () => {
    const sin = get(arena(), "sin");
    expect(sin.combatant.cast.rechargeRemaining.get("warrior.sprint")).toBeCloseTo(3, 1);
    expect(sin.combatant.cast.rechargeRemaining.has("assassin.shadow-refuge")).toBe(false);
  });

  it("cripples its foe for 12 s when it runs out", () => {
    const match = arena();
    stepFor(match, 8.5);
    const foe = get(match, "foe").combatant;
    expect(foe.statuses.has("hidden-caltrops")).toBe(false);
    expect(foe.statuses.get("crippled")?.remainingSeconds).toBeGreaterThan(11);
  });

  it("cripples its foe for 12 s when it is removed early", () => {
    const match = arena();
    get(match, "foe").combatant.statuses.remove("hidden-caltrops");
    stepFor(match, DT);
    expect(get(match, "foe").combatant.statuses.get("crippled")?.remainingSeconds).toBeCloseTo(
      12,
      0,
    );
  });
});
