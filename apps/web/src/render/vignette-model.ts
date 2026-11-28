import type { Box } from "./layer-surfaces.js";

/**
 * The gothic look's vignette (#4057): the view darkens towards its
 * corners, as in the mock (`docs/art/spikes/3977-sprite-stacking`).
 * `alpha` is the darkening at a corner; `clear` is how far from the centre,
 * as a share of the way to a corner, nothing darkens: the centre third.
 */
export const VIGNETTE = { alpha: 0.6, clear: 1 / 3 } as const;

/**
 * How many cells a side the vignette is drawn in (#4130). Each cell shades
 * linearly between its corners, which keeps it within 1 % of
 * `vignetteAlpha`, so it shows no steps.
 */
export const VIGNETTE_GRID = 16;

/**
 * How dark the vignette is at `(x, y)` of a view `width` by `height`: 0 in
 * the centre third, rising smoothly to `VIGNETTE.alpha` at the corners.
 * The view's sides are scaled to one, so a wide view's vignette is as wide.
 */
export function vignetteAlpha(x: number, y: number, width: number, height: number): number {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  return alphaOut(Math.hypot(across, down) / Math.SQRT2);
}

/** How dark the vignette is `out` of the way from the centre to a corner, 0 to 1. */
export function alphaOut(out: number): number {
  const ramp = Math.min(1, Math.max(0, (out - VIGNETTE.clear) / (1 - VIGNETTE.clear)));
  return VIGNETTE.alpha * ramp * ramp * (3 - 2 * ramp);
}

/** One cell of the vignette, in world units, and how dark each of its corners is. */
export interface VignetteCell {
  readonly box: Box;
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
}

/**
 * The cells of the vignette over `view` that fall on `clip`, both in
 * world units (#4130): `VIGNETTE_GRID` a side over the view, each cut to
 * `clip` and shaded as the whole cell would be there, so a deck pass shades
 * each point as the ground pass does. A cell dark at none of its corners is
 * left out: the clear centre is an ellipse, so all of such a cell is clear.
 * On a software renderer every pixel drawn costs, and most of the view is
 * not darkened.
 */
export function vignetteCells(view: Box, clip: Box = view): VignetteCell[] {
  const width = view.right - view.left;
  const height = view.bottom - view.top;
  const step = { x: width / VIGNETTE_GRID, y: height / VIGNETTE_GRID };
  const cells: VignetteCell[] = [];
  for (let row = 0; row < VIGNETTE_GRID; row += 1) {
    for (let column = 0; column < VIGNETTE_GRID; column += 1) {
      const cell = {
        left: view.left + column * step.x,
        top: view.top + row * step.y,
        right: view.left + (column + 1) * step.x,
        bottom: view.top + (row + 1) * step.y,
      };
      const box = {
        left: Math.max(cell.left, clip.left),
        top: Math.max(cell.top, clip.top),
        right: Math.min(cell.right, clip.right),
        bottom: Math.min(cell.bottom, clip.bottom),
      };
      if (box.left >= box.right || box.top >= box.bottom) {
        continue;
      }
      const at = (x: number, y: number) =>
        vignetteAlpha(x - view.left, y - view.top, width, height);
      const corners = [
        at(cell.left, cell.top),
        at(cell.right, cell.top),
        at(cell.left, cell.bottom),
        at(cell.right, cell.bottom),
      ] as const;
      if (corners.every((alpha) => alpha === 0)) {
        continue;
      }
      const [topLeft, topRight, bottomLeft, bottomRight] = corners;
      // The cell's shade at `(x, y)` within it, as drawn: between its corners.
      const shade = (x: number, y: number) => {
        const across = (x - cell.left) / step.x;
        const down = (y - cell.top) / step.y;
        const top = topLeft + (topRight - topLeft) * across;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * across;
        return top + (bottom - top) * down;
      };
      cells.push({
        box,
        topLeft: shade(box.left, box.top),
        topRight: shade(box.right, box.top),
        bottomLeft: shade(box.left, box.bottom),
        bottomRight: shade(box.right, box.bottom),
      });
    }
  }
  return cells;
}

/** A corner of a shaded triangle, in world units, and how dark it is. */
export interface ShadedPoint {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Pieces thinner than this, in square world units, are an edge two shapes share: dropped. */
const SLIVER = 1e-6;

/**
 * `triangles` cut into convex pieces that do not overlap, covering what
 * they cover (#4130): two deck tops of one layer can overlap, and without
 * a stencil the vignette would darken them there twice.
 */
export function disjointPieces(triangles: readonly (readonly Point[])[]): Point[][] {
  const pieces: Point[][] = [];
  for (const triangle of triangles) {
    let parts: Point[][] = [[...triangle]];
    for (const piece of pieces) {
      parts = parts.flatMap((part) => subtract(part, piece));
    }
    pieces.push(...parts);
  }
  return pieces;
}

/**
 * The convex `pieces` shaded as the vignette over `view` shades the ground
 * under them (#4130): each cut along `vignetteCells`' cells into
 * triangles, shaded between their cell's corners, the clear centre left
 * out. A deck's tops drawn so need no stencil, and only their own pixels
 * are filled.
 */
export function vignetteTriangles(
  view: Box,
  pieces: readonly (readonly Point[])[],
): (readonly [ShadedPoint, ShadedPoint, ShadedPoint])[] {
  const shaded: (readonly [ShadedPoint, ShadedPoint, ShadedPoint])[] = [];
  for (const piece of pieces) {
    const xs = piece.map(({ x }) => x);
    const ys = piece.map(({ y }) => y);
    const box = {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
    for (const cell of vignetteCells(view, box)) {
      const [first, ...rest] = clipToBox(piece, cell.box).map((point) => shadeIn(cell, point));
      if (first === undefined) {
        continue;
      }
      for (let i = 0; i + 1 < rest.length; i += 1) {
        const [second, third] = [rest[i], rest[i + 1]];
        if (second !== undefined && third !== undefined) {
          shaded.push([first, second, third]);
        }
      }
    }
  }
  return shaded;
}

/** `point`, within `cell`, shaded between the cell's corners. */
function shadeIn(cell: VignetteCell, { x, y }: Point): ShadedPoint {
  const { box } = cell;
  const across = box.right === box.left ? 0 : (x - box.left) / (box.right - box.left);
  const down = box.bottom === box.top ? 0 : (y - box.top) / (box.bottom - box.top);
  const top = cell.topLeft + (cell.topRight - cell.topLeft) * across;
  const bottom = cell.bottomLeft + (cell.bottomRight - cell.bottomLeft) * across;
  return { x, y, alpha: top + (bottom - top) * down };
}

/** The convex `polygon` cut to `box`; empty when nothing of it is left. */
export function clipToBox(polygon: readonly Point[], box: Box): Point[] {
  let points: Point[] = [...polygon];
  for (const side of [
    (p: Point) => p.x - box.left,
    (p: Point) => box.right - p.x,
    (p: Point) => p.y - box.top,
    (p: Point) => box.bottom - p.y,
  ]) {
    points = halfPlane(points, side);
  }
  return area(points) > SLIVER ? points : [];
}

/**
 * The convex `polygon` less the convex `hole`, as convex pieces: what lies
 * beyond each of the hole's edges in turn, the rest carried to the next.
 */
function subtract(polygon: Point[], hole: readonly Point[]): Point[][] {
  const turn = signedArea(hole) > 0 ? 1 : -1;
  const pieces: Point[][] = [];
  let rest = polygon;
  hole.forEach((a, i) => {
    const b = hole[(i + 1) % hole.length] ?? a;
    const side = (p: Point) => turn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const beyond = halfPlane(rest, (p) => -side(p));
    if (area(beyond) > SLIVER) {
      pieces.push(beyond);
    }
    rest = halfPlane(rest, side);
  });
  return area(rest) > SLIVER ? pieces : [polygon];
}

/** What of the convex `polygon` lies where `side` is not negative (Sutherland-Hodgman). */
function halfPlane(polygon: readonly Point[], side: (p: Point) => number): Point[] {
  const kept: Point[] = [];
  polygon.forEach((point, i) => {
    const previous = polygon[(i + polygon.length - 1) % polygon.length] ?? point;
    const [here, before] = [side(point), side(previous)];
    if (here >= 0 !== before >= 0) {
      const t = before / (before - here);
      kept.push({
        x: previous.x + (point.x - previous.x) * t,
        y: previous.y + (point.y - previous.y) * t,
      });
    }
    if (here >= 0) {
      kept.push(point);
    }
  });
  return kept;
}

function signedArea(polygon: readonly Point[]): number {
  return (
    polygon.reduce((sum, { x, y }, i) => {
      const next = polygon[(i + 1) % polygon.length] ?? { x, y };
      return sum + x * next.y - next.x * y;
    }, 0) / 2
  );
}

function area(polygon: readonly Point[]): number {
  return Math.abs(signedArea(polygon));
}
