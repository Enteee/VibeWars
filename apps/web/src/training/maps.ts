import type { MapData } from "@vibewars/game-maps/schema";
import { bundledMaps } from "../net/bundled-maps.js";
import trainingField from "@vibewars/game-maps/training/training-field/map.json" with { type: "json" };
import trainingHall from "@vibewars/game-maps/training/training-hall/map.json" with { type: "json" };
import trainingHeights from "@vibewars/game-maps/training/training-heights/map.json" with { type: "json" };
import trainingPillars from "@vibewars/game-maps/training/training-pillars/map.json" with { type: "json" };
import trainingWilds from "@vibewars/game-maps/training/training-wilds/map.json" with { type: "json" };

/**
 * The training arenas (#2 §4.4), as real map geometry in the browser.
 *
 * Vite inlines the JSON; CI validates it, not the page (`bundledMaps`, #3679).
 */
export const TRAINING_MAPS: ReadonlyMap<string, MapData> = new Map(
  bundledMaps([trainingHall, trainingPillars, trainingField, trainingHeights, trainingWilds]).map(
    (map) => [map.id, map],
  ),
);
