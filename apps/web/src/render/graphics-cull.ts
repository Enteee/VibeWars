import type Phaser from "phaser";

/**
 * The static graphics cut to what the camera can see (#3240). Phaser
 * replays a Graphics' whole command list every frame, tessellating every
 * path again, so a 2.5D map's floor, walls and decks cost the same off
 * screen as on it. A view needs only the paths near it: everything else
 * is left out of the list Phaser replays, in the order it was drawn and
 * with every style and transform kept, so what is on screen is drawn
 * exactly as before.
 */

/** Phaser's Graphics opcodes (phaser/src/gameobjects/graphics/Commands.js). */
export const COMMANDS = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
  FILL_TRIANGLE: 10,
  STROKE_TRIANGLE: 11,
  SAVE: 14,
  RESTORE: 15,
  TRANSLATE: 16,
  SCALE: 17,
  ROTATE: 18,
  GRADIENT_FILL_STYLE: 21,
  GRADIENT_LINE_STYLE: 22,
} as const;

/** How many arguments follow each opcode in a command list. */
const ARGUMENTS: Readonly<Record<number, number>> = {
  [COMMANDS.ARC]: 7,
  [COMMANDS.BEGIN_PATH]: 0,
  [COMMANDS.CLOSE_PATH]: 0,
  [COMMANDS.FILL_RECT]: 4,
  [COMMANDS.LINE_TO]: 2,
  [COMMANDS.MOVE_TO]: 2,
  [COMMANDS.LINE_STYLE]: 3,
  [COMMANDS.FILL_STYLE]: 2,
  [COMMANDS.FILL_PATH]: 0,
  [COMMANDS.STROKE_PATH]: 0,
  [COMMANDS.FILL_TRIANGLE]: 6,
  [COMMANDS.STROKE_TRIANGLE]: 6,
  [COMMANDS.SAVE]: 0,
  [COMMANDS.RESTORE]: 0,
  [COMMANDS.TRANSLATE]: 2,
  [COMMANDS.SCALE]: 2,
  [COMMANDS.ROTATE]: 1,
  [COMMANDS.GRADIENT_FILL_STYLE]: 8,
  [COMMANDS.GRADIENT_LINE_STYLE]: 6,
};

/** An opcode or an argument: numbers, but for an arc's `anticlockwise`, a boolean. Phaser types the list `any[]`. */
export type Command = unknown;

/** An axis-aligned box in the graphics' own coordinates. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A command list, cut into what is always kept and what each draw needs. */
export interface CullPlan {
  readonly commands: readonly Command[];
  /**
   * Runs of the list, three numbers each: where it starts, how long it
   * is, and the draw it belongs to, `-1` for styles and transforms,
   * which every view keeps.
   */
  readonly spans: readonly number[];
  /** What each draw covers, by draw; `undefined` for one that draws nothing. */
  readonly boxes: readonly (Box | undefined)[];
}

/** `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f, as Phaser's TransformMatrix. */
type Matrix = [number, number, number, number, number, number];

class Bounds {
  left = Infinity;
  top = Infinity;
  right = -Infinity;
  bottom = -Infinity;

  public add(x: number, y: number): void {
    this.left = Math.min(this.left, x);
    this.top = Math.min(this.top, y);
    this.right = Math.max(this.right, x);
    this.bottom = Math.max(this.bottom, y);
  }

  public get empty(): boolean {
    return this.left > this.right;
  }

  /** This box grown by `pad` each way, through `matrix`, added to `into`. */
  public transformInto(into: Bounds, matrix: Matrix, pad: number): void {
    if (this.empty) {
      return;
    }
    const [a, b, c, d, e, f] = matrix;
    for (const x of [this.left - pad, this.right + pad]) {
      for (const y of [this.top - pad, this.bottom + pad]) {
        into.add(a * x + c * y + e, b * x + d * y + f);
      }
    }
  }

  public box(): Box | undefined {
    return this.empty
      ? undefined
      : { left: this.left, top: this.top, right: this.right, bottom: this.bottom };
  }
}

function numberAt(commands: readonly Command[], index: number): number {
  const value = commands[index];
  return typeof value === "number" ? value : 0;
}

/**
 * `commands` cut into draws (#3240). A path's draw runs from one
 * `BEGIN_PATH` to the next, as Phaser keeps a path until then; a rectangle
 * or a triangle is a draw of its own. Each draw's box is where its fills
 * and strokes land, through the transform they are drawn under, a stroke
 * grown by its line width.
 */
export function planCull(commands: readonly Command[]): CullPlan {
  const spans: number[] = [];
  const boxes: (Box | undefined)[] = [];
  const stack: Matrix[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  let lineWidth = 1;
  // The path's points as given, and what its fills and strokes covered.
  let points = new Bounds();
  let drawn = new Bounds();
  let pathDraw = -1;
  const closePath = (): void => {
    if (pathDraw >= 0) {
      boxes[pathDraw] = drawn.box();
    }
  };
  const openPath = (): void => {
    closePath();
    pathDraw = boxes.length;
    boxes.push(undefined);
    points = new Bounds();
    drawn = new Bounds();
  };
  // A run that goes on in the same draw grows the last span.
  let runLength = 0;
  const span = (start: number, length: number, draw: number): void => {
    const last = spans.length - 3;
    if (last >= 0 && spans[last + 2] === draw) {
      runLength += length;
      spans[last + 1] = runLength;
    } else {
      runLength = length;
      spans.push(start, length, draw);
    }
  };
  const shape = (corners: readonly number[], pad: number): number => {
    const own = new Bounds();
    for (let i = 0; i < corners.length; i += 2) {
      own.add(corners[i] ?? 0, corners[i + 1] ?? 0);
    }
    const box = new Bounds();
    own.transformInto(box, matrix, pad);
    boxes.push(box.box());
    return boxes.length - 1;
  };

  openPath();
  for (let index = 0; index < commands.length;) {
    const op = numberAt(commands, index);
    const count = ARGUMENTS[op];
    if (count === undefined) {
      // A command this does not know: nothing is cut, so nothing is lost.
      return { commands, spans: [0, commands.length, -1], boxes: [] };
    }
    const length = 1 + count;
    const at = (k: number): number => numberAt(commands, index + 1 + k);
    switch (op) {
      case COMMANDS.BEGIN_PATH:
        openPath();
        span(index, length, pathDraw);
        break;
      case COMMANDS.MOVE_TO:
      case COMMANDS.LINE_TO:
        points.add(at(0), at(1));
        span(index, length, pathDraw);
        break;
      case COMMANDS.ARC:
        points.add(at(0) - at(2), at(1) - at(2));
        points.add(at(0) + at(2), at(1) + at(2));
        span(index, length, pathDraw);
        break;
      case COMMANDS.CLOSE_PATH:
        span(index, length, pathDraw);
        break;
      case COMMANDS.FILL_PATH:
        points.transformInto(drawn, matrix, 1);
        span(index, length, pathDraw);
        break;
      case COMMANDS.STROKE_PATH:
        points.transformInto(drawn, matrix, lineWidth + 1);
        span(index, length, pathDraw);
        break;
      case COMMANDS.FILL_RECT:
        span(index, length, shape([at(0), at(1), at(0) + at(2), at(1) + at(3)], 1));
        break;
      case COMMANDS.FILL_TRIANGLE:
        span(index, length, shape([at(0), at(1), at(2), at(3), at(4), at(5)], 1));
        break;
      case COMMANDS.STROKE_TRIANGLE:
        span(index, length, shape([at(0), at(1), at(2), at(3), at(4), at(5)], lineWidth + 1));
        break;
      case COMMANDS.LINE_STYLE:
      case COMMANDS.GRADIENT_LINE_STYLE:
        lineWidth = at(0);
        span(index, length, -1);
        break;
      case COMMANDS.SAVE:
        stack.push([...matrix]);
        span(index, length, -1);
        break;
      case COMMANDS.RESTORE:
        matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        span(index, length, -1);
        break;
      case COMMANDS.TRANSLATE: {
        const [a, b, c, d, e, f] = matrix;
        matrix = [a, b, c, d, a * at(0) + c * at(1) + e, b * at(0) + d * at(1) + f];
        span(index, length, -1);
        break;
      }
      case COMMANDS.SCALE: {
        const [a, b, c, d, e, f] = matrix;
        matrix = [a * at(0), b * at(0), c * at(1), d * at(1), e, f];
        span(index, length, -1);
        break;
      }
      case COMMANDS.ROTATE: {
        const [a, b, c, d, e, f] = matrix;
        const sin = Math.sin(at(0));
        const cos = Math.cos(at(0));
        matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
        span(index, length, -1);
        break;
      }
      default:
        // The fill styles.
        span(index, length, -1);
    }
    index += length;
  }
  closePath();
  return { commands, spans, boxes };
}

function overlaps(box: Box, view: Box): boolean {
  return (
    box.left <= view.right &&
    box.right >= view.left &&
    box.top <= view.bottom &&
    box.bottom >= view.top
  );
}

/** `plan`'s commands with every draw that misses `view` left out. */
export function culledCommands(plan: CullPlan, view: Box): Command[] {
  const out: Command[] = [];
  const { commands, spans, boxes } = plan;
  for (let s = 0; s < spans.length; s += 3) {
    const draw = spans[s + 2] ?? -1;
    const box = draw < 0 ? undefined : boxes[draw];
    if (draw >= 0 && (box === undefined || !overlaps(box, view))) {
      continue;
    }
    const start = spans[s] ?? 0;
    const end = start + (spans[s + 1] ?? 0);
    for (let i = start; i < end; i += 1) {
      out.push(commands[i] ?? 0);
    }
  }
  return out;
}

/** `box` grown by `share` of its width and height each way. */
function grown(box: Box, share: number): Box {
  const x = (box.right - box.left) * share;
  const y = (box.bottom - box.top) * share;
  return { left: box.left - x, top: box.top - y, right: box.right + x, bottom: box.bottom + y };
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

/**
 * How far past the view the kept draws reach, as a share of the view's
 * size each way: the camera walks about this far before the list is cut
 * again, so a cut costs once every few seconds, not every frame.
 */
const REACH = 0.25;
/**
 * How close to the cut's edge the view may come, as a share of its size:
 * slack for a camera that moves between the cut and the frame drawn.
 */
const SLACK = 0.02;

/**
 * Graphics drawn once and shown for many frames, cut to the camera
 * (#3240). `capture` after drawing them, `cull` every frame with the
 * view in their own coordinates (they sit at the origin, unscaled).
 */
export class StaticGraphicsCull {
  private readonly plans = new Map<Phaser.GameObjects.Graphics, CullPlan>();
  private cut: Box | undefined;

  /** Take `graphics`' command lists as drawn: what every later cut is taken from. */
  public capture(graphics: Iterable<Phaser.GameObjects.Graphics>): void {
    this.plans.clear();
    for (const g of graphics) {
      const commands: readonly Command[] = g.commandBuffer;
      this.plans.set(g, planCull(commands));
    }
    this.cut = undefined;
  }

  /** Cut every captured graphics to `view` and its reach, unless the last cut still covers it. */
  public cull(view: Box): void {
    if (this.cut !== undefined && contains(this.cut, grown(view, SLACK))) {
      return;
    }
    this.cut = grown(view, REACH);
    for (const [g, plan] of this.plans) {
      g.commandBuffer = culledCommands(plan, this.cut);
    }
  }
}

/**
 * `graphics`, drawn this frame, cut to `view` (#3240): what it draws off
 * screen is never tessellated.
 */
export function cullToView(graphics: Phaser.GameObjects.Graphics, view: Box): void {
  const commands: readonly Command[] = graphics.commandBuffer;
  graphics.commandBuffer = culledCommands(planCull(commands), grown(view, SLACK));
}
