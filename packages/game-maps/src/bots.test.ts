import {
  ANNIHILATION_MATCH_RULES,
  BOT_REACTION,
  CAPTURE_POINTS_MATCH_RULES,
  KING_OF_THE_HILL_MATCH_RULES,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  THREEFOLD_KEEP_MATCH_RULES,
  RELIC_RUN_MATCH_RULES,
  STARTER_BUILDS,
  deckBlocksSight,
  distanceSegmentToSegment,
  getSkill,
  hasLineOfSight,
  isSpikeSkill,
  LEVER_WORTH_UNITS,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  allWallSegments,
  pointInShape,
  shapesOverlap,
  shapeVertices,
  wallToSegments,
  type WallShape,
} from "./geometry.js";
import { matchGates, matchLayers, matchSwitches } from "./layers.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { loadAllMaps } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { playBuildBot, transitionsWalked } from "./tools/map-balance.js";
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
      layers: matchLayers(map),
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
          return {
            ...playBuildBot(build, `${String(team)}-${String(i)}`, team, spawn, 0),
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
      layers: matchLayers(map),
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

  // The gain check is bot tuning, not a unit: eight 60 s runs, about 55 s, so
  // it runs nightly (e2e-soak.yml, #2898) and when BOTS_NIGHTLY=1 is set by
  // hand on this file.
  it.runIf(process.env.BOTS_NIGHTLY === "1")(
    "lands more of the bots' big hits together than bots that don't hold them",
    () => {
      const runs = (spikeHold: boolean) =>
        ["a", "b", "c", "d"].map((seed) => spikes(seed, spikeHold));
      const share = (of: readonly { hits: number; together: number }[]) =>
        of.reduce((sum, run) => sum + run.together, 0) / of.reduce((sum, run) => sum + run.hits, 0);
      expect(share(runs(true)) - share(runs(false))).toBeGreaterThanOrEqual(SPIKE_GAIN);
    },
    120_000,
  );

  it("plays the same for the same seed", () => {
    expect(spikes("a", true)).toEqual(spikes("a", true));
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
      layers: matchLayers(map),
      gates: matchGates(map),
      matchRules: RELIC_RUN_MATCH_RULES,
      relicField: {
        altar: altar.position,
        altarLayer: altar.layer,
        relicTarget: "altar",
        relicCarry: "own",
        spawns: map.objectives.flatMap((objective) =>
          objective.kind === "relic-spawn"
            ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
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
  const map = loadAllMaps().find((candidate) => candidate.id === "threefold-keep");

  const hill = (arena: MapData, seed: string, participants: readonly ParticipantSpec[]) => {
    const altar = arena.objectives.find((objective) => objective.kind === "altar");
    if (altar === undefined) throw new Error("no altar");
    return new MatchSimulation({
      seed,
      ruleset: RULESET,
      walls: allWallSegments(arena.walls),
      layers: matchLayers(arena),
      bounds: { width: arena.width, height: arena.height },
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      ghostField: {
        level: 24,
        altar: altar.position,
        altarLayer: altar.layer,
        spawns: arena.objectives.flatMap((objective) =>
          objective.kind === "ghost-spawn" && objective.team < 2
            ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
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

  // The rule that a mutual ghost kill costs a priest wave is game-core's (king-of-the-hill.test.ts);
  // on the rebuilt Hall (#3442) the first ghost up the dais claims before the other arrives.
  it("takes the Hall's altar in a two-team match with one player idle (#2700, #3442)", () => {
    const hall = loadAllMaps().find((candidate) => candidate.id === "hall-of-heroes-king");
    if (hall === undefined) throw new Error("no map hall-of-heroes-king");
    const twoTeams = {
      ...hall,
      objectives: hall.objectives.filter(
        (objective) => objective.kind !== "ghost-spawn" || objective.team < 2,
      ),
    };
    const sim = hill(
      twoTeams,
      "h",
      casterBots(hall, 8, 1).map((spec) =>
        spec.id === "0-0" ? { ...spec, behaviour: undefined } : spec,
      ),
    );
    let heldAt: number | undefined;
    for (let t = 0; t < 180 && heldAt === undefined; t += DT) {
      sim.step(DT);
      if (sim.altarState.holder !== null) heldAt = t;
    }
    expect(heldAt).toBeDefined();
  }, 60_000);

  /**
   * The first ghost to die, and the score and outcome after up to 90 s
   * of a 2v2 mirror of bots on The Courtyard, and when the first point
   * fell or the match ended, whichever came first (#2600). A mirror brings
   * both ghosts onto the altar together: they contest it until a bot kills
   * the other team's ghost. One team may then wipe the other before its
   * first point (#2628), its damage dealers spiking (#2631).
   */
  const mirror = (seed: string) => {
    const keep = loadAllMaps().find((candidate) => candidate.id === "threefold-keep");
    if (keep === undefined) throw new Error("no map threefold-keep");
    const sim = hill(keep, seed, casterBots(keep, 2));
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
  }, 60_000);

  /**
   * The winner of a 4v4 caster mirror on The Courtyard after 120 s: the
   * team that wiped the other, else the one with more points, else none.
   */
  const winner = (seed: string) => {
    const keep = loadAllMaps().find((candidate) => candidate.id === "threefold-keep");
    if (keep === undefined) throw new Error("no map threefold-keep");
    const sim = hill(keep, seed, casterBots(keep, 4));
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
    // The seeds are ordered only for speed: "a" and "g" have different winners,
    // so a passing run plays two matches. If a bot change shifts the outcomes
    // the test gets slower, not wrong; reorder them then.
    const winners = new Set<number | undefined>();
    for (const seed of ["a", "g", "b", "h", "c", "i"]) {
      winners.add(winner(seed));
      if (winners.has(0) && winners.has(1)) break;
    }
    expect(winners).toContain(0);
    expect(winners).toContain(1);
  }, 60_000);
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
      layers: matchLayers(map),
      gates: matchGates(map),
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      capturePoints: map.objectives.flatMap((objective) =>
        objective.kind === "capture-point"
          ? [{ ...objective.position, layer: objective.layer }]
          : [],
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
    // Two a side: a full 8v8 on the 2.5D rebuild (#3439) is too slow for a unit test.
    const cairns = loadAllMaps().find((candidate) => candidate.id === "mosslit-cairns");
    if (cairns === undefined) throw new Error("no map mosslit-cairns");
    const sim = new MatchSimulation({
      seed: "cairns",
      ruleset: RULESET,
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      ...mapSimulationFields(cairns, 2),
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
  }, 60_000);

  it("three teams of bots play Threefold Keep to time, doors and all (#2699)", () => {
    const keep = loadAllMaps().find((candidate) => candidate.id === "threefold-keep");
    if (keep === undefined) throw new Error("no map threefold-keep");
    const altar = keep.objectives.find((objective) => objective.kind === "altar");
    if (altar === undefined) throw new Error("no altar");
    const rules = { ...THREEFOLD_KEEP_MATCH_RULES, timeLimitSeconds: 60 };
    const sim = new MatchSimulation({
      seed: "keep",
      ruleset: RULESET,
      teamCount: 3,
      walls: allWallSegments(keep.walls),
      layers: matchLayers(keep),
      gates: matchGates(keep),
      switches: matchSwitches(keep),
      bounds: { width: keep.width, height: keep.height },
      matchRules: rules,
      ghostField: {
        level: 24,
        altar: altar.position,
        altarLayer: altar.layer,
        spawns: keep.objectives.flatMap((objective) =>
          objective.kind === "ghost-spawn"
            ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
            : [],
        ),
      },
      participants: casterBots(keep, 2, 0, [0, 1, 2]),
    });
    for (let t = 0; t <= rules.timeLimitSeconds + 1 && sim.phase !== "finished"; t += DT) {
      sim.step(DT);
    }
    expect(sim.phase).toBe("finished");
  });

  it("bots finish a match on The Warden's Gallery (#2698)", () => {
    const gallery = loadAllMaps().find((candidate) => candidate.id === "wardens-gallery");
    if (gallery === undefined) throw new Error("no map wardens-gallery");
    const sim = new MatchSimulation({
      seed: "gallery",
      ruleset: RULESET,
      walls: allWallSegments(gallery.walls),
      layers: matchLayers(gallery),
      gates: matchGates(gallery),
      bounds: { width: gallery.width, height: gallery.height },
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      capturePoints: gallery.objectives.flatMap((objective) =>
        objective.kind === "capture-point"
          ? [{ ...objective.position, layer: objective.layer }]
          : [],
      ),
      participants: casterBots(gallery, 2),
    });
    for (
      let t = 0;
      t <= CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds + 1 && sim.phase !== "finished";
      t += DT
    ) {
      sim.step(DT);
    }
    expect(sim.phase).toBe("finished");
  }, 60_000);
});

describe("The Brazen Causeway (#3435)", () => {
  const map = loadAllMaps().find((candidate) => candidate.id === "brazen-causeway");
  if (map === undefined) throw new Error("no map brazen-causeway");

  it("shuts the causeway with two bronze gates, each opened by the far gatehouse's lever", () => {
    expect(map.switches?.map(({ targets }) => targets)).toEqual([
      ["east-bronze-gate"],
      ["west-bronze-gate"],
    ]);
  });

  it("keeps its nav graph to 600 nodes", () => {
    const closed = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    expect(layeredFinder(closed, RULESET.collision.playerRadius).nodeCount).toBeLessThanOrEqual(
      600,
    );
  });

  // #3521: the marsh is the slow way, so a lever is worth the walk to a team.
  const match = (seed: string) =>
    new MatchSimulation({
      seed,
      ruleset: RULESET,
      matchRules: ANNIHILATION_MATCH_RULES,
      ...mapSimulationFields(map, 2),
      participants: casterBots(map, 2),
    });

  it("makes each team's own gatehouse lever worth the walk to it at match start (#3549)", () => {
    const sim = match("brazen-causeway-levers");
    // A pricing comes out one lever, pair or wall a tick (#3599).
    for (let tick = 0; tick < 60 && !sim.botLevers.some(({ gain }) => gain.length > 0); tick += 1) {
      sim.step(DT);
    }
    expect(sim.botLevers).toHaveLength(2);
    // Team 0 holds the west gatehouse, the map's first lever; team 1 the east.
    sim.botLevers.forEach(({ gain }, team) => {
      expect(gain[team]).toBeGreaterThanOrEqual(LEVER_WORTH_UNITS);
    });
  });

  // #3532: a bot set on a lever throws it, though the gain falls as it nears the foes; each
  // team climbs its own stair to its lever (#3549), so the lever bots no longer meet there.
  it.each(["brazen-causeway-gates", "brazen-causeway-gates-2", "brazen-causeway-gates-3"])(
    "opens both gates before the time limit in a bot-vs-bot match (seed %s)",
    (seed) => {
      const sim = match(seed);
      for (
        let t = 0;
        t <= ANNIHILATION_MATCH_RULES.timeLimitSeconds &&
        sim.phase !== "finished" &&
        !sim.gates.every((gate) => gate.open);
        t += DT
      ) {
        sim.step(DT);
      }
      expect(sim.gates.map((gate) => gate.open)).toEqual([true, true]);
    },
    120_000,
  );

  it("leaves a way from base to base with both gates closed", () => {
    const closed = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const finder = layeredFinder(closed, RULESET.collision.playerRadius);
    const spawnOf = (team: number) => {
      const spawn = map.spawnPoints.find((candidate) => candidate.team === team);
      if (spawn === undefined) throw new Error(`no spawn for team ${String(team)}`);
      return spawn;
    };
    expect(
      finder.find(spawnOf(0).position, spawnOf(0).layer, spawnOf(1).position, spawnOf(1).layer),
    ).toBeDefined();
  });

  // #3521: slow ground starts where a player can see it start, never under a foot coming off a
  // stair, at a lever, at the beacon or at a gatehouse, and never runs under the causeway.
  it("keeps every reed pool and mire clear of the stairs, levers, beacon, gatehouses and causeway (#3521)", () => {
    const clear = 2 * RULESET.collision.playerRadius;
    /** How far apart `a` and `b` are: 0 if they touch or overlap. */
    const gap = (a: WallShape, b: WallShape): number => {
      if (
        shapeVertices(a).some((point) => pointInShape(point, b)) ||
        shapeVertices(b).some((point) => pointInShape(point, a))
      ) {
        return 0;
      }
      const sides = wallToSegments(b);
      return Math.min(
        ...wallToSegments(a).flatMap((side) =>
          sides.map((other) => distanceSegmentToSegment(side, other)),
        ),
      );
    };
    /** A point as a tiny square, so it measures as a shape. */
    const spot = ({ x, y }: { readonly x: number; readonly y: number }): WallShape => ({
      kind: "rect",
      x: x - 0.5,
      y: y - 0.5,
      width: 1,
      height: 1,
    });
    const slow = [
      ...(map.water ?? []).filter(({ depth }) => depth === "shallow"),
      ...(map.zones ?? []).filter(({ kind }) => kind === "mire"),
    ];
    const beacon = map.objectives.find(
      (objective): objective is Extract<typeof objective, { kind: "storm-beacon" }> =>
        objective.kind === "storm-beacon",
    );
    if (beacon === undefined) throw new Error("no storm beacon");
    const keepOff: { readonly id: string; readonly area: WallShape }[] = [
      ...map.transitions.map(({ id, area }) => ({ id, area })),
      ...(map.switches ?? []).map(({ id, position }) => ({ id, area: spot(position) })),
      { id: "storm-beacon", area: spot(beacon.position) },
      ...map.decks
        .filter(({ id }) => id.endsWith("-gatehouse"))
        .map(({ id, footprint }) => ({ id, area: footprint })),
    ];
    expect(slow.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        ...["north", "south"].flatMap((side) =>
          ["west", "middle", "east"].map((pool) => `${side}-reed-pool-${pool}`),
        ),
        "north-east-mire",
        "south-west-mire",
      ]),
    );
    const causeway = map.decks.find(({ id }) => id === "causeway");
    if (causeway?.footprint.kind !== "polygon") throw new Error("no causeway");
    // Its foot may be a bank of the marsh; a hair inside it is under it.
    const centre = { x: 2812, y: 1400 };
    const under: WallShape = {
      kind: "polygon",
      points: causeway.footprint.points.map(({ x, y }) => ({
        x: x + Math.sign(centre.x - x) * 2,
        y: y + Math.sign(centre.y - y) * 2,
      })),
    };
    for (const { id, area } of slow) {
      for (const each of keepOff) {
        expect(gap(area, each.area), `${id} by ${each.id}`).toBeGreaterThanOrEqual(clear);
      }
      expect(shapesOverlap(area, under), `${id} under the causeway`).toBe(false);
    }
  });

  it("walks each team to its own gatehouse lever by its own stair, sharing none with the other (#3549)", () => {
    const closed = { ...map, walls: [...map.walls, ...map.gates.map(({ wall }) => wall)] };
    const levers = ["west-gatehouse-lever", "east-gatehouse-lever"].map((id) => {
      const lever = map.switches?.find((candidate) => candidate.id === id);
      if (lever === undefined) throw new Error(`no lever ${id}`);
      return lever;
    });
    const [west = [], east = []] = transitionsWalked(
      closed,
      levers.map(({ position }) => position),
      3,
    );
    expect(west).toContain("west-lever-stair");
    expect(east).toContain("east-lever-stair");
    expect(west.filter((id) => east.includes(id))).toEqual([]);
  });
});

describe("a lever gate the only way between the spawns (#3138)", () => {
  /** A wall down `x` from `top` to `bottom`, 8 thick. */
  const wall = (x: number, top: number, bottom: number) => {
    const corners = [
      { x: x - 4, y: top },
      { x: x + 4, y: top },
      { x: x + 4, y: bottom },
      { x: x - 4, y: bottom },
    ];
    return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
  };

  it("bots throw the lever, then fight it out before the time limit", () => {
    const build = (name: string) => {
      const found = STARTER_BUILDS.find((candidate) => candidate.name === name);
      if (found === undefined) throw new Error(`no starter build ${name}`);
      return found;
    };
    const sim = new MatchSimulation({
      seed: "lever-gate",
      ruleset: RULESET,
      walls: [...wall(800, -10, 300), ...wall(800, 500, 810)],
      gates: [{ segments: wall(800, 300, 500), opener: { kind: "switch" }, blocks: "all" }],
      switches: [
        {
          id: "lever",
          layer: 0,
          position: { x: 600, y: 650 },
          gates: [0],
          teleports: [],
          decks: [],
          lifts: [],
        },
      ],
      bounds: { width: 1600, height: 800 },
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [0, 1].flatMap((team) =>
        CASTERS.slice(0, 2).map((name, k) =>
          playBuildBot(
            build(name),
            `${String(team)}-${String(k)}`,
            team,
            { position: { x: team === 0 ? 150 : 1450, y: 300 + 200 * k }, layer: 0 },
            0,
          ),
        ),
      ),
    });
    let opened = false;
    let died = false;
    let seconds = 0;
    while (seconds <= ANNIHILATION_MATCH_RULES.timeLimitSeconds + 1 && !died) {
      sim.step(DT);
      seconds += DT;
      opened ||= sim.gates.some(({ open }) => open);
      died ||= [...sim.participants()].some(({ combatant }) => combatant.dead);
    }
    expect(opened).toBe(true);
    expect(died).toBe(true);
    expect(seconds).toBeLessThan(ANNIHILATION_MATCH_RULES.timeLimitSeconds);
  }, 60_000);

  describe("two lever gates in series (#3513)", () => {
    it("bots throw both levers, then fight it out before the time limit", () => {
      const build = (name: string) => {
        const found = STARTER_BUILDS.find((candidate) => candidate.name === name);
        if (found === undefined) throw new Error(`no starter build ${name}`);
        return found;
      };
      // Each lever opens the far gate: neither alone is a way through.
      const lever = (id: string, x: number, gate: number) => ({
        id,
        layer: 0,
        position: { x, y: 650 },
        gates: [gate],
        teleports: [],
        decks: [],
        lifts: [],
      });
      const sim = new MatchSimulation({
        seed: "lever-gates",
        ruleset: RULESET,
        walls: [600, 1000].flatMap((x) => [...wall(x, -10, 300), ...wall(x, 500, 810)]),
        gates: [600, 1000].map((x) => ({
          segments: wall(x, 300, 500),
          opener: { kind: "switch" as const },
          blocks: "all" as const,
        })),
        switches: [lever("west", 400, 1), lever("east", 1200, 0)],
        bounds: { width: 1600, height: 800 },
        matchRules: ANNIHILATION_MATCH_RULES,
        participants: [0, 1].flatMap((team) =>
          CASTERS.slice(0, 2).map((name, k) =>
            playBuildBot(
              build(name),
              `${String(team)}-${String(k)}`,
              team,
              { position: { x: team === 0 ? 150 : 1450, y: 300 + 200 * k }, layer: 0 },
              0,
            ),
          ),
        ),
      });
      let opened = false;
      let died = false;
      let seconds = 0;
      while (seconds <= ANNIHILATION_MATCH_RULES.timeLimitSeconds + 1 && !died) {
        sim.step(DT);
        seconds += DT;
        opened ||= sim.gates.every(({ open }) => open);
        died ||= [...sim.participants()].some(({ combatant }) => combatant.dead);
      }
      expect(opened).toBe(true);
      expect(died).toBe(true);
      expect(seconds).toBeLessThan(ANNIHILATION_MATCH_RULES.timeLimitSeconds);
    }, 60_000);
  });
});

/**
 * `perTeam` caster bots a team on `map`'s first spawns, no healer among
 * them: one would rightly leave an objective for a hurt ally. Team 1's
 * builds are team 0's moved on by `shift`.
 */
function casterBots(
  map: MapData,
  perTeam: number,
  shift = 0,
  teams: readonly number[] = [0, 1],
): ParticipantSpec[] {
  return teams.flatMap((team) =>
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
        return playBuildBot(build, `${String(team)}-${String(k)}`, team, spawn, 0);
      }),
  );
}

describe("a breakable wall the only way between the spawns (#3140)", () => {
  /** A wall down `x` from `top` to `bottom`, 8 thick. */
  const wall = (x: number, top: number, bottom: number) => {
    const corners = [
      { x: x - 4, y: top },
      { x: x + 4, y: top },
      { x: x + 4, y: bottom },
      { x: x - 4, y: bottom },
    ];
    return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
  };

  it("bots strike it down, then fight it out before the time limit", () => {
    const build = (name: string) => {
      const found = STARTER_BUILDS.find((candidate) => candidate.name === name);
      if (found === undefined) throw new Error(`no starter build ${name}`);
      return found;
    };
    const sim = new MatchSimulation({
      seed: "breakable-wall",
      ruleset: RULESET,
      walls: [...wall(800, -10, 300), ...wall(800, 500, 810)],
      breakables: [{ id: "crack", segments: wall(800, 300, 500), layer: 0, maxHealth: 600 }],
      bounds: { width: 1600, height: 800 },
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [0, 1].flatMap((team) =>
        CASTERS.slice(0, 2).map((name, k) =>
          playBuildBot(
            build(name),
            `${String(team)}-${String(k)}`,
            team,
            { position: { x: team === 0 ? 150 : 1450, y: 300 + 200 * k }, layer: 0 },
            0,
          ),
        ),
      ),
    });
    let broken = false;
    let died = false;
    let seconds = 0;
    while (seconds <= ANNIHILATION_MATCH_RULES.timeLimitSeconds + 1 && !died) {
      sim.step(DT);
      seconds += DT;
      broken ||= sim.breakables.every(({ health }) => health === 0);
      died ||= [...sim.participants()].some(({ combatant }) => combatant.dead);
    }
    expect(broken).toBe(true);
    expect(died).toBe(true);
    expect(seconds).toBeLessThan(ANNIHILATION_MATCH_RULES.timeLimitSeconds);
  }, 60_000);
});

describe("a caster two bowmen focus on Sandstone Steps (#3369)", () => {
  it("ducks behind the west row of houses, out of both bowmen's sight, within 3 s", () => {
    const map = loadAllMaps().find((each) => each.id === "sandstone-steps");
    if (map === undefined) throw new Error("no sandstone-steps");
    const layers = matchLayers(map);
    const build = (name: string) => {
      const found = STARTER_BUILDS.find((candidate) => candidate.name === name);
      if (found === undefined) throw new Error(`no starter build ${name}`);
      return found;
    };
    // The street north of the houses, on the ground: the caster at its
    // west end, the bowmen 500 east, all in the open.
    const sim = new MatchSimulation({
      seed: "duck",
      ruleset: RULESET,
      walls: allWallSegments(map.walls),
      bounds: { width: map.width, height: map.height },
      layers,
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [
        playBuildBot(
          build("Double Dragon (E)"),
          "caster",
          0,
          { position: { x: 1000, y: 1400 }, layer: 1 },
          0,
        ),
        playBuildBot(
          build("Barrage (R)"),
          "bow-1",
          1,
          { position: { x: 1500, y: 1400 }, layer: 1 },
          0,
        ),
        playBuildBot(
          build("Barrage (R)"),
          "bow-2",
          1,
          { position: { x: 1600, y: 1360 }, layer: 1 },
          0,
        ),
      ],
    });
    const bowmen = ["bow-1", "bow-2"].map((id) => {
      const found = sim.get(id);
      if (found === undefined) throw new Error(`no ${id}`);
      return found;
    });
    const caster = sim.get("caster");
    if (caster === undefined) throw new Error("no caster");
    // ADR-0051's sight: the looker's layer's walls and the footprint rule.
    const seen = () =>
      bowmen.some(
        (bow) =>
          hasLineOfSight(bow.position, caster.position, layers.walls[bow.layer] ?? []) &&
          !deckBlocksSight(layers.decks, bow.position, bow.layer, caster.position, caster.layer),
      );
    expect(seen()).toBe(true);
    let focusedAt: number | undefined;
    let hiddenAfter: number | undefined;
    for (let t = 0; t < 6 && hiddenAfter === undefined; t += DT) {
      sim.step(DT);
      focusedAt ??= bowmen.every((bow) => bow.targetId === "caster") ? t : undefined;
      if (focusedAt !== undefined && !seen()) hiddenAfter = t - focusedAt;
    }
    expect(focusedAt).toBeDefined();
    expect(hiddenAfter).toBeLessThanOrEqual(3);
  });
});
