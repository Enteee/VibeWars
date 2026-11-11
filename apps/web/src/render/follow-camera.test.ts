import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArenaViewport, ButtonEvent } from "./arena-viewport.js";
import { attachFollowCamera } from "./follow-camera.js";

const FRAME = 1 / 60;
const SIZE = { width: 1280, height: 720 };

/** Just enough of a viewport for the camera: it records where it was pointed. */
function fakeViewport(): {
  viewport: ArenaViewport;
  views: { x: number; y: number }[];
  press: (event: ButtonEvent) => void;
} {
  const views: { x: number; y: number }[] = [];
  let press: (event: ButtonEvent) => void = () => undefined;
  const fake = {
    setArenaBounds: () => undefined,
    onWheelNotch: () => () => undefined,
    onButton: (handler: (event: ButtonEvent) => void) => {
      press = handler;
      return () => undefined;
    },
    size: () => SIZE,
    setCamera: (view: { x: number; y: number }) => {
      views.push({ x: view.x, y: view.y });
    },
  };
  return {
    viewport: fake as unknown as ArenaViewport,
    views,
    press: (event) => {
      press(event);
    },
  };
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

    camera.frame(FRAME, { x: 4_000, y: 6_000, dead: false, teleportReadyAt: 0 });
    for (let i = 0; i < 120; i += 1) {
      // A corpse can still be moved, e.g. knocked back by the killing blow.
      camera.frame(FRAME, { x: 4_200, y: 6_100, dead: true, teleportReadyAt: 0 });
    }

    const last = views.at(-1);
    expect(last?.x).toBeCloseTo(4_200);
    expect(last?.y).toBeCloseTo(6_100);
    camera.dispose();
  });

  it("snaps onto you at a portal's exit, a held pan dropped (#3030)", () => {
    const { viewport, views, press } = fakeViewport();
    const stage = { dataset: {} } as unknown as HTMLElement;
    const camera = attachFollowCamera(
      viewport,
      stage,
      { width: 10_000, height: 10_000 },
      () => SIZE,
    );
    const rmb = (phase: ButtonEvent["phase"], x: number): void => {
      press({
        button: "right",
        phase,
        world: { x: 0, y: 0 },
        altKey: false,
        screen: { x, y: 300 },
      });
    };

    camera.frame(FRAME, { x: 4_000, y: 6_000, dead: false, teleportReadyAt: 0 });
    rmb("down", 600);
    rmb("move", 400);
    camera.frame(FRAME, { x: 4_000, y: 6_000, dead: false, teleportReadyAt: 0 });
    expect(views.at(-1)?.x).not.toBeCloseTo(4_000);

    // A short hop, well inside the distance that snaps by itself.
    camera.frame(FRAME, { x: 4_100, y: 6_000, dead: false, teleportReadyAt: 12 });

    expect(views.at(-1)?.x).toBeCloseTo(4_100);
    expect(views.at(-1)?.y).toBeCloseTo(6_000);
    camera.dispose();
  });
});
