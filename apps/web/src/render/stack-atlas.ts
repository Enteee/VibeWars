import {
  STACK_HEADINGS,
  STACK_HEIGHT,
  STACK_OUTLINE,
  STACK_OUTLINE_WIDTH,
  STACK_POSES,
  STACK_SHADOW_ALPHA,
  bucketFacing,
  headingBucket,
  stackLayers,
  stackSlices,
  stackTones,
  type StackCape,
  type StackPose,
} from "./sprite-stack.js";

/**
 * Every stacked figure of a match baked once into one atlas (ADR-0057,
 * #4031): at match start, every look on the roster, 8 headings by 4
 * poses; a look that turns up later bakes off the frame path, and the
 * body shows its flat disc until it has. A frame then draws one small
 * image per body, tinted by the light at its feet, never the slices.
 */

/** What a figure is painted in: its body colour, and the cape it wears. */
export interface StackLook {
  readonly body: number;
  readonly cape: StackCape | undefined;
}

/** The body radius the bake draws at; a body of another radius scales its image. */
export const STACK_BAKE_RADIUS = 14;
/** Pixels per world unit in the bake, so the figure stays crisp at match zoom. */
export const STACK_BAKE_SCALE = 1.5;
/**
 * One frame, pixels: ADR-0057's 48 × 72, 8 taller for the shadow, which
 * reaches 0.91 radii below the feet.
 */
export const STACK_FRAME_WIDTH = 48;
export const STACK_FRAME_HEIGHT = 80;
/** Where the centre of the feet sits in a frame, pixels from its top-left. */
export const STACK_FRAME_FEET_X = STACK_FRAME_WIDTH / 2;
export const STACK_FRAME_FEET_Y = 60;

const FRAMES_PER_LOOK = STACK_HEADINGS * STACK_POSES.length;
const ATLAS_WIDTH = STACK_FRAME_WIDTH * FRAMES_PER_LOOK;

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
  | "ellipse"
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

/** A look's name: its colours, which is all a bake depends on. */
export function stackLookKey(look: StackLook): string {
  const { cape } = look;
  const worn =
    cape === undefined
      ? ""
      : `/${css(cape.look.main)}${css(cape.look.trim)}/${cape.pattern ?? "plain"}`;
  return `${css(look.body)}${worn}`;
}

/** The frame a look's figure is in, at a heading bucket and pose. */
export function stackFrameName(key: string, bucket: number, pose: StackPose): string {
  return `${key}:${String(bucket)}:${pose}`;
}

/**
 * One figure into `context` with the centre of its feet at `x`, `y`:
 * the shadow, every slice's outline, then every slice, so the outline
 * shows only round the silhouette.
 */
export function bakeFigure(
  context: BakeContext,
  x: number,
  y: number,
  look: StackLook,
  bucket: number,
  pose: StackPose,
): void {
  const r = STACK_BAKE_RADIUS * STACK_BAKE_SCALE;
  context.fillStyle = `rgba(0,0,0,${String(STACK_SHADOW_ALPHA)})`;
  context.beginPath();
  context.ellipse(x + r * 0.24, y + r * 0.21, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
  context.fill();
  const layers = stackLayers(
    stackSlices(pose),
    bucketFacing(bucket),
    r,
    stackTones(look.body, look.cape),
    look.cape?.pattern,
  );
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
  /** Every look the atlas holds, in its row order. */
  private readonly rows: StackLook[] = [];
  private readonly baked = new Set<string>();
  private readonly pending = new Set<string>();
  private surface: AtlasSurface | undefined;
  /** Rows the surface has room for, and rows already baked on it. */
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
      if (!this.baked.has(key)) {
        this.baked.add(key);
        this.pending.delete(key);
        this.rows.push(look);
        added = true;
      }
    }
    if (added) {
      this.build();
    }
  }

  /**
   * The frame `look` draws at `facing` in `pose`, or `undefined` while it
   * is not baked yet: then its bake is scheduled, once.
   */
  public frame(look: StackLook, facing: number, pose: StackPose): string | undefined {
    const key = stackLookKey(look);
    if (this.baked.has(key)) {
      return stackFrameName(key, headingBucket(facing), pose);
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
    this.capacity = 0;
    this.filled = 0;
  }

  /**
   * Bake the rows not on the surface yet, or all of them on a new one when
   * they no longer fit, or `fresh`: one canvas, one upload.
   */
  private build(fresh = false): void {
    let from = this.surface === undefined || fresh ? 0 : this.filled;
    if (this.surface === undefined || fresh || this.rows.length > this.capacity) {
      this.surface?.destroy();
      this.capacity = Math.max(this.rows.length, this.capacity * 2, 1);
      this.surface = this.create(ATLAS_WIDTH, STACK_FRAME_HEIGHT * this.capacity);
      from = 0;
    }
    const surface = this.surface;
    for (let row = from; row < this.rows.length; row += 1) {
      const look = this.rows[row];
      if (look === undefined) {
        continue;
      }
      const key = stackLookKey(look);
      const top = row * STACK_FRAME_HEIGHT;
      surface.context.clearRect(0, top, ATLAS_WIDTH, STACK_FRAME_HEIGHT);
      STACK_POSES.forEach((pose, p) => {
        for (let bucket = 0; bucket < STACK_HEADINGS; bucket += 1) {
          const left = (p * STACK_HEADINGS + bucket) * STACK_FRAME_WIDTH;
          bakeFigure(
            surface.context,
            left + STACK_FRAME_FEET_X,
            top + STACK_FRAME_FEET_Y,
            look,
            bucket,
            pose,
          );
          surface.addFrame(
            stackFrameName(key, bucket, pose),
            left,
            top,
            STACK_FRAME_WIDTH,
            STACK_FRAME_HEIGHT,
          );
          this.bakes += 1;
        }
      });
    }
    this.filled = this.rows.length;
    surface.refresh();
  }
}
