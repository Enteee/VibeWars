import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { mapStructure, teamArenaMapIds } from "../net/maps.js";
import { overhangAt } from "../render/layer-surfaces.js";

import { SELF_ID, TUTOR_ID, tutorialWorld } from "./tutorial-world.js";

const TICK = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
/** The card's rule (#3221): no foe nearer the pair than this. */
const FOE_RULE = 600;
const SECONDS = 120;
/** How long, and how wide, the mark stays clear of every body but the pair. */
const MARK_SECONDS = 30;
const MARK_CLEAR = 150;

describe("tutorialWorld (#3221)", () => {
  it.each(["arena-canyon", "arena-crossroads"])(
    "keeps every foe 600 units off the pair for two minutes on %s",
    (mapId) => {
      const { simulation } = tutorialWorld(mapId, 4, `keep-off-${mapId}`);
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
    const { simulation, mark } = tutorialWorld(mapId, 8, `mark-${mapId}`);
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
    "starts the pair and the mark under open sky on %s",
    (mapId) => {
      const { simulation, mark, ground } = tutorialWorld(mapId, 4, "open-sky");
      const { structure } = mapStructure(mapId);
      const self = simulation.get(SELF_ID);
      expect(self).toBeDefined();
      for (const at of [self?.position ?? mark, mark]) {
        expect(overhangAt(structure, at, ground)).toBeUndefined();
      }
    },
  );
});
