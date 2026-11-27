import { mixColour } from "./body-reactions.js";
import { FLAME_BASE_COLOUR, FLAME_TIP_COLOUR } from "./ground-effect-look.js";
import { FIRE_LIGHT_REACH } from "./lighting-model.js";

/**
 * What a fire area and a ward draw over their pool (#4054, the gothic
 * mock's `fireAoe` and `ward`): a fire area's flame tongues and a ward's
 * dome, as plain numbers for the scene to paint. Phaser-free, so it is
 * tested without a scene.
 */

/** How many flame tongues burn in one fire area. */
export const FLAME_TONGUES = 9;
/** How many stacked discs one tongue is drawn as, base to tip. */
export const FLAME_LAYERS = 6;
const FLAME_ALPHA = 0.9;
/** A tongue's base disc, and the least its tip shrinks to, world units. */
const FLAME_BASE_RADIUS = 5;
const FLAME_TIP_RADIUS = 0.8;
/** A tongue stands this high, plus a step for every other one. */
const FLAME_HEIGHT = 8;
const FLAME_HEIGHT_STEP = 4;
/** How far a tongue's tip sways, world units, and how fast it flickers. */
const FLAME_SWAY = 2;
const FLAME_RATE = 9;

/** Where one tongue stands, off its area's centre, and its own phase. */
export interface FlameTongue {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly phase: number;
}

/** mulberry32: the tongues' places, from the area's id alone, so they never jump. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/**
 * The `FLAME_TONGUES` tongues of fire area `id` of `radius`, spread round
 * its centre between 0.3 and 0.85 of the way out, back to front so the
 * nearer ones cover the farther.
 */
export function flameTongues(id: number, radius: number): readonly FlameTongue[] {
  const next = seeded(id);
  const tongues: FlameTongue[] = [];
  for (let index = 0; index < FLAME_TONGUES; index += 1) {
    const angle = ((index + next() * 0.6) / FLAME_TONGUES) * 2 * Math.PI;
    const out = radius * (0.3 + 0.55 * next());
    tongues.push({
      x: Math.cos(angle) * out,
      y: Math.sin(angle) * out,
      height: FLAME_HEIGHT + (index % 3) * FLAME_HEIGHT_STEP,
      phase: next() * 2 * Math.PI,
    });
  }
  return tongues.sort((a, b) => a.y - b.y);
}

/** One disc of a tongue: its centre off the area's, its size and colour. */
export interface FlameDisc {
  x: number;
  y: number;
  radius: number;
  colour: number;
  alpha: number;
}

/**
 * Disc `layer` of `tongue` at `now` seconds: it rises, narrows and warms
 * from deep red to pale gold, and sways and flickers more the higher it
 * is. Under reduced motion the flame stands still.
 */
export function flameDisc(
  tongue: FlameTongue,
  layer: number,
  now: number,
  reducedMotion: boolean,
  out: FlameDisc,
): FlameDisc {
  const t = layer / (FLAME_LAYERS - 1);
  const angle = reducedMotion ? 0 : now * FLAME_RATE + tongue.phase;
  const sway = reducedMotion ? 0 : Math.sin(angle + layer * 0.5) * FLAME_SWAY * t;
  const height = tongue.height * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(angle * 1.7));
  out.x = tongue.x + sway;
  out.y = tongue.y - height * t;
  out.radius = FLAME_BASE_RADIUS * (1 - t) + FLAME_TIP_RADIUS;
  out.colour = mixColour(FLAME_BASE_COLOUR, FLAME_TIP_COLOUR, t);
  out.alpha = FLAME_ALPHA;
  return out;
}

/** How many rings a fire area's glow is drawn as, the widest first. */
export const FIRE_GLOW_RINGS = 5;
/** The glow's alpha where every ring overlaps, at its centre. */
const FIRE_GLOW_ALPHA = 0.2;
/** How much the glow dims as it flickers, and how fast. */
const FIRE_GLOW_FLICKER = 0.25;
const FIRE_GLOW_RATE = 4;

/** One ring of a fire area's glow: its radius and its alpha. */
export interface GlowRing {
  radius: number;
  alpha: number;
}

/**
 * Ring `ring` of the warm glow round `fire` at `now` seconds: the rings
 * shrink inwards, so their overlap is brightest at the centre, and reach
 * past the pool as far as a fire's light does (#4057). The glow flickers
 * on its own phase, and holds steady under reduced motion.
 */
export function fireGlowRing(
  fire: { readonly id: number; readonly radius: number },
  ring: number,
  now: number,
  reducedMotion: boolean,
  out: GlowRing,
): GlowRing {
  const flicker = reducedMotion
    ? 1
    : 1 - FIRE_GLOW_FLICKER * (0.5 + 0.5 * Math.sin(now * FIRE_GLOW_RATE + fire.id));
  out.radius = fire.radius * FIRE_LIGHT_REACH * (1 - ring / FIRE_GLOW_RINGS);
  out.alpha = (FIRE_GLOW_ALPHA / FIRE_GLOW_RINGS) * flicker;
  return out;
}

/** How many stacked ellipses a ward's dome is drawn as. */
export const DOME_LAYERS = 12;
/** How high the dome rises on screen, as a share of its radius. */
export const DOME_RISE = 0.6;
/** Each layer leans this much left of the one under it, per unit risen. */
const DOME_LEAN = 0.3;

/** One ellipse of a dome: its centre off the ward's, its half-width and its alpha. */
export interface DomeLayer {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/**
 * Layer `index` of a dome over a ward of `radius`: a circle the sphere's
 * width at that height, lifted up to `DOME_RISE` of the radius and leaning
 * left, so the stack reads as a dome lit from the upper left. Each
 * layer is fainter low down, where the most of them overlap.
 */
export function domeLayer(radius: number, index: number, out: DomeLayer): DomeLayer {
  const t = index / DOME_LAYERS;
  const lift = radius * DOME_RISE * t;
  out.x = -DOME_LEAN * lift;
  out.y = -lift;
  out.radius = radius * Math.sqrt(1 - t * t);
  out.alpha = 0.035 + 0.03 * t;
  return out;
}

/** The dome's highlight: an ellipse on its upper left, off the ward's centre. */
export interface DomeHighlight {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The highlight of a dome over a ward of `radius`. */
export function domeHighlight(radius: number): DomeHighlight {
  return { x: -0.35 * radius, y: -0.75 * radius, width: 0.44 * radius, height: 0.24 * radius };
}
