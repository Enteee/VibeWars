import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { swingIntervalSeconds } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";

/**
 * An interrupt stops a plain swing (#1709): GW1 interrupts "all attacks".
 * A foe swinging at the Mesmer is hit by Leech Signet mid-swing: the blow
 * under way never lands, and the next waits a whole interval from then.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const LEECH_SIGNET = "mesmer.leech-signet";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** `m`, unarmed with Leech Signet, at the origin; `a`, an axe, beside it. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "interrupt-swing",
    participants: [
      {
        id: "m",
        team: 1,
        skillBar: [LEECH_SIGNET],
        attributeRanks: new Map([["mesmer.inspiration-magic", 12]]),
        equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        maxHealth: 1e6,
        maxEnergy: 1000,
        spawn: vec2(0, 0),
        facing: 0,
      },
      {
        id: "a",
        team: 0,
        skillBar: [],
        attributeRanks: new Map([["warrior.axe-mastery", 12]]),
        equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
        maxHealth: 1e4,
        maxEnergy: 1000,
        spawn: vec2(35, 0),
        facing: 0,
      },
    ],
  });
}

function attacker(sim: MatchSimulation) {
  const found = sim.get("a");
  if (found === undefined) {
    throw new Error("no participant a");
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Whether a swing of `a`'s landed on `m` in `log`, hit or miss. */
function swung(log: readonly CombatLogEntry[]): boolean {
  return log.some((entry) => entry.cause === "weapon" && entry.sourceId === "a");
}

function events(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

describe("interrupting a plain swing (#1709)", () => {
  it("drops the blow under way, and the next lands a whole interval later", () => {
    const sim = match();
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const interval = swingIntervalSeconds(attacker(sim));
    // Halfway into a swing, and none landed yet.
    let before: CombatLogEntry[] = [];
    while ((attacker(sim).attack?.swingElapsed ?? 0) < interval / 2) {
      before = before.concat(stepFor(sim, DT));
    }
    expect(swung(before)).toBe(false);

    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    let cast: CombatLogEntry[] = [];
    while (events(cast, LEECH_SIGNET).length === 0) {
      cast = cast.concat(stepFor(sim, DT));
    }
    expect(events(cast, LEECH_SIGNET)).toContainEqual({
      kind: "attack-interrupted",
      targetId: "a",
    });
    expect(attacker(sim).attack?.targetId).toBe("m");

    // The interrupted blow would have landed within half an interval.
    expect(swung(cast.concat(stepFor(sim, interval - 3 * DT)))).toBe(false);
    expect(swung(stepFor(sim, 4 * DT))).toBe(true);
  });
});
