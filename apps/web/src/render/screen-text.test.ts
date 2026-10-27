import { describe, expect, it } from "vitest";

import { screenPx, screenSized, type Scalable } from "./screen-text.js";

/** A Phaser object's scale, counting how often it is set. */
function fakeText(): Scalable & { readonly sets: number } {
  let scaleX = 1;
  let sets = 0;
  return {
    get scaleX() {
      return scaleX;
    },
    get sets() {
      return sets;
    },
    setScale(scale: number) {
      scaleX = scale;
      sets += 1;
    },
  };
}

describe("screen-sized text (#456)", () => {
  it("counter-scales by 1 / zoom, so the camera draws it at its design size", () => {
    for (const zoom of [0.26, 0.65, 1]) {
      const text = fakeText();
      screenSized(text, zoom);
      expect(text.scaleX * zoom).toBeCloseTo(1, 9);
    }
  });

  it("turns a screen-px offset into world units that are the same on screen at every zoom", () => {
    for (const zoom of [0.26, 0.65, 1]) {
      expect(screenPx(22, zoom) * zoom).toBeCloseTo(22, 9);
    }
  });

  it("sets the scale only when the zoom changed", () => {
    const text = fakeText();
    screenSized(text, 0.65);
    screenSized(text, 0.65);
    expect(text.sets).toBe(1);
    screenSized(text, 1);
    expect(text.sets).toBe(2);
  });
});
