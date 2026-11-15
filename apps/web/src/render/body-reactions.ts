import type { Vec2 } from "@vibewars/game-core";

/**
 * How a body reacts to a hit, a death and a respawn (#3365), as numbers
 * against the seconds since it happened. No Phaser here: the scene reads
 * these and draws.
 */

/** How long a hit's flash and slide last. */
export const FLASH_SECONDS = 0.12;
/** A hit's flash toward white, at its start: plain, critical, and a sourceless tick. */
export const FLASH_TINT = { hit: 0.55, critical: 0.8, tick: 0.35 } as const;
/** How far a hit pushes the body away from its source, in px: plain and critical. */
export const SLIDE_PX = { hit: 3, critical: 5 } as const;

/** How long a death takes to fall, drain and settle into the corpse. */
export const DEATH_SECONDS = 0.45;
/** The part of a death the fall takes; the drain runs the whole of it. */
const FALL_SHARE = 0.6;
/** From this far through a death the lying body gives way to the corpse ring. */
const CORPSE_FROM = 0.75;
/** The dust a death kicks up: its specks, how long it lasts, how far it spreads in radii. */
export const DUST_SPECKS = 6;
export const DEATH_DUST_SECONDS = 0.4;
const DUST_SPREAD = 1.6;
/** A dust speck's radius, px, and how far toward white the ground it is kicked from is. */
export const DUST_SPECK_RADIUS = 2;
export const DUST_LIGHTEN = 0.3;

/** How long a respawned body takes to fade in, and its ring to rise. */
export const RESPAWN_SECONDS = 0.5;
/** The ring around a respawned body's feet: its radius and alpha, start to end. */
const RING_RADIUS = { from: 18, to: 34 } as const;
const RING_ALPHA = 0.7;
/** The light column over a respawned body: its height in px, alpha and life. */
export const COLUMN_HEIGHT = 60;
export const COLUMN_WIDTH = 4;
const COLUMN_ALPHA = 0.5;
const COLUMN_SECONDS = 0.4;

/** `t` held to 0 … 1. */
function unit(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** The flash's tint toward white `t` s after a hit that began at `peak`: 0 once it is over. */
export function flashAt(t: number, peak: number): number {
  return t < 0 || t >= FLASH_SECONDS ? 0 : peak * (1 - t / FLASH_SECONDS);
}

/**
 * Where a body hit from `from` while standing at `to` draws, as an offset,
 * `t` s into the slide: out `distance` px away from the source and eased
 * back. No offset when the source stands on it.
 */
export function slideAt(t: number, from: Vec2, to: Vec2, distance: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (t < 0 || t >= FLASH_SECONDS || length === 0) {
    return { x: 0, y: 0 };
  }
  const push = distance * Math.sin(Math.PI * (t / FLASH_SECONDS));
  return { x: (dx / length) * push, y: (dy / length) * push };
}

/** A death `t` s in: how far it has fallen, drained and turned into the corpse ring, each 0 … 1. */
export interface DeathFrame {
  readonly fall: number;
  readonly drain: number;
  readonly corpse: number;
}

export function deathAt(t: number): DeathFrame {
  const progress = unit(t / DEATH_SECONDS);
  const falling = unit(progress / FALL_SHARE);
  return {
    // Eased in, as a body tips over: slow, then all at once.
    fall: falling * falling,
    drain: progress,
    corpse: unit((progress - CORPSE_FROM) / (1 - CORPSE_FROM)),
  };
}

/** A death's dust `t` s in: each speck's offset from the body, in radii, and their alpha. */
export function dustAt(t: number): { readonly specks: readonly Vec2[]; readonly alpha: number } {
  const progress = unit(t / DEATH_DUST_SECONDS);
  const out = 1 + (DUST_SPREAD - 1) * (1 - (1 - progress) * (1 - progress));
  const specks = Array.from({ length: DUST_SPECKS }, (_, k) => {
    const angle = (k / DUST_SPECKS) * 2 * Math.PI;
    return { x: Math.cos(angle) * out, y: Math.sin(angle) * out };
  });
  return { specks, alpha: 1 - progress };
}

/** A respawn `t` s in: the body's alpha, its ring, and its light column. */
export interface RespawnFrame {
  readonly alpha: number;
  readonly ringRadius: number;
  readonly ringAlpha: number;
  readonly columnAlpha: number;
}

export function respawnAt(t: number): RespawnFrame {
  const progress = unit(t / RESPAWN_SECONDS);
  return {
    alpha: progress,
    ringRadius: RING_RADIUS.from + (RING_RADIUS.to - RING_RADIUS.from) * progress,
    ringAlpha: RING_ALPHA * (1 - progress),
    columnAlpha: COLUMN_ALPHA * (1 - unit(t / COLUMN_SECONDS)),
  };
}

/**
 * The bodies among `actors` that were dead in the last snapshot, as
 * `wasDead` remembers it, and are alive now: a respawn or a resurrection.
 * A body not in `wasDead`, as in a guest's first snapshot, came back from nothing.
 */
export function cameBack(
  wasDead: ReadonlyMap<string, boolean>,
  actors: readonly { readonly id: string; readonly dead: boolean }[],
): string[] {
  return actors.filter(({ id, dead }) => wasDead.get(id) === true && !dead).map(({ id }) => id);
}
