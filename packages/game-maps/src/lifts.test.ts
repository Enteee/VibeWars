import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  resolveLoadout,
  switchTargetId,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { mapSimulationFields } from "./match-fields.js";
import { validateMapData } from "./schema.js";
import liftsData from "../test-maps/lifts/map.json" with { type: "json" };

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
const MAP = validateMapData(liftsData);

const build = STARTER_BUILDS[0];
if (build === undefined) throw new Error("no starter build");
const loadout = loadoutOf(build);
const resolved = resolveLoadout(
  {
    primaryProfession: loadout.primaryProfession,
    secondaryProfession: loadout.secondaryProfession,
    allocatedRanks: loadout.attributeRanks,
    equipment: loadout.equipment,
  },
  RULESET.combat,
);

/** A body with no skills at (`x`, `y`) on `layer`; team 1 is the foe that keeps the match going. */
function body(id: string, x: number, y: number, layer: number, team = 0): ParticipantSpec {
  return {
    id,
    team,
    layer,
    skillBar: [],
    attributeRanks: resolved.attributeRanks,
    equipment: resolved.weaponSets[0].equipment,
    baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
    maxHealth: 1e6,
    spawn: { x, y },
    facing: 0,
  };
}

/** A match on the lifts test map with `bodies`, a foe far off in its corner. */
function arena(bodies: readonly ParticipantSpec[], seed = "lifts"): MatchSimulation {
  return new MatchSimulation({
    seed,
    ruleset: RULESET,
    ...mapSimulationFields(MAP, 2),
    participants: [...bodies, body("foe", 1500, 900, 0, 1)],
  });
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let t = 0; t < seconds - DT / 2; t += DT) {
    sim.step(DT);
  }
}

/** Where `id` stands and on which layer. */
function where(sim: MatchSimulation, id: string) {
  const record = sim.get(id);
  return { x: record?.position.x ?? Number.NaN, y: record?.position.y, layer: record?.layer };
}

/** Whether `id` stands in the timer lift, x 680..800 and y 300..400. */
function onTimerLift(sim: MatchSimulation, id: string): boolean {
  const { x, y = Number.NaN } = where(sim, id);
  return x >= 680 && x <= 800 && y >= 300 && y <= 400;
}

function lift(sim: MatchSimulation, id: string) {
  return sim.lifts.find((each) => each.id === id);
}

// The timer lift, x 680..800 and y 300..400, rests 4 s low, rises 2 s, rests 4 s high, sinks 2 s.
describe("lifts in a match (#3079)", () => {
  it("runs a timer lift off the match clock, the same in two matches", () => {
    const one = arena([], "one");
    const two = arena([], "two");
    run(one, 5);
    run(two, 5);
    expect(lift(one, "timer-lift")).toMatchObject({ phase: "rising" });
    expect(lift(one, "timer-lift")?.progress).toBeCloseTo(0.5, 1);
    expect(one.lifts).toEqual(two.lifts);
    run(one, 2);
    expect(lift(one, "timer-lift")).toMatchObject({ phase: "high", progress: 1 });
    run(one, 4);
    expect(lift(one, "timer-lift")).toMatchObject({ phase: "sinking" });
    run(one, 2);
    expect(lift(one, "timer-lift")).toMatchObject({ phase: "low", progress: 0 });
  });

  it("carries a body on it up to the deck, where it steps off", () => {
    const sim = arena([body("rider", 740, 350, 0)]);
    run(sim, 3);
    expect(where(sim, "rider")).toMatchObject({ layer: 0 });
    run(sim, 3.5);
    expect(lift(sim, "timer-lift")?.phase).toBe("high");
    expect(where(sim, "rider")).toMatchObject({ layer: 1 });
    sim.walkTo("rider", { x: 900, y: 350 }, 1);
    run(sim, 1.5);
    expect(where(sim, "rider")).toMatchObject({ x: 900, layer: 1 });
  });

  it("lets nobody on or off while it travels", () => {
    const sim = arena([body("rider", 740, 350, 0), body("late", 600, 350, 0)]);
    run(sim, 4.2);
    expect(lift(sim, "timer-lift")?.phase).toBe("rising");
    sim.walkTo("late", { x: 740, y: 350 }, 0);
    sim.walkTo("rider", { x: 600, y: 350 }, 0);
    run(sim, 1.5);
    expect(onTimerLift(sim, "late")).toBe(false);
    expect(onTimerLift(sim, "rider")).toBe(true);
  });

  it("keeps a body on the deck off a lift resting at the bottom", () => {
    const sim = arena([body("top", 860, 350, 1)]);
    sim.walkTo("top", { x: 740, y: 350 });
    run(sim, 2);
    expect(where(sim, "top")).toMatchObject({ layer: 1 });
    expect(where(sim, "top").x).toBeGreaterThan(800 - 1);
  });

  it("routes over a lift at rest, waiting on it to be carried", () => {
    const sim = arena([body("walker", 600, 350, 0)]);
    sim.walkTo("walker", { x: 1000, y: 350 }, 1);
    run(sim, 3.5);
    // The lever lift is far; the timer lift at rest is the way.
    expect(onTimerLift(sim, "walker")).toBe(true);
    expect(where(sim, "walker")).toMatchObject({ layer: 0 });
    run(sim, 5);
    expect(where(sim, "walker")).toMatchObject({ x: 1000, layer: 1 });
  });

  it("waits at a lift resting at the deck to come down for it, and rides it up", () => {
    const sim = arena([body("walker", 600, 350, 0)]);
    run(sim, 6.5);
    expect(lift(sim, "timer-lift")?.phase).toBe("high");
    sim.walkTo("walker", { x: 1000, y: 350 }, 1);
    run(sim, 14);
    expect(where(sim, "walker")).toMatchObject({ x: 1000, layer: 1 });
  });

  it("waits on the deck at a lift resting at the bottom to come up for it, and rides it down", () => {
    const sim = arena([body("walker", 1000, 350, 1)]);
    sim.walkTo("walker", { x: 600, y: 350 }, 0);
    run(sim, 16);
    expect(where(sim, "walker")).toMatchObject({ x: 600, layer: 0 });
  });

  it("waits for a timer lift on its way, and routes round a lever lift on its way", () => {
    const sim = arena([body("walker", 600, 350, 0)]);
    run(sim, 4.5);
    sim.walkTo("walker", { x: 1000, y: 350 }, 1);
    // It rises past it, rests at the deck, and comes back down for it.
    run(sim, 16);
    expect(where(sim, "walker")).toMatchObject({ x: 1000, layer: 1 });

    const lever = arena([body("puller", 560, 760, 0), body("walker", 600, 650, 0)]);
    lever.requestAttack("puller", switchTargetId("lift-lever"));
    run(lever, 0.5);
    expect(lift(lever, "lever-lift")?.phase).toBe("rising");
    lever.walkTo("walker", { x: 1000, y: 650 }, 1);
    run(lever, 1);
    const { x, y = Number.NaN } = where(lever, "walker");
    expect(x >= 680 && x <= 800 && y >= 600 && y <= 700).toBe(false);
  });

  it("sends a lever lift to the other layer per flip, and ignores a flip on its way", () => {
    const sim = arena([body("puller", 560, 760, 0), body("rider", 740, 650, 0)]);
    sim.requestAttack("puller", switchTargetId("lift-lever"));
    run(sim, 1);
    expect(lift(sim, "lever-lift")?.phase).toBe("rising");
    sim.requestAttack("puller", switchTargetId("lift-lever"));
    run(sim, 1.6);
    expect(lift(sim, "lever-lift")).toMatchObject({ phase: "high", progress: 1 });
    expect(where(sim, "rider")).toMatchObject({ layer: 1 });
  });
});

describe("lever lifts are no walking route (#3117)", () => {
  /** Whether `id` stands in the lever lift, x 680..800 and y 600..700. */
  const onLeverLift = (sim: MatchSimulation, id: string): boolean => {
    const { x, y = Number.NaN } = where(sim, id);
    return x >= 680 && x <= 800 && y >= 600 && y <= 700;
  };

  it("goes down by the timer lift from beside a lever lift resting at the bottom", () => {
    const sim = arena([body("walker", 850, 650, 1)]);
    sim.walkTo("walker", { x: 600, y: 650 }, 0);
    run(sim, 18);
    expect(where(sim, "walker")).toMatchObject({ x: 600, y: 650, layer: 0 });
  });

  it("does not step on a lever lift to wait for it when it is the only way up", () => {
    const [, leverLift] = liftsData.transitions;
    const map = validateMapData({ ...liftsData, transitions: [leverLift] });
    const sim = new MatchSimulation({
      seed: "lifts",
      ruleset: RULESET,
      ...mapSimulationFields(map, 2),
      participants: [body("walker", 600, 650, 0), body("foe", 1500, 900, 0, 1)],
    });
    sim.walkTo("walker", { x: 900, y: 650 }, 1);
    run(sim, 3);
    expect(onLeverLift(sim, "walker")).toBe(false);
    expect(where(sim, "walker")).toMatchObject({ layer: 0 });
  });

  it("walks straight over a lever lift resting on its layer", () => {
    const sim = arena([body("walker", 740, 560, 0)]);
    sim.walkTo("walker", { x: 740, y: 740 }, 0);
    run(sim, 2.5);
    expect(where(sim, "walker")).toMatchObject({ x: 740, y: 740, layer: 0 });
  });
});
