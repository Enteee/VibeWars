import { describe, expect, it } from "vitest";

import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WATCH_YOURSELF = "warrior.watch-yourself";

/** A shouter with "Watch Yourself!" in slot 0 and this much Leadership. */
function shouter(leadership: number): ParticipantSpec {
  return {
    ...bystander("s", 0, vec2(0, 0)),
    skillBar: [WATCH_YOURSELF],
    attributeRanks: new Map([
      ["warrior.tactics", 12],
      ["paragon.leadership", leadership],
    ]),
  };
}

function bystander(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/**
 * The shouter, out of energy, shouts beside two allies in earshot, one
 * outside it and a foe; what it gained, and the shout's energy events.
 * `missing` is how far below its maximum it starts: all of it by default.
 */
function shout(leadership: number, missing?: number) {
  const match = new MatchSimulation({
    seed: "leadership",
    participants: [
      shouter(leadership),
      bystander("near", 0, vec2(AREA_EARSHOT - 10, 0)),
      bystander("close", 0, vec2(0, 100)),
      bystander("far", 0, vec2(0, -(AREA_EARSHOT + 10))),
      bystander("foe", 1, vec2(40, 0)),
    ],
  });
  const caster = get(match, "s").combatant;
  chargeAdrenaline(caster);
  const energy = missing === undefined ? 0 : caster.maxEnergy - missing;
  caster.energy = energy;
  expect(match.requestSkill("s", 0)?.check).toEqual({ ok: true });
  const { log } = match.step(DT);
  const entry = log.find((row) => row.skillId === WATCH_YOURSELF);
  return {
    gained: caster.energy - energy,
    gains: (entry?.events ?? []).filter((event) => event.kind === "energy-gain"),
  };
}

describe("Leadership (#625)", () => {
  it("gives 1 energy per ally a shout affects, the shouter included: 3 at rank 12", () => {
    const { gained, gains } = shout(12);
    expect(gained).toBe(3);
    expect(gains).toEqual([{ kind: "energy-gain", targetId: "s", amount: 3 }]);
  });

  it("caps the gain at 1 for every 2 ranks", () => {
    expect(shout(2).gained).toBe(1);
    expect(shout(5).gained).toBe(2);
  });

  it("gives nothing without Leadership, as to a Warrior primary", () => {
    const { gained, gains } = shout(0);
    expect(gained).toBe(0);
    expect(gains).toEqual([]);
  });

  it("fills no further than maximum energy, and logs nothing at full", () => {
    expect(shout(12, 1).gains).toEqual([{ kind: "energy-gain", targetId: "s", amount: 1 }]);
    expect(shout(12, 0).gains).toEqual([]);
  });
});
