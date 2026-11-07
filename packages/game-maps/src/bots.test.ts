import {
  ANNIHILATION_MATCH_RULES,
  BOT_REACTION,
  CAPTURE_POINTS_MATCH_RULES,
  KING_OF_THE_HILL_MATCH_RULES,
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
  const map = loadAllMaps().find((candidate) => candidate.mode === "relic-run");

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

describe("King of the Hill bots (#2582)", () => {
  const map = loadAllMaps().find((candidate) => candidate.mode === "king-of-the-hill");

  const hill = (arena: MapData, seed: string, participants: readonly ParticipantSpec[]) => {
    const altar = arena.objectives.find((objective) => objective.kind === "altar");
    if (altar === undefined) throw new Error("no altar");
    return new MatchSimulation({
      seed,
      ruleset: RULESET,
      walls: allWallSegments(arena.walls),
      bounds: { width: arena.width, height: arena.height },
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      hillField: {
        altar: altar.position,
        spawns: arena.objectives.flatMap((objective) =>
          objective.kind === "ghost-spawn"
            ? [{ team: objective.team, position: objective.position }]
            : [],
        ),
      },
      participants,
    });
  };

  /** Who holds the altar after up to 120 s of a 1v1 of bots, and when it was first held. */
  const play = (seed: string) => {
    if (map === undefined) throw new Error("no map with ghosts");
    // Unlike builds: the two ghosts reach the altar at different times.
    const sim = hill(map, seed, casterBots(map, 1, 1));
    let heldAt: number | undefined;
    for (let t = 0; t < 120 && heldAt === undefined; t += DT) {
      sim.step(DT);
      if (sim.altarState.holder !== null) heldAt = t;
    }
    return { heldAt, holder: sim.altarState.holder };
  };

  it("a 1v1 of bots holds the altar within 120 s, the same way for the same seed", () => {
    const first = play("hill");
    expect(first.heldAt).toBeDefined();
    expect(play("hill")).toEqual(first);
  });

  /**
   * The score after up to 90 s of a 2v2 mirror of bots on The Courtyard,
   * and when the first point fell (#2600). A mirror brings both ghosts
   * onto the altar together: they contest it until a bot kills the other
   * team's ghost.
   */
  const mirror = (seed: string) => {
    const courtyard = loadAllMaps().find((candidate) => candidate.id === "the-courtyard");
    if (courtyard === undefined) throw new Error("no map the-courtyard");
    const sim = hill(courtyard, seed, casterBots(courtyard, 2));
    let scoredAt: number | undefined;
    for (let t = 0; t < 90 && scoredAt === undefined; t += DT) {
      sim.step(DT);
      if ([...sim.score.byTeam.values()].some((points) => points > 0)) scoredAt = t;
    }
    return { scoredAt, score: [...sim.score.byTeam] };
  };

  it("a 2v2 mirror of bots scores a point within 90 s, the same way for the same seed", () => {
    const first = mirror("hill");
    expect(first.scoredAt).toBeDefined();
    expect(mirror("hill")).toEqual(first);
  });

  /**
   * The winner of a 4v4 caster mirror on The Courtyard after 120 s: the
   * team that wiped the other, else the one with more points, else none.
   */
  const winner = (seed: string) => {
    const courtyard = loadAllMaps().find((candidate) => candidate.id === "the-courtyard");
    if (courtyard === undefined) throw new Error("no map the-courtyard");
    const sim = hill(courtyard, seed, casterBots(courtyard, 4));
    for (let t = 0; t < 120 && sim.outcome.winningTeam === undefined; t += DT) {
      sim.step(DT);
    }
    if (sim.outcome.winningTeam !== undefined) return sim.outcome.winningTeam;
    const team0 = sim.score.byTeam.get(0) ?? 0;
    const team1 = sim.score.byTeam.get(1) ?? 0;
    return team0 === team1 ? undefined : team0 > team1 ? 0 : 1;
  };

  it("a 4v4 caster mirror is won by either team, as the seed falls, not always by team 0 (#2624)", () => {
    // Before #2624 a bot's reaction times and dodges were a hash of its id
    // alone, so team 0's ids had the same luck in every match: 6 of 6.
    const winners = ["a", "b", "c", "d", "e", "f"].map(winner);
    expect(winners).toContain(0);
    expect(winners).toContain(1);
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
 * them: one would rightly leave an objective for a hurt ally. Team 1's
 * builds are team 0's moved on by `shift`.
 */
function casterBots(map: MapData, perTeam: number, shift = 0): ParticipantSpec[] {
  return [0, 1].flatMap((team) =>
    map.spawnPoints
      .filter((spawn) => spawn.team === team)
      .slice(0, perTeam)
      .map((spawn, k): ParticipantSpec => {
        const build = STARTER_BUILDS.find(
          (candidate) => candidate.name === CASTERS[(k + team * shift) % CASTERS.length],
        );
        if (build === undefined)
          throw new Error(
            `no starter build ${String(CASTERS[(k + team * shift) % CASTERS.length])}`,
          );
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
