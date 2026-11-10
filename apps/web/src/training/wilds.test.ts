import {
  MatchSimulation,
  TRAINING_SCENARIOS,
  applyIntent,
  scenarioParticipants,
  switchTargetId,
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
  it("has a scorched strip across its lane, and a patch of each other harmful kind (#3027)", () => {
    expect(matchZones(map).map(({ kind }) => kind)).toEqual([
      "scorched",
      "molten",
      "toxic-fog",
      "mire",
      "foul-water",
      "spring",
      "grove",
      "tainted-water",
      "draining-spire",
    ]);
  });

  it("puts each patch's status on the dummy standing in it (#3027)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(1 / 30);
    }
    const bears = (id: string, status: string): boolean =>
      loaded(simulation.get(id), id).combatant.statuses.active.some(({ id }) => id === status);
    expect(bears("in-lava", "burning") && bears("in-lava", "crippled")).toBe(true);
    expect(bears("in-fog", "poison")).toBe(true);
    expect(bears("in-mire", "mired")).toBe(true);
    expect(bears("in-swamp", "fouled")).toBe(true);
    expect(bears(SELF_ID, "mired")).toBe(false);
  });

  it("puts each #3028 patch's status on a body standing in it, not on you at your spawn", () => {
    const [west] = map.spawnPoints;
    const spawn = loaded(west, "a spawn").position;
    const [template] = scenarioParticipants(scenario, spawn);
    if (template === undefined) throw new Error("no dummies");
    const patches = [
      ["west-spring", "refreshed"],
      ["west-grove", "fleet"],
      ["east-tainted-water", "tainted"],
      ["east-spire", "drained"],
    ] as const;
    const centre = (id: string) => {
      const zone = loaded(
        (map.zones ?? []).find((each) => each.id === id),
        id,
      );
      if (zone.area.kind !== "rect") throw new Error(`${id} is no rect`);
      return { x: zone.area.x + zone.area.width / 2, y: zone.area.y + zone.area.height / 2 };
    };
    const simulation = new MatchSimulation({
      seed: "wilds",
      teamCount: map.teams,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      layers: matchLayers(map),
      zones: matchZones(map),
      participants: [
        { ...template, id: "you", team: 0, spawn, behaviour: undefined },
        ...patches.map(([id]) => ({
          ...template,
          id,
          team: 0,
          spawn: centre(id),
          behaviour: undefined,
        })),
      ],
    });
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(1 / 30);
    }
    const bears = (id: string, status: string): boolean =>
      loaded(simulation.get(id), id).combatant.statuses.active.some(({ id }) => id === status);
    for (const [id, status] of patches) {
      expect(bears(id, status), id).toBe(true);
      expect(bears("you", status)).toBe(false);
    }
  });

  it("stands a dummy in the tainted water, so a skill's Health shows beside it (#3028)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(1 / 30);
    }
    const bears = (id: string, status: string): boolean =>
      loaded(simulation.get(id), id).combatant.statuses.active.some(({ id }) => id === status);
    expect(bears("in-tainted-water", "tainted")).toBe(true);
    expect(bears(SELF_ID, "tainted")).toBe(false);
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

  it("opens the side room's door from the lever outside it, and walks you in (#3025)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    const room = { x: 130, y: 720 };
    const walkIn = (): { x: number; y: number } => {
      applyIntent(simulation, SELF_ID, { kind: "walk-to", ...room, layer: 0 });
      for (let tick = 0; tick < 300; tick += 1) {
        simulation.step(1 / 30);
      }
      return loaded(simulation.get(SELF_ID), SELF_ID).position;
    };
    const shut = walkIn();
    expect(shut.y).toBeLessThan(620);
    expect(simulation.gates.map(({ open }) => open)).toEqual([false]);

    applyIntent(simulation, SELF_ID, {
      kind: "attack",
      targetId: switchTargetId("side-room-lever"),
    });
    for (let tick = 0; tick < 300 && simulation.gates[0]?.open !== true; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(simulation.switches.map(({ up }) => up)).toEqual([false]);
    expect(simulation.gates.map(({ open }) => open)).toEqual([true]);
    const inside = walkIn();
    expect(Math.hypot(inside.x - room.x, inside.y - room.y)).toBeLessThan(5);
  });
});
