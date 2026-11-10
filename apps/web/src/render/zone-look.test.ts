import { ZONE_KINDS, ZONE_RULES } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  ZONE_LOOK,
  obeliskOutline,
  strikeZoneLook,
  zoneCentroid,
  zoneFillAlpha,
} from "./zone-look.js";

describe("ZONE_LOOK (ADR-0053, #3024)", () => {
  it("breathes round its alpha, never to nothing and never opaque", () => {
    // A timed hazard is drawn by its phase instead (#3029).
    for (const kind of ZONE_KINDS.filter((each) => ZONE_RULES[each].trigger === "while-inside")) {
      const look = ZONE_LOOK[kind];
      const alphas = Array.from({ length: 64 }, (_, at) => zoneFillAlpha(look, at / 20, false));
      expect(Math.min(...alphas)).toBeGreaterThan(0);
      expect(Math.max(...alphas)).toBeLessThan(1);
      expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(look.pulse);
    }
  });

  it("gives every kind its own fill, so each is told apart (#3027)", () => {
    const fills = ZONE_KINDS.map((kind) => ZONE_LOOK[kind].fill);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it("holds still when the player asks for less motion", () => {
    const look = ZONE_LOOK.scorched;
    expect(zoneFillAlpha(look, 0.4, true)).toBe(look.alpha);
    expect(zoneFillAlpha(look, 1.1, true)).toBe(look.alpha);
  });
});

describe("the draining spire's obelisk (#3028)", () => {
  it("stands on the centroid of its zone, a rect's or a polygon's", () => {
    expect(zoneCentroid({ kind: "rect", x: 300, y: 460, width: 80, height: 80 })).toEqual({
      x: 340,
      y: 500,
    });
    const triangle = zoneCentroid({
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 90, y: 0 },
        { x: 0, y: 90 },
      ],
    });
    expect(triangle.x).toBeCloseTo(30, 5);
    expect(triangle.y).toBeCloseTo(30, 5);
  });

  it("rises from its foot to a point straight above it", () => {
    const outline = obeliskOutline({ x: 340, y: 500 });
    expect(Math.max(...outline.map(({ y }) => y))).toBe(500);
    const top = outline.reduce((high, point) => (point.y < high.y ? point : high));
    expect(top.x).toBe(340);
    expect(top.y).toBeLessThan(500);
  });
});

describe("a timed hazard's look (#3029)", () => {
  it("shows faintly idle, brightens its edge and fills in as it telegraphs, then strikes full", () => {
    for (const kind of ["vent", "gas-spout", "rockfall"] as const) {
      const look = ZONE_LOOK[kind];
      const idle = strikeZoneLook(look, "idle");
      const telegraph = strikeZoneLook(look, "telegraph");
      const active = strikeZoneLook(look, "active");
      expect(idle.fillAlpha).toBeGreaterThan(0);
      expect(telegraph.fillAlpha).toBeGreaterThan(idle.fillAlpha);
      expect(telegraph.edgeScale).toBeGreaterThan(idle.edgeScale);
      expect(active.fillAlpha).toBeGreaterThan(telegraph.fillAlpha);
      expect(active.fillAlpha).toBe(look.alpha);
    }
  });
});
