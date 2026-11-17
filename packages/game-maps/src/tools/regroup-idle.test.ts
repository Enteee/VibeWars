import { describe, expect, it } from "vitest";

import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  STARTER_BUILDS,
  spawnFacing,
} from "@vibewars/game-core";

import { loadMap } from "../loader.js";
import { mapMatchRules, mapSimulationFields } from "../match-fields.js";
import { playBuildBot } from "./map-balance.js";

const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

/**
 * Bots beside a human who stands idle at spawn (#3489): on Moss Vale, 8v8,
 * team 0 one participant who never gives a command plus 7 bots, team 1
 * 8 bots. They used to wait on the idle human's spot, just out of reach
 * of the foes, and die without a kill. Now both teams fight.
 */
describe("bots with an idle human on a large map (#3489)", () => {
  it("engage, so both teams take a death within 150 s", () => {
    const map = loadMap("moss-vale");
    const seed = 1;
    const participants = [0, 1].flatMap((team) => {
      const spawns = map.spawnPoints.filter((spawn) => spawn.team === team);
      const others = map.spawnPoints.filter((spawn) => spawn.team !== team);
      return Array.from({ length: 8 }, (_, k) => {
        const spawn = spawns[k % spawns.length];
        const build = STARTER_BUILDS[(seed + k) % STARTER_BUILDS.length];
        if (spawn === undefined || build === undefined) throw new Error("no spawn or build");
        const facing = spawnFacing(
          spawn.position,
          others.map((point) => point.position),
          map.spawnPoints.map((point) => point.position),
        );
        const bot = playBuildBot(build, `${String(team)}-${String(k)}`, team, spawn, facing);
        return team === 0 && k === 0 ? { ...bot, behaviour: undefined } : bot;
      });
    });
    const sim = new MatchSimulation({
      seed: `${map.id}:8:${String(seed)}`,
      ruleset: MINIMAL_GW_INSPIRED_PVP_V1,
      matchRules: mapMatchRules(map, map.mode),
      teamCount: map.teams,
      ...mapSimulationFields(map, map.teams),
      participants,
    });
    const died = new Set<number>();
    while (sim.phase === "active" && sim.elapsedSeconds < 150 && died.size < 2) {
      sim.step(DT);
      for (const body of sim.participants()) {
        if (body.combatant.dead && body.creature === undefined) died.add(body.combatant.team);
      }
    }
    expect([...died].sort()).toEqual([0, 1]);
  }, 60_000);
});
