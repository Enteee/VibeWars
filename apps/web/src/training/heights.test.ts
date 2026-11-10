import {
  MatchSimulation,
  applyIntent,
  TRAINING_SCENARIOS,
  baseEnergyPipsFor,
  scenarioParticipants,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { describe, expect, it } from "vitest";

import { TRAINING_MAPS } from "./maps.js";
import { matchLayers } from "./scenario-setup.js";

function loaded<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`no ${what}`);
  return value;
}

const map = loaded(TRAINING_MAPS.get("training-heights"), "training-heights");
const scenario = loaded(
  TRAINING_SCENARIOS.find(({ id }) => id === "heights"),
  "heights",
);

interface Spot {
  readonly x: number;
  readonly y: number;
  readonly layer: number;
}

/** Whether `x, y` is inside rect-shaped `area`, its edges counted. */
function inside(
  area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  { x, y }: { readonly x: number; readonly y: number },
): boolean {
  return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
}

/** A chasing fireball dummy at `from`, the player standing at `to`; every step it takes until it stops. */
function chase(from: Spot, to: Spot, casts = true): readonly Spot[] {
  const [template] = scenarioParticipants(
    { ...scenario, dummies: scenario.dummies.filter(({ id }) => id === "under-bridge") },
    to,
  );
  if (template === undefined) throw new Error("no dummies");
  const simulation = new MatchSimulation({
    seed: "heights",
    teamCount: map.teams,
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    layers: matchLayers(map),
    participants: [
      { ...template, id: "you", team: 0, spawn: { x: to.x, y: to.y }, layer: to.layer },
      {
        ...template,
        id: "hunter",
        team: 1,
        spawn: { x: from.x, y: from.y },
        layer: from.layer,
        skillBar: ["elementalist.fireball"],
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        baseEnergyPips: baseEnergyPipsFor("elementalist"),
        behaviour: {
          kind: "parallel",
          behaviours: [
            { kind: "chase", targeting: { kind: "nearest-enemy" }, standOffUnits: 250 },
            ...(casts
              ? [
                  {
                    kind: "cast-loop" as const,
                    skillIds: ["elementalist.fireball"],
                    targeting: { kind: "nearest-enemy" as const },
                    gapSeconds: 0,
                    firstLegal: true,
                  },
                ]
              : []),
          ],
        },
      },
    ],
  });
  const steps: Spot[] = [];
  for (let tick = 0; tick < 1200; tick += 1) {
    simulation.step(1 / 30);
    const body = simulation.get("hunter");
    if (body === undefined) throw new Error("no hunter");
    const last = steps.at(-1);
    if (last?.x === body.position.x && last.y === body.position.y && tick > 60) break;
    steps.push({ x: body.position.x, y: body.position.y, layer: body.layer });
  }
  return steps;
}

/** It got to `layer`, only ever changing layer on a ramp, never inside a wall of its layer. */
function expectClimbed(steps: readonly Spot[], layer: number): void {
  expect(steps.at(-1)?.layer).toBe(layer);
  steps.forEach((step, at) => {
    const before = steps[at - 1];
    if (before !== undefined && before.layer !== step.layer) {
      expect(map.transitions.some(({ area }) => area.kind === "rect" && inside(area, step))).toBe(
        true,
      );
    }
    for (const wall of map.walls) {
      if (wall.kind === "rect" && wall.layer === step.layer) {
        expect(inside(wall, step)).toBe(false);
      }
    }
  });
}

describe("the hunter on Training Heights (#2937)", () => {
  it("comes down a ramp after a player on the ground", () => {
    expectClimbed(chase({ x: 450, y: 450, layer: 1 }, { x: 1180, y: 450, layer: 0 }, false), 0);
  });

  it("goes up a ramp after a player on the bridge", () => {
    expectClimbed(chase({ x: 1100, y: 450, layer: 0 }, { x: 450, y: 450, layer: 1 }, false), 1);
  });
});

/** A body at `from` ordered to walk to `to`; every step until it arrives. */
function walk(from: Spot, to: Spot): readonly Spot[] {
  const [template] = scenarioParticipants(scenario, to);
  if (template === undefined) throw new Error("no dummies");
  const simulation = new MatchSimulation({
    seed: "heights",
    teamCount: map.teams,
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    layers: matchLayers(map),
    participants: [
      {
        ...template,
        id: "you",
        team: 0,
        spawn: { x: from.x, y: from.y },
        layer: from.layer,
        behaviour: undefined,
      },
    ],
  });
  applyIntent(simulation, "you", { kind: "walk-to", x: to.x, y: to.y, layer: to.layer });
  const steps: Spot[] = [];
  for (let tick = 0; tick < 1800; tick += 1) {
    simulation.step(1 / 30);
    const { position, layer } = loaded(simulation.get("you"), "you");
    steps.push({ x: position.x, y: position.y, layer });
    if (Math.hypot(position.x - to.x, position.y - to.y) < 5 && layer === to.layer) break;
  }
  return steps;
}

describe("walking a ramp on Training Heights (#2972)", () => {
  const bridge = { x: 420, y: 250, width: 360, height: 200 };
  const onBridge = { x: 600, y: 350, layer: 1 };
  // Clear of the ramp's south rim (#2975) by more than a body's radius.
  const south = { x: 430, y: 580, layer: 0 };

  const expectOutFromUnder = (steps: readonly Spot[], end: Spot): void => {
    for (const step of steps) {
      if (step.layer === 0) expect(inside(bridge, step)).toBe(false);
    }
    const last = loaded(steps.at(-1), "a step");
    expect(Math.hypot(last.x - end.x, last.y - end.y)).toBeLessThan(5);
    expect(last.layer).toBe(end.layer);
    expect(steps.some((step) => step.x <= 321 || step.x >= 879)).toBe(true);
  };

  it("walks the whole ramp down from the bridge, never under its deck", () => {
    expectOutFromUnder(walk(onBridge, south), south);
  });

  it("walks the whole ramp up to the bridge, never under its deck", () => {
    expectOutFromUnder(walk(south, onBridge), onBridge);
  });
});

describe("the Heights scenario (#2958)", () => {
  it("has nothing that attacks: every dummy is idle", () => {
    expect(scenario.dummies.length).toBeGreaterThan(0);
    for (const dummy of scenario.dummies) {
      expect(dummy.behaviour.kind).toBe("idle");
    }
  });
});

/** A body at `from` holding `direction` for two seconds; every step it takes. */
function steer(from: Spot, direction: { readonly x: number; readonly y: number }): readonly Spot[] {
  const [template] = scenarioParticipants(scenario, from);
  if (template === undefined) throw new Error("no dummies");
  const simulation = new MatchSimulation({
    seed: "heights",
    teamCount: map.teams,
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    layers: matchLayers(map),
    participants: [
      {
        ...template,
        id: "you",
        team: 0,
        spawn: { x: from.x, y: from.y },
        layer: from.layer,
        behaviour: undefined,
      },
    ],
  });
  applyIntent(simulation, "you", { kind: "move", dirX: direction.x, dirY: direction.y });
  const steps: Spot[] = [];
  for (let tick = 0; tick < 60; tick += 1) {
    simulation.step(1 / 30);
    const { position, layer } = loaded(simulation.get("you"), "you");
    steps.push({ x: position.x, y: position.y, layer });
  }
  return steps;
}

describe("a ramp from the ground has a solid rim (#2975)", () => {
  const [west, east] = map.transitions;
  if (west?.area.kind !== "rect" || east?.area.kind !== "rect") throw new Error("no rect ramps");
  const westRamp = west.area;
  const eastRamp = east.area;
  const radius = 14;
  const neverOn = (steps: readonly Spot[], ramp: typeof westRamp): void => {
    for (const step of steps)
      expect(inside(ramp, step), `${String(step.x)},${String(step.y)}`).toBe(false);
  };

  it("stops a ground body at a ramp's sides, from north and south, on both ramps", () => {
    for (const ramp of [westRamp, eastRamp]) {
      const x = ramp.x + ramp.width / 2;
      const fromNorth = steer({ x, y: ramp.y - 60, layer: 0 }, { x: 0, y: 1 });
      neverOn(fromNorth, ramp);
      expect(fromNorth.at(-1)?.y).toBeCloseTo(ramp.y - radius, 0);
      const fromSouth = steer({ x, y: ramp.y + ramp.height + 60, layer: 0 }, { x: 0, y: -1 });
      neverOn(fromSouth, ramp);
      expect(fromSouth.at(-1)?.y).toBeCloseTo(ramp.y + ramp.height + radius, 0);
    }
  });

  it("keeps a body under the bridge from walking out through a ramp's high end", () => {
    const steps = steer({ x: 500, y: 450, layer: 0 }, { x: -1, y: 0 });
    neverOn(steps, westRamp);
    expect(steps.every((step) => step.layer === 0)).toBe(true);
    expect(steps.at(-1)?.x).toBeGreaterThanOrEqual(westRamp.x + westRamp.width + radius - 0.5);
  });

  it("still stops a deck body at a ramp's side, as before", () => {
    const x = westRamp.x + westRamp.width / 2;
    const up = steer({ x, y: 450, layer: 1 }, { x: 0, y: -1 });
    expect(up.at(-1)?.y).toBeGreaterThanOrEqual(westRamp.y);
    const down = steer({ x, y: 450, layer: 1 }, { x: 0, y: 1 });
    expect(down.at(-1)?.y).toBeLessThanOrEqual(westRamp.y + westRamp.height);
  });

  it("walks onto the bridge from the west through the ramp's low end", () => {
    const from = { x: 200, y: westRamp.y - 60, layer: 0 };
    const steps = walk(from, { x: 600, y: 450, layer: 1 });
    expect(steps.at(-1)?.layer).toBe(1);
    const entered = steps.find((step) => inside(westRamp, step));
    expect(entered?.x).toBeLessThan(westRamp.x + 20);
  });

  it("walks round a ramp from its north to its south, never onto it on the ground", () => {
    const x = westRamp.x + westRamp.width / 2;
    const to = { x, y: westRamp.y + westRamp.height + 20, layer: 0 };
    const steps = walk({ x, y: westRamp.y - 20, layer: 0 }, to);
    const last = loaded(steps.at(-1), "a step");
    expect(Math.hypot(last.x - to.x, last.y - to.y)).toBeLessThan(5);
    for (const step of steps) {
      if (step.layer === 0)
        expect(inside(westRamp, step), `${String(step.x)},${String(step.y)}`).toBe(false);
    }
  });
});
