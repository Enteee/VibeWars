import { describe, expect, it } from "vitest";

import { VIGNETTE, vignetteAlpha } from "./vignette.js";

const WIDTH = 1280;
const HEIGHT = 720;

describe("vignetteAlpha (#4057)", () => {
  it("leaves the centre third of the view untouched", () => {
    for (const x of [WIDTH / 3, WIDTH / 2, (WIDTH * 2) / 3]) {
      for (const y of [HEIGHT / 3, HEIGHT / 2, (HEIGHT * 2) / 3]) {
        expect(vignetteAlpha(x, y, WIDTH, HEIGHT)).toBeCloseTo(0, 9);
      }
    }
  });

  it("reaches the cap at the corners", () => {
    for (const [x, y] of [
      [0, 0],
      [WIDTH, 0],
      [0, HEIGHT],
      [WIDTH, HEIGHT],
    ] as const) {
      expect(vignetteAlpha(x, y, WIDTH, HEIGHT)).toBeCloseTo(VIGNETTE.alpha, 6);
    }
  });

  it("darkens the edges part way, never past the cap", () => {
    const edge = vignetteAlpha(0, HEIGHT / 2, WIDTH, HEIGHT);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(VIGNETTE.alpha);
  });

  it("is symmetric about both axes", () => {
    for (const [x, y] of [
      [40, 90],
      [300, 20],
      [123, 456],
    ] as const) {
      const alpha = vignetteAlpha(x, y, WIDTH, HEIGHT);
      expect(vignetteAlpha(WIDTH - x, y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
      expect(vignetteAlpha(x, HEIGHT - y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
      expect(vignetteAlpha(WIDTH - x, HEIGHT - y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
    }
  });

  it("darkens steadily from the centre out", () => {
    let last = 0;
    for (let step = 0; step <= 20; step += 1) {
      const alpha = vignetteAlpha(
        (WIDTH / 2) * (1 - step / 20),
        (HEIGHT / 2) * (1 - step / 20),
        WIDTH,
        HEIGHT,
      );
      expect(alpha).toBeGreaterThanOrEqual(last);
      last = alpha;
    }
  });
});
