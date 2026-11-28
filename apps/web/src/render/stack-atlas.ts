import { CREATURE_LOOKS, type CreatureLook, type ProfessionId } from "@vibewars/game-core";

import type { CapeLook } from "./cape-shape.js";
import { CREATURE_DRAWN_RADIUS } from "./creature-shape.js";
import { accentOf, outfitOf } from "./profession-outfits.js";
import {
  STACK_BAKED_HEADINGS,
  STACK_HEIGHT,
  STACK_OUTLINE,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  bakedFrame,
  bucketFacing,
  creatureBucket,
  creatureFacing,
  creatureLayers,
  creaturePose,
  creatureSlices,
  creatureStack,
  stackLayers,
  stackSlices,
  stackTones,
  type CreaturePose,
  type StackLayer,
  type StackPose,
} from "./sprite-stack.js";

/**
 * Every stacked figure of a match baked once into one atlas (ADR-0057,
 * #4031): at match start, every look on the roster, its baked headings
 * by its poses (#4060), the rest drawn as their mirror images; a look that turns up later bakes off the frame path, and the
 * body shows its flat disc until it has. A frame then draws one small
 * image per body, tinted by the light at its feet, never the slices.
 * A creature (#4171) is a row of its own look, never its team's: the
 * plate under it carries the team.
 */

/**
 * A body's figure: its body colour, the cape it wears, and the
 * professions its outfit and accent follow (#4175).
 */
export interface BodyStackLook {
  readonly kind: "body";
  readonly body: number;
  readonly cape: CapeLook | undefined;
  readonly primary: ProfessionId | undefined;
  readonly secondary: ProfessionId | undefined;
}

/** A creature's figure: its look alone (#4171). */
export interface CreatureStackLook {
  readonly kind: "creature";
  readonly look: CreatureLook;
}

/** What a figure is painted as. */
export type StackLook = BodyStackLook | CreatureStackLook;

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
const ATLAS_WIDTH = STACK_FRAME_WIDTH * FRAMES_PER_LOOK;

/** The 2D canvas calls a bake needs. */
export type BakeContext = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "globalAlpha"
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

/** A look's name: a body's colours and professions, or a creature's look, which is all a bake depends on. */
export function stackLookKey(look: StackLook): string {
  if (look.kind === "creature") {
    return `creature:${look.look}`;
  }
  const { cape } = look;
  const worn = cape === undefined ? "" : `/${css(cape.main)}${css(cape.trim)}`;
  return `${css(look.body)}${worn}+${look.primary ?? ""}+${look.secondary ?? ""}`;
}

/**
 * A frame of the atlas, whether it draws mirrored (#4060), its size and
 * where the centre of the feet is in it, pixels, and the radius its
 * figure was baked at, world units: a body of another radius scales it.
 */
export interface StackFrame {
  readonly name: string;
  readonly flipped: boolean;
  readonly width: number;
  readonly height: number;
  readonly feetX: number;
  readonly feetY: number;
  readonly radius: number;
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
 * `layers` into `context` with the centre of the feet at `x`, `y`: every
 * layer's outline, then every layer, so the outline shows only round the
 * silhouette.
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
    context.globalAlpha = layer.alpha;
    trace(layer.points);
    context.fill();
  }
  context.globalAlpha = 1;
}

/** One body's figure into `context` with the centre of its feet at `x`, `y`. */
export function bakeFigure(
  context: BakeContext,
  x: number,
  y: number,
  look: BodyStackLook,
  bucket: number,
  pose: StackPose,
): void {
  const r = STACK_BAKE_RADIUS * STACK_BAKE_SCALE;
  const outfit = outfitOf(look.primary);
  const accent = accentOf(look.secondary);
  bakeLayers(
    context,
    x,
    y,
    stackLayers(
      stackSlices(pose, outfit, accent),
      bucketFacing(bucket),
      r,
      stackTones(look.body, look.cape, outfit, accent),
    ),
  );
}

/** How tall the figure stands over its feet, world units, at radius `r`. */
export function stackRise(r: number): number {
  return STACK_HEIGHT * r;
}

/** One look's row of the atlas: its frames, all one size. */
interface StackRow {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly feetX: number;
  readonly feetY: number;
  readonly radius: number;
  readonly frames: readonly {
    readonly name: string;
    readonly bake: (context: BakeContext, x: number, y: number) => void;
  }[];
}

/** A body look's row: its baked headings by its poses, in the fixed body frame. */
function bodyRow(key: string, look: BodyStackLook): StackRow {
  return {
    key,
    width: STACK_FRAME_WIDTH,
    height: STACK_FRAME_HEIGHT,
    feetX: STACK_FRAME_FEET_X,
    feetY: STACK_FRAME_FEET_Y,
    radius: STACK_BAKE_RADIUS,
    frames: STACK_POSES.flatMap((pose) =>
      STACK_BAKED_HEADINGS.map((bucket) => ({
        name: stackFrameName(key, bucket, pose),
        bake: (context: BakeContext, x: number, y: number) => {
          bakeFigure(context, x, y, look, bucket, pose);
        },
      })),
    ),
  };
}

/**
 * A creature look's row (#4171): its headings by its poses, baked at its
 * drawn radius, so a small creature bakes small, each frame cropped to
 * what every one of them covers, outline and all. `undefined` for a look
 * still drawn as a disc.
 */
function creatureRow(key: string, look: CreatureLook): StackRow | undefined {
  const stack = creatureStack(look);
  if (stack === undefined) {
    return undefined;
  }
  const radius = CREATURE_DRAWN_RADIUS[look];
  const r = radius * STACK_BAKE_SCALE;
  const frames = stack.poses.flatMap((pose) =>
    Array.from({ length: stack.headings }, (_, bucket) => ({
      name: stackFrameName(key, bucket, pose),
      layers: creatureLayers(creatureSlices(look, pose) ?? [], creatureFacing(stack, bucket), r),
    })),
  );
  const points = frames.flatMap((frame) => frame.layers.flatMap((layer) => layer.points));
  const pad = STACK_OUTLINE_WIDTH * STACK_BAKE_SCALE + 1;
  const feetX = Math.ceil(pad - Math.min(...points.map((p) => p.x)));
  const feetY = Math.ceil(pad - Math.min(...points.map((p) => p.y)));
  return {
    key,
    width: Math.ceil(feetX + Math.max(...points.map((p) => p.x)) + pad),
    height: Math.ceil(feetY + Math.max(...points.map((p) => p.y)) + pad),
    feetX,
    feetY,
    radius,
    frames: frames.map(({ name, layers }) => ({
      name,
      bake: (context: BakeContext, x: number, y: number) => {
        bakeLayers(context, x, y, layers);
      },
    })),
  };
}

/** Each creature look's row height, pixels, once worked out: 0 for one drawn as a disc. */
const creatureRowHeights = new Map<CreatureLook, number>();

function creatureRowHeight(look: CreatureLook): number {
  let height = creatureRowHeights.get(look);
  if (height === undefined) {
    height = creatureRow(stackLookKey({ kind: "creature", look }), look)?.height ?? 0;
    creatureRowHeights.set(look, height);
  }
  return height;
}

/** The row `look` bakes into, or `undefined` for a creature still drawn as a disc. */
function stackRow(key: string, look: StackLook): StackRow | undefined {
  return look.kind === "body" ? bodyRow(key, look) : creatureRow(key, look.look);
}

/**
 * Where each of `rows` starts on a surface `width` wide, in order, and
 * how tall they stand: a row goes on the right of the shelf before it
 * while it fits, or starts a new shelf under it. A body's row is as wide
 * as the surface, so it has a shelf of its own; the narrow creature rows
 * (#4173) share theirs. A row's place never moves when rows are added.
 */
function shelveRows(
  rows: readonly StackRow[],
  width: number,
): {
  readonly places: readonly { readonly left: number; readonly top: number }[];
  readonly height: number;
} {
  let top = 0;
  let left = 0;
  let shelf = 0;
  const places = rows.map((row) => {
    const span = row.width * row.frames.length;
    if (left > 0 && left + span <= width) {
      left += span;
      shelf = Math.max(shelf, row.height);
      return { left: left - span, top };
    }
    top += shelf;
    left = span;
    shelf = row.height;
    return { left: 0, top };
  });
  return { places, height: top + shelf };
}

/** The atlas of one match's figures. */
export class StackAtlas {
  private readonly create: SurfaceFactory;
  private readonly schedule: (bake: () => void) => void;
  /** Every look the atlas holds, in its row order, and each by its key. */
  private readonly rows: StackRow[] = [];
  private readonly baked = new Map<string, StackRow>();
  private readonly pending = new Set<string>();
  private surface: AtlasSurface | undefined;
  /** The surface's size, pixels, and how many of the rows are on it. */
  private width = 0;
  private capacity = 0;
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

  /** The roster's looks, baked at once: what match start calls. */
  public bake(looks: Iterable<StackLook>): void {
    let added = false;
    for (const look of looks) {
      const key = stackLookKey(look);
      if (this.baked.has(key)) {
        continue;
      }
      const row = stackRow(key, look);
      if (row !== undefined) {
        this.baked.set(key, row);
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
   * yet: then its bake is scheduled, once. A creature turns in its own
   * headings and strides in its own poses, and one still drawn as a disc
   * never has a frame.
   */
  public frame(look: StackLook, bucket: number, pose: StackPose): StackFrame | undefined {
    const key = stackLookKey(look);
    const row = this.baked.get(key);
    if (row !== undefined) {
      const at = (name: string, flipped: boolean): StackFrame => ({
        name,
        flipped,
        width: row.width,
        height: row.height,
        feetX: row.feetX,
        feetY: row.feetY,
        radius: row.radius,
      });
      if (look.kind === "creature") {
        const stack = creatureStack(look.look);
        return stack === undefined
          ? undefined
          : at(
              stackFrameName(key, creatureBucket(stack, bucket), creaturePose(stack, pose)),
              false,
            );
      }
      const baked = bakedFrame(bucket, pose);
      return at(stackFrameName(key, baked.bucket, baked.pose), baked.flipped);
    }
    if (look.kind === "creature" && creatureStack(look.look) === undefined) {
      return undefined;
    }
    if (!this.pending.has(key)) {
      this.pending.add(key);
      this.schedule(() => {
        if (this.pending.has(key)) {
          this.bake([look]);
        }
      });
    }
    return undefined;
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
    this.capacity = 0;
    this.filled = 0;
  }

  /**
   * Bake the rows not on the surface yet, or all of them on a new one when
   * they no longer fit, or `fresh`: one canvas, one upload. Rows stack
   * down the canvas, each as tall as its frames, creature rows side by
   * side while they fit its width (`shelveRows`). The canvas keeps room
   * for every creature row not on it yet (#4171), which a body row never
   * takes, so a summon's late row bakes alone, never every body's again
   * mid-fight.
   */
  private build(fresh = false): void {
    const width = Math.max(ATLAS_WIDTH, ...this.rows.map((row) => row.width * row.frames.length));
    const { places, height } = shelveRows(this.rows, width);
    const headroom = CREATURE_LOOKS.filter(
      (look) => !this.baked.has(stackLookKey({ kind: "creature", look })),
    ).reduce((sum, look) => sum + creatureRowHeight(look), 0);
    let from = this.surface === undefined || fresh ? 0 : this.filled;
    if (
      this.surface === undefined ||
      fresh ||
      height + headroom > this.capacity ||
      width > this.width
    ) {
      this.surface?.destroy();
      this.width = width;
      this.capacity = Math.max(height + headroom, this.capacity * 2);
      this.surface = this.create(this.width, this.capacity);
      from = 0;
    }
    const surface = this.surface;
    this.rows.slice(from).forEach((row, i) => {
      const place = places[from + i] ?? { left: 0, top: 0 };
      surface.context.clearRect(place.left, place.top, row.width * row.frames.length, row.height);
      row.frames.forEach((frame, j) => {
        const left = place.left + j * row.width;
        frame.bake(surface.context, left + row.feetX, place.top + row.feetY);
        surface.addFrame(frame.name, left, place.top, row.width, row.height);
        this.bakes += 1;
      });
    });
    this.filled = this.rows.length;
    surface.refresh();
  }
}
