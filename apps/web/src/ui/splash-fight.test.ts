import { describe, expect, it } from "vitest";

import { hostMap, mapStructure, teamArenaMapIds } from "../net/maps.js";
import { pickSurface } from "../render/layer-surfaces.js";
import { splashSimulation } from "./splash-fight.js";

describe("the splash fight's simulation (#3222)", () => {
  // CI (#3222): on Crossroads, whose ground is its layer 1, a flat world
  // refused every walk that named it.
  it.each(teamArenaMapIds(8))("takes the walks clicks name on %s", (mapId) => {
    const map = hostMap(mapId);
    if (map === undefined) {
      throw new Error(`no map ${mapId}`);
    }
    const simulation = splashSimulation(map, { mapId, teamSize: 8, still: false }, "walk");
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
