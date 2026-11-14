import type { Vec2 } from "@vibewars/game-core";
import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import tutorialCanyon from "@vibewars/game-maps/tutorial/tutorial-canyon/map.json" with { type: "json" };

/**
 * The tutorial canyon (#3245, docs/art/3187-tutorial-canyon.md): one trail
 * from the arrival pad past station sites 4 to 14 to the mist gate. It is
 * in no queue, list or picker; only the tutorial loads it. Validated at
 * module load, as the training arenas are.
 */
export const TUTORIAL_CANYON: MapData = validateMapData(tutorialCanyon);

/** A point on the trail, on its layer: site 11 is in the tunnel, under the ground. */
export interface CanyonPoint {
  readonly position: Vec2;
  readonly layer: number;
}

/** The centre of the paving the map marks `id` with. */
function marked(id: string): CanyonPoint {
  const paving = TUTORIAL_CANYON.paving?.find((each) => each.id === id);
  if (paving === undefined) {
    throw new Error(`tutorial canyon: no paving marks ${id}`);
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
    position: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    },
    layer: paving.layer,
  };
}

/** Where the pair arrives, at the west end of the south leg. */
export const CANYON_ARRIVAL: CanyonPoint = marked("arrival");

/** Each station's site, 4 to 14, along the trail. */
export const CANYON_SITES: ReadonlyMap<number, CanyonPoint> = new Map(
  Array.from({ length: 11 }, (_, k) => [k + 4, marked(`site-${String(k + 4)}`)] as const),
);

/** The mist gate the trail leaves by, on the north leg. */
export const CANYON_EXIT: CanyonPoint = marked("exit");
