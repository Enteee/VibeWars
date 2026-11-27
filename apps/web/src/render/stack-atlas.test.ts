import { describe, expect, it } from "vitest";
import { CREATURE_LOOKS } from "@vibewars/game-core";

import { CREATURE_DRAWN_RADIUS } from "./creature-shape.js";
import {
  BODY_FRAME,
  STACK_BAKE_RADIUS,
  STACK_BAKE_SCALE,
  STACK_FRAME_FEET_X,
  STACK_FRAME_FEET_Y,
  STACK_FRAME_HEIGHT,
  STACK_FRAME_WIDTH,
  StackAtlas,
  creatureFrame,
  stackFrameName,
  stackLookKey,
  type AtlasSurface,
  type BakeContext,
  type StackLook,
} from "./stack-atlas.js";
import {
  CREATURE_TONES,
  STACK_BAKED_HEADINGS,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  bucketFacing,
  creatureSlices,
  creatureStack,
  stackLayers,
  stackSlices,
  stackTones,
} from "./sprite-stack.js";

type Body = Extract<StackLook, { kind: "body" }>;
const FRIEND: Body = { kind: "body", body: 0x59c2ff, cape: undefined };
const FOE: Body = { kind: "body", body: 0xff7b72, cape: undefined };
const CAPED: Body = {
  kind: "body",
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
      shape: BODY_FRAME,
    });
    expect(made.frame(FOE, 1, "contact-a")).toEqual({
      name: stackFrameName(stackLookKey(FOE), 7, "contact-b"),
      flipped: true,
      shape: BODY_FRAME,
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
      Array.from({ length: 16 }, (_, i): StackLook => ({
        kind: "body",
        body: 0x100000 * i + 0x40,
        cape: undefined,
      })),
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

describe("StackAtlas creatures (#4171)", () => {
  const SPIRIT: StackLook = { kind: "creature", look: "spirit" };
  const GHOST: StackLook = { kind: "creature", look: "ghostly-hero" };
  const ALL = CREATURE_LOOKS.map((look): StackLook => ({ kind: "creature", look }));

  it("bakes a creature row per look, never per team, and none for a look still a disc", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([...ALL, SPIRIT, GHOST]);
    // The spirit's one frame and the ghost's 8 headings by 3 poses.
    expect(made.bakedFigures).toBe(1 + 24);
    expect(stackLookKey(SPIRIT)).toBe("creature/spirit");
    const names = [...(surfaces[0]?.frames.keys() ?? [])];
    expect(names.filter((name) => name.startsWith("creature/spirit:"))).toEqual([
      stackFrameName("creature/spirit", 0, "stand"),
    ]);
    expect(made.creatureFrame("ghostly-hero", 3, "stride-b")?.name).toBe(
      stackFrameName("creature/ghostly-hero", 3, "stride-b"),
    );
    expect(made.creatureFrame("bone-minion", 0, "stand")).toBeUndefined();
  });

  it("sizes a creature's frames by its radius and crops them to every heading and pose it bakes", () => {
    for (const look of ["spirit", "ghostly-hero"] as const) {
      const stack = creatureStack(look);
      if (stack === undefined) {
        throw new Error(look);
      }
      const shape = creatureFrame(look, stack);
      expect(shape.radius).toBe(CREATURE_DRAWN_RADIUS[look]);
      const r = CREATURE_DRAWN_RADIUS[look] * stack.scale * STACK_BAKE_SCALE;
      const pad = STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE;
      for (let bucket = 0; bucket < stack.headings; bucket += 1) {
        for (const pose of stack.poses) {
          const layers = stackLayers(
            creatureSlices(look, pose) ?? [],
            (bucket * Math.PI * 2) / stack.headings,
            r,
            CREATURE_TONES,
          );
          for (const { x, y } of layers.flatMap((layer) => layer.points)) {
            expect(shape.feetX + x - pad).toBeGreaterThanOrEqual(0);
            expect(shape.feetX + x + pad).toBeLessThanOrEqual(shape.width);
            expect(shape.feetY + y - pad).toBeGreaterThanOrEqual(0);
            expect(shape.feetY + y + pad).toBeLessThanOrEqual(shape.height);
          }
        }
      }
    }
    const spirit = creatureFrame("spirit", creatureStack("spirit") ?? BAD);
    const ghost = creatureFrame("ghostly-hero", creatureStack("ghostly-hero") ?? BAD);
    // A spirit is smaller than a hero, its frame not a body's.
    expect(spirit.width * spirit.height).toBeLessThan(ghost.width * ghost.height);
    expect(spirit.width * spirit.height).toBeLessThan(BODY_FRAME.width * BODY_FRAME.height);
  });

  it("shelves creature frames together, inside the 2 MB creature allowance beside a match's bodies", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE, ...ALL]);
    // Two body rows, then one shelf: the ghost's frames follow the spirit's.
    expect(new Set(surfaces.at(-1)?.frames.values())).toEqual(
      new Set([0, 1, 2].map((r) => r * BODY_FRAME.height)),
    );
    const shelf = Math.max(
      ...(["spirit", "ghostly-hero"] as const).map(
        (look) => creatureFrame(look, creatureStack(look) ?? BAD).height,
      ),
    );
    expect(made.bytes).toBe(BODY_FRAME.width * FRAMES * (2 * BODY_FRAME.height + shelf) * 4);
    // What every stacked creature look's frames hold, 4 bytes a pixel.
    const creatures = CREATURE_LOOKS.reduce((sum, look) => {
      const stack = creatureStack(look);
      if (stack === undefined) {
        return sum;
      }
      const shape = creatureFrame(look, stack);
      return sum + shape.width * shape.height * stack.headings * stack.poses.length * 4;
    }, 0);
    expect(creatures).toBeLessThan(2e6);
    console.info(
      `creature frames: ${String(creatures)} B; atlas with two bodies: ${String(made.bytes)} B`,
    );
    expect(made.creatureFrame("spirit", 0, "stand")?.shape.radius).toBe(
      CREATURE_DRAWN_RADIUS.spirit,
    );
  });
});

const BAD = { headings: 1, poses: [], scale: 1, alpha: 1 } as const;
