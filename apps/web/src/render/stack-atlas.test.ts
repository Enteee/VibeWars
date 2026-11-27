import { describe, expect, it } from "vitest";

import {
  STACK_BAKE_RADIUS,
  STACK_BAKE_SCALE,
  STACK_FRAME_FEET_X,
  STACK_FRAME_FEET_Y,
  STACK_FRAME_HEIGHT,
  STACK_FRAME_WIDTH,
  StackAtlas,
  stackFrameName,
  stackLookKey,
  type AtlasSurface,
  type BakeContext,
  type StackLook,
} from "./stack-atlas.js";
import {
  STACK_BAKED_HEADINGS,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  bucketFacing,
  stackLayers,
  stackSlices,
  stackTones,
} from "./sprite-stack.js";

const FRIEND: StackLook = { body: 0x59c2ff, cape: undefined };
const FOE: StackLook = { body: 0xff7b72, cape: undefined };
const CAPED: StackLook = {
  body: 0x59c2ff,
  cape: { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] },
};
const FRAMES = STACK_BAKED_HEADINGS.length * STACK_POSES.length;

/** A canvas that draws nothing: records its frames, uploads and whether it was dropped. */
class FakeSurface implements AtlasSurface {
  public readonly frames = new Map<string, number>();
  public refreshes = 0;
  public destroyed = false;
  public fills = 0;
  public readonly context: BakeContext;
  public readonly width: number;
  public readonly height: number;

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const noop = (): void => undefined;
    this.context = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineJoin: "miter",
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: () => {
        this.fills += 1;
      },
      stroke: noop,
      clearRect: noop,
    };
  }

  public addFrame(name: string, _x: number, y: number): void {
    this.frames.set(name, y);
  }

  public refresh(): void {
    this.refreshes += 1;
  }

  public destroy(): void {
    this.destroyed = true;
  }
}

function atlas(): {
  readonly atlas: StackAtlas;
  readonly surfaces: FakeSurface[];
  readonly queued: (() => void)[];
} {
  const surfaces: FakeSurface[] = [];
  const queued: (() => void)[] = [];
  const made = new StackAtlas(
    (width, height) => {
      const surface = new FakeSurface(width, height);
      surfaces.push(surface);
      return surface;
    },
    (bake) => queued.push(bake),
  );
  return { atlas: made, surfaces, queued };
}

describe("StackAtlas (ADR-0057, #4031)", () => {
  it("bakes a look shared by eight bodies once: 9 baked headings by 8 poses, one upload (#4060)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake(Array.from({ length: 8 }, () => FRIEND));
    expect(made.bakedFigures).toBe(FRAMES);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.frames.size).toBe(FRAMES);
    expect(surfaces[0]?.refreshes).toBe(1);
    expect(surfaces[0]?.fills).toBeGreaterThan(0);
  });

  it("bakes each distinct look once, a row each; a cape and its colours make a look", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE, CAPED, FOE, FRIEND]);
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(new Set([FRIEND, FOE, CAPED].map(stackLookKey)).size).toBe(3);
    const rows = new Set(surfaces[0]?.frames.values());
    expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2].map((r) => r * STACK_FRAME_HEIGHT));
    expect(
      stackLookKey({ ...CAPED, cape: CAPED.cape && { ...CAPED.cape, trim: 0xa0a0a0 } }),
    ).not.toBe(stackLookKey(CAPED));
  });

  it("names the frame of a baked look by heading bucket and pose, mirrored where it bakes none", () => {
    const { atlas: made } = atlas();
    made.bake([FOE]);
    expect(made.frame(FOE, 4, "cast")).toEqual({
      name: stackFrameName(stackLookKey(FOE), 4, "cast"),
      flipped: false,
    });
    expect(made.frame(FOE, 1, "contact-a")).toEqual({
      name: stackFrameName(stackLookKey(FOE), 7, "contact-b"),
      flipped: true,
    });
  });

  it("fits every pose at every baked heading in its frame, outline and all (#4060)", () => {
    const r = STACK_BAKE_RADIUS * STACK_BAKE_SCALE;
    const pad = STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE;
    for (const pose of STACK_POSES) {
      for (const bucket of STACK_BAKED_HEADINGS) {
        const layers = stackLayers(
          stackSlices(pose),
          bucketFacing(bucket),
          r,
          stackTones(FRIEND.body, undefined),
        );
        for (const { x, y } of layers.flatMap((layer) => layer.points)) {
          expect(STACK_FRAME_FEET_X + x - pad).toBeGreaterThanOrEqual(0);
          expect(STACK_FRAME_FEET_X + x + pad).toBeLessThanOrEqual(STACK_FRAME_WIDTH);
          expect(STACK_FRAME_FEET_Y + y - pad).toBeGreaterThanOrEqual(0);
          expect(STACK_FRAME_FEET_Y + y + pad).toBeLessThanOrEqual(STACK_FRAME_HEIGHT);
        }
      }
    }
  });

  it("holds sixteen looks in under 16 MB, a row no wider than 4096 px (#4060)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake(
      Array.from({ length: 16 }, (_, i) => ({ body: 0x100000 * i + 0x40, cape: undefined })),
    );
    const surface = surfaces.at(-1);
    expect(surface?.width).toBe(FRAMES * STACK_FRAME_WIDTH);
    expect(surface?.width).toBeLessThanOrEqual(4096);
    // 72 frames of 44 × 75 a look, 4 bytes a pixel: 15.2 MB for sixteen.
    expect((surface?.width ?? 0) * (surface?.height ?? 0) * 4).toBeLessThan(16e6);
  });

  it("bakes a late look off the frame path, once, and shows nothing baked until then", () => {
    const { atlas: made, queued } = atlas();
    made.bake([FRIEND]);
    expect(made.frame(FOE, 0, "stand")).toBeUndefined();
    expect(made.frame(FOE, 0, "stand")).toBeUndefined();
    expect(queued).toHaveLength(1);
    expect(made.bakedFigures).toBe(FRAMES);
    queued[0]?.();
    // A second row does not fit the first canvas: both bake onto a new one.
    expect(made.bakedFigures).toBe(3 * FRAMES);
    queued[0]?.();
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(made.frame(FOE, 4, "stand")?.name).toBe(stackFrameName(stackLookKey(FOE), 4, "stand"));
  });

  it("grows onto a new canvas when a look no longer fits, baking every row again", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND]);
    made.bake([FOE]);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.destroyed).toBe(true);
    expect(surfaces[1]?.frames.size).toBe(2 * FRAMES);
  });

  it("rebuilds every look after a lost context, and drops the canvas at match end", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE]);
    made.rebuild();
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.destroyed).toBe(true);
    expect(surfaces[1]?.frames.size).toBe(2 * FRAMES);
    expect(surfaces[1]?.refreshes).toBe(1);
    expect(made.bakedFigures).toBe(4 * FRAMES);
    made.destroy();
    expect(surfaces[1]?.destroyed).toBe(true);
    expect(made.frame(FRIEND, 0, "stand")).toBeUndefined();
  });
});
