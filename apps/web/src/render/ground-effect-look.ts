import { getSkill, type GroundReach, type Vec2 } from "@vibewars/game-core";
import { HEX_COLOUR } from "./body-rings.js";
import { ZONE_EDGE_WIDTH } from "./zone-look.js";

/**
 * How skill-made ground looks (#3283, docs/art/3191-skill-visuals.md):
 * coloured by type, not by team. A violet pool under a violet edge,
 * dashed where it can hurt the viewer's side, solid where it cannot.
 * Phaser-free, so it is tested without a scene.
 */

/** The edge and pool of every skill area: the hex halo's violet. */
export const GROUND_COLOUR = HEX_COLOUR;

/** A side as the viewer reads it: the snapshot's `teamSide`. */
export type GroundSide = "ally" | "enemy" | "third";

/** One dash of a harmful edge, and the gap after it, world units. */
export const GROUND_DASH = 9;
export const GROUND_GAP = 6;

/** How long an area's edge stands wide after it lands, then eases back, seconds. */
export const LANDING_HOLD_SECONDS = 0.3;
export const LANDING_EASE_SECONDS = 0.2;
/** How much wider than its rest the edge lands. */
export const LANDING_WIDTH_SCALE = 2.5;
/** Its last second: the edge thins to 1 line and the pool fades by half. */
export const ENDING_SECONDS = 1;

const HARM_POOL_ALPHA = 0.1;
const HELP_POOL_ALPHA = 0.15;
/** What any spot of the ground may reach however many pools overlap there. */
export const MAX_POOL_ALPHA = 0.25;
const EDGE_ALPHA = 0.9;
const ENDED_EDGE_ALPHA = 0.55;

/** Whether ground of `reach`, owned by `owner`, reaches a body of side `body`. */
export function groundReaches(reach: GroundReach, owner: GroundSide, body: GroundSide): boolean {
  switch (reach) {
    case "all":
      return true;
    case "allies":
      return body === owner;
    case "foes":
      return body !== owner;
  }
}

/**
 * Whether the ground can hurt the viewer's side (Q75 option A): it
 * reaches its owner's foes, or all, and the viewer's side among them;
 * ground that reaches allies alone only ever helps. A watcher has no
 * side, so it reads the skill's own reach.
 */
export function harmsViewer(reach: GroundReach, owner: GroundSide, watching: boolean): boolean {
  return reach !== "allies" && (watching || groundReaches(reach, owner, "ally"));
}

export interface GroundLookInput {
  readonly dashed: boolean;
  /** Seconds since it landed. */
  readonly age: number;
  /** Seconds until it ends. */
  readonly remaining: number;
}

export interface GroundLook {
  readonly dashed: boolean;
  readonly edgeWidth: number;
  readonly edgeAlpha: number;
  readonly poolAlpha: number;
}

/**
 * How an area draws at `age` with `remaining` left: wide as it lands,
 * thin and faint as it ends. Width and brightness tell the state, never
 * colour, and none of it is decoration, so reduced motion keeps it all.
 */
export function groundLook({ dashed, age, remaining }: GroundLookInput): GroundLook {
  const ending = Math.min(1, Math.max(0, remaining / ENDING_SECONDS));
  const rest = 1 + (ZONE_EDGE_WIDTH - 1) * ending;
  const landing = landingScale(age);
  return {
    dashed,
    edgeWidth: rest * landing,
    edgeAlpha: ENDED_EDGE_ALPHA + (EDGE_ALPHA - ENDED_EDGE_ALPHA) * ending,
    poolAlpha: (dashed ? HARM_POOL_ALPHA : HELP_POOL_ALPHA) * (0.5 + 0.5 * ending),
  };
}

/** The edge's width over its rest at `age`: 2.5×, held, then eased to 1×. */
function landingScale(age: number): number {
  if (age <= LANDING_HOLD_SECONDS) {
    return LANDING_WIDTH_SCALE;
  }
  const t = Math.min(1, (age - LANDING_HOLD_SECONDS) / LANDING_EASE_SECONDS);
  const eased = t * t * (3 - 2 * t);
  return LANDING_WIDTH_SCALE + (1 - LANDING_WIDTH_SCALE) * eased;
}

/**
 * A pool's alpha where it overlaps `overlaps` others: low enough that
 * all of them stacked stay under `MAX_POOL_ALPHA`.
 */
export function stackedPoolAlpha(alpha: number, overlaps: number): number {
  return Math.min(alpha, 1 - (1 - MAX_POOL_ALPHA) ** (1 / (overlaps + 1)));
}

/** A pool's slow breath, 0.85 to 1.15; still under reduced motion. */
export function poolBreath(now: number, phase: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : 1 + 0.15 * Math.sin((now / 3) * 2 * Math.PI + phase);
}

/** An arc, in radians, clockwise from `from` to `to`. */
export interface Arc {
  readonly from: number;
  readonly to: number;
}

/** The arcs of a dashed circle of `radius`: `dash` long, `gap` apart, as near as whole. */
export function dashedCircle(radius: number, dash: number, gap: number): Arc[] {
  const count = Math.max(1, Math.round((2 * Math.PI * radius) / (dash + gap)));
  const step = (2 * Math.PI) / count;
  const drawn = (step * dash) / (dash + gap);
  return Array.from({ length: count }, (_, k) => ({ from: k * step, to: k * step + drawn }));
}

/** What moves inside an area: a storm's swirls, a well's wisps, or nothing. */
export type GroundMotion = "swirl" | "wisp";

/**
 * The motion inside the ground `skillId` leaves: a pulse is a storm,
 * a lasting aura on a corpse is a well; a ward or a trap lies still.
 */
export function groundMotion(skillId: string): GroundMotion | undefined {
  const effect = getSkill(skillId)?.effects.find(
    (candidate) => candidate.kind === "create-ground-effect",
  );
  if (effect?.act.kind === "pulse") {
    return "swirl";
  }
  return effect?.act.kind === "aura" && effect.anchor === "corpse" ? "wisp" : undefined;
}

/** At most this many strokes move in one area. */
export const GROUND_STROKES = 5;
export const GROUND_STROKE_WIDTH = 1.5;

/** A swirl: an arc round the area's centre, `radius` out. */
export interface Swirl {
  radius: number;
  from: number;
  to: number;
  alpha: number;
}

/**
 * Swirl `index` of a storm of `radius` at `now`: thin arcs turning slowly
 * round its centre, alternate ones the other way. Under reduced motion
 * they hold still.
 */
export function swirl(
  radius: number,
  index: number,
  now: number,
  phase: number,
  reducedMotion: boolean,
  out: Swirl,
): Swirl {
  const t = reducedMotion ? 0 : now;
  const direction = index % 2 === 0 ? 1 : -1;
  const start = phase + (index * 2 * Math.PI) / GROUND_STROKES + direction * t * 0.5;
  out.radius = radius * (0.3 + (0.5 * index) / GROUND_STROKES);
  out.from = start;
  out.to = start + 0.9;
  out.alpha = 0.45;
  return out;
}

/** A wisp: a short stroke rising from (`x`, `y1`) to (`x`, `y2`), off the centre. */
export interface Wisp {
  x: number;
  y1: number;
  y2: number;
  alpha: number;
}

const WISP_PERIOD_SECONDS = 2.4;

/**
 * Wisp `index` of a well of `radius` at `now`: a short stroke rising from
 * the pool and fading as it goes. Under reduced motion it holds still,
 * halfway up.
 */
export function wisp(
  radius: number,
  index: number,
  now: number,
  phase: number,
  reducedMotion: boolean,
  out: Wisp,
): Wisp {
  const offset = index / GROUND_STROKES;
  const cycle = reducedMotion ? 0.5 : (now / WISP_PERIOD_SECONDS + offset + phase) % 1;
  const across = (offset * 2 - 1 + 1 / GROUND_STROKES) * radius * 0.6;
  const rise = radius * 0.5;
  const base = radius * 0.3 - rise * cycle;
  out.x = across;
  out.y1 = base;
  out.y2 = base - radius * 0.18;
  out.alpha = 0.75 * Math.sin(Math.PI * cycle);
  return out;
}

/** An area as the curse mark reads it. */
export interface CursingArea {
  readonly position: Vec2;
  readonly layer: number;
  readonly radius: number;
  readonly reach: GroundReach;
  readonly owner: GroundSide;
  readonly dashed: boolean;
}

/**
 * Whether a living body of `side` at `position` on `layer` wears the curse
 * mark: it stands in a dashed area on its own layer that reaches it.
 * Presentation only; however many such areas, one mark.
 */
export function cursedBy(
  position: Vec2,
  layer: number,
  side: GroundSide,
  areas: readonly CursingArea[],
): boolean {
  return areas.some(
    (area) =>
      area.dashed &&
      area.layer === layer &&
      Math.hypot(position.x - area.position.x, position.y - area.position.y) <= area.radius &&
      groundReaches(area.reach, area.owner, side),
  );
}

/** How many other areas on `area`'s layer overlap it: its pool lightens to stay under the cap. */
export function overlapsOf(
  area: Pick<CursingArea, "position" | "layer" | "radius">,
  areas: readonly Pick<CursingArea, "position" | "layer" | "radius">[],
): number {
  return areas.filter(
    (other) =>
      other !== area &&
      other.layer === area.layer &&
      Math.hypot(other.position.x - area.position.x, other.position.y - area.position.y) <
        other.radius + area.radius,
  ).length;
}
