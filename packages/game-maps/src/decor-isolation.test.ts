import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadMap } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { mapNavGraphs } from "./nav-graphs.js";

describe("decor (#4013)", () => {
  // Decor is scenery: only the renderer reads it. A map with its props and
  // the same map without them must give the simulation and the bots the
  // same world, wall for wall and node for node.
  const map = loadMap("ashen-courtyard");
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
