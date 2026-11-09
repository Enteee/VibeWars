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
