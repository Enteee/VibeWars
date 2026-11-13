import { findStatusDefinition } from "@vibewars/game-core";

/**
 * The marks a body wears while a skill of a type is on it (#1117, #3226,
 * docs/art/art-direction.md "Player mark", docs/art/3191-skill-visuals.md):
 * a flat steel `stance` band hugging its feet, a solid brass `enchantment`
 * ring outside that with slow motes rising off it, and a broken violet
 * hexagon, the `hex` halo, floating over its health bar. One mark per
 * category however many statuses of it, the icon row says which. Under
 * reduced motion the motes, the streaks and the halo's turn stop; the
 * band, the ring and the halo stay: a mark is a state, not an event.
 *
 * No Phaser here, so the geometry can be tested in Node. What moves is
 * written into a caller's scratch object, so a frame allocates nothing.
 */

export interface BodyFlags {
  readonly enchanted: boolean;
  readonly stanced: boolean;
  readonly hexed: boolean;
}

/** Which marks `statuses` call for. A status id the client's catalogue does not know is ignored. */
export function bodyFlags(statuses: readonly string[]): BodyFlags {
  let enchanted = false;
  let stanced = false;
  let hexed = false;
  for (const id of statuses) {
    const category = findStatusDefinition(id)?.category;
    enchanted ||= category === "enchantment";
    stanced ||= category === "stance";
    hexed ||= category === "hex";
  }
  return { enchanted, stanced, hexed };
}

/** A stretch of a ring, radians, `atan2` convention, clockwise on screen. */
export interface RingArc {
  readonly from: number;
  readonly to: number;
}

export interface BodyRing {
  readonly kind: "stance" | "enchantment" | "invulnerable";
  /** World units from the body's centre to the stroke's middle. */
  readonly radius: number;
  readonly width: number;
  readonly colour: number;
  readonly alpha: number;
  /** One full arc when solid. */
  readonly arcs: readonly RingArc[];
}

/** The stance band's radius past the body's edge: its stroke spans r + 0.5 … r + 2. */
export const STANCE_BAND_OFFSET = 1.25;
/** The enchantment ring's: its stroke spans r + 2.5 … r + 4, outside the band. */
export const ENCHANT_RING_OFFSET = 3.25;
/** The invulnerable shimmer's: its stroke spans r + 4.25 … r + 5.75, inside r + 6 (the status row, the epic's cap). */
export const INVULNERABLE_RING_OFFSET = 5;
export const BODY_RING_WIDTH = 1.5;
/** The `enchantment` brass and the `stance` steel of the skill visuals (#3191). */
export const ENCHANTMENT_COLOUR = 0xe8c27a;
export const STANCE_COLOUR = 0xdfe7f1;
/** The band is flat steel, a shade under the ring, so the brass reads first. */
const STANCE_ALPHA = 0.85;

const SOLID: readonly RingArc[] = [{ from: 0, to: 2 * Math.PI }];

interface RingsByFlags {
  readonly enchanted: readonly BodyRing[];
  readonly stanced: readonly BodyRing[];
  readonly both: readonly BodyRing[];
}

const NONE: readonly BodyRing[] = [];

/** Every body of a radius wears the same rings, so they are built once per radius, not per frame. */
const RINGS_BY_RADIUS = new Map<number, RingsByFlags>();

function ringsFor(radius: number): RingsByFlags {
  const known = RINGS_BY_RADIUS.get(radius);
  if (known !== undefined) {
    return known;
  }
  const band: BodyRing = {
    kind: "stance",
    radius: radius + STANCE_BAND_OFFSET,
    width: BODY_RING_WIDTH,
    colour: STANCE_COLOUR,
    alpha: STANCE_ALPHA,
    arcs: SOLID,
  };
  const enchantment: BodyRing = {
    kind: "enchantment",
    radius: radius + ENCHANT_RING_OFFSET,
    width: BODY_RING_WIDTH,
    colour: ENCHANTMENT_COLOUR,
    alpha: 1,
    arcs: SOLID,
  };
  const rings = { enchanted: [enchantment], stanced: [band], both: [band, enchantment] };
  RINGS_BY_RADIUS.set(radius, rings);
  return rings;
}

/** The rings at the feet of a body of `radius`, the band first, inside, the ring second; none for neither. */
export function bodyRings(radius: number, flags: BodyFlags): readonly BodyRing[] {
  if (!flags.enchanted && !flags.stanced) {
    return NONE;
  }
  const rings = ringsFor(radius);
  return flags.enchanted ? (flags.stanced ? rings.both : rings.enchanted) : rings.stanced;
}

/** The motes off an enchantment ring, each rising from its own point on it. */
export const ENCHANT_MOTES = 3;
/** One mote's rise, from the ring to gone, in seconds; the motes are staggered over it. */
export const MOTE_RISE_SECONDS = 2.4;
/** How far a mote rises, and its radius, as fractions of the body's radius. */
const MOTE_RISE = 0.6;
const MOTE_SIZE = 0.09;
/** A mote's alpha as it leaves the ring; it fades to nothing at the top. */
const MOTE_ALPHA = 0.8;

export interface Mote {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/**
 * Mote `index` of a body of `radius` at `nowSeconds`, into `out`, from the
 * body's centre: it leaves the ring at a point of its own and rises,
 * fading. `phase` (0 … 1) keeps two bodies' motes out of step. Under
 * reduced motion there are none: `false`, and `out` is left as it was.
 */
export function enchantMote(
  radius: number,
  index: number,
  nowSeconds: number,
  phase: number,
  reducedMotion: boolean,
  out: Mote,
): boolean {
  if (reducedMotion) {
    return false;
  }
  const along = (nowSeconds / MOTE_RISE_SECONDS + phase + index / ENCHANT_MOTES) % 1;
  const angle = (index * 2 * Math.PI) / ENCHANT_MOTES + phase * 2 * Math.PI;
  const ring = radius + ENCHANT_RING_OFFSET;
  out.x = Math.cos(angle) * ring;
  out.y = Math.sin(angle) * ring - along * MOTE_RISE * radius;
  out.radius = MOTE_SIZE * radius;
  out.alpha = MOTE_ALPHA * (1 - along);
  return true;
}

/** The speed streaks behind a moving body in a stance. */
export const STANCE_STREAKS = 3;
/** The longest streak, the middle one, as a fraction of the body's radius; the others are shorter. */
const STREAK_LENGTH = 1.2;
/** The streaks' alpha, middle first, as the study's .7 / .5 / .3. */
const STREAK_ALPHA = [0.7, 0.5, 0.3] as const;
export const STREAK_WIDTH = 1.5;

export interface Streak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

/**
 * Streak `index` behind a body of `radius` moving along the unit vector
 * (`ux`, `uy`), into `out`, from the body's centre: it starts past the
 * band at the body's back and trails away, the middle one longest, the
 * side ones a third of the radius to either side. Under reduced motion
 * there are none: `false`, and `out` is left as it was.
 */
export function stanceStreak(
  radius: number,
  index: number,
  ux: number,
  uy: number,
  reducedMotion: boolean,
  out: Streak,
): boolean {
  if (reducedMotion) {
    return false;
  }
  // 0 is the middle, 1 left of it, 2 right.
  const side = index === 0 ? 0 : index === 1 ? -1 : 1;
  const start = radius + ENCHANT_RING_OFFSET + 1 - Math.abs(side) * radius * 0.3;
  const length = radius * STREAK_LENGTH * (1 - Math.abs(side) * 0.3);
  const across = side * radius * 0.45;
  // The perpendicular to the motion, clockwise on screen.
  const px = -uy;
  const py = ux;
  out.x1 = -ux * start + px * across;
  out.y1 = -uy * start + py * across;
  out.x2 = out.x1 - ux * length;
  out.y2 = out.y1 - uy * length;
  out.alpha = STREAK_ALPHA[index] ?? 0;
  return true;
}

/** The hex halo's sides, of which `HEX_HALO_BROKEN` are missing, side by side. */
export const HEX_HALO_SIDES = 6;
export const HEX_HALO_BROKEN = 2;
/** The violet of magic areas, wells and hexes (#3191). */
export const HEX_COLOUR = 0xa77bff;
export const HEX_HALO_WIDTH = 2;
/** One full turn of the halo, in seconds. */
export const HEX_HALO_TURN_SECONDS = 8;
/** The halo's half width and half height as fractions of the body's radius: a hexagon seen from above at a slant. */
const HALO_WIDE = 1;
const HALO_TALL = 0.3;
/**
 * The halo's lowest point above the body's centre, past its radius: one
 * unit over the health bar's top (r + 12), in the cast bar's slot, which
 * draws over it.
 */
export const HEX_HALO_FLOOR = 13;

export interface HexHalo {
  /** Its centre above the body's centre. */
  readonly rise: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const HALO_BY_RADIUS = new Map<number, HexHalo>();

/** The halo over a body of `radius`, the same for both teams; built once per radius. */
export function hexHalo(radius: number): HexHalo {
  const known = HALO_BY_RADIUS.get(radius);
  if (known !== undefined) {
    return known;
  }
  const halfHeight = HALO_TALL * radius;
  // A hexagon's flat top and bottom sit sin 60° of its half height from its centre.
  const halo = {
    rise: radius + HEX_HALO_FLOOR + halfHeight * Math.sin(Math.PI / 3),
    halfWidth: HALO_WIDE * radius,
    halfHeight,
  };
  HALO_BY_RADIUS.set(radius, halo);
  return halo;
}

/** The halo's turn at `nowSeconds`, radians; it holds at 0 under reduced motion. */
export function hexHaloTurn(nowSeconds: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ((nowSeconds / HEX_HALO_TURN_SECONDS) % 1) * 2 * Math.PI;
}

/** Corner `corner` of `halo` turned by `turn`, into `out`, from the body's centre. */
export function hexHaloCorner(
  halo: HexHalo,
  turn: number,
  corner: number,
  out: { x: number; y: number },
): void {
  const angle = (corner * 2 * Math.PI) / HEX_HALO_SIDES + turn;
  out.x = Math.cos(angle) * halo.halfWidth;
  out.y = -halo.rise + Math.sin(angle) * halo.halfHeight;
}

/** The `invulnerable` palette colour: pale gold, never the `target` ring's yellow. */
const INVULNERABLE_COLOUR = 0xf5e6b8;
/** One shimmer, dim to bright and back, in seconds. */
export const INVULNERABLE_PULSE_SECONDS = 0.8;
/** The shimmer's dimmest alpha; its brightest is 1. */
export const INVULNERABLE_MIN_ALPHA = 0.35;

/**
 * The shimmer of a body a shrine raised, while it is invulnerable (#1208,
 * #1233): a solid `invulnerable` ring outside the enchantment ring, at
 * its own place (#3226). Built once per radius, as the other rings.
 */
const SHIMMER_BY_RADIUS = new Map<number, BodyRing>();

export function invulnerableRing(radius: number): BodyRing {
  const known = SHIMMER_BY_RADIUS.get(radius);
  if (known !== undefined) {
    return known;
  }
  const ring: BodyRing = {
    kind: "invulnerable",
    radius: radius + INVULNERABLE_RING_OFFSET,
    width: BODY_RING_WIDTH,
    colour: INVULNERABLE_COLOUR,
    alpha: 1,
    arcs: SOLID,
  };
  SHIMMER_BY_RADIUS.set(radius, ring);
  return ring;
}

/**
 * The shimmer's alpha at `nowSeconds`: a cosine between
 * `INVULNERABLE_MIN_ALPHA` and 1. Under reduced motion it holds at 1:
 * the ring still says it, without the pulse.
 */
export function invulnerableAlpha(nowSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 1;
  }
  const phase = (nowSeconds / INVULNERABLE_PULSE_SECONDS) * 2 * Math.PI;
  return INVULNERABLE_MIN_ALPHA + ((1 - INVULNERABLE_MIN_ALPHA) * (1 + Math.cos(phase))) / 2;
}
