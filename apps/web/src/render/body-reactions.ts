import type { Vec2 } from "@vibewars/game-core";

/**
 * What a body does when it is hit, dies or comes back (#3365): a quick
 * white flash with a nudge away from the blow, a fall that drains the
 * team colour to the corpse grey, a rise in a team light. All of it is
 * visual: the simulation's positions are untouched.
 *
 * No Phaser here, so it can be tested in Node.
 */

export const FLASH_SECONDS = 0.12;
export const FLASH_TINT = 0.55;
export const FLASH_TINT_CRITICAL = 0.8;
/** A tick of bleeding or degeneration: tint only, no slide. */
export const FLASH_TINT_TICK = 0.35;
export const FLASH_SLIDE = 3;
export const FLASH_SLIDE_CRITICAL = 5;

export const DEATH_SECONDS = 0.45;
export const DUST_SECONDS = 0.4;
export const DUST_SPECKS = 6;
export const DUST_REACH = 1.6;

export const RESPAWN_SECONDS = 0.5;
export const RESPAWN_RING_FROM = 18;
export const RESPAWN_RING_TO = 34;
export const RESPAWN_RING_ALPHA = 0.7;
export const RESPAWN_COLUMN_SECONDS = 0.4;
export const RESPAWN_COLUMN_HEIGHT = 60;
export const RESPAWN_COLUMN_ALPHA = 0.5;
/** A returning body rises from this share of its size. */
export const RESPAWN_RISE_FROM = 0.4;

/** Past this many bodies at once, the oldest go. */
export const MAX_REACTIONS = 64;

export interface BodyFlash {
  readonly id: string;
  ageSeconds: number;
  /** How white the body goes at the first instant, 0..1. */
  readonly tint: number;
  /** The nudge at its peak: away from the source, in pixels. `0,0` for none. */
  readonly slide: Vec2;
}

/** A body that has just died, until its fall is over: it is drawn where it lies now. */
export interface BodyDeath {
  readonly id: string;
  ageSeconds: number;
}

/** A body that has just come back, drawn where it stands now. */
export interface BodyRespawn {
  readonly id: string;
  ageSeconds: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The white over the body: `tint` at age 0, none at `FLASH_SECONDS`. */
export function flashAmount(flash: Pick<BodyFlash, "ageSeconds" | "tint">): number {
  return flash.tint * (1 - clamp01(flash.ageSeconds / FLASH_SECONDS));
}

/** The nudge: out to the peak at the middle of the flash, back at its end. */
export function slideOffset(flash: Pick<BodyFlash, "ageSeconds" | "slide">): Vec2 {
  const t = clamp01(flash.ageSeconds / FLASH_SECONDS);
  const k = Math.sin(Math.PI * t);
  return { x: flash.slide.x * k, y: flash.slide.y * k };
}

/** A blow from `from` onto a body at `at`: `pixels` along the line away from it. */
export function slideAway(at: Vec2, from: Vec2 | undefined, pixels: number): Vec2 {
  if (from === undefined) {
    return { x: 0, y: 0 };
  }
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 0 } : { x: (dx / length) * pixels, y: (dy / length) * pixels };
}

/** 0 at the moment of death, 1 once the fall is over. */
export function deathProgress(ageSeconds: number): number {
  return clamp01(ageSeconds / DEATH_SECONDS);
}

/** Each channel of `from` moved `t` of the way to `to`. */
export function mixColour(from: number, to: number, t: number): number {
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * clamp01(t)) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** One speck of the dust ring: where it is, and how faint, `ageSeconds` after the fall. */
export function dustSpeck(
  index: number,
  centre: Vec2,
  radius: number,
  ageSeconds: number,
): { readonly x: number; readonly y: number; readonly alpha: number } {
  const t = clamp01(ageSeconds / DUST_SECONDS);
  const angle = (index / DUST_SPECKS) * Math.PI * 2 + 0.5;
  const reach = radius * (1 + (DUST_REACH - 1) * t);
  return {
    x: centre.x + Math.cos(angle) * reach,
    y: centre.y + Math.sin(angle) * reach,
    alpha: 0.8 * (1 - t),
  };
}

/** The returning body's size, as a share of its own: it rises into place. */
export function respawnScale(ageSeconds: number): number {
  const t = clamp01(ageSeconds / RESPAWN_SECONDS);
  return RESPAWN_RISE_FROM + (1 - RESPAWN_RISE_FROM) * t;
}

export function respawnRing(ageSeconds: number): {
  readonly radius: number;
  readonly alpha: number;
} {
  const t = clamp01(ageSeconds / RESPAWN_SECONDS);
  return {
    radius: RESPAWN_RING_FROM + (RESPAWN_RING_TO - RESPAWN_RING_FROM) * t,
    alpha: RESPAWN_RING_ALPHA * (1 - t),
  };
}

export function respawnColumnAlpha(ageSeconds: number): number {
  return RESPAWN_COLUMN_ALPHA * (1 - clamp01(ageSeconds / RESPAWN_COLUMN_SECONDS));
}

/** Age the list by `dt`, dropping what has run its `lifetime`; the oldest go past the cap. */
export function decayReactions(list: { ageSeconds: number }[], dt: number, lifetime: number): void {
  for (const item of list) {
    item.ageSeconds += dt;
  }
  let kept = 0;
  for (const item of list) {
    if (item.ageSeconds < lifetime) {
      list[kept] = item;
      kept += 1;
    }
  }
  list.length = kept;
  if (kept > MAX_REACTIONS) {
    list.splice(0, kept - MAX_REACTIONS);
  }
}

/** Add `next`, replacing the live entry of the same body: a repeat hit restarts, it does not stack. */
export function startReaction<T extends { id: string }>(list: T[], next: T): void {
  const at = list.findIndex((item) => item.id === next.id);
  if (at >= 0) {
    list[at] = next;
  } else {
    list.push(next);
  }
}
