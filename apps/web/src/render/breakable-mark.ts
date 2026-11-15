import { polygonCentre, type Vec2 } from "@vibewars/game-core";

import type { ArenaPalette, BreakableLook } from "./arena-palette.js";
import { BARRIER_LOOK, BREAKABLE_WALL_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import type { GatePainter } from "./gate-mark.js";
import { shapeOutline, southFacingEdges } from "./layer-surfaces.js";

/**
 * Breakable walls and energy barriers (#3031, docs/art/3030-world-elements.md),
 * drawn through two lookups, as a gate's door is (`gate-mark.ts`), so the
 * asset card can swap either look without touching the scene. Procedural:
 * a wall of its biome's material (#3370) whose cracks grow from where it
 * is struck, that sags and tumbles to rubble; and a shimmering curtain
 * between two posts.
 */

/** The drawing calls a breakable wall or a barrier needs: a door's, and an ellipse. */
export interface StonePainter extends GatePainter {
  fillEllipse(x: number, y: number, width: number, height: number): void;
}

/** Where and how a breakable wall draws: on its layer, translated to its base. */
export interface BreakableFrame {
  /** How tall it stands now: a wall's height, less as it sags, or 0 on a flat map. */
  readonly height: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  /** Its material (#3370), as `breakableLook` gives it. */
  readonly look: BreakableLook;
  /** Its stone, as `breakablePalette` gives it, lit for where it stands. */
  readonly palette: Pick<ArenaPalette, "wallTop" | "wallFace" | "wallStroke" | "wallLit">;
}

/** `palette` with its wall colours turned into `look`'s, for `litStructurePalette` to light. */
export function breakablePalette(palette: ArenaPalette, look: BreakableLook): ArenaPalette {
  return {
    ...palette,
    wallTop: look.top,
    wallFace: look.face,
    wallStroke: look.edge,
    wallLit: look.lit,
  };
}

/** A repeatable 0..1 from `n` and `seed`: the same wall cracks the same way every redraw. */
function hash(n: number, seed: number): number {
  const s = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** A point of a crack: where on the ground it stands over, and how far up the wall. */
export interface CrackPoint {
  readonly x: number;
  readonly y: number;
  /** World units over the wall's base: up its face, or its full height on its top. */
  readonly up: number;
}

/** One straight run of a crack, and the share of the wall's damage over which it draws. */
export interface CrackSegment {
  readonly from: CrackPoint;
  readonly to: CrackPoint;
  /** CSS pixels: 2 at a crack's origin, 1 at its tips. */
  readonly width: number;
  /** It starts to draw at `start` damage, 0..1, and is whole at `end`. */
  readonly start: number;
  readonly end: number;
}

/** A wall's cracks (#3370), worked out once for the height it stands. */
export interface CrackNetwork {
  readonly height: number;
  readonly segments: readonly CrackSegment[];
}

/** How many origins a wall's cracks grow from: about one per this many units of its length. */
const ORIGIN_SPACING = 160;
const FEWEST_ORIGINS = 2;
const MOST_ORIGINS = 4;
/** By this much damage every crack is whole: most of the network shows at 20 % health. */
const WHOLE_AT = 0.8;

/** Its footprint's bounds. */
function bounds(wall: RenderableShape): {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
} {
  const outline = shapeOutline(wall);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * `wall`'s cracks standing `height` tall (#3370): 2–4 origins spread along
 * its length, each a line of 3–6 segments that wanders up its south face
 * and over the lip onto its top, with a branch off it. A wall long from
 * north to south shows little face, so all but one of its origins start
 * at a side lip of its top and wander across it. Each origin starts at
 * its own damage, the first at the first hit, and every segment is whole
 * by 80 % damage. Pure and seeded: the same wall cracks the same way.
 */
export function crackNetwork(seed: number, wall: RenderableShape, height: number): CrackNetwork {
  const box = bounds(wall);
  const alongX = box.w >= box.h;
  const length = Math.max(box.w, box.h);
  const count = Math.min(
    MOST_ORIGINS,
    Math.max(FEWEST_ORIGINS, Math.round(length / ORIGIN_SPACING)),
  );
  const south = box.y + box.h;
  const segments: CrackSegment[] = [];
  for (let origin = 0; origin < count; origin += 1) {
    const r = (k: number): number => hash(origin * 13 + k, seed);
    const share = (origin + 0.25 + r(0) * 0.5) / count;
    // The first to show is a hashed one, not always the west end's.
    const order = (origin + Math.floor(r(1) * count)) % count;
    const start = order === 0 ? 0 : (order / count) * 0.45 + r(2) * 0.05;
    const end = WHOLE_AT - r(3) * 0.1;
    const steps = 3 + Math.floor(r(4) * 4);
    const onFace = height > 0 && (alongX || origin === count - 1);
    const points: CrackPoint[] = [];
    if (onFace) {
      // Up the face to the lip, then north over the top.
      const x0 = alongX ? box.x + box.w * share : box.x + box.w * (0.2 + r(5) * 0.6);
      const faceSteps = Math.ceil(steps / 2);
      const topSteps = steps - faceSteps;
      const up0 = height * (0.1 + r(6) * 0.3);
      const wander = Math.min(height * 0.4, box.w / 5);
      let x = x0;
      points.push({ x, y: south, up: up0 });
      for (let k = 1; k <= faceSteps; k += 1) {
        x += (r(10 + k) - 0.5) * 2 * wander;
        points.push({ x, y: south, up: up0 + ((height - up0) * k) / faceSteps });
      }
      const reach = Math.min(box.h * 0.85, 60);
      for (let k = 1; k <= topSteps; k += 1) {
        x += (r(20 + k) - 0.5) * 2 * wander;
        points.push({ x, y: south - (reach * k) / topSteps, up: height });
      }
    } else if (alongX) {
      // Flat: from the south edge north over the top.
      let x = box.x + box.w * share;
      const wander = Math.min(8, box.w / 8);
      points.push({ x, y: south, up: height });
      for (let k = 1; k <= steps; k += 1) {
        x += (r(10 + k) - 0.5) * 2 * wander;
        points.push({ x, y: south - (box.h * 0.85 * k) / steps, up: height });
      }
    } else {
      // From a side lip across the top, west and east by turns.
      const west = origin % 2 === 0;
      let y = box.y + box.h * share;
      const wander = Math.min(16, box.h / 6);
      const across = box.w * (0.6 + r(5) * 0.3);
      const x0 = west ? box.x : box.x + box.w;
      points.push({ x: x0, y, up: height });
      for (let k = 1; k <= steps; k += 1) {
        y += (r(10 + k) - 0.5) * 2 * wander;
        points.push({ x: x0 + ((west ? 1 : -1) * across * k) / steps, y, up: height });
      }
    }
    const span = (end - start) / steps;
    for (let k = 0; k < steps; k += 1) {
      const from = points[k];
      const to = points[k + 1];
      if (from !== undefined && to !== undefined) {
        segments.push({
          from,
          to,
          width: 2 - k / Math.max(1, steps - 1),
          start: start + span * k,
          end: start + span * (k + 1),
        });
      }
    }
    // Two branches off middle points, sideways, once each point is reached.
    for (let twig = 0; twig < 2; twig += 1) {
      const fork = 1 + Math.floor(r(30 + twig * 5) * (steps - 1));
      const base = points[fork];
      const next = points[fork + 1] ?? points[fork - 1];
      if (base === undefined || next === undefined) {
        continue;
      }
      const turn = (r(31 + twig * 5) < 0.5 ? -1 : 1) * (twig === 0 ? 1 : -1);
      const run = { x: next.x - base.x, y: next.y - base.y, up: next.up - base.up };
      const reach = 0.5 + r(32 + twig * 5) * 0.4;
      const onTop = base.up === height;
      const to = {
        x: base.x + run.x * reach - turn * (run.y + run.up) * reach,
        y: base.y + run.y * reach,
        up: onTop
          ? height
          : Math.max(0, Math.min(height, base.up + run.up * reach + turn * run.x * 0.4)),
      };
      const branchStart = start + span * fork;
      segments.push({
        from: base,
        to,
        width: 1,
        start: branchStart,
        end: Math.min(end, branchStart + span * 1.5),
      });
    }
  }
  return { height, segments };
}

/** How much of `segment` shows at `reveal` damage, 0..1. */
export function segmentShown(segment: CrackSegment, reveal: number): number {
  const span = segment.end - segment.start;
  return span <= 0
    ? reveal >= segment.end
      ? 1
      : 0
    : Math.max(0, Math.min(1, (reveal - segment.start) / span));
}

/** How long, in world units, the cracks are at `reveal` damage: whole at 1. */
export function revealedLength(network: CrackNetwork, reveal: number): number {
  return network.segments.reduce((sum, segment) => {
    const { from, to } = segment;
    const length = Math.hypot(to.x - from.x, to.y - from.y - (to.up - from.up));
    return sum + length * segmentShown(segment, reveal);
  }, 0);
}

/** Where the crack that grew last ends at `reveal` damage, for the chips a hit knocks off. */
export function crackTip(network: CrackNetwork, reveal: number): CrackPoint | undefined {
  let tip: { readonly at: CrackPoint; readonly start: number } | undefined;
  for (const segment of network.segments) {
    const shown = segmentShown(segment, reveal);
    if (shown > 0 && (tip === undefined || segment.start >= tip.start)) {
      tip = { at: along(segment, shown), start: segment.start };
    }
  }
  return tip?.at;
}

function along({ from, to }: CrackSegment, share: number): CrackPoint {
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    up: from.up + (to.up - from.up) * share,
  };
}

/** Where `point` draws, its wall standing `scale` of its height. */
function drawn(point: CrackPoint, scale: number): Vec2 {
  return { x: point.x, y: point.y - point.up * scale };
}

/** How long a block of the face is, world units, and how wide its lit edge, CSS pixels. */
const BLOCK_LENGTH = 22;
const BRICK_LENGTH = 11;
const STONE_LENGTH = 14;
const LIT_WIDTH = 2;
/** How far south-east its shadow falls, of its height. */
const SHADOW_REACH = 0.25;
/** How far down the face ice shows light through, of its height. */
const ICE_CLEAR = 0.35;

/** The face's joints, as its material is laid: two courses of blocks, four of bricks, strata in ice, or field stones. */
function courses(
  painter: StonePainter,
  a: Vec2,
  b: Vec2,
  height: number,
  { line, look }: BreakableFrame,
  seed: number,
): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const at = (share: number, up: number): Vec2 => ({
    x: a.x + (b.x - a.x) * share,
    y: a.y + (b.y - a.y) * share - up,
  });
  if (look.courses === "ice") {
    painter.fillStyle(look.lit, 0.35);
    painter.fillShape({
      kind: "polygon",
      points: [
        at(0, height),
        at(1, height),
        at(1, height * (1 - ICE_CLEAR)),
        at(0, height * (1 - ICE_CLEAR)),
      ],
    });
    painter.lineStyle(line, look.mortar, 0.6);
    for (const level of [0.3, 0.55]) {
      const tilt = (hash(level * 10, seed) - 0.5) * height * 0.2;
      const p = at(0, height * level + tilt);
      const q = at(1, height * level - tilt);
      painter.lineBetween(p.x, p.y, q.x, q.y);
    }
    return;
  }
  const rows = look.courses === "bricks" ? 4 : look.courses === "fieldstone" ? 3 : 2;
  const unit =
    look.courses === "bricks"
      ? BRICK_LENGTH
      : look.courses === "fieldstone"
        ? STONE_LENGTH
        : BLOCK_LENGTH;
  painter.lineStyle(line, look.mortar, 1);
  for (let row = 0; row < rows; row += 1) {
    const low = (height * row) / rows;
    const high = (height * (row + 1)) / rows;
    if (row > 0) {
      const p = at(0, low);
      const q = at(1, low);
      painter.lineBetween(p.x, p.y, q.x, q.y);
    }
    // Each course's joints sit half a block over from the one under it;
    // field stones are laid wherever they fit.
    const blocks = Math.max(1, Math.round(length / unit));
    for (let k = 1; k <= blocks; k += 1) {
      const rough = look.courses === "fieldstone" ? (hash(k + row * 7, seed) - 0.5) * 0.7 : 0;
      const share = (k - (row % 2 === 0 ? 0 : 0.5) + rough) / blocks;
      if (share <= 0 || share >= 1) {
        continue;
      }
      const lean = look.courses === "fieldstone" ? (hash(k + row * 11, seed) - 0.5) * 6 : 0;
      const p = at(share, low);
      const q = at(share, high);
      painter.lineBetween(p.x, p.y, q.x + lean, q.y);
    }
  }
}

/** How deep a course of its top is, world units, as its material is laid. */
const TOP_COURSE: Record<Exclude<BreakableLook["courses"], "ice">, number> = {
  blocks: 20,
  bricks: 10,
  fieldstone: 16,
};

/**
 * Its top laid as its face is (#3370): staggered courses running east to
 * west, so a long top reads as masonry, not a slab. Ice has none.
 */
function topCourses(
  painter: StonePainter,
  wall: RenderableShape,
  { line, look }: BreakableFrame,
  seed: number,
): void {
  if (look.courses === "ice" || wall.kind !== "rect") {
    return;
  }
  const box = bounds(wall);
  const depth = TOP_COURSE[look.courses];
  const unit =
    look.courses === "bricks"
      ? BRICK_LENGTH * 2
      : look.courses === "fieldstone"
        ? STONE_LENGTH * 1.4
        : BLOCK_LENGTH * 1.3;
  const rows = Math.max(1, Math.round(box.h / depth));
  painter.lineStyle(line, look.mortar, 0.55);
  for (let row = 0; row < rows; row += 1) {
    const low = box.y + (box.h * row) / rows;
    const high = box.y + (box.h * (row + 1)) / rows;
    if (row > 0) {
      painter.lineBetween(box.x, low, box.x + box.w, low);
    }
    const blocks = Math.max(1, Math.round(box.w / unit));
    for (let k = 1; k <= blocks; k += 1) {
      const rough = look.courses === "fieldstone" ? (hash(k + row * 7, seed + 1) - 0.5) * 0.7 : 0;
      const share = (k - (row % 2 === 0 ? 0 : 0.5) + rough) / blocks;
      if (share > 0 && share < 1) {
        const x = box.x + box.w * share;
        painter.lineBetween(x, low, x, high);
      }
    }
  }
}

/** Moss in clumps along its top's south lip, spilling over it onto the face. */
function moss(
  painter: StonePainter,
  wall: RenderableShape,
  height: number,
  colour: number,
  seed: number,
): void {
  const box = bounds(wall);
  const south = box.y + box.h - height;
  const clumps = Math.max(3, Math.round(box.w / 22));
  for (let k = 0; k < clumps; k += 1) {
    const x = box.x + box.w * ((k + 0.2 + hash(k, seed + 3) * 0.6) / clumps);
    const size = 8 + hash(k, seed + 7) * 10;
    const back = hash(k, seed + 5) * Math.min(10, box.h * 0.4);
    painter.fillStyle(colour, 0.9);
    painter.fillEllipse(x, south - back, size, size * 0.45);
    // Some hang over the lip.
    if (hash(k, seed + 9) < 0.6 && height > 0) {
      painter.fillStyle(colour, 0.75);
      painter.fillEllipse(x + size * 0.1, south + size * 0.18, size * 0.6, size * 0.4);
    }
  }
}

/** What a standing wall's cracks show: its network, how much of it, and whether it glows. */
export interface StandingCracks {
  readonly network: CrackNetwork;
  /** Damage drawn, 0..1: a hit's grows in over a moment. */
  readonly reveal: number;
  /** Below half health, where its material glows (#3370). */
  readonly glow: boolean;
}

/**
 * Standing: a block of its biome's material like a map wall (#3370), its
 * face laid as that material is, with its cracks as far as `cracks`
 * shows them, cut in: dark, a lit lip over each.
 */
function standing(
  painter: StonePainter,
  wall: RenderableShape,
  cracks: StandingCracks,
  frame: BreakableFrame,
): void {
  const { height, line, look, palette } = frame;
  const box = bounds(wall);
  const seed = box.x + box.y * 3;
  const faces = southFacingEdges(wall);
  if (height > 0) {
    // Its shadow, thrown south-east (visual-style §3), shorter as it sags.
    painter.save();
    painter.translateCanvas(SHADOW_REACH * height, SHADOW_REACH * height * 0.8);
    painter.fillStyle(look.shadow, 0.35);
    painter.fillShape(wall);
    painter.restore();
    painter.fillColumn(wall, height, palette.wallFace);
    for (const { from, to } of faces) {
      courses(painter, from, to, height, frame, seed);
    }
  }
  painter.save();
  painter.translateCanvas(0, -height);
  painter.fillStyle(palette.wallTop, look.courses === "ice" ? 0.9 : 1);
  painter.fillShape(wall);
  topCourses(painter, wall, frame, seed);
  painter.lineStyle(line, palette.wallStroke, 1);
  painter.strokeShape(wall);
  if (height > 0) {
    painter.lineStyle(line * LIT_WIDTH, palette.wallLit, 1);
    for (const { from, to } of faces) {
      painter.lineBetween(from.x, from.y, to.x, to.y);
    }
  }
  painter.restore();
  if (look.moss !== undefined) {
    moss(painter, wall, height, look.moss, seed);
  }
  paintCracks(painter, cracks, frame);
}

/** The cracks, scaled to the height the wall stands now. */
function paintCracks(painter: StonePainter, cracks: StandingCracks, frame: BreakableFrame): void {
  const { line, look } = frame;
  const scale = cracks.network.height > 0 ? frame.height / cracks.network.height : 0;
  const shown = cracks.network.segments.flatMap((segment) => {
    const share = segmentShown(segment, cracks.reveal);
    return share > 0
      ? [
          {
            a: drawn(segment.from, scale),
            b: drawn(along(segment, share), scale),
            width: segment.width,
          },
        ]
      : [];
  });
  if (cracks.glow && look.glow !== undefined) {
    for (const { a, b, width } of shown) {
      painter.lineStyle(line * (width + 2), look.glow, 0.35);
      painter.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  for (const { a, b, width } of shown) {
    const lip = line * (width / 2 + 0.5);
    painter.lineStyle(line, look.lit, 0.7);
    painter.lineBetween(a.x, a.y - lip, b.x, b.y - lip);
  }
  for (const { a, b, width } of shown) {
    painter.lineStyle(line * width, look.crack, 1);
    painter.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** How many chunks a crumbled wall's pile has, at most and at least. */
const MOST_CHUNKS = 24;
const FEWEST_CHUNKS = 6;
/** How tall a chunk stands, world units. */
const CHUNK_RISE = 2.5;

/** A chunk of stone at `centre`, `size` across, turned by `turn` of a circle. */
function chunk(
  painter: StonePainter,
  centre: Vec2,
  size: number,
  turn: number,
  rise: number,
  { line, look }: BreakableFrame,
): void {
  const corners: Vec2[] = Array.from({ length: 4 }, (_, k) => {
    const angle = (turn + k / 4) * Math.PI * 2;
    const reach = size * (0.7 + hash(k, centre.x + centre.y) * 0.3);
    return { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach * 0.6 };
  });
  const piece: RenderableShape = { kind: "polygon", points: corners };
  painter.fillColumn(piece, rise, look.rubbleFace);
  painter.save();
  painter.translateCanvas(0, -rise);
  painter.fillStyle(look.rubble, 1);
  painter.fillShape(piece);
  painter.lineStyle(line, look.edge, 0.8);
  painter.strokeShape(piece);
  painter.restore();
}

/** Its footprint's shadow, strewn with low chunks of its material. */
function pile(painter: StonePainter, wall: RenderableShape, frame: BreakableFrame): void {
  const outline = shapeOutline(wall);
  const centre = polygonCentre(outline);
  painter.fillStyle(frame.look.shadow, 0.3);
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
  for (const piece of chunks) {
    chunk(painter, piece, piece.size, piece.turn, CHUNK_RISE, frame);
  }
}

/** A block that tumbles off a falling wall (#3370): where it leaves from and lands, and when. */
export interface TumbleChunk {
  readonly from: CrackPoint;
  readonly to: Vec2;
  readonly size: number;
  /** Seconds into the fall it leaves, and how long it flies. */
  readonly delay: number;
  readonly flight: number;
  /** How high its arc rises over a straight drop, world units. */
  readonly arc: number;
  readonly turn: number;
  readonly spin: number;
}

/** How long a wall takes to fall, seconds (#3370). */
export const BREAK_SECONDS = 0.6;
/** What share of its height a falling wall sags to. */
export const SAG_TO = 0.35;
const FEWEST_TUMBLES = 8;
const MOST_TUMBLES = 14;

/** How tall a wall `age` seconds into its fall stands, of its height: 1, easing in down to `SAG_TO`. */
export function sagShare(age: number): number {
  const t = Math.max(0, Math.min(1, age / BREAK_SECONDS));
  return 1 - (1 - SAG_TO) * t * t;
}

/**
 * The 8–14 blocks a wall standing `height` tall throws as it falls,
 * sized to a course of it, outward to both sides on short arcs; they land
 * by the end of the fall and lie in its rubble. Pure and seeded.
 */
export function tumbleChunks(
  seed: number,
  wall: RenderableShape,
  height: number,
): readonly TumbleChunk[] {
  const box = bounds(wall);
  const alongX = box.w >= box.h;
  const count = FEWEST_TUMBLES + Math.floor(hash(1, seed) * (MOST_TUMBLES - FEWEST_TUMBLES + 1));
  const course = height > 0 ? height / 2 : 8;
  return Array.from({ length: count }, (_, n) => {
    const r = (k: number): number => hash(n * 17 + k, seed);
    const share = (n + r(0)) / count;
    const side = n % 2 === 0 ? 1 : -1;
    const out = 6 + r(1) * 16;
    const slide = (r(2) - 0.5) * 16;
    const from = alongX
      ? { x: box.x + box.w * share, y: box.y + box.h * r(3), up: height * (0.4 + r(4) * 0.6) }
      : { x: box.x + box.w * r(3), y: box.y + box.h * share, up: height * (0.4 + r(4) * 0.6) };
    const to = alongX
      ? { x: from.x + slide, y: side > 0 ? box.y + box.h + out : box.y - out }
      : { x: side > 0 ? box.x + box.w + out : box.x - out, y: from.y + slide };
    const delay = r(5) * 0.2;
    return {
      from,
      to,
      size: course * (0.35 + r(6) * 0.2),
      delay,
      flight: BREAK_SECONDS - delay - r(7) * 0.1,
      arc: 6 + r(8) * 8,
      turn: r(9),
      spin: (r(10) - 0.5) * 3,
    };
  });
}

/** Crumbled: the pile, and the blocks that tumbled off lying where they landed; no longer a wall. */
function rubble(
  painter: StonePainter,
  wall: RenderableShape,
  tumbles: readonly TumbleChunk[],
  frame: BreakableFrame,
): void {
  pile(painter, wall, frame);
  for (const piece of [...tumbles].sort((p, q) => p.to.y - q.to.y)) {
    chunk(painter, piece.to, piece.size, piece.turn + piece.spin, piece.size * 0.6, frame);
  }
}

/**
 * `age` seconds into its fall (#3370): the pile it leaves under it, the
 * wall sagging into it, cracked through, and its blocks tumbling out.
 * `frame.height` is its height standing.
 */
function falling(
  painter: StonePainter,
  wall: RenderableShape,
  cracks: StandingCracks,
  tumbles: readonly TumbleChunk[],
  age: number,
  frame: BreakableFrame,
): void {
  pile(painter, wall, frame);
  standing(
    painter,
    wall,
    { ...cracks, reveal: 1 },
    { ...frame, height: frame.height * sagShare(age) },
  );
  const flying = tumbles
    .map((piece) => {
      const s = Math.max(0, Math.min(1, (age - piece.delay) / piece.flight));
      const x = piece.from.x + (piece.to.x - piece.from.x) * s;
      const y = piece.from.y + (piece.to.y - piece.from.y) * s;
      const lift = piece.from.up * (1 - s) + piece.arc * 4 * s * (1 - s);
      return { piece, at: { x, y }, lift, s };
    })
    .sort((p, q) => p.at.y - q.at.y);
  for (const { piece, at, lift, s } of flying) {
    painter.save();
    painter.translateCanvas(0, -lift);
    chunk(painter, at, piece.size, piece.turn + piece.spin * s, piece.size * 0.6, frame);
    painter.restore();
  }
}

/** A breakable wall's look: standing with its cracks, falling, or fallen to rubble. */
export const BREAKABLE_ART: {
  readonly standing: (
    painter: StonePainter,
    wall: RenderableShape,
    cracks: StandingCracks,
    frame: BreakableFrame,
  ) => void;
  readonly falling: (
    painter: StonePainter,
    wall: RenderableShape,
    cracks: StandingCracks,
    tumbles: readonly TumbleChunk[],
    age: number,
    frame: BreakableFrame,
  ) => void;
  readonly rubble: (
    painter: StonePainter,
    wall: RenderableShape,
    tumbles: readonly TumbleChunk[],
    frame: BreakableFrame,
  ) => void;
} = { standing, falling, rubble };

/** How long the chips a hit knocks off take to fall, seconds (#3370). */
export const CHIP_SECONDS = 0.35;

/** The 2–4 chips of `colour` a hit knocks off `tip`, `age` seconds on: falling, fading. */
export function paintChips(
  painter: StonePainter,
  tip: Vec2,
  age: number,
  seed: number,
  colour: number,
): void {
  if (age < 0 || age >= CHIP_SECONDS) {
    return;
  }
  const s = age / CHIP_SECONDS;
  const count = 2 + Math.floor(hash(0, seed) * 3);
  painter.fillStyle(colour, 1 - s);
  for (let k = 0; k < count; k += 1) {
    const out = (hash(k + 1, seed) - 0.5) * 14;
    const size = 1.5 + hash(k + 5, seed);
    const x = tip.x + out * s;
    const y = tip.y - 3 * s + 16 * s * s;
    painter.fillShape({
      kind: "rect",
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
    });
  }
}

/** How long the dust of a wall's fall hangs, in seconds: from its sag on. */
export const DUST_SECONDS = 1;

/** The puff of dust as a wall falls, `age` seconds on: clouds of its material that swell and thin. */
export function paintDust(
  painter: StonePainter,
  wall: RenderableShape,
  age: number,
  colour: number,
): void {
  if (age < 0 || age >= DUST_SECONDS) {
    return;
  }
  const share = age / DUST_SECONDS;
  const centre = polygonCentre(shapeOutline(wall));
  const alpha = 0.55 * (1 - share);
  painter.fillStyle(colour, alpha);
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
