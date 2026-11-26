import { ASCENT_ACTS, type Biome, BIOMES } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { BIOME, type MapLook, materialsOf } from "./arena-palette.js";
import {
  DRESSING,
  GRAIN_ALPHA,
  GROUND_TILE,
  grainPixels,
  groundTileKey,
  MARK_MAX,
  paintDressing,
  type DressingCanvas,
} from "./ground-dressing.js";
import { HAND, SIGNALS, wheelDistance } from "./signal-hues.test-support.js";

/** A canvas that keeps every call, with the fill and stroke it was made in. */
function recorder(): DressingCanvas & { readonly calls: string[] } {
  const calls: string[] = [];
  const canvas = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => calls.push(`move ${x.toFixed(3)} ${y.toFixed(3)}`),
    lineTo: (x: number, y: number) => calls.push(`line ${x.toFixed(3)} ${y.toFixed(3)}`),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      calls.push(`ellipse ${x.toFixed(3)} ${y.toFixed(3)} ${rx.toFixed(3)} ${ry.toFixed(3)}`),
    closePath: () => calls.push("close"),
    fill: () => calls.push(`fill ${canvas.fillStyle}`),
    stroke: () => calls.push(`stroke ${canvas.strokeStyle}`),
  };
  return canvas as DressingCanvas & { readonly calls: string[] };
}

describe("ground dressing (#3484)", () => {
  /** A map of `biome` off the Heroes' Ascent. */
  const bare = (biome: Biome): MapLook => ({ biome, ascentAct: null });

  it.each(BIOMES.map((biome) => [biome] as const))(
    "paints the same %s tile every time",
    (biome) => {
      expect(grainPixels(bare(biome))).toEqual(grainPixels(bare(biome)));
      const first = recorder();
      const second = recorder();
      paintDressing(first, bare(biome));
      paintDressing(second, bare(biome));
      expect(first.calls.length).toBeGreaterThan(0);
      expect(first.calls).toEqual(second.calls);
    },
  );

  it("dresses every biome, each its own way", () => {
    for (const biome of BIOMES) {
      expect(DRESSING[biome].length, biome).toBeGreaterThan(0);
      expect(BIOME[biome].dressing, biome).toBeDefined();
    }
    const tiles = new Set(BIOMES.map((biome) => grainPixels(bare(biome)).join(",")));
    expect(tiles.size).toBe(BIOMES.length);
  });

  it("lays the grain at 50 to 80 % over the ground, between its own two tones", () => {
    expect(GRAIN_ALPHA).toBeGreaterThanOrEqual(0.5);
    expect(GRAIN_ALPHA).toBeLessThanOrEqual(0.8);
    const pixels = grainPixels(bare("wilds"));
    expect(pixels).toHaveLength(GROUND_TILE * GROUND_TILE * 4);
    const [dark, light] = BIOME.wilds.dressing.grain;
    const red = (colour: number): number => (colour >> 16) & 0xff;
    const reds = pixels.filter((_, at) => at % 4 === 0);
    expect(Math.min(...reds)).toBeGreaterThanOrEqual(Math.min(red(dark), red(light)));
    expect(Math.max(...reds)).toBeLessThanOrEqual(Math.max(red(dark), red(light)));
    // Noise, not a flat fill.
    expect(new Set(reds).size).toBeGreaterThan(4);
    expect(
      pixels.filter((_, at) => at % 4 === 3).every((a) => a === Math.round(GRAIN_ALPHA * 255)),
    ).toBe(true);
  });

  it("repeats without a seam: the grain's left column runs on from its right", () => {
    const pixels = grainPixels(bare("desert"));
    const at = (x: number, y: number): number => pixels[(y * GROUND_TILE + x) * 4] ?? 0;
    for (let y = 0; y < GROUND_TILE; y += 16) {
      expect(Math.abs(at(0, y) - at(GROUND_TILE - 1, y))).toBeLessThanOrEqual(3);
    }
  });

  it("keeps every mark a mark: no side over 16 u", () => {
    for (const biome of BIOMES) {
      for (const { size } of DRESSING[biome]) {
        expect(size[1], biome).toBeLessThanOrEqual(MARK_MAX);
      }
    }
  });

  it("grains an Ascent act's ground from the act's own tones, in a tile of its own (#3618)", () => {
    const heavenly: MapLook = { biome: "hall", ascentAct: "heavenly" };
    const mean = (pixels: Uint8ClampedArray): number =>
      pixels.filter((_, at) => at % 4 === 0).reduce((sum, red) => sum + red, 0) /
      (GROUND_TILE * GROUND_TILE);
    expect(mean(grainPixels(heavenly))).toBeGreaterThan(mean(grainPixels(bare("hall"))) + 100);
    expect(groundTileKey(heavenly)).not.toBe(groundTileKey(bare("hall")));
  });

  it.each(
    BIOMES.flatMap((biome) =>
      [null, ...ASCENT_ACTS].map((ascentAct) => [biome, ascentAct] as const),
    ),
  )(
    "keeps every %s dressing tone, act %s, a hand's width from every signal",
    (biome, ascentAct) => {
      const { grain, mark, accent, outline } = materialsOf({ biome, ascentAct }).dressing;
      for (const tone of [...grain, mark, accent, outline]) {
        for (const signal of SIGNALS) {
          expect(
            wheelDistance(tone, signal),
            `#${tone.toString(16)} near #${signal.toString(16)}`,
          ).toBeGreaterThan(HAND);
        }
      }
    },
  );
});
