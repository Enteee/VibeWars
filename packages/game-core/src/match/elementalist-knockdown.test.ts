import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Shock into Aftershock, and Meteor through a cast, in a match (#985):
 * the knockdown one skill lands is what the next one reads.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHOCK = "elementalist.shock";
const AFTERSHOCK = "elementalist.aftershock";
const METEOR = "elementalist.meteor";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [SHOCK, AFTERSHOCK, METEOR],
    attributeRanks: new Map([
      ["elementalist.air-magic", 12],
      ["elementalist.earth-magic", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.elementalist,
  };
}

/** Elementalist `e` at the origin; foe `t` at touch, foe `side` nearby, not touched. */
function arena(): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "aftershock",
    participants: [
      spec("e", 0, vec2(0, 0)),
      spec("t", 1, vec2(RANGE_MELEE - 10, 0)),
      spec("side", 1, vec2(0, AREA_NEARBY - 10)),
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e6;
    participant.combatant.health = 1e6;
  }
  return sim;
}

function combatant(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Use `id`'s skill in `slot` and step until `skillId` resolves: its log entry. */
function use(sim: MatchSimulation, id: string, slot: number, skillId: string): CombatLogEntry {
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 4 / DT; tick += 1) {
    const entry = sim.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

const damageTo = (entry: CombatLogEntry, targetId: string): number[] =>
  entry.events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

describe("Shock, then Aftershock (#985)", () => {
  it("lands Aftershock's bonus on the foe Shock knocked down, not on the one standing", () => {
    const sim = arena();
    sim.setTarget("e", "t");
    use(sim, "e", 0, SHOCK);
    expect(combatant(sim, "t").knockdownRemaining).toBeGreaterThan(0);

    const entry = use(sim, "e", 1, AFTERSHOCK);
    expect(combatant(sim, "t").knockdownRemaining).toBeGreaterThan(0);
    expect(damageTo(entry, "t")).toHaveLength(2);
    expect(damageTo(entry, "side")).toHaveLength(1);
    expect(damageTo(entry, "e")).toEqual([]);
  });

  it("without a knockdown, each foe takes only the first strike", () => {
    const sim = arena();
    const entry = use(sim, "e", 1, AFTERSHOCK);
    expect(damageTo(entry, "t")).toHaveLength(1);
    expect(damageTo(entry, "side")).toHaveLength(1);
  });
});

describe("Meteor (#985)", () => {
  it("knocks a casting foe out of its cast, which recharges", () => {
    const sim = arena();
    sim.setTarget("e", "t");
    sim.setTarget("t", "e");
    expect(sim.requestSkill("e", 2)?.check).toEqual({ ok: true });
    // Half a second later the foe starts its own Meteor, which would end
    // half a second after the elementalist's.
    for (let tick = 0; tick < 0.5 / DT; tick += 1) {
      sim.step(DT);
    }
    expect(sim.requestSkill("t", 2)?.check).toEqual({ ok: true });
    for (let tick = 0; tick < 2 / DT; tick += 1) {
      sim.step(DT);
      if (combatant(sim, "t").knockdownRemaining > 0) {
        break;
      }
    }
    const foe = combatant(sim, "t");
    expect(foe.knockdownRemaining).toBeGreaterThan(0);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(foe.cast.rechargeRemaining.get(METEOR)).toBeGreaterThan(0);
    expect(combatant(sim, "e").knockdownRemaining).toBe(0);
  });
});
