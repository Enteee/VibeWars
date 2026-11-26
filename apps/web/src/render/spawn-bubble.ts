import {
  nearestOnHull,
  teamBubbleDepth,
  teamBubbleOutline,
  type TeamBubble,
  type Vec2,
} from "@vibewars/game-core";

/**
 * Your team's bubble before the start (#3909, #3930): your team is held
 * in the rounded shape round its spawns until the match starts, and this
 * is the wall that holds you. A low curtain stands up from a hard rim on
 * the ground, near-white so it reads on snow, sand and lava alike, and it
 * is neither help nor harm (visual-style §6). It is faint at rest and
 * brightens on the stretch you walk up to; a bump ripples where you met
 * it. Only your team's is drawn, and only before the start; it fades out
 * at it.
 */
export interface SpawnBubble {
  readonly bubble: TeamBubble;
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
  /** The rim along the ground, a closed loop. */
  | {
      readonly kind: "rim";
      readonly points: readonly Vec2[];
      readonly width: number;
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
/** Pieces a full turn of its round ends has, and slices up it, faintest at the top. */
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

/** The point on its edge nearest `body`: out from the hull, through it. */
function edgeNear(bubble: TeamBubble, body: Vec2): Vec2 {
  const on = nearestOnHull(body, bubble);
  const off = Math.hypot(body.x - on.x, body.y - on.y);
  // On the hull itself, any way out is as near: the first corner's way.
  const away = off === 0 ? { x: 1, y: 0 } : { x: (body.x - on.x) / off, y: (body.y - on.y) / off };
  return { x: on.x + bubble.radius * away.x, y: on.y + bubble.radius * away.y };
}

/** The point on the edge `body` touches, or `undefined` while it is clear of it. */
export function spawnBubbleContact(bubble: TeamBubble, body: Vec2): Vec2 | undefined {
  return teamBubbleDepth(body, bubble) <= SPAWN_BUBBLE_CONTACT ? edgeNear(bubble, body) : undefined;
}

/** Its opacity `goneSeconds` after the start: 1 before it, 0 once faded. */
export function spawnBubbleFade(goneSeconds: number | undefined): number {
  return goneSeconds === undefined ? 1 : Math.max(0, 1 - goneSeconds / SPAWN_BUBBLE_FADE_SECONDS);
}

/**
 * The edge cut in pieces no longer than a round end's: each straight side
 * in as many as it needs, so the brightening follows you along it too.
 */
function edgePieces(bubble: TeamBubble): readonly Vec2[] {
  const outline = teamBubbleOutline(bubble, SEGMENTS);
  const longest = (2 * Math.PI * bubble.radius) / SEGMENTS;
  return outline.flatMap((from, index) => {
    const to = outline[(index + 1) % outline.length] ?? from;
    const pieces = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / longest));
    return Array.from({ length: pieces }, (_, piece) => ({
      x: from.x + ((to.x - from.x) * piece) / pieces,
      y: from.y + ((to.y - from.y) * piece) / pieces,
    }));
  });
}

/** `point` on the ground, `height` up the curtain. */
function up(point: Vec2, height: number): Vec2 {
  return { x: point.x, y: point.y - height };
}

/**
 * The angle round a circle of `radius` whose chord is `chord`: how far
 * round the edge a piece is from where you meet it, as on a lone spawn's
 * circle; past its diameter, the far side.
 */
function chordAngle(chord: number, radius: number): number {
  return 2 * Math.asin(Math.min(1, chord / (2 * radius)));
}

/**
 * `bubble` at `seconds` on the scene's clock, with you at `body`
 * (`undefined`: nobody to brighten it for), faded to `fade`: the curtain,
 * its shimmer, the rim and its dark line, then the ripple of a bump
 * `bump.seconds` ago at `bump.at` on the edge. Lines are at least
 * `pixel` * 2 wide, `pixel` being a CSS pixel in world units. Under
 * reduced motion the shimmer stands still and a bump does not ripple.
 */
export function spawnBubbleCommands(
  bubble: TeamBubble,
  body: Vec2 | undefined,
  seconds: number,
  bump: { readonly at: Vec2; readonly seconds: number } | undefined,
  reducedMotion: boolean,
  fade: number,
  pixel: number,
): readonly SpawnBubbleCommand[] {
  if (fade <= 0) {
    return [];
  }
  const facing = body === undefined ? undefined : edgeNear(bubble, body);
  const near =
    body === undefined ? SPAWN_BUBBLE_REST_ALPHA : spawnBubbleAlpha(teamBubbleDepth(body, bubble));
  const commands: SpawnBubbleCommand[] = [];
  const edge = edgePieces(bubble);
  const slice = SPAWN_BUBBLE_HEIGHT / SLICES;
  const climb = reducedMotion ? 0 : seconds / SHIMMER_SECONDS;
  for (const [index, from] of edge.entries()) {
    const to = edge[(index + 1) % edge.length] ?? from;
    const arc =
      facing === undefined
        ? 0
        : spawnBubbleArc(
            chordAngle(
              Math.hypot((from.x + to.x) / 2 - facing.x, (from.y + to.y) / 2 - facing.y),
              bubble.radius,
            ),
          );
    const alpha = (SPAWN_BUBBLE_REST_ALPHA + (near - SPAWN_BUBBLE_REST_ALPHA) * arc) * fade;
    const piece = (low: number, high: number, opacity: number): void => {
      commands.push({
        kind: "quad",
        points: [up(from, low), up(to, low), up(to, high), up(from, high)],
        colour: SPAWN_BUBBLE_COLOUR,
        alpha: opacity,
      });
    };
    for (let level = 0; level < SLICES; level += 1) {
      piece(level * slice, (level + 1) * slice, alpha * (1 - level / SLICES));
    }
    for (let band = 0; band < SHIMMER_BANDS; band += 1) {
      const rise = (climb + band / SHIMMER_BANDS) % 1;
      const low = rise * SPAWN_BUBBLE_HEIGHT * (1 - SHIMMER_THICKNESS);
      piece(low, low + SPAWN_BUBBLE_HEIGHT * SHIMMER_THICKNESS, 0.5 * alpha * (1 - rise));
    }
  }
  const line = Math.max(2, 2 * pixel);
  commands.push(
    { kind: "rim", points: edge, width: line + 2 * pixel, colour: OUTLINE, alpha: 0.5 * fade },
    { kind: "rim", points: edge, width: line, colour: SPAWN_BUBBLE_COLOUR, alpha: 0.9 * fade },
  );
  if (bump !== undefined && !reducedMotion && bump.seconds < SPAWN_BUBBLE_RIPPLE_SECONDS) {
    const spread = bump.seconds / SPAWN_BUBBLE_RIPPLE_SECONDS;
    commands.push({
      kind: "ring",
      at: up(bump.at, SPAWN_BUBBLE_HEIGHT / 2),
      radius: 4 + 16 * spread,
      width: line,
      colour: SPAWN_BUBBLE_COLOUR,
      alpha: 0.9 * (1 - spread) * fade,
    });
  }
  return commands;
}
