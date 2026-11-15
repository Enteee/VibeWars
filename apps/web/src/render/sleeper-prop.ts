import type { Vec2 } from "@vibewars/game-core";

import { lyingPose } from "./lying-pose.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A prop the scene draws (#3326): scenery only, such as the tutorial's
 * sleeping guard. Nothing in the simulation knows it is there, so it
 * cannot be clicked, targeted or hurt. Client-only and yours alone.
 */
export interface SleeperProp {
  readonly id: string;
  readonly kind: "sleeper";
  readonly position: Vec2;
  /** The map layer whose wall it lies on top of, lifted by both heights. */
  readonly layer: number;
  /** The way its body lies, in radians. */
  readonly facing: number;
}

/** One stroke of the prop, in world units, for the scene to paint in its light. */
export type SleeperCommand =
  /** The lying body: filled in `colour` lit where it lies, edged as a body is. */
  | { readonly kind: "body"; readonly outline: readonly Point[]; readonly colour: number }
  /** A "z": three strokes in a box `size` wide, its middle at `at`. */
  | {
      readonly kind: "z";
      readonly at: Vec2;
      readonly size: number;
      readonly colour: number;
      readonly alpha: number;
    };

/** A body's disc, a little small: a figure lying down, not a fighter. */
export const SLEEPER_RADIUS = 10;
/** Neutral stone grey: no team's colour, so it reads as nobody's. */
export const SLEEPER_GREY = 0x9a948a;
/** The z's are pale, so they read over the ground at game size. */
const Z_COLOUR = 0xe8e4dc;
/** How many z's drift at once, and how long one takes to rise and fade. */
export const SLEEPER_ZS = 3;
export const SLEEPER_Z_SECONDS = 2;
/** How far a z rises while it fades. */
export const SLEEPER_Z_RISE = 12;
/** Where the z's start, over the head, and how big they are. */
const Z_START = { x: 6, y: -10 };
const Z_SIZE = 5;

/**
 * The sleeper at `position` at `seconds` on the scene's clock: the body
 * lying along `facing`, then the z's over its head, each rising
 * `SLEEPER_Z_RISE` and fading over `SLEEPER_Z_SECONDS`, staggered by a
 * third. Under reduced motion two z's stand still.
 */
export function sleeperCommands(
  position: Vec2,
  facing: number,
  seconds: number,
  reducedMotion: boolean,
): readonly SleeperCommand[] {
  const body: SleeperCommand = {
    kind: "body",
    outline: lyingPose(position.x, position.y, SLEEPER_RADIUS, facing).body,
    colour: SLEEPER_GREY,
  };
  const head = { x: position.x + Z_START.x, y: position.y + Z_START.y };
  if (reducedMotion) {
    return [
      body,
      { kind: "z", at: head, size: Z_SIZE, colour: Z_COLOUR, alpha: 0.9 },
      {
        kind: "z",
        at: { x: head.x + 5, y: head.y - SLEEPER_Z_RISE / 2 },
        size: Z_SIZE * 1.2,
        colour: Z_COLOUR,
        alpha: 0.7,
      },
    ];
  }
  const zs = Array.from({ length: SLEEPER_ZS }, (_, k): SleeperCommand => {
    const age = sleeperZAge(seconds, k);
    return {
      kind: "z",
      at: { x: head.x + 4 * age, y: head.y - SLEEPER_Z_RISE * age },
      size: Z_SIZE * (1 + 0.3 * age),
      colour: Z_COLOUR,
      alpha: 1 - age,
    };
  });
  return [body, ...zs];
}

/** How far through its rise the `k`th z is at `seconds`, 0 to 1. */
export function sleeperZAge(seconds: number, k: number): number {
  const phase = seconds / SLEEPER_Z_SECONDS + k / SLEEPER_ZS;
  return phase - Math.floor(phase);
}
