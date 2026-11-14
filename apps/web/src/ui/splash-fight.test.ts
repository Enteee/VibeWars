import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { hostMap, mapStructure, teamArenaMapIds } from "../net/maps.js";
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
    const { structure } = mapStructure(mapId);
    const bodies = [...simulation.participants()];
    // #3250: a flat world stood Crossroads' bots on layer 0, under its fountain.
    expect(bodies.map((body) => body.layer)).toEqual(bodies.map(() => structure.ground));
    const taken = bodies.filter((body) => {
      const picked = pickSurface(structure, body.position, false);
      simulation.walkTo(body.id, picked.point, picked.layer);
      return simulation.get(body.id)?.walkLayer === picked.layer;
    });
    // Not every one: a body at a ramp's foot may pick the floor it is
    // leaving (Canyon). A flat world refused them all.
    expect(taken.length).toBeGreaterThan(bodies.length / 2);
  });
});

describe("the splash fight's bots (#3336)", () => {
  const [mapId = ""] = teamArenaMapIds(4);
  const map = hostMap(mapId);
  if (map === undefined) {
    throw new Error(`no map ${mapId}`);
  }
  const fight = { mapId, teamSize: 4, still: false };

  it("keeps each bot's professions, off the build it plays", () => {
    const builds = STARTER_BUILDS.slice(0, 2);
    let at = 0;
    // Each pick takes the next build in turn, so which bot plays which is known.
    const { specs, professions } = splashParticipants(
      map,
      fight,
      undefined,
      () => builds,
      () => (at++ % builds.length) / builds.length,
    );
    expect(specs.map(({ id }) => professions.get(id))).toEqual(
      specs.map((_, index) => {
        const build = builds[index % builds.length];
        return { primary: build?.primaryProfession, secondary: build?.secondaryProfession };
      }),
    );
  });

  it("shows every bot's primary profession in the snapshot, for its icon", () => {
    const players = splashConnection(map, fight, "icons").getSnapshot().players;
    expect(players).toHaveLength(2 * fight.teamSize);
    for (const player of players) {
      expect(player.primaryProfession).toBeDefined();
    }
  });
});
