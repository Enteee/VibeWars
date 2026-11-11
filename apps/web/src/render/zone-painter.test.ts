import { pointInPolygon } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { MapZone } from "./arena-snapshot.js";
import { shoreDistance } from "./water-shape.js";
import { ZONE_LOOK } from "./zone-look.js";
import {
  paintZoneMotion,
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

  it("stands the spire's obelisk on its centroid", () => {
    const art = zoneArtOf(square("draining-spire"), 0);
    if (art === undefined) {
      throw new Error("spire");
    }
    const painted = recorder();
    paintZoneMotion(painted.painter, art, 1, 0, true);
    const outlines = painted.calls.filter(([name]) => name === "fillOutline");
    expect(outlines.length).toBeGreaterThan(0);
    expect(art.centroid).toEqual({ x: 160, y: 145 });
  });
});
