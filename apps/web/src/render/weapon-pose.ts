/**
 * Weapon motion (#536, #558): every auto-attack plays wind-up → strike →
 * hold → recover on the attacker's weapon mark. A pose rotates and
 * translates the shipped geometry about a pivot, scales an accent, and
 * flexes a bow; it adds no shapes but a nocked arrow while a bow is drawn.
 *
 * Coordinates are the mark's local frame, as in `weapon-mark-geometry.ts`:
 * +x is the facing, +y the right hand, r = 14, and +rot turns the tip
 * toward the right hand (back and out). The table is the prototype's
 * (#536 §2, `weapon-attack-timing.json`).
 *
 * No Phaser here, so every pose can be tested in Node.
 */

import {
  WEAPON_MARK_GEOMETRY,
  type Point,
  type WeaponMarkGeometry,
  type WeaponMarkId,
} from "./weapon-mark-geometry.js";

/** A posed mark: the geometry's three kinds of line, and how opaque it is. */
export interface WeaponMarkLayout extends WeaponMarkGeometry {
  /** 0 while a thrown spear is away, fading back in to 1 (#536). */
  readonly alpha: number;
}

/** A wind-up or a strike: the part of a swing that comes before its hit. */
export interface SwingClip {
  readonly phase: "wind-up" | "strike";
  readonly progress: number;
}

/**
 * Where the weapon is in a swing. `progress` runs 0 … 1 through the phase;
 * `sinceHit` is seconds since the hit, for the hammer's shake and the bow
 * string's vibration.
 */
export type AttackClip =
  | { readonly phase: "rest" }
  | SwingClip
  | {
      readonly phase: "hold" | "recover";
      readonly progress: number;
      readonly sinceHit: number;
    }
  /** Easing back to rest over the recover time from a swing that never hit. */
  | { readonly phase: "settle"; readonly progress: number; readonly from: SwingClip };

export const REST_CLIP: AttackClip = { phase: "rest" };

/** A pose's parameters; `draw` is how far a bow is drawn, 0 … 1. */
interface Pose {
  readonly rot: number;
  readonly dx: number;
  readonly dy: number;
  /** The accent's scale: the wand's star, the staff's orb, the whole hammer. */
  readonly s: number;
  readonly draw: number;
}

const REST: Pose = { rot: 0, dx: 0, dy: 0, s: 1, draw: 0 };

type Motion = "one-piece" | "hands" | "accent" | "thrown" | "bow";

export interface WeaponMotion {
  /** Seconds: the wind-up, the strike that ends on the hit, a hold, the recovery. */
  readonly windUp: number;
  readonly strike: number;
  readonly hold: number;
  readonly recover: number;
  readonly motion: Motion;
  readonly pivot: Point;
  readonly wind: Pose;
  readonly strikePose: Pose;
  /** A bow's draw at full wind-up, in units the nock moves back. */
  readonly drawDepth: number;
  /** The accent's centre, which it scales about (`accent` motion). */
  readonly accentCentre: Point;
  /** The hammer shakes on impact. */
  readonly shake: boolean;
}

const p = (x: number, y: number): Point => ({ x, y });
const pose = (fields: Partial<Pose>): Pose => ({ ...REST, ...fields });

function motion(
  timing: readonly [windUp: number, strike: number, hold: number, recover: number],
  fields: Partial<Omit<WeaponMotion, "windUp" | "strike" | "hold" | "recover">>,
): WeaponMotion {
  const [windUp, strike, hold, recover] = timing;
  return {
    windUp,
    strike,
    hold,
    recover,
    motion: "one-piece",
    pivot: p(0, 0),
    wind: REST,
    strikePose: REST,
    drawDepth: 0,
    accentCentre: p(0, 0),
    shake: false,
    ...fields,
  };
}

const bow = (timing: readonly [number, number, number, number], drawDepth: number) =>
  motion(timing, { motion: "bow", wind: pose({ draw: 1 }), drawDepth });

/** The timing and poses of every weapon's attack (#536 §2). */
export const WEAPON_MOTION: Readonly<Record<WeaponMarkId, WeaponMotion>> = {
  // Alternating jabs: one fist pulls back, then punches in toward the centre line.
  unarmed: motion([0.22, 0.07, 0.03, 0.25], {
    motion: "hands",
    pivot: p(11.5, 7.5),
    wind: pose({ dx: -2.5, dy: 0.5 }),
    strikePose: pose({ dx: 4, dy: -2.5 }),
  }),
  // A cut: the blade cocks back and out, then sweeps across the front to the left.
  sword: motion([0.3, 0.08, 0.04, 0.3], {
    pivot: p(2, 9),
    wind: pose({ rot: 30, dx: -4 }),
    strikePose: pose({ rot: -55, dx: 1, dy: -1 }),
  }),
  // Like the sword but heavier: a deeper cock, and a beat on impact.
  axe: motion([0.34, 0.07, 0.07, 0.32], {
    pivot: p(1, 9),
    wind: pose({ rot: 35, dx: -6 }),
    strikePose: pose({ rot: -45, dx: 1 }),
  }),
  // Quick stabs, alternating hands.
  daggers: motion([0.16, 0.06, 0.02, 0.16], {
    motion: "hands",
    wind: pose({ dx: -3 }),
    strikePose: pose({ dx: 3, dy: -1.5 }),
  }),
  // A slow lift, drawn back and foreshortened as if raised, then a slam that shakes.
  hammer: motion([0.55, 0.1, 0.14, 0.45], {
    pivot: p(-2, 6.8),
    wind: pose({ rot: 12, dx: -8, s: 0.88 }),
    strikePose: pose({ rot: -10, dx: 1 }),
    shake: true,
  }),
  // A wide reap about the body's centre, 110° from back-right to front-left.
  scythe: motion([0.45, 0.14, 0.04, 0.45], {
    wind: pose({ rot: 40 }),
    strikePose: pose({ rot: -70 }),
  }),
  // Drawn back, a thrust that turns in, and it lets go; a new one slides back in.
  spear: motion([0.38, 0.06, 0.02, 0.5], {
    motion: "thrown",
    pivot: p(-1, 7.5),
    wind: pose({ rot: 4, dx: -3 }),
    strikePose: pose({ rot: -8, dx: 1 }),
  }),
  // A flick of the wrist: the spark dims as it cocks, then flares as the bolt leaves.
  wand: motion([0.26, 0.06, 0.04, 0.32], {
    motion: "accent",
    pivot: p(4, 9),
    wind: pose({ rot: 25, dx: -2, s: 0.8 }),
    strikePose: pose({ rot: -18, dx: 0.5, s: 1.4 }),
    accentCentre: p(14.3, 8.2),
  }),
  // The pole draws back while the orb swells, then a short push releases the bolt.
  staff: motion([0.42, 0.08, 0.06, 0.4], {
    motion: "accent",
    pivot: p(0, 8.1),
    wind: pose({ rot: 8, dx: -3, s: 1.25 }),
    strikePose: pose({ rot: -9, dx: 0.5, s: 1.25 }),
    accentCentre: p(15.2, 5.4),
  }),
  shortbow: bow([0.55, 0.04, 0, 0.3], 4.5),
  flatbow: bow([0.62, 0.04, 0, 0.3], 5.5),
  longbow: bow([0.85, 0.04, 0, 0.32], 7),
  "recurve-bow": bow([0.72, 0.04, 0, 0.3], 6),
  hornbow: bow([0.9, 0.04, 0, 0.32], 6),
};

/** A bow holds at full draw for the last 15 % of its wind-up. */
const BOW_ANCHOR = 0.85;
/** The released string's damped cosine. */
const STRING_AMPLITUDE = 1.6;
const STRING_DECAY = 14;
const STRING_RADIANS_PER_SECOND = 55;
/** The hammer's impact shake: ±0.7 units, every 35 ms. */
const SHAKE_UNITS = 0.7;
const SHAKE_SECONDS = 0.035;
/** A thrown spear comes back halfway through recovery, from 3 units behind. */
const SPEAR_RETURN = 0.45;
const SPEAR_RETURN_FROM = -3;

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  rot: lerp(a.rot, b.rot, t),
  dx: lerp(a.dx, b.dx, t),
  dy: lerp(a.dy, b.dy, t),
  s: lerp(a.s, b.s, t),
  draw: lerp(a.draw, b.draw, t),
});

function poseOf(m: WeaponMotion, clip: AttackClip): Pose {
  switch (clip.phase) {
    case "rest":
      return REST;
    case "wind-up":
      return lerpPose(
        REST,
        m.wind,
        easeInOut(m.motion === "bow" ? Math.min(1, clip.progress / BOW_ANCHOR) : clip.progress),
      );
    case "strike":
      return lerpPose(m.wind, m.strikePose, easeOutCubic(clip.progress));
    case "hold":
      return m.strikePose;
    case "recover":
      return lerpPose(m.strikePose, REST, easeInOut(clip.progress));
    case "settle":
      return lerpPose(poseOf(m, clip.from), REST, easeInOut(clip.progress));
  }
}

/** `line` turned by `q.rot` degrees and scaled by `scale` about `pivot`, then moved by (dx, dy). */
function transform(line: readonly Point[], pivot: Point, q: Pose, scale = 1): Point[] {
  const radians = (q.rot * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return line.map(({ x, y }) => {
    const lx = (x - pivot.x) * scale;
    const ly = (y - pivot.y) * scale;
    return p(pivot.x + lx * cos - ly * sin + q.dx, pivot.y + lx * sin + ly * cos + q.dy);
  });
}

/** Which hand a part is in: the right is +y. */
const isRight = (line: readonly Point[]): boolean =>
  line.reduce((sum, point) => sum + point.y, 0) > 0;

function handsPose(
  m: WeaponMotion,
  geometry: WeaponMarkGeometry,
  q: Pose,
  hit: number,
): WeaponMarkLayout {
  // Each hit is the other hand's: even hits the right, odd the left.
  const rightActive = hit % 2 === 0;
  const place = (line: readonly Point[]): Point[] => {
    const right = isRight(line);
    if (right !== rightActive) {
      return [...line];
    }
    // The left hand mirrors the right across the facing.
    return right
      ? transform(line, m.pivot, q)
      : transform(line, p(m.pivot.x, -m.pivot.y), { ...q, dy: -q.dy });
  };
  return {
    strokes: geometry.strokes.map(place),
    fills: geometry.fills.map(place),
    strings: [],
    alpha: 1,
  };
}

function accentPose(m: WeaponMotion, geometry: WeaponMarkGeometry, q: Pose): WeaponMarkLayout {
  const [centre] = transform([m.accentCentre], m.pivot, q);
  const c = centre ?? m.accentCentre;
  return {
    strokes: geometry.strokes.map((line) => transform(line, m.pivot, q)),
    // The accent turns and scales about its own centre, wherever the body took it.
    fills: geometry.fills.map((shape) =>
      transform(
        shape,
        m.accentCentre,
        { ...q, dx: c.x - m.accentCentre.x, dy: c.y - m.accentCentre.y },
        q.s,
      ),
    ),
    strings: [],
    alpha: 1,
  };
}

function bowPose(
  m: WeaponMotion,
  geometry: WeaponMarkGeometry,
  q: Pose,
  clip: AttackClip,
): WeaponMarkLayout {
  const [base = []] = geometry.strokes;
  const half = Math.max(...base.map((point) => Math.abs(point.y)));
  // The limbs bend in toward the tips and close up a little under draw.
  const limb = base.map(({ x, y }) => {
    const weight = (Math.abs(y) / half) ** 2;
    return p(x - 1.4 * q.draw * weight, y * (1 - 0.07 * q.draw));
  });
  const first = limb[0];
  const last = limb[limb.length - 1];
  if (first === undefined || last === undefined) {
    return { ...geometry, alpha: 1 };
  }
  const vibration =
    clip.phase === "hold" || clip.phase === "recover"
      ? STRING_AMPLITUDE *
        Math.exp(-STRING_DECAY * clip.sinceHit) *
        Math.cos(STRING_RADIANS_PER_SECOND * clip.sinceHit)
      : 0;
  const nock = p(first.x - 1.5 - m.drawDepth * q.draw + vibration, 0);
  const strokes: Point[][] = [limb];
  const fills: Point[][] = [];
  const nocked =
    clip.phase === "wind-up" || (clip.phase === "settle" && clip.from.phase === "wind-up");
  const apex = Math.max(...limb.map((point) => point.x));
  const head = Math.min(nock.x + 13, apex + 1.2);
  if (nocked && head - nock.x > 4) {
    strokes.push([nock, p(head - 2.2, 0)]);
    fills.push([p(head, 0), p(head - 3, -1.5), p(head - 3, 1.5)]);
  }
  return { strokes, fills, strings: [[first, nock, last]], alpha: 1 };
}

/**
 * The mark of `weaponId` at `clip`, in the local frame. `hit` counts the
 * hits so far, so two-handed fists and daggers alternate hands. At rest it
 * is the static `WEAPON_MARK_GEOMETRY`.
 */
export function weaponPose(
  weaponId: WeaponMarkId,
  clip: AttackClip,
  hit: number,
): WeaponMarkLayout {
  const m = WEAPON_MOTION[weaponId];
  const geometry = WEAPON_MARK_GEOMETRY[weaponId];
  const q = poseOf(m, clip);
  switch (m.motion) {
    case "hands":
      return handsPose(m, geometry, q, hit);
    case "accent":
      return accentPose(m, geometry, q);
    case "bow":
      return bowPose(m, geometry, q, clip);
    case "thrown": {
      // Gone from the release until halfway through recovery, then a new
      // one slides in from behind and fades in.
      if (clip.phase === "hold" || (clip.phase === "recover" && clip.progress < SPEAR_RETURN)) {
        return { ...geometry, alpha: 0 };
      }
      if (clip.phase === "recover") {
        const t = easeOutCubic((clip.progress - SPEAR_RETURN) / (1 - SPEAR_RETURN));
        const back = pose({ dx: SPEAR_RETURN_FROM * (1 - t) });
        return {
          strokes: geometry.strokes.map((line) => transform(line, m.pivot, back)),
          fills: geometry.fills.map((shape) => transform(shape, m.pivot, back)),
          strings: [],
          alpha: t,
        };
      }
      return onePiece(m, geometry, q);
    }
    case "one-piece": {
      const shaken =
        m.shake && clip.phase === "hold"
          ? {
              ...q,
              dy:
                q.dy +
                (Math.floor(clip.sinceHit / SHAKE_SECONDS) % 2 === 1 ? SHAKE_UNITS : -SHAKE_UNITS),
            }
          : q;
      return onePiece(m, geometry, shaken);
    }
  }
}

/** One rigid piece about its pivot; the hammer, whose `s` is not 1, foreshortens whole. */
function onePiece(m: WeaponMotion, geometry: WeaponMarkGeometry, q: Pose): WeaponMarkLayout {
  return {
    strokes: geometry.strokes.map((line) => transform(line, m.pivot, q, q.s)),
    fills: geometry.fills.map((shape) => transform(shape, m.pivot, q, q.s)),
    strings: geometry.strings.map((line) => transform(line, m.pivot, q, q.s)),
    alpha: 1,
  };
}
