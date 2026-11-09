import {
  ANNIHILATION_MATCH_RULES,
  BOT_REACTION,
  CAPTURE_POINTS_MATCH_RULES,
  KING_OF_THE_HILL_MATCH_RULES,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PRIEST_ANNIHILATION_MATCH_RULES,
  RELIC_RUN_MATCH_RULES,
  STARTER_BUILDS,
  getSkill,
  isSpikeSkill,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments, wallToSegments } from "./geometry.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { loadAllMaps } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * Bots on the real arenas (#1189): every map spawns its teams beyond spell
 * range, so a team of casters that waits for a foe to come into range
 * never fights. Each one has to walk to the fight.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/**
 * Of the bots' spike-skill hits on a foe, the share landing within a second
 * of a teammate's on it (#2631): main's bots, firing each the moment it
 * recharged, landed 66.2% of them together; holding them for the team,
 * 73.1%. The share swings with the seed and with every other bot change,
 * so the bar is the gain over bots that don't hold, on the same seeds.
 */
const SPIKE_GAIN = 0.05;
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

describe("bots spike on Ashen Courtyard (#2631)", () => {
  const map = loadAllMaps().find((candidate) => candidate.id === "ashen-courtyard");

  /**
   * Of 60 s of a 4v4 mirror of the bot bench's builds on Ashen Courtyard,
   * one per seed, the spike-skill hits on a foe and those landing within a
   * second of a teammate's spike-skill hit on the same foe. `spikeHold`:
   * whether the bots hold their spike skills for the team's.
   */
  const spikes = (seed: string, spikeHold: boolean) => {
    if (map === undefined) throw new Error("no Ashen Courtyard");
    const participants = [0, 1].flatMap((team) =>
      map.spawnPoints
        .filter((spawn) => spawn.team === team)
        .slice(0, 4)
        .map((spawn, i): ParticipantSpec => {
          const build = STARTER_BUILDS[(i + seed.charCodeAt(0)) % STARTER_BUILDS.length];
          if (build === undefined) throw new Error("no built-in builds");
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
            id: `${String(team)}-${String(i)}`,
            team,
            skillBar: loadout.skillBar,
            ...loadoutSpec(resolved),
            spawn: spawn.position,
            facing: 0,
            behaviour: { kind: "play-build", reaction: BOT_REACTION, spikeHold },
          };
        }),
    );
    const teamOf = new Map(participants.map(({ id, team }) => [id, team]));
    const sim = new MatchSimulation({
      seed,
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      matchRules: ANNIHILATION_MATCH_RULES,
      participants,
    });
    const hits: { readonly at: number; readonly sourceId: string; readonly targetId: string }[] =
      [];
    for (let t = 0; t < 60; t += DT) {
      for (const entry of sim.step(DT).log) {
        const skill = entry.skillId === undefined ? undefined : getSkill(entry.skillId);
        const sourceId = entry.sourceId;
        if (skill === undefined || !isSpikeSkill(skill) || sourceId === undefined) continue;
        for (const event of entry.events) {
          const team = teamOf.get(event.targetId);
          if (
            event.kind === "damage" &&
            event.targetId === sim.get(sourceId)?.targetId &&
            team !== undefined &&
            team !== teamOf.get(sourceId)
          ) {
            hits.push({ at: entry.atSeconds, sourceId, targetId: event.targetId });
          }
        }
      }
    }
    const together = hits.filter((hit) =>
      hits.some(
        (other) =>
          other.targetId === hit.targetId &&
          other.sourceId !== hit.sourceId &&
          Math.abs(other.at - hit.at) <= 1,
      ),
    );
    return { hits: hits.length, together: together.length };
  };

  it("lands more of the bots' big hits together than bots that don't hold them, the same for the same seed", () => {
    const runs = (spikeHold: boolean) =>
      ["a", "b", "c", "d"].map((seed) => spikes(seed, spikeHold));
    const share = (of: readonly { hits: number; together: number }[]) =>
      of.reduce((sum, run) => sum + run.together, 0) / of.reduce((sum, run) => sum + run.hits, 0);
    const holding = runs(true);
    expect(share(holding) - share(runs(false))).toBeGreaterThanOrEqual(SPIKE_GAIN);
    expect(spikes("a", true)).toEqual(holding[0]);
  }, 120_000);
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
        relicTarget: "altar",
        relicCarry: "own",
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
      ghostField: {
        level: 24,
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
   * The first ghost to die, and the score and outcome after up to 90 s
   * of a 2v2 mirror of bots on The Courtyard, and when the first point
   * fell or the match ended, whichever came first (#2600). A mirror brings
   * both ghosts onto the altar together: they contest it until a bot kills
   * the other team's ghost. One team may then wipe the other before its
   * first point (#2628), its damage dealers spiking (#2631).
   */
  const mirror = (seed: string) => {
    const courtyard = loadAllMaps().find((candidate) => candidate.id === "the-courtyard");
    if (courtyard === undefined) throw new Error("no map the-courtyard");
    const sim = hill(courtyard, seed, casterBots(courtyard, 2));
    let ghostDiedAt: number | undefined;
    let decidedAt: number | undefined;
    for (let t = 0; t < 90 && decidedAt === undefined; t += DT) {
      sim.step(DT);
      if (
        ghostDiedAt === undefined &&
        [...sim.participants()].some(
          ({ creature, combatant }) => creature?.kind === "ghostly-hero" && combatant.dead,
        )
      ) {
        ghostDiedAt = t;
      }
      if (
        [...sim.score.byTeam.values()].some((points) => points > 0) ||
        sim.outcome.winningTeam !== undefined
      ) {
        decidedAt = t;
      }
    }
    return {
      ghostDiedAt,
      decidedAt,
      holder: sim.altarState.holder,
      score: [...sim.score.byTeam],
      winner: sim.outcome.winningTeam,
    };
  };

  it("a 2v2 mirror of bots kills a ghost, then scores a point or wins within 90 s, the same way for the same seed", () => {
    const first = mirror("hill");
    expect(first.ghostDiedAt).toBeDefined();
    expect(first.decidedAt).toBeDefined();
    // The ghosts' contest ended: a team took the altar, wipe or not.
    expect(first.holder).not.toBeNull();
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
    // The seeds are ordered only for speed: "a" and "b" have different winners,
    // so a passing run plays two matches. If a bot change shifts the outcomes
    // the test gets slower, not wrong; reorder them then.
    const winners = new Set<number | undefined>();
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      winners.add(winner(seed));
      if (winners.has(0) && winners.has(1)) break;
    }
    expect(winners).toContain(0);
    expect(winners).toContain(1);
  });
});

describe("Capture Points bots (#2580)", () => {
  const map = loadAllMaps().find((candidate) => candidate.id === "scarred-earth");

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

  it("bots finish a match on Mosslit Cairns (#2696)", () => {
    // Two a side: a full 8v8 takes 15 s here, too near the 20 s test limit.
    const cairns = loadAllMaps().find((candidate) => candidate.id === "mosslit-cairns");
    if (cairns === undefined) throw new Error("no map mosslit-cairns");
    const sim = new MatchSimulation({
      seed: "cairns",
      ruleset: RULESET,
      walls: allWallSegments(cairns.walls),
      bounds: { width: cairns.width, height: cairns.height },
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      capturePoints: cairns.objectives.flatMap((objective) =>
        objective.kind === "capture-point" ? [objective.position] : [],
      ),
      participants: casterBots(cairns, 2),
    });
    for (
      let t = 0;
      t <= CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds + 1 && sim.phase !== "finished";
      t += DT
    ) {
      sim.step(DT);
    }
    expect(sim.phase).toBe("finished");
  });
});

describe("The Brazen Causeway (#2697)", () => {
  const map = loadAllMaps().find((candidate) => candidate.id === "brazen-causeway");
  if (map === undefined) throw new Error("no map brazen-causeway");

  it("guards each base with its own gate", () => {
    expect(map.gates.map(({ team }) => team)).toEqual([0, 1]);
  });

  it("keeps its nav graph to 600 nodes", () => {
    const closed = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    expect(layeredFinder(closed, RULESET.collision.playerRadius).nodeCount).toBeLessThanOrEqual(
      600,
    );
  });

  it("leaves a way from base to base with both gates closed", () => {
    const closed = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const finder = layeredFinder(closed, RULESET.collision.playerRadius);
    const spawnOf = (team: number) => {
      const spawn = map.spawnPoints.find((candidate) => candidate.team === team);
      if (spawn === undefined) throw new Error(`no spawn for team ${String(team)}`);
      return spawn;
    };
    expect(finder.find(spawnOf(0).position, 0, spawnOf(1).position, 0)).toBeDefined();
  });

  it("bots open their gate, then fight it out before the time limit", () => {
    // Two a side: one to stand on each plate, and one free to go and fight.
    const sim = new MatchSimulation({
      seed: "causeway",
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      gates: map.gates.map((gate) => ({
        segments: wallToSegments(gate.wall),
        plate: gate.plate,
        team: gate.team,
      })),
      bounds: { width: map.width, height: map.height },
      matchRules: PRIEST_ANNIHILATION_MATCH_RULES,
      shrines: map.objectives.flatMap((objective) =>
        objective.kind === "resurrection-shrine"
          ? [{ team: objective.team, position: objective.position }]
          : [],
      ),
      participants: casterBots(map, 2),
    });
    let opened = false;
    let died = false;
    let seconds = 0;
    while (
      seconds <= PRIEST_ANNIHILATION_MATCH_RULES.timeLimitSeconds + 1 &&
      sim.phase !== "finished"
    ) {
      sim.step(DT);
      seconds += DT;
      opened ||= sim.gates.some(({ open }) => open);
      died ||= [...sim.participants()].some(({ combatant }) => combatant.dead);
    }
    expect(opened).toBe(true);
    expect(died).toBe(true);
    expect(sim.phase).toBe("finished");
    expect(seconds).toBeLessThan(PRIEST_ANNIHILATION_MATCH_RULES.timeLimitSeconds);
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
