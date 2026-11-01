import {
  ANNIHILATION_MATCH_RULES,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { loadAllMaps } from "./loader.js";

/**
 * Bots on the real arenas (#1189): every map spawns its teams beyond spell
 * range, so a team of casters that waits for a foe to come into range
 * never fights. Each one has to walk to the fight.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** No warrior: nobody here closes in because their weapon is melee. */
const CASTERS = ["Ranger/Mesmer", "Necromancer/Elementalist", "Elementalist/Mesmer"];

describe.each(loadAllMaps().map((map) => [map.id, map] as const))("%s bots", (_, map) => {
  it("a caster mirror on the map's spawns deals damage within 30 s", () => {
    const participants: ParticipantSpec[] = [0, 1].flatMap((team) =>
      map.spawnPoints
        .filter((spawn) => spawn.team === team)
        .slice(0, CASTERS.length)
        .map((spawn, k) => {
          const build = STARTER_BUILDS.find((candidate) => candidate.name === CASTERS[k]);
          if (build === undefined) throw new Error(`no starter build ${String(CASTERS[k])}`);
          const loadout = loadoutOf(build);
          const resolved = resolveLoadout(
            {
              primaryProfession: loadout.primaryProfession,
              secondaryProfession: loadout.secondaryProfession,
              allocatedRanks: loadout.attributeRanks,
              equipment: loadout.equipment,
            },
            RULESET.combat,
          );
          return {
            id: `${String(team)}-${String(k)}`,
            team,
            skillBar: loadout.skillBar,
            ...loadoutSpec(resolved),
            spawn: spawn.position,
            facing: 0,
            behaviour: { kind: "play-build", thinkSeconds: 0.25 },
          };
        }),
    );
    const sim = new MatchSimulation({
      seed: map.id,
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      matchRules: ANNIHILATION_MATCH_RULES,
      participants,
    });
    let damaged = false;
    for (let t = 0; t < 30 && !damaged; t += DT) {
      damaged = sim
        .step(DT)
        .log.some((entry) => entry.events.some((event) => event.kind === "damage"));
    }
    expect(damaged).toBe(true);
  });
});
