import type { Vec2 } from "@vibewars/game-core";

/**
 * A goal on the ground (#3221), such as the tutorial's walk mark: a gold
 * ring about a body wide, softly pulsing, with a short column of light
 * rising from it. Client-only and yours alone; nobody else sees it. Once
 * it is gone from the snapshot it fades out over `GOAL_MARK_FADE_SECONDS`.
 */
export interface GoalMark {
  readonly id: string;
  readonly position: Vec2;
  /** The map layer it lies on, whose height it is drawn at. */
  readonly layer: number;
}

/** One stroke of the mark, in world units, for the scene to paint. */
export type GoalMarkCommand =
  | {
      readonly kind: "disc";
      readonly at: Vec2;
      readonly radius: number;
      readonly colour: number;
      readonly alpha: number;
    }
  | {
      readonly kind: "ring";
      readonly at: Vec2;
      readonly radius: number;
      readonly width: number;
      readonly colour: number;
      readonly alpha: number;
    }
  /** A slice of the column: a rectangle `width` wide rising `height` from `at`. */
  | {
      readonly kind: "band";
      readonly at: Vec2;
      readonly width: number;
      readonly height: number;
      readonly colour: number;
      readonly alpha: number;
    };

/** The ring's radius: a body's (14), plus a little, so it reads around one. */
export const GOAL_MARK_RADIUS = 16;
/** How long one pulse takes. */
export const GOAL_MARK_PULSE_SECONDS = 1.6;
/** How long it takes to fade once reached. */
export const GOAL_MARK_FADE_SECONDS = 0.3;
/** How high the column of light rises. */
export const GOAL_MARK_COLUMN = 44;
/** The palette's `altar` gold, never the target ring's yellow. */
const GOLD = 0xc8a45a;
/** The light at its heart. */
const GLOW = 0xf6e3a8;
/** The column's slices, faintest at the top. */
const COLUMN_SLICES = 6;

/** Its pulse, 0 to 1: steady at its middle under reduced motion. */
export function goalMarkPulse(seconds: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 0.5;
  }
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / GOAL_MARK_PULSE_SECONDS);
}

/** Its opacity `goneSeconds` after it left the snapshot: 1 while it stands, 0 once faded. */
export function goalMarkFade(goneSeconds: number | undefined): number {
  if (goneSeconds === undefined) {
    return 1;
  }
  return Math.max(0, 1 - goneSeconds / GOAL_MARK_FADE_SECONDS);
}

/**
 * The mark at `seconds` on the scene's clock, faded to `fade`: a soft glow
 * on the floor, the column over it, then the ring and its dark rim, which
 * keep it from looking pasted on.
 */
export function goalMarkCommands(
  position: Vec2,
  seconds: number,
  reducedMotion: boolean,
  fade: number,
): readonly GoalMarkCommand[] {
  if (fade <= 0) {
    return [];
  }
  const pulse = goalMarkPulse(seconds, reducedMotion);
  const radius = GOAL_MARK_RADIUS * (1 + 0.08 * pulse);
  const column = Array.from({ length: COLUMN_SLICES }, (_, slice): GoalMarkCommand => {
    const height = GOAL_MARK_COLUMN / COLUMN_SLICES;
    return {
      kind: "band",
      at: { x: position.x, y: position.y - slice * height },
      width: GOAL_MARK_RADIUS * 1.4,
      height,
      colour: GLOW,
      alpha: fade * (0.22 + 0.08 * pulse) * (1 - slice / COLUMN_SLICES),
    };
  });
  return [
    {
      kind: "disc",
      at: position,
      radius: radius * 1.5,
      colour: GOLD,
      alpha: fade * (0.14 + 0.08 * pulse),
    },
    { kind: "disc", at: position, radius, colour: GLOW, alpha: fade * 0.18 },
    ...column,
    { kind: "ring", at: position, radius, width: 5, colour: 0x2a2116, alpha: fade * 0.6 },
    {
      kind: "ring",
      at: position,
      radius,
      width: 3,
      colour: GOLD,
      alpha: fade * (0.8 + 0.2 * pulse),
    },
  ];
}
