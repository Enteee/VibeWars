import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadAllMaps, loadMap } from "./loader.js";
import { unlinkedTransitions } from "./nav-graphs.js";

const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

describe("unlinked transitions (#3177)", () => {
  it("finds none on any map", () => {
    for (const map of loadAllMaps()) {
      expect(unlinkedTransitions(map, RADIUS), map.id).toEqual([]);
    }
  });

  it("names a ramp too narrow at its centre for a body on both layers", () => {
    const canyon = loadMap("arena-canyon");
    const [first, ...rest] = canyon.transitions;
    if (first === undefined) throw new Error("Canyon has no transitions");
    const thin = {
      ...first,
      area: { kind: "rect" as const, x: 450, y: 910, width: 80, height: 10 },
    };
    expect(unlinkedTransitions({ ...canyon, transitions: [thin, ...rest] }, RADIUS)).toEqual([
      `transitions.0: transition ${first.id} has no spot at its centre where a body fits on both layer 0 and layer 1`,
    ]);
  });
});
