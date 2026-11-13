import { MINIMAL_GW_INSPIRED_PVP_V1, createPathFinder } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { mapStructure, teamArenaMapIds } from "../net/maps.js";
import { pickSurface } from "../render/layer-surfaces.js";
import { splashGraph } from "../ui/splash-fight.js";

import {
  PLAYER_PROFESSION,
  SELF_ID,
  TUTOR_ID,
  TUTOR_PROFESSIONS,
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
  it.each(teamArenaMapIds(8))("lets nobody but the player walk over the mark on %s", (mapId) => {
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
  });

  it.each(["arena-canyon", "arena-crossroads", "arena-long-hall"])(
    "starts the pair and the mark in plain view on %s, and a click on the mark walks there",
    (mapId) => {
      const { map, simulation, mark, ground } = tutorialWorld(
        mapId,
        4,
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

  it.each(["arena-canyon", "arena-crossroads", "arena-long-hall"])(
    "stands the teleporter north in plain view on %s, a walk away, with the tutor's spot beside it",
    (mapId) => {
      const { map, simulation, teleporter, besidePad, ground } = tutorialWorld(
        mapId,
        4,
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
      expect(pickSurface(structure, teleporter, false)).toEqual({
        layer: ground,
        point: teleporter,
      });
      const paths = createPathFinder(splashGraph(map));
      expect(paths.find(self.position, teleporter)).toBeDefined();
      expect(paths.find(self.position, besidePad)).toBeDefined();
    },
  );
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
