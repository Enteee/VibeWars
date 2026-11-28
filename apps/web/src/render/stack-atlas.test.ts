import { describe, expect, it } from "vitest";

import { CREATURE_LOOKS } from "@vibewars/game-core";
import { BUILDS, HEIGHTS, type FigureBody } from "@vibewars/game-protocol";

import {
  STACK_BAKE_RADIUS,
  STACK_BAKE_SCALE,
  STACK_FRAME_HEIGHT,
  STACK_FRAME_WIDTH,
  StackAtlas,
  stackFrameName,
  stackFrameSize,
  stackLookKey,
  type AtlasSurface,
  type BakeContext,
  type BodyStackLook,
  type CreatureStackLook,
} from "./stack-atlas.js";
import {
  STACK_BAKED_HEADINGS,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  bucketFacing,
  creatureFacing,
  creatureLayers,
  creatureSlices,
  creatureStack,
  stackLayers,
  stackSlices,
  stackTones,
} from "./sprite-stack.js";
import { AVERAGE_BODY } from "./figure-body.js";
import { CREATURE_DRAWN_RADIUS } from "./creature-shape.js";
import { PROFESSION_OUTFITS, SECONDARY_ACCENTS } from "./profession-outfits.js";

const BARE = { primary: undefined, secondary: undefined, physique: AVERAGE_BODY } as const;
const FRIEND: BodyStackLook = { kind: "body", body: 0x59c2ff, cape: undefined, ...BARE };
const FOE: BodyStackLook = { kind: "body", body: 0xff7b72, cape: undefined, ...BARE };
const CAPED: BodyStackLook = {
  kind: "body",
  body: 0x59c2ff,
  cape: { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] },
  ...BARE,
};
const FRAMES = STACK_BAKED_HEADINGS.length * STACK_POSES.length;

/** A canvas that draws nothing: records its frames, uploads, rect uploads and whether it was dropped. */
class FakeSurface implements AtlasSurface {
  public readonly frames = new Map<string, number>();
  public readonly areas = new Map<string, number>();
  public readonly boxes = new Map<string, readonly [number, number, number, number]>();
  public refreshes = 0;
  public readonly rects: (readonly [number, number, number, number])[] = [];
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
      globalAlpha: 1,
    };
  }

  public addFrame(name: string, x: number, y: number, width: number, height: number): void {
    this.frames.set(name, y);
    this.boxes.set(name, [x, y, width, height]);
    this.areas.set(name, width * height);
  }

  public refresh(): void {
    this.refreshes += 1;
  }

  public refreshRect(x: number, y: number, width: number, height: number): void {
    this.rects.push([x, y, width, height]);
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
    expect(surfaces[0]?.rects).toEqual([]);
    expect(surfaces[0]?.fills).toBeGreaterThan(0);
  });

  it("bakes each distinct look once, a row each; a cape and its colours make a look", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE, CAPED, FOE, FRIEND]);
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(new Set([FRIEND, FOE, CAPED].map(stackLookKey)).size).toBe(3);
    const rows = [...new Set(surfaces[0]?.frames.values())].sort((a, b) => a - b);
    const top = rows[0] ?? 0;
    expect(rows).toEqual([0, 1, 2].map((r) => top + r * STACK_FRAME_HEIGHT));
    expect(
      stackLookKey({ ...CAPED, cape: CAPED.cape && { ...CAPED.cape, trim: 0xa0a0a0 } }),
    ).not.toBe(stackLookKey(CAPED));
  });

  it("makes a look of a primary and of a secondary, each its own frames (#4175)", () => {
    const monk: BodyStackLook = { ...FRIEND, primary: "monk" };
    const healer: BodyStackLook = { ...monk, secondary: "ranger" };
    const { atlas: made } = atlas();
    made.bake([FRIEND, monk, healer]);
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(new Set([FRIEND, monk, healer].map(stackLookKey)).size).toBe(3);
    const names = [FRIEND, monk, healer].map((look) => made.frame(look, 4, "stand")?.name);
    expect(new Set(names).size).toBe(3);
    expect(names).not.toContain(undefined);
  });

  it("makes a look of each height and build, the same physique shared (#4176)", () => {
    const tall: BodyStackLook = { ...FRIEND, physique: { height: "tall", build: "average" } };
    const heavy: BodyStackLook = { ...FRIEND, physique: { height: "average", build: "heavy" } };
    const { atlas: made } = atlas();
    made.bake([FRIEND, tall, heavy, { ...tall }, FRIEND]);
    expect(made.bakedFigures).toBe(3 * FRAMES);
    expect(new Set([FRIEND, tall, heavy].map(stackLookKey)).size).toBe(3);
  });

  it("names the frame of a baked look by heading bucket and pose, mirrored where it bakes none", () => {
    const { atlas: made } = atlas();
    made.bake([FOE]);
    expect(made.frame(FOE, 4, "cast")).toMatchObject({
      name: stackFrameName(stackLookKey(FOE), 4, "cast"),
      flipped: false,
    });
    expect(made.frame(FOE, 1, "contact-a")).toMatchObject({
      name: stackFrameName(stackLookKey(FOE), 7, "contact-b"),
      flipped: true,
    });
  });

  it.each(HEIGHTS.flatMap((height) => BUILDS.map((build) => ({ height, build }))))(
    "fits a $height $build body, every outfit and accent, every pose at every baked heading, in its frame, outline and all (#4060, #4175, #4176)",
    (body) => {
      const r = STACK_BAKE_RADIUS * STACK_BAKE_SCALE;
      const pad = STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE;
      const outfits = Object.values(PROFESSION_OUTFITS);
      // An accent's tone moves no point: one accent of each kind covers every shape.
      const accents = [
        undefined,
        ...new Map(
          Object.values(SECONDARY_ACCENTS).map((accent) => [accent.kind, accent]),
        ).values(),
      ];
      const frame = stackFrameSize(body);
      let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const outfit of outfits) {
        for (const accent of accents) {
          const tones = stackTones(FRIEND.body, undefined, outfit, accent);
          for (const pose of STACK_POSES) {
            const slices = stackSlices(pose, outfit, accent, body);
            for (const bucket of STACK_BAKED_HEADINGS) {
              const layers = stackLayers(slices, bucketFacing(bucket), r, tones, body.height);
              for (const p of layers.flatMap((layer) => layer.points)) {
                left = Math.min(left, p.x);
                right = Math.max(right, p.x);
                top = Math.min(top, p.y);
                bottom = Math.max(bottom, p.y);
              }
            }
          }
        }
      }
      expect(frame.feetX + left - pad).toBeGreaterThanOrEqual(0);
      expect(frame.feetX + right + pad).toBeLessThanOrEqual(frame.width);
      expect(frame.feetY + top - pad).toBeGreaterThanOrEqual(0);
      expect(frame.feetY + bottom + pad).toBeLessThanOrEqual(frame.height);
    },
  );

  /** The surface sixteen looks of `physique` and every creature bake onto. */
  const sixteen = (physique: FigureBody): FakeSurface | undefined => {
    const { atlas: made, surfaces } = atlas();
    made.bake([
      ...Array.from({ length: 16 }, (_, i) => ({
        kind: "body" as const,
        body: 0x100000 * i + 0x40,
        cape: undefined,
        ...BARE,
        physique,
      })),
      ...CREATURE_LOOKS.map((look) => ({ kind: "creature" as const, look })),
    ]);
    return surfaces.at(-1);
  };

  it("holds sixteen looks and every creature in under 18 MB, a row no wider than 4096 px (#4060)", () => {
    const surface = sixteen(AVERAGE_BODY);
    expect(surface?.width).toBe(FRAMES * STACK_FRAME_WIDTH);
    expect(surface?.width).toBeLessThanOrEqual(4096);
    // 72 frames of 44 × 75 a look, 4 bytes a pixel: 15.2 MB for sixteen,
    // and the creature rows' 2 MB allowance (#4171) on top.
    expect((surface?.width ?? 0) * (surface?.height ?? 0) * 4).toBeLessThan(18e6);
  });

  it("holds sixteen tall heavy looks and every creature in under 24 MB, within 4096 px a side (#4176)", () => {
    const surface = sixteen({ height: "tall", build: "heavy" });
    const frame = stackFrameSize({ height: "tall", build: "heavy" });
    expect(surface?.width).toBe(FRAMES * frame.width);
    expect(surface?.width).toBeLessThanOrEqual(4096);
    expect(surface?.height).toBeLessThanOrEqual(4096);
    // 72 frames of 54 × 82 a look: 20.4 MB for sixteen, creatures on top.
    expect((surface?.width ?? 0) * (surface?.height ?? 0) * 4).toBeLessThan(24e6);
  });

  it("sizes a body's frame by its physique: the average frame for an average, short or lean body (#4176)", () => {
    const average = stackFrameSize(AVERAGE_BODY);
    expect(average).toEqual({
      width: STACK_FRAME_WIDTH,
      height: STACK_FRAME_HEIGHT,
      feetX: STACK_FRAME_WIDTH / 2,
      feetY: 63,
    });
    expect(stackFrameSize({ height: "short", build: "lean" })).toEqual(average);
    expect(stackFrameSize({ height: "tall", build: "average" }).height).toBeGreaterThan(
      average.height,
    );
    expect(stackFrameSize({ height: "average", build: "heavy" }).width).toBeGreaterThan(
      average.width,
    );
  });

  it("moves onto a wider canvas when a heavy look joins average ones, every row baked again (#4176)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND]);
    const heavy: BodyStackLook = { ...FOE, physique: { height: "average", build: "heavy" } };
    made.bake([FRIEND, heavy]);
    expect(surfaces.at(-1)?.width).toBe(FRAMES * stackFrameSize(heavy.physique).width);
    expect(surfaces.at(-1)?.frames.size).toBe(2 * FRAMES);
    expect(made.frame(heavy, 4, "stand")).toMatchObject({ width: 54, feetX: 27 });
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
    // A new canvas uploads whole (#4271).
    expect(surfaces[1]?.refreshes).toBe(1);
    expect(surfaces[1]?.rects).toEqual([]);
  });

  it("rebuilds every look after a lost context, and drops the canvas at match end", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE]);
    made.rebuild();
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.destroyed).toBe(true);
    expect(surfaces[1]?.frames.size).toBe(2 * FRAMES);
    expect(surfaces[1]?.refreshes).toBe(1);
    expect(surfaces[1]?.rects).toEqual([]);
    expect(made.bakedFigures).toBe(4 * FRAMES);
    made.destroy();
    expect(surfaces[1]?.destroyed).toBe(true);
    expect(made.frame(FRIEND, 0, "stand")).toBeUndefined();
  });
});

describe("StackAtlas creatures (#4171)", () => {
  const SPIRIT: CreatureStackLook = { kind: "creature", look: "spirit" };
  const GHOST: CreatureStackLook = { kind: "creature", look: "ghostly-hero" };

  it("bakes a creature look once, whoever's team summons it: a spirit 1 frame, a ghost 8 × 3", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([SPIRIT, GHOST, SPIRIT, { kind: "creature", look: "spirit" }]);
    expect(made.bakedFigures).toBe(1 + 24);
    expect(surfaces.at(-1)?.frames.size).toBe(25);
    expect(made.frame(SPIRIT, 9, "contact-a")).toMatchObject({
      name: stackFrameName(stackLookKey(SPIRIT), 0, "stand"),
      flipped: false,
    });
    expect(made.frame(GHOST, 4, "contact-b")?.name).toBe(
      stackFrameName(stackLookKey(GHOST), 2, "stride-b"),
    );
  });

  it("sizes a creature's frame by its drawn radius, every frame fitting, outline and all", () => {
    const { atlas: made } = atlas();
    made.bake([SPIRIT, GHOST]);
    const spirit = made.frame(SPIRIT, 0, "stand");
    const ghost = made.frame(GHOST, 0, "stand");
    expect(spirit?.radius).toBe(CREATURE_DRAWN_RADIUS.spirit);
    expect(ghost?.radius).toBe(CREATURE_DRAWN_RADIUS["ghostly-hero"]);
    expect((spirit?.width ?? 0) * (spirit?.height ?? 0)).toBeLessThan(
      (ghost?.width ?? 0) * (ghost?.height ?? 0),
    );
    const pad = STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE;
    for (const [look, frame] of [
      ["spirit", spirit],
      ["ghostly-hero", ghost],
    ] as const) {
      const stack = creatureStack(look);
      for (const pose of stack?.poses ?? []) {
        for (let bucket = 0; bucket < (stack?.headings ?? 0); bucket += 1) {
          const layers = creatureLayers(
            creatureSlices(look, pose) ?? [],
            stack ? creatureFacing(stack, bucket) : 0,
            CREATURE_DRAWN_RADIUS[look] * STACK_BAKE_SCALE,
          );
          for (const { x, y } of layers.flatMap((layer) => layer.points)) {
            expect((frame?.feetX ?? 0) + x - pad).toBeGreaterThanOrEqual(0);
            expect((frame?.feetX ?? 0) + x + pad).toBeLessThanOrEqual(frame?.width ?? 0);
            expect((frame?.feetY ?? 0) + y - pad).toBeGreaterThanOrEqual(0);
            expect((frame?.feetY ?? 0) + y + pad).toBeLessThanOrEqual(frame?.height ?? 0);
          }
        }
      }
    }
  });

  it("keeps every creature look within the 2 MB creature allowance", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake(CREATURE_LOOKS.map((look) => ({ kind: "creature" as const, look })));
    const bytes = [...(surfaces.at(-1)?.areas.values() ?? [])].reduce((sum, a) => sum + a * 4, 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(2e6);
  });

  it("gives a look with no figure no frame, and schedules no bake for it", () => {
    const { atlas: made, queued } = atlas();
    const beast: CreatureStackLook = { kind: "creature", look: "beast" };
    made.bake([beast]);
    expect(made.bakedFigures).toBe(0);
    expect(made.frame(beast, 0, "stand")).toBeUndefined();
    expect(queued).toHaveLength(0);
  });

  it("keeps a creature row on the shelves over the bodies' in the same canvas (#4172)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, FOE, SPIRIT]);
    expect(surfaces).toHaveLength(1);
    const spirit = surfaces[0]?.boxes.get(stackFrameName(stackLookKey(SPIRIT), 0, "stand"));
    const body = surfaces[0]?.frames.get(made.frame(FRIEND, 0, "stand")?.name ?? "");
    expect((spirit?.[1] ?? Infinity) + (spirit?.[3] ?? 0)).toBeLessThanOrEqual(body ?? 0);
  });

  it("packs every creature on shelves, no two frames overlapping, none off the canvas (#4172)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND, ...CREATURE_LOOKS.map((look) => ({ kind: "creature" as const, look }))]);
    const surface = surfaces.at(-1);
    const boxes = [...(surface?.boxes.values() ?? [])];
    for (const [x, y, w, h] of boxes) {
      expect(x + w).toBeLessThanOrEqual(surface?.width ?? 0);
      expect(y + h).toBeLessThanOrEqual(surface?.height ?? 0);
    }
    const overlaps = boxes.filter(([x, y, w, h], i) =>
      boxes.some(([u, v, s, t], j) => j > i && x < u + s && u < x + w && y < v + t && v < y + h),
    );
    expect(overlaps).toEqual([]);
  });

  it("bakes a creature row summoned after the roster alone, never the bodies again", () => {
    const { atlas: made, surfaces, queued } = atlas();
    made.bake([FRIEND, FOE]);
    expect(made.frame(SPIRIT, 0, "stand")).toBeUndefined();
    queued[0]?.();
    expect(surfaces).toHaveLength(1);
    expect(made.bakedFigures).toBe(2 * FRAMES + 1);
    expect(made.frame(SPIRIT, 0, "stand")).toBeDefined();
    // It uploads its own shelf and nothing else (#4271).
    expect(surfaces[0]?.refreshes).toBe(1);
    const shelf = surfaces[0]?.boxes.get(stackFrameName(stackLookKey(SPIRIT), 0, "stand"));
    expect(surfaces[0]?.rects).toEqual([shelf]);
    const [x, y, w, h] = shelf ?? [0, 0, 0, 0];
    const body = surfaces[0]?.frames.get(made.frame(FRIEND, 0, "stand")?.name ?? "");
    expect(x + w).toBeLessThanOrEqual(surfaces[0]?.width ?? 0);
    expect(y + h).toBeLessThanOrEqual(body ?? 0);
  });

  it("uploads a body row baked into room a grown canvas kept as its own rect (#4271)", () => {
    const { atlas: made, surfaces } = atlas();
    made.bake([FRIEND]);
    made.bake([FOE]);
    made.bake([CAPED]);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[1]?.refreshes).toBe(1);
    const row = [...(surfaces[1]?.boxes.entries() ?? [])]
      .filter(([name]) => name.startsWith(stackLookKey(CAPED)))
      .map(([, box]) => box);
    const top = Math.min(...row.map(([, y]) => y));
    const right = Math.max(...row.map(([x, , w]) => x + w));
    const height = row[0]?.[3] ?? 0;
    expect(surfaces[1]?.rects).toEqual([[0, top, right, height]]);
  });

  it("bakes each look a match may bring on later, one task each, once, and none with no figure (#4172)", () => {
    const { atlas: made, queued } = atlas();
    made.bake([FRIEND, SPIRIT]);
    const GOLEM: CreatureStackLook = { kind: "creature", look: "flesh-golem" };
    const PRIEST: CreatureStackLook = { kind: "creature", look: "priest" };
    made.bakeLater([SPIRIT, GHOST, GOLEM, GHOST, PRIEST]);
    made.bakeLater([GOLEM]);
    expect(made.frame(GOLEM, 0, "stand")).toBeUndefined();
    expect(queued).toHaveLength(2);
    const before = made.bakedFigures;
    queued[0]?.();
    expect(made.bakedFigures).toBe(before + 24);
    expect(made.frame(GHOST, 0, "stand")).toBeDefined();
    expect(made.frame(GOLEM, 0, "stand")).toBeUndefined();
    queued[1]?.();
    expect(made.frame(GOLEM, 0, "stand")).toBeDefined();
    expect(queued).toHaveLength(2);
  });
});
