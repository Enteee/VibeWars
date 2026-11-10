import { describe, expect, it } from "vitest";

import {
  characterBand,
  easeElevation,
  ELEVATION_EASE_SECONDS,
  ELEVATION_STEP,
  elevationOf,
  renderOrder,
  type RenderItem,
} from "./render-order.js";

const character = (band: number): RenderItem => ({ kind: "character", band, part: "body" });

describe("renderOrder (#2810, section 8: 12)", () => {
  it("runs terrain, ground characters, walls, supports, side faces, decks, elevated characters, effects, UI", () => {
    const items: readonly RenderItem[] = [
      { kind: "terrain" },
      character(0),
      { kind: "wall", layer: 0 },
      { kind: "support", deckLayer: 1 },
      { kind: "side-face", deckLayer: 1 },
      { kind: "deck", deckLayer: 1 },
      character(1),
      { kind: "effect" },
      { kind: "ui" },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });

  it("draws someone under a deck beneath it, and someone on it above", () => {
    const deck = renderOrder({ kind: "deck", deckLayer: 1 });
    expect(renderOrder(character(0))).toBeLessThan(deck);
    expect(renderOrder(character(1))).toBeGreaterThan(deck);
  });

  it("stacks a third layer the same way", () => {
    const deck = renderOrder({ kind: "deck", deckLayer: 2 });
    expect(renderOrder(character(1))).toBeLessThan(deck);
    expect(renderOrder(character(2))).toBeGreaterThan(deck);
  });

  it("keeps a body's parts together, under the next structure", () => {
    const glyph = renderOrder({ kind: "character", band: 0, part: "glyph" });
    const marks = renderOrder({ kind: "character", band: 0, part: "marks" });
    expect(renderOrder(character(0))).toBeLessThan(glyph);
    expect(glyph).toBeLessThan(marks);
    expect(marks).toBeLessThan(renderOrder({ kind: "wall", layer: 0 }));
  });

  it("lights a layer over its surfaces and under whoever stands on it (#2987)", () => {
    const ground = renderOrder({ kind: "lighting", layer: 0 });
    const groundEffect = renderOrder({ kind: "lit-ground-effect" });
    expect(renderOrder({ kind: "terrain" })).toBeLessThan(ground);
    expect(ground).toBeLessThan(groundEffect);
    expect(groundEffect).toBeLessThan(renderOrder(character(0)));
    const deck = renderOrder({ kind: "lighting", layer: 1 });
    expect(renderOrder({ kind: "ramp", upperLayer: 1 })).toBeLessThan(deck);
    expect(renderOrder({ kind: "deck", deckLayer: 1 })).toBeLessThan(deck);
    expect(deck).toBeLessThan(renderOrder(character(1)));
  });

  it("draws a ward on a deck over that deck, under whoever stands there and the deck above (#2979)", () => {
    const ward = renderOrder({ kind: "ground-effect", layer: 1 });
    expect(renderOrder({ kind: "deck", deckLayer: 1 })).toBeLessThan(ward);
    expect(renderOrder({ kind: "ramp", upperLayer: 1 })).toBeLessThan(ward);
    expect(renderOrder({ kind: "lighting", layer: 1 })).toBeLessThan(ward);
    expect(ward + 0.1).toBeLessThan(renderOrder(character(1)));
    expect(ward).toBeLessThan(renderOrder({ kind: "deck", deckLayer: 2 }));
  });

  it("draws a torch or hearth over its layer's light and wards, under whoever stands there (#2989)", () => {
    for (const layer of [0, 1, 2]) {
      const mark = renderOrder({ kind: "light-mark", layer });
      expect(renderOrder({ kind: "lighting", layer })).toBeLessThan(mark);
      expect(renderOrder({ kind: "ground-effect", layer })).toBeLessThan(mark);
      expect(mark).toBeLessThan(renderOrder(character(layer)));
      expect(mark).toBeLessThan(renderOrder({ kind: "wall", layer }));
    }
    expect(renderOrder({ kind: "lit-ground-effect" })).toBeLessThan(
      renderOrder({ kind: "light-mark", layer: 0 }),
    );
  });

  it("leaves everyone in front of the walls on a map of one layer", () => {
    expect(renderOrder(character(characterBand(0, 1)))).toBeGreaterThan(
      renderOrder({ kind: "wall", layer: 0 }),
    );
    expect(characterBand(1, 2)).toBe(1);
    expect(characterBand(0, 2)).toBe(0);
  });
});

describe("the elevation offset (ADR-0051)", () => {
  it("is a step per layer, and none on the ground", () => {
    expect([0, 1, 2].map(elevationOf)).toEqual([0, ELEVATION_STEP, 2 * ELEVATION_STEP]);
  });

  it("eases a change of layer over about 150 ms, either way", () => {
    expect(ELEVATION_EASE_SECONDS).toBe(0.15);
    expect(easeElevation(0, ELEVATION_STEP, ELEVATION_EASE_SECONDS / 2)).toBeCloseTo(
      ELEVATION_STEP / 2,
    );
    expect(easeElevation(ELEVATION_STEP, 0, ELEVATION_EASE_SECONDS / 2)).toBeCloseTo(
      ELEVATION_STEP / 2,
    );
  });

  it("never overshoots", () => {
    expect(easeElevation(0, ELEVATION_STEP, 1)).toBe(ELEVATION_STEP);
    expect(easeElevation(ELEVATION_STEP, 0, 1)).toBe(0);
  });
});

describe("water's place in the order (#2984)", () => {
  const water = (layer: number, part: "surface" | "ripples"): RenderItem => ({
    kind: "water",
    layer,
    part,
  });

  it("draws ground water over the floor, its ripples over it, both under the ward circles, the terrain and the light", () => {
    const items: readonly RenderItem[] = [
      { kind: "floor" },
      water(0, "surface"),
      water(0, "ripples"),
      { kind: "ground-effect", layer: 0 },
      { kind: "terrain" },
      { kind: "lighting", layer: 0 },
      character(0),
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });

  it("draws a deck's water on the deck and its ramp, under its light, whoever stands there and the next deck up", () => {
    const items: readonly RenderItem[] = [
      { kind: "deck", deckLayer: 1 },
      { kind: "ramp", upperLayer: 1 },
      water(1, "surface"),
      water(1, "ripples"),
      { kind: "lighting", layer: 1 },
      character(1),
      { kind: "wall", layer: 1 },
      { kind: "deck", deckLayer: 2 },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
