import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { FLAG_STAND_ID } from "./carried.js";
import {
  BEACON_STRIKE_RADIUS,
  BEACON_STRIKE_SECONDS,
  UNOWNED_BEACON,
  stepBeacon,
} from "./beacon.js";
import { flagId, type FlagField } from "./flags.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** The Storm Beacon (#2694): a flag on its stand makes it strike the owner's foes in earshot. */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const STAND = vec2(1000, 300);

const FIELD: FlagField = {
  stand: STAND,
  beacon: true,
  spawns: [
    { team: 0, position: vec2(900, 300) },
    { team: 1, position: vec2(1100, 300) },
  ],
};

function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 40,
    spawn,
    facing: 0,
    maxHealth: 480,
  };
}

function match(participants: readonly ParticipantSpec[], seed = "beacon"): MatchSimulation {
  return new MatchSimulation({
    seed,
    bounds: { width: 2000, height: 600 },
    flagField: FIELD,
    participants,
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** The beacon's strikes over `seconds`, by who took them. */
function strikesOver(sim: MatchSimulation, seconds: number): string[] {
  const struck: string[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    for (const entry of sim.step(DT).log) {
      if (entry.cause === "skill" && entry.sourceId === undefined) {
        struck.push(
          ...entry.events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : [])),
        );
      }
    }
  }
  return struck;
}

/** `carrier` takes its team's flag and plants it on the stand. */
function plant(sim: MatchSimulation, carrier: string): void {
  const team = get(sim, carrier).combatant.team;
  applyIntent(sim, carrier, { kind: "target", targetSessionId: flagId(team) });
  applyIntent(sim, carrier, { kind: "attack", targetId: flagId(team) });
  for (let tick = 0; tick < 400 && !sim.carriesBundle(carrier); tick += 1) {
    sim.step(DT);
  }
  applyIntent(sim, carrier, { kind: "target", targetSessionId: FLAG_STAND_ID });
  applyIntent(sim, carrier, { kind: "attack", targetId: FLAG_STAND_ID });
  for (let tick = 0; tick < 400 && sim.stand?.holder !== team; tick += 1) {
    sim.step(DT);
  }
  expect(sim.stand?.holder).toBe(team);
}

describe("stepBeacon", () => {
  it("takes its owner from the stand and strikes one beat after the taking", () => {
    const taken = stepBeacon(UNOWNED_BEACON, 0, DT);
    expect(taken).toEqual({ state: { owner: 0, chargedSeconds: 0 }, strikes: false });
    let state = taken.state;
    let strikes = 0;
    for (let tick = 0; tick < Math.round(BEACON_STRIKE_SECONDS / DT); tick += 1) {
      const step = stepBeacon(state, 0, DT);
      state = step.state;
      strikes += step.strikes ? 1 : 0;
    }
    expect(strikes).toBe(1);
  });

  it("starts the beat again when another team takes the stand", () => {
    const step = stepBeacon({ owner: 0, chargedSeconds: 2.4 }, 1, DT);
    expect(step).toEqual({ state: { owner: 1, chargedSeconds: 0 }, strikes: false });
  });

  it("never strikes unowned", () => {
    expect(stepBeacon(UNOWNED_BEACON, undefined, 100).strikes).toBe(false);
  });
});

describe("the Storm Beacon in a match", () => {
  const owner = body("a", 0, vec2(890, 300));
  const near = body("x", 1, vec2(1000 + BEACON_STRIKE_RADIUS - 50, 300));
  const far = body("y", 1, vec2(1000 + BEACON_STRIKE_RADIUS + 200, 300));

  it("strikes a foe in earshot once per beat, and spares the one out of it and the owner", () => {
    const sim = match([owner, near, far]);
    plant(sim, "a");
    expect(strikesOver(sim, BEACON_STRIKE_SECONDS * 3)).toEqual(["x", "x", "x"]);
    expect(get(sim, "x").combatant.health).toBeLessThan(480);
    expect(get(sim, "y").combatant.health).toBe(480);
    expect(get(sim, "a").combatant.health).toBe(480);
  });

  it("casts nothing with no foe in earshot", () => {
    const sim = match([owner, far]);
    plant(sim, "a");
    expect(strikesOver(sim, BEACON_STRIKE_SECONDS * 3)).toEqual([]);
  });

  it("turns on the other team when it takes the stand", () => {
    const foe = body("x", 1, vec2(1110, 300));
    const sim = match([owner, foe]);
    plant(sim, "a");
    plant(sim, "x");
    expect(new Set(strikesOver(sim, BEACON_STRIKE_SECONDS * 2))).toEqual(new Set(["a"]));
  });

  it("is deterministic per seed", () => {
    const play = (): string[] => {
      const sim = match([owner, near, body("z", 1, vec2(1000, 100))]);
      plant(sim, "a");
      return strikesOver(sim, BEACON_STRIKE_SECONDS * 8);
    };
    const first = play();
    expect(new Set(first)).toEqual(new Set(["x", "z"]));
    expect(play()).toEqual(first);
  });

  it("gives no morale boost for holding it", () => {
    const sim = match([owner, far]);
    plant(sim, "a");
    strikesOver(sim, 125);
    expect(get(sim, "a").combatant.morale).toBe(0);
  });
});
