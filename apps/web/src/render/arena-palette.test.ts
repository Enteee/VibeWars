import { BIOMES, DECK_LOOKS, TRANSITION_LOOKS } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { arenaPalette, BIOME, shade } from "./arena-palette.js";

/** The signals of docs/art/visual-style.md §1, which no biome tone may sit near. */
const SIGNALS = [
  0x59c2ff, 0xff7b72, 0xff8a3d, 0xffd23d, 0x7fbf2a, 0xc8f05a, 0x3f9fe8, 0x9fdcff, 0x2f8a3c,
  0x76c96f, 0xa77bff,
];

/** A hand's width on the colour wheel: a quarter of its radius. */
const HAND = 0.25;

/** Where `colour` sits on the colour wheel: its hue the angle, its chroma (0 to 1) the radius. */
function onWheel(colour: number): { readonly x: number; readonly y: number } {
  const r = ((colour >> 16) & 0xff) / 255;
  const g = ((colour >> 8) & 0xff) / 255;
  const b = (colour & 0xff) / 255;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) {
    return { x: 0, y: 0 };
  }
  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  const hue = (sector / 6) * Math.PI * 2;
  return { x: Math.cos(hue) * chroma, y: Math.sin(hue) * chroma };
}

/** How far apart two colours sit on the colour wheel. */
function wheelDistance(a: number, b: number): number {
  const from = onWheel(a);
  const to = onWheel(b);
  return Math.hypot(from.x - to.x, from.y - to.y);
}

/** Every colour of a biome's materials. */
function coloursOf(biome: (typeof BIOMES)[number]): number[] {
  const { palette, deck, transition } = BIOME[biome];
  return [palette, ...Object.values(deck), ...Object.values(transition)].flatMap((colours) =>
    Object.values(colours).filter((colour): colour is number => typeof colour === "number"),
  );
}

describe("arenaPalette", () => {
  it("leaves a map of one layer as it was", () => {
    expect(arenaPalette({ layerCount: 1, biome: "hall" })).toMatchObject({
      floor: undefined,
      grid: 0x1a212c,
      wallTop: 0x202836,
    });
  });

  it("gives a layered map direction D", () => {
    expect(arenaPalette({ layerCount: 3, biome: "hall" })).toMatchObject({
      floor: 0x26303f,
      grid: 0x34415a,
      deckTop: 0xa0b2c7,
      wallFace: shade(0x4b5a70, 0.4),
    });
  });
});

describe("BIOME", () => {
  it("draws the hall as it was drawn before biomes", () => {
    expect(BIOME.hall.palette).toEqual({
      floor: 0x26303f,
      grid: 0x34415a,
      wallTop: 0x4b5a70,
      wallFace: shade(0x4b5a70, 0.4),
      wallLit: 0xa9bbd0,
      wallStroke: 0x3b4759,
      support: shade(0x62748c, 0.3),
      deckTop: 0xa0b2c7,
      plank: shade(0xa0b2c7, 0.15),
      slab: shade(0x8fa4bd, 0.4),
      rampTop: 0xa9bbd0,
      rampPanel: shade(0xa9bbd0, 0.15),
      rampChevron: 0x4b5a70,
    });
    expect(BIOME.hall.deck.tower).toEqual({
      top: 0x9aa6b4,
      detail: shade(0x9aa6b4, 0.22),
      side: 0x5c6a7c,
      edgeTop: 0xb8c5d4,
      edgeFace: shade(0x5c6a7c, 0.25),
      support: shade(0x5c6a7c, 0.35),
    });
    expect(BIOME.hall.deck.plinth.edgeTop).toBe(0xe8c27a);
    expect(BIOME.hall.transition.stairs).toEqual({
      top: 0xa2aebd,
      step: 0xccd6e2,
      riser: 0x56637a,
      side: shade(0x8fa4bd, 0.4),
    });
    expect(BIOME.hall.transition.lift).toEqual({
      top: 0xa07a48,
      step: 0xd4a843,
      riser: 0x7a8aa4,
      side: 0x4a3320,
    });
  });

  it("draws the heights in the hall's materials", () => {
    expect(BIOME.heights).toEqual(BIOME.hall);
  });

  it("gives every biome every deck and transition look", () => {
    for (const biome of BIOMES) {
      expect(Object.keys(BIOME[biome].deck).sort()).toEqual([...DECK_LOOKS].sort());
      expect(Object.keys(BIOME[biome].transition).sort()).toEqual([...TRANSITION_LOOKS].sort());
    }
  });

  it("draws the desert warm, and keeps brass and iron", () => {
    const { palette, deck, transition } = BIOME.desert;
    const warm = (colour: number): boolean => colour >> 16 > (colour & 0xff);
    expect(warm(palette.floor ?? 0)).toBe(true);
    expect(warm(palette.wallTop)).toBe(true);
    expect(warm(deck.tower.top)).toBe(true);
    expect(deck.plinth.edgeTop).toBe(BIOME.hall.deck.plinth.edgeTop);
    expect(transition.lift.riser).toBe(BIOME.hall.transition.lift.riser);
  });

  it("keeps every desert tone a hand's width from every signal", () => {
    const hall = new Set(coloursOf("hall"));
    for (const tone of coloursOf("desert").filter((colour) => !hall.has(colour))) {
      for (const signal of SIGNALS) {
        expect(
          wheelDistance(tone, signal),
          `#${tone.toString(16)} near #${signal.toString(16)}`,
        ).toBeGreaterThan(HAND);
      }
    }
  });
});

describe("shade", () => {
  it("moves each channel toward black", () => {
    expect(shade(0x804020, 0.5)).toBe(0x402010);
  });
});
