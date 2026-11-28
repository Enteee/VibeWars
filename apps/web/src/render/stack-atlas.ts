import { CREATURE_LOOKS, type CreatureLook, type ProfessionId } from "@vibewars/game-core";
import type { FigureBody } from "@vibewars/game-protocol";

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
 * A body's figure: its body colour, the cape it wears, the professions
 * its outfit and accent follow (#4175), and its height and build (#4176).
 */
export interface BodyStackLook {
  readonly kind: "body";
  readonly body: number;
  readonly cape: CapeLook | undefined;
  readonly primary: ProfessionId | undefined;
  readonly secondary: ProfessionId | undefined;
  readonly physique: FigureBody;
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

/**
 * The frame a body of `physique` bakes into (#4176): the average body's,
 * stretched up for a tall one's crest and out for a heavy one's
 * shoulders, so a short or lean figure keeps the average frame.
 */
export function stackFrameSize(physique: FigureBody): {
  readonly width: number;
  readonly height: number;
  readonly feetX: number;
  readonly feetY: number;
} {
  const heavy = physique.build === "heavy";
  const width = heavy ? 54 : STACK_FRAME_WIDTH;
  const above = (physique.height === "tall" ? 67 : STACK_FRAME_FEET_Y) + (heavy ? 2 : 0);
  const below = heavy ? 13 : STACK_FRAME_HEIGHT - STACK_FRAME_FEET_Y;
  return { width, height: above + below, feetX: width / 2, feetY: above };
}

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
  /**
   * Upload only this rectangle of the canvas (#4271): rows drawn into
   * space a surface already had, so the rest of it is on the GPU as is.
   */
  refreshRect(x: number, y: number, width: number, height: number): void;
  destroy(): void;
}

/** A surface `width` × `height` pixels, empty. */
export type SurfaceFactory = (width: number, height: number) => AtlasSurface;

const css = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;

/** A look's name: a body's colours, professions and physique, or a creature's look, which is all a bake depends on. */
export function stackLookKey(look: StackLook): string {
  if (look.kind === "creature") {
    return `creature:${look.look}`;
  }
  const { cape } = look;
  const worn = cape === undefined ? "" : `/${css(cape.main)}${css(cape.trim)}`;
  const { height, build } = look.physique;
  return `${css(look.body)}${worn}+${look.primary ?? ""}+${look.secondary ?? ""}+${height}+${build}`;
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
      stackSlices(pose, outfit, accent, look.physique),
      bucketFacing(bucket),
      r,
      stackTones(look.body, look.cape, outfit, accent),
      look.physique.height,
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

/** A body look's row: its baked headings by its poses, in its physique's frame. */
function bodyRow(key: string, look: BodyStackLook): StackRow {
  return {
    key,
    ...stackFrameSize(look.physique),
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

/** Where a row's first frame sits on the atlas, pixels. */
interface RowPlace {
  readonly x: number;
  readonly y: number;
}

/**
 * Every creature look's place on the atlas (#4172): their rows packed on
 * shelves across its top, tallest first, the same in every match, so a
 * summon's late row bakes into its own place and moves nothing.
 */
interface CreatureShelves {
  readonly at: ReadonlyMap<string, RowPlace>;
  readonly width: number;
  readonly height: number;
}

let creatureShelvesOnce: CreatureShelves | undefined;

function creatureShelves(): CreatureShelves {
  if (creatureShelvesOnce === undefined) {
    const rows = CREATURE_LOOKS.flatMap(
      (look) => creatureRow(stackLookKey({ kind: "creature", look }), look) ?? [],
    ).sort((a, b) => b.height - a.height);
    const span = (row: StackRow): number => row.width * row.frames.length;
    const width = Math.max(ATLAS_WIDTH, ...rows.map(span));
    const at = new Map<string, RowPlace>();
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const row of rows) {
      if (x + span(row) > width) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      at.set(row.key, { x, y });
      x += span(row);
      shelf = Math.max(shelf, row.height);
    }
    creatureShelvesOnce = { at, width, height: y + shelf };
  }
  return creatureShelvesOnce;
}

/** The row `look` bakes into, or `undefined` for a creature still drawn as a disc. */
function stackRow(key: string, look: StackLook): StackRow | undefined {
  return look.kind === "body" ? bodyRow(key, look) : creatureRow(key, look.look);
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
  /** The surface's height, pixels, and how many of the rows are on it. */
  private capacity = 0;
  private width = 0;
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
    this.bakeLater([look]);
    return undefined;
  }

  /**
   * Bake each of `looks` not baked yet alone, off the frame path, each
   * once (#4172): a look a match may bring on, warmed before it does.
   */
  public bakeLater(looks: Iterable<StackLook>): void {
    for (const look of looks) {
      const key = stackLookKey(look);
      if (
        this.baked.has(key) ||
        this.pending.has(key) ||
        (look.kind === "creature" && creatureStack(look.look) === undefined)
      ) {
        continue;
      }
      this.pending.add(key);
      this.schedule(() => {
        if (this.pending.has(key)) {
          this.bake([look]);
        }
      });
    }
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
    this.capacity = 0;
    this.width = 0;
    this.filled = 0;
  }

  /**
   * Bake the rows not on the surface yet, or all of them on a new one when
   * they no longer fit, a heavy body's wider row too (#4176), or
   * `fresh`: one canvas, one upload. Every creature row has its place
   * kept on the shelves at the top (#4172), which a body row never takes,
   * so a summon's late row bakes alone, never every
   * body's again mid-fight. Body rows stack down the canvas under them.
   * A new surface uploads whole; rows added to one upload only the
   * rectangle they cover (#4271), not the whole 17.8 MB again.
   */
  private build(fresh = false): void {
    const shelves = creatureShelves();
    const height = this.rows
      .filter((row) => !shelves.at.has(row.key))
      .reduce((sum, row) => sum + row.height, shelves.height);
    const across = Math.max(
      shelves.width,
      ...this.rows.map((row) => row.width * row.frames.length),
    );
    let from = this.surface === undefined || fresh ? 0 : this.filled;
    if (this.surface === undefined || fresh || height > this.capacity || across > this.width) {
      this.surface?.destroy();
      this.capacity = Math.max(height, this.capacity * 2);
      this.width = across;
      this.surface = this.create(across, this.capacity);
      from = 0;
    }
    const surface = this.surface;
    const whole = from === 0;
    let drawn: { left: number; top: number; right: number; bottom: number } | undefined;
    let top = shelves.height;
    this.rows.forEach((row, index) => {
      let place = shelves.at.get(row.key);
      if (place === undefined) {
        place = { x: 0, y: top };
        top += row.height;
      }
      if (index < from) {
        return;
      }
      const { x, y } = place;
      const width = row.width * row.frames.length;
      drawn = {
        left: Math.min(drawn?.left ?? x, x),
        top: Math.min(drawn?.top ?? y, y),
        right: Math.max(drawn?.right ?? x + width, x + width),
        bottom: Math.max(drawn?.bottom ?? y + row.height, y + row.height),
      };
      surface.context.clearRect(x, y, width, row.height);
      row.frames.forEach((frame, i) => {
        const left = x + i * row.width;
        frame.bake(surface.context, left + row.feetX, y + row.feetY);
        surface.addFrame(frame.name, left, y, row.width, row.height);
        this.bakes += 1;
      });
    });
    this.filled = this.rows.length;
    if (whole || drawn === undefined) {
      surface.refresh();
    } else {
      surface.refreshRect(
        drawn.left,
        drawn.top,
        drawn.right - drawn.left,
        drawn.bottom - drawn.top,
      );
    }
  }
}
