import { describe, expect, it } from "vitest";

import { LONG_BOW_RANGE } from "@vibewars/game-core";

import {
  DEFAULT_STEP,
  VIEW_ASPECT,
  VIEW_STEPS,
  WHEEL_IDLE,
  WHEEL_LOCKOUT_MS,
  createCameraRig,
  feedWheel,
  stepCamera,
  wheelNotch,
  zoomFor,
  type CameraInput,
  type CameraRig,
} from "./camera-rig.js";

const FRAME = 1 / 60;
/** A big arena, so nothing is clamped unless a test walks to its edge. */
const BIG = { width: 10_000, height: 10_000 };

const input = (overrides: Partial<CameraInput> = {}): CameraInput => ({
  self: { x: 5_000, y: 5_000 },
  viewport: { width: 1280, height: 720 },
  pointer: undefined,
  reducedMotion: false,
  arena: BIG,
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

  it("snaps when you jump: no glide from the old place", () => {
    const pointer = { x: 1280, y: 360 };
    const settled = run(createCameraRig(), input({ pointer }), 120).rig;
    expect(settled.lead.x).toBeGreaterThan(0);
    const jumped = stepCamera(settled, input({ pointer, self: { x: 5_300, y: 5_000 } }), FRAME);
    expect(jumped.view.x).toBe(5_300);
    expect(jumped.rig.lead).toEqual({ x: 0, y: 0 });
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
