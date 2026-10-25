/**
 * The weapon marks of docs/art/art-direction.md "Player mark" (#356, #418)
 * as plain data in the body's local frame: +x is the facing, +y the right
 * hand, r = 14. One entry per weapon.
 *
 * No imports and only erasable TypeScript, so `scripts/assets/*.mjs` can
 * import this file as it is and draw the reference sheet and the icons from
 * the very shapes the arena draws.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type WeaponMarkId =
  | "unarmed"
  | "sword"
  | "axe"
  | "spear"
  | "wand"
  | "hammer"
  | "scythe"
  | "daggers"
  | "staff"
  | "shortbow"
  | "longbow"
  | "flatbow"
  | "recurve-bow"
  | "hornbow";

export interface WeaponMarkGeometry {
  /** Open polylines: 4 px `edge` casing under a 2 px `ink` core. */
  readonly strokes: readonly (readonly Point[])[];
  /** Closed polygons: cased outline, then an `ink` fill. */
  readonly fills: readonly (readonly Point[])[];
  /** Bow strings: 3 px `edge` casing under a 1 px `ink` core. */
  readonly strings: readonly (readonly Point[])[];
}

/** The body radius the table is drawn for. */
export const WEAPON_MARK_RADIUS = 14;

const p = (x: number, y: number): Point => ({ x, y });

/** `n` segments of the quadratic from `a` through control `c` to `b`, both ends included. */
function quad(a: Point, c: Point, b: Point, n: number, from = 0): Point[] {
  const out: Point[] = [];
  for (let k = from; k <= n; k += 1) {
    const t = k / n;
    const u = 1 - t;
    out.push(
      p(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y),
    );
  }
  return out;
}

function ngon(cx: number, cy: number, radius: number, sides: number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < sides; k += 1) {
    const a = (k * 2 * Math.PI) / sides;
    out.push(p(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
  }
  return out;
}

/** A four-point star: eight vertices from −90°, alternating outer and inner radius. */
function star(cx: number, cy: number, outer: number, inner: number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < 8; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 4;
    const d = k % 2 === 0 ? outer : inner;
    out.push(p(cx + Math.cos(a) * d, cy + Math.sin(a) * d));
  }
  return out;
}

/** A bow limb from y = −half … half, step 1, as x(y). */
function limb(half: number, x: (y: number) => number): Point[] {
  const out: Point[] = [];
  for (let y = -half; y <= half; y += 1) {
    out.push(p(x(y), y));
  }
  return out;
}

/** The slight draw V from one limb tip to the other. */
function stringOf(limbPoints: readonly Point[]): Point[] {
  const first = limbPoints[0];
  const last = limbPoints[limbPoints.length - 1];
  if (first === undefined || last === undefined) {
    return [];
  }
  return [first, p(first.x - 1.5, 0), last];
}

function bow(limbPoints: Point[]): WeaponMarkGeometry {
  return { strokes: [limbPoints], fills: [], strings: [stringOf(limbPoints)] };
}

const dagger = (side: 1 | -1): Point[][] => {
  const blade = [p(5, 9 * side), p(15, 9 * side)];
  const guard = [p(7.5, 7.2 * side), p(7.5, 10.8 * side)];
  return [blade, guard];
};

const recurveHalf = limb(7, (y) => 16.5 - 4.5 * (y / 7) ** 2);
const hornbowHalf = limb(
  9,
  (y) => 15.2 + 2.3 * Math.sin((Math.PI * Math.abs(y)) / 9) - 2.6 * (y / 9) ** 2,
);

export const WEAPON_MARK_GEOMETRY: Readonly<Record<WeaponMarkId, WeaponMarkGeometry>> = {
  unarmed: {
    strokes: [],
    fills: [ngon(11.5, -7.5, 2.4, 12), ngon(11.5, 7.5, 2.4, 12)],
    strings: [],
  },
  sword: {
    strokes: [
      [p(1, 9), p(16, 9)],
      [p(5, 6), p(5, 12)],
    ],
    fills: [],
    strings: [],
  },
  axe: {
    strokes: [[p(1, 9), p(15, 9)]],
    fills: [[p(10.5, 9), p(15, 9), p(17, 5.5), p(16.6, 2.8), p(13, 5.2)]],
    strings: [],
  },
  spear: {
    strokes: [[p(-15, 7.5), p(12.5, 7.5)]],
    fills: [[p(11.5, 7.5), p(13.6, 5.6), p(17.9, 7.5), p(13.6, 9.4)]],
    strings: [],
  },
  wand: {
    strokes: [[p(4, 9), p(12.5, 9)]],
    fills: [star(14.3, 8.2, 3, 1.05)],
    strings: [],
  },
  hammer: {
    strokes: [[p(-8, 6.8), p(11.5, 6.8)]],
    fills: [[p(11.5, 2.4), p(16, 2.4), p(16, 11), p(11.5, 11)]],
    strings: [],
  },
  scythe: {
    strokes: [[p(-14, 9), p(12.5, 9)]],
    fills: [
      [
        ...quad(p(12.5, 9), p(22, 4), p(11, -6.5), 10),
        ...quad(p(11, -6.5), p(16, 2), p(12.5, 6.8), 8, 1),
      ],
    ],
    strings: [],
  },
  daggers: {
    strokes: [...dagger(1), ...dagger(-1)],
    fills: [],
    strings: [],
  },
  staff: {
    strokes: [[p(-12, 10.2), p(13.2, 5.8)]],
    fills: [ngon(15.2, 5.4, 2.9, 12)],
    strings: [],
  },
  shortbow: bow(limb(6, (y) => 17.5 - 5.5 * (y / 6) ** 2)),
  longbow: bow(limb(11, (y) => 17 - 5.5 * (y / 11) ** 2)),
  flatbow: bow([p(12, -9.5), p(15.5, -3), p(16.5, -1.2), p(16.5, 1.2), p(15.5, 3), p(12, 9.5)]),
  // Tips flick forward past the curve.
  "recurve-bow": bow([p(13.8, -9.6), p(12.4, -8.2), ...recurveHalf, p(12.4, 8.2), p(13.8, 9.6)]),
  // A dip at the grip between two humps, then the tips.
  hornbow: bow([p(13.4, -10), ...hornbowHalf, p(13.4, 10)]),
};
