import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  type ParticipantSpec,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadAllMaps } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { playBuildBot } from "./tools/map-balance.js";

/**
 * An attack on a foe pressed into the Broken Tower's wall where its
 * graph has no room for a body (#3707), as a 4v4 bench match put one:
 * the spot nearest the foe a body fits is out of reach of it. The
 * attacker walks on at the foe, and gives the attack up at the wall,
 * rather than step past that spot and back for as long as it lasts.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** How far a step along x must go to count as one way or the other. */
const MOVED = 0.5;
/** How long the attacker is watched. */
const SECONDS = 5;

const map = loadAllMaps().find((candidate) => candidate.id === "broken-tower");
if (map === undefined) throw new Error("no broken-tower");

/** `id` of `team`, a melee build, at `at` on the tower's first floor, doing only what it is told. */
function melee(id: string, team: number, at: Vec2): ParticipantSpec {
  const build = STARTER_BUILDS.find((candidate) => candidate.name === "Flourish (A/W)");
  if (build === undefined) throw new Error("no starter build Flourish (A/W)");
  const { behaviour: _, ...spec } = playBuildBot(build, id, team, { position: at, layer: 1 }, 0);
  return spec;
}

describe("an attack on a foe where the graph has no room for a body (#3707)", () => {
  it("walks on at it, then gives the attack up at the wall, never pacing", () => {
    const sim = new MatchSimulation({
      seed: "closes-in",
      ruleset: RULESET,
      ...mapSimulationFields(map, 2),
      participants: [melee("a", 0, { x: 1980, y: 1330 }), melee("d", 1, { x: 2041.1, y: 1383.7 })],
    });
    sim.requestAttack("a", "d");
    let turns = 0;
    let heading = 0;
    for (let t = 0; t < SECONDS; t += DT) {
      const before = sim.get("a")?.position.x ?? 0;
      sim.step(DT);
      const along = (sim.get("a")?.position.x ?? 0) - before;
      if (Math.abs(along) > MOVED) {
        if (heading !== 0 && Math.sign(along) !== heading) turns += 1;
        heading = Math.sign(along);
      }
    }
    expect(turns).toBeLessThanOrEqual(1);
    expect(sim.get("a")?.combatant.attack).toBeUndefined();
  });
});
