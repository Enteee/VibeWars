import { isWeaponId, type Vec2, type WeaponId } from "@vibewars/game-core";

/**
 * Ranged weapon shots in flight (#161, docs/art/art-direction.md
 * "Projectiles"). A shot flies in a straight line from where it left to
 * its aim point: where the target was going to be, not where it is, so a
 * player sees the shot land where they would have stood and learns to
 * step aside.
 *
 * No Phaser here, so the sprite choice and the flight can be tested in Node.
 */

export type ProjectileSprite = "arrow" | "spear" | "bolt";

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
 * left). A flying spell (#535) is a bolt until it has art of its own (#487).
 */
export function projectileSprite(
  weaponId: string | undefined,
  skillId: string | undefined,
): ProjectileSprite {
  return skillId === undefined && weaponId !== undefined && isWeaponId(weaponId)
    ? SPRITE[weaponId]
    : "bolt";
}

export const PROJECTILE_SPRITES: readonly ProjectileSprite[] = ["arrow", "spear", "bolt"];

export function projectileSpriteUrl(sprite: ProjectileSprite): string {
  return `${import.meta.env.BASE_URL}icons/projectile/${sprite}.svg`;
}

/** The sprites' grid, pointing along +x. */
export const PROJECTILE_WIDTH = 32;
export const PROJECTILE_HEIGHT = 12;

/** A shot as the scene draws it. */
export interface RenderableProjectile {
  readonly id: number;
  /** Who shot it. */
  readonly shooterId: string;
  /** A weapon's shot, not a flying spell: its release ends a strike (#558). */
  readonly weaponShot: boolean;
  readonly sprite: ProjectileSprite;
  readonly from: Vec2;
  readonly to: Vec2;
  /** The match clock at release. */
  readonly launchedAt: number;
  readonly flightSeconds: number;
  /** The shooter's side, from where you stand. */
  readonly colour: number;
}

/**
 * Where a shot is at `clock` on the match clock: at `from` until it
 * leaves, at `to` when it lands, and nowhere once it has landed.
 */
export function projectilePosition(shot: RenderableProjectile, clock: number): Vec2 | undefined {
  const t =
    shot.flightSeconds > 0 ? Math.max(0, (clock - shot.launchedAt) / shot.flightSeconds) : 1;
  if (t > 1) {
    return undefined;
  }
  return {
    x: shot.from.x + (shot.to.x - shot.from.x) * t,
    y: shot.from.y + (shot.to.y - shot.from.y) * t,
  };
}

/** The way a shot points, in radians, for the sprite's rotation. */
export function projectileHeading(shot: RenderableProjectile): number {
  return Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x);
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
