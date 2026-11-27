import type { CreatureLook } from "@vibewars/game-core";

import type { CapeLook } from "./cape-shape.js";
import { CREATURE_DRAWN_RADIUS } from "./creature-shape.js";
import {
  CREATURE_TONES,
  STACK_BAKED_HEADINGS,
  STACK_HEIGHT,
  STACK_OUTLINE,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  bakedFrame,
  bucketFacing,
  creatureSlices,
  creatureStack,
  stackLayers,
  stackSlices,
  stackTones,
  type CreaturePose,
  type CreatureStack,
  type StackLayer,
  type StackPose,
} from "./sprite-stack.js";

/**
 * Every stacked figure of a match baked once into one atlas (ADR-0057,
 * #4031): at match start, every look on the roster, its baked headings
 * by its poses (#4060), the rest drawn as their mirror images; a look that turns up later bakes off the frame path, and the
 * body shows its flat disc until it has. A frame then draws one small
 * image per body, tinted by the light at its feet, never the slices.
 * A stacked creature (#4171) has a row of its own look's headings by its
 * poses, never its team's, its frames cropped to what it covers.
 */

/** What a body is painted in: its body colour, and the cape it wears. */
export interface BodyLook {
  readonly body: number;
  readonly cape: CapeLook | undefined;
}

/** What one row of the atlas holds: a body's look, or a creature's (#4171). */
export type StackLook =
  | ({ readonly kind: "body" } & BodyLook)
  | { readonly kind: "creature"; readonly look: CreatureLook };

/** The body radius the bake draws at; a body of another radius scales its image. */
export const STACK_BAKE_RADIUS = 14;
/** Pixels per world unit in the bake, so the figure stays crisp at match zoom. */
export const STACK_BAKE_SCALE = 1.5;
/**
 * One frame, pixels (#4060): wide enough for a swaying cape and a cast's
 * reach, and tall enough for a breath's lift over the crest and a stride's
 * arm under the feet, the outline round all of it. The shadow is no part
 * of it: `paintFigureGround` lays it on the ground.
 */
export const STACK_FRAME_WIDTH = 44;
export const STACK_FRAME_HEIGHT = 75;
/** Where the centre of the feet sits in a frame, pixels from its top-left. */
export const STACK_FRAME_FEET_X = STACK_FRAME_WIDTH / 2;
export const STACK_FRAME_FEET_Y = 63;

const FRAMES_PER_LOOK = STACK_BAKED_HEADINGS.length * STACK_POSES.length;

/** The 2D canvas calls a bake needs. */
export type BakeContext = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "clearRect"
>;

/** Where an atlas lives: a canvas texture, in a match Phaser's. */
export interface AtlasSurface {
  readonly context: BakeContext;
  /** Name the region of the canvas a frame is. */
  addFrame(name: string, x: number, y: number, width: number, height: number): void;
  /** Upload what the canvas now holds. */
  refresh(): void;
  destroy(): void;
}

/** A surface `width` × `height` pixels, empty. */
export type SurfaceFactory = (width: number, height: number) => AtlasSurface;

const css = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;

/**
 * A look's name: a body's colours, which is all its bake depends on, or a
 * creature's look, the same for every team.
 */
export function stackLookKey(look: StackLook): string {
  if (look.kind === "creature") {
    return `creature/${look.look}`;
  }
  const { cape } = look;
  const worn = cape === undefined ? "" : `/${css(cape.main)}${css(cape.trim)}`;
  return `${css(look.body)}${worn}`;
}

/**
 * The size of a row's frames, pixels, where the centre of the feet sits in
 * one, and the radius, world units, its figure was baked for: a figure of
 * another radius scales its image.
 */
export interface FrameShape {
  readonly width: number;
  readonly height: number;
  readonly feetX: number;
  readonly feetY: number;
  readonly radius: number;
}

/** A body's frames (#4060). */
export const BODY_FRAME: FrameShape = {
  width: STACK_FRAME_WIDTH,
  height: STACK_FRAME_HEIGHT,
  feetX: STACK_FRAME_FEET_X,
  feetY: STACK_FRAME_FEET_Y,
  radius: STACK_BAKE_RADIUS,
};

/** A frame of the atlas, whether it draws mirrored (#4060), and its row's shape. */
export interface StackFrame {
  readonly name: string;
  readonly flipped: boolean;
  readonly shape: FrameShape;
}

/** The frame a look's figure is in, at a heading bucket and pose. */
export function stackFrameName(
  key: string,
  bucket: number,
  pose: StackPose | CreaturePose,
): string {
  return `${key}:${String(bucket)}:${pose}`;
}

/**
 * One body into `context` with the centre of its feet at `x`, `y`.
 */
export function bakeFigure(
  context: BakeContext,
  x: number,
  y: number,
  look: BodyLook,
  bucket: number,
  pose: StackPose,
): void {
  const r = STACK_BAKE_RADIUS * STACK_BAKE_SCALE;
  bakeLayers(
    context,
    x,
    y,
    stackLayers(stackSlices(pose), bucketFacing(bucket), r, stackTones(look.body, look.cape)),
  );
}

/** The layers of creature `look` at its `bucket` and `pose`, at its bake size (#4171). */
function creatureLayers(
  look: CreatureLook,
  stack: CreatureStack,
  bucket: number,
  pose: CreaturePose,
): StackLayer[] {
  const r = CREATURE_DRAWN_RADIUS[look] * stack.scale * STACK_BAKE_SCALE;
  const facing = (bucket * Math.PI * 2) / stack.headings;
  return stackLayers(creatureSlices(look, pose) ?? [], facing, r, CREATURE_TONES);
}

/** The outline's reach past a slice's edge, pixels, and a pixel to spare. */
const FRAME_PAD = Math.ceil(STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE) + 1;

/**
 * A creature row's frame shape (#4171): every heading and pose of its
 * look fits, tight round what they cover, so a small look bakes small.
 */
export function creatureFrame(look: CreatureLook, stack: CreatureStack): FrameShape {
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (let bucket = 0; bucket < stack.headings; bucket += 1) {
    for (const pose of stack.poses) {
      for (const layer of creatureLayers(look, stack, bucket, pose)) {
        for (const p of layer.points) {
          left = Math.min(left, p.x);
          right = Math.max(right, p.x);
          top = Math.min(top, p.y);
          bottom = Math.max(bottom, p.y);
        }
      }
    }
  }
  const feetX = Math.ceil(-left) + FRAME_PAD;
  const feetY = Math.ceil(-top) + FRAME_PAD;
  return {
    width: feetX + Math.ceil(right) + FRAME_PAD,
    height: feetY + Math.ceil(bottom) + FRAME_PAD,
    feetX,
    feetY,
    radius: CREATURE_DRAWN_RADIUS[look],
  };
}

/**
 * `layers` into `context` with the centre of the feet at `x`, `y`:
 * every layer's outline, then every layer, so the outline shows only
 * round the silhouette.
 */
function bakeLayers(
  context: BakeContext,
  x: number,
  y: number,
  layers: readonly StackLayer[],
): void {
  const trace = (points: readonly { readonly x: number; readonly y: number }[]): void => {
    context.beginPath();
    points.forEach((p, i) => {
      if (i === 0) {
        context.moveTo(x + p.x, y + p.y);
      } else {
        context.lineTo(x + p.x, y + p.y);
      }
    });
    context.closePath();
  };
  context.strokeStyle = css(STACK_OUTLINE);
  context.lineWidth = STACK_OUTLINE_WIDTH * 2 * STACK_BAKE_SCALE;
  context.lineJoin = "round";
  for (const layer of layers) {
    trace(layer.points);
    context.stroke();
  }
  for (const layer of layers) {
    context.fillStyle = css(layer.colour);
    trace(layer.points);
    context.fill();
  }
}

/** How tall the figure stands over its feet, world units, at radius `r`. */
export function stackRise(r: number): number {
  return STACK_HEIGHT * r;
}

/** The atlas of one match's figures. */
export class StackAtlas {
  private readonly create: SurfaceFactory;
  private readonly schedule: (bake: () => void) => void;
  /** Every row the atlas holds, in order, and where each starts on the surface. */
  private readonly rows: AtlasRow[] = [];
  private readonly baked = new Set<string>();
  private readonly pending = new Set<string>();
  private surface: AtlasSurface | undefined;
  /** The surface's size, and how far down it is baked. */
  private width = 0;
  private height = 0;
  private filled = 0;
  private bakes = 0;

  /**
   * `schedule` runs a late look's bake off the frame path, as a
   * `setTimeout` does in a match.
   */
  public constructor(create: SurfaceFactory, schedule: (bake: () => void) => void) {
    this.create = create;
    this.schedule = schedule;
  }

  /** How many figures have been baked: one per look, per frame, per (re)build. */
  public get bakedFigures(): number {
    return this.bakes;
  }

  /** The bytes the surface holds, 4 a pixel. */
  public get bytes(): number {
    return this.width * this.height * 4;
  }

  /**
   * The roster's looks, baked at once: what match start calls. A creature
   * look that is not stacked has no row.
   */
  public bake(looks: Iterable<StackLook>): void {
    let added = false;
    for (const look of looks) {
      const key = stackLookKey(look);
      const row = atlasRow(look, key);
      if (row !== undefined && !this.baked.has(key)) {
        this.baked.add(key);
        this.pending.delete(key);
        this.rows.push(row);
        added = true;
      }
    }
    if (added) {
      this.build();
    }
  }

  /**
   * The frame `look` draws at heading `bucket` in `pose`, and whether it
   * draws flipped (`bakedFrame`), or `undefined` while it is not baked
   * yet: then its bake is scheduled, once.
   */
  public frame(look: BodyLook, bucket: number, pose: StackPose): StackFrame | undefined {
    const row: StackLook = { kind: "body", ...look };
    const key = stackLookKey(row);
    if (!this.ready(row, key)) {
      return undefined;
    }
    const baked = bakedFrame(bucket, pose);
    return {
      name: stackFrameName(key, baked.bucket, baked.pose),
      flipped: baked.flipped,
      shape: BODY_FRAME,
    };
  }

  /**
   * The frame creature `look` draws at its heading `bucket` in `pose`
   * (#4171), or `undefined` while it is not baked yet, as `frame`, or
   * when it is not stacked at all.
   */
  public creatureFrame(
    look: CreatureLook,
    bucket: number,
    pose: CreaturePose,
  ): StackFrame | undefined {
    const row: StackLook = { kind: "creature", look };
    const key = stackLookKey(row);
    if (creatureStack(look) === undefined || !this.ready(row, key)) {
      return undefined;
    }
    const shape = this.rows.find((baked) => baked.key === key)?.shape ?? BODY_FRAME;
    return { name: stackFrameName(key, bucket, pose), flipped: false, shape };
  }

  /** Bake every look again, as after a lost WebGL context. */
  public rebuild(): void {
    if (this.rows.length > 0) {
      this.build(true);
    }
  }

  /** Drop the atlas: the match is over. */
  public destroy(): void {
    this.surface?.destroy();
    this.surface = undefined;
    this.rows.length = 0;
    this.baked.clear();
    this.pending.clear();
    this.width = 0;
    this.height = 0;
    this.filled = 0;
  }

  /** Whether `look` is baked; if not, its bake is scheduled, once. */
  private ready(look: StackLook, key: string): boolean {
    if (this.baked.has(key)) {
      return true;
    }
    if (!this.pending.has(key)) {
      this.pending.add(key);
      this.schedule(() => {
        if (this.pending.has(key)) {
          this.bake([look]);
        }
      });
    }
    return false;
  }

  /**
   * Bake the rows not on the surface yet, or all of them on a new one when
   * they no longer fit, or `fresh`: one canvas, one upload.
   */
  private build(fresh = false): void {
    const width = Math.max(this.width, ...this.rows.map((row) => row.width));
    const placed = shelve(this.rows, width);
    let from = this.filled;
    if (this.surface === undefined || fresh || width > this.width || placed.height > this.height) {
      this.surface?.destroy();
      this.width = width;
      this.height = Math.max(placed.height, this.height * 2);
      this.surface = this.create(this.width, this.height);
      from = 0;
    }
    const surface = this.surface;
    this.rows.slice(from).forEach((row, r) => {
      const { width: w, height: h, feetX, feetY } = row.shape;
      row.frames.forEach((frame, i) => {
        const at = placed.at[from + r]?.[i] ?? { x: 0, y: 0 };
        surface.context.clearRect(at.x, at.y, w, h);
        frame.bake(surface.context, at.x + feetX, at.y + feetY);
        surface.addFrame(frame.name, at.x, at.y, w, h);
        this.bakes += 1;
      });
    });
    this.filled = this.rows.length;
    surface.refresh();
  }
}

/**
 * Where every frame of `rows` goes on a surface `width` wide, and how
 * tall the rows stand: frames left to right on shelves, a shelf as tall
 * as its tallest frame, so a creature's small frames share a shelf with
 * the next look's rather than a body row's whole width (#4171). Rows
 * added later leave the earlier ones where they were.
 */
function shelve(
  rows: readonly AtlasRow[],
  width: number,
): {
  readonly at: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly height: number;
} {
  let x = 0;
  let top = 0;
  let shelf = 0;
  const at = rows.map((row) =>
    row.frames.map(() => {
      if (x + row.shape.width > width) {
        x = 0;
        top += shelf;
        shelf = 0;
      }
      const place = { x, y: top };
      x += row.shape.width;
      shelf = Math.max(shelf, row.shape.height);
      return place;
    }),
  );
  return { at, height: top + shelf };
}

/** A row of the atlas: its look's frames, side by side, each baked with its feet at a point. */
interface AtlasRow {
  readonly key: string;
  readonly shape: FrameShape;
  readonly width: number;
  readonly frames: readonly {
    readonly name: string;
    readonly bake: (context: BakeContext, x: number, y: number) => void;
  }[];
}

/**
 * A look's row: a body's baked headings by its poses (#4060), or a
 * creature's headings by its poses, or none for a creature not stacked.
 */
function atlasRow(look: StackLook, key: string): AtlasRow | undefined {
  if (look.kind === "body") {
    const frames = STACK_POSES.flatMap((pose) =>
      STACK_BAKED_HEADINGS.map((bucket) => ({
        name: stackFrameName(key, bucket, pose),
        bake: (context: BakeContext, x: number, y: number) => {
          bakeFigure(context, x, y, look, bucket, pose);
        },
      })),
    );
    return { key, shape: BODY_FRAME, width: BODY_FRAME.width * FRAMES_PER_LOOK, frames };
  }
  const stack = creatureStack(look.look);
  if (stack === undefined) {
    return undefined;
  }
  const shape = creatureFrame(look.look, stack);
  const frames = stack.poses.flatMap((pose) =>
    Array.from({ length: stack.headings }, (_, bucket) => ({
      name: stackFrameName(key, bucket, pose),
      bake: (context: BakeContext, x: number, y: number) => {
        bakeLayers(context, x, y, creatureLayers(look.look, stack, bucket, pose));
      },
    })),
  );
  return { key, shape, width: shape.width * frames.length, frames };
}
