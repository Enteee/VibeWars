import { describe, expect, it } from "vitest";

import { createTouchGesture, type TouchSample } from "./touch-gesture.js";

function at(id: number, phase: TouchSample["phase"], x: number, y: number, t: number): TouchSample {
  return { id, phase, x, y, t };
}

describe("createTouchGesture (#3781)", () => {
  it("taps on a release close to the press, at the press", () => {
    const gesture = createTouchGesture();
    expect(gesture.feed(at(1, "down", 50, 50, 0))).toEqual({ kind: "none" });
    expect(gesture.feed(at(1, "move", 56, 58, 100))).toEqual({ kind: "none" });
    expect(gesture.feed(at(1, "up", 56, 58, 200))).toEqual({ kind: "tap", at: { x: 50, y: 50 } });
  });

  it("taps on a press held 499 ms, long-presses on one held 500 ms or more (#3878)", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 50, 50, 0));
    expect(gesture.feed(at(1, "up", 50, 50, 499))).toEqual({ kind: "tap", at: { x: 50, y: 50 } });
    gesture.feed(at(2, "down", 50, 50, 1000));
    expect(gesture.feed(at(2, "move", 56, 58, 1300))).toEqual({ kind: "none" });
    expect(gesture.feed(at(2, "up", 56, 58, 1500))).toEqual({
      kind: "long-press",
      at: { x: 50, y: 50 },
    });
    // Held for seconds: still one long-press.
    gesture.feed(at(3, "down", 0, 0, 2000));
    expect(gesture.feed(at(3, "up", 0, 0, 9000))).toEqual({
      kind: "long-press",
      at: { x: 0, y: 0 },
    });
  });

  it("is held long once a still press passes 500 ms, until it lifts or pans (#3878)", () => {
    const gesture = createTouchGesture();
    expect(gesture.heldLong(1000)).toBe(false);
    gesture.feed(at(1, "down", 0, 0, 0));
    expect(gesture.heldLong(499)).toBe(false);
    expect(gesture.heldLong(500)).toBe(true);
    gesture.feed(at(1, "up", 0, 0, 600));
    expect(gesture.heldLong(700)).toBe(false);
    gesture.feed(at(2, "down", 0, 0, 1000));
    gesture.feed(at(2, "move", 20, 0, 1100));
    expect(gesture.heldLong(1600)).toBe(false);
    gesture.feed(at(2, "up", 20, 0, 1700));
    gesture.feed(at(3, "down", 0, 0, 2000));
    gesture.feed(at(4, "down", 100, 0, 2100));
    expect(gesture.heldLong(2600)).toBe(false);
  });

  it("never long-presses a held press that panned, pinched or was cancelled (#3878)", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 0, 0, 0));
    gesture.feed(at(1, "move", 20, 0, 300));
    expect(gesture.feed(at(1, "up", 20, 0, 900))).toEqual({ kind: "pan-end" });
    gesture.feed(at(2, "down", 0, 0, 1000));
    gesture.feed(at(3, "down", 100, 0, 1300));
    expect(gesture.feed(at(3, "up", 100, 0, 1600))).toEqual({ kind: "none" });
    expect(gesture.feed(at(2, "up", 0, 0, 1900))).toEqual({ kind: "none" });
    gesture.feed(at(4, "down", 0, 0, 2000));
    expect(gesture.feed(at(4, "cancel", 0, 0, 2800))).toEqual({ kind: "none" });
  });

  it("pans past 10 px, the whole way at first, and never taps", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 50, 50, 0));
    expect(gesture.feed(at(1, "move", 62, 50, 20))).toEqual({
      kind: "pan",
      delta: { x: 12, y: 0 },
    });
    expect(gesture.feed(at(1, "move", 60, 55, 40))).toEqual({
      kind: "pan",
      delta: { x: -2, y: 5 },
    });
    expect(gesture.feed(at(1, "up", 60, 55, 60))).toEqual({ kind: "pan-end" });
  });

  it("pinches a notch per 15% change in finger distance, and never taps", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 0, 0, 0));
    expect(gesture.feed(at(2, "down", 100, 0, 10))).toEqual({ kind: "none" });
    expect(gesture.feed(at(2, "move", 110, 0, 20))).toEqual({ kind: "none" });
    expect(gesture.feed(at(2, "move", 116, 0, 30))).toEqual({ kind: "pinch", notch: -1 });
    expect(gesture.feed(at(2, "move", 100, 0, 40))).toEqual({ kind: "pinch", notch: 1 });
    expect(gesture.feed(at(2, "up", 100, 0, 50))).toEqual({ kind: "none" });
    expect(gesture.feed(at(1, "up", 0, 0, 60))).toEqual({ kind: "none" });
    // Over: the next finger taps again.
    gesture.feed(at(3, "down", 0, 0, 100));
    expect(gesture.feed(at(3, "up", 0, 0, 150))).toEqual({ kind: "tap", at: { x: 0, y: 0 } });
  });

  it("ends a pan when a second finger lands, and taps no more until both lift", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 0, 0, 0));
    gesture.feed(at(1, "move", 20, 0, 10));
    expect(gesture.feed(at(2, "down", 100, 0, 20))).toEqual({ kind: "pan-end" });
    gesture.feed(at(2, "up", 100, 0, 30));
    expect(gesture.feed(at(1, "move", 40, 0, 40))).toEqual({ kind: "none" });
    expect(gesture.feed(at(1, "up", 40, 0, 50))).toEqual({ kind: "none" });
  });

  it("drops the gesture on a cancel", () => {
    const gesture = createTouchGesture();
    gesture.feed(at(1, "down", 0, 0, 0));
    expect(gesture.feed(at(1, "cancel", 0, 0, 10))).toEqual({ kind: "none" });
    gesture.feed(at(2, "down", 0, 0, 20));
    gesture.feed(at(2, "move", 30, 0, 30));
    expect(gesture.feed(at(2, "cancel", 30, 0, 40))).toEqual({ kind: "pan-end" });
  });
});
