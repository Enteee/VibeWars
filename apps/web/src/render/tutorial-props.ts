import type { Vec2 } from "@vibewars/game-core";

import { lyingPose } from "./lying-pose.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A prop the scene draws (#3326): scenery only, such as the tutorial's
 * sleeping guard or its parasol (#3332). Nothing in the simulation knows
 * it is there, so it cannot be clicked, targeted or hurt. Client-only and
 * yours alone.
 */
export type TutorialProp = SleeperProp | ParasolProp;

/** The tutorial's sleeping guard (#3326), lying on top of a wall. */
export interface SleeperProp {
  readonly id: string;
  readonly kind: "sleeper";
  readonly position: Vec2;
  /** The map layer whose wall it lies on top of, lifted by both heights. */
  readonly layer: number;
  /** The way its body lies, in radians. */
  readonly facing: number;
}

/**
 * The tutorial's parasol and deck chair (#3332), standing on the ground
 * of `layer`: static, the deck chair east of the pole.
 */
export interface ParasolProp {
  readonly id: string;
  readonly kind: "parasol";
  /** The pole's foot. */
  readonly position: Vec2;
  /** The map layer whose ground it stands on. */
  readonly layer: number;
}

/** One stroke of any prop, in world units, for the scene to paint in its light. */
export type PropCommand = SleeperCommand | ParasolCommand;

/** One stroke of the sleeper, in world units, for the scene to paint in its light. */
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

/** One stroke of the parasol, in world units, for the scene to paint in its light. */
export type ParasolCommand =
  /** A filled outline, lit where it stands. */
  | {
      readonly kind: "shape";
      readonly outline: readonly Point[];
      readonly colour: number;
      readonly alpha: number;
    }
  /** A line through `points`, `width` wide, lit where it stands. */
  | {
      readonly kind: "stroke";
      readonly points: readonly Point[];
      readonly width: number;
      readonly colour: number;
    };

/** How high the canopy stands over the pole's foot: over a fighter's head. */
export const PARASOL_HEIGHT = 52;
/** The canopy's half width, and its half depth as the view tilts it. */
export const PARASOL_RADIUS = 46;
const CANOPY_DEPTH = 0.38;
/** How many panels the canopy has, red and cream in turn: an even count, so they alternate all round. */
export const PARASOL_PANELS = 8;
/** Beach red and cream: bright, warm, nobody's team colour, and loud on grey basalt. */
export const PARASOL_RED = 0xd8432f;
export const PARASOL_CREAM = 0xf4eee2;
/** The pale edge round the canopy. */
export const PARASOL_RIM = 0xfffaf0;
/** The pole and the chair's frame: weathered wood. */
export const PARASOL_WOOD = 0x9a6a3e;
/** The chair's cloth: blue and cream stripes, so it reads apart from the canopy. */
export const CHAIR_BLUE = 0x2f7fb8;
/** The canopy's shade on the ground, and how dark. */
const SHADE = 0x14100c;
const SHADE_ALPHA = 0.3;
/** How many stripes run along the chair's cloth. */
export const CHAIR_STRIPES = 3;

/** A flattened ellipse of `steps` points round `centre`, from `from` to `to` radians. */
function arc(
  centre: Vec2,
  radius: number,
  depth: number,
  from: number,
  to: number,
  steps: number,
): Point[] {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const angle = from + ((to - from) * k) / steps;
    return {
      x: centre.x + radius * Math.cos(angle),
      y: centre.y + radius * depth * Math.sin(angle),
    };
  });
}

/**
 * The parasol at `position`: its shade on the ground, the deck chair
 * east of the pole, the pole, then the canopy on top in red and cream
 * panels, edged pale. Static: it does not move, so reduced motion needs
 * nothing of it.
 */
export function parasolCommands(position: Vec2): readonly ParasolCommand[] {
  const top = { x: position.x, y: position.y - PARASOL_HEIGHT };
  const shade: ParasolCommand = {
    kind: "shape",
    outline: arc(
      { x: position.x + 8, y: position.y + 4 },
      PARASOL_RADIUS,
      CANOPY_DEPTH,
      0,
      2 * Math.PI,
      24,
    ),
    colour: SHADE,
    alpha: SHADE_ALPHA,
  };
  // The deck chair, east of the pole, leaning back to the east: its seat
  // along the ground, its back raised behind it, each a strip of cloth.
  const seatFrom = { x: position.x + 14, y: position.y + 14 };
  const seatTo = { x: position.x + 42, y: position.y + 10 };
  const backTop = { x: position.x + 56, y: position.y - 18 };
  const half = 9;
  const strip = (from: Point, to: Point): readonly Point[] => [
    { x: from.x, y: from.y - half },
    { x: to.x, y: to.y - half },
    { x: to.x, y: to.y + half },
    { x: from.x, y: from.y + half },
  ];
  const cloth = (from: Point, to: Point): ParasolCommand[] =>
    Array.from({ length: CHAIR_STRIPES }, (_, k): ParasolCommand => {
      const at = (t: number): Point => ({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
      return {
        kind: "shape",
        outline: strip(at(k / CHAIR_STRIPES), at((k + 1) / CHAIR_STRIPES)),
        colour: k % 2 === 0 ? CHAIR_BLUE : PARASOL_CREAM,
        alpha: 1,
      };
    });
  const frame = (points: readonly Point[]): ParasolCommand => ({
    kind: "stroke",
    points,
    width: 3,
    colour: PARASOL_WOOD,
  });
  const chair: ParasolCommand[] = [
    frame([
      { x: seatFrom.x, y: seatFrom.y + half + 6 },
      { x: seatFrom.x, y: seatFrom.y + half },
    ]),
    frame([
      { x: seatTo.x, y: seatTo.y + half + 8 },
      { x: seatTo.x, y: seatTo.y + half },
    ]),
    ...cloth(seatFrom, seatTo),
    ...cloth(seatTo, backTop),
    frame([
      { x: seatFrom.x, y: seatFrom.y + half },
      { x: seatTo.x, y: seatTo.y + half },
      { x: backTop.x, y: backTop.y + half },
    ]),
  ];
  const pole = frame([position, top]);
  const panels = Array.from({ length: PARASOL_PANELS }, (_, k): ParasolCommand => {
    const from = (2 * Math.PI * k) / PARASOL_PANELS;
    const to = (2 * Math.PI * (k + 1)) / PARASOL_PANELS;
    return {
      kind: "shape",
      outline: [top, ...arc(top, PARASOL_RADIUS, CANOPY_DEPTH, from, to, 4)],
      colour: k % 2 === 0 ? PARASOL_RED : PARASOL_CREAM,
      alpha: 1,
    };
  });
  const edge: ParasolCommand = {
    kind: "stroke",
    points: arc(top, PARASOL_RADIUS, CANOPY_DEPTH, 0, 2 * Math.PI, 32),
    width: 2,
    colour: PARASOL_RIM,
  };
  return [shade, ...chair, pole, ...panels, edge];
}
