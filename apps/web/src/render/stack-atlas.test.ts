import { describe, expect, it } from "vitest";

import {
  STACK_FRAME_HEIGHT,
  StackAtlas,
  stackFrameName,
  stackLookKey,
  type AtlasSurface,
  type BakeContext,
  type StackLook,
} from "./stack-atlas.js";
import { STACK_HEADINGS, STACK_POSES } from "./sprite-stack.js";

const FRIEND: StackLook = { body: 0x59c2ff, cape: undefined };
const FOE: StackLook = { body: 0xff7b72, cape: undefined };
const CAPED: StackLook = {
  body: 0x59c2ff,
  cape: { look: { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] }, pattern: "stripes" },
};
const FRAMES = STACK_HEADINGS * STACK_POSES.length;

/** A canvas that draws nothing: records its frames, uploads and whether it was dropped. */
class FakeSurface implements AtlasSurface {
  public readonly frames = new Map<string, number>();
  public refreshes = 0;
  public destroyed = false;
  public fills = 0;
  public readonly context: BakeContext;

  public constructor() {
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
      ellipse: noop,
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
    () => {
      const surface = new FakeSurface();
      surfaces.push(surface);
      return surface;
    },
    (bake) => queued.push(bake),
  );
  return { atlas: made, surfaces, queued };
}

describe("StackAtlas (ADR-0057, #4031)", () => {
  it("bakes a look shared by eight bodies once: 8 headings by 4 poses, one upload", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake(Array.from({ length: 8 }, () => FRIEND));
    expect(made.bakedFigures).toBe(FRAMES);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.frames.size).toBe(FRAMES);
    expect(surfaces[0]?.refreshes).toBe(1);
    expect(surfaces[0]?.fills).toBeGreaterThan(0);
  });

  it("bakes each distinct look once, a row each; a cape and its pattern make a look", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE, CAPED, FOE, FRIEND]);
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(new Set([FRIEND, FOE, CAPED].map(stackLookKey)).size).toBe(3);
    const rows = new Set(surfaces[0]?.frames.values());
    expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2].map((r) => r * STACK_FRAME_HEIGHT));
    expect(
      stackLookKey({ ...CAPED, cape: CAPED.cape && { ...CAPED.cape, pattern: "stars" } }),
    ).not.toBe(stackLookKey(CAPED));
  });

  it("names the frame of a baked look by heading bucket and pose", () => {
    const { atlas: made } = atlas();
    made.bake([FOE]);
    expect(made.frame(FOE, Math.PI / 2, "cast")).toBe(stackFrameName(stackLookKey(FOE), 2, "cast"));
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
    expect(made.frame(FOE, 0, "stand")).toBe(stackFrameName(stackLookKey(FOE), 0, "stand"));
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
