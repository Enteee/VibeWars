import type { Vec2 } from "@vibewars/game-core";
import type { MapData } from "@vibewars/game-maps/schema";
import { bundledMaps } from "../net/bundled-maps.js";
import tutorialCanyon from "@vibewars/game-maps/tutorial/tutorial-canyon/map.json" with { type: "json" };

/**
 * The tutorial canyon (#3245, docs/art/3187-tutorial-canyon.md): one trail
 * on one map (#3792) from the arrival pad past station sites 4 to 14 to
 * the mist gate. It is in no queue, list or picker; only the tutorial
 * loads it. CI validates it, not the page (`bundledMaps`, #3679).
 */
export const [TUTORIAL_CANYON]: readonly [MapData] = bundledMaps([tutorialCanyon]);

/** A point on the trail, on its layer: site 11 is in the tunnel, under the ground. */
export interface CanyonPoint {
  readonly position: Vec2;
  readonly layer: number;
}

/** The centre of the paving the canyon marks `id` with. */
function marked(id: string): CanyonPoint {
  const paving = TUTORIAL_CANYON.paving?.find((each) => each.id === id);
  if (paving === undefined) {
    throw new Error(`${TUTORIAL_CANYON.id}: no paving marks ${id}`);
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

/** The mist gate the trail leaves by, at the east end of the north leg. */
export const CANYON_EXIT: CanyonPoint = marked("exit");

/**
 * Each station's site along the trail, by the number the study gives it:
 * 4 to 14, but no 10, whose high deck is gone (#3792).
 */
export const CANYON_SITES: ReadonlyMap<number, CanyonPoint> = new Map(
  [4, 5, 6, 7, 8, 9, 11, 12, 13, 14].map((site) => [site, marked(`site-${String(site)}`)] as const),
);

/** Station 13's junction (#3792): each arm's mark round the rock island, and where they rejoin. */
export const CANYON_NORTH_ARM: CanyonPoint = marked("site-13n");
export const CANYON_SOUTH_ARM: CanyonPoint = marked("site-13s");
export const CANYON_REJOIN: CanyonPoint = marked("site-13r");

/** The bay off the south arm (#3332), where the parasol and deck chair stand. */
export const CANYON_BAY: CanyonPoint = marked("site-13b");
