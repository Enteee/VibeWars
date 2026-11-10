import {
  MatchSimulation,
  TRAINING_SCENARIOS,
  applyIntent,
  scenarioParticipants,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { matchLayers, matchZones } from "@vibewars/game-maps/layers";
import { describe, expect, it } from "vitest";

import { newCharacter } from "../ui/build-editor.js";
import { TRAINING_MAPS } from "./maps.js";
import { SELF_ID, setupScenario } from "./scenario-setup.js";

function loaded<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`no ${what}`);
  return value;
}

const map = loaded(TRAINING_MAPS.get("training-wilds"), "training-wilds");
const scenario = loaded(
  TRAINING_SCENARIOS.find(({ id }) => id === "wilds"),
  "wilds",
);

const burning = (simulation: MatchSimulation, id: string): boolean =>
  loaded(simulation.get(id), id).combatant.statuses.active.some(
    (status) => status.id === "burning",
  );

describe("Training Wilds (#3024)", () => {
  it("has one scorched strip across its lane", () => {
    expect(matchZones(map).map(({ kind }) => kind)).toEqual(["scorched"]);
  });

  it("walks from one team's spawn to the other's", () => {
    const [west, east] = map.spawnPoints;
    const from = loaded(west, "a spawn").position;
    const to = loaded(east, "a spawn").position;
    const [template] = scenarioParticipants(scenario, to);
    if (template === undefined) throw new Error("no dummies");
    const simulation = new MatchSimulation({
      seed: "wilds",
      teamCount: map.teams,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      layers: matchLayers(map),
      zones: matchZones(map),
      participants: [{ ...template, id: "you", team: 0, spawn: from, behaviour: undefined }],
    });
    applyIntent(simulation, "you", { kind: "walk-to", x: to.x, y: to.y, layer: 0 });
    for (let tick = 0; tick < 1800; tick += 1) {
      simulation.step(1 / 30);
    }
    const { position } = loaded(simulation.get("you"), "you");
    expect(Math.hypot(position.x - to.x, position.y - to.y)).toBeLessThan(5);
  });

  it("burns the dummy standing in the strip within a second, and not you at your spawn", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(burning(simulation, "in-embers")).toBe(true);
    expect(burning(simulation, SELF_ID)).toBe(false);
  });
});
