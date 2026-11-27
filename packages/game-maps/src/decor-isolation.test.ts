import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadMap } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { mapNavGraphs } from "./nav-graphs.js";

/** The maps with decor (#4013, #4017, #4021, #4022). */
const DECORATED = [
  "ashen-courtyard",
  "hall-of-heroes-capture",
  "hall-of-heroes-king",
  "hall-of-heroes-relic",
  "wardens-gallery",
  "elite-zaishen-battle",
  "sunken-bastion",
  "threefold-keep",
  "broken-tower",
  "hollow-deep",
  "guild-hall-isle",
  "elonian-plateau",
  "shiverpeak-pass",
  "frozen-crossing",
  "arena-canyon",
  "sandstone-steps",
];

describe.each(DECORATED)("decor on %s (#4013)", (mapId) => {
  // Decor is scenery: only the renderer reads it. A map with its props and
  // the same map without them must give the simulation and the bots the
  // same world, wall for wall and node for node.
  const map = loadMap(mapId);
  const bare = { ...map, decor: [] };
  const radius = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

  it("is on the map this test is about", () => {
    expect(map.decor.length).toBeGreaterThan(0);
  });

  it("leaves the simulation's walls, layers and zones unchanged", () => {
    expect(mapSimulationFields(map, 2)).toEqual(mapSimulationFields(bare, 2));
  });

  it("leaves the nav graphs unchanged", () => {
    expect(mapNavGraphs(map, radius)).toEqual(mapNavGraphs(bare, radius));
    expect(mapNavGraphs(map, radius, { harmful: true })).toEqual(
      mapNavGraphs(bare, radius, { harmful: true }),
    );
  });
});

describe("Hall of Heroes decor (#4017)", () => {
  it("is the same in all three modes, which share one arena", () => {
    const capture = loadMap("hall-of-heroes-capture").decor;
    expect(loadMap("hall-of-heroes-king").decor).toEqual(capture);
    expect(loadMap("hall-of-heroes-relic").decor).toEqual(capture);
  });
});
