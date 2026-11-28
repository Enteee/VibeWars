import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getStatusDefinition, NO_RANKS, wholeSeconds, type StatusId } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * GW1 audit (#4165): the hexes the `Death` page lists end on every bearer
 * when their caster dies, and a modified duration rounds to a whole second.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SLOW: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: true,
};

/** The GW1 `Death` page's "Hexes that are automatically removed when the caster dies". */
const CASTER_BOUND: readonly StatusId[] = [
  "insidious-parasite",
  "life-siphon",
  "life-transfer",
  "parasitic-bond",
  "spinal-shivers",
  "mind-wrack",
  "expose-defenses",
  "siphon-speed",
  "siphon-strength",
];

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

/**
 * `id` burns, bleeds and sickens to death this tick: its siphons on two
 * foes regenerate it more than a burn alone takes (#4167).
 */
function kill(sim: MatchSimulation, id: string): void {
  const combatant = get(sim, id);
  for (const condition of ["burning", "bleeding", "poison", "disease"] as const) {
    combatant.statuses.apply(condition, 10, "x", NO_RANKS);
  }
  combatant.health = 0.2;
  sim.step(DT);
  expect(combatant.dead).toBe(true);
}

describe("caster-bound hexes (#4165)", () => {
  it.each(CASTER_BOUND)("%s ends when its caster dies", (id) => {
    expect(getStatusDefinition(id).endsOnSourceDeath).toBe(true);
  });

  it("flags no other status", () => {
    expect(getStatusDefinition("barbs").endsOnSourceDeath).toBe(false);
    expect(getStatusDefinition("life-siphon-regen").endsOnSourceDeath).toBe(false);
  });

  /** `n` hexes both warriors with every caster-bound hex and Barbs. */
  function hexed(): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "caster-death-4165",
      matchRules: SLOW,
      participants: [
        spec("n", 0, vec2(0, 0)),
        spec("w", 1, vec2(300, 0)),
        spec("v", 1, vec2(300, 100)),
      ],
    });
    for (const target of ["w", "v"]) {
      for (const id of [...CASTER_BOUND, "barbs" as const]) {
        get(sim, target).statuses.apply(id, 30, "n", NO_RANKS);
      }
    }
    return sim;
  }

  it("comes off every bearer the tick its caster dies; Barbs stays", () => {
    const sim = hexed();
    kill(sim, "n");
    for (const target of ["w", "v"]) {
      const left = get(sim, target).statuses.active.map(({ id }) => id);
      expect(left).toEqual(["barbs"]);
    }
  });

  it("stays while its caster lives, and a hex by someone else stays at its death", () => {
    const sim = hexed();
    get(sim, "w").statuses.remove("life-siphon");
    get(sim, "w").statuses.apply("life-siphon", 30, "v", NO_RANKS);
    sim.step(DT);
    expect(get(sim, "v").statuses.has("life-siphon")).toBe(true);
    kill(sim, "n");
    expect(get(sim, "w").statuses.has("life-siphon")).toBe(true);
    expect(get(sim, "v").statuses.has("life-siphon")).toBe(false);
  });
});

describe("wholeSeconds (#4165)", () => {
  it("rounds a modified duration to a whole second, either way", () => {
    expect(wholeSeconds(11, 11 * 1.2)).toBe(13);
    // Barbed's 33% on a 7 s Bleeding: 9.31 s.
    expect(wholeSeconds(7, 7 * 1.33)).toBe(9);
    expect(wholeSeconds(8, 8 * 0.8)).toBe(6);
    expect(wholeSeconds(5, 5 * 1.5)).toBe(8);
  });

  it("leaves an unmodified duration as it is, fraction and all", () => {
    expect(wholeSeconds(6.37, 6.37)).toBe(6.37);
  });

  it("lands for 1 s rather than rounding to nothing, but keeps a full reduction at 0", () => {
    expect(wholeSeconds(1, 0.4)).toBe(1);
    expect(wholeSeconds(8, 0)).toBe(0);
  });
});
