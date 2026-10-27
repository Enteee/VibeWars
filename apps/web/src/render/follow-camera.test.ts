import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArenaViewport } from "./arena-viewport.js";
import { attachFollowCamera } from "./follow-camera.js";

const FRAME = 1 / 60;
const SIZE = { width: 1280, height: 720 };

/** Just enough of a viewport for the camera: it records where it was pointed. */
function fakeViewport(): { viewport: ArenaViewport; views: { x: number; y: number }[] } {
  const views: { x: number; y: number }[] = [];
  const fake = {
    setArenaBounds: () => undefined,
    onWheelNotch: () => () => undefined,
    onButton: () => () => undefined,
    size: () => SIZE,
    pointerScreen: () => undefined,
    setCamera: (view: { x: number; y: number }) => {
      views.push({ x: view.x, y: view.y });
    },
  };
  return { viewport: fake as unknown as ArenaViewport, views };
}

beforeEach(() => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attachFollowCamera", () => {
  it("keeps following your body once you are dead: no other camera (#881)", () => {
    const { viewport, views } = fakeViewport();
    const stage = { dataset: {} } as unknown as HTMLElement;
    const camera = attachFollowCamera(
      viewport,
      stage,
      { width: 10_000, height: 10_000 },
      () => SIZE,
    );

    camera.frame(FRAME, { x: 4_000, y: 6_000, dead: false });
    for (let i = 0; i < 120; i += 1) {
      // A corpse can still be moved, e.g. knocked back by the killing blow.
      camera.frame(FRAME, { x: 4_200, y: 6_100, dead: true });
    }

    const last = views.at(-1);
    expect(last?.x).toBeCloseTo(4_200);
    expect(last?.y).toBeCloseTo(6_100);
    camera.dispose();
  });
});
