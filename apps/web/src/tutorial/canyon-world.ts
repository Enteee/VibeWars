import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  breakableTargetId,
  polygonCentre,
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

/** Station 5's mark (#3302): this far west of the cracked wall's west face. */
const MARK_BEFORE_WALL = 60;
/** Where the tutor waits by the wall, from the mark. */
const TUTOR_AT_WALL = vec2(0, -90);

/** Station 5's wall (#3302): the breakable that shuts the trail east of the boulder run. */
export interface CanyonWall {
  readonly id: string;
  /** What a body targets to strike it. */
  readonly targetId: string;
  /** The mark at its west face, where the trail meets it. */
  readonly face: Vec2;
  readonly layer: number;
  readonly maxHealth: number;
  /** Where the tutor waits by it. */
  readonly besideFace: Vec2;
}

export const CRACKED_WALL: CanyonWall = ((): CanyonWall => {
  const { map } = CANYON_ARRIVAL;
  const id = "cracked-wall";
  const breakable = map.breakables?.find((entry) => entry.id === id);
  if (breakable?.wall.kind !== "rect") {
    throw new Error(`${map.id}: no ${id} for station 5`);
  }
  const { x, y, height, layer } = breakable.wall;
  const face = vec2(x - MARK_BEFORE_WALL, y + height / 2);
  return {
    id,
    targetId: breakableTargetId(id),
    face,
    layer,
    maxHealth: breakable.health,
    besideFace: vec2(face.x + TUTOR_AT_WALL.x, face.y + TUTOR_AT_WALL.y),
  };
})();

/** How far east of the clearing's rockfall the tutor waits once it has been hit (#3303). */
const CLEAR_OF_ROCKFALL = 50;

/** Station 6's clearing (#3303): its rockfall, and where the tutor stands in and beside it. */
export interface CanyonClearing {
  /** The rockfall's zone id, as its strikes name their source. */
  readonly zoneId: string;
  readonly layer: number;
  /** The rockfall's centre, where the tutor waits to be hit. */
  readonly centre: Vec2;
  /** East of the rockfall, out of its reach, where the tutor waits to be healed. */
  readonly east: Vec2;
}

export const CLEARING: CanyonClearing = ((): CanyonClearing => {
  const { map } = CANYON_ARRIVAL;
  const zoneId = "clearing-rockfall";
  const zone = map.zones?.find((entry) => entry.id === zoneId);
  if (zone?.area.kind !== "polygon") {
    throw new Error(`${map.id}: no ${zoneId} for station 6`);
  }
  const { points } = zone.area;
  const centre = polygonCentre(points);
  return {
    zoneId,
    layer: zone.layer,
    centre,
    east: vec2(Math.max(...points.map(({ x }) => x)) + CLEAR_OF_ROCKFALL, centre.y),
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

/** The tutor at the cracked wall (#3302), stepped once a frame. */
export interface WallTutor {
  readonly step: () => void;
}

/**
 * Sends the tutor to wait by the cracked wall, and has it strike the wall
 * once the player's first blow has landed: the wall below its full health,
 * which only the player can do before then. It never breaks the wall alone.
 */
export function wallTutor(simulation: MatchSimulation): WallTutor {
  simulation.walkTo(TUTOR_ID, CRACKED_WALL.besideFace, CRACKED_WALL.layer);
  let striking = false;
  return {
    step: () => {
      const wall = simulation.breakables.find(({ id }) => id === CRACKED_WALL.id);
      if (striking || wall === undefined || wall.health >= wall.maxHealth || wall.health <= 0) {
        return;
      }
      striking = simulation.requestAttack(TUTOR_ID, CRACKED_WALL.targetId)?.ok === true;
    },
  };
}

/** The tutor in the clearing (#3303), stepped once a frame with what station 6 has seen. */
export interface ClearingTutor {
  readonly step: (hit: boolean, healed: boolean) => void;
}

/** The tutor's health, as a fraction, at which it walks out of the rockfall (#3303). */
const HURT = 0.5;
/** Above this fraction, a hit tutor not yet healed bleeds (#3303). */
const BLEED_FLOOR = 0.4;
/** Each frame's bleeding, renewed while it lasts. */
const BLEED_SECONDS = 1;
/** Who the bleeding is from: the tutorial, nobody in the match. */
const BLEED_SOURCE = "tutorial";

/**
 * Sends the tutor into the clearing's rockfall and keeps it there until
 * the strikes have taken half its health, then out to the east side,
 * where it waits to be healed and is not hit again. From the first hit
 * until the player's heal lands it bleeds down towards `BLEED_FLOOR`, so
 * its bar stays low and only the heal brings it back. It uses no skill
 * there, so it never heals itself.
 */
export function clearingTutor(simulation: MatchSimulation): ClearingTutor {
  simulation.walkTo(TUTOR_ID, CLEARING.centre, CLEARING.layer);
  let out = false;
  return {
    step: (hit, healed) => {
      const tutor = simulation.get(TUTOR_ID);
      if (!hit || tutor === undefined) {
        return;
      }
      const { health, maxHealth } = tutor.combatant;
      if (!out && health <= maxHealth * HURT) {
        out = true;
        simulation.walkTo(TUTOR_ID, CLEARING.east, CLEARING.layer);
      }
      if (!healed && health > maxHealth * BLEED_FLOOR) {
        simulation.afflict(TUTOR_ID, "bleeding", BLEED_SECONDS, BLEED_SOURCE);
      }
    },
  };
}
