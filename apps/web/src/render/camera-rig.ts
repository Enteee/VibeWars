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
 * The box is fitted to `scaleTo`, a match's canvas, not always to the
 * canvas drawn on (#709): the Training Ground's smaller stage shows less
 * of the world at a match's scale, rather than all of it shrunk.
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

/** Per second, toward the step's view box. */
export const ZOOM_RATE = 11;
/** A body that moves this far in one frame was put there, not walked: the view snaps. */
export const SNAP_DISTANCE = 200;
/** A pan keeps you at least this far inside the canvas edge, CSS px (#437 §3, #442). */
export const LEASH_MARGIN_PX = 48;
/** Per second, a released pan's way back to you: about 0.4 s. */
export const RETURN_RATE = 7;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Canvas px the HUD covers at the top and bottom edges, CSS px: the
 * off-screen edge markers keep clear of it.
 */
export interface Cover {
  readonly top: number;
  readonly bottom: number;
}

export const NO_COVER: Cover = { top: 0, bottom: 0 };

export interface CameraRig {
  /** Index into `VIEW_STEPS`. */
  readonly step: number;
  /**
   * The view box's height, eased toward the step's. Eased as a height, not
   * a zoom, so a window resized mid-match keeps its view box at once.
   */
  readonly height: number;
  /** World units from you, set by the RMB pan (#442); leashed every frame. */
  readonly offset: Vec2;
  /** RMB is held in a pan: the offset holds. */
  readonly panning: boolean;
  /** Where `self` was last frame; `undefined` snaps the next one. */
  readonly last: Vec2 | undefined;
}

export interface CameraInput {
  /** Your body, world units. */
  readonly self: Vec2;
  /** The canvas, CSS px. */
  readonly viewport: Size;
  /** The canvas whose view box sets the zoom, CSS px: a match's (#709). */
  readonly scaleTo: Size;
  readonly reducedMotion: boolean;
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
    offset: { x: 0, y: 0 },
    panning: false,
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
 * `offset` cut to the leash: the camera's centre stays within
 * `(viewport / 2 − LEASH_MARGIN_PX) / zoom` of you on each axis, so you
 * stay `LEASH_MARGIN_PX` inside the canvas edge.
 */
export function clampToLeash(offset: Vec2, viewport: Size, zoom: number): Vec2 {
  const lx = Math.max(0, (viewport.width / 2 - LEASH_MARGIN_PX) / zoom);
  const ly = Math.max(0, (viewport.height / 2 - LEASH_MARGIN_PX) / zoom);
  return {
    x: Math.min(lx, Math.max(-lx, offset.x)),
    y: Math.min(ly, Math.max(-ly, offset.y)),
  };
}

/**
 * An RMB drag of `deltaPx` screen px (#442): the view looks the way you
 * drag, as far as the leash lets it. The offset is from you, so it holds
 * while you walk.
 */
export function panBy(rig: CameraRig, deltaPx: Vec2, viewport: Size, scaleTo: Size): CameraRig {
  const zoom = zoomForHeight(rig.height, scaleTo);
  const offset = clampToLeash(
    { x: rig.offset.x + deltaPx.x / zoom, y: rig.offset.y + deltaPx.y / zoom },
    viewport,
    zoom,
  );
  return { ...rig, offset, panning: true };
}

/** RMB let go: the offset glides back to you, or snaps under reduced motion. */
export function releasePan(rig: CameraRig): CameraRig {
  return rig.panning ? { ...rig, panning: false } : rig;
}

/** Back on you at once, with no glide: you died. */
export function dropPan(rig: CameraRig): CameraRig {
  return { ...rig, offset: { x: 0, y: 0 }, panning: false };
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
  const zoom = zoomForHeight(height, input.scaleTo);

  // A held pan stays; a released one glides home. Leashed every frame,
  // as a zoom in shrinks the leash. A snap drops it. The pointer never
  // moves the view (#1019): only you and the pan do.
  const held = rig.panning ? 1 : 1 - ease(RETURN_RATE);
  const offset = snap
    ? { x: 0, y: 0 }
    : clampToLeash({ x: rig.offset.x * held, y: rig.offset.y * held }, input.viewport, zoom);

  // Not clamped to the map (#721): dragging toward an edge looks past it,
  // as anywhere else. Only the leash holds you on screen.
  const view = {
    x: input.self.x + offset.x,
    y: input.self.y + offset.y,
    zoom,
  };
  return {
    rig: { step: rig.step, height, offset, panning: rig.panning, last: input.self },
    view,
  };
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
