import { pointInPolygon, type Vec2 } from "@vibewars/game-core";

import { hiddenAt, type Occluder, RING_PATH } from "./layer-surfaces.js";
import { bodyUnder, type OverhangCover } from "./overhang-art.js";
import { renderOrder } from "./render-order.js";

/**
 * The visibility gate (#3251): a body is never hidden. Whatever the
 * scene paints over a body must make its hidden outline show there, and
 * nothing static is painted over the outline itself.
 */

/** A filled polygon the scene painted, at its graphics' depth. */
export interface PaintedFill {
  readonly polygon: readonly Vec2[];
  readonly depth: number;
  /** What painted it, for the failure: a structure kind and its layer. */
  readonly what: string;
  /**
   * The overhang it is (#3293), which fades over any body under it, so
   * hides none of them; `null` for a fill that never fades.
   */
  readonly fadesOver: OverhangCover | null;
}

/** A body standing still where it draws: lifted, on its drawn layer, at its band's depth. */
export interface GateBody {
  /** Where it stands in the world, before it is lifted, for the failure. */
  readonly stands: { readonly x: number; readonly y: number; readonly layer: number };
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** The layer it draws on, as `traceHiddenOutline` is given it. */
  readonly layer: number;
  readonly depth: number;
}

/** A body some of whose ring a fill covers with no outline to show it. */
export interface HiddenSpot {
  readonly body: GateBody;
  readonly fill: PaintedFill;
  /** The ring's samples the fill covers and no outline is drawn at. */
  readonly uncovered: readonly Vec2[];
}

const HIDDEN_OUTLINE = renderOrder({ kind: "hidden-outline" });

/** Whether the hidden outline itself would be under `fill`: no static piece may be. */
export function coversOutline(fill: PaintedFill): boolean {
  return fill.depth >= HIDDEN_OUTLINE;
}

/** Where a body's ring is sampled, round the origin at radius 1: the midpoints `traceHiddenOutline` tests. */
const RING_SAMPLES: readonly Vec2[] = Array.from({ length: RING_PATH.length / 2 - 1 }, (_, k) => ({
  x: ((RING_PATH[2 * k] ?? 0) + (RING_PATH[2 * k + 2] ?? 0)) / 2,
  y: ((RING_PATH[2 * k + 1] ?? 0) + (RING_PATH[2 * k + 3] ?? 0)) / 2,
}));

/** The side of a cell of the fills' index, in world units. */
const CELL = 64;

interface IndexedFill {
  readonly fill: PaintedFill;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function cellKey(column: number, row: number): number {
  return column * 65_536 + row;
}

/** `fills` bucketed by the cells their boxes reach, with the deepest fill per cell. */
interface FillIndex {
  readonly cells: Map<number, IndexedFill[]>;
  readonly deepest: Map<number, number>;
}

function indexFills(fills: readonly PaintedFill[]): FillIndex {
  const cells = new Map<number, IndexedFill[]>();
  const deepest = new Map<number, number>();
  for (const fill of fills) {
    if (fill.polygon.length < 3) {
      continue;
    }
    const xs = fill.polygon.map((p) => p.x);
    const ys = fill.polygon.map((p) => p.y);
    const box = {
      fill,
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
    for (
      let column = Math.floor(box.left / CELL);
      column <= Math.floor(box.right / CELL);
      column += 1
    ) {
      for (let row = Math.floor(box.top / CELL); row <= Math.floor(box.bottom / CELL); row += 1) {
        const key = cellKey(column, row);
        deepest.set(key, Math.max(deepest.get(key) ?? -Infinity, fill.depth));
        const bucket = cells.get(key);
        if (bucket === undefined) {
          cells.set(key, [box]);
        } else {
          bucket.push(box);
        }
      }
    }
  }
  return { cells, deepest };
}

/** Whether any fill in the cells `body`'s ring reaches is painted over it. */
function anyOver({ deepest }: FillIndex, body: GateBody): boolean {
  for (
    let column = Math.floor((body.x - body.r) / CELL);
    column <= Math.floor((body.x + body.r) / CELL);
    column += 1
  ) {
    for (
      let row = Math.floor((body.y - body.r) / CELL);
      row <= Math.floor((body.y + body.r) / CELL);
      row += 1
    ) {
      if ((deepest.get(cellKey(column, row)) ?? -Infinity) > body.depth) {
        return true;
      }
    }
  }
  return false;
}

/** The topmost fill over `body`'s depth that covers `point`, if any. */
function topCover({ cells }: FillIndex, body: GateBody, point: Vec2): PaintedFill | undefined {
  let top: PaintedFill | undefined;
  for (const each of cells.get(cellKey(Math.floor(point.x / CELL), Math.floor(point.y / CELL))) ??
    []) {
    if (
      each.fill.depth > body.depth &&
      !fadedFor(each.fill, body) &&
      (top === undefined || each.fill.depth > top.depth) &&
      point.x >= each.left &&
      point.x <= each.right &&
      point.y >= each.top &&
      point.y <= each.bottom &&
      pointInPolygon(point, each.fill.polygon)
    ) {
      top = each.fill;
    }
  }
  return top;
}

/** Whether `fill` is an overhang faded over `body` (#3293): see-through, as the scene draws it. */
function fadedFor(fill: PaintedFill, body: GateBody): boolean {
  return (
    fill.fadesOver !== null &&
    bodyUnder(
      fill.fadesOver,
      [{ id: "", position: { x: body.x, y: body.y }, layer: body.layer }],
      () => body.stands.y - body.y,
    )
  );
}

/**
 * Every body a fill hides (#3251): a sample of its ring under a fill
 * painted over it, where no hidden outline is drawn or where the fill is
 * over the outline too. One spot per body and covering fill, the topmost.
 */
export function hiddenSpots({
  fills,
  occluders,
  bodies,
}: {
  readonly fills: readonly PaintedFill[];
  readonly occluders: readonly Occluder[];
  readonly bodies: readonly GateBody[];
}): HiddenSpot[] {
  const index = indexFills(fills);
  const spots: HiddenSpot[] = [];
  for (const body of bodies) {
    if (!anyOver(index, body)) {
      continue;
    }
    const byFill = new Map<PaintedFill, Vec2[]>();
    for (const sample of RING_SAMPLES) {
      const point = { x: body.x + sample.x * body.r, y: body.y + sample.y * body.r };
      const cover = topCover(index, body, point);
      if (
        cover !== undefined &&
        (coversOutline(cover) || !hiddenAt(occluders, body.layer, point.x, point.y))
      ) {
        byFill.set(cover, [...(byFill.get(cover) ?? []), point]);
      }
    }
    for (const [fill, uncovered] of byFill) {
      spots.push({ body, fill, uncovered });
    }
  }
  return spots;
}
