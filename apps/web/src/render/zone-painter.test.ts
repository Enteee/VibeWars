import { pointInPolygon, ZONE_KINDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { MapZone } from "./arena-snapshot.js";
import { shoreDistance } from "./water-shape.js";
import { ZONE_LOOK } from "./zone-look.js";
import {
  CAUSTICS_FRAGMENT,
  drawnOutline,
  liquidOf,
  LIQUID_ZONES,
  paintZoneMotion,
  paintZoneShadow,
  reliefEdges,
  ZONE_CAUSTICS,
  ZONE_DRIFT,
  zoneArtOf,
  zoneGroundAlpha,
  type ZoneMotionPainter,
} from "./zone-painter.js";

const square = (kind: MapZone["kind"]): MapZone => ({
  kind,
  layer: 1,
  area: { kind: "rect", x: 100, y: 100, width: 120, height: 90 },
});

/** Every call the moving marks make, as a list. */
function recorder(): { readonly painter: ZoneMotionPainter; readonly calls: unknown[][] } {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push([name, ...args]);
    };
  return {
    calls,
    painter: {
      fillStyle: record("fillStyle"),
      lineStyle: record("lineStyle"),
      fillCircle: record("fillCircle"),
      strokeCircle: record("strokeCircle"),
      lineBetween: record("lineBetween"),
      fillOutline: record("fillOutline"),
      strokeOutline: record("strokeOutline"),
    },
  };
}

describe("a zone's painted ground (#3052)", () => {
  it("paints no ground under a timed hazard: its mark is drawn instead (#3053)", () => {
    expect(zoneArtOf(square("vent"), 0)).toBeUndefined();
    expect(zoneArtOf(square("rockfall"), 0)).toBeUndefined();
  });

  it("scatters the same way every time, so every client sees the same ground", () => {
    expect(zoneArtOf(square("scorched"), 3)).toEqual(zoneArtOf(square("scorched"), 3));
  });

  it("keeps what moves inside the edge: cracks, embers, bubbles and fog at its widest drift", () => {
    for (const kind of ["molten", "scorched", "mire", "spring", "toxic-fog"] as const) {
      const art = zoneArtOf(square(kind), 0);
      if (art === undefined) {
        throw new Error(kind);
      }
      for (const point of [...art.cracks.flat(), ...art.specks.map((speck) => speck.at)]) {
        expect(pointInPolygon(point, art.outline)).toBe(true);
      }
      for (const puff of art.puffs) {
        expect(shoreDistance(puff.at, art.outline)).toBeGreaterThanOrEqual(
          puff.radius + ZONE_DRIFT,
        );
      }
    }
    expect(zoneArtOf(square("molten"), 0)?.cracks.length).toBeGreaterThan(0);
    expect(zoneArtOf(square("scorched"), 0)?.specks.length).toBeGreaterThan(0);
    expect(zoneArtOf(square("toxic-fog"), 0)?.puffs.length).toBeGreaterThan(0);
    expect(zoneArtOf(square("foul-water"), 0)?.ripples.length).toBeGreaterThan(0);
  });

  it("keeps a spring clear: no ripple lines and no sparkles, only its cells (#4062)", () => {
    const art = zoneArtOf(square("spring"), 0);
    expect(art?.ripples).toEqual([]);
    expect(art?.specks).toEqual([]);
  });

  it("holds every mark still under reduced motion", () => {
    for (const kind of [
      "molten",
      "scorched",
      "toxic-fog",
      "mire",
      "spring",
      "draining-spire",
    ] as const) {
      const art = zoneArtOf(square(kind), 0);
      if (art === undefined) {
        throw new Error(kind);
      }
      const early = recorder();
      const late = recorder();
      paintZoneMotion(early.painter, art, 1, 0.3, true);
      paintZoneMotion(late.painter, art, 1, 4.1, true);
      expect(late.calls).toEqual(early.calls);
      expect(zoneGroundAlpha(art, ZONE_LOOK[kind], 0.3, true)).toBe(
        zoneGroundAlpha(art, ZONE_LOOK[kind], 4.1, true),
      );
    }
  });

  it("moves when motion is allowed: lava flows, embers glow and fade", () => {
    for (const kind of ["molten", "scorched", "toxic-fog"] as const) {
      const art = zoneArtOf(square(kind), 0);
      if (art === undefined) {
        throw new Error(kind);
      }
      const early = recorder();
      const late = recorder();
      paintZoneMotion(early.painter, art, 1, 0.3, false);
      paintZoneMotion(late.painter, art, 1, 1.1, false);
      expect(late.calls).not.toEqual(early.calls);
    }
  });

  it("draws a big zone's moving marks at a capped count, not by its area (#3225)", () => {
    const big = (kind: MapZone["kind"]): MapZone => ({
      kind,
      layer: 1,
      area: { kind: "rect", x: 0, y: 0, width: 400, height: 400 },
    });
    for (const [kind, most] of [
      ["molten", 24 * 2 * 2],
      ["scorched", 120 * 2],
    ] as const) {
      const art = zoneArtOf(big(kind), 0);
      if (art === undefined) {
        throw new Error(kind);
      }
      expect(art.cracks.length + art.specks.length).toBeGreaterThan(most / 2);
      const painted = recorder();
      paintZoneMotion(painted.painter, art, 1, 0.3, false);
      const circles = painted.calls.filter(([name]) => name === "fillCircle").length;
      expect(circles).toBeGreaterThan(0);
      expect(circles).toBeLessThanOrEqual(most);
    }
  });

  it("stands the spire's obelisk on its centroid", () => {
    const art = zoneArtOf(square("draining-spire"), 0);
    if (art === undefined) {
      throw new Error("spire");
    }
    const painted = recorder();
    paintZoneMotion(painted.painter, art, 1, 0, true);
    const outlines = painted.calls.filter(([name]) => name === "fillOutline");
    expect(outlines.length).toBeGreaterThan(0);
    // Its rounded corners (#4037) move the centroid by a rounding error at most.
    expect(art.centroid.x).toBeCloseTo(160, 9);
    expect(art.centroid.y).toBeCloseTo(145, 9);
  });
});

describe("a zone's drawn outline and relief (#4037)", () => {
  const areaOf = (points: readonly { x: number; y: number }[]): number =>
    Math.abs(
      points.reduce((sum, from, at) => {
        const to = points[(at + 1) % points.length] ?? from;
        return sum + from.x * to.y - to.x * from.y;
      }, 0) / 2,
    );
  const rect = { kind: "rect", x: 50, y: 70, width: 100, height: 100 } as const;

  it("rounds a rect's corners, only ever inside it, losing at most 3 % of a 100 × 100 zone", () => {
    const drawn = drawnOutline(rect);
    if (drawn.kind !== "polygon") {
      throw new Error("a rect zone is drawn as a polygon");
    }
    expect(drawn.points.length).toBeGreaterThan(4);
    for (const { x, y } of drawn.points) {
      expect(x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(x).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(y).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
    }
    // No corner is left square.
    expect(drawn.points).not.toContainEqual({ x: rect.x, y: rect.y });
    expect(areaOf(drawn.points)).toBeGreaterThanOrEqual(0.97 * rect.width * rect.height);
  });

  it("leaves a polygon, and a rect too small to round, as they are", () => {
    const polygon = {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 80, y: 10 },
        { x: 40, y: 60 },
      ],
    } as const;
    expect(drawnOutline(polygon)).toBe(polygon);
    const small = { kind: "rect", x: 0, y: 0, width: 200, height: 29 } as const;
    expect(drawnOutline(small)).toBe(small);
  });

  it("paints a zone with a ground by its rounded outline, a hazard not at all", () => {
    const art = zoneArtOf(square("grove"), 0);
    expect(art?.outline.length).toBeGreaterThan(4);
    expect(zoneArtOf(square("rockfall"), 0)).toBeUndefined();
  });

  it("faces the north-west edges towards the sun, whichever way the outline winds", () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    for (const outline of [clockwise, [...clockwise].reverse()]) {
      const facings = reliefEdges(outline).map(({ from, to, facing }) => ({
        side: from.y === 0 && to.y === 0 ? "north" : from.x === 10 && to.x === 10 ? "east" : "",
        facing,
      }));
      expect(facings.find(({ side }) => side === "north")?.facing).toBeGreaterThan(0);
      expect(facings.find(({ side }) => side === "east")?.facing).toBeLessThan(0);
    }
  });

  it("casts its shadow just outside the edges away from the sun", () => {
    const { painter, calls } = recorder();
    const art = zoneArtOf(square("grove"), 0);
    if (art === undefined) {
      throw new Error("a grove has a ground");
    }
    paintZoneShadow(painter, art.outline, 1);
    const lines = calls.filter(([name]) => name === "lineBetween");
    expect(lines.length).toBeGreaterThan(0);
    for (const [, x1, y1, x2, y2] of lines as [string, number, number, number, number][]) {
      // Off its north and west edges, and outside it.
      expect(Math.min(x1, x2)).toBeGreaterThan(100);
      expect(Math.min(y1, y2)).toBeGreaterThan(100);
      expect(pointInPolygon({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, art.outline)).toBe(false);
    }
  });
});

describe("a liquid zone's cells (#4062)", () => {
  it("lays cells on every water zone, and on no lava, mud or other ground", () => {
    const liquids = new Set<string>();
    for (const kind of ZONE_KINDS) {
      const art = zoneArtOf(square(kind), 0);
      const liquid = art === undefined ? undefined : liquidOf(art.painter);
      if (liquid !== undefined) {
        liquids.add(liquid);
      }
    }
    expect([...liquids].sort()).toEqual([...LIQUID_ZONES].sort());
    expect(liquidOf("lava")).toBeUndefined();
    expect(liquidOf("mud")).toBeUndefined();
  });

  it("orders the cells' sizes: foul water's the largest, a spring's the smallest", () => {
    const cells = LIQUID_ZONES.map((id) => ZONE_CAUSTICS[id].cell);
    expect(cells).toEqual([...cells].sort((a, b) => b - a));
    expect(new Set(cells).size).toBe(cells.length);
    expect(LIQUID_ZONES[0]).toBe("foul-water");
    expect(LIQUID_ZONES.at(-1)).toBe("spring");
  });

  it("declares exactly the uniforms the scene sets, so none is silently zero", () => {
    const declared = [...CAUSTICS_FRAGMENT.matchAll(/^uniform \w+ (\w+);$/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual(["uAlpha", "uBounds", "uCell", "uColour", "uGround", "uTime"]);
  });

  it("layers two Voronoi patterns at different scales and speeds", () => {
    const layers = [...CAUSTICS_FRAGMENT.matchAll(/voronoi\(uv[^;]*;/g)].map((m) => m[0]);
    expect(layers).toHaveLength(2);
    expect(layers[0]).not.toBe(layers[1]);
  });
});
