import { describe, expect, it } from "vitest";

import { PING_SECONDS } from "@vibewars/game-session";

import { NAME_LABEL_HEIGHT, nameLabelBottom, type RenderableActor } from "./arena-snapshot.js";
import { callChevron, pingRing, watchBrackets } from "./call-marks.js";

const CENTRE = { x: 100, y: 100 };
const R = 14;
const CALLED: RenderableActor = {
  id: "foe",
  name: "foe",
  position: CENTRE,
  facing: 0,
  weaponId: undefined,
  swingElapsed: 0,
  swingTotal: 0,
  attackCast: undefined,
  offhandId: undefined,
  profession: undefined,
  radius: R,
  team: "enemy",
  health: 500,
  maxHealth: 500,
  dead: false,
  exploited: false,
  knockedDown: false,
  castProgress: undefined,
  statuses: [],
};

describe("call marks (#443)", () => {
  it("points the chevron down at the called body, above its name", () => {
    for (const zoom of [0.26, 0.65, 1]) {
      const [left, tip, right] = callChevron(CALLED, zoom);
      expect(tip.x).toBe(CENTRE.x);
      expect(left.y).toBeLessThan(tip.y);
      expect(right.y).toBe(left.y);
      // Above the name label, which is 11 px on screen at every zoom (#456).
      expect(tip.y).toBeLessThan(nameLabelBottom(CALLED, zoom) - NAME_LABEL_HEIGHT / zoom);
    }
  });

  it("grows the ping's ring and fades it over its life, held still under reduced motion", () => {
    const fresh = pingRing(PING_SECONDS, false);
    const half = pingRing(PING_SECONDS / 2, false);
    const done = pingRing(0, false);
    expect(fresh.alpha).toBe(1);
    expect(half.radius).toBeGreaterThan(fresh.radius);
    expect(half.alpha).toBeCloseTo(0.5, 9);
    expect(done.alpha).toBe(0);
    expect(pingRing(0.1, true)).toEqual(pingRing(PING_SECONDS, true));
  });

  it("brackets the watched ally at four corners, outside the target ring, open at the sides", () => {
    const brackets = watchBrackets(CENTRE, R);
    expect(brackets).toHaveLength(4);
    for (const [a, corner, b] of brackets) {
      // Outside the target ring's r + 10.
      expect(Math.abs(corner.x - CENTRE.x)).toBeGreaterThan(R + 10);
      expect(Math.abs(corner.y - CENTRE.y)).toBeGreaterThan(R + 10);
      // Each arm runs along one axis from the corner, toward the side's middle.
      expect(a.y).toBe(corner.y);
      expect(b.x).toBe(corner.x);
      expect(Math.abs(a.x - CENTRE.x)).toBeLessThan(Math.abs(corner.x - CENTRE.x));
      expect(Math.abs(b.y - CENTRE.y)).toBeLessThan(Math.abs(corner.y - CENTRE.y));
    }
  });
});
