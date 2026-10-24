import { Vec, type Vec2 } from "@vibewars/game-core";

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
  /** The actor it floats over, so texts landing together can stack. */
  readonly anchorId: string;
  readonly position: Vec2;
  readonly colour: number;
  /** Seconds of life remaining; the scene fades and removes it. */
  remainingSeconds: number;
}

/** How long a floating text lives. */
export const FLOATING_TEXT_SECONDS = 1.2;

/** Texts on one actor younger than this landed "together" and stack. */
const STACK_WINDOW_SECONDS = 0.4;
/** How far each stacked text sits above the one before it, and to the side. */
const STACK_RISE_PX = 16;
const STACK_FAN_PX = 10;
/** The highest slot: a burst reuses it rather than climbing off-screen. */
const STACK_MAX_SLOT = 5;

/**
 * Where a new floating text goes (#54). Hits that land on one actor
 * together would otherwise draw on top of each other as one smear, so
 * each extra one sits a slot higher, alternating sides.
 */
export function placeFloating(live: readonly FloatingText[], next: FloatingText): Vec2 {
  const together = live.filter(
    (text) =>
      text.anchorId === next.anchorId &&
      FLOATING_TEXT_SECONDS - text.remainingSeconds < STACK_WINDOW_SECONDS,
  ).length;
  const slot = Math.min(together, STACK_MAX_SLOT);
  if (slot === 0) {
    return next.position;
  }
  return {
    x: next.position.x + (slot % 2 === 1 ? STACK_FAN_PX : -STACK_FAN_PX),
    y: next.position.y - STACK_RISE_PX * slot,
  };
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

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  readonly targetId: string | undefined;
}

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  targetId: undefined,
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
