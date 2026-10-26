import { describe, expect, it } from "vitest";

import { LONG_BOW_RANGE } from "@vibewars/game-core";

import {
  DEFAULT_STEP,
  LEASH_MARGIN_PX,
  VIEW_ASPECT,
  VIEW_STEPS,
  WHEEL_IDLE,
  WHEEL_LOCKOUT_MS,
  createCameraRig,
  dropPan,
  feedWheel,
  panBy,
  releasePan,
  stepCamera,
  wheelNotch,
  zoomFor,
  NO_COVER,
  type CameraInput,
  type CameraRig,
} from "./camera-rig.js";

const FRAME = 1 / 60;
/** A big arena, so nothing is clamped unless a test walks to its edge. */
const BIG = { width: 10_000, height: 10_000 };

/** A match's camera: the canvas sets its own zoom, unless a test says otherwise. */
const input = (overrides: Partial<CameraInput> = {}): CameraInput => ({
  self: { x: 5_000, y: 5_000 },
  viewport: overrides.viewport ?? { width: 1280, height: 720 },
  scaleTo: overrides.viewport ?? { width: 1280, height: 720 },
  pointer: undefined,
  reducedMotion: false,
  arena: BIG,
  cover: NO_COVER,
  ...overrides,
});

const stepName = (rig: CameraRig): string | undefined => VIEW_STEPS[rig.step]?.name;

/** `frames` steps of the camera on one input. */
function run(rig: CameraRig, at: CameraInput, frames: number) {
  let state = { rig, view: { x: 0, y: 0, zoom: 1 } };
  for (let i = 0; i < frames; i += 1) {
    state = stepCamera(state.rig, at, FRAME);
  }
  return state;
}

describe("the view steps", () => {
  it("walks the four steps with the wheel and clamps at both ends", () => {
    let rig = createCameraRig();
    expect(stepName(rig)).toBe("Default");
    rig = wheelNotch(rig, 1);
    expect(stepName(rig)).toBe("Wide");
    expect(wheelNotch(rig, 1)).toBe(rig);
    for (const name of ["Default", "Near", "Close"]) {
      rig = wheelNotch(rig, -1);
      expect(stepName(rig)).toBe(name);
    }
    expect(wheelNotch(rig, -1)).toBe(rig);
  });

  it("shows the same box height on every 16:9 window, and the full box width on 21:9", () => {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ]) {
      expect(viewport.height / zoomFor(DEFAULT_STEP, viewport)).toBeCloseTo(1100);
      expect(viewport.width / zoomFor(DEFAULT_STEP, viewport)).toBeCloseTo(1100 * VIEW_ASPECT);
    }
    const wide = { width: 3440, height: 1440 };
    expect(wide.width / zoomFor(DEFAULT_STEP, wide)).toBeCloseTo(1100 * VIEW_ASPECT);
    expect(wide.height / zoomFor(DEFAULT_STEP, wide)).toBeLessThan(1100);
  });

  it("keeps anything a longbow reaches on screen at Default", () => {
    expect(VIEW_STEPS[DEFAULT_STEP].height).toBeGreaterThanOrEqual(2 * LONG_BOW_RANGE);
  });
});

describe("stepCamera", () => {
  it("follows you, centred, with the pointer off the canvas", () => {
    const { view } = run(createCameraRig(), input(), 1);
    expect(view).toMatchObject({ x: 5_000, y: 5_000 });
    expect(view.zoom).toBeCloseTo(720 / 1100);
  });

  it("leans toward the pointer, and back once it leaves the canvas", () => {
    const leaning = run(createCameraRig(), input({ pointer: { x: 1280, y: 360 } }), 120);
    expect(leaning.view.x).toBeGreaterThan(5_000);
    expect(leaning.view.y).toBeCloseTo(5_000);
    const back = run(leaning.rig, input(), 120);
    expect(back.view.x).toBeCloseTo(5_000, 0);
  });

  it("lands the look-ahead and the zoom in one step with reduced motion", () => {
    const pointer = { x: 1280, y: 360 };
    const settled = run(createCameraRig(), input({ pointer }), 600).view;
    const first = run(createCameraRig(), input({ pointer }), 1).rig;
    const snapped = stepCamera(
      wheelNotch(first, 1),
      input({ pointer, reducedMotion: true }),
      FRAME,
    );
    expect(snapped.view.zoom).toBeCloseTo(zoomFor(3, input().viewport));
    // The lean scales with the new zoom: the same share of the screen.
    expect((snapped.view.x - 5_000) * snapped.view.zoom).toBeCloseTo(
      (settled.x - 5_000) * settled.zoom,
    );
  });

  it("eases the zoom to its step", () => {
    const rig = wheelNotch(run(createCameraRig(), input(), 1).rig, -1);
    const next = stepCamera(rig, input(), FRAME).view.zoom;
    expect(next).toBeGreaterThan(zoomFor(DEFAULT_STEP, input().viewport));
    expect(next).toBeLessThan(zoomFor(1, input().viewport));
    expect(run(rig, input(), 120).view.zoom).toBeCloseTo(zoomFor(1, input().viewport));
  });

  it("never shows past the arena's edge where the arena is bigger than the view", () => {
    const arena = { width: 3_000, height: 2_000 };
    const pointer = { x: 0, y: 0 };
    for (const step of [0, 1, 2]) {
      let rig = createCameraRig();
      while (rig.step > step) {
        rig = wheelNotch(rig, -1);
      }
      const { view } = run(rig, input({ self: { x: 0, y: 0 }, arena, pointer }), 120);
      const halfW = 1280 / 2 / view.zoom;
      const halfH = 720 / 2 / view.zoom;
      expect(view.x - halfW).toBeCloseTo(0);
      expect(view.y - halfH).toBeCloseTo(0);
    }
  });

  it("centres an arena smaller than the view on that axis", () => {
    const arena = { width: 960, height: 640 };
    const { view } = run(
      createCameraRig(),
      input({ self: { x: 80, y: 200 }, arena, pointer: { x: 0, y: 0 } }),
      60,
    );
    expect(view).toMatchObject({ x: 480, y: 320 });
  });

  it("stops the arena's edge at the HUD, not under it", () => {
    const arena = { width: 3_000, height: 2_000 };
    const cover = { top: 40, bottom: 175 };
    const close = wheelNotch(wheelNotch(createCameraRig(), -1), -1);
    const atBottom = run(close, input({ self: { x: 1_500, y: 2_000 }, arena, cover }), 120).view;
    // The arena's bottom edge, on screen, sits on the HUD's top.
    expect(360 + (arena.height - atBottom.y) * atBottom.zoom).toBeCloseTo(720 - cover.bottom);
    const atTop = run(close, input({ self: { x: 1_500, y: 0 }, arena, cover }), 120).view;
    expect(360 + (0 - atTop.y) * atTop.zoom).toBeCloseTo(cover.top);
  });

  it("centres a small arena in what the HUD leaves uncovered", () => {
    const arena = { width: 960, height: 640 };
    const cover = { top: 40, bottom: 175 };
    const { view } = run(createCameraRig(), input({ self: { x: 80, y: 200 }, arena, cover }), 60);
    const middle = 360 + (arena.height / 2 - view.y) * view.zoom;
    expect(middle).toBeCloseTo((cover.top + 720 - cover.bottom) / 2);
  });

  it("snaps when you jump: no glide from the old place", () => {
    const pointer = { x: 1280, y: 360 };
    const settled = run(createCameraRig(), input({ pointer }), 120).rig;
    expect(settled.lead.x).toBeGreaterThan(0);
    const jumped = stepCamera(settled, input({ pointer, self: { x: 5_300, y: 5_000 } }), FRAME);
    expect(jumped.view.x).toBe(5_300);
    expect(jumped.rig.lead).toEqual({ x: 0, y: 0 });
  });
});

describe("the RMB pan (#442)", () => {
  const VIEWPORT = { width: 1280, height: 720 };
  /** Where you are on the canvas, CSS px, through `view`. */
  const onScreen = (
    self: { x: number; y: number },
    view: { x: number; y: number; zoom: number },
  ) => ({
    x: (self.x - view.x) * view.zoom + VIEWPORT.width / 2,
    y: (self.y - view.y) * view.zoom + VIEWPORT.height / 2,
  });

  it("looks the way you drag, and keeps you 48 px inside the canvas at every zoom", () => {
    for (let step = 0; step < VIEW_STEPS.length; step += 1) {
      const settled = run({ ...createCameraRig(), step }, input(), 120).rig;
      const zoom = zoomFor(step, VIEWPORT);
      const right = stepCamera(
        panBy(settled, { x: 100, y: 0 }, VIEWPORT, VIEWPORT),
        input(),
        FRAME,
      );
      expect(right.view.x, VIEW_STEPS[step]?.name).toBeCloseTo(5_000 + 100 / zoom, 6);
      for (const drag of [
        { x: 10_000, y: 0 },
        { x: -10_000, y: 10_000 },
        { x: 0, y: -10_000 },
      ]) {
        const { view } = stepCamera(panBy(settled, drag, VIEWPORT, VIEWPORT), input(), FRAME);
        const at = onScreen(input().self, view);
        expect(at.x).toBeGreaterThanOrEqual(LEASH_MARGIN_PX - 1e-6);
        expect(at.x).toBeLessThanOrEqual(VIEWPORT.width - LEASH_MARGIN_PX + 1e-6);
        expect(at.y).toBeGreaterThanOrEqual(LEASH_MARGIN_PX - 1e-6);
        expect(at.y).toBeLessThanOrEqual(VIEWPORT.height - LEASH_MARGIN_PX + 1e-6);
      }
    }
  });

  it("holds its offset while you walk, with no look-ahead", () => {
    const settled = run(createCameraRig(), input(), 1).rig;
    const panned = panBy(settled, { x: 120, y: -40 }, VIEWPORT, VIEWPORT);
    const pointer = { x: 1200, y: 100 };
    const here = run(panned, input({ pointer }), 30);
    expect(here.view.x - 5_000).toBeCloseTo(120 / here.view.zoom, 6);
    const there = run(here.rig, input({ pointer, self: { x: 5_100, y: 4_950 } }), 30);
    expect(there.view.x - here.view.x).toBeCloseTo(100, 6);
    expect(there.view.y - here.view.y).toBeCloseTo(-50, 6);
    expect(there.rig.lead).toEqual({ x: 0, y: 0 });
  });

  it("glides back once let go: under 1 u within 1 s at 60 Hz", () => {
    const settled = run(createCameraRig(), input(), 1).rig;
    const panned = run(panBy(settled, { x: 300, y: 200 }, VIEWPORT, VIEWPORT), input(), 1).rig;
    expect(Math.hypot(panned.offset.x, panned.offset.y)).toBeGreaterThan(100);
    const back = run(releasePan(panned), input(), 60).rig;
    expect(Math.hypot(back.offset.x, back.offset.y)).toBeLessThan(1);
  });

  it("snaps back in one step with reduced motion", () => {
    const settled = run(createCameraRig(), input(), 1).rig;
    const panned = panBy(settled, { x: 300, y: 200 }, VIEWPORT, VIEWPORT);
    const reduced = input({ reducedMotion: true });
    expect(stepCamera(panned, reduced, FRAME).rig.offset).not.toEqual({ x: 0, y: 0 });
    const back = stepCamera(releasePan(panned), reduced, FRAME).rig;
    expect(back.offset).toEqual({ x: 0, y: 0 });
  });

  it("drops at once, held or not, when you die", () => {
    const panned = panBy(createCameraRig(), { x: 300, y: 200 }, VIEWPORT, VIEWPORT);
    expect(dropPan(panned)).toMatchObject({ offset: { x: 0, y: 0 }, panning: false });
  });

  it("shrinks to the leash when you zoom in mid-pan", () => {
    const wide = run({ ...createCameraRig(), step: VIEW_STEPS.length - 1 }, input(), 120).rig;
    const panned = panBy(wide, { x: 10_000, y: 0 }, VIEWPORT, VIEWPORT);
    const closed = run({ ...panned, step: 0 }, input(), 120);
    const at = onScreen(input().self, closed.view);
    expect(at.x).toBeGreaterThanOrEqual(LEASH_MARGIN_PX - 1e-6);
  });

  it("keeps you on screen at the arena's corner, nearer the edge than the leash if it must", () => {
    const arena = { width: 3_000, height: 3_000 };
    const corner = { x: 10, y: 10 };
    const at0 = input({ arena, self: corner });
    const settled = run(createCameraRig(), at0, 120).rig;
    const { view } = stepCamera(
      panBy(settled, { x: -10_000, y: -10_000 }, VIEWPORT, VIEWPORT),
      at0,
      FRAME,
    );
    const at = onScreen(corner, view);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x).toBeLessThan(LEASH_MARGIN_PX);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeLessThan(LEASH_MARGIN_PX);
  });
});

describe("feedWheel", () => {
  it("steps once a notch's worth gathers, then ignores the lockout", () => {
    let state = WHEEL_IDLE;
    const notches: (number | undefined)[] = [];
    // A trackpad's stream of small deltas, every 8 ms.
    for (let at = 0; at < 100; at += 8) {
      const fed = feedWheel(state, 10, 0, at);
      state = fed.state;
      notches.push(fed.notch);
    }
    expect(notches.filter((notch) => notch !== undefined)).toEqual([1]);
    expect(feedWheel(state, 100, 0, 24 + WHEEL_LOCKOUT_MS).notch).toBe(1);
  });

  it("takes a mouse notch at once, in either direction and in lines", () => {
    expect(feedWheel(WHEEL_IDLE, 100, 0, 0).notch).toBe(1);
    expect(feedWheel(WHEEL_IDLE, -100, 0, 0).notch).toBe(-1);
    expect(feedWheel(WHEEL_IDLE, -3, 1, 0).notch).toBe(-1);
  });

  it("starts again when the wheel turns back", () => {
    const half = feedWheel(WHEEL_IDLE, 30, 0, 0).state;
    expect(feedWheel(half, -30, 0, 10).notch).toBeUndefined();
  });
});

describe("a small canvas at a match's scale (#709)", () => {
  const STAGE = { width: 384, height: 288 };
  const WINDOW = { width: 1280, height: 720 };
  const small = (overrides: Partial<CameraInput> = {}): CameraInput =>
    input({ viewport: STAGE, scaleTo: WINDOW, ...overrides });

  it("draws every step at the window's zoom, so it shows less of the world", () => {
    for (let step = 0; step < VIEW_STEPS.length; step += 1) {
      const { view } = run({ ...createCameraRig(), step }, small(), 120);
      expect(view.zoom, VIEW_STEPS[step]?.name).toBeCloseTo(zoomFor(step, WINDOW), 9);
    }
  });

  it("leashes a pan to the small canvas, not the window", () => {
    const settled = run(createCameraRig(), small(), 1).rig;
    const zoom = zoomFor(DEFAULT_STEP, WINDOW);
    const right = stepCamera(panBy(settled, { x: 100, y: 0 }, STAGE, WINDOW), small(), FRAME);
    expect(right.view.x).toBeCloseTo(5_000 + 100 / zoom, 6);
    const far = stepCamera(panBy(settled, { x: 10_000, y: 10_000 }, STAGE, WINDOW), small(), FRAME);
    expect(far.view.x - 5_000).toBeCloseTo((STAGE.width / 2 - LEASH_MARGIN_PX) / zoom, 6);
    expect(far.view.y - 5_000).toBeCloseTo((STAGE.height / 2 - LEASH_MARGIN_PX) / zoom, 6);
  });

  it("stops at the arena's edge by what the small canvas shows", () => {
    const arena = { width: 1_000, height: 700 };
    const { view } = run(createCameraRig(), small({ arena, self: { x: 10, y: 10 } }), 1);
    const zoom = zoomFor(DEFAULT_STEP, WINDOW);
    expect(view.x).toBeCloseTo(STAGE.width / 2 / zoom, 6);
    expect(view.y).toBeCloseTo(STAGE.height / 2 / zoom, 6);
  });
});
