import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { strikesOf } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Cyclone Axe and "For Great Justice!" in a match (#936): who the spin
 * hits, and the adrenaline each hit earns. Backbreaker sits on the bar
 * only so its pool shows the strikes.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CYCLONE_AXE = "warrior.cyclone-axe";
const FGJ = "warrior.for-great-justice";
const BACKBREAKER = "warrior.backbreaker";

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [CYCLONE_AXE, FGJ, BACKBREAKER],
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
    equipment: AXE,
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
  };
}

/**
 * Warrior `w` at the origin; foe `t`, its target, and foe `side` both
 * adjacent; foe `far` at twice adjacent; ally `pal` adjacent. `alone`:
 * `t` is the only foe.
 */
function arena(seed = "cyclone", alone = false): MatchSimulation {
  const sim = new MatchSimulation({
    seed,
    participants: [
      spec("w", 0, vec2(0, 0)),
      spec("t", 1, vec2(AREA_ADJACENT - 10, 0)),
      ...(alone
        ? []
        : [
            spec("side", 1, vec2(0, AREA_ADJACENT - 10)),
            spec("far", 1, vec2(2 * AREA_ADJACENT, 0)),
            spec("pal", 0, vec2(-(AREA_ADJACENT - 10), 0)),
          ]),
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e6;
    participant.combatant.health = 1e6;
  }
  sim.setTarget("w", "t");
  return sim;
}

function combatant(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Use `w`'s Cyclone Axe and step until it resolves: its log entry. */
function spin(sim: MatchSimulation): CombatLogEntry {
  expect(sim.requestSkill("w", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 3 / DT; tick += 1) {
    const entry = sim.step(DT).log.find(({ skillId }) => skillId === CYCLONE_AXE);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error("Cyclone Axe never resolved");
}

const damaged = (entry: CombatLogEntry): string[] =>
  entry.events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : [])).sort();

describe("Cyclone Axe (#936)", () => {
  it("hits its target and every other adjacent foe, not one farther off nor an ally", () => {
    const sim = arena();
    const entry = spin(sim);
    expect(damaged(entry)).toEqual(["side", "t"]);
    expect(combatant(sim, "far").health).toBe(1e6);
    expect(combatant(sim, "pal").health).toBe(1e6);
  });

  it("earns a strike of adrenaline for each foe it lands on", () => {
    const sim = arena();
    spin(sim);
    expect(strikesOf(combatant(sim, "w"), BACKBREAKER)).toBe(2);
  });
});

describe('"For Great Justice!" (#936)', () => {
  it("is 8 s of one more strike per hit: Cyclone Axe on two foes earns four", () => {
    const sim = arena();
    expect(sim.requestSkill("w", 1)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(combatant(sim, "w").statuses.active.map(({ id }) => id)).toEqual(["for-great-justice"]);
    expect(combatant(sim, "w").statuses.get("for-great-justice")?.remainingSeconds).toBeCloseTo(
      8,
      6,
    );
    spin(sim);
    expect(strikesOf(combatant(sim, "w"), BACKBREAKER)).toBe(4);
  });

  it("earns nothing for a blocked blow", () => {
    // The first seed under which Guardian blocks the lone target's blow.
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`block-${String(seed)}`, true);
      combatant(sim, "t").statuses.apply("guardian", 6, "t", NO_RANKS);
      combatant(sim, "w").statuses.apply("for-great-justice", 8, "w", NO_RANKS);
      const entry = spin(sim);
      if (entry.events.some(({ kind }) => kind === "attack-blocked")) {
        expect(damaged(entry)).toEqual([]);
        expect(strikesOf(combatant(sim, "w"), BACKBREAKER)).toBe(0);
        return;
      }
    }
    throw new Error("Guardian never blocked");
  });

  it("does not add to the adrenaline its bearer gains from being hit", () => {
    const taken = (justice: boolean): number => {
      const sim = arena();
      const warrior = combatant(sim, "w");
      warrior.maxHealth = 100;
      warrior.health = 100;
      if (justice) {
        warrior.statuses.apply("for-great-justice", 8, "w", NO_RANKS);
      }
      sim.setTarget("w", undefined);
      expect(sim.requestAttack("t", "w")).toEqual({ ok: true });
      for (let tick = 0; tick < 3 / DT; tick += 1) {
        sim.step(DT);
      }
      expect(warrior.health).toBeLessThan(100);
      return warrior.adrenaline.get(BACKBREAKER) ?? 0;
    };
    expect(taken(false)).toBeGreaterThan(0);
    expect(taken(true)).toBe(taken(false));
  });
});
