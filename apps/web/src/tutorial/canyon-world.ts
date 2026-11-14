import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  vec2,
  type MatchZone,
  type PlayerBuild,
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import {
  matchBreakables,
  matchGates,
  matchLayers,
  matchLifts,
  matchSwitchedDecks,
  matchSwitches,
  matchTeleports,
  matchZones,
} from "@vibewars/game-maps/layers";
import type { MapDescriptor } from "@vibewars/game-protocol";

import { toMapDescriptor } from "../training/scenario-setup.js";
import { SPLASH_RULES } from "../ui/splash-fight.js";

import { CANYON_ARRIVAL, type CanyonPoint } from "./canyon-map.js";
import { SELF_ID, TUTOR_ID, body } from "./tutorial-world.js";

/** Where the tutor stands as the pair arrives: beside the player, to the north. */
const TUTOR_BESIDE = vec2(0, -80);
/** Station 4's mark (#3247): this far east of the boulder run's last landing, inside its `DODGE_REACH`. */
const MARK_PAST = 100;
/** Where the tutor waits for the player there, from the mark. */
const TUTOR_AT_MARK = vec2(0, -90);
/** The boulder run's last landing, the one the mark is past. */
const LAST_LANDING = "boulder-run-3";

/** Station 4's mark (#3247): east of the boulder run's last landing, on the trail. */
export const DODGE_MARK: CanyonPoint = ((): CanyonPoint => {
  const { map } = CANYON_ARRIVAL;
  const landing = map.zones?.find((zone) => zone.id === LAST_LANDING);
  if (landing?.area.kind !== "polygon") {
    throw new Error(`${map.id}: no ${LAST_LANDING} to put station 4's mark past`);
  }
  const xs = landing.area.points.map(({ x }) => x);
  const ys = landing.area.points.map(({ y }) => y);
  return {
    map,
    position: vec2(Math.max(...xs) + MARK_PAST, (Math.min(...ys) + Math.max(...ys)) / 2),
    layer: landing.layer,
  };
})();

/** The canyon past the teleporter (#3247), built and not yet stepped. */
export interface CanyonWorld {
  readonly map: MapDescriptor;
  readonly simulation: MatchSimulation;
  /** Its zones, as the simulation strikes with them. */
  readonly zones: readonly MatchZone[];
  /** The layer the trail runs on. */
  readonly ground: number;
  /** Where the tutor waits by station 4's mark. */
  readonly besideMark: Vec2;
}

/**
 * The tutorial canyon's first map (#3245) as a world for the pair alone:
 * no foes and no bots, only its zones, which strike on their own clock.
 * The player stands on the arrival facing east, down the trail, the tutor
 * beside them; both play the builds they played on the battlefield.
 */
export function canyonWorld(
  seed: string,
  playerBuild: PlayerBuild,
  tutorBuild: PlayerBuild,
): CanyonWorld {
  const { map: data, position: arrival, layer: ground } = CANYON_ARRIVAL;
  const mark = DODGE_MARK.position;
  const zones = matchZones(data);
  const simulation = new MatchSimulation({
    seed,
    ruleset: RULESET,
    matchRules: SPLASH_RULES,
    teamCount: data.teams,
    walls: allWallSegments(data.walls),
    bounds: { width: data.width, height: data.height },
    layers: matchLayers(data),
    zones,
    gates: matchGates(data),
    switches: matchSwitches(data),
    teleports: matchTeleports(data),
    breakables: matchBreakables(data),
    switchedDecks: matchSwitchedDecks(data),
    lifts: matchLifts(data),
    participants: [
      body(SELF_ID, playerBuild, arrival, undefined),
      body(
        TUTOR_ID,
        tutorBuild,
        vec2(arrival.x + TUTOR_BESIDE.x, arrival.y + TUTOR_BESIDE.y),
        undefined,
      ),
    ],
  });
  return {
    map: toMapDescriptor(data),
    simulation,
    zones,
    ground,
    besideMark: vec2(mark.x + TUTOR_AT_MARK.x, mark.y + TUTOR_AT_MARK.y),
  };
}
