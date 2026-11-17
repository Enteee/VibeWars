import { BIOMES } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { GROUND_DRESSING } from "./arena-palette.js";
import {
  DRESSING,
  GRAIN_ALPHA,
  GROUND_TILE,
  grainPixels,
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
  it.each(BIOMES.map((biome) => [biome] as const))(
    "paints the same %s tile every time",
    (biome) => {
      expect(grainPixels(biome)).toEqual(grainPixels(biome));
      const first = recorder();
      const second = recorder();
      paintDressing(first, biome);
      paintDressing(second, biome);
      expect(first.calls.length).toBeGreaterThan(0);
      expect(first.calls).toEqual(second.calls);
    },
  );

  it("dresses every biome, each its own way", () => {
    for (const biome of BIOMES) {
      expect(DRESSING[biome].length, biome).toBeGreaterThan(0);
      expect(GROUND_DRESSING[biome], biome).toBeDefined();
    }
    const tiles = new Set(BIOMES.map((biome) => grainPixels(biome).join(",")));
    expect(tiles.size).toBe(BIOMES.length);
  });

  it("lays the grain at 50 to 80 % over the ground, between its own two tones", () => {
    expect(GRAIN_ALPHA).toBeGreaterThanOrEqual(0.5);
    expect(GRAIN_ALPHA).toBeLessThanOrEqual(0.8);
    const pixels = grainPixels("wilds");
    expect(pixels).toHaveLength(GROUND_TILE * GROUND_TILE * 4);
    const [dark, light] = GROUND_DRESSING.wilds.grain;
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
    const pixels = grainPixels("desert");
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

  it.each(BIOMES.map((biome) => [biome] as const))(
    "keeps every %s dressing tone a hand's width from every signal",
    (biome) => {
      const { grain, mark, accent, outline } = GROUND_DRESSING[biome];
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
