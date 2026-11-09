import { describe, expect, it } from "vitest";

import type { Polygon } from "../geometry.js";
import { vec2 } from "../vec2.js";
import {
  deckBlocksSight,
  feelsHeight,
  floorOf,
  floorsAt,
  heightDamageMultiplier,
  heightRange,
  heightStep,
  sharesFloor,
} from "./layer-rules.js";

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];

const DECKS = [{ layer: 1, footprint: rect(100, 0, 100, 100) }];
const RAMP = [{ from: 0, to: 1, area: rect(50, 0, 50, 100) }];
const ON = floorOf(1);
const GROUND = floorOf(0);

describe("a body's floors (ADR-0051)", () => {
  it("is its layer alone off a ramp", () => {
    expect(floorsAt(vec2(10, 10), 0, RAMP)).toBe(GROUND);
    expect(floorsAt(vec2(150, 50), 1, RAMP)).toBe(ON);
  });

  it("is both the layers a ramp connects inside it", () => {
    expect(floorsAt(vec2(75, 50), 0, RAMP)).toBe(GROUND | ON);
    expect(floorsAt(vec2(75, 50), 1, RAMP)).toBe(GROUND | ON);
  });

  it("shares a floor exactly when a bit is common", () => {
    expect(sharesFloor(GROUND, ON)).toBe(false);
    expect(sharesFloor(GROUND | ON, ON)).toBe(true);
  });
});

describe("the deck rule (ADR-0051)", () => {
  const blocked = (fromX: number, fromLayer: number, toX: number, toLayer: number): boolean =>
    deckBlocksSight(DECKS, vec2(fromX, 50), fromLayer, vec2(toX, 50), toLayer);

  it("stops a shot from a deck at a target under its footprint", () => {
    expect(blocked(150, 1, 120, 0)).toBe(true);
  });

  it("stops a shot from under a deck at a target on it", () => {
    expect(blocked(120, 0, 150, 1)).toBe(true);
  });

  it("lets a target clear of the footprint be shot", () => {
    expect(blocked(150, 1, 30, 0)).toBe(false);
    expect(blocked(30, 0, 150, 1)).toBe(false);
  });

  it("does nothing between bodies on one layer", () => {
    expect(blocked(150, 1, 120, 1)).toBe(false);
    expect(blocked(150, 0, 120, 0)).toBe(false);
  });

  it("does nothing on a map with no decks", () => {
    expect(deckBlocksSight([], vec2(150, 50), 1, vec2(120, 50), 0)).toBe(false);
  });
});

describe("the height modifier (ADR-0051)", () => {
  it("steps by one, however many layers apart", () => {
    expect(heightStep(ON, 1, GROUND, 0)).toBe(1);
    expect(heightStep(GROUND, 0, ON, 1)).toBe(-1);
    expect(heightStep(floorOf(2), 2, GROUND, 0)).toBe(1);
  });

  it("is level on a shared floor, as on a ramp", () => {
    expect(heightStep(GROUND | ON, 0, ON, 1)).toBe(0);
    expect(heightStep(GROUND | ON, 1, GROUND, 0)).toBe(0);
  });

  it("is a bow's and a spear's alone", () => {
    expect(feelsHeight("longbow")).toBe(true);
    expect(feelsHeight("spear")).toBe(true);
    expect(feelsHeight("wand")).toBe(false);
    expect(feelsHeight("sword")).toBe(false);
  });

  it("changes range and damage by the two percentages, each way", () => {
    expect(heightRange(200, 1)).toBeCloseTo(230, 9);
    expect(heightRange(200, -1)).toBeCloseTo(170, 9);
    expect(heightRange(200, 0)).toBe(200);
    expect(heightDamageMultiplier(1)).toBeCloseTo(1.1, 9);
    expect(heightDamageMultiplier(-1)).toBeCloseTo(0.9, 9);
    expect(heightDamageMultiplier(0)).toBe(1);
  });
});
