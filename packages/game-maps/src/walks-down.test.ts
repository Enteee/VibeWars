import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  resolveLoadout,
  type ParticipantSpec,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { pointInShape, shapeVertices } from "./geometry.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { loadAllMaps } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import type { MapData } from "./schema.js";

/**
 * A click on the ground from any deck walks the body down to it (#3177),
 * as clicking upward always did: the walk's budget is its route at full
 * speed, then as much again for the ramps' slower pace.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
const SPEED = RULESET.movement.maxSpeedUnitsPerSecond;
/** How close to its goal a walk counts as arrived. */
const ARRIVED = 4;
/** How far apart the points are that a deck's start is picked from. */
const STEP = 10;

const build = STARTER_BUILDS[0];
if (build === undefined) throw new Error("no starter build");
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

function body(id: string, at: Vec2, layer: number, team: number): ParticipantSpec {
  return {
    id,
    team,
    layer,
    skillBar: [],
    attributeRanks: resolved.attributeRanks,
    equipment: resolved.weaponSets[0].equipment,
    baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
    maxHealth: 1e6,
    spawn: at,
    facing: 0,
  };
}

/** Every always-there deck of `map`, with the point on it nearest its middle a route to `goal` starts from. */
function deckStarts(map: MapData, goal: Vec2) {
  const finder = layeredFinder(map, RULESET.collision.playerRadius);
  return map.decks
    .filter((deck) => deck.switched === null)
    .flatMap((deck) => {
      const corners = shapeVertices(deck.footprint);
      const xs = corners.map(({ x }) => x);
      const ys = corners.map(({ y }) => y);
      const middle = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
      const points: Vec2[] = [];
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += STEP) {
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += STEP) {
          if (pointInShape({ x, y }, deck.footprint)) points.push({ x, y });
        }
      }
      const away = (point: Vec2): number => Math.hypot(point.x - middle.x, point.y - middle.y);
      points.sort((a, b) => away(a) - away(b));
      for (const start of points) {
        const route = finder.find(start, deck.layer, goal, map.groundLayer);
        if (route !== undefined) {
          const length = route.reduce(
            (walked, point, index) =>
              walked +
              Math.hypot(
                point.x - (route[index - 1] ?? start).x,
                point.y - (route[index - 1] ?? start).y,
              ),
            0,
          );
          return [{ deck: deck.id, layer: deck.layer, start, length }];
        }
      }
      return [];
    });
}

const layered = loadAllMaps().filter((map) => map.decks.some((deck) => deck.switched === null));

describe("walking down from a deck (#3177)", () => {
  it("has layered maps to walk", () => {
    expect(layered.map(({ id }) => id)).toContain("arena-canyon");
  });

  describe.each(layered.map((map) => [map.id, map] as const))("%s", (_id, map) => {
    const goal = { x: map.width / 2, y: map.height / 2 };
    it.each(deckStarts(map, goal).map((start) => [start.deck, start] as const))(
      "from deck %s, a walk to the ground's centre arrives",
      (_deck, { layer, start, length }) => {
        // The foe at its spawn keeps the match going.
        const foe = map.spawnPoints.find((spawn) => spawn.team === 1)?.position ?? goal;
        const sim = new MatchSimulation({
          seed: `walks-down:${map.id}`,
          ruleset: RULESET,
          ...mapSimulationFields(map, map.teams),
          participants: [body("walker", start, layer, 0), body("foe", foe, map.groundLayer, 1)],
        });
        sim.walkTo("walker", goal, map.groundLayer);
        const budget = (2 * length) / SPEED + 2;
        for (let t = 0; t < budget; t += DT) {
          sim.step(DT);
        }
        const walker = sim.get("walker");
        expect(walker?.layer).toBe(map.groundLayer);
        expect(
          Math.hypot((walker?.position.x ?? 0) - goal.x, (walker?.position.y ?? 0) - goal.y),
        ).toBeLessThanOrEqual(ARRIVED);
      },
    );
  });
});
