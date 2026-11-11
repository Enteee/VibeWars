import {
  MatchSimulation,
  TRAINING_SCENARIOS,
  applyIntent,
  breakableTargetId,
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
      "vent",
      "gas-spout",
      "rockfall",
      "rockfall",
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
      return {
        spawn: { x: zone.area.x + zone.area.width / 2, y: zone.area.y + zone.area.height / 2 },
        layer: zone.layer,
      };
    };
    const simulation = new MatchSimulation({
      seed: "wilds",
      teamCount: map.teams,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      layers: matchLayers(map),
      zones: matchZones(map),
      participants: [
        { ...template, id: "you", team: 0, spawn, layer: 1, behaviour: undefined },
        ...patches.map(([id]) => ({
          ...template,
          ...centre(id),
          id,
          team: 0,
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

  it("poisons the dummy in the gas spout as it strikes, and rolls rocks over it first (#3029)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    const bears = (id: string, status: string): boolean =>
      loaded(simulation.get(id), id).combatant.statuses.active.some(({ id }) => id === status);
    // The rocks pass over it before the spout's first window, at 3 s.
    for (let tick = 0; tick < 30; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(bears("in-gas-spout", "crippled")).toBe(true);
    expect(bears("in-gas-spout", "poison")).toBe(false);
    for (let tick = 0; tick < 3 * 30; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(bears("in-gas-spout", "poison")).toBe(true);
    expect(bears(SELF_ID, "poison")).toBe(false);
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
    applyIntent(simulation, "you", { kind: "walk-to", x: to.x, y: to.y, layer: 1 });
    for (let tick = 0; tick < 1800; tick += 1) {
      simulation.step(1 / 30);
    }
    const { position } = loaded(simulation.get("you"), "you");
    expect(Math.hypot(position.x - to.x, position.y - to.y)).toBeLessThan(5);
  });

  it("is a lit valley of three heights: a basin below the ground, a ridge above it (#3049)", () => {
    expect(map.layers).toBeGreaterThanOrEqual(3);
    expect(map.pits.length).toBeGreaterThan(0);
    expect(map.decks.length).toBeGreaterThan(0);
    expect(map.water?.length).toBeGreaterThan(0);
    expect(map.lighting?.sun).toBeDefined();
    expect(map.lighting?.lights.length).toBeLessThanOrEqual(16);
  });

  describe("reaches every element on foot from the spawn (#3049)", () => {
    const [west] = map.spawnPoints;
    const spawn = loaded(west, "a spawn");
    const middle = (points: readonly { x: number; y: number }[]) => ({
      x: points.reduce((sum, { x }) => sum + x, 0) / points.length,
      y: points.reduce((sum, { y }) => sum + y, 0) / points.length,
    });
    const goals = [
      ...(map.zones ?? []).map((zone) => ({
        what: `zone ${zone.id}`,
        layer: zone.layer,
        goal:
          zone.area.kind === "rect"
            ? { x: zone.area.x + zone.area.width / 2, y: zone.area.y + zone.area.height / 2 }
            : middle(zone.area.points),
      })),
      ...scenario.dummies.map((dummy) => ({
        what: `dummy ${dummy.id}`,
        layer: dummy.layer,
        goal: dummy.position,
      })),
      ...(map.switches ?? []).map((lever) => ({
        what: `lever ${lever.id}`,
        layer: lever.layer,
        goal: lever.position,
      })),
      ...(map.teleports ?? []).flatMap((teleport) => [
        {
          what: `portal ${teleport.id}`,
          layer: teleport.from.layer,
          goal: middle(teleport.from.area.points),
        },
        {
          what: `portal ${teleport.id} exit`,
          layer: teleport.to.layer,
          goal: teleport.to.position,
        },
      ]),
      // The side room's three ways in, each from outside it; the room behind is
      // the lever, cracked wall and barrier tests'.
      { what: "gate side-room-door", layer: 1, goal: { x: 290, y: 720 } },
      { what: "breakable side-room-crack", layer: 1, goal: { x: 80, y: 600 } },
      { what: "gate side-room-shimmer", layer: 1, goal: { x: 202, y: 600 } },
    ];
    const [template] = scenarioParticipants(scenario, spawn.position);

    it.each(goals.map((goal) => [goal.what, goal] as const))("%s", (_what, { layer, goal }) => {
      if (template === undefined) throw new Error("no dummies");
      const simulation = new MatchSimulation({
        seed: "wilds",
        teamCount: map.teams,
        walls: allWallSegments(map.walls),
        bounds: { width: map.width, height: map.height },
        layers: matchLayers(map),
        zones: matchZones(map),
        participants: [
          {
            ...template,
            id: "you",
            team: 0,
            spawn: spawn.position,
            layer: spawn.layer,
            behaviour: undefined,
          },
        ],
      });
      applyIntent(simulation, "you", { kind: "walk-to", ...goal, layer });
      const there = (): boolean => {
        const body = loaded(simulation.get("you"), "you");
        return (
          body.layer === layer && Math.hypot(body.position.x - goal.x, body.position.y - goal.y) < 5
        );
      };
      for (let tick = 0; tick < 1200 && !there(); tick += 1) {
        simulation.step(1 / 30);
      }
      expect(there()).toBe(true);
    });
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
      applyIntent(simulation, SELF_ID, { kind: "walk-to", ...room, layer: 1 });
      for (let tick = 0; tick < 300; tick += 1) {
        simulation.step(1 / 30);
      }
      return loaded(simulation.get(SELF_ID), SELF_ID).position;
    };
    const shut = walkIn();
    expect(shut.y).toBeLessThan(620);
    expect(simulation.gates.map(({ open }) => open)).toEqual([false, false]);

    applyIntent(simulation, SELF_ID, {
      kind: "attack",
      targetId: switchTargetId("side-room-lever"),
    });
    for (let tick = 0; tick < 300 && simulation.gates[0]?.open !== true; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(simulation.switches.find(({ id }) => id === "side-room-lever")?.up).toBe(false);
    expect(simulation.gates.map(({ open }) => open)).toEqual([true, false]);
    const inside = walkIn();
    expect(Math.hypot(inside.x - room.x, inside.y - room.y)).toBeLessThan(5);
  });

  it("breaks the side room's cracked wall, and walks you in through the gap (#3031)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    const room = { x: 80, y: 700 };
    const walkIn = (): { x: number; y: number } => {
      applyIntent(simulation, SELF_ID, { kind: "walk-to", ...room, layer: 1 });
      for (let tick = 0; tick < 300; tick += 1) {
        simulation.step(1 / 30);
      }
      return loaded(simulation.get(SELF_ID), SELF_ID).position;
    };
    expect(walkIn().y).toBeLessThan(620);

    const crack = breakableTargetId("side-room-crack");
    applyIntent(simulation, SELF_ID, { kind: "attack", targetId: crack });
    for (let tick = 0; tick < 30 * 120 && simulation.breakables[0]?.health !== 0; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(simulation.breakables.map(({ health }) => health)).toEqual([0]);
    const inside = walkIn();
    expect(Math.hypot(inside.x - room.x, inside.y - room.y)).toBeLessThan(5);
  });

  it("stands a shimmering barrier on a plate inside the side room (#3031)", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    expect(simulation.gates.map(({ blocks }) => blocks)).toEqual(["all", "bodies-and-shots"]);
  });
});

describe("Training Wilds' portals (#3030)", () => {
  it("are off until the lever by them is thrown, then take you up onto the ridge", () => {
    const { simulation } = setupScenario(scenario, newCharacter("c1"));
    const portal = loaded(
      map.teleports?.find(({ id }) => id === "ridge-up"),
      "ridge-up",
    );
    const entry = {
      x:
        portal.from.area.points.reduce((sum, { x }) => sum + x, 0) / portal.from.area.points.length,
      y:
        portal.from.area.points.reduce((sum, { y }) => sum + y, 0) / portal.from.area.points.length,
    };
    const walkIn = (): void => {
      applyIntent(simulation, SELF_ID, { kind: "walk-to", ...entry, layer: portal.from.layer });
      for (let tick = 0; tick < 600; tick += 1) {
        simulation.step(1 / 30);
      }
    };
    walkIn();
    const off = loaded(simulation.get(SELF_ID), SELF_ID);
    expect(off.layer).toBe(portal.from.layer);
    expect(Math.hypot(off.position.x - entry.x, off.position.y - entry.y)).toBeLessThan(5);
    expect(simulation.teleports.map(({ on }) => on)).toEqual([false, false]);

    applyIntent(simulation, SELF_ID, { kind: "attack", targetId: switchTargetId("ridge-lever") });
    for (let tick = 0; tick < 300 && simulation.teleports[0]?.on !== true; tick += 1) {
      simulation.step(1 / 30);
    }
    expect(simulation.teleports.map(({ on }) => on)).toEqual([true, true]);
    walkIn();
    const arrived = loaded(simulation.get(SELF_ID), SELF_ID);
    expect(arrived.layer).toBe(portal.to.layer);
    expect(
      Math.hypot(
        arrived.position.x - portal.to.position.x,
        arrived.position.y - portal.to.position.y,
      ),
    ).toBeLessThan(5);
  });
});
