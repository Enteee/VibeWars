import type { Vec2 } from "@vibewars/game-core";

/**
 * Boxes that cover only what shows of a large picture (#3162): its
 * cells, merged. A full-screen picture that is mostly hidden or mostly
 * empty costs a software-rendered frame every pixel of it, so it is drawn
 * as the few boxes where it shows instead.
 */

/** A box, in whatever units its picture is in. */
export interface CellBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The cells of `cell` square over `width` × `height` where `shows`, merged
 * into boxes: each row's runs, each grown down while the rows below run
 * the same. They never overlap, so a picture blended into what is under
 * it is blended once.
 */
export function coverBoxes(
  width: number,
  height: number,
  cell: number,
  shows: (box: CellBox) => boolean,
): readonly CellBox[] {
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const runs = Array.from({ length: rows }, (_, row) => {
    const spans: [number, number][] = [];
    for (let column = 0; column < columns; column += 1) {
      const x = column * cell;
      const y = row * cell;
      if (
        !shows({
          x,
          y,
          width: Math.min(width, x + cell) - x,
          height: Math.min(height, y + cell) - y,
        })
      ) {
        continue;
      }
      const last = spans.at(-1);
      if (last?.[1] === column) {
        last[1] = column + 1;
      } else {
        spans.push([column, column + 1]);
      }
    }
    return spans;
  });
  const same = (row: number, from: number, to: number): boolean =>
    runs[row]?.some(([a, b]) => a === from && b === to) === true;
  const boxes: CellBox[] = [];
  runs.forEach((spans, row) => {
    for (const [from, to] of spans) {
      if (same(row - 1, from, to)) {
        continue;
      }
      let end = row + 1;
      while (same(end, from, to)) {
        end += 1;
      }
      const x = from * cell;
      const y = row * cell;
      boxes.push({
        x,
        y,
        width: Math.min(width, to * cell) - x,
        height: Math.min(height, end * cell) - y,
      });
    }
  });
  return boxes;
}

/**
 * Where the line `axis = at` runs inside `outline`: its spans along the
 * other axis, west to east or north to south, for the grid to draw
 * inside the ground and nowhere else.
 */
export function insideRuns(
  outline: readonly Vec2[],
  axis: "x" | "y",
  at: number,
): readonly (readonly [number, number])[] {
  const across = axis === "x" ? "y" : "x";
  const crossings: number[] = [];
  outline.forEach((a, k) => {
    const b = outline[(k + 1) % outline.length] ?? a;
    // Half-open, so a line through a corner counts it once.
    if (a[axis] <= at !== b[axis] <= at) {
      crossings.push(a[across] + ((at - a[axis]) / (b[axis] - a[axis])) * (b[across] - a[across]));
    }
  });
  crossings.sort((p, q) => p - q);
  const runs: (readonly [number, number])[] = [];
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    const from = crossings[k];
    const to = crossings[k + 1];
    if (from !== undefined && to !== undefined) {
      runs.push([from, to]);
    }
  }
  return runs;
}

/** `box` grown by `by` on every side. */
function grown({ x, y, width, height }: CellBox, by: number): CellBox {
  return { x: x - by, y: y - by, width: width + 2 * by, height: height + 2 * by };
}

/** The four sides of `box`, each as the line it is on and its span along that line. */
function sides({ x, y, width, height }: CellBox) {
  return [
    { axis: "y", at: y, from: x, to: x + width },
    { axis: "y", at: y + height, from: x, to: x + width },
    { axis: "x", at: x, from: y, to: y + height },
    { axis: "x", at: x + width, from: y, to: y + height },
  ] as const;
}

function cornerIn(outline: readonly Vec2[], { x, y, width, height }: CellBox): boolean {
  return outline.some((p) => x <= p.x && p.x <= x + width && y <= p.y && p.y <= y + height);
}

/**
 * Whether `box`, grown by `margin`, is wholly inside `outline`: each side
 * runs inside it and no corner of it is in the box. In doubt, it is not.
 */
export function boxUnder(outline: readonly Vec2[], box: CellBox, margin: number): boolean {
  const around = grown(box, margin);
  return (
    sides(around).every(({ axis, at, from, to }) =>
      insideRuns(outline, axis, at).some(([start, end]) => start <= from && to <= end),
    ) && !cornerIn(outline, around)
  );
}

/**
 * Whether `box`, grown by `margin`, meets `outline` anywhere: a corner of
 * the outline is in it, or a side of it crosses or runs inside the outline.
 */
export function boxMeets(outline: readonly Vec2[], box: CellBox, margin: number): boolean {
  const around = grown(box, margin);
  return (
    cornerIn(outline, around) ||
    sides(around).some(({ axis, at, from, to }) =>
      insideRuns(outline, axis, at).some(([start, end]) => start < to && from < end),
    )
  );
}

/** `polygon`, convex, clipped to `box`: what of it is in the box, convex too. */
export function clipConvex(polygon: readonly Vec2[], box: CellBox): readonly Vec2[] {
  const edges = [
    { axis: "x", at: box.x, keep: 1 },
    { axis: "x", at: box.x + box.width, keep: -1 },
    { axis: "y", at: box.y, keep: 1 },
    { axis: "y", at: box.y + box.height, keep: -1 },
  ] as const;
  let clipped: readonly Vec2[] = polygon;
  for (const { axis, at, keep } of edges) {
    const kept: Vec2[] = [];
    clipped.forEach((a, k) => {
      const b = clipped[(k + 1) % clipped.length] ?? a;
      const aIn = keep * (a[axis] - at) >= 0;
      const bIn = keep * (b[axis] - at) >= 0;
      if (aIn) {
        kept.push(a);
      }
      if (aIn !== bIn) {
        // From the same end whichever way the edge runs, so two pieces
        // sharing it cross the box at the very same point: no crack.
        const [p, q] = a.x < b.x || (a.x === b.x && a.y < b.y) ? [a, b] : [b, a];
        const t = (at - p[axis]) / (q[axis] - p[axis]);
        kept.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    });
    clipped = kept;
  }
  return clipped;
}

/** What to fill of a shape: whole boxes of it, and convex pieces round its edge. */
export interface ShownFill {
  readonly boxes: readonly CellBox[];
  readonly pieces: readonly (readonly Vec2[])[];
}

/** The box round `points`. */
function bounds(points: readonly Vec2[]): CellBox {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function overlaps(a: CellBox, b: CellBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A shape with `outline`, triangulated as `triangles`, filled but where
 * `hidden` (#3162): what an opaque thing drawn over it later covers
 * anyway. Its cells of `cell` on the world grid are left out when wholly
 * hidden, by `margin` past a hiding edge so that edge's smoothing still
 * blends with it; filled as boxes when wholly in the shape; and as its
 * triangles clipped to them round its edge. With nothing hidden, it is
 * no cheaper than the shape.
 */
export function shownFill(
  outline: readonly Vec2[],
  triangles: readonly (readonly Vec2[])[],
  hidden: readonly (readonly Vec2[])[],
  cell: number,
  margin: number,
): ShownFill {
  const area = bounds(outline);
  const left = Math.floor(area.x / cell) * cell;
  const top = Math.floor(area.y / cell) * cell;
  const columns = Math.ceil((area.x + area.width - left) / cell);
  const rows = Math.ceil((area.y + area.height - top) / cell);
  const covers = hidden.map((points) => ({ points, box: bounds(points) }));
  const shaped = triangles.map((points) => ({ points, box: bounds(points) }));
  const whole = new Set<string>();
  const pieces: (readonly Vec2[])[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const box = { x: left + column * cell, y: top + row * cell, width: cell, height: cell };
      if (covers.some((cover) => overlaps(cover.box, box) && boxUnder(cover.points, box, margin))) {
        continue;
      }
      if (boxUnder(outline, box, 0)) {
        whole.add(`${String(column)},${String(row)}`);
        continue;
      }
      for (const { points, box: around } of shaped) {
        const piece = overlaps(around, box) ? clipConvex(points, box) : [];
        if (piece.length >= 3) {
          pieces.push(piece);
        }
      }
    }
  }
  const boxes = coverBoxes(columns * cell, rows * cell, cell, ({ x, y }) =>
    whole.has(`${String(x / cell)},${String(y / cell)}`),
  ).map((box) => ({ ...box, x: box.x + left, y: box.y + top }));
  return { boxes, pieces };
}
