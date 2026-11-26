import { describe, expect, it } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { DamageType } from "../equipment/types.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant } from "./types.js";
import { attackHitRiders } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Ebon Dust Aura (#2513): nearby foes Blinded as it is cast, +earth on
 * melee hits with an earth weapon, and Blindness cured as it ends.
 */

const RULES: Ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const AURA = "dervish.ebon-dust-aura";
const earth = (rank: number) => new Map([["dervish.earth-prayers", rank]]);

function wielding(weapon: Weapon, damageType: DamageType): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId: undefined,
      damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(id: string, team: number, spawn: Vec2, rank = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: team === 0 ? [AURA] : [],
    attributeRanks: earth(rank),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 100,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** `d` at `rank` casts the aura with two foes nearby and one beyond. */
function cast(rank: number, foes = true): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "ebon-dust-aura-2513",
    ruleset: RULES,
    participants: [
      spec("d", 0, vec2(0, 0), rank),
      ...(foes
        ? [
            spec("f1", 1, vec2(AREA_NEARBY / 2, 0)),
            spec("f2", 1, vec2(0, AREA_NEARBY / 2)),
            spec("far", 1, vec2(AREA_NEARBY * 3, 0)),
          ]
        : []),
    ],
  });
  get(sim, "d").energy = 100;
  sim.setTarget("d", "d");
  expect(sim.requestSkill("d", 0)?.check).toEqual({ ok: true });
  stepFor(sim, DT);
  return sim;
}

/** What the aura adds to one hit of `weapon` dealing `damageType`, at `rank`. */
function added(weapon: Weapon, damageType: DamageType, rank: number): number {
  const attacker = makeCombatant({
    id: "d",
    attributeRanks: earth(rank),
    equipment: wielding(weapon, damageType),
  });
  attacker.statuses.apply("ebon-dust-aura", 30, "d", NO_RANKS);
  const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
  attackHitRiders(
    attacker,
    victim,
    attacker.equipment.mainHand,
    false,
    0,
    createRng(1),
    RULES.combat,
    new Map(),
    [],
    [],
  );
  return 1000 - victim.health;
}

describe("Ebon Dust Aura (#2513)", () => {
  it("is the corpus's: gwId 1760, an elite 10-energy flash enchantment, 20 s recharge", () => {
    expect(getSkill(AURA)).toMatchObject({
      gwId: 1760,
      type: "enchantment",
      elite: true,
      flash: true,
      attributeId: "dervish.earth-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 20,
      target: "self",
    });
  });

  it.each([
    [12, 6],
    [0, 1],
  ])("at rank %i Blinds the nearby foes for %i s, not the far one", (rank, seconds) => {
    const sim = cast(rank);
    expect(get(sim, "f1").statuses.get("blind")?.durationSeconds).toBe(seconds);
    expect(get(sim, "f2").statuses.get("blind")?.durationSeconds).toBe(seconds);
    expect(get(sim, "far").statuses.has("blind")).toBe(false);
    expect(get(sim, "d").statuses.has("blind")).toBe(false);
    expect(get(sim, "d").statuses.get("ebon-dust-aura")?.durationSeconds).toBe(30);
  });

  it("lands on the caster with no foe nearby", () => {
    expect(get(cast(12, false), "d").statuses.has("ebon-dust-aura")).toBe(true);
  });

  it("adds +24.6 earth at rank 12 and +3 at rank 0 to an earth scythe's hit", () => {
    expect(added(WEAPONS.scythe, "earth", 12)).toBeCloseTo(24.6, 0);
    expect(added(WEAPONS.scythe, "earth", 0)).toBeCloseTo(3, 0);
  });

  it("adds nothing to a plain scythe, nor to an earth bow", () => {
    expect(added(WEAPONS.scythe, "slashing", 12)).toBe(0);
    expect(added(WEAPONS["recurve-bow"], "earth", 12)).toBe(0);
  });

  it("reads 'while you wield an earth weapon' in its tooltip", () => {
    expect(describeStatus("ebon-dust-aura", earth(12), EN_WORDS, EN_NAMES)).toBe(
      "while you wield an earth weapon, foes your melee attacks hit take 25 earth damage. " +
        "When it ends: removes Blind",
    );
  });

  it("cures Blindness as it expires, and leaves Bleeding", () => {
    const sim = cast(12, false);
    const d = get(sim, "d");
    d.statuses.apply("blind", 60, "x", NO_RANKS);
    d.statuses.apply("bleeding", 60, "x", NO_RANKS);
    stepFor(sim, 29.5);
    expect(d.statuses.has("blind")).toBe(true);
    stepFor(sim, 1);
    expect(d.statuses.has("ebon-dust-aura")).toBe(false);
    expect(d.statuses.has("blind")).toBe(false);
    expect(d.statuses.has("bleeding")).toBe(true);
  });

  it("cures Blindness when stripped early, and leaves Bleeding", () => {
    const sim = cast(12, false);
    const d = get(sim, "d");
    d.statuses.apply("blind", 60, "x", NO_RANKS);
    d.statuses.apply("bleeding", 60, "x", NO_RANKS);
    d.statuses.remove("ebon-dust-aura");
    stepFor(sim, DT);
    expect(d.statuses.has("blind")).toBe(false);
    expect(d.statuses.has("bleeding")).toBe(true);
  });
});
