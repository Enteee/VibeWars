import { Vec, type Vec2 } from "@vibewars/game-core";

import type { RenderableProjectile } from "./projectiles.js";

/**
 * The renderer's own data shape and its pure helpers (team colour lookup,
 * click hit-testing). Deliberately has zero dependency on Phaser — the
 * actual drawing lives in `arena-scene.ts`, which imports Phaser and so
 * cannot be imported from a plain-Node test (Phaser probes for browser
 * globals at module load time and throws outside one). Keeping this file
 * Phaser-free is what lets these helpers be unit-tested headlessly,
 * consistent with ADR-0001's "the domain never depends on the renderer" —
 * the same separation, one layer over.
 */

export interface RenderableActor {
  readonly id: string;
  /** Drawn above the actor, so a player can tell who is who. */
  readonly name: string;
  readonly position: Vec2;
  readonly radius: number;
  readonly team: "ally" | "enemy" | "self";
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
  /** Fraction of the current cast still remaining, or `undefined`. */
  readonly castProgress: number | undefined;
  readonly statuses: readonly string[];
}

export interface RectRenderableWall {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonRenderableWall {
  readonly kind: "polygon";
  readonly points: readonly Vec2[];
}

export type RenderableWall = RectRenderableWall | PolygonRenderableWall;

/** A short-lived floating number or label above an actor. */
export interface FloatingText {
  readonly id: number;
  readonly text: string;
  readonly position: Vec2;
  readonly colour: number;
  /**
   * `"light"` for weapon swings: smaller and fainter, so a stream of
   * them never drowns a skill's number (#160).
   */
  readonly weight: "normal" | "light";
  /** Seconds of life remaining; the scene fades and removes it. */
  remainingSeconds: number;
}

/**
 * Where an area skill landed (#5): a ring at its true radius in the
 * caster's side's colour, fading out (docs/art/art-direction.md).
 */
export interface AreaFlash {
  readonly id: number;
  readonly position: Vec2;
  readonly radius: number;
  readonly colour: number;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** How long a flash takes to fade from full to nothing. */
export const AREA_FLASH_SECONDS = 0.4;

/** Every flash `dt` seconds older, the faded ones gone. */
export function decayAreaFlashes(flashes: readonly AreaFlash[], dt: number): AreaFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

/** A flash's opacity: 1 when it lands, 0 when it is gone. */
export function areaFlashAlpha(flash: AreaFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / AREA_FLASH_SECONDS));
}

/**
 * A melee swing (#161): a 90° arc around the attacker, toward its target,
 * in the attacker's side's colour, fading out (docs/art/art-direction.md
 * "Swing flash"). It hugs the attacker, so it never reads as the target ring.
 */
export interface SwingFlash {
  readonly id: number;
  /** The attacker's centre when it swung. */
  readonly centre: Vec2;
  /** Toward the target, in radians. */
  readonly angle: number;
  readonly radius: number;
  readonly colour: number;
  /** Your own swing, which gets an `ink` line along its outer edge. */
  readonly own: boolean;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** Every body's radius, as drawn: the ruleset's collision radius. */
export const ACTOR_RADIUS = 14;

/** Short, so a dagger's rapid hits read as separate flashes, never a standing ring. */
export const SWING_FLASH_SECONDS = 0.12;
/** Outside the body: the attacker's radius plus this. */
export const SWING_FLASH_GAP = 6;

/** Every swing `dt` seconds older, the faded ones gone. */
export function decaySwingFlashes(flashes: readonly SwingFlash[], dt: number): SwingFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

export function swingFlashAlpha(flash: SwingFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / SWING_FLASH_SECONDS));
}

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  readonly targetId: string | undefined;
  /** Weapon shots in flight (#161). */
  readonly projectiles: readonly RenderableProjectile[];
  /** The match clock (`elapsedSeconds`), which projectiles fly against. */
  readonly clock: number;
}

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  targetId: undefined,
  projectiles: [],
  clock: 0,
};

/**
 * Two hues, for two sides (docs/art/art-direction.md): `friend` blue and
 * `foe` red, which stay apart under every common colour-vision deficiency,
 * where the old green allies did not. You are drawn in your team's blue;
 * what marks you out is the ink rim the scene adds, not a hue of your own.
 */
const TEAM_COLOURS: Record<RenderableActor["team"], number> = {
  self: 0x59c2ff,
  ally: 0x59c2ff,
  enemy: 0xff7b72,
};

/** Colour lookup must stay total over the team union. */
export function teamColour(team: RenderableActor["team"]): number {
  return TEAM_COLOURS[team];
}

/**
 * Hit-test a point against actors; used by click-to-target (brief §5).
 *
 * Dead actors are skipped: clicking a corpse should select whoever is
 * standing behind it, not the corpse.
 */
export function actorAtPoint(snapshot: ArenaSnapshot, point: Vec2): RenderableActor | undefined {
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of snapshot.actors) {
    if (actor.dead) {
      continue;
    }
    const d = Vec.distance(actor.position, point);
    if (d <= actor.radius && d < bestDistance) {
      best = actor;
      bestDistance = d;
    }
  }
  return best;
}

/** Health as a 0..1 fraction, clamped — the shape a health bar needs. */
export function healthFraction(actor: RenderableActor): number {
  if (actor.maxHealth <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, actor.health / actor.maxHealth));
}

/**
 * Where an actor's name label sits: its bottom edge, in world y (#53).
 *
 * Clear of the cast bar whether or not one is showing, so a name does not
 * jump every time its owner starts casting. A corpse has no bars, so its
 * name sits just over the circle.
 */
export function nameLabelBottom(actor: RenderableActor): number {
  return actor.position.y - actor.radius - (actor.dead ? 4 : 22);
}
