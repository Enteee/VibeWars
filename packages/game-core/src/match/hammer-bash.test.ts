import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { KNOCKDOWN_SECONDS } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Hammer Bash in a match (#1097): "Lose all adrenaline. If Hammer Bash
 * hits, your target is knocked down." Backbreaker and "Watch Yourself!"
 * sit on the bar, charged, so their pools show the loss.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const HAMMER_BASH = "warrior.hammer-bash";
const BACKBREAKER = "warrior.backbreaker";
const WATCH_YOURSELF = "warrior.watch-yourself";

const HAMMER: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.hammer,
    attributeId: "warrior.hammer-mastery",
    damageType: WEAPONS.hammer.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [HAMMER_BASH, BACKBREAKER, WATCH_YOURSELF],
    attributeRanks: new Map([["warrior.hammer-mastery", 12]]),
    equipment: HAMMER,
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
  };
}

/** Warrior `w`, every pool full, beside its target `t`. */
function arena(seed = "hammer-bash"): MatchSimulation {
  const sim = new MatchSimulation({
    seed,
    participants: [spec("w", 0, vec2(0, 0)), spec("t", 1, vec2(AREA_ADJACENT - 10, 0))],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e6;
    participant.combatant.health = 1e6;
  }
  const warrior = combatant(sim, "w");
  warrior.adrenaline.set(HAMMER_BASH, 6 * ADRENALINE_PER_STRIKE);
  warrior.adrenaline.set(BACKBREAKER, 9 * ADRENALINE_PER_STRIKE);
  warrior.adrenaline.set(WATCH_YOURSELF, 4 * ADRENALINE_PER_STRIKE);
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

/** Use `w`'s Hammer Bash and step until it resolves: its log entry. */
function bash(sim: MatchSimulation): CombatLogEntry {
  expect(sim.requestSkill("w", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 3 / DT; tick += 1) {
    const entry = sim.step(DT).log.find(({ skillId }) => skillId === HAMMER_BASH);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error("Hammer Bash never resolved");
}

const pools = (sim: MatchSimulation): number[] => [...combatant(sim, "w").adrenaline.values()];

describe("Hammer Bash (#1097)", () => {
  it("empties every pool, earns none back, and knocks its target down for 2 s", () => {
    const sim = arena();
    const entry = bash(sim);
    expect(entry.events.some(({ kind }) => kind === "damage")).toBe(true);
    expect(pools(sim)).toEqual([0, 0, 0]);
    const knockdown = combatant(sim, "t").knockdownRemaining;
    expect(knockdown).toBeLessThanOrEqual(KNOCKDOWN_SECONDS);
    expect(knockdown).toBeGreaterThan(KNOCKDOWN_SECONDS - 2 * DT);
  });

  it("still in combat after it: the loss is no 25 s out of combat (#828)", () => {
    const sim = arena();
    // A second in, so the stamp is not the 0 it starts at.
    for (let tick = 0; tick < 1 / DT; tick += 1) {
      sim.step(DT);
    }
    bash(sim);
    expect(combatant(sim, "w").lastCombatAt).toBeGreaterThanOrEqual(1 - DT);
    expect(combatant(sim, "t").lastCombatAt).toBeGreaterThanOrEqual(1 - DT);
  });

  it("blocked, it still empties every pool and knocks nobody down", () => {
    // The first seed under which Guardian blocks the blow.
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`block-${String(seed)}`);
      combatant(sim, "t").statuses.apply("guardian", 6, "t", NO_RANKS);
      const entry = bash(sim);
      if (entry.events.some(({ kind }) => kind === "attack-blocked")) {
        expect(pools(sim)).toEqual([0, 0, 0]);
        expect(combatant(sim, "t").knockdownRemaining).toBe(0);
        return;
      }
    }
    throw new Error("Guardian never blocked");
  });

  it('under "For Great Justice!" its blow still earns nothing', () => {
    const sim = arena();
    combatant(sim, "w").statuses.apply("for-great-justice", 8, "w", NO_RANKS);
    bash(sim);
    expect(pools(sim)).toEqual([0, 0, 0]);
  });
});
