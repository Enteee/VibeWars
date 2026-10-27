import { describe, expect, it } from "vitest";

import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { Combatant } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const NEVER_SURRENDER = "paragon.never-surrender";
const LEADERS_COMFORT = "paragon.leaders-comfort";

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

/** A rank-12 Paragon at the origin with `skillId` in slot 0. */
function paragon(skillId: string): ParticipantSpec {
  return {
    ...bystander("p", 0, vec2(0, 0)),
    skillBar: [skillId],
    attributeRanks: new Map([
      ["paragon.command", 12],
      ["paragon.leadership", 12],
    ]),
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Steps until `skillId` has resolved, and returns the events it logged. */
function useSkill(match: MatchSimulation, skillId: string) {
  expect(match.requestSkill("p", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 5 * RULES.tickRateHz; tick++) {
    const entry = match.step(DT).log.find((row) => row.skillId === skillId);
    if (entry !== undefined) {
      return entry.events;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

describe('"Never Surrender!" (#923)', () => {
  it("gives +4 pips for 10 s to allies in earshot below 75% Health only", () => {
    const match = new MatchSimulation({
      seed: "never-surrender",
      participants: [
        paragon(NEVER_SURRENDER),
        bystander("hurt", 0, vec2(100, 0)),
        bystander("healthy", 0, vec2(0, 100)),
        bystander("exactly", 0, vec2(-100, 0)),
        bystander("far", 0, vec2(0, -(AREA_EARSHOT + 10))),
        bystander("foe", 1, vec2(40, 0)),
      ],
    });
    get(match, "hurt").combatant.health = 500;
    get(match, "healthy").combatant.health = 800;
    get(match, "exactly").combatant.health = 750;
    get(match, "far").combatant.health = 500;
    get(match, "foe").combatant.health = 500;

    const events = useSkill(match, NEVER_SURRENDER);

    expect(events.filter((event) => event.kind === "status-applied")).toEqual([
      {
        kind: "status-applied",
        targetId: "hurt",
        statusId: "never-surrender",
        durationSeconds: 10,
      },
    ]);
    for (const id of ["p", "healthy", "exactly", "far", "foe"]) {
      expect(get(match, id).combatant.statuses.has("never-surrender"), id).toBe(false);
    }
  });

  it("regenerates 8 Health a second, and stays on once healed above 75%", () => {
    const match = new MatchSimulation({
      seed: "never-surrender",
      participants: [paragon(NEVER_SURRENDER), bystander("hurt", 0, vec2(100, 0))],
    });
    const hurt = get(match, "hurt").combatant;
    hurt.health = 500;
    useSkill(match, NEVER_SURRENDER);
    hurt.health = 900;
    for (let tick = 0; tick < RULES.tickRateHz; tick++) {
      match.step(DT);
    }
    expect(hurt.statuses.has("never-surrender")).toBe(true);
    expect(hurt.health).toBeCloseTo(908, 0);
  });
});

describe("Leader's Comfort (#923)", () => {
  /** The Paragon at 100 Health uses it among `others`; what it healed itself for. */
  function comfort(others: readonly ParticipantSpec[], prepare?: (match: MatchSimulation) => void) {
    const match = new MatchSimulation({
      seed: "leaders-comfort",
      participants: [paragon(LEADERS_COMFORT), ...others],
    });
    get(match, "p").combatant.health = 100;
    prepare?.(match);
    const events = useSkill(match, LEADERS_COMFORT);
    return events.flatMap((event) =>
      event.kind === "heal" && event.targetId === "p" ? [event.amount] : [],
    );
  }

  const allies = (count: number): ParticipantSpec[] =>
    Array.from({ length: count }, (_, i) => bystander(`a${String(i)}`, 0, vec2(50 * (i + 1), 0)));

  it("heals 66 + 18 per ally in earshot, itself included: 84 alone, 102 with one", () => {
    expect(comfort([])).toEqual([84]);
    expect(comfort(allies(1))).toEqual([102]);
    expect(comfort(allies(3))).toEqual([138]);
  });

  it("heals at most 140", () => {
    expect(comfort(allies(4))).toEqual([140]);
    expect(comfort(allies(5))).toEqual([140]);
  });

  it("counts no foe and no ally outside earshot", () => {
    expect(
      comfort([bystander("foe", 1, vec2(0, 50)), bystander("far", 0, vec2(AREA_EARSHOT + 10, 0))]),
    ).toEqual([84]);
  });

  it("counts no dead ally", () => {
    let dead: Combatant | undefined;
    const heals = comfort([bystander("dead", 0, vec2(50, 0))], (match) => {
      // Burning at 0.2 Health kills on the first tick, as a death does.
      dead = get(match, "dead").combatant;
      dead.statuses.apply("burning", 10, "foe");
      dead.health = 0.2;
    });
    expect(dead?.dead).toBe(true);
    expect(heals).toEqual([84]);
  });

  it("caps before a Deep Wound's −20% healing", () => {
    const heals = comfort(allies(5), (match) => {
      get(match, "p").combatant.statuses.apply("deep-wound", 20, "foe");
    });
    expect(heals).toEqual([140 * 0.8]);
  });
});
