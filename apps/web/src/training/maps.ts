import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import trainingField from "@vibewars/game-maps/training/training-field/map.json" with { type: "json" };
import trainingHall from "@vibewars/game-maps/training/training-hall/map.json" with { type: "json" };
import trainingPillars from "@vibewars/game-maps/training/training-pillars/map.json" with { type: "json" };

/**
 * The training arenas (#2 §4.4), as real map geometry in the browser.
 *
 * Vite inlines the JSON; it is validated here, at module load, so a
 * malformed map fails loudly in the browser exactly as it would on the
 * server, rather than drawing something the simulation disagrees with.
 */
export const TRAINING_MAPS: ReadonlyMap<string, MapData> = new Map(
  [trainingHall, trainingPillars, trainingField].map((raw) => {
    const map = validateMapData(raw);
    return [map.id, map];
  }),
);
