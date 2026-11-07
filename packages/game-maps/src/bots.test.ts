import {
  ANNIHILATION_MATCH_RULES,
  BOT_REACTION,
  CAPTURE_POINTS_MATCH_RULES,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  RELIC_RUN_MATCH_RULES,
  STARTER_BUILDS,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { loadAllMaps } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * Bots on the real arenas (#1189): every map spawns its teams beyond spell
 * range, so a team of casters that waits for a foe to come into range
 * never fights. Each one has to walk to the fight.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** No warrior: nobody here closes in because their weapon is melee. */
const CASTERS = ["Barrage (R)", "Signet of Suffering (N/A)", "Double Dragon (E)"];

describe.each(loadAllMaps().map((map) => [map.id, map] as const))("%s bots", (_, map) => {
  it("a caster mirror on the map's spawns deals damage within 30 s", () => {
    const participants = casterBots(map, CASTERS.length);
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

describe("Relic Run bots (#2581)", () => {
  const map = loadAllMaps().find((candidate) =>
    candidate.objectives.some((objective) => objective.kind === "relic-spawn"),
  );

  /** The score after up to 180 s of a 1v1 of bots, and when the first point fell. */
  const play = (seed: string) => {
    if (map === undefined) throw new Error("no map with relics");
    const altar = map.objectives.find((objective) => objective.kind === "altar");
    if (altar === undefined) throw new Error("no altar");
    const sim = new MatchSimulation({
      seed,
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      matchRules: RELIC_RUN_MATCH_RULES,
      relicField: {
        altar: altar.position,
        spawns: map.objectives.flatMap((objective) =>
          objective.kind === "relic-spawn"
            ? [{ team: objective.team, position: objective.position }]
            : [],
        ),
      },
      participants: casterBots(map, 1),
    });
    let scoredAt: number | undefined;
    for (let t = 0; t < 180 && scoredAt === undefined; t += DT) {
      sim.step(DT);
      if ([...sim.score.byTeam.values()].some((points) => points > 0)) scoredAt = t;
    }
    return { scoredAt, score: [...sim.score.byTeam] };
  };

  it("a 1v1 of bots scores a relic within 180 s, the same way for the same seed", () => {
    const first = play("relics");
    expect(first.scoredAt).toBeDefined();
    expect(play("relics")).toEqual(first);
  });
});

describe("Capture Points bots (#2580)", () => {
  const map = loadAllMaps().find((candidate) =>
    candidate.objectives.some((objective) => objective.kind === "capture-point"),
  );

  /** Who owns each shrine after up to 60 s of a 2v2 of bots, and when one was first owned. */
  const play = (seed: string) => {
    if (map === undefined) throw new Error("no map with capture points");
    const participants = casterBots(map, 2);
    const sim = new MatchSimulation({
      seed,
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      capturePoints: map.objectives.flatMap((objective) =>
        objective.kind === "capture-point" ? [objective.position] : [],
      ),
      participants,
    });
    let ownedAt: number | undefined;
    for (let t = 0; t < 60 && ownedAt === undefined; t += DT) {
      sim.step(DT);
      if (sim.capturePoints.some(({ owner }) => owner !== null)) ownedAt = t;
    }
    return { ownedAt, owners: sim.capturePoints.map(({ owner }) => owner) };
  };

  it("a 2v2 of bots takes a shrine within 60 s, the same way for the same seed", () => {
    const first = play("shrines");
    expect(first.ownedAt).toBeDefined();
    expect(play("shrines")).toEqual(first);
  });
});

/**
 * `perTeam` caster bots a team on `map`'s first spawns, no healer among
 * them: one would rightly leave an objective for a hurt ally.
 */
function casterBots(map: MapData, perTeam: number): ParticipantSpec[] {
  return [0, 1].flatMap((team) =>
    map.spawnPoints
      .filter((spawn) => spawn.team === team)
      .slice(0, perTeam)
      .map((spawn, k): ParticipantSpec => {
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
          behaviour: { kind: "play-build", reaction: BOT_REACTION },
        };
      }),
  );
}
