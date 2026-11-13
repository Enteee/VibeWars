import { MINIMAL_GW_INSPIRED_PVP_V1, createPathFinder } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { mapStructure, teamArenaMapIds } from "../net/maps.js";
import { pickSurface } from "../render/layer-surfaces.js";
import { ELEVATION_STEP } from "../render/render-order.js";
import { splashGraph } from "../ui/splash-fight.js";

import { MARK_REACH } from "./stations.js";
import {
  PLAYER_PROFESSION,
  SELF_ID,
  TUTOR_ID,
  TUTOR_PROFESSIONS,
  FOE_KEEP_OFF,
  drawTutorProfession,
  inOpenView,
  tutorialWorld,
} from "./tutorial-world.js";

const TICK = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
/** The card's rule (#3221): no foe nearer the pair than this. */
const FOE_RULE = 600;
const SECONDS = 120;
/** The PR screenshot's canvas (#3222). */
const VIEWPORT = { width: 1000, height: 700 };
/** How long, and how wide, the mark stays clear of every body but the pair. */
const MARK_SECONDS = 30;
const MARK_CLEAR = 150;

describe("tutorialWorld (#3221)", () => {
  it("gives the bots the same builds for the same seed, so a seed is one world", () => {
    const bars = (seed: string): string[] =>
      [...tutorialWorld("arena-canyon", 4, seed, "monk", VIEWPORT).simulation.participants()].map(
        (body) => `${body.combatant.id}:${body.combatant.skillBar.join("/")}`,
      );
    expect(bars("same")).toEqual(bars("same"));
  });

  it.each(["arena-canyon", "arena-crossroads"])(
    "keeps every foe 600 units off the pair for two minutes on %s",
    (mapId) => {
      const { simulation } = tutorialWorld(mapId, 4, `keep-off-${mapId}`, "monk", VIEWPORT);
      let nearest = Number.POSITIVE_INFINITY;
      for (let tick = 0; tick < SECONDS / TICK; tick += 1) {
        simulation.step(TICK);
        const pair = [simulation.get(SELF_ID), simulation.get(TUTOR_ID)];
        for (const foe of simulation.participants()) {
          if (foe.combatant.team === 0 || foe.combatant.dead) {
            continue;
          }
          for (const body of pair) {
            if (body !== undefined) {
              nearest = Math.min(
                nearest,
                Math.hypot(foe.position.x - body.position.x, foe.position.y - body.position.y),
              );
            }
          }
        }
      }
      expect(nearest).toBeGreaterThanOrEqual(FOE_RULE);
    },
    120_000,
  );

  // A click on the mark that lands on a body targets it, and walks nowhere.
  it.each(teamArenaMapIds(8))(
    "lets nobody but the player walk over the mark on %s",
    (mapId) => {
      const { simulation, mark } = tutorialWorld(mapId, 8, `mark-${mapId}`, "monk", VIEWPORT);
      let nearest = Number.POSITIVE_INFINITY;
      for (let tick = 0; tick < MARK_SECONDS / TICK; tick += 1) {
        simulation.step(TICK);
        for (const other of simulation.participants()) {
          if (other.id !== SELF_ID && other.id !== TUTOR_ID && !other.combatant.dead) {
            nearest = Math.min(
              nearest,
              Math.hypot(other.position.x - mark.x, other.position.y - mark.y),
            );
          }
        }
      }
      expect(nearest).toBeGreaterThanOrEqual(MARK_CLEAR);
    },
    // Simulates 30 s of a 16-body fight per map, ~5 s on a loaded runner;
    // the property needs the whole half-minute (#3257).
    30_000,
  );

  // The foes' half of the rule above, without a step (#3257): each one's
  // leash stops it FOE_KEEP_OFF short of every place the pair uses.
  it.each(teamArenaMapIds(8))("leashes every foe off the pair's places on %s", (mapId) => {
    const { simulation, mark, teleporter, besidePad, foes } = tutorialWorld(
      mapId,
      8,
      `leash-${mapId}`,
      "monk",
      VIEWPORT,
    );
    const self = simulation.get(SELF_ID);
    if (self === undefined) {
      throw new Error("no player in the tutorial");
    }
    expect(foes).toHaveLength(8);
    for (const { post, leashUnits } of foes) {
      for (const place of [self.position, mark, teleporter, besidePad]) {
        expect(Math.hypot(place.x - post.x, place.y - post.y) - leashUnits).toBeGreaterThanOrEqual(
          FOE_KEEP_OFF,
        );
      }
    }
  });

  it.each(teamArenaMapIds(8))(
    "starts the pair and the mark in plain view on %s, and a click on the mark walks there",
    (mapId) => {
      const { map, simulation, mark, ground } = tutorialWorld(
        mapId,
        8,
        "open-sky",
        "monk",
        VIEWPORT,
      );
      const { structure } = mapStructure(mapId);
      const self = simulation.get(SELF_ID);
      if (self === undefined) {
        throw new Error("no player in the tutorial");
      }
      expect(inOpenView(structure, self.position)).toBe(true);
      expect(inOpenView(structure, mark)).toBe(true);
      // QA on Canyon (#3221): the click named a terrace's top, not the mark.
      expect(pickSurface(structure, mark, false)).toEqual({ layer: ground, point: mark });
      expect(createPathFinder(splashGraph(map)).find(self.position, mark)).toBeDefined();
    },
  );

  it.each(teamArenaMapIds(8))(
    "stands the teleporter north in plain view on %s, a walk away, with the tutor's spot beside it",
    (mapId) => {
      const { map, simulation, teleporter, besidePad, ground } = tutorialWorld(
        mapId,
        8,
        "teleporter",
        "monk",
        VIEWPORT,
      );
      const { structure } = mapStructure(mapId);
      const self = simulation.get(SELF_ID);
      if (self === undefined) {
        throw new Error("no player in the tutorial");
      }
      expect(teleporter.y).toBeLessThan(self.position.y);
      expect(inOpenView(structure, teleporter)).toBe(true);
      // A click on the pad names the ground, and a point the walk there
      // counts as on the pad: by a ramp's foot that is not the pad's own
      // point (Canyon, 8v8).
      const picked = pickSurface(structure, teleporter, false);
      expect(picked.layer).toBe(ground);
      expect(
        Math.hypot(picked.point.x - teleporter.x, picked.point.y - teleporter.y),
      ).toBeLessThanOrEqual(MARK_REACH / 2);
      const paths = createPathFinder(splashGraph(map));
      expect(paths.find(self.position, teleporter)).toBeDefined();
      expect(paths.find(self.position, besidePad)).toBeDefined();
    },
  );

  // CI (#3222): on Crossroads, whose ground is its layer 1, a flat world
  // refused every walk that named it, the player's click and the tutor's.
  it.each(teamArenaMapIds(8))(
    "walks the player to the mark, and the tutor off to its post, on %s",
    (mapId) => {
      const { simulation, mark, ground } = tutorialWorld(mapId, 8, "walk", "monk", VIEWPORT);
      const tutorFrom = { ...simulation.get(TUTOR_ID)?.position };
      simulation.walkTo(SELF_ID, mark, ground);
      let reached = false;
      for (let t = 0; t < 10 && !reached; t += TICK) {
        simulation.step(TICK);
        const self = simulation.get(SELF_ID)?.position;
        reached = self !== undefined && Math.hypot(self.x - mark.x, self.y - mark.y) <= MARK_REACH;
      }
      expect(reached).toBe(true);
      expect(simulation.get(TUTOR_ID)?.position).not.toEqual(tutorFrom);
    },
  );

  // QA (#3222): canyon's arch ramp, 845-965 by 710-790, rises to the arch
  // on layer 1; its pad stood on it, drawn under the arch.
  it("counts no spot on a ramp as open", () => {
    const { structure } = mapStructure("arena-canyon");
    expect(inOpenView(structure, { x: 905, y: 750 })).toBe(false);
  });

  // QA (#3222): on canyon the pad stood on the arch's ramp, drawn under the
  // arch, and a walk to it ended on the floor below, at its x and y.
  it.each(teamArenaMapIds(8))("walks the player onto the teleporter's pad on %s", (mapId) => {
    const { simulation, teleporter, ground } = tutorialWorld(
      mapId,
      8,
      "teleporter",
      "monk",
      VIEWPORT,
    );
    const { structure } = mapStructure(mapId);
    const picked = pickSurface(structure, teleporter, false);
    simulation.walkTo(SELF_ID, picked.point, picked.layer);
    let reached = false;
    for (let t = 0; t < 20 && !reached; t += TICK) {
      simulation.step(TICK);
      const self = simulation.get(SELF_ID);
      reached =
        self?.layer === ground &&
        Math.hypot(self.position.x - teleporter.x, self.position.y - teleporter.y) <= MARK_REACH;
    }
    expect(picked.layer).toBe(ground);
    expect(reached).toBe(true);
  });
});

describe("drawTutorProfession (Q69)", () => {
  it("never draws the player's profession, and can draw every other", () => {
    const drawn = new Set(
      Array.from({ length: TUTOR_PROFESSIONS.length * 4 }, (_, index) =>
        drawTutorProfession(() => index / (TUTOR_PROFESSIONS.length * 4)),
      ),
    );
    expect(drawn.has(PLAYER_PROFESSION)).toBe(false);
    expect([...drawn].sort()).toEqual([...TUTOR_PROFESSIONS].sort());
  });
});

// #3234: a click in a tunnel, from in it, goes along it, not up to the ground over it.
describe("a walk along Crossroads' cellar-west (#3234)", () => {
  /** Steps until the player is on `layer` within `MARK_REACH` of `point`, up to `seconds`. */
  const reaches = (
    simulation: ReturnType<typeof tutorialWorld>["simulation"],
    point: { x: number; y: number },
    layer: number,
    seconds: number,
  ): boolean => {
    for (let t = 0; t < seconds; t += TICK) {
      simulation.step(TICK);
      const self = simulation.get(SELF_ID);
      if (
        self?.layer === layer &&
        Math.hypot(self.position.x - point.x, self.position.y - point.y) <= MARK_REACH
      ) {
        return true;
      }
    }
    return false;
  };

  it("takes a plain click from in the tunnel 300 further along it", () => {
    const { simulation, ground } = tutorialWorld("arena-crossroads", 8, "tunnel", "monk", VIEWPORT);
    const { structure } = mapStructure("arena-crossroads");
    // Into it first: Alt over its cover, from the ground.
    const into = pickSurface(structure, { x: 1815, y: 1350 + ELEVATION_STEP }, true, ground);
    expect(into.layer).toBe(ground - 1);
    simulation.walkTo(SELF_ID, into.point, into.layer);
    expect(reaches(simulation, into.point, ground - 1, 60)).toBe(true);
    const along = pickSurface(structure, { x: 1815, y: 1650 + ELEVATION_STEP }, false, ground - 1);
    expect(along).toEqual({ layer: ground - 1, point: { x: 1815, y: 1650 } });
    simulation.walkTo(SELF_ID, along.point, along.layer);
    expect(reaches(simulation, along.point, ground - 1, 15)).toBe(true);
  });
});
