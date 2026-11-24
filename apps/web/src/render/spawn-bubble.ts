import { SPAWN_BUBBLE_RADIUS, type Vec2 } from "@vibewars/game-core";

/**
 * Your spawn bubble before the start (#3909): you are held within
 * `SPAWN_BUBBLE_RADIUS` of your spawn until the match starts, and this is
 * the wall that holds you. A low curtain stands up from a hard rim on the
 * ground, near-white so it reads on snow, sand and lava alike, and it is
 * neither help nor harm (visual-style §6). It is faint at rest and
 * brightens on the arc you walk up to; a bump ripples where you met it.
 * Only yours is drawn, and only before the start; it fades out at it.
 */
export interface SpawnBubble {
  readonly centre: Vec2;
  /** The map layer you spawned on, whose height it is drawn at. */
  readonly layer: number;
}

/** One stroke of the bubble, in world units, for the scene to paint. */
export type SpawnBubbleCommand =
  /** A piece of the curtain, four corners on its surface. */
  | {
      readonly kind: "quad";
      readonly points: readonly [Vec2, Vec2, Vec2, Vec2];
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
    };

/** Neutral near-white: neither the help blue or green nor a warm harm. */
export const SPAWN_BUBBLE_COLOUR = 0xeef6ff;
/** The thin dark line under the rim that keeps it on bright ground. */
const OUTLINE = 0x1b2029;
/** How high the curtain stands: about one body tall. */
export const SPAWN_BUBBLE_HEIGHT = 40;
/** The curtain's opacity far from its edge. */
export const SPAWN_BUBBLE_REST_ALPHA = 0.15;
/** Its opacity where you touch it. */
export const SPAWN_BUBBLE_EDGE_ALPHA = 0.6;
/** How far from the edge it starts to brighten. */
export const SPAWN_BUBBLE_NEAR = 20;
/** How close to the edge counts as touching it: the hold pulled you back. */
export const SPAWN_BUBBLE_CONTACT = 1;
/** How long it takes to fade once the match starts. */
export const SPAWN_BUBBLE_FADE_SECONDS = 0.3;
/** How long a bump's ripple lasts. */
export const SPAWN_BUBBLE_RIPPLE_SECONDS = 0.3;
/** Pieces round the curtain, and slices up it, faintest at the top. */
const SEGMENTS = 48;
const SLICES = 5;
/** The shimmer: bands climbing it, one every `SHIMMER_SECONDS / SHIMMER_BANDS`. */
const SHIMMER_BANDS = 3;
const SHIMMER_SECONDS = 2.4;
const SHIMMER_THICKNESS = 0.08;

/** The curtain's opacity with you `distanceToEdge` inside it: 0.15 at rest, 0.6 at the edge. */
export function spawnBubbleAlpha(distanceToEdge: number): number {
  const near = Math.min(1, Math.max(0, 1 - distanceToEdge / SPAWN_BUBBLE_NEAR));
  return SPAWN_BUBBLE_REST_ALPHA + (SPAWN_BUBBLE_EDGE_ALPHA - SPAWN_BUBBLE_REST_ALPHA) * near;
}

/**
 * How much of the brightening a piece `angle` radians round from where
 * you face the edge gets: all of it there, half at 45°, none from 90°.
 */
export function spawnBubbleArc(angle: number): number {
  const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  return off >= Math.PI / 2 ? 0 : 0.5 + 0.5 * Math.cos(2 * off);
}

/** The direction from `centre` to the edge `body` touches, or `undefined` while it is clear of it. */
export function spawnBubbleContact(centre: Vec2, body: Vec2): number | undefined {
  const dx = body.x - centre.x;
  const dy = body.y - centre.y;
  return Math.hypot(dx, dy) >= SPAWN_BUBBLE_RADIUS - SPAWN_BUBBLE_CONTACT
    ? Math.atan2(dy, dx)
    : undefined;
}

/** Its opacity `goneSeconds` after the start: 1 before it, 0 once faded. */
export function spawnBubbleFade(goneSeconds: number | undefined): number {
  return goneSeconds === undefined ? 1 : Math.max(0, 1 - goneSeconds / SPAWN_BUBBLE_FADE_SECONDS);
}

/** The point on the curtain `angle` round its edge and `height` up it. */
function onCurtain(centre: Vec2, angle: number, height: number): Vec2 {
  return {
    x: centre.x + SPAWN_BUBBLE_RADIUS * Math.cos(angle),
    y: centre.y + SPAWN_BUBBLE_RADIUS * Math.sin(angle) - height,
  };
}

/**
 * The bubble round `centre` at `seconds` on the scene's clock, with you
 * at `body` (`undefined`: nobody to brighten it for), faded to `fade`:
 * the curtain, its shimmer, the rim and its dark line, then the ripple
 * of a bump `bump.seconds` ago at `bump.angle`. Lines are at least
 * `pixel` * 2 wide, `pixel` being a CSS pixel in world units. Under
 * reduced motion the shimmer stands still and a bump does not ripple.
 */
export function spawnBubbleCommands(
  centre: Vec2,
  body: Vec2 | undefined,
  seconds: number,
  bump: { readonly angle: number; readonly seconds: number } | undefined,
  reducedMotion: boolean,
  fade: number,
  pixel: number,
): readonly SpawnBubbleCommand[] {
  if (fade <= 0) {
    return [];
  }
  const facing = body === undefined ? undefined : Math.atan2(body.y - centre.y, body.x - centre.x);
  const near =
    body === undefined
      ? SPAWN_BUBBLE_REST_ALPHA
      : spawnBubbleAlpha(SPAWN_BUBBLE_RADIUS - Math.hypot(body.x - centre.x, body.y - centre.y));
  const commands: SpawnBubbleCommand[] = [];
  const step = (2 * Math.PI) / SEGMENTS;
  const slice = SPAWN_BUBBLE_HEIGHT / SLICES;
  const climb = reducedMotion ? 0 : seconds / SHIMMER_SECONDS;
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    const from = segment * step;
    const to = from + step;
    const arc = facing === undefined ? 0 : spawnBubbleArc((from + to) / 2 - facing);
    const alpha = (SPAWN_BUBBLE_REST_ALPHA + (near - SPAWN_BUBBLE_REST_ALPHA) * arc) * fade;
    const piece = (low: number, high: number, opacity: number): void => {
      commands.push({
        kind: "quad",
        points: [
          onCurtain(centre, from, low),
          onCurtain(centre, to, low),
          onCurtain(centre, to, high),
          onCurtain(centre, from, high),
        ],
        colour: SPAWN_BUBBLE_COLOUR,
        alpha: opacity,
      });
    };
    for (let level = 0; level < SLICES; level += 1) {
      piece(level * slice, (level + 1) * slice, alpha * (1 - level / SLICES));
    }
    for (let band = 0; band < SHIMMER_BANDS; band += 1) {
      const up = (climb + band / SHIMMER_BANDS) % 1;
      const low = up * SPAWN_BUBBLE_HEIGHT * (1 - SHIMMER_THICKNESS);
      piece(low, low + SPAWN_BUBBLE_HEIGHT * SHIMMER_THICKNESS, 0.5 * alpha * (1 - up));
    }
  }
  const line = Math.max(2, 2 * pixel);
  commands.push(
    {
      kind: "ring",
      at: centre,
      radius: SPAWN_BUBBLE_RADIUS,
      width: line + 2 * pixel,
      colour: OUTLINE,
      alpha: 0.5 * fade,
    },
    {
      kind: "ring",
      at: centre,
      radius: SPAWN_BUBBLE_RADIUS,
      width: line,
      colour: SPAWN_BUBBLE_COLOUR,
      alpha: 0.9 * fade,
    },
  );
  if (bump !== undefined && !reducedMotion && bump.seconds < SPAWN_BUBBLE_RIPPLE_SECONDS) {
    const spread = bump.seconds / SPAWN_BUBBLE_RIPPLE_SECONDS;
    commands.push({
      kind: "ring",
      at: onCurtain(centre, bump.angle, SPAWN_BUBBLE_HEIGHT / 2),
      radius: 4 + 16 * spread,
      width: line,
      colour: SPAWN_BUBBLE_COLOUR,
      alpha: 0.9 * (1 - spread) * fade,
    });
  }
  return commands;
}
