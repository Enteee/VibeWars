import { describe, expect, it } from "vitest";

import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Elementalist condition staples in a match (#997): Water Trident
 * flies at a walking foe and a still one, Ebon Hawk sets up Stoning, and
 * Searing Flames burns, then strikes.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WATER_TRIDENT = "elementalist.water-trident";
const EBON_HAWK = "elementalist.ebon-hawk";
const STONING = "elementalist.stoning";
const SEARING_FLAMES = "elementalist.searing-flames";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [WATER_TRIDENT, EBON_HAWK, STONING, SEARING_FLAMES],
    attributeRanks: new Map([
      ["elementalist.water-magic", 12],
      ["elementalist.earth-magic", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 100,
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.elementalist,
  };
}

/** Elementalist `e` at the origin, foe `t` 300 away, each targeting the other. */
function arena(): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "conditions",
    participants: [spec("e", 0, vec2(0, 0)), spec("t", 1, vec2(300, 0))],
  });
  sim.setTarget("e", "t");
  sim.setTarget("t", "e");
  return sim;
}

function combatant(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Use `e`'s skill in `slot` and step until `skillId` lands on `t`: its log entry. */
function use(sim: MatchSimulation, slot: number, skillId: string): CombatLogEntry {
  expect(sim.requestSkill("e", slot)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 4 / DT; tick += 1) {
    const entry = sim
      .step(DT)
      .log.find(
        (logged) =>
          logged.skillId === skillId && logged.events.some((event) => event.kind === "damage"),
      );
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** Step `seconds` of match time. */
function wait(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    sim.step(DT);
  }
}

const kinds = (entry: CombatLogEntry): string[] => entry.events.map((event) => event.kind);

describe("Water Trident in flight (#997)", () => {
  it("leads a foe walking across the line, hits, and knocks it down", () => {
    const sim = arena();
    sim.setInputDirection("t", vec2(0, 1));
    const entry = use(sim, 0, WATER_TRIDENT);
    expect(kinds(entry)).toEqual(["damage", "knocked-down"]);
    expect(combatant(sim, "t").knockdownRemaining).toBeGreaterThan(0);
  });

  it("hits a foe standing still, who stays up", () => {
    const sim = arena();
    const entry = use(sim, 0, WATER_TRIDENT);
    expect(kinds(entry)).toEqual(["damage"]);
    expect(combatant(sim, "t").knockdownRemaining).toBe(0);
  });
});

describe("Ebon Hawk, then Stoning (#997)", () => {
  it("the hawk weakens, and the stone knocks the Weakened foe down", () => {
    const sim = arena();
    use(sim, 1, EBON_HAWK);
    expect(combatant(sim, "t").statuses.has("weakness")).toBe(true);
    const entry = use(sim, 2, STONING);
    expect(kinds(entry)).toEqual(["damage", "knocked-down"]);
  });

  it("the stone alone does not knock down", () => {
    const sim = arena();
    const entry = use(sim, 2, STONING);
    expect(kinds(entry)).toEqual(["damage"]);
  });

  it("a Weakened foe mid-cast loses its cast to the stone", () => {
    const sim = arena();
    combatant(sim, "t").statuses.apply("weakness", 20, "e", NO_RANKS);
    expect(sim.requestSkill("e", 2)?.check).toEqual({ ok: true });
    wait(sim, 0.5);
    // The foe starts a 1 s Searing Flames; the stone lands before it ends.
    expect(sim.requestSkill("t", 3)?.check).toEqual({ ok: true });
    for (let tick = 0; tick < 2 / DT; tick += 1) {
      sim.step(DT);
      if (combatant(sim, "t").knockdownRemaining > 0) {
        break;
      }
    }
    const foe = combatant(sim, "t");
    expect(foe.knockdownRemaining).toBeGreaterThan(0);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(foe.cast.rechargeRemaining.get(SEARING_FLAMES)).toBeGreaterThan(0);
  });
});

describe("Searing Flames twice (#997)", () => {
  it("the first burns, the second, 2 s later, strikes", () => {
    const sim = arena();
    expect(sim.requestSkill("e", 3)?.check).toEqual({ ok: true });
    let first: CombatLogEntry | undefined;
    for (let tick = 0; tick < 2 / DT && first === undefined; tick += 1) {
      first = sim.step(DT).log.find((logged) => logged.skillId === SEARING_FLAMES);
    }
    expect(first === undefined ? [] : kinds(first)).toEqual(["skill-used", "status-applied"]);
    expect(combatant(sim, "t").statuses.has("burning")).toBe(true);
    wait(sim, 2);
    const second = use(sim, 3, SEARING_FLAMES);
    expect(kinds(second)).toEqual(["skill-used", "damage"]);
  });
});
