import { vec2, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STEP,
  clampToLeash,
  createCameraRig,
  wheelNotch,
  zoomFor,
} from "../render/camera-rig.js";

import {
  TELEPORTER_MARGIN,
  inwardStart,
  teleporterReach,
  teleporterSpot,
} from "./tutorial-start.js";

const SIZE = { width: 4400, height: 3000 };
const HALF = { x: 978, y: 550 };

describe("inwardStart (#3221)", () => {
  it("moves a start by the edge inward until half a view clears every edge", () => {
    const start = inwardStart({ x: 300, y: 1500 }, SIZE, HALF);
    expect(start.x).toBeCloseTo(HALF.x);
    expect(start.y).toBeCloseTo(1500);
  });

  it("moves along the line to the centre, by the further of two edges", () => {
    const spawn = { x: 300, y: 2900 };
    const start = inwardStart(spawn, SIZE, HALF);
    expect(start.x).toBeGreaterThanOrEqual(HALF.x - 1e-9);
    expect(start.y).toBeLessThanOrEqual(SIZE.height - HALF.y + 1e-9);
    // On the line from the spawn to the centre.
    const along = (start.x - spawn.x) / (SIZE.width / 2 - spawn.x);
    expect((start.y - spawn.y) / (SIZE.height / 2 - spawn.y)).toBeCloseTo(along);
  });

  it("leaves a start that already clears every edge where it is", () => {
    expect(inwardStart({ x: 1200, y: 1400 }, SIZE, HALF)).toEqual({ x: 1200, y: 1400 });
  });

  it("takes the centre on a map too small for half a view", () => {
    expect(inwardStart({ x: 100, y: 500 }, { width: 1600, height: 1000 }, HALF)).toEqual({
      x: 800,
      y: 500,
    });
  });
});

/** The PR screenshot's canvas. */
const VIEWPORT = { width: 1000, height: 700 };
const START = vec2(2000, 2000);
const anywhere = (at: Vec2): Vec2 => at;
const always = (): boolean => true;
/** How far north a point may be and still show, from the view's step and pan. */
const northEdge = (step: number, pan: number): number =>
  VIEWPORT.height / 2 / zoomFor(step, VIEWPORT) - pan;

describe("teleporterSpot (#3222)", () => {
  it("stands out of the default view, and in it after one notch out and a drag to the leash", () => {
    const spot = teleporterSpot(START, VIEWPORT, anywhere, always);
    const rise = START.y - spot.y;
    expect(spot.x).toBe(START.x);
    expect(rise - northEdge(DEFAULT_STEP, 0)).toBeGreaterThanOrEqual(TELEPORTER_MARGIN);
    const wide = wheelNotch(createCameraRig(), 1).step;
    const zoom = zoomFor(wide, VIEWPORT);
    const leash = clampToLeash(vec2(0, Number.NEGATIVE_INFINITY), VIEWPORT, zoom).y;
    expect(northEdge(wide, leash) - rise).toBeGreaterThanOrEqual(TELEPORTER_MARGIN);
  });

  it("steps aside from ground that is not open", () => {
    const { near, far } = teleporterReach(VIEWPORT);
    const spot = teleporterSpot(START, VIEWPORT, anywhere, (at) => at.x !== START.x);
    expect(spot.x).not.toBe(START.x);
    expect(START.y - spot.y).toBeGreaterThanOrEqual(near);
    expect(START.y - spot.y).toBeLessThanOrEqual(far);
  });

  // QA (#3222): on canyon, north of the start is a plateau the ground walk
  // never reaches, and the old fallback stood the pad on a ramp.
  it("takes the open spot farthest north when no ground in reach is open", () => {
    const shelf = 200;
    expect(shelf).toBeLessThan(teleporterReach(VIEWPORT).near);
    const spot = teleporterSpot(START, VIEWPORT, anywhere, (at) => START.y - at.y <= shelf);
    expect(spot).toEqual(vec2(START.x, START.y - shelf));
  });

  it("takes the farthest standable point north on a map too small for the span", () => {
    const top = START.y - 300;
    const spot = teleporterSpot(START, VIEWPORT, (at) => vec2(at.x, Math.max(top, at.y)), always);
    expect(spot).toEqual(vec2(START.x, top));
  });
});
