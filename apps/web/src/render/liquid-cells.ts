import type { Vec2 } from "@vibewars/game-core";

import { seeded } from "./zone-painter.js";

/**
 * The cells of a liquid's surface (#4058): a Voronoi pattern that tiles,
 * after https://samsunginternet.github.io/generating-a-water-effect-part-1-svg-and-canvas/.
 * No Phaser here: plain geometry, painted once into a repeating texture,
 * so it can be tested in Node. Water uses it; lava, mud and toxic will.
 */

export interface LiquidCellsOptions {
  /** The same seed lays out the same cells on every client and every load. */
  readonly seed: number;
  /** How many cells one tile holds. */
  readonly sites: number;
  /** The width of the gap between two cells, in texture px. */
  readonly gap: number;
  /** The tile's side, in texture px: a power of two, so it repeats. */
  readonly size: number;
}

/** How many times a cell's corners are cut round. */
const ROUNDING_PASSES = 2;

/**
 * One rounded polygon per site, in tile px. A cell near an edge runs past
 * it; `tiledCells` brings in the copies from the next tiles.
 */
export function liquidCells(options: LiquidCellsOptions): readonly (readonly Vec2[])[] {
  const { size, gap } = options;
  const sites = placeSites(options);
  const copies = OFFSETS.flatMap(([dx, dy]) =>
    sites.map((site, at) => ({ at, point: { x: site.x + dx * size, y: site.y + dy * size } })),
  );
  return sites.map((site, at) => {
    let cell: readonly Vec2[] = [
      { x: site.x - size, y: site.y - size },
      { x: site.x + size, y: site.y - size },
      { x: site.x + size, y: site.y + size },
      { x: site.x - size, y: site.y + size },
    ];
    for (const other of copies) {
      if (other.at === at && other.point.x === site.x && other.point.y === site.y) {
        continue;
      }
      cell = clipToward(cell, site, other.point, gap / 2);
    }
    for (let pass = 0; pass < ROUNDING_PASSES; pass += 1) {
      cell = cutCorners(cell);
    }
    return cell;
  });
}

/** `cells` and their copies one tile over, each that reaches into the tile. */
export function tiledCells(
  cells: readonly (readonly Vec2[])[],
  size: number,
): readonly (readonly Vec2[])[] {
  return OFFSETS.flatMap(([dx, dy]) =>
    cells
      .map((cell) => cell.map((p) => ({ x: p.x + dx * size, y: p.y + dy * size })))
      .filter(
        (cell) =>
          cell.some((p) => p.x > 0) &&
          cell.some((p) => p.x < size) &&
          cell.some((p) => p.y > 0) &&
          cell.some((p) => p.y < size),
      ),
  );
}

/** The tile and its eight neighbours. */
const OFFSETS: readonly (readonly [number, number])[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].map((dx) => [dx, dy] as const),
);

/**
 * `sites` points over the tile, no two nearer than half the spacing an
 * even lattice would have, measured round the tile's edges: no cell is
 * squeezed shut by the gap.
 */
function placeSites({ seed, sites, size }: LiquidCellsOptions): readonly Vec2[] {
  const random = seeded(seed);
  const spread = (0.5 * size) / Math.sqrt(sites);
  const placed: Vec2[] = [];
  for (let tries = 0; placed.length < sites && tries < sites * 50; tries += 1) {
    const point = { x: random() * size, y: random() * size };
    const near = placed.some((other) => {
      const dx = Math.abs(other.x - point.x);
      const dy = Math.abs(other.y - point.y);
      return Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy)) < spread;
    });
    if (!near) {
      placed.push(point);
    }
  }
  return placed;
}

/**
 * `cell` cut by the line between `site` and `other`, moved `half` toward
 * `site`: the convex polygon keeps the part nearer its own site, so two
 * neighbouring cells stand twice `half` apart all along their edge.
 */
function clipToward(cell: readonly Vec2[], site: Vec2, other: Vec2, half: number): readonly Vec2[] {
  const ux = other.x - site.x;
  const uy = other.y - site.y;
  const length = Math.hypot(ux, uy);
  const limit = (ux * (site.x + other.x)) / 2 + (uy * (site.y + other.y)) / 2 - half * length;
  const side = (p: Vec2): number => p.x * ux + p.y * uy - limit;
  const kept: Vec2[] = [];
  cell.forEach((p, k) => {
    const q = cell[(k + 1) % cell.length] ?? p;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) {
      kept.push(p);
    }
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      kept.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  });
  return kept;
}

/** Chaikin's corner cutting: each edge's quarter points. It stays inside a convex polygon. */
function cutCorners(cell: readonly Vec2[]): readonly Vec2[] {
  return cell.flatMap((p, k) => {
    const q = cell[(k + 1) % cell.length] ?? p;
    return [
      { x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y },
      { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y },
    ];
  });
}
