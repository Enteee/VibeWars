import { describe, expect, it } from "vitest";

import {
  STACK_HEADINGS,
  STACK_HEIGHT,
  STACK_POSES,
  STACK_SLICES,
  STACK_STEP,
  bucketFacing,
  capeSliceTrimmed,
  headingBucket,
  stackLayers,
  stackLifts,
  stackPose,
  stackSlices,
  stackShade,
  stackTones,
} from "./sprite-stack.js";

const stackShadeOfVisor = stackShade(0x101014, 1);

const centreX = (pose: (typeof STACK_POSES)[number], tone: string, part = 0): number => {
  const slice = stackSlices(pose).find((s) => s.tone === tone);
  const points = slice?.parts[part] ?? [];
  return points.reduce((sum, p) => sum + p.x, 0) / points.length;
};

describe("sprite-stack (ADR-0057, #4031)", () => {
  it("has the gothic preset's 28 slices in every pose, a slice a twelfth of a radius", () => {
    expect(STACK_SLICES).toBe(28);
    for (const pose of STACK_POSES) {
      expect(stackLifts(stackSlices(pose))).toBe(STACK_SLICES);
    }
    expect(STACK_STEP).toBeCloseTo(1 / 12);
    expect(STACK_HEIGHT).toBeCloseTo(28 / 12);
  });

  it("is helmeted, visored and crested, with a cape at its back", () => {
    const tones = stackSlices("stand").map((slice) => slice.tone);
    expect(tones).toContain("metal");
    expect(tones.filter((tone) => tone === "visor")).toHaveLength(2);
    expect(tones.at(-1)).toBe("crest");
    expect(tones.filter((tone) => tone === "cape")).toHaveLength(11);
    expect(tones).not.toContain("hair");
    // The cape hangs behind: every cape slice is centred behind the body.
    for (const slice of stackSlices("stand").filter((s) => s.tone === "cape")) {
      const points = slice.parts[0] ?? [];
      expect(points.reduce((sum, p) => sum + p.x, 0) / points.length).toBeLessThan(0);
    }
  });

  it("strides its boots apart one way, then the other, and leans its helmet into a cast", () => {
    expect(centreX("stand", "boot", 0)).toBeCloseTo(centreX("stand", "boot", 1));
    expect(centreX("stride-a", "boot", 0)).toBeGreaterThan(centreX("stride-a", "boot", 1));
    expect(centreX("stride-b", "boot", 0)).toBeLessThan(centreX("stride-b", "boot", 1));
    expect(centreX("cast", "visor")).toBeGreaterThan(centreX("stand", "visor"));
  });

  it("turns in the nearest of eight heading buckets", () => {
    expect(STACK_HEADINGS).toBe(8);
    expect(headingBucket(0)).toBe(0);
    expect(headingBucket(Math.PI / 2)).toBe(2);
    expect(headingBucket(Math.PI)).toBe(4);
    expect(headingBucket(-Math.PI / 4)).toBe(7);
    expect(headingBucket(Math.PI * 2)).toBe(0);
    expect(headingBucket(Math.PI / 8 - 0.01)).toBe(0);
    expect(headingBucket(Math.PI / 8 + 0.01)).toBe(1);
    for (let bucket = 0; bucket < STACK_HEADINGS; bucket += 1) {
      expect(headingBucket(bucketFacing(bucket))).toBe(bucket);
    }
  });

  it("faces its visor the way it faces, and rises a full stack", () => {
    const tones = stackTones(0x59c2ff, undefined);
    const layers = stackLayers(stackSlices("stand"), Math.PI / 2, 12, tones, undefined);
    const visor = layers.filter((layer) => layer.colour === stackShadeOfVisor);
    const mid = (points: readonly { readonly x: number; readonly y: number }[]) =>
      points.reduce((sum, p) => sum + p.x, 0) / points.length;
    // Facing down the screen: the visor sits on the helmet's centre line, at its front.
    expect(visor).toHaveLength(2);
    for (const layer of visor) {
      expect(mid(layer.points)).toBeCloseTo(0, 5);
    }
    const top = Math.min(...layers.flatMap((layer) => layer.points.map((p) => p.y)));
    expect(top).toBeLessThan(-STACK_HEIGHT * 12);
    expect(top).toBeGreaterThan(-STACK_HEIGHT * 12 - 12);
  });

  it("strides and leans only when reduced motion is off", () => {
    expect(stackPose(false, false, 0, false)).toBe("stand");
    expect(stackPose(true, true, 0, false)).toBe("cast");
    expect(stackPose(true, false, 0, false)).toBe("stride-a");
    expect(stackPose(true, false, 0.2, false)).toBe("stride-b");
    expect(stackPose(true, true, 0.2, true)).toBe("stand");
  });

  it("wears its own cape's colours, or the body colour darker without one", () => {
    expect(stackTones(0x59c2ff, undefined).cape).toBe(0x357499);
    expect(stackTones(0x59c2ff, undefined).trim).toBe(0x357499);
    const cape = {
      look: { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] },
      pattern: undefined,
    };
    expect(stackTones(0x59c2ff, cape)).toMatchObject({
      cape: 0x203040,
      trim: 0xc0a060,
      crest: 0xc0a060,
    });
  });

  it("trims a cape's hem, and bands its back in the pattern", () => {
    const trimmed = (pattern: Parameters<typeof capeSliceTrimmed>[0]): number[] =>
      Array.from({ length: 11 }, (_, i) => i).filter((i) => capeSliceTrimmed(pattern, i, 11));
    expect(trimmed(undefined)).toEqual([0]);
    expect(trimmed("stripes")).toEqual([0, 2, 4, 6, 8, 10]);
    expect(trimmed("chevrons")).toEqual([0, 3, 6, 9]);
    expect(trimmed("quarters")).toEqual([0, 6, 7, 8, 9, 10]);
    expect(trimmed("stars")).toEqual([0, 4, 8]);
  });
});
