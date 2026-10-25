import { describe, expect, it } from "vitest";

import {
  WALK_MARKER_INNER,
  WALK_MARKER_OUTER,
  WALK_MARKER_SECONDS,
  decayWalkMarker,
  walkMarkerAlpha,
  walkMarkerAt,
  walkMarkerTicks,
} from "./walk-marker.js";

describe("the walk marker (#310)", () => {
  it("fades from full to nothing over 400 ms, then is gone", () => {
    const marker = walkMarkerAt({ x: 100, y: 50 });
    expect(walkMarkerAlpha(marker, false)).toBe(1);
    const half = decayWalkMarker(marker, WALK_MARKER_SECONDS / 2);
    expect(half === undefined ? 0 : walkMarkerAlpha(half, false)).toBeCloseTo(0.5);
    expect(decayWalkMarker(half, WALK_MARKER_SECONDS / 2 + 1e-6)).toBeUndefined();
  });

  it("is held at full alpha under reduced motion, for as long", () => {
    const half = decayWalkMarker(walkMarkerAt({ x: 0, y: 0 }), WALK_MARKER_SECONDS / 2);
    expect(half === undefined ? 0 : walkMarkerAlpha(half, true)).toBe(1);
    expect(decayWalkMarker(half, WALK_MARKER_SECONDS)).toBeUndefined();
  });

  it("is four diagonal ticks from 3 to 8 units out, with the centre open", () => {
    const ticks = walkMarkerTicks(walkMarkerAt({ x: 100, y: 50 }));
    expect(ticks).toHaveLength(4);
    const quadrants = new Set<string>();
    for (const [from, to] of ticks) {
      expect(Math.hypot(from.x - 100, from.y - 50)).toBeCloseTo(WALK_MARKER_INNER);
      expect(Math.hypot(to.x - 100, to.y - 50)).toBeCloseTo(WALK_MARKER_OUTER);
      // Diagonal: as far across as down.
      expect(Math.abs(to.x - 100)).toBeCloseTo(Math.abs(to.y - 50));
      quadrants.add(`${String(Math.sign(to.x - 100))},${String(Math.sign(to.y - 50))}`);
    }
    expect(quadrants.size).toBe(4);
  });
});
