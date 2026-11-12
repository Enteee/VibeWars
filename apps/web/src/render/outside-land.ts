import type { Vec2 } from "@vibewars/game-core";
import type { OutsideKind } from "@vibewars/game-maps/schema";

import { boxUnder, type CellBox, coverBoxes } from "./cell-cover.js";
import { type HazardPainter, hash, paintRock } from "./hazard-marks.js";

/**
 * The natural land outside a map's ground outline (#3066,
 * docs/art/3066-3067-outside-structures.md): a cliff drop, massed rock,
 * deep forest or deep water. Its body is one tile per kind, painted once
 * and repeated, so a map's whole outside costs a sprite, not a scatter of
 * shapes per frame; its edge is a line the ground side owns, traced along
 * the outline.
 */

/** A tile's side, world units: big enough that its repeat is hard to see. */
export const OUTSIDE_TILE = 256;
/** How far past the map's rectangle the outside is painted: past what a camera on the ground sees. */
export const OUTSIDE_MARGIN = 1600;

/** What a tile is painted with: a hazard's calls and a rectangle. */
export interface OutsidePainter extends HazardPainter {
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** What an edge is traced with. */
export interface EdgePainter {
  lineStyle(width: number, colour: number, alpha: number): void;
  strokeOutline(outline: readonly Vec2[]): void;
}

/** Each kind's colours, from the study. None is danger orange, acid green or friend blue. */
export const OUTSIDE_LOOK = {
  cliff: {
    base: 0x2d3748,
    grain: [0x252e3c, 0x343f52],
    streak: 0x4a5a70,
    lip: 0xa9bbd0,
    deep: 0x0b0f14,
  },
  rock: { base: 0x3f3c37, grain: [0x36332f, 0x4a4640], crevice: 0x14120f, rim: 0xb4ad9f },
  forest: {
    base: 0x1c2a1f,
    grain: [0x18241a, 0x223226],
    shadow: 0x0e1610,
    canopy: 0x2c4a2e,
    lit: 0x3f6a3d,
    spot: 0x5f8c55,
  },
  "deep-water": { base: 0x18304a, grain: [0x152a40, 0x1c3754], ripple: 0x2f5878, shore: 0x8fb8d6 },
} as const;

/** Paints one tile of `kind` at the origin, `OUTSIDE_TILE` square; it repeats without a seam. */
export function paintOutsideTile(painter: OutsidePainter, kind: OutsideKind): void {
  const look = OUTSIDE_LOOK[kind];
  painter.fillStyle(look.base, 1);
  painter.fillRect(0, 0, OUTSIDE_TILE, OUTSIDE_TILE);
  paintGrain(painter, look.grain, kind.length);
  TILE_ART[kind](painter);
}

/** Specks of two tones over the base, so the outside is never a flat slab. */
function paintGrain(painter: OutsidePainter, tones: readonly number[], seed: number): void {
  for (let k = 0; k < 360; k += 1) {
    const tone = tones[k % tones.length];
    if (tone === undefined) {
      continue;
    }
    const size = 2 + hash(seed * 1000 + k * 3) * 4;
    painter.fillStyle(tone, 0.8);
    painter.fillRect(
      hash(seed * 1000 + k * 3 + 1) * (OUTSIDE_TILE - size),
      hash(seed * 1000 + k * 3 + 2) * (OUTSIDE_TILE - size),
      size,
      size,
    );
  }
}

/**
 * The `cells` × `cells` jittered grid a tile's bodies stand on, sorted
 * north to south so a southern body overlaps a northern one, as it would.
 */
function scatter(cells: number, seed: number): readonly Vec2[] {
  const cell = OUTSIDE_TILE / cells;
  const points: Vec2[] = [];
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const n = seed + row * cells + column;
      points.push({
        x: (column + 0.15 + hash(n * 5) * 0.7) * cell,
        y: (row + 0.15 + hash(n * 5 + 1) * 0.7) * cell,
      });
    }
  }
  return points.sort((a, b) => a.y - b.y);
}

/** Calls `paint` at `at` and at each copy of it a tile away that `reach` brings into the tile. */
export function wrapped(at: Vec2, reach: number, paint: (at: Vec2) => void): void {
  for (const dy of [-OUTSIDE_TILE, 0, OUTSIDE_TILE]) {
    for (const dx of [-OUTSIDE_TILE, 0, OUTSIDE_TILE]) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (
        x + reach >= 0 &&
        x - reach <= OUTSIDE_TILE &&
        y + reach >= 0 &&
        y - reach <= OUTSIDE_TILE
      ) {
        paint({ x, y });
      }
    }
  }
}

const TILE_ART: Record<OutsideKind, (painter: OutsidePainter) => void> = {
  // Falling strata, faint: the face of a drop seen from above.
  cliff: (painter) => {
    const look = OUTSIDE_LOOK.cliff;
    for (const [k, at] of scatter(4, 11).entries()) {
      const length = 24 + hash(k * 7) * 40;
      wrapped(at, length, (here) => {
        painter.lineStyle(1.5, look.streak, 0.35);
        painter.lineBetween(
          here.x - length / 2,
          here.y,
          here.x + length / 2,
          here.y + length * 0.06,
        );
      });
    }
  },
  // Massed chiselled boulders, the hazard rock's recipe, big ones and small between.
  rock: (painter) => {
    const big = scatter(4, 23).map((at, k) => ({ at, radius: 20 + hash(k * 11) * 10, seed: k }));
    const small = scatter(4, 61).map((at, k) => ({
      at: {
        x: (at.x + OUTSIDE_TILE / 8) % OUTSIDE_TILE,
        y: (at.y + OUTSIDE_TILE / 8) % OUTSIDE_TILE,
      },
      radius: 10 + hash(k * 13) * 6,
      seed: 100 + k,
    }));
    for (const rock of [...small, ...big].sort((a, b) => a.at.y - b.at.y)) {
      wrapped(rock.at, rock.radius * 1.6, (here) => {
        paintRock(painter, here, rock.radius, hash(rock.seed * 17) * Math.PI, rock.seed, 1);
      });
    }
  },
  // Overlapping canopies lit from the NW, each with its trunk's shadow to the SE.
  forest: (painter) => {
    const look = OUTSIDE_LOOK.forest;
    for (const [k, at] of scatter(5, 37).entries()) {
      const radius = 22 + hash(k * 19) * 8;
      wrapped(at, radius * 1.4, (here) => {
        painter.fillStyle(look.shadow, 0.7);
        painter.fillCircle(here.x + radius * 0.3, here.y + radius * 0.35, radius);
        painter.fillStyle(look.canopy, 1);
        painter.fillCircle(here.x, here.y, radius);
        painter.fillStyle(look.lit, 1);
        painter.fillCircle(here.x - radius * 0.22, here.y - radius * 0.22, radius * 0.62);
        painter.fillStyle(look.spot, 1);
        painter.fillCircle(here.x - radius * 0.4, here.y - radius * 0.4, radius * 0.24);
      });
    }
  },
  // Still water: thin ripples, a shallow chevron each.
  "deep-water": (painter) => {
    const look = OUTSIDE_LOOK["deep-water"];
    for (const [k, at] of scatter(4, 47).entries()) {
      const half = 8 + hash(k * 23) * 8;
      wrapped(at, half * 2, (here) => {
        painter.lineStyle(1.2, look.ripple, 0.7);
        painter.lineBetween(here.x - half, here.y, here.x, here.y - 2);
        painter.lineBetween(here.x, here.y - 2, here.x + half, here.y);
      });
    }
  },
};

/** One stroke of an edge: `offset` world units to the outside of the outline, negative to the ground. */
interface EdgeStroke {
  readonly offset: number;
  readonly width: number;
  readonly colour: number;
  readonly alpha: number;
}

/** Each kind's edge, outermost first: the ground's line is drawn last, over the rest. */
export const OUTSIDE_EDGE: Record<OutsideKind, readonly EdgeStroke[]> = {
  // A haze falling away below, a dark outline, a pale lip, as a deck's lip.
  cliff: [
    { offset: 44, width: 40, colour: OUTSIDE_LOOK.cliff.deep, alpha: 0.12 },
    { offset: 26, width: 28, colour: OUTSIDE_LOOK.cliff.deep, alpha: 0.18 },
    { offset: 14, width: 18, colour: OUTSIDE_LOOK.cliff.deep, alpha: 0.25 },
    { offset: 4, width: 8, colour: OUTSIDE_LOOK.cliff.deep, alpha: 0.9 },
    { offset: -1.25, width: 2.5, colour: OUTSIDE_LOOK.cliff.lip, alpha: 1 },
  ],
  // A dark crevice, a thin pale rim.
  rock: [
    { offset: 3, width: 6, colour: OUTSIDE_LOOK.rock.crevice, alpha: 1 },
    { offset: -0.75, width: 1.5, colour: OUTSIDE_LOOK.rock.rim, alpha: 0.9 },
  ],
  // A soft dark shadow, no line.
  forest: [
    { offset: 3, width: 6, colour: OUTSIDE_LOOK.forest.shadow, alpha: 0.9 },
    { offset: -5, width: 10, colour: OUTSIDE_LOOK.forest.shadow, alpha: 0.3 },
  ],
  // Shallows, then the shore, as the deep water's shoreline.
  "deep-water": [
    { offset: 5, width: 10, colour: OUTSIDE_LOOK["deep-water"].ripple, alpha: 0.8 },
    { offset: -1.5, width: 3, colour: OUTSIDE_LOOK["deep-water"].shore, alpha: 1 },
  ],
};

/** Traces `kind`'s edge along `outline`. */
export function paintOutsideEdge(
  painter: EdgePainter,
  kind: OutsideKind,
  outline: readonly Vec2[],
): void {
  for (const stroke of OUTSIDE_EDGE[kind]) {
    painter.lineStyle(stroke.width, stroke.colour, stroke.alpha);
    painter.strokeOutline(offsetOutline(outline, stroke.offset));
  }
}

/** A mitre may reach this many times the offset at a sharp corner, no further. */
const MITRE_LIMIT = 3;

/**
 * `outline` moved `offset` outward (negative: inward), each corner along
 * its bisector, whichever way round the outline is wound.
 */
export function offsetOutline(outline: readonly Vec2[], offset: number): readonly Vec2[] {
  const area = outline.reduce((sum, p, k) => {
    const q = outline[(k + 1) % outline.length] ?? p;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  // With y down, a positive shoelace sum winds clockwise on screen, and (dy, -dx) points out.
  const out = area > 0 ? offset : -offset;
  return outline.map((p, k) => {
    const before = outline[(k + outline.length - 1) % outline.length] ?? p;
    const after = outline[(k + 1) % outline.length] ?? p;
    const n1 = normal(before, p);
    const n2 = normal(p, after);
    const bisector = { x: n1.x + n2.x, y: n1.y + n2.y };
    const length = Math.hypot(bisector.x, bisector.y);
    if (length < 1e-9) {
      return { x: p.x + n1.x * out, y: p.y + n1.y * out };
    }
    const unit = { x: bisector.x / length, y: bisector.y / length };
    const reach = Math.min(1 / Math.max(unit.x * n1.x + unit.y * n1.y, 1e-9), MITRE_LIMIT);
    return { x: p.x + unit.x * reach * out, y: p.y + unit.y * reach * out };
  });
}

/** The unit normal to the left of `from → to`, y down: (dy, -dx). */
function normal(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dy / length, y: -dx / length };
}

/** The four bands round a `width` × `height` map out to `OUTSIDE_MARGIN`, which no light map covers. */
export function outsideFrame(
  width: number,
  height: number,
): readonly {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}[] {
  const m = OUTSIDE_MARGIN;
  return [
    { x: -m, y: -m, width: width + 2 * m, height: m },
    { x: -m, y: height, width: width + 2 * m, height: m },
    { x: -m, y: 0, width: m, height },
    { x: width, y: 0, width: m, height },
  ];
}

/** The side of a cell `outsideCover` splits a map into: a box under the floor costs little. */
export const OUTSIDE_CELL = 64;
/** How far inside the outline a cell must be to count as under the floor: past its smoothed edge. */
const UNDER_FLOOR_MARGIN = 2;

/**
 * Where the land outside `outline` shows within the `width` × `height`
 * map (#3162): the cells of the map not wholly under the floor, merged
 * into boxes, so the outside costs a frame only the pixels it can show.
 * A cell in doubt is drawn, under the floor, never left a hole.
 */
export function outsideCover(
  outline: readonly Vec2[],
  width: number,
  height: number,
): readonly CellBox[] {
  return coverBoxes(
    width,
    height,
    OUTSIDE_CELL,
    (box) => !boxUnder(outline, box, UNDER_FLOOR_MARGIN),
  );
}
