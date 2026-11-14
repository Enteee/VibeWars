import { vec2, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  DODGES_NEEDED,
  MARK_REACH,
  breakWallStation,
  dodgeStation,
  lookStation,
  stepInStation,
  type TutorialView,
} from "./stations.js";

const PAD = vec2(500, -900);
const GROUND = 2;
const view = (over: Partial<TutorialView> = {}): TutorialView => ({
  self: vec2(0, 0),
  selfLayer: GROUND,
  tutor: vec2(40, 0),
  zoomedOut: false,
  lookDragged: false,
  inView: () => false,
  rockfallDodges: 0,
  hitBy: undefined,
  wallHealth: undefined,
  wallTargeted: false,
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
    const station = stepInStation(PAD, GROUND);
    expect(station.done(view({ self: vec2(PAD.x + MARK_REACH, PAD.y) }))).toBe(true);
    expect(station.done(view({ self: vec2(PAD.x, PAD.y + MARK_REACH + 1) }))).toBe(false);
  });

  // QA (#3222): under canyon's plateau, at the pad's x and y, counted as on it.
  it("is not done under the pad or over it, on another layer", () => {
    const station = stepInStation(PAD, GROUND);
    expect(station.done(view({ self: PAD, selfLayer: GROUND - 1 }))).toBe(false);
    expect(station.done(view({ self: PAD, selfLayer: GROUND + 1 }))).toBe(false);
  });

  it("points at the pad", () => {
    expect(stepInStation(PAD, GROUND).highlight).toEqual({ kind: "ground", at: PAD });
  });
});

describe("dodgeStation (#3247)", () => {
  const MARK = vec2(2850, 1800);

  it("needs every dodge and the mark", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.done(view({ self: MARK, rockfallDodges: DODGES_NEEDED - 1 }))).toBe(false);
    expect(station.done(view({ rockfallDodges: DODGES_NEEDED }))).toBe(false);
    expect(station.done(view({ self: MARK, rockfallDodges: DODGES_NEEDED }))).toBe(true);
  });

  it("is not done on the mark from another layer", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(
      station.done(view({ self: MARK, selfLayer: GROUND - 1, rockfallDodges: DODGES_NEEDED })),
    ).toBe(false);
  });

  it("is not done by a hit, nor kept from being done by one", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.done(view({ self: MARK, hitBy: "rockfall" }))).toBe(false);
    expect(
      station.done(view({ self: MARK, hitBy: "rockfall", rockfallDodges: DODGES_NEEDED })),
    ).toBe(true);
  });

  it("runs in the canyon, pointing at its mark, with a line for a hit", () => {
    const station = dodgeStation(MARK, GROUND);
    expect(station.world).toBe("canyon");
    expect(station.highlight).toEqual({ kind: "ground", at: MARK });
    expect(station.lines.hit).toBe("tutorial.dodge.hit");
  });
});

describe("breakWallStation (#3302)", () => {
  const face = vec2(3480, 1800);
  const station = breakWallStation(face, 400);

  it("is not done while the wall stands at any health, nor outside the canyon, and is done at 0", () => {
    for (const wallHealth of [400, 250, 1, undefined]) {
      expect(station.done(view({ wallHealth }))).toBe(false);
    }
    expect(station.done(view({ wallHealth: 0 }))).toBe(true);
  });

  it("is done at once for a wall already broken, before any target or blow", () => {
    expect(breakWallStation(face, 400).done(view({ wallHealth: 0, wallTargeted: false }))).toBe(
      true,
    );
  });

  it("marks the wall's face until it is targeted, and pulses the target frame", () => {
    expect(station.highlight).toEqual({ kind: "hud", element: ".hud-target" });
    expect(station.mark?.(view({ wallHealth: 400 }))).toEqual(face);
    expect(station.mark?.(view({ wallHealth: 400, wallTargeted: true }))).toBeUndefined();
  });

  it("reacts to the first blow: the wall below its full health", () => {
    expect(station.reaction?.when(view({ wallHealth: 400 }))).toBe(false);
    expect(station.reaction?.when(view({ wallHealth: 399 }))).toBe(true);
    expect(station.reaction?.when(view({ wallHealth: undefined }))).toBe(false);
  });
});
