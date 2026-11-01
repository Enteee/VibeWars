import { describe, expect, it } from "vitest";

import { RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

/** A participant on `team` with this much Soul Reaping, 100 max energy and no regeneration. */
function spec(id: string, team: number, spawn: Vec2, soulReaping = 0): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map([["necromancer.soul-reaping", soulReaping]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** Necromancer `n` with Soul Reaping 12 at the origin, out of energy, and these others. */
function withNecromancer(...others: ParticipantSpec[]): MatchSimulation {
  const match = new MatchSimulation({
    seed: "soul-reaping",
    participants: [spec("n", 0, vec2(0, 0), 12), ...others],
  });
  get(match, "n").combatant.energy = 0;
  return match;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** Set these participants burning on almost no health, so they die on the next step. */
function doom(match: MatchSimulation, ...ids: string[]): void {
  for (const id of ids) {
    const { combatant } = get(match, id);
    combatant.statuses.apply("burning", 10, "n", NO_RANKS);
    combatant.health = 0.2;
  }
}

/** Kill these participants on one step, and say how much energy `n` has after it. */
function kill(match: MatchSimulation, ...ids: string[]): number {
  doom(match, ...ids);
  match.step(DT);
  for (const id of ids) {
    expect(get(match, id).combatant.dead).toBe(true);
  }
  return get(match, "n").combatant.energy;
}

/** Four bystanders, two foes and two allies, near the necromancer. */
const NEARBY = [
  spec("f1", 1, vec2(200, 0)),
  spec("f2", 1, vec2(0, 200)),
  spec("a1", 0, vec2(-200, 0)),
  spec("a2", 0, vec2(0, -200)),
];

describe("Soul Reaping (#530)", () => {
  it("gives its rank in energy when a foe or an ally dies within spirit range", () => {
    const match = withNecromancer(...NEARBY);
    expect(kill(match, "f1")).toBe(12);
    expect(kill(match, "a1")).toBe(24);
  });

  it("gives nothing for a death beyond spirit range", () => {
    const match = withNecromancer(spec("far", 1, vec2(RANGE_SPIRIT + 1, 0)));
    expect(kill(match, "far")).toBe(0);
    expect(get(match, "n").combatant.soulReapingTriggers).toEqual([]);
  });

  it("stops at maximum energy", () => {
    const match = withNecromancer(...NEARBY);
    get(match, "n").combatant.energy = 95;
    expect(kill(match, "f1")).toBe(100);
  });

  it("triggers 3 times in 15 s: a 4th death gives nothing, one after the first's 15 s does", () => {
    const match = withNecromancer(...NEARBY);
    expect(kill(match, "f1")).toBe(12);
    stepFor(match, 5);
    expect(kill(match, "f2")).toBe(24);
    stepFor(match, 5);
    expect(kill(match, "a1")).toBe(36);
    stepFor(match, 4);
    expect(kill(match, "a2")).toBe(36);

    const fresh = withNecromancer(...NEARBY);
    expect(kill(fresh, "f1")).toBe(12);
    stepFor(fresh, 5);
    expect(kill(fresh, "f2")).toBe(24);
    stepFor(fresh, 5);
    expect(kill(fresh, "a1")).toBe(36);
    stepFor(fresh, 5.05);
    expect(kill(fresh, "a2")).toBe(48);
  });

  it("counts two deaths on one step as two triggers", () => {
    const match = withNecromancer(...NEARBY);
    expect(kill(match, "f1", "f2")).toBe(24);
  });

  it("gives nothing for the necromancer's own death, nor to a dead necromancer", () => {
    const match = withNecromancer(...NEARBY);
    expect(kill(match, "n")).toBe(0);
    expect(kill(match, "f1")).toBe(0);
    expect(get(match, "n").combatant.soulReapingTriggers).toEqual([]);
  });

  it("keeps its triggers across a respawn", () => {
    const match = withNecromancer(...NEARBY);
    kill(match, "f1", "f2", "a1");
    match.resetParticipant("n");
    const { combatant } = get(match, "n");
    combatant.energy = 0;
    expect(kill(match, "a2")).toBe(0);
  });

  it('logs each gain as an "attribute" entry after the death, and none at full energy (#633)', () => {
    const match = withNecromancer(...NEARBY);
    doom(match, "f1");
    const { log } = match.step(DT);
    const reaped = log.filter((entry) => entry.cause === "attribute");
    expect(reaped).toEqual([
      expect.objectContaining({
        sourceId: "n",
        skillId: undefined,
        weaponId: undefined,
        attributeId: "necromancer.soul-reaping",
        events: [{ kind: "energy-gain", targetId: "n", amount: 12 }],
      }),
    ]);
    const death = log.findIndex((entry) => entry.events.some((event) => event.kind === "death"));
    expect(death).toBeGreaterThanOrEqual(0);
    expect(log.findIndex((entry) => entry.cause === "attribute")).toBeGreaterThan(death);

    get(match, "n").combatant.energy = 100;
    doom(match, "f2");
    expect(match.step(DT).log.filter((entry) => entry.cause === "attribute")).toEqual([]);
  });
});
