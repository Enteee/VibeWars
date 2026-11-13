import { vec2, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { MARK_REACH, lookStation, stepInStation, type TutorialView } from "./stations.js";

const PAD = vec2(500, -900);
const view = (over: Partial<TutorialView> = {}): TutorialView => ({
  self: vec2(0, 0),
  tutor: vec2(40, 0),
  zoomedOut: false,
  lookDragged: false,
  inView: () => false,
  ...over,
});
const sees =
  (target: Vec2) =>
  (point: Vec2): boolean =>
    point.x === target.x && point.y === target.y;

describe("lookStation (#3222)", () => {
  it("is done only once a zoom-out, a right-drag and the teleporter on screen have all happened", () => {
    const all = { zoomedOut: true, lookDragged: true, inView: sees(PAD) };
    for (const missing of ["zoomedOut", "lookDragged", "inView"] as const) {
      const station = lookStation(PAD);
      const short = missing === "inView" ? { inView: () => false } : { [missing]: false };
      expect(station.done(view({ ...all, ...short }))).toBe(false);
    }
    expect(lookStation(PAD).done(view(all))).toBe(true);
  });

  it("remembers the teleporter was seen, though the view has glided back since", () => {
    const station = lookStation(PAD);
    expect(station.done(view({ zoomedOut: true, inView: sees(PAD) }))).toBe(false);
    expect(station.done(view({ zoomedOut: true, lookDragged: true }))).toBe(true);
  });

  it("points at no one place", () => {
    expect(lookStation(PAD).highlight).toBeUndefined();
  });
});

describe("stepInStation (#3222)", () => {
  it("is done on the pad, within MARK_REACH, and not beyond", () => {
    const station = stepInStation(PAD);
    expect(station.done(view({ self: vec2(PAD.x + MARK_REACH, PAD.y) }))).toBe(true);
    expect(station.done(view({ self: vec2(PAD.x, PAD.y + MARK_REACH + 1) }))).toBe(false);
  });

  it("points at the pad", () => {
    expect(stepInStation(PAD).highlight).toEqual({ kind: "ground", at: PAD });
  });
});
