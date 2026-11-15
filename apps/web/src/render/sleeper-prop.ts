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
  /** The lantern's warm pool at its feet, unlit by the scene: it is the light. */
  | {
      readonly kind: "glow";
      readonly at: Vec2;
      readonly radius: number;
      readonly colour: number;
      readonly alpha: number;
    }
  /** The lying body: filled in `colour` lit where it lies, edged in a pale `rim`. */
  | {
      readonly kind: "body";
      readonly outline: readonly Point[];
      readonly colour: number;
      readonly rim: number;
    }
  /** The head, a disc at the body's top end, as the body is filled and edged. */
  | {
      readonly kind: "head";
      readonly at: Vec2;
      readonly radius: number;
      readonly colour: number;
      readonly rim: number;
    }
  /** A "z": three strokes in a box `size` wide, its middle at `at`. */
  | {
      readonly kind: "z";
      readonly at: Vec2;
      readonly size: number;
      readonly colour: number;
      readonly alpha: number;
    };

/** Head to feet, half of it: longer than a fighter's disc is wide, so it reads as a body. */
export const SLEEPER_RADIUS = 22;
/** Light stone grey: no team's colour, so it reads as nobody's, and pale on dark rock. */
export const SLEEPER_GREY = 0xb8b2a6;
/** The pale edge that lifts body and head off the rock. */
export const SLEEPER_RIM = 0xeae6dc;
/** How wide the rim is drawn, in world units. */
export const SLEEPER_RIM_WIDTH = 2;
/** The head's radius, against the body's. */
const HEAD_SCALE = 0.32;
/** The lantern's light: warm, dim, a pool round the feet. */
export const SLEEPER_GLOW = 0xffb25a;
const GLOW_RADIUS = 46;
const GLOW_ALPHA = 0.22;
/** The z's are pale, so they read over the ground at game size. */
const Z_COLOUR = 0xf4f1ea;
/** How many z's drift at once, and how long one takes to rise and fade. */
export const SLEEPER_ZS = 3;
export const SLEEPER_Z_SECONDS = 2;
/** How far a z rises while it fades. */
export const SLEEPER_Z_RISE = 32;
/** How big a z is when it is born: it grows a third as it rises. */
export const SLEEPER_Z_SIZE = 14;
/** How thick a z is stroked, in world units. */
export const SLEEPER_Z_WIDTH = 2.5;

/**
 * The sleeper at `position` at `seconds` on the scene's clock: the
 * lantern's glow at its feet, the body lying along `facing` with its head
 * at that end, then the z's over the head, each rising `SLEEPER_Z_RISE`
 * and fading over `SLEEPER_Z_SECONDS`, staggered by a third. Under reduced
 * motion two z's stand still.
 */
export function sleeperCommands(
  position: Vec2,
  facing: number,
  seconds: number,
  reducedMotion: boolean,
): readonly SleeperCommand[] {
  const along = (units: number): Vec2 => ({
    x: position.x + units * Math.cos(facing),
    y: position.y + units * Math.sin(facing),
  });
  const headRadius = SLEEPER_RADIUS * HEAD_SCALE;
  // The body from the feet to the neck; the head beyond it, the two apart.
  const bodyRadius = SLEEPER_RADIUS - headRadius;
  const middle = along(-headRadius);
  const headAt = along(SLEEPER_RADIUS - headRadius);
  const feet = along(-SLEEPER_RADIUS);
  const glow: SleeperCommand = {
    kind: "glow",
    at: feet,
    radius: GLOW_RADIUS,
    colour: SLEEPER_GLOW,
    alpha: GLOW_ALPHA,
  };
  const body: SleeperCommand = {
    kind: "body",
    outline: lyingPose(middle.x, middle.y, bodyRadius, facing).body,
    colour: SLEEPER_GREY,
    rim: SLEEPER_RIM,
  };
  const head: SleeperCommand = {
    kind: "head",
    at: headAt,
    radius: headRadius,
    colour: SLEEPER_GREY,
    rim: SLEEPER_RIM,
  };
  const zFrom = { x: headAt.x + headRadius, y: headAt.y - headRadius - SLEEPER_Z_SIZE / 2 };
  if (reducedMotion) {
    return [
      glow,
      body,
      head,
      { kind: "z", at: zFrom, size: SLEEPER_Z_SIZE, colour: Z_COLOUR, alpha: 0.9 },
      {
        kind: "z",
        at: { x: zFrom.x + 8, y: zFrom.y - SLEEPER_Z_RISE / 2 },
        size: SLEEPER_Z_SIZE * 1.2,
        colour: Z_COLOUR,
        alpha: 0.7,
      },
    ];
  }
  const zs = Array.from({ length: SLEEPER_ZS }, (_, k): SleeperCommand => {
    const age = sleeperZAge(seconds, k);
    return {
      kind: "z",
      at: { x: zFrom.x + 10 * age, y: zFrom.y - SLEEPER_Z_RISE * age },
      size: SLEEPER_Z_SIZE * (1 + 0.3 * age),
      colour: Z_COLOUR,
      alpha: 1 - age,
    };
  });
  return [glow, body, head, ...zs];
}

/** How far through its rise the `k`th z is at `seconds`, 0 to 1. */
export function sleeperZAge(seconds: number, k: number): number {
  const phase = seconds / SLEEPER_Z_SECONDS + k / SLEEPER_ZS;
  return phase - Math.floor(phase);
}
