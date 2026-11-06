import { describe, expect, it } from "vitest";

import type { RenderableWall } from "./arena-snapshot.js";
import { mapLayerChanged, type MapLayer } from "./map-layer.js";

const WALLS: readonly RenderableWall[] = [{ kind: "rect", x: 10, y: 20, width: 30, height: 40 }];
const LAYER: MapLayer = { width: 960, height: 640, walls: WALLS, zoom: 0.65 };

describe("the arena's map layer (#1353)", () => {
  it("is drawn on the first frame", () => {
    expect(mapLayerChanged(undefined, LAYER)).toBe(true);
  });

  it("is not drawn again while the bounds, the wall list and the zoom stay", () => {
    expect(mapLayerChanged(LAYER, { width: 960, height: 640, walls: WALLS, zoom: 0.65 })).toBe(
      false,
    );
  });

  it("is drawn again for a new zoom alone, so its lines stay 1 px (#2393)", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, zoom: 0.7 })).toBe(true);
  });

  it("is drawn again for new bounds", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, width: 2800 })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, height: 1800 })).toBe(true);
  });

  it("is drawn again for a new wall list, even one of the same walls", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [...WALLS] })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [] })).toBe(true);
  });
});
