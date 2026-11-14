import { isWeaponId, type Vec2, type WeaponId } from "@vibewars/game-core";

import type { MapStructure, RenderableLift } from "./arena-snapshot.js";
import { liftAt } from "./layer-surfaces.js";

/**
 * Ranged weapon shots in flight (#161, docs/art/art-direction.md
 * "Projectiles"). A shot flies in a straight line from where it left to
 * its aim point: where the target was going to be, not where it is, so a
 * player sees the shot land where they would have stood and learns to
 * step aside.
 *
 * No Phaser here, so the sprite choice and the flight can be tested in Node.
 */

export type ProjectileSprite =
  | "arrow"
  | "spear"
  | "bolt"
  | "fireball"
  | "lightning-orb"
  | "ice-shard"
  | "water-trident"
  | "ebon-hawk"
  | "stone"
  | "thrown-dagger"
  | "deathly-swarm";

/** A flying spell's own sprite (#1176). A new flying spell needs a row, or the test fails. */
export const SKILL_SPRITE: Readonly<Record<string, ProjectileSprite>> = {
  "elementalist.fireball": "fireball",
  "elementalist.flare": "fireball",
  "elementalist.lava-arrows": "fireball",
  "elementalist.phoenix": "fireball",
  "elementalist.lightning-orb": "lightning-orb",
  "elementalist.shock-arrow": "lightning-orb",
  "elementalist.lightning-javelin": "lightning-orb",
  "elementalist.lightning-bolt": "lightning-orb",
  "elementalist.shard-storm": "ice-shard",
  "elementalist.ice-spear": "ice-shard",
  "elementalist.water-trident": "water-trident",
  "elementalist.ebon-hawk": "ebon-hawk",
  "elementalist.stoning": "stone",
  "elementalist.glowstone": "stone",
  "elementalist.stone-daggers": "stone",
  "assassin.disrupting-dagger": "thrown-dagger",
  "assassin.crippling-dagger": "thrown-dagger",
  "assassin.dancing-daggers": "thrown-dagger",
  "monk.spear-of-light": "spear",
  "necromancer.deathly-swarm": "deathly-swarm",
};

/** Every weapon's sprite. A melee weapon never shoots; it gets `bolt` rather than a throw in the render loop. */
const SPRITE: Readonly<Record<WeaponId, ProjectileSprite>> = {
  unarmed: "bolt",
  sword: "bolt",
  axe: "bolt",
  hammer: "bolt",
  daggers: "bolt",
  scythe: "bolt",
  spear: "spear",
  wand: "bolt",
  staff: "bolt",
  flatbow: "arrow",
  shortbow: "arrow",
  longbow: "arrow",
  "recurve-bow": "arrow",
  hornbow: "arrow",
};

/**
 * A shot's sprite, from its shooter's weapon (`undefined` once they have
 * left). A flying spell (#535) is drawn by its skill, a bolt if it has no row.
 */
export function projectileSprite(
  weaponId: string | undefined,
  skillId: string | undefined,
): ProjectileSprite {
  if (skillId !== undefined) {
    return SKILL_SPRITE[skillId] ?? "bolt";
  }
  return weaponId !== undefined && isWeaponId(weaponId) ? SPRITE[weaponId] : "bolt";
}

export const PROJECTILE_SPRITES: readonly ProjectileSprite[] = [
  "arrow",
  "spear",
  "bolt",
  ...Object.values(SKILL_SPRITE),
];

/** A shot as the scene draws it. */
export interface RenderableProjectile {
  readonly id: number;
  readonly sprite: ProjectileSprite;
  readonly from: Vec2;
  readonly to: Vec2;
  /** The shooter's layer at release, and the target's. */
  readonly fromLayer: number;
  readonly toLayer: number;
  /** The match clock at release. */
  readonly launchedAt: number;
  readonly flightSeconds: number;
  /** The shooter's side, from where you stand. */
  readonly colour: number;
  /** A flying spell (#3292): it gets a bright core, a ground shadow and a warm trail. */
  readonly spell: boolean;
}

/** Where `shot` leaves from and lands, as drawn: each end lifted to its own layer (#2972), or its lift's platform (#3079). */
function drawnEnds(
  shot: RenderableProjectile,
  structure: MapStructure,
  lifts: readonly RenderableLift[],
): { readonly from: Vec2; readonly to: Vec2 } {
  return {
    from: {
      x: shot.from.x,
      y: shot.from.y - liftAt(structure, lifts, shot.from, shot.fromLayer),
    },
    to: { x: shot.to.x, y: shot.to.y - liftAt(structure, lifts, shot.to, shot.toLayer) },
  };
}

/** Where `shot` is drawn when it lands. */
export function projectileLanding(
  shot: RenderableProjectile,
  structure: MapStructure,
  lifts: readonly RenderableLift[],
): Vec2 {
  return drawnEnds(shot, structure, lifts).to;
}

/**
 * Where a shot is drawn at `clock` on the match clock: at its start until
 * it leaves, at its end when it lands, and nowhere once it has landed.
 */
export function projectilePosition(
  shot: RenderableProjectile,
  clock: number,
  structure: MapStructure,
  lifts: readonly RenderableLift[],
): Vec2 | undefined {
  const t =
    shot.flightSeconds > 0 ? Math.max(0, (clock - shot.launchedAt) / shot.flightSeconds) : 1;
  if (t > 1) {
    return undefined;
  }
  const { from, to } = drawnEnds(shot, structure, lifts);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** The way a shot points, in radians, for the sprite's rotation. */
export function projectileHeading(
  shot: RenderableProjectile,
  structure: MapStructure,
  lifts: readonly RenderableLift[],
): number {
  const { from, to } = drawnEnds(shot, structure, lifts);
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** The layer a shot flies over at `clock`: its shooter's for the first half, its target's after. */
export function projectileLayer(shot: RenderableProjectile, clock: number): number {
  const t = shot.flightSeconds > 0 ? (clock - shot.launchedAt) / shot.flightSeconds : 1;
  return t < 0.5 ? shot.fromLayer : shot.toLayer;
}

/*
 * A flying spell's look (#3292, docs/art/3191-skill-visuals.md
 * "Glowstone"): over its own sprite, which tells which spell it is, a
 * near-white core says it is hot, a short warm trail says where it came
 * from, and a soft shadow on the ground under it says it flies.
 */

/** The core: near-white, this share of the sprite's radius. */
export const SHOT_CORE_COLOUR = 0xfff4d0;
export const SHOT_CORE_SHARE = 0.4;

/** The shadow: a soft dark ellipse this far under the sprite, on the deck below it. */
export const SHOT_SHADOW = {
  offset: { x: -3, y: 12 },
  width: 12,
  height: 5,
  colour: 0x000000,
  alpha: 0.3,
} as const;

/** The trail's longest reach behind the sprite, in sprite lengths. */
export const SHOT_TRAIL_REACH = 2;

/** One dot of a flying spell's trail, where it sits from the sprite's centre. */
export interface TrailDot {
  readonly offset: Vec2;
  readonly radius: number;
  readonly colour: number;
  readonly alpha: number;
}

/** Warm whatever the sprite: gold at the sprite, ember at the tail. */
const TRAIL = [
  { back: 0.6, share: 0.35, colour: 0xffd23d, alpha: 0.85 },
  { back: 1.05, share: 0.28, colour: 0xffb03d, alpha: 0.6 },
  { back: 1.5, share: 0.21, colour: 0xff9a3d, alpha: 0.4 },
  { back: SHOT_TRAIL_REACH, share: 0.14, colour: 0xff8a3d, alpha: 0.22 },
] as const;

/**
 * The trail behind a sprite `length` long, flying along `heading`:
 * fading dots back along its line, none past `SHOT_TRAIL_REACH`. A shot
 * flies straight, so the scene works this out once per shot, never per
 * frame.
 */
export function projectileTrail(heading: number, length: number): readonly TrailDot[] {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return TRAIL.map(({ back, share, colour, alpha }) => ({
    offset: { x: -cos * back * length, y: -sin * back * length },
    radius: share * length,
    colour,
    alpha,
  }));
}

/**
 * How long an ended shot takes to fade (#238, art direction "How a shot
 * ends"): it holds where it stopped, on a wall or the aim point, so the
 * player sees it land rather than vanish mid-air.
 */
export const SHOT_FADE_SECONDS = 0.12;

/** An ended shot's opacity at `now`: 1 when it ends, 0 when faded, `undefined` once it should go. */
export function shotFadeAlpha(endedAt: number, now: number): number | undefined {
  const age = now - endedAt;
  if (age > SHOT_FADE_SECONDS) {
    return undefined;
  }
  return Math.max(0, Math.min(1, 1 - age / SHOT_FADE_SECONDS));
}

/** How far past the last server time the clock runs on its own: a few patches. */
const MAX_EXTRAPOLATION_SECONDS = 0.25;

/**
 * The match clock between server patches. The server's `elapsedSeconds`
 * moves in ticks, so a shot drawn against it would hop; this runs it on
 * from the last value at real time, up to a few patches, so a shot glides.
 */
export class MatchClock {
  #elapsed = 0;
  #observedAt = 0;

  /** Note the server's clock, read at local time `now` (seconds). */
  public observe(elapsed: number, now: number): void {
    if (elapsed !== this.#elapsed) {
      this.#elapsed = elapsed;
      this.#observedAt = now;
    }
  }

  public read(now: number): number {
    return this.#elapsed + Math.min(Math.max(0, now - this.#observedAt), MAX_EXTRAPOLATION_SECONDS);
  }
}
