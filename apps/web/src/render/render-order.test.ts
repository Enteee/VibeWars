import { describe, expect, it } from "vitest";

import {
  characterBand,
  DROP_FALL_SECONDS,
  easeElevation,
  fallLift,
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

  it("draws the ground over a tunnel over whoever is in it, under the ground's deck and its inlay (#3234)", () => {
    const cover = renderOrder({ kind: "tunnel-cover", deckLayer: 1 });
    expect(renderOrder(character(0))).toBeLessThan(cover);
    expect(renderOrder({ kind: "wall", layer: 0 })).toBeLessThan(cover);
    expect(cover).toBeLessThan(renderOrder({ kind: "deck", deckLayer: 1 }));
    expect(cover).toBeLessThan(renderOrder(character(1)));
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

  it("draws a goal mark over its layer's floor, light and torches, under whoever walks onto it (#3221)", () => {
    for (const layer of [0, 1, 2]) {
      const goal = renderOrder({ kind: "goal-mark", layer });
      expect(renderOrder({ kind: "lighting", layer })).toBeLessThan(goal);
      expect(renderOrder({ kind: "paving", layer })).toBeLessThan(goal);
      expect(renderOrder({ kind: "light-mark", layer })).toBeLessThan(goal);
      expect(goal).toBeLessThan(renderOrder(character(layer)));
      expect(goal).toBeLessThan(renderOrder({ kind: "wall", layer }));
    }
    expect(renderOrder({ kind: "floor" })).toBeLessThan(
      renderOrder({ kind: "goal-mark", layer: 0 }),
    );
    expect(renderOrder({ kind: "deck", deckLayer: 1 })).toBeLessThan(
      renderOrder({ kind: "goal-mark", layer: 1 }),
    );
    expect(renderOrder({ kind: "goal-mark", layer: 0 })).toBeLessThan(
      renderOrder(character(characterBand(0, 1))),
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
    expect([0, 1, 2].map((layer) => elevationOf(layer, 0))).toEqual([
      0,
      ELEVATION_STEP,
      2 * ELEVATION_STEP,
    ]);
  });

  it("is negative below the ground (#2973)", () => {
    expect([0, 1, 2].map((layer) => elevationOf(layer, 1))).toEqual([
      -ELEVATION_STEP,
      0,
      ELEVATION_STEP,
    ]);
  });

  it("draws a pit's floor over the floor and under whoever is in it (#2973)", () => {
    expect(renderOrder({ kind: "pit" })).toBeGreaterThan(renderOrder({ kind: "floor" }));
    expect(renderOrder({ kind: "pit" })).toBeLessThan(
      renderOrder({ kind: "character", band: 0, part: "body" }),
    );
    // The ground over a tunnel or a pit's lip covers the pit's bodies.
    expect(renderOrder({ kind: "deck", deckLayer: 1 })).toBeGreaterThan(
      renderOrder({ kind: "character", band: 0, part: "marks" }),
    );
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

describe("a fall off a drop-off (#3069)", () => {
  it("lands a layer down in 0.25 s, slow off the lip and fastest at the landing", () => {
    expect(DROP_FALL_SECONDS).toBe(0.25);
    expect(fallLift(ELEVATION_STEP, 0, 0)).toBe(ELEVATION_STEP);
    expect(fallLift(ELEVATION_STEP, 0, DROP_FALL_SECONDS / 2)).toBeCloseTo(ELEVATION_STEP * 0.75);
    expect(fallLift(ELEVATION_STEP, 0, DROP_FALL_SECONDS)).toBe(0);
    expect(fallLift(ELEVATION_STEP, 0, 1)).toBe(0);
  });
});

describe("the outside's place in the order (#3066)", () => {
  it("draws the land outside a ground outline under the floor, which is the ground inside it", () => {
    expect(renderOrder({ kind: "outside" })).toBeLessThan(renderOrder({ kind: "floor" }));
    expect(renderOrder({ kind: "outside" })).toBeLessThan(renderOrder({ kind: "pit" }));
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

describe("a ground over pits (#2973)", () => {
  it("draws the pit, then the ground's cover, water, light and wards, then whoever stands on it and its marks", () => {
    const items: readonly RenderItem[] = [
      { kind: "floor" },
      { kind: "pit" },
      { kind: "character", band: characterBand(0, 3), part: "marks" },
      { kind: "deck", deckLayer: 1 },
      { kind: "ramp", upperLayer: 1 },
      { kind: "water", layer: 1, part: "surface" },
      { kind: "water", layer: 1, part: "ripples" },
      { kind: "lighting", layer: 1 },
      { kind: "ground-effect", layer: 1 },
      { kind: "character", band: characterBand(1, 3), part: "body" },
      { kind: "character", band: characterBand(1, 3), part: "marks" },
      { kind: "wall", layer: 1 },
      { kind: "deck", deckLayer: 2 },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });
});

describe("an effect zone's place in the order (ADR-0053, #3024)", () => {
  it("draws a ground zone, its painted ground then its marks, over the ground's water and light, under its torches and bodies", () => {
    const items: readonly RenderItem[] = [
      { kind: "floor" },
      { kind: "water", layer: 0, part: "ripples" },
      { kind: "lighting", layer: 0 },
      { kind: "zone", layer: 0, part: "ground" },
      { kind: "zone", layer: 0, part: "marks" },
      { kind: "lit-ground-effect" },
      { kind: "light-mark", layer: 0 },
      { kind: "character", band: characterBand(0, 1), part: "body" },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });

  it("draws a deck's zone over its water and light, under its wards, torches and whoever stands there", () => {
    const items: readonly RenderItem[] = [
      { kind: "deck", deckLayer: 1 },
      { kind: "water", layer: 1, part: "ripples" },
      { kind: "lighting", layer: 1 },
      { kind: "zone", layer: 1, part: "marks" },
      { kind: "ground-effect", layer: 1 },
      { kind: "light-mark", layer: 1 },
      { kind: "character", band: 1, part: "body" },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });
});

describe("atmosphere's place in the order (#3032)", () => {
  it("draws a ground fog bank over its zones, under its wards, torches and bodies", () => {
    const items: readonly RenderItem[] = [
      { kind: "water", layer: 0, part: "ripples" },
      { kind: "lighting", layer: 0 },
      { kind: "zone", layer: 0, part: "marks" },
      { kind: "fog", layer: 0 },
      { kind: "lit-ground-effect" },
      { kind: "light-mark", layer: 0 },
      { kind: "character", band: characterBand(0, 1), part: "body" },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("draws a deck's fog over its zones, under its wards and whoever stands there", () => {
    const items: readonly RenderItem[] = [
      { kind: "deck", deckLayer: 1 },
      { kind: "zone", layer: 1, part: "marks" },
      { kind: "fog", layer: 1 },
      { kind: "ground-effect", layer: 1 },
      { kind: "character", band: 1, part: "body" },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("draws a plume over the bodies on its band, under its walls and the deck above", () => {
    const items: readonly RenderItem[] = [
      { kind: "character", band: 0, part: "marks" },
      { kind: "plume", band: 0 },
      { kind: "wall", layer: 0 },
      { kind: "deck", deckLayer: 1 },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("draws the weather once, over the world and under effects and the HUD", () => {
    const top = Math.max(
      renderOrder({ kind: "plume", band: 3 }),
      renderOrder({ kind: "deck", deckLayer: 3 }),
      renderOrder({ kind: "character", band: 3, part: "marks" }),
    );
    expect(renderOrder({ kind: "weather" })).toBeGreaterThan(top);
    expect(renderOrder({ kind: "weather" })).toBeLessThan(renderOrder({ kind: "hidden-outline" }));
    expect(renderOrder({ kind: "weather" })).toBeLessThan(renderOrder({ kind: "ui" }));
  });
});

describe("paving's place in the order (#3210)", () => {
  it("draws ground paving over the floor, the outside and a pit's floor, under the water, wards, terrain, light and bodies", () => {
    const items: readonly RenderItem[] = [
      { kind: "outside" },
      { kind: "floor" },
      { kind: "pit" },
      { kind: "paving", layer: 0 },
      { kind: "water", layer: 0, part: "surface" },
      { kind: "ground-effect", layer: 0 },
      { kind: "terrain" },
      { kind: "lighting", layer: 0 },
      character(0),
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(items.length);
  });

  it("draws paving on a raised ground over its deck and ramps, under its water, light and bodies", () => {
    const items: readonly RenderItem[] = [
      { kind: "deck", deckLayer: 1 },
      { kind: "ramp", upperLayer: 1 },
      { kind: "paving", layer: 1 },
      { kind: "water", layer: 1, part: "surface" },
      { kind: "lighting", layer: 1 },
      character(1),
      { kind: "wall", layer: 1 },
    ];
    const orders = items.map(renderOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
