import { distancePointToSegment, type Vec2 } from "@vibewars/game-core";

import { boxWithout, segmentInBox, type Box } from "./layer-surfaces.js";
import type { StructurePainter } from "./structure-art.js";

/**
 * What lies over a tunnel, split by the tunnel covers under it, so the
 * part over a tunnel fades with its cover (#3350): water, and the decks
 * over it (#3352). No Phaser here: plain geometry, tested in Node.
 */

/** The box the ground over tunnel `tunnel` covers, as `tunnelCoverBox` gives it. */
export interface TunnelCoverBox {
  readonly tunnel: number;
  readonly box: Box;
}

/**
 * A piece of an outline split by the covers under it: the part in `box`,
 * over tunnel `tunnel`, or of the rest when `undefined`. Its `shore` is the
 * edges of `outline` that are the outline's own: a cut edge meets the next
 * piece's exactly and is never stroked. The pieces' boxes never overlap.
 */
export interface CoverPiece {
  readonly tunnel: number | undefined;
  readonly box: Box;
  readonly outline: readonly Vec2[];
  readonly shore: readonly (readonly [Vec2, Vec2])[];
}

/**
 * The covers a deck drawn `lift` up is cut by (#3352): each box reaching
 * `lift` further south, as the deck's rows that far south draw over the
 * cover's screen area, where a body in the tunnel draws. The part straight
 * over the tunnel stays in it too.
 */
export function liftedCovers(
  covers: readonly TunnelCoverBox[],
  lift: number,
): readonly TunnelCoverBox[] {
  return covers.map(({ tunnel, box }) => ({ tunnel, box: { ...box, bottom: box.bottom + lift } }));
}

/** How far a corner may sit off a shore edge and still be on it, in world units. */
const ON_SHORE = 1e-6;

/**
 * `outline` split by the covers it meets: one piece per box of each cover,
 * and the rest of `within` in the boxes outside every cover, each with what
 * of `outline` is in it, empty where nothing is. Where two covers overlap,
 * at a junction, the earlier owns the overlap. An outline over no cover is
 * one piece, its whole self in the whole of `within`.
 */
export function coverPieces(
  outline: readonly Vec2[],
  within: Box,
  covers: readonly TunnelCoverBox[],
): readonly CoverPiece[] {
  const bounds = boundsOf(outline);
  const met = covers.filter(({ box }) => overlaps(box, bounds));
  if (met.length === 0) {
    return [{ tunnel: undefined, box: within, outline, shore: edges(outline) }];
  }
  const owned: Box[] = [];
  const regions = met.flatMap(({ tunnel, box }) => {
    const boxes = boxWithout(box, owned).map((piece) => ({ tunnel, box: piece }));
    owned.push(box);
    return boxes;
  });
  const rest = boxWithout(within, owned).map((box) => ({ tunnel: undefined, box }));
  return [...regions, ...rest].map(({ tunnel, box }) => {
    const piece = clipToBox(outline, box);
    const shore = edges(piece).filter(([a, b]) =>
      edges(outline).some(
        ([from, to]) =>
          distancePointToSegment(a, { a: from, b: to }) < ON_SHORE &&
          distancePointToSegment(b, { a: from, b: to }) < ON_SHORE,
      ),
    );
    return { tunnel, box, outline: piece, shore };
  });
}

/**
 * `outline` clipped to `box` (Sutherland–Hodgman): what of it is inside,
 * empty when nothing is. A concave outline may come back with an edge run
 * back along the box's side, which has no area and so fills nothing.
 */
export function clipToBox(outline: readonly Vec2[], box: Box): readonly Vec2[] {
  const sides: readonly { readonly inside: (p: Vec2) => boolean; readonly cut: Cut }[] = [
    { inside: (p) => p.x >= box.left, cut: (a, b) => alongX(a, b, box.left) },
    { inside: (p) => p.x <= box.right, cut: (a, b) => alongX(a, b, box.right) },
    { inside: (p) => p.y >= box.top, cut: (a, b) => alongY(a, b, box.top) },
    { inside: (p) => p.y <= box.bottom, cut: (a, b) => alongY(a, b, box.bottom) },
  ];
  return sides.reduce<readonly Vec2[]>((points, { inside, cut }) => {
    const kept: Vec2[] = [];
    points.forEach((point, at) => {
      const previous = points[(at + points.length - 1) % points.length] ?? point;
      if (inside(point)) {
        if (!inside(previous)) {
          kept.push(cut(previous, point));
        }
        kept.push(point);
      } else if (inside(previous)) {
        kept.push(cut(previous, point));
      }
    });
    return kept;
  }, outline);
}

type Cut = (a: Vec2, b: Vec2) => Vec2;

/**
 * `painter` painting only what of each stroke and fill falls in `box`
 * (#3352): a fill cut by `clipToBox`, a line where it leaves the box. Art
 * drawn once through the painter of each box that tiles the plane is the
 * art drawn whole, split between them with no seam.
 */
export function clippedPainter(painter: StructurePainter, box: Box): StructurePainter {
  const fill = (corners: readonly Vec2[]): void => {
    const [first, ...rest] = clipToBox(corners, box);
    if (first === undefined) {
      return;
    }
    for (let at = 0; at + 1 < rest.length; at += 1) {
      const [b, c] = [rest[at], rest[at + 1]];
      if (b !== undefined && c !== undefined) {
        painter.fillTriangle(first.x, first.y, b.x, b.y, c.x, c.y);
      }
    }
  };
  return {
    fillStyle: (colour, alpha) => {
      painter.fillStyle(colour, alpha);
    },
    lineStyle: (width, colour, alpha) => {
      painter.lineStyle(width, colour, alpha);
    },
    fillRect: (x, y, width, height) => {
      if (x >= box.left && x + width <= box.right && y >= box.top && y + height <= box.bottom) {
        painter.fillRect(x, y, width, height);
        return;
      }
      fill([
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ]);
    },
    fillTriangle: (ax, ay, bx, by, cx, cy) => {
      fill([
        { x: ax, y: ay },
        { x: bx, y: by },
        { x: cx, y: cy },
      ]);
    },
    lineBetween: (ax, ay, bx, by) => {
      const share = segmentInBox({ x: ax, y: ay }, { x: bx, y: by }, box);
      if (share === undefined) {
        return;
      }
      const [enter, leave] = share;
      painter.lineBetween(
        ax + (bx - ax) * enter,
        ay + (by - ay) * enter,
        ax + (bx - ax) * leave,
        ay + (by - ay) * leave,
      );
    },
  };
}

function alongX(a: Vec2, b: Vec2, x: number): Vec2 {
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) };
}

function alongY(a: Vec2, b: Vec2, y: number): Vec2 {
  return { x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y };
}

/** The area `outline` encloses, by the shoelace formula. */
export function outlineArea(outline: readonly Vec2[]): number {
  let twice = 0;
  outline.forEach((corner, at) => {
    const next = outline[(at + 1) % outline.length] ?? corner;
    twice += corner.x * next.y - next.x * corner.y;
  });
  return Math.abs(twice) / 2;
}

function boundsOf(outline: readonly Vec2[]): Box {
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function edges(outline: readonly Vec2[]): readonly (readonly [Vec2, Vec2])[] {
  return outline.map(
    (corner, at) => [corner, outline[(at + 1) % outline.length] ?? corner] as const,
  );
}
