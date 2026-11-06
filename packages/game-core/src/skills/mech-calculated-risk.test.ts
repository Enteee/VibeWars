import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import type { Skill } from "./types.js";

/**
 * Mechanics (#2471): Calculated Risk's hexed foe hits 10 harder, but each
 * blow it lands has a 50% chance to land on itself instead, capped by its
 * Mesmer's Illusion Magic. Numbers are the corpus's (PvP), at rank 0 and
 * rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ILLUSION = "mesmer.illusion-magic";
const RISK = "mesmer.calculated-risk";
const SWORDSMANSHIP = "warrior.swordsmanship";

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: SWORDSMANSHIP,
    damageType: weaponDamageType(WEAPONS.sword, SWORDSMANSHIP),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  ranks: ReadonlyMap<string, number>,
  equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: id === "mesmer" ? [RISK] : [],
    attributeRanks: ranks,
    equipment,
    maxHealth: 1e4,
    maxEnergy: 100,
    startHealthFraction: 1,
    spawn,
    facing: 0,
  };
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** A Mesmer at `rank` Illusion Magic beside a Warrior swinging at a dummy. */
function fight(rank: number): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "calculated-risk",
    participants: [
      spec("mesmer", 0, vec2(0, 0), new Map([[ILLUSION, rank]])),
      spec("warrior", 1, vec2(300, 0), new Map([[SWORDSMANSHIP, 12]]), SWORD),
      spec("dummy", 0, vec2(340, 0), new Map()),
    ],
  });
  sim.setTarget("mesmer", "warrior");
  expect(sim.requestSkill("mesmer", 0)?.check).toEqual({ ok: true });
  return sim;
}

function risk(): Skill {
  const found = getSkill(RISK);
  if (found === undefined) {
    throw new Error(`unknown skill ${RISK}`);
  }
  return found;
}

describe("Calculated Risk (#2471)", () => {
  it("is the corpus's: Illusion Magic, 10 Energy, 1 s, 12 s, a hex on a foe", () => {
    expect(risk()).toMatchObject({
      gwId: 2053,
      type: "hex",
      elite: false,
      attributeId: ILLUSION,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 12,
      range: RANGE_SPELL,
      target: "single-enemy",
    });
  });

  it.each([
    [0, 3, 15],
    // 10.2 s, to the whole second as every duration.
    [12, 10, 51],
  ])("at rank %i lasts %f s and caps a backfire at %i", (rank, seconds, cap) => {
    const sim = fight(rank);
    stepFor(sim, 1.1);
    const hex = sim.get("warrior")?.combatant.statuses.get("calculated-risk");
    expect(hex?.durationSeconds).toBe(seconds);
    expect(
      describeSkill(risk(), new Map([[ILLUSION, rank]]))
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain(`up to ${String(cap)}`);
  });

  it("turns some of the hexed Warrior's blows on itself, and lands the rest", () => {
    const sim = fight(12);
    stepFor(sim, 1.1);
    expect(sim.requestAttack("warrior", "dummy")).toEqual({ ok: true });
    const damaged = stepFor(sim, 9)
      .filter((entry) => entry.skillId === undefined)
      .flatMap((entry) => entry.events)
      .flatMap((event) => (event.kind === "damage" ? [event.targetId] : []));
    expect(damaged).toContain("warrior");
    expect(damaged).toContain("dummy");
  });
});
