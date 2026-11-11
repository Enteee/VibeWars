import { polygonCentre, type Vec2 } from "@vibewars/game-core";

import type { ArenaPalette } from "./arena-palette.js";
import { BARRIER_LOOK, BREAKABLE_WALL_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import type { CrackStage } from "./breakable-objects.js";
import type { GatePainter } from "./gate-mark.js";
import { shapeOutline, southFacingEdges } from "./layer-surfaces.js";

/**
 * Breakable walls and energy barriers (#3031, docs/art/3030-world-elements.md),
 * drawn through two lookups, as a gate's door is (`gate-mark.ts`), so the
 * asset card can swap either look without touching the scene. Procedural
 * stand-ins: a stone block that cracks and falls to rubble, and a
 * shimmering curtain between two posts.
 */

/** The drawing calls a breakable wall or a barrier needs: a door's, and an ellipse. */
export interface StonePainter extends GatePainter {
  fillEllipse(x: number, y: number, width: number, height: number): void;
}

/** Where and how a breakable wall draws: on its layer, translated to its base. */
export interface BreakableFrame {
  /** How tall it stands: a wall's height, or 0 on a flat map. */
  readonly height: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  /** Its stone, as `breakablePalette` gives it, lit for where it stands. */
  readonly palette: Pick<ArenaPalette, "wallTop" | "wallFace" | "wallStroke" | "wallLit">;
}

/** `palette` with its wall colours turned into a breakable wall's stone, for `litStructurePalette` to light. */
export function breakablePalette(palette: ArenaPalette): ArenaPalette {
  return {
    ...palette,
    wallTop: BREAKABLE_WALL_LOOK.top,
    wallFace: BREAKABLE_WALL_LOOK.face,
    wallStroke: BREAKABLE_WALL_LOOK.edge,
    wallLit: BREAKABLE_WALL_LOOK.lit,
  };
}

/** How long a block of the face is, world units, and how wide its lit edge, CSS pixels. */
const BLOCK_LENGTH = 22;
const LIT_WIDTH = 2;
const CRACK_WIDTH = 1.5;

/** A repeatable 0..1 from `n` and `seed`: the same wall cracks the same way every redraw. */
function hash(n: number, seed: number): number {
  const s = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** How many cracks a face of `length` shows at `stage`: a few, then many. */
function crackCount(stage: CrackStage, length: number): number {
  if (stage === 0 || stage === 3) {
    return 0;
  }
  return stage === 1 ? Math.max(1, Math.round(length / 40)) : Math.max(3, Math.round(length / 14));
}

/** A jagged crack from `from`, `steps` kinks along `step`, wandering `jitter` either side. */
function crack(
  painter: StonePainter,
  from: Vec2,
  step: Vec2,
  steps: number,
  jitter: number,
  seed: number,
): void {
  // Sideways to the crack's way.
  const length = Math.hypot(step.x, step.y) || 1;
  const side = { x: -step.y / length, y: step.x / length };
  let at = from;
  for (let k = 1; k <= steps; k += 1) {
    const wander = (hash(k, seed) - 0.5) * 2 * jitter;
    const next = {
      x: from.x + step.x * k + side.x * wander,
      y: from.y + step.y * k + side.y * wander,
    };
    painter.lineBetween(at.x, at.y, next.x, next.y);
    at = next;
  }
}

/**
 * Standing: a stone block like a map wall, its face laid in staggered
 * courses, with cracks down the face and over the lip, a few at the first
 * stage and many at the second.
 */
function standing(
  painter: StonePainter,
  wall: RenderableShape,
  cracks: CrackStage,
  { height, line, palette }: BreakableFrame,
): void {
  const faces = southFacingEdges(wall).map(({ from, to }) => ({ a: from, b: to }));
  if (height > 0) {
    painter.fillColumn(wall, height, palette.wallFace);
    painter.lineStyle(line, BREAKABLE_WALL_LOOK.mortar, 1);
    for (const { a, b } of faces) {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const blocks = Math.max(1, Math.round(length / BLOCK_LENGTH));
      painter.lineBetween(a.x, a.y - height / 2, b.x, b.y - height / 2);
      for (let k = 1; k <= blocks; k += 1) {
        // The upper course's joints sit half a block over from the lower's.
        const lower = k / blocks;
        const upper = (k - 0.5) / blocks;
        if (k < blocks) {
          const x = a.x + (b.x - a.x) * lower;
          const y = a.y + (b.y - a.y) * lower;
          painter.lineBetween(x, y, x, y - height / 2);
        }
        const x = a.x + (b.x - a.x) * upper;
        const y = a.y + (b.y - a.y) * upper;
        painter.lineBetween(x, y - height / 2, x, y - height);
      }
    }
    painter.lineStyle(line * CRACK_WIDTH, BREAKABLE_WALL_LOOK.crack, 1);
    faces.forEach(({ a, b }, face) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const count = crackCount(cracks, length);
      for (let n = 0; n < count; n += 1) {
        const seed = a.x + a.y * 3 + face * 17 + n * 31;
        const share = (n + 0.2 + hash(n, seed) * 0.6) / count;
        const reach = 0.45 + hash(n + 7, seed) * 0.45;
        const start = {
          x: a.x + (b.x - a.x) * share,
          y: a.y + (b.y - a.y) * share - height,
        };
        crack(painter, start, { x: 0, y: (height * reach) / 4 }, 4, 2.5, seed);
      }
    });
  }
  painter.save();
  painter.translateCanvas(0, -height);
  painter.fillStyle(palette.wallTop, 1);
  painter.fillShape(wall);
  painter.lineStyle(line, palette.wallStroke, 1);
  painter.strokeShape(wall);
  if (height > 0) {
    painter.lineStyle(line * LIT_WIDTH, palette.wallLit, 1);
    for (const { a, b } of faces) {
      painter.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  // Over the lip, toward the middle of the top.
  const centre = polygonCentre(shapeOutline(wall));
  painter.lineStyle(line * CRACK_WIDTH, BREAKABLE_WALL_LOOK.crack, 1);
  faces.forEach(({ a, b }, face) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const count = crackCount(cracks, length);
    for (let n = 0; n < count; n += 1) {
      const seed = a.x + a.y * 3 + face * 17 + n * 31;
      const share = (n + 0.2 + hash(n, seed) * 0.6) / count;
      const start = { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
      const inward = { x: centre.x - start.x, y: centre.y - start.y };
      crack(painter, start, { x: inward.x * 0.25, y: inward.y * 0.25 }, 3, 1.5, seed + 5);
    }
  });
  painter.restore();
}

/** How many chunks a crumbled wall leaves, at most and at least. */
const MOST_CHUNKS = 24;
const FEWEST_CHUNKS = 6;
/** How tall a chunk stands, world units. */
const CHUNK_RISE = 2.5;

/** Crumbled: its footprint's shadow, strewn with low stone chunks; no longer a wall. */
function rubble(painter: StonePainter, wall: RenderableShape, { line }: BreakableFrame): void {
  const outline = shapeOutline(wall);
  const centre = polygonCentre(outline);
  painter.fillStyle(BREAKABLE_WALL_LOOK.shadow, 0.3);
  painter.fillShape(wall);
  const perimeter = outline.reduce((sum, corner, at) => {
    const next = outline[(at + 1) % outline.length] ?? corner;
    return sum + Math.hypot(next.x - corner.x, next.y - corner.y);
  }, 0);
  const count = Math.min(MOST_CHUNKS, Math.max(FEWEST_CHUNKS, Math.round(perimeter / 10)));
  const seed = centre.x + centre.y * 3;
  const chunks = Array.from({ length: count }, (_, n) => {
    // A point on the outline, drawn some way in toward the middle.
    const edge = Math.floor(hash(n, seed) * outline.length);
    const from = outline[edge] ?? centre;
    const to = outline[(edge + 1) % outline.length] ?? centre;
    const along = hash(n + 11, seed);
    const rim = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
    const inward = 0.25 + hash(n + 23, seed) * 0.6;
    return {
      x: rim.x + (centre.x - rim.x) * inward,
      y: rim.y + (centre.y - rim.y) * inward,
      size: 2.5 + hash(n + 37, seed) * 3.5,
      turn: hash(n + 41, seed),
    };
  }).sort((p, q) => p.y - q.y);
  for (const chunk of chunks) {
    const corners: Vec2[] = Array.from({ length: 4 }, (_, k) => {
      const angle = (chunk.turn + k / 4) * Math.PI * 2;
      const reach = chunk.size * (0.7 + hash(k, chunk.x + chunk.y) * 0.3);
      return { x: chunk.x + Math.cos(angle) * reach, y: chunk.y + Math.sin(angle) * reach * 0.6 };
    });
    const piece: RenderableShape = { kind: "polygon", points: corners };
    painter.fillColumn(piece, CHUNK_RISE, BREAKABLE_WALL_LOOK.rubbleFace);
    painter.save();
    painter.translateCanvas(0, -CHUNK_RISE);
    painter.fillStyle(BREAKABLE_WALL_LOOK.rubble, 1);
    painter.fillShape(piece);
    painter.lineStyle(line, BREAKABLE_WALL_LOOK.edge, 0.8);
    painter.strokeShape(piece);
    painter.restore();
  }
}

/** A breakable wall's look: standing at its crack stage, or fallen to rubble. */
export const BREAKABLE_ART: {
  readonly standing: (
    painter: StonePainter,
    wall: RenderableShape,
    cracks: CrackStage,
    frame: BreakableFrame,
  ) => void;
  readonly rubble: (painter: StonePainter, wall: RenderableShape, frame: BreakableFrame) => void;
} = { standing, rubble };

/** How long the dust of a wall's fall hangs, in seconds. */
export const DUST_SECONDS = 0.9;

/** The puff of dust as a wall falls, `age` seconds on: grey clouds that swell and thin. */
export function paintDust(painter: StonePainter, wall: RenderableShape, age: number): void {
  if (age < 0 || age >= DUST_SECONDS) {
    return;
  }
  const share = age / DUST_SECONDS;
  const centre = polygonCentre(shapeOutline(wall));
  const alpha = 0.55 * (1 - share);
  painter.fillStyle(BREAKABLE_WALL_LOOK.dust, alpha);
  for (let k = 0; k < 5; k += 1) {
    const angle = (k / 5) * Math.PI * 2;
    const spread = 6 + 14 * share;
    const radius = 7 + 9 * share;
    painter.fillEllipse(
      centre.x + Math.cos(angle) * spread,
      centre.y + Math.sin(angle) * spread * 0.5 - 10 * share,
      radius * 2,
      radius * 1.4,
    );
  }
}

/** Where and how a barrier draws: on its layer, translated to its base. */
export interface BarrierFrame {
  /** How tall its curtain stands: a wall's height, or 0 on a flat map. */
  readonly height: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  /** Seconds, for the shimmer; held still for reduced motion. */
  readonly time: number;
}

/** A barrier's two ends along its long side, and how wide it is across. */
function barrierAxis(wall: RenderableShape): {
  readonly ends: readonly [Vec2, Vec2];
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
} {
  const outline = shapeOutline(wall);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return {
    ends:
      box.w >= box.h
        ? [
            { x: box.x, y: mid.y },
            { x: box.x + box.w, y: mid.y },
          ]
        : [
            { x: mid.x, y: box.y },
            { x: mid.x, y: box.y + box.h },
          ],
    box,
  };
}

/** A post's side, world units, and how far over the curtain it rises. */
const POST_SIZE = 6;
const POST_RISE = 6;
const LAMP_SIZE = 4;

/** Its two slate posts with their lamps: lit while closed, dark while open. */
function posts(painter: StonePainter, wall: RenderableShape, height: number, lit: boolean): void {
  const rise = height + POST_RISE;
  for (const end of barrierAxis(wall).ends) {
    const post: RenderableShape = {
      kind: "rect",
      x: end.x - POST_SIZE / 2,
      y: end.y - POST_SIZE / 2,
      width: POST_SIZE,
      height: POST_SIZE,
    };
    painter.fillStyle(BREAKABLE_WALL_LOOK.shadow, 0.35);
    painter.fillEllipse(end.x + 1.5, end.y + POST_SIZE / 2, POST_SIZE * 1.8, POST_SIZE * 0.7);
    painter.fillColumn(post, rise, BARRIER_LOOK.post);
    painter.save();
    painter.translateCanvas(0, -rise);
    painter.fillStyle(BARRIER_LOOK.postTop, 1);
    painter.fillShape(post);
    painter.restore();
    painter.fillStyle(lit ? BARRIER_LOOK.lamp : BARRIER_LOOK.postEdge, 1);
    painter.fillEllipse(end.x, end.y - rise + POST_SIZE * 0.9, LAMP_SIZE, LAMP_SIZE);
  }
}

/** Wavering lines across the curtain, and how many world units each step of one is. */
const WAVES = 5;
const WAVE_STEP = 6;
/** One shimmer, in seconds. */
const SHIMMER_SECONDS = 1.6;

/**
 * Closed: a translucent sheet from its base to its top, wavering lines
 * running along it and bright top and bottom edges, over a soft glow on
 * the ground. Drawn on an additive layer: it brightens what is behind it
 * and hides nothing, as sight passes it.
 */
function curtain(painter: StonePainter, wall: RenderableShape, frame: BarrierFrame): void {
  const { height, line, time } = frame;
  const { box } = barrierAxis(wall);
  const sheet = { x: box.x, y: box.y - height, w: box.w, h: box.h + height };
  const phase = (time / SHIMMER_SECONDS) * Math.PI * 2;
  painter.fillStyle(BARRIER_LOOK.curtain, 0.08);
  painter.fillEllipse(box.x + box.w / 2, box.y + box.h / 2, box.w + 24, box.h + 24);
  painter.fillStyle(BARRIER_LOOK.curtain, 0.24 + 0.05 * Math.sin(phase));
  painter.fillShape({ kind: "rect", x: sheet.x, y: sheet.y, width: sheet.w, height: sheet.h });
  // Along the sheet's longer side on screen.
  const along = sheet.w >= sheet.h;
  const length = along ? sheet.w : sheet.h;
  const span = along ? sheet.h : sheet.w;
  const steps = Math.max(2, Math.ceil(length / WAVE_STEP));
  painter.lineStyle(line, BARRIER_LOOK.edge, 0.5);
  for (let wave = 1; wave <= WAVES; wave += 1) {
    const across = (span * wave) / (WAVES + 1);
    let last: Vec2 | undefined;
    for (let k = 0; k <= steps; k += 1) {
      const run = (length * k) / steps;
      const sway = Math.sin(run * 0.18 + phase + wave * 1.3) * Math.min(2, span / (WAVES * 2));
      const point = along
        ? { x: sheet.x + run, y: sheet.y + across + sway }
        : { x: sheet.x + across + sway, y: sheet.y + run };
      if (last !== undefined) {
        painter.lineBetween(last.x, last.y, point.x, point.y);
      }
      last = point;
    }
  }
  painter.lineStyle(line * 2, BARRIER_LOOK.edge, 0.85);
  if (along) {
    painter.lineBetween(sheet.x, sheet.y, sheet.x + sheet.w, sheet.y);
    painter.lineBetween(sheet.x, sheet.y + sheet.h, sheet.x + sheet.w, sheet.y + sheet.h);
  } else {
    painter.lineBetween(sheet.x, sheet.y, sheet.x, sheet.y + sheet.h);
    painter.lineBetween(sheet.x + sheet.w, sheet.y, sheet.x + sheet.w, sheet.y + sheet.h);
  }
}

/** A dash and its gap along the open ghost, world units. */
const DASH = 4;
const GAP = 3;

/** Open: where the curtain hangs closed, a faint dashed outline on the ground. */
function ghost(painter: StonePainter, wall: RenderableShape, { line }: BarrierFrame): void {
  const outline = shapeOutline(wall);
  painter.lineStyle(line, BARRIER_LOOK.ghost, 0.45);
  outline.forEach((from, at) => {
    const to = outline[(at + 1) % outline.length] ?? from;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let run = 0; run < length; run += DASH + GAP) {
      const a = run / length;
      const b = Math.min(1, (run + DASH) / length);
      painter.lineBetween(
        from.x + (to.x - from.x) * a,
        from.y + (to.y - from.y) * a,
        from.x + (to.x - from.x) * b,
        from.y + (to.y - from.y) * b,
      );
    }
  });
}

/**
 * An energy barrier's look (#3031): its posts, lit while closed; closed,
 * its curtain, on an additive layer of its own; open, a ghost of it.
 */
export const BARRIER_ART: {
  readonly posts: (
    painter: StonePainter,
    wall: RenderableShape,
    height: number,
    closed: boolean,
  ) => void;
  readonly curtain: (painter: StonePainter, wall: RenderableShape, frame: BarrierFrame) => void;
  readonly ghost: (painter: StonePainter, wall: RenderableShape, frame: BarrierFrame) => void;
} = { posts, curtain, ghost };
