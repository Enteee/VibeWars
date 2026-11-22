import {
  Vec,
  distancePointToSegment,
  pointInPolygon,
  segmentsIntersect,
  type Vec2,
} from "@vibewars/game-core";

/**
 * One pick path (#3634): what a click or hover finds is what the arena
 * drew there in the last frame. Each draw records the clickable it drew,
 * from the same offset it drew with, so a lever, body, flag, stand or
 * wall on a deck, mid-climb or in a tunnel is picked where it shows. Pure,
 * so the rules are testable without Phaser.
 */

export type ClickableKind = "body" | "switch" | "flag" | "stand" | "breakable";

/** Where a clickable is hit, in world units, as drawn. */
export type ClickableHit =
  | { readonly circle: { readonly x: number; readonly y: number; readonly r: number } }
  | { readonly polygon: readonly Vec2[] }
  /**
   * A wall standing on a footprint (#3031): `outline` lifted by `low` is
   * its foot, by `high` its top, and its front face is everything between.
   */
  | {
      readonly column: {
        readonly outline: readonly Vec2[];
        readonly low: number;
        readonly high: number;
      };
    };

export interface DrawnClickable {
  readonly kind: ClickableKind;
  /** A session id, lever id, flag id, the stand's id or a wall's target id. */
  readonly id: string;
  readonly hit: ClickableHit;
  /** The draw-order key it was drawn with this frame: higher is in front. */
  readonly depth: number;
}

/** On equal depth, today's order: a body, then a flag, the stand, a switch, a wall. */
const TIE_ORDER: Readonly<Record<ClickableKind, number>> = {
  body: 0,
  flag: 1,
  stand: 2,
  switch: 3,
  breakable: 4,
};

/** Whether `point` is on `hit`. */
function hitContains(hit: ClickableHit, point: Vec2): boolean {
  if ("circle" in hit) {
    const { x, y, r } = hit.circle;
    return Vec.distance({ x, y }, point) <= r;
  }
  if ("polygon" in hit) {
    return pointInPolygon(point, hit.polygon);
  }
  // What is drawn at `point` is the footprint lifted by low..high: the
  // footprint points straight below it, down that far.
  const { outline, low, high } = hit.column;
  const foot = { x: point.x, y: point.y + low };
  const top = { x: point.x, y: point.y + high };
  return (
    pointInPolygon(foot, outline) ||
    pointInPolygon(top, outline) ||
    outline.some((corner, at) =>
      segmentsIntersect(
        { a: foot, b: top },
        { a: corner, b: outline[(at + 1) % outline.length] ?? corner },
      ),
    )
  );
}

/**
 * The clickable drawn on top at `point` among those `accept` takes: the
 * greatest depth, then `TIE_ORDER`, then, for two circles, the nearer
 * centre.
 */
export function pickAt(
  drawn: readonly DrawnClickable[],
  point: Vec2,
  accept: (clickable: DrawnClickable) => boolean = () => true,
): DrawnClickable | undefined {
  let best: DrawnClickable | undefined;
  for (const clickable of drawn) {
    if (!hitContains(clickable.hit, point) || !accept(clickable)) {
      continue;
    }
    if (best === undefined || before(clickable, best, point)) {
      best = clickable;
    }
  }
  return best;
}

/** How far `point` is from `hit`, world units: zero on it. */
function hitDistance(hit: ClickableHit, point: Vec2): number {
  if (hitContains(hit, point)) {
    return 0;
  }
  if ("circle" in hit) {
    const { x, y, r } = hit.circle;
    return Vec.distance({ x, y }, point) - r;
  }
  if ("polygon" in hit) {
    return edgeDistance(hit.polygon, point);
  }
  // Drawn, a wall is its footprint at the foot and at the top, joined at
  // each corner by an upright edge.
  const { outline, low, high } = hit.column;
  const lifted = (by: number): Vec2[] =>
    outline.map((corner) => ({ x: corner.x, y: corner.y - by }));
  const uprights = outline.map((corner) =>
    distancePointToSegment(point, {
      a: { x: corner.x, y: corner.y - low },
      b: { x: corner.x, y: corner.y - high },
    }),
  );
  return Math.min(edgeDistance(lifted(low), point), edgeDistance(lifted(high), point), ...uprights);
}

/** The distance from `point` to the nearest edge of `polygon`. */
function edgeDistance(polygon: readonly Vec2[], point: Vec2): number {
  let least = Number.POSITIVE_INFINITY;
  polygon.forEach((corner, at) => {
    const next = polygon[(at + 1) % polygon.length] ?? corner;
    least = Math.min(least, distancePointToSegment(point, { a: corner, b: next }));
  });
  return least;
}

/**
 * The clickable `accept` takes whose drawn hit is nearest `point`, within
 * `slop` world units (#3781: a fingertip is wider than a cursor); ties
 * as `pickAt`.
 */
export function nearestWithin(
  drawn: readonly DrawnClickable[],
  point: Vec2,
  slop: number,
  accept: (clickable: DrawnClickable) => boolean,
): DrawnClickable | undefined {
  let best: DrawnClickable | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const clickable of drawn) {
    if (!accept(clickable)) {
      continue;
    }
    const distance = hitDistance(clickable.hit, point);
    if (
      distance <= slop &&
      (distance < bestDistance ||
        (distance === bestDistance && best !== undefined && before(clickable, best, point)))
    ) {
      best = clickable;
      bestDistance = distance;
    }
  }
  return best;
}

function before(a: DrawnClickable, b: DrawnClickable, point: Vec2): boolean {
  if (a.depth !== b.depth) {
    return a.depth > b.depth;
  }
  if (a.kind !== b.kind) {
    return TIE_ORDER[a.kind] < TIE_ORDER[b.kind];
  }
  return "circle" in a.hit && "circle" in b.hit
    ? Vec.distance(a.hit.circle, point) < Vec.distance(b.hit.circle, point)
    : false;
}
