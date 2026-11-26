import { ZONE_KINDS, ZONE_RULES } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  ZONE_LOOK,
  obeliskOutline,
  strikeEdgeScale,
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

  it("paints every lasting kind as its own real thing, and the timed ones as their marks (#3053)", () => {
    const painters = ZONE_KINDS.filter((kind) => ZONE_RULES[kind].trigger === "while-inside").map(
      (kind) => ZONE_LOOK[kind].painter,
    );
    expect(painters).not.toContain("hazard");
    expect(new Set(painters).size).toBe(painters.length);
    for (const kind of ZONE_KINDS.filter((each) => ZONE_RULES[each].trigger === "strike")) {
      expect(ZONE_LOOK[kind].painter).toBe("hazard");
    }
  });

  it("lights only fire, a vent's smoulder, the spring and the spire (#3052, #3053)", () => {
    const lit = ZONE_KINDS.filter((kind) => ZONE_LOOK[kind].light !== undefined);
    expect(lit.sort()).toEqual(["draining-spire", "molten", "scorched", "spring", "vent"]);
    // Warm is fire and flickers; water and magic hold steady.
    expect(ZONE_LOOK.molten.light?.flicker).toBeGreaterThan(0);
    expect(ZONE_LOOK.spring.light?.flicker).toBe(0);
    expect(ZONE_LOOK["draining-spire"].light?.flicker).toBe(0);
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

describe("a timed hazard's edge (#3029)", () => {
  it("widens its ring as it telegraphs, and keeps it wide while it strikes", () => {
    expect(strikeEdgeScale("telegraph")).toBeGreaterThan(strikeEdgeScale("idle"));
    expect(strikeEdgeScale("active")).toBe(strikeEdgeScale("telegraph"));
  });
});
