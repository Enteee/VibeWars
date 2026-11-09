import type { MatchLayers, TrainingScenario } from "@vibewars/game-core";
import { wallToSegments, shapeVertices } from "@vibewars/game-maps/geometry";
import { validateMapData } from "@vibewars/game-maps/schema";
import raw from "../../../../packages/game-maps/test-maps/layer-test/map.json" with { type: "json" };

import { addDevTrainingMap } from "./scenario-setup.js";

/**
 * The layered test map in the Training Ground (#2830), for `pnpm dev`
 * alone: `training-panel.ts` imports this file behind
 * `import.meta.env.DEV`, so no production bundle holds it. Its text is
 * developer text, as the map id is.
 */
const map = validateMapData(raw);

const layers: MatchLayers = {
  count: map.layers,
  walls: Array.from({ length: map.layers }, (_, layer) =>
    map.walls.filter((wall) => wall.layer === layer).flatMap(wallToSegments),
  ),
  decks: map.decks.map((deck) => ({
    layer: deck.layer,
    footprint: shapeVertices(deck.footprint),
  })),
  transitions: map.transitions.map((transition) => ({
    from: transition.from,
    to: transition.to,
    area: shapeVertices(transition.area),
  })),
};

const dummy = (id: string, x: number, y: number): TrainingScenario["dummies"][number] => ({
  id,
  label: id,
  team: 1,
  position: { x, y },
  armor: 60,
  maxHealth: 10000,
  skillBar: [],
  attributeRanks: {},
  baseEnergyPips: 0,
  behaviour: { kind: "idle" },
});

export const LAYER_TEST_SCENARIO: TrainingScenario = {
  id: map.id,
  label: map.id,
  teaches: map.id,
  mapId: map.id,
  exercises: [],
  knobs: [],
  dummies: [dummy("on-deck", 700, 400), dummy("under-deck", 760, 400), dummy("ground", 240, 300)],
};

addDevTrainingMap({
  map,
  layers,
  dummyLayers: new Map([
    ["on-deck", 1],
    ["under-deck", 0],
    ["ground", 0],
  ]),
});
