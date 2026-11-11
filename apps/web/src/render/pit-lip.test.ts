import { describe, expect, it } from "vitest";

import { pointInPolygon, TRAINING_SCENARIOS, type Vec2 } from "@vibewars/game-core";
import type { MapData } from "@vibewars/game-maps/schema";

import { ARENA_MAPS, structureOf } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import { pitLipTop, shapeOutline } from "./layer-surfaces.js";

/** Room between a pit's content and its lip, which draws 3 px wide. */
const MARGIN = 4;

const SHIPPED: readonly MapData[] = [...ARENA_MAPS, ...TRAINING_MAPS.values()];

/**
 * What of `map` lies on a pit's floor and reaches into the strip its near
 * lip hides, by name: `points` is what `name` covers on `layer`.
 */
function underTheLip(
  map: MapData,
  things: readonly { name: string; layer: number; points: readonly Vec2[] }[],
): string[] {
  const { structure } = structureOf(map);
  return structure.pits.flatMap((pit) => {
    const footprint = shapeOutline(pit.footprint);
    const lip = pitLipTop(structure, pit) - MARGIN;
    return things
      .filter(
        ({ layer, points }) =>
          layer < structure.ground && points.some((point) => pointInPolygon(point, footprint)),
      )
      .filter(({ points }) => Math.max(...points.map(({ y }) => y)) > lip)
      .map(({ name }) => `${map.id}: ${name}`);
  });
}

describe("nothing on a pit's floor hides under its lip (#3081)", () => {
  it("leaves every zone and water body in sight", () => {
    const hidden = SHIPPED.flatMap((map) =>
      underTheLip(map, [
        ...(map.zones ?? []).map(({ id, layer, area }) => ({
          name: id,
          layer,
          points: shapeOutline(area),
        })),
        ...(map.water ?? []).map(({ id, layer, area }) => ({
          name: id,
          layer,
          points: shapeOutline(area),
        })),
      ]),
    );
    expect(hidden).toEqual([]);
  });

  it("leaves every training dummy in sight", () => {
    const hidden = TRAINING_SCENARIOS.flatMap((scenario) => {
      const map = TRAINING_MAPS.get(scenario.mapId);
      expect(map, scenario.mapId).toBeDefined();
      return map === undefined
        ? []
        : underTheLip(
            map,
            scenario.dummies.map(({ id, layer, position }) => ({
              name: `${scenario.id}/${id}`,
              layer,
              points: [position],
            })),
          );
    });
    expect(hidden).toEqual([]);
  });

  it("finds a zone that reaches into the lip", () => {
    const wilds = TRAINING_MAPS.get("training-wilds");
    expect(wilds).toBeDefined();
    if (wilds === undefined) {
      return;
    }
    const sunk = { kind: "rect", x: 390, y: 728, width: 80, height: 52 } as const;
    expect(underTheLip(wilds, [{ name: "sunk", layer: 0, points: shapeOutline(sunk) }])).toEqual([
      "training-wilds: sunk",
    ]);
  });
});
