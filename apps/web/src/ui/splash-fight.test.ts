import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { hostMap, mapStructure, teamArenaMapIds } from "../net/maps.js";
import { toRenderableWall } from "../match-view.js";
import { pickSurface } from "../render/layer-surfaces.js";
import { splashConnection, splashParticipants, splashSimulation } from "./splash-fight.js";

describe("the splash fight's simulation (#3222)", () => {
  // CI (#3222): on Crossroads, whose ground is its layer 1, a flat world
  // refused every walk that named it.
  it.each(teamArenaMapIds(8))("takes the walks clicks name on %s", (mapId) => {
    const map = hostMap(mapId);
    if (map === undefined) {
      throw new Error(`no map ${mapId}`);
    }
    const { simulation } = splashSimulation(map, { mapId, teamSize: 8, still: false }, "walk");
    const { structure, wallLayers } = mapStructure(mapId);
    const walls = map.descriptor.walls.map((wall, at) =>
      toRenderableWall(wall, wallLayers[at] ?? 0),
    );
    const bodies = [...simulation.participants()];
    // #3250: a flat world stood Crossroads' bots on layer 0, under its fountain.
    expect(bodies.map((body) => body.layer)).toEqual(bodies.map(() => structure.ground));
    const taken = bodies.filter((body) => {
      const picked = pickSurface(structure, walls, body.position, false);
      simulation.walkTo(body.id, picked.point, picked.layer);
      return simulation.get(body.id)?.walkLayer === picked.layer;
    });
    // Not every one: a body at a ramp's foot may pick the floor it is
    // leaving (Canyon). A flat world refused them all.
    expect(taken.length).toBeGreaterThan(bodies.length / 2);
  });
});

describe("the splash fight's professions (#3336)", () => {
  const mapId = teamArenaMapIds(4)[0] ?? "";
  const map = hostMap(mapId);
  if (map === undefined) {
    throw new Error(`no map ${mapId}`);
  }
  const fight = { mapId, teamSize: 4, still: false };

  it("gives each bot the professions of the build it plays", () => {
    const [ours, theirs] = STARTER_BUILDS.filter(
      (build, at, all) =>
        all.findIndex((other) => other.primaryProfession === build.primaryProfession) === at,
    );
    if (ours === undefined || theirs === undefined) {
      throw new Error("two starter builds of two professions");
    }
    const { participants, professions } = splashParticipants(map, fight, undefined, (team) =>
      team === 0 ? [ours] : [theirs],
    );
    expect(participants).toHaveLength(8);
    for (const bot of participants) {
      const build = bot.team === 0 ? ours : theirs;
      expect(professions.get(bot.id)).toEqual({
        primary: build.primaryProfession,
        secondary: build.secondaryProfession,
      });
    }
  });

  it("draws every bot with its primary profession, as a match does", () => {
    const players = splashConnection(map, fight, "professions").getSnapshot().players;
    // By id: a bot that plays a ranger may bring a pet, which has none.
    const bots = [0, 1].flatMap((team) =>
      [0, 1, 2, 3].map((index) => `splash-${String(team)}-${String(index)}`),
    );
    for (const id of bots) {
      const player = players.find((candidate) => candidate.sessionId === id);
      expect(player?.primaryProfession, id).toBeDefined();
    }
  });
});

describe("the splash fight's world (#3407)", () => {
  it("stands the map's gates and breakable walls, as a match does", () => {
    // Sandstone Steps: lever-worked gates on its under-pass and a mud-brick
    // wall in its south alley (#3278). The splash once built neither.
    const mapId = "sandstone-steps";
    const map = hostMap(mapId);
    if (map === undefined) {
      throw new Error(`no map ${mapId}`);
    }
    const snapshot = splashConnection(
      map,
      { mapId, teamSize: 1, still: false },
      "world",
    ).getSnapshot();
    expect(snapshot.gates).toHaveLength(map.descriptor.gates.length);
    expect(snapshot.gates.length).toBeGreaterThan(0);
    expect(snapshot.breakables).toHaveLength(map.descriptor.breakables.length);
    expect(snapshot.breakables.every((health) => health > 0)).toBe(true);
  });
});

describe("the splash fight on a three-team map (#3633)", () => {
  const mapId = "threefold-keep";
  const map = hostMap(mapId);
  if (map === undefined) {
    throw new Error(`no map ${mapId}`);
  }

  it.each([false, true])("seats three sides of the size, still %s", (still) => {
    const fight = { mapId, teamSize: 8, still };
    const { participants } = splashParticipants(map, fight);
    expect(participants).toHaveLength(24);
    expect(new Set(participants.map((bot) => bot.team))).toEqual(new Set([0, 1, 2]));
    // The third side comes in from below the others, facing up.
    const third = participants.filter((bot) => bot.team === 2);
    const others = participants.filter((bot) => bot.team !== 2);
    const lowest = Math.max(...others.map((bot) => bot.spawn.y));
    for (const bot of third) {
      expect(bot.spawn.y).toBeGreaterThan(lowest);
      expect(bot.facing).toBe(-Math.PI / 2);
    }
  });

  it("fights on, its three sides walking in", () => {
    const { simulation } = splashSimulation(map, { mapId, teamSize: 8, still: false }, "three");
    for (let tick = 0; tick < 100; tick += 1) {
      simulation.step(0.1);
    }
    expect(simulation.outcome.phase).not.toBe("finished");
    expect(new Set([...simulation.participants()].map((body) => body.combatant.team))).toEqual(
      new Set([0, 1, 2]),
    );
  });
});
