import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";

import { emblemShape, EMBLEM_SIZE, type CapeEmblem, type EmblemPart } from "./cape-shape.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * The guild cape in motion (#1699): variant A of the study (#1686,
 * `scripts/assets/cape-motion-study.mjs`, `makeCape`, `stepCape`,
 * `target`, `shapeA`). Standing, it is a thin band on the rim; walking, the
 * band peels off into a tab that trails opposite the MOVEMENT, not the
 * facing, and swings round a turn on a spring. Pure; `body-painter.ts`
 * draws it, the arena steps one per caped body every frame.
 *
 * The study's springs are tuned for its clip: a body that runs at `RUN`
 * and reaches it with a `BODY_LAG` lag. A game body runs at the ruleset's
 * top speed and starts and stops at once, so the cape sees the game's
 * velocity scaled to the study's run and lagged as the study's body was.
 * A running body then looks exactly like the clip. The tab's node lives
 * relative to the body, in the study's units, for the same reason.
 */

/** The study's run speed, units per second, and how long its body takes to reach it. */
const RUN = 40;
const BODY_LAG = 0.09;
/** Game velocity to the study's. */
const STUDY_SPEED = RUN / MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
/** How far past the rim the tab's node sits at full unfold. */
export const CAPE_LENGTH = 17;
/** Below this study speed the trail keeps the way it last pointed. */
const TRAIL_SPEED = 3;
const TRAIL_LAG = 0.06;
/** Unfolding starts at this study speed, is full at 3/4 of the run, and lags this long. */
const UNFOLD_FROM = 4;
const UNFOLD_LAG = 0.2;
/** The node's spring and its damping ratio. */
const SPRING = 260;
const DAMPING = 0.55;
/** The longest step a spring takes: a background tab must not explode it. */
export const MAX_STEP_SECONDS = 1 / 20;
/** A jump further than this many radii in one frame is a teleport: the cape starts over. */
const JUMP_RADII = 3;

/** One cape's state, mutated by `stepCapeMotion`. */
export interface CapeMotion {
  /** The unit trail direction, opposite the movement. */
  trailX: number;
  trailY: number;
  /** How unfolded: 0 a band, 1 a full tab. */
  unfold: number;
  /** The tab's node relative to the body's centre, and its velocity, in study units. */
  nodeX: number;
  nodeY: number;
  nodeVx: number;
  nodeVy: number;
  /** The body's velocity as the study's body would have it. */
  bodyVx: number;
  bodyVy: number;
  /** False until the first step, which puts the node on its target. */
  primed: boolean;
}

/** A folded cape, trailing to -x: the menu's figure faces +x. */
export function newCapeMotion(): CapeMotion {
  return {
    trailX: -1,
    trailY: 0,
    unfold: 0,
    nodeX: 0,
    nodeY: 0,
    nodeVx: 0,
    nodeVy: 0,
    bodyVx: 0,
    bodyVy: 0,
    primed: false,
  };
}

/** What the cape follows: the body's centre, radius and velocity in world units. */
export interface CapeBody {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly vx: number;
  readonly vy: number;
}

/** The study's `smooth`: 0 below 0, 1 above 1, smoothstep between. */
function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Step `state` by `dt` seconds, clamped to `MAX_STEP_SECONDS`. */
export function stepCapeMotion(state: CapeMotion, dt: number, body: CapeBody): void {
  const step = Math.min(MAX_STEP_SECONDS, Math.max(0, dt));
  const lag = 1 - Math.exp(-step / BODY_LAG);
  state.bodyVx += (body.vx * STUDY_SPEED - state.bodyVx) * lag;
  state.bodyVy += (body.vy * STUDY_SPEED - state.bodyVy) * lag;
  const vx = state.bodyVx;
  const vy = state.bodyVy;
  const speed = Math.hypot(vx, vy);
  if (speed > TRAIL_SPEED) {
    const k = 1 - Math.exp(-step / TRAIL_LAG);
    const tx = state.trailX + (-vx / speed - state.trailX) * k;
    const ty = state.trailY + (-vy / speed - state.trailY) * k;
    const m = Math.hypot(tx, ty) || 1;
    state.trailX = tx / m;
    state.trailY = ty / m;
  }
  const want = smooth((speed - UNFOLD_FROM) / (RUN * 0.75 - UNFOLD_FROM));
  state.unfold += (want - state.unfold) * (1 - Math.exp(-step / UNFOLD_LAG));
  // On the trail line, `CAPE_LENGTH` past the rim at full unfold.
  const reach = body.r - 1 + CAPE_LENGTH * state.unfold;
  const targetX = state.trailX * reach;
  const targetY = state.trailY * reach;
  if (!state.primed) {
    state.nodeX = targetX;
    state.nodeY = targetY;
    state.primed = true;
    return;
  }
  const damp = 2 * Math.sqrt(SPRING) * DAMPING;
  state.nodeVx += (SPRING * (targetX - state.nodeX) - damp * state.nodeVx) * step;
  state.nodeVy += (SPRING * (targetY - state.nodeY) - damp * state.nodeVy) * step;
  // The node moves in the world; the body moves under it.
  state.nodeX += (state.nodeVx - vx) * step;
  state.nodeY += (state.nodeVy - vy) * step;
}

/** Whether a body moved `distance` in one frame further than a walk can: the cape starts over. */
export function capeJumped(distance: number, r: number): boolean {
  return distance > r * JUMP_RADII;
}

/** Start `state` over where it is, folded: after a teleport, a shadow step or a respawn. */
export function reprimeCapeMotion(state: CapeMotion): void {
  Object.assign(state, newCapeMotion(), { trailX: state.trailX, trailY: state.trailY });
}

/** The thin band on the rim: an arc of `radius` from `from` to `to`, radians. */
export interface CapeBand {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly from: number;
  readonly to: number;
}

export interface CapeShape {
  readonly band: CapeBand;
  /** The cloth: one closed polygon, root to hem and back. */
  readonly cloth: readonly Point[];
  /** The hem, point to notch to point: the trim. */
  readonly trim: readonly Point[];
  readonly emblem: readonly EmblemPart[];
}

/** How far out of the rim the band's centre line runs. */
const BAND_OUT = 0.9;
/** The band's half span, folded, and how much of it the tab takes. */
const BAND_SPAN = (52 * Math.PI) / 180;
const BAND_SPAN_TAKEN = (22 * Math.PI) / 180;
/** The study draws its chevron 1.1 times the cape emblem's size. */
const EMBLEM_SCALE = 1.1;

/**
 * The cape on `body` as `state` has it: the study's `shapeA`, a tab from
 * under the disc to the node with a notched hem, its band narrowing as it
 * grows, the emblem riding out on it.
 */
export function capeMotionShape(
  state: CapeMotion,
  body: { readonly x: number; readonly y: number; readonly r: number },
  emblem: CapeEmblem,
): CapeShape {
  const { x, y, r } = body;
  const u = state.unfold;
  const distance = Math.hypot(state.nodeX, state.nodeY);
  const dx = distance < 1e-3 ? state.trailX : state.nodeX / distance;
  const dy = distance < 1e-3 ? state.trailY : state.nodeY / distance;
  const angle = Math.atan2(dy, dx);
  const len = Math.max(r - 1, distance);
  const at = (along: number, aside: number): Point => ({
    x: x + dx * along + dy * aside,
    y: y + dy * along - dx * aside,
  });
  const width = 3 + 4.5 * u;
  const rootHalf = (3 + 5 * u) * 1.4;
  const hemLeft = at(len, -width);
  const notch = at(len - 4.5 * u, 0);
  const hemRight = at(len, width);
  const span = BAND_SPAN - BAND_SPAN_TAKEN * u;
  return {
    band: { x, y, radius: r + BAND_OUT, from: angle - span, to: angle + span },
    cloth: [at(r - 3, -rootHalf), hemLeft, notch, hemRight, at(r - 3, rootHalf)],
    trim: [hemLeft, notch, hemRight],
    // Its up is the tab's left side, as the study turns it.
    emblem: emblemShape(
      emblem,
      { x: x + dx * (r + 4 * u), y: y + dy * (r + 4 * u) },
      angle + Math.PI / 2,
      EMBLEM_SIZE * EMBLEM_SCALE,
    ),
  };
}
