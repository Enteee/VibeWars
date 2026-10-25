import type { Vec2 } from "@vibewars/game-core";

/**
 * The follow camera (#437 §3, #440): one pure state machine, stepped once a
 * frame. The scene only applies its `CameraView`.
 *
 * Every zoom step is a world-space view box of one 16:9 shape, the same
 * for every player (Q56): a window wider than 16:9 shows the box's full
 * width and crops its top and bottom, a narrower one its full height and
 * crops the sides. A bigger window shows the same world, sharper.
 *
 * Type imports only, so the e2e specs can import `zoomFor` to find a world
 * point on the canvas.
 */

/** World-unit height of the 16:9 view box per step (Q56): the same for every window. */
export const VIEW_STEPS = [
  { name: "Close", height: 640 },
  { name: "Near", height: 860 },
  { name: "Default", height: 1100 },
  { name: "Wide", height: 1400 },
] as const;
export const VIEW_ASPECT = 16 / 9;
/** Where every match and Training Ground session starts. */
export const DEFAULT_STEP = 2;

/** Share of the pointer's offset from the screen centre the camera leans by. */
export const LOOK_AHEAD = 0.22;
/** Per second, toward the look-ahead the pointer asks for. */
export const LOOK_AHEAD_RATE = 4;
/** Per second, toward the step's view box. */
export const ZOOM_RATE = 11;
/** A body that moves this far in one frame was put there, not walked: the view snaps. */
export const SNAP_DISTANCE = 200;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CameraRig {
  /** Index into `VIEW_STEPS`. */
  readonly step: number;
  /**
   * The view box's height, eased toward the step's. Eased as a height, not
   * a zoom, so a window resized mid-match keeps its view box at once.
   */
  readonly height: number;
  /** World units, the eased look-ahead. */
  readonly lead: Vec2;
  /** Where `self` was last frame; `undefined` snaps the next one. */
  readonly last: Vec2 | undefined;
}

export interface CameraInput {
  /** Your body, world units. */
  readonly self: Vec2;
  /** The canvas, CSS px. */
  readonly viewport: Size;
  /** Screen px on the canvas; `undefined` when off it. */
  readonly pointer: Vec2 | undefined;
  readonly reducedMotion: boolean;
  /** The arena's bounds, world units from (0, 0). */
  readonly arena: Size;
}

export interface CameraView {
  readonly x: number;
  readonly y: number;
  /** CSS px per world unit. */
  readonly zoom: number;
}

export function createCameraRig(): CameraRig {
  return {
    step: DEFAULT_STEP,
    height: viewHeight(DEFAULT_STEP),
    lead: { x: 0, y: 0 },
    last: undefined,
  };
}

function viewHeight(step: number): number {
  return VIEW_STEPS[step]?.height ?? VIEW_STEPS[DEFAULT_STEP].height;
}

/** CSS px per world unit for a view box `height` tall: the box fills the canvas, cropping the overflow axis. */
function zoomForHeight(height: number, viewport: Size): number {
  return Math.max(viewport.height / height, viewport.width / (height * VIEW_ASPECT));
}

/** CSS px per world unit for a canvas of this size: the box fills it, cropping the overflow axis. */
export function zoomFor(step: number, viewport: Size): number {
  return zoomForHeight(viewHeight(step), viewport);
}

/** One wheel notch: `1` (down) widens the view, `-1` (up) closes in; clamped at the ends. */
export function wheelNotch(rig: CameraRig, direction: -1 | 1): CameraRig {
  const step = Math.min(VIEW_STEPS.length - 1, Math.max(0, rig.step + direction));
  return step === rig.step ? rig : { ...rig, step };
}

/**
 * The centre on one axis: the arena edge stops the camera where the arena
 * is bigger than the view, and the arena is centred where it is smaller.
 */
function clampAxis(centre: number, arena: number, visible: number): number {
  if (arena <= visible) {
    return arena / 2;
  }
  return Math.min(arena - visible / 2, Math.max(visible / 2, centre));
}

export function stepCamera(
  rig: CameraRig,
  input: CameraInput,
  dt: number,
): { rig: CameraRig; view: CameraView } {
  const ease = (rate: number): number => (input.reducedMotion ? 1 : 1 - Math.exp(-rate * dt));
  const snap =
    rig.last === undefined ||
    Math.hypot(input.self.x - rig.last.x, input.self.y - rig.last.y) > SNAP_DISTANCE;

  const target = viewHeight(rig.step);
  const height = rig.height + (target - rig.height) * ease(ZOOM_RATE);
  const zoom = zoomForHeight(height, input.viewport);

  // Lean toward the pointer; with it off the canvas, back to centre.
  const want =
    input.pointer === undefined
      ? { x: 0, y: 0 }
      : {
          x: ((input.pointer.x - input.viewport.width / 2) * LOOK_AHEAD) / zoom,
          y: ((input.pointer.y - input.viewport.height / 2) * LOOK_AHEAD) / zoom,
        };
  const k = ease(LOOK_AHEAD_RATE);
  const lead = snap
    ? { x: 0, y: 0 }
    : { x: rig.lead.x + (want.x - rig.lead.x) * k, y: rig.lead.y + (want.y - rig.lead.y) * k };

  // Clamped after the lead, so leaning never shows the void past the edge.
  const view = {
    x: clampAxis(input.self.x + lead.x, input.arena.width, input.viewport.width / zoom),
    y: clampAxis(input.self.y + lead.y, input.arena.height, input.viewport.height / zoom),
    zoom,
  };
  return { rig: { step: rig.step, height, lead, last: input.self }, view };
}

/** How many `deltaY` units one notch takes, so a trackpad's stream steps once, not ten times. */
export const WHEEL_NOTCH_DELTA = 40;
/** After a notch, the wheel is ignored this long. */
export const WHEEL_LOCKOUT_MS = 110;
/** `deltaY` units per line and per page, for wheels that report those. */
const LINE_DELTA = 16;
const PAGE_DELTA = 800;

export interface WheelState {
  readonly accumulated: number;
  /** When the last notch went out, ms; `undefined` before the first. */
  readonly notchedAt: number | undefined;
}

export const WHEEL_IDLE: WheelState = { accumulated: 0, notchedAt: undefined };

/**
 * One `wheel` event: a notch once `WHEEL_NOTCH_DELTA` has gathered, then
 * nothing for `WHEEL_LOCKOUT_MS`. A turn the other way starts again.
 *
 * @param deltaMode `WheelEvent.deltaMode`: 0 pixels, 1 lines, 2 pages
 */
export function feedWheel(
  state: WheelState,
  deltaY: number,
  deltaMode: number,
  now: number,
): { state: WheelState; notch: -1 | 1 | undefined } {
  if (state.notchedAt !== undefined && now - state.notchedAt < WHEEL_LOCKOUT_MS) {
    return { state: { ...state, accumulated: 0 }, notch: undefined };
  }
  const delta = deltaY * (deltaMode === 1 ? LINE_DELTA : deltaMode === 2 ? PAGE_DELTA : 1);
  const turned = Math.sign(delta) !== Math.sign(state.accumulated);
  const accumulated = (turned ? 0 : state.accumulated) + delta;
  if (Math.abs(accumulated) < WHEEL_NOTCH_DELTA) {
    return { state: { ...state, accumulated }, notch: undefined };
  }
  return { state: { accumulated: 0, notchedAt: now }, notch: accumulated > 0 ? 1 : -1 };
}
