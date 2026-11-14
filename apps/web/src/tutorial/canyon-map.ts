import type { Vec2 } from "@vibewars/game-core";
import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import tutorialCanyon1 from "@vibewars/game-maps/tutorial/tutorial-canyon-1/map.json" with { type: "json" };
import tutorialCanyon2 from "@vibewars/game-maps/tutorial/tutorial-canyon-2/map.json" with { type: "json" };

/**
 * The tutorial canyon (#3245, docs/art/3187-tutorial-canyon.md): one trail
 * from the arrival pad past station sites 4 to 14 to the mist gate, in two
 * maps, cut as the study says to keep each in the render budget: stations
 * 4 to 7, then 8 to 14. Each has its own arrival and exit. They are in no
 * queue, list or picker; only the tutorial loads them. Validated at module
 * load, as the training arenas are.
 */
export const TUTORIAL_CANYON: readonly [MapData, MapData] = [
  validateMapData(tutorialCanyon1),
  validateMapData(tutorialCanyon2),
];

/** A point on the trail, on its map and layer: site 11 is in the tunnel, under the ground. */
export interface CanyonPoint {
  readonly map: MapData;
  readonly position: Vec2;
  readonly layer: number;
}

/** The centre of the paving `map` marks `id` with. */
function marked(map: MapData, id: string): CanyonPoint {
  const paving = map.paving?.find((each) => each.id === id);
  if (paving === undefined) {
    throw new Error(`${map.id}: no paving marks ${id}`);
  }
  const corners =
    paving.area.kind === "rect"
      ? [
          { x: paving.area.x, y: paving.area.y },
          { x: paving.area.x + paving.area.width, y: paving.area.y + paving.area.height },
        ]
      : paving.area.points;
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  return {
    map,
    position: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    },
    layer: paving.layer,
  };
}

/** Where each map of the canyon is arrived in: the first's is the trail's start. */
export const CANYON_ARRIVALS: readonly [CanyonPoint, CanyonPoint] = [
  marked(TUTORIAL_CANYON[0], "arrival"),
  marked(TUTORIAL_CANYON[1], "arrival"),
];

/** Where each map of the canyon is left by: the second's is the mist gate. */
export const CANYON_EXITS: readonly [CanyonPoint, CanyonPoint] = [
  marked(TUTORIAL_CANYON[0], "exit"),
  marked(TUTORIAL_CANYON[1], "exit"),
];

/** Where the pair arrives, at the west end of the south leg. */
export const CANYON_ARRIVAL: CanyonPoint = CANYON_ARRIVALS[0];

/** Each station's site, 4 to 14, along the trail, on whichever map holds it. */
export const CANYON_SITES: ReadonlyMap<number, CanyonPoint> = new Map(
  Array.from({ length: 11 }, (_, k) => {
    const station = k + 4;
    return [
      station,
      marked(TUTORIAL_CANYON[station <= 7 ? 0 : 1], `site-${String(station)}`),
    ] as const;
  }),
);

/** The mist gate the trail leaves by, on the north leg. */
export const CANYON_EXIT: CanyonPoint = CANYON_EXITS[1];
