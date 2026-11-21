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

/** The most motes a style may draw: the busiest tier's. */
export const STYLE_MOTES = 24;
/** How quickly a mote swells to full strength, and how late it fades: held, not passing. */
const SWELL = 4;
/** The share of a style's time each mote is on the move; the rest staggers their starts. */
const MOTE_SPAN = 0.55;
/** How many turns round the body the leaves swirl while they gather. */
const SWIRL_TURNS = 1.5;
/** How many directions shards fly out in, and how far, in radians, each burst fans. */
const SHARD_BURSTS = 4;
const SHARD_FAN = 0.9;
/** How many turns a shard spins as it flies. */
const SHARD_SPIN = 2;
/** How far, in radians, petals sway as they drift down. */
const PETAL_SWAY = 0.2;
/** When stars flare, as a share of the style's time, and by how much they grow. */
const TWINKLE_AT = 0.8;
const TWINKLE = 1.6;
/** A mote's size, as a share of the body's radius: mist is soft and wide, the rest are specks. */
const MOTE_OF_BODY: Readonly<Record<SpawnMotif | DissolveMotif, number>> = {
  light: 0.16,
  leaves: 0.22,
  petals: 0.2,
  stars: 0.14,
  ash: 0.13,
  mist: 0.26,
  shards: 0.24,
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
const lerp = (from: number, to: number, share: number): number => from + (to - from) * share;
/** Up the screen, as an angle round the body. */
const UP = -Math.PI / 2;
/** The golden ratio's fraction: steps that never line up. */
const GOLDEN = 0.618034;

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
 * `radius`; `phase` turns the style so two bodies do not match. Each mote
 * starts in turn and moves for `MOTE_SPAN` of the time, so a busier tier
 * comes in waves. It stays in the band between the body's rim and the
 * look's reach, outside the body so the body never hides it, and each
 * motif moves its own way round it: light rises up both sides, petals
 * and stars drift down from above, leaves swirl in, ash drifts up and
 * away, mist puffs out as one ring, and shards fly out in bursts, spinning.
 * A spawn's motes end at the rim, a dissolve's at the reach. Strength
 * swells quickly, holds and fades within the look's alpha; past the
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
  const share = index / look.motes;
  // Mist and leaves move as one ring over the whole time; the rest start in turn.
  const span = look.motif === "mist" || look.motif === "leaves" ? 1 : MOTE_SPAN;
  // Where on its side a mote flies, scattered so motes in flight together do not clump.
  const scatter = (index * GOLDEN) % 1;
  const start = share * (1 - span);
  const u = clamp01((t - start) / span);
  const side = index % 2 === 0 ? 1 : -1;
  const twinkle =
    look.motif === "stars" ? 1 + (TWINKLE - 1) * Math.max(0, 1 - Math.abs(t - TWINKLE_AT) * 10) : 1;
  const size = radius * MOTE_OF_BODY[look.motif] * twinkle;
  // The band a mote's centre keeps to: its near edge clear of the rim, its far edge within reach.
  const largest = radius * MOTE_OF_BODY[look.motif] * (look.motif === "stars" ? TWINKLE : 1);
  const near = radius + largest * 0.5;
  const far = radius + Math.max(largest * 0.5, radius * (look.ground?.radiusOfBody ?? 0) - largest);
  // The share of the way out across the band: a spawn gathers, a dissolve leaves.
  const out = look.kind === "spawn" ? 1 - u : u;
  let angle = phase + share * Math.PI * 2;
  let spin = angle;
  switch (look.motif) {
    case "light":
      // Up the side, from below the body to above it.
      angle = -UP + side * Math.PI * u + (scatter - 0.5) * 0.8;
      spin = angle;
      break;
    case "petals":
      // Down from above, swaying, onto the rim at the sides.
      angle = UP + side * (0.15 + 0.75 * scatter + 0.6 * u) * (Math.PI / 2);
      angle += PETAL_SWAY * Math.sin(Math.PI * 3 * u);
      spin = angle + Math.PI * 2 * u * side;
      break;
    case "stars":
      if (look.kind === "spawn") {
        // Falling stars: down from above onto the rim.
        angle = UP + side * (0.1 + 0.8 * scatter + 0.5 * u) * (Math.PI / 2);
      } else {
        // Shooting up and out, both sides.
        angle = -UP - side * (0.3 + 0.6 * scatter + 0.8 * u) * (Math.PI / 2);
      }
      spin = phase + Math.PI * u;
      break;
    case "leaves":
      angle += SWIRL_TURNS * Math.PI * 2 * u;
      spin = angle + Math.PI / 2;
      break;
    case "ash":
      // Up from round the rim and off to one side, like embers.
      angle = lerp(angle, UP + side * 0.6, u * u);
      spin = angle;
      break;
    case "mist":
      angle += 0.4 * u;
      break;
    case "shards": {
      const burst = Math.floor(share * SHARD_BURSTS);
      const within = share * SHARD_BURSTS - burst - 0.5;
      angle = phase + (burst / SHARD_BURSTS) * Math.PI * 2 + within * SHARD_FAN * (0.4 + u);
      spin = angle + SHARD_SPIN * Math.PI * 2 * u * side;
      break;
    }
  }
  const distance = lerp(near, far, out);
  const strength = (look.ground?.alpha ?? 0) * Math.min(1, SWELL * Math.sin(Math.PI * u));
  return {
    x: x + Math.cos(angle) * distance,
    y: y + Math.sin(angle) * distance,
    size,
    alpha: t >= 1 || u <= 0 || u >= 1 ? 0 : strength,
    spin,
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

/** A leaf, a petal or a shard at `mote`: a lens, or a triangle, along its spin. */
function bladePoints(mote: StyleMote, shard: boolean): { x: number; y: number }[] {
  const along = { x: Math.cos(mote.spin), y: Math.sin(mote.spin) };
  const across = { x: -along.y, y: along.x };
  const width = mote.size * 0.5;
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
  for (let i = 0; i < Math.min(look.motes, STYLE_MOTES); i += 1) {
    const mote = styleMote(look, i, x, y, radius, ageSeconds, phase);
    if (mote.alpha <= 0) {
      continue;
    }
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
        // Soft: a wide faint puff round a smaller core, together within the look's alpha.
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
