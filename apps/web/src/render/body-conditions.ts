import type { Vec2 } from "@vibewars/game-core";

/**
 * The cues a burning, bleeding or poisoned body shows (#1138,
 * docs/art/art-direction.md "Player mark"): flames flickering on its top
 * edge, drops falling from its bottom edge, bubbles rising from its upper
 * flanks. Shape tells them apart without the colour. At most two per
 * body; the status row still lists every condition.
 *
 * Offsets from the body's centre, world units, y down. Everything stays
 * inside r + 6: clear of the target ring, under the health bar and the
 * status row. Under reduced motion each cue is the same marks, frozen.
 *
 * No Phaser here, so the geometry can be tested in Node.
 */

export type ConditionCue = "burning" | "bleeding" | "poisoned";

/** At most this many cues per body, in `CUE_PRIORITY` order. */
export const MAX_CONDITION_CUES = 2;

const CUE_PRIORITY: readonly ConditionCue[] = ["burning", "bleeding", "poisoned"];

const CUE_BY_STATUS: ReadonlyMap<string, ConditionCue> = new Map([
  ["burning", "burning"],
  ["bleeding", "bleeding"],
  ["poison", "poisoned"],
  ["disease", "poisoned"],
]);

const NO_CUES: readonly ConditionCue[] = [];

/** The cues `statuses` call for, by priority, capped. A status with no cue is ignored. */
export function conditionCues(statuses: readonly string[]): readonly ConditionCue[] {
  let found: Set<ConditionCue> | undefined;
  for (const id of statuses) {
    const cue = CUE_BY_STATUS.get(id);
    if (cue !== undefined) {
      found ??= new Set();
      found.add(cue);
    }
  }
  if (found === undefined) {
    return NO_CUES;
  }
  const cues = found;
  return CUE_PRIORITY.filter((cue) => cues.has(cue)).slice(0, MAX_CONDITION_CUES);
}

/** A stable fraction in [0, 1) from the body's id (FNV-1a), so a burning team does not flicker in step. */
export function cuePhase(actorId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < actorId.length; i += 1) {
    hash ^= actorId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

export type CueMark =
  | {
      readonly kind: "flame";
      readonly points: readonly [Vec2, Vec2, Vec2];
      readonly colour: number;
    }
  | {
      readonly kind: "drop" | "bubble";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly alpha: number;
      readonly colour: number;
    };

/** The `condition`, `damage` and `poison` palette colours. */
export const FLAME_COLOUR = 0xffa657;
export const DROP_COLOUR = 0xff7b72;
export const BUBBLE_COLOUR = 0xb4d62c;

/** Seconds per flicker; the three flames run a third of it apart. */
export const FLAME_PERIOD = 0.3;
/** Each flame's angle, and its height frozen under reduced motion. */
const FLAMES = [
  { angle: -Math.PI / 2 - 0.5, frozen: 4.5 },
  { angle: -Math.PI / 2, frozen: 6 },
  { angle: -Math.PI / 2 + 0.5, frozen: 4.5 },
] as const;
const FLAME_BASE = 3;
/** The base's middle, past which the flame overlaps the body's edge. */
const FLAME_BASE_INSET = 1;
const FLAME_MIN = 3;
const FLAME_MAX = 6;

/** Seconds per drop; one falls at a time, alternating sides. */
export const DROP_PERIOD = 0.4;
const DROP_RADIUS = 1.25;
const DROP_SIDE = 3;
const DROP_FALL = 4.75;
const DROP_FADED = 0.3;
const DROP_FROZEN_FALL = 3;

/** Seconds per bubble's rise; the two run half of it apart. */
export const BUBBLE_PERIOD = 1.2;
const BUBBLE_ANGLES = [-Math.PI / 2 - 1, -Math.PI / 2 + 1] as const;
const BUBBLE_RISE = 4;
const BUBBLE_RADIUS_FROM = 0.75;
const BUBBLE_RADIUS_TO = 1.5;
const BUBBLE_FROZEN_RISE = 2;
const BUBBLE_FROZEN_RADIUS = 1.25;

function fraction(value: number): number {
  return value - Math.floor(value);
}

/** 0 → 1 → 0 over one unit. */
function triangleWave(u: number): number {
  return 1 - Math.abs(2 * fraction(u) - 1);
}

function flame(radius: number, angle: number, height: number): CueMark {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const base = radius - FLAME_BASE_INSET;
  const half = FLAME_BASE / 2;
  return {
    kind: "flame",
    points: [
      { x: dx * base - dy * half, y: dy * base + dx * half },
      { x: dx * base + dy * half, y: dy * base - dx * half },
      { x: dx * (radius + height), y: dy * (radius + height) },
    ],
    colour: FLAME_COLOUR,
  };
}

/**
 * The marks of one cue on a body of `radius` at scene time `t`, seconds;
 * `phase` from `cuePhase`. `reducedMotion` gives the frozen form, which
 * does not depend on `t` or `phase`.
 */
export function conditionMarks(
  cue: ConditionCue,
  radius: number,
  t: number,
  phase: number,
  reducedMotion: boolean,
): readonly CueMark[] {
  switch (cue) {
    case "burning":
      return FLAMES.map(({ angle, frozen }, i) => {
        const height = reducedMotion
          ? frozen
          : FLAME_MIN +
            (FLAME_MAX - FLAME_MIN) * triangleWave(t / FLAME_PERIOD + phase + i / FLAMES.length);
        return flame(radius, angle, height);
      });
    case "bleeding": {
      if (reducedMotion) {
        return [
          {
            kind: "drop",
            x: 0,
            y: radius + DROP_FROZEN_FALL,
            radius: DROP_RADIUS,
            alpha: 1,
            colour: DROP_COLOUR,
          },
        ];
      }
      const clock = t / DROP_PERIOD + phase;
      const u = fraction(clock);
      const side = Math.floor(clock) % 2 === 0 ? -DROP_SIDE : DROP_SIDE;
      return [
        {
          kind: "drop",
          x: side,
          y: radius + DROP_FALL * u,
          radius: DROP_RADIUS,
          alpha: 1 - (1 - DROP_FADED) * u,
          colour: DROP_COLOUR,
        },
      ];
    }
    case "poisoned":
      return BUBBLE_ANGLES.map((angle, i) => {
        const u = reducedMotion
          ? 0
          : fraction(t / BUBBLE_PERIOD + phase + i / BUBBLE_ANGLES.length);
        return {
          kind: "bubble",
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius - (reducedMotion ? BUBBLE_FROZEN_RISE : BUBBLE_RISE * u),
          radius: reducedMotion
            ? BUBBLE_FROZEN_RADIUS
            : BUBBLE_RADIUS_FROM + (BUBBLE_RADIUS_TO - BUBBLE_RADIUS_FROM) * u,
          alpha: reducedMotion ? 1 : 1 - u,
          colour: BUBBLE_COLOUR,
        };
      });
  }
}
