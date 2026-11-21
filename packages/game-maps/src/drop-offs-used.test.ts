import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  dropOffEnds,
  isStandable,
  loadoutOf,
  resolveLoadout,
  usableDropOffs,
  type ParticipantSpec,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { matchLayers } from "./layers.js";
import { loadAllMaps } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { mapsIn } from "./maps-in.test-support.js";
import { mapNavGraphs } from "./nav-graphs.js";

/**
 * Every drop-off on every shipped map is one the path finder walks off
 * (#3481): one drawn a little off its deck's edge passes the schema's
 * slack, but a body cannot stand at one of its ends, so a click off the
 * edge quietly took the stairs instead.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
const SPEED = RULESET.movement.maxSpeedUnitsPerSecond;
const BODY_RADIUS = RULESET.collision.playerRadius;
/** How close to its goal a walk counts as arrived. */
const ARRIVED = 4;
/** The longest a walk off a drop-off may be: anything longer went round. */
const DIRECT = 6 * BODY_RADIUS;

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

const maps = [...loadAllMaps(), ...mapsIn("training"), ...mapsIn("tutorial")].filter(
  (map) => map.dropOffs.length > 0,
);

describe("every drop-off is one a body walks off (#3481)", () => {
  it("has drop-offs to check", () => {
    expect(maps.map(({ id }) => id)).toContain("arena-canyon");
  });

  describe.each(maps.map((map) => [map.id, map] as const))("%s", (id, map) => {
    const dropOffs = matchLayers(map).dropOffs;

    it("keeps every drop-off, every gate open", () => {
      const graphs = mapNavGraphs(map, BODY_RADIUS);
      const unusable = dropOffs.flatMap((dropOff, index) => {
        const { layer, top, landing } = dropOffEnds(dropOff, BODY_RADIUS);
        const near = graphs[layer];
        const far = graphs[layer - 1];
        const ends = [
          ...(near !== undefined && isStandable(near, top) ? [] : ["top"]),
          ...(far !== undefined && isStandable(far, landing) ? [] : ["landing"]),
        ];
        return ends.length === 0
          ? []
          : [`${id} drop-off ${String(index)}: no body stands at its ${ends.join(" or ")}`];
      });
      expect(unusable).toEqual([]);
      expect(usableDropOffs(graphs, dropOffs, BODY_RADIUS)).toHaveLength(dropOffs.length);
    });

    // As the map starts: its gates shut. No drop-off on a shipped map
    // lands behind a gate, so none needs one open.
    it.each(dropOffs.map((dropOff, index) => [index, dropOff] as const))(
      "walks straight off drop-off %i",
      (index, { layer, edge, outward }) => {
        const middle = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
        const start = {
          x: middle.x - outward.x * 2 * BODY_RADIUS,
          y: middle.y - outward.y * 2 * BODY_RADIUS,
        };
        const goal = {
          x: middle.x + outward.x * 2 * BODY_RADIUS,
          y: middle.y + outward.y * 2 * BODY_RADIUS,
        };
        // The foe at its spawn keeps the match going.
        const foe = map.spawnPoints.find((spawn) => spawn.team === 1);
        const sim = new MatchSimulation({
          seed: `drop-offs-used:${id}`,
          ruleset: RULESET,
          teamCount: map.teams,
          ...mapSimulationFields(map, map.teams),
          participants: [
            body("walker", start, layer, 0),
            body("foe", foe?.position ?? start, foe?.layer ?? layer, 1),
          ],
        });
        sim.walkTo("walker", goal, layer - 1);
        let walked = 0;
        let at = start;
        for (let t = 0; t < (2 * DIRECT) / SPEED + 1; t += DT) {
          sim.step(DT);
          const walker = sim.get("walker");
          if (walker === undefined) break;
          walked += Math.hypot(walker.position.x - at.x, walker.position.y - at.y);
          at = { ...walker.position };
          const there = Math.hypot(at.x - goal.x, at.y - goal.y) <= ARRIVED;
          if (there && walker.layer === layer - 1) break;
        }
        const walker = sim.get("walker");
        const arrived =
          walker?.layer === layer - 1 &&
          Math.hypot(at.x - goal.x, at.y - goal.y) <= ARRIVED &&
          walked <= DIRECT;
        expect(
          arrived,
          `${id} drop-off ${String(index)}: walked ${walked.toFixed(1)} u to layer ${String(walker?.layer)}, ${Math.hypot(at.x - goal.x, at.y - goal.y).toFixed(1)} u from the landing; a direct walk is at most ${String(DIRECT)} u`,
        ).toBe(true);
      },
    );
  });
});
