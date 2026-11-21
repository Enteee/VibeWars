/**
 * The spawn-in and death dissolve styles (ADR-0056 §4, #3580): motes that
 * gather at a body as it comes back and leave it as it falls. They only
 * decorate: each style runs the default return's or fall's time exactly,
 * draws on the body's layer under it (`render-order.ts`), and reaches no
 * further past its rim than the look's ground share, so the body's
 * outline, team ring and death state read as they always do. Under
 * reduced motion they draw nothing: the body's own fade is the effect.
 *
 * No Phaser here, so it can be tested in Node.
 */

import type { CosmeticLook, DissolveMotif, SpawnMotif } from "../cosmetics/catalog.js";
import type { Painter } from "./body-painter.js";
import { DEATH_SECONDS, RESPAWN_SECONDS } from "./body-reactions.js";
import type { GroundBody } from "./cosmetic-ground.js";

export type SpawnLook = Extract<CosmeticLook, { readonly kind: "spawn" }>;
export type DissolveLook = Extract<CosmeticLook, { readonly kind: "dissolve" }>;
type StyleLook = SpawnLook | DissolveLook;

/** How many motes a style draws. */
export const STYLE_MOTES = 8;
/** How many turns round the body the leaves swirl while it gathers. */
const SWIRL_TURNS = 1.25;
/** How far, in radians, petals and ash sway off their line as they go. */
const SWAY = { petals: 0.5, ash: 0.25 } as const;
/** A mote's size, as a share of the body's radius: mist is soft and wide, the rest are specks. */
const MOTE_OF_BODY: Readonly<Record<SpawnMotif | DissolveMotif, number>> = {
  light: 0.14,
  leaves: 0.14,
  petals: 0.18,
  stars: 0.18,
  ash: 0.12,
  mist: 0.3,
  shards: 0.2,
};

/** One mote of a style: where, how big, how strong, and its turn in radians. */
export interface StyleMote {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
  readonly spin: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** `body`'s spawn-in style, if it wears one. */
export function spawnStyleOf(body: GroundBody): SpawnLook | undefined {
  const look = body.cosmetics.spawn?.look;
  return look?.kind === "spawn" ? look : undefined;
}

/** `body`'s death dissolve, if it wears one. */
export function dissolveStyleOf(body: GroundBody): DissolveLook | undefined {
  const look = body.cosmetics.dissolve?.look;
  return look?.kind === "dissolve" ? look : undefined;
}

/** How long `body` takes to come back: its spawn style's time, or the default's. */
export function returnSeconds(body: GroundBody): number {
  return spawnStyleOf(body)?.seconds ?? RESPAWN_SECONDS;
}

/** How long `body` takes to fall: its death dissolve's time, or the default's. */
export function fallSeconds(body: GroundBody): number {
  return dissolveStyleOf(body)?.seconds ?? DEATH_SECONDS;
}

/**
 * Mote `index` of `look`, `ageSeconds` into it, round a body at `x, y` of
 * `radius`; `phase` turns the ring so two bodies do not match. A spawn's
 * motes close in from the far reach to the rim, a dissolve's leave the
 * rim for it. Strength swells and fades within the look's alpha; past the
 * look's `seconds`, there is none.
 */
export function styleMote(
  look: StyleLook,
  index: number,
  x: number,
  y: number,
  radius: number,
  ageSeconds: number,
  phase: number,
): StyleMote {
  const t = clamp01(ageSeconds / look.seconds);
  const reach = radius * (look.ground?.radiusOfBody ?? 0);
  // The share of the way out, past the rim: a spawn gathers, a dissolve leaves.
  const out = look.kind === "spawn" ? 1 - t : t;
  let angle = phase + (index / STYLE_MOTES) * Math.PI * 2;
  switch (look.motif) {
    case "leaves":
      angle += SWIRL_TURNS * Math.PI * 2 * t;
      break;
    case "petals":
    case "ash":
      angle += SWAY[look.motif] * Math.sin(Math.PI * t);
      break;
    case "light":
    case "stars":
    case "mist":
    case "shards":
      break;
  }
  const size = radius * MOTE_OF_BODY[look.motif];
  // A mote's far edge stops at the reach: never past the look's ground share.
  const distance = radius + Math.max(0, reach - size) * out;
  const strength = (look.ground?.alpha ?? 0) * Math.sin(Math.PI * t);
  return {
    x: x + Math.cos(angle) * distance,
    y: y + Math.sin(angle) * distance,
    size,
    alpha: t >= 1 ? 0 : strength,
    spin: angle + Math.PI * 2 * t,
  };
}

/** A star of four points at `mote`. */
function starPoints(mote: StyleMote): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i += 1) {
    const r = i % 2 === 0 ? mote.size : mote.size * 0.4;
    const a = mote.spin + (i / 8) * Math.PI * 2;
    points.push({ x: mote.x + Math.cos(a) * r, y: mote.y + Math.sin(a) * r });
  }
  return points;
}

/** A leaf, a petal or a shard at `mote`: a lens, or a sliver of a triangle, along its spin. */
function bladePoints(mote: StyleMote, shard: boolean): { x: number; y: number }[] {
  const along = { x: Math.cos(mote.spin), y: Math.sin(mote.spin) };
  const across = { x: -along.y, y: along.x };
  const width = mote.size * (shard ? 0.35 : 0.5);
  const tip = { x: mote.x + along.x * mote.size, y: mote.y + along.y * mote.size };
  const tail = { x: mote.x - along.x * mote.size, y: mote.y - along.y * mote.size };
  const left = { x: mote.x + across.x * width, y: mote.y + across.y * width };
  const right = { x: mote.x - across.x * width, y: mote.y - across.y * width };
  return shard ? [tip, left, tail] : [tip, left, tail, right];
}

/**
 * Paint `look` round a body at `x, y` of `radius`, `ageSeconds` into its
 * spawn or fall. Nothing under reduced motion, nor once it has run.
 */
export function paintStyle(
  painter: Painter,
  look: StyleLook,
  x: number,
  y: number,
  radius: number,
  ageSeconds: number,
  phase: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion || ageSeconds >= look.seconds) {
    return;
  }
  for (let i = 0; i < STYLE_MOTES; i += 1) {
    const mote = styleMote(look, i, x, y, radius, ageSeconds, phase);
    painter.fillStyle(look.colour, mote.alpha);
    switch (look.motif) {
      case "stars":
        painter.fillPoints(starPoints(mote));
        break;
      case "leaves":
      case "petals":
      case "shards":
        painter.fillPoints(bladePoints(mote, look.motif === "shards"));
        break;
      case "mist":
        // Soft: a wide faint puff round a smaller core, both within the look's alpha.
        painter.fillStyle(look.colour, mote.alpha * 0.5);
        painter.fillCircle(mote.x, mote.y, mote.size);
        painter.fillCircle(mote.x, mote.y, mote.size * 0.5);
        break;
      case "light":
      case "ash":
        painter.fillCircle(mote.x, mote.y, mote.size);
        break;
    }
  }
}
