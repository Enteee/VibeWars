import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  breakableTargetId,
  critterSpec,
  getSkill,
  polygonCentre,
  vec2,
  type MatchZone,
  type ParticipantSpec,
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

import { CANYON_ARRIVAL, CANYON_ARRIVALS, CANYON_SITES, type CanyonPoint } from "./canyon-map.js";
import type { RatTally, RatWatch } from "./rat-watch.js";
import { SKILLS_ON_RATS } from "./stations.js";
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

/** The canyon past the teleporter (#3247), either of its maps, built and not yet stepped. */
export interface CanyonWorld {
  readonly map: MapDescriptor;
  readonly simulation: MatchSimulation;
  /** Its zones, as the simulation strikes with them. */
  readonly zones: readonly MatchZone[];
  /** The layer the trail runs on. */
  readonly ground: number;
  /** Where the tutor goes on ahead to: by station 4's mark, or by the rat pocket (#3316). */
  readonly besideMark: Vec2;
}

/**
 * One of the tutorial canyon's two maps (#3245), `part` 0 or 1, as a world
 * for the pair: no bots, only its zones, which strike on their own clock,
 * and on the second the rat pocket's rats (#3316). The player stands on
 * the map's arrival, the tutor beside them; both play the builds they
 * played on the battlefield.
 */
export function canyonWorld(
  seed: string,
  playerBuild: PlayerBuild,
  tutorBuild: PlayerBuild,
  part: 0 | 1,
): CanyonWorld {
  const { map: data, position: arrival, layer: ground } = CANYON_ARRIVALS[part];
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
      ...(part === 0 ? [] : RAT_POCKET.rats.map(ratAt)),
    ],
  });
  return {
    map: toMapDescriptor(data),
    simulation,
    zones,
    ground,
    besideMark:
      part === 0
        ? vec2(DODGE_MARK.position.x + TUTOR_AT_MARK.x, DODGE_MARK.position.y + TUTOR_AT_MARK.y)
        : RAT_POCKET.tutorSpot,
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

/** How far north of the mire station 7's mark lies (#3310), past its far edge. */
const MARK_BEYOND_MIRE = 170;
/** How far south of the mire station 7 is reckoned to begin, where the north leg starts. */
const START_BEFORE_MIRE = 350;
/** How far east of station 7's mark the tutor waits for the player. */
const TUTOR_BY_MARK = 80;
/** How near a waypoint the tutor must come before it walks to the next. */
const WAYPOINT_REACH = 20;

/** Station 7's site (#3310): the mark past the bad ground, and the tutor's way round it. */
export interface CanyonBadGround {
  readonly layer: number;
  /** Where the station is reckoned to begin: due south of the mire. */
  readonly start: Vec2;
  /**
   * North of the mire, where the clear way east comes back in: the
   * straight line from `start` runs through the mud.
   */
  readonly mark: Vec2;
  /** The tutor's way to beside the mark, round the mire's east side, in no zone. */
  readonly tutorRoute: readonly Vec2[];
}

export const BAD_GROUND: CanyonBadGround = ((): CanyonBadGround => {
  const { map } = CANYON_ARRIVAL;
  const zoneId = "bad-ground-mire";
  const zone = map.zones?.find((entry) => entry.id === zoneId);
  if (zone?.area.kind !== "polygon") {
    throw new Error(`${map.id}: no ${zoneId} for station 7`);
  }
  const { points } = zone.area;
  const centre = polygonCentre(points);
  const east = Math.max(...points.map(({ x }) => x));
  const north = Math.min(...points.map(({ y }) => y));
  const south = Math.max(...points.map(({ y }) => y));
  const mark = vec2(east, north - MARK_BEYOND_MIRE);
  return {
    layer: zone.layer,
    start: vec2(centre.x, south + START_BEFORE_MIRE),
    mark,
    // Up the north leg's east side, through the bulge east of the mire, and back in.
    tutorRoute: [
      vec2(east + 100, south + 140),
      vec2(east + 250, centre.y),
      vec2(mark.x + TUTOR_BY_MARK, mark.y),
    ],
  };
})();

/** The tutor at station 7 (#3310), stepped once a frame. */
export interface BadGroundTutor {
  readonly step: () => void;
}

/** Walks the tutor round the bad ground to wait beside the mark, one waypoint at a time. */
export function badGroundTutor(simulation: MatchSimulation): BadGroundTutor {
  const route = BAD_GROUND.tutorRoute;
  let leg = 0;
  const walk = (): void => {
    const to = route[leg];
    if (to !== undefined) {
      simulation.walkTo(TUTOR_ID, to, BAD_GROUND.layer);
    }
  };
  walk();
  return {
    step: () => {
      const tutor = simulation.get(TUTOR_ID);
      const to = route[leg];
      if (tutor === undefined || to === undefined) {
        return;
      }
      if (Math.hypot(tutor.position.x - to.x, tutor.position.y - to.y) <= WAYPOINT_REACH) {
        leg += 1;
        walk();
      }
    },
  };
}

/** A rat's aggro and leash round its post (#3316): it bites only who comes close. */
export const RAT_AGGRO = 150;
const RAT_LEASH = 250;
/** How long a rat waits between its decisions, as a base guard does. */
const RAT_THINK_SECONDS = 0.5;
/** Station 8's big rat's health (#3316): twice a rat's, so a combo is worth it. */
const BIG_RAT_HEALTH = 240;
/** How far the runner flees from where the player's first blow found it (#3316), west. */
const RAT_FLEE = vec2(-400, 0);
/** Below this share of the player's health the tutor heals the player at the rats (#3316). */
const RAT_HEAL_BELOW = 0.3;

/** One of station 8's rats (#3316): its id, its post, and its health, if not a rat's own. */
export interface CanyonRat {
  readonly id: string;
  readonly post: Vec2;
  readonly maxHealth: number | undefined;
}

/** Station 8's rat pocket (#3316), on the canyon's second map. */
export interface CanyonRats {
  readonly layer: number;
  /** The pocket's middle, which the player is led to. */
  readonly pocket: Vec2;
  /** The runner, which flees when first hit; the big one; and a plain one. */
  readonly rats: readonly [CanyonRat, CanyonRat, CanyonRat];
  /** Where one more rat comes, if the three died with too few skills. */
  readonly extra: Vec2;
  /**
   * Where the tutor waits for the player: east of the pocket, on the
   * player's side, out of every rat's aggro, so none bites it first.
   */
  readonly tutorSpot: Vec2;
}

export const RAT_POCKET: CanyonRats = ((): CanyonRats => {
  const site = CANYON_SITES.get(8);
  if (site === undefined) {
    throw new Error("no site 8 for station 8");
  }
  const { position: pocket, layer } = site;
  const at = (dx: number, dy: number): Vec2 => vec2(pocket.x + dx, pocket.y + dy);
  return {
    layer,
    pocket,
    rats: [
      { id: "tutorial-rat-1", post: at(-150, -90), maxHealth: undefined },
      { id: "tutorial-rat-2", post: at(-150, 90), maxHealth: BIG_RAT_HEALTH },
      { id: "tutorial-rat-3", post: at(-300, 0), maxHealth: undefined },
    ],
    extra: at(-150, 0),
    tutorSpot: at(100, -90),
  };
})();

/** `rat` as `MatchSimulation` takes it: a rat of team 1 holding `post`, facing east. */
function ratAt(rat: CanyonRat): ParticipantSpec {
  return ratSpec(rat.id, rat.post, rat.post, rat.maxHealth, undefined);
}

function ratSpec(
  id: string,
  at: Vec2,
  post: Vec2,
  maxHealth: number | undefined,
  startHealthFraction: number | undefined,
): ParticipantSpec {
  const spec = critterSpec(
    id,
    1,
    at,
    RAT_POCKET.layer,
    {
      kind: "guard",
      post,
      aggroUnits: RAT_AGGRO,
      leashUnits: RAT_LEASH,
      rooted: false,
      thinkSeconds: RAT_THINK_SECONDS,
    },
    0,
  );
  return {
    ...spec,
    ...(maxHealth === undefined ? {} : { maxHealth }),
    ...(startHealthFraction === undefined ? {} : { startHealthFraction }),
  };
}

/**
 * The slot of the first skill on `build`'s bar that heals another ally,
 * or none: what the tutor may use on the player at the rats (#3316).
 */
export function allyHealSlot(build: PlayerBuild): number | undefined {
  const slot = build.skillBar.findIndex((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return (
      skill !== undefined &&
      (skill.target === "single-ally" || skill.target === "single-other-ally") &&
      skill.effects.some((effect) => effect.kind === "heal")
    );
  });
  return slot < 0 ? undefined : slot;
}

/** Station 8 at the rat pocket (#3316), stepped once a frame with what the rat watch has seen. */
export interface RatPocket {
  /** The rats standing now, any extra one among them. */
  readonly alive: () => number;
  /** The runner has fled the player's first blow. */
  readonly fled: () => boolean;
  /** One more rat has come, the three having died with too few skills. */
  readonly extra: () => boolean;
  readonly step: (tally: RatTally) => void;
}

/**
 * Sends the tutor to the pocket and runs station 8's rats: the runner
 * flees west once the player first hits it, put back where it stood with
 * its post moved, which a guard's leash then walks it to; the player's
 * and the tutor's target and attack follow it. The tutor attacks only a rat the
 * player has already hit, so the player always opens, and heals the
 * player with `healSlot`, if its build has one, below `RAT_HEAL_BELOW`.
 * Once every rat is dead with fewer than `SKILLS_ON_RATS` skills landed,
 * one more comes, watched by `watch`, and again as long as that holds.
 */
export function ratPocket(
  simulation: MatchSimulation,
  watch: RatWatch,
  healSlot: number | undefined,
): RatPocket {
  simulation.walkTo(TUTOR_ID, RAT_POCKET.tutorSpot, RAT_POCKET.layer);
  const [runner] = RAT_POCKET.rats;
  const ids = RAT_POCKET.rats.map(({ id }) => id);
  let fled = false;
  let extra = false;
  const standing = (id: string): boolean => simulation.get(id)?.combatant.dead === false;
  const alive = (): number => ids.filter(standing).length;
  const flee = (): void => {
    const rat = simulation.get(runner.id);
    if (rat === undefined) {
      return;
    }
    const { position, combatant } = rat;
    const pair = [SELF_ID, TUTOR_ID].flatMap((id) => simulation.get(id) ?? []);
    const aimed = pair.filter((body) => body.targetId === runner.id).map(({ id }) => id);
    const striking = pair
      .filter((body) => body.combatant.attack?.targetId === runner.id)
      .map(({ id }) => id);
    simulation.remove(runner.id);
    simulation.add(
      ratSpec(
        runner.id,
        position,
        vec2(position.x + RAT_FLEE.x, position.y + RAT_FLEE.y),
        runner.maxHealth,
        combatant.health / combatant.maxHealth,
      ),
    );
    for (const id of aimed) {
      simulation.setTarget(id, runner.id);
    }
    for (const id of striking) {
      simulation.requestAttack(id, runner.id);
    }
  };
  return {
    alive,
    fled: () => fled,
    extra: () => extra,
    step: (tally) => {
      if (!fled && tally.hitByPlayer.has(runner.id) && standing(runner.id)) {
        fled = true;
        flee();
      }
      const self = simulation.get(SELF_ID);
      const tutor = simulation.get(TUTOR_ID);
      if (self === undefined || tutor === undefined) {
        return;
      }
      const { health, maxHealth } = self.combatant;
      if (healSlot !== undefined && !self.combatant.dead && health < maxHealth * RAT_HEAL_BELOW) {
        simulation.setTarget(TUTOR_ID, SELF_ID);
        simulation.requestSkill(TUTOR_ID, healSlot);
        return;
      }
      const prey = ids.find((id) => tally.hitByPlayer.has(id) && standing(id));
      if (prey !== undefined && tutor.combatant.attack?.targetId !== prey) {
        simulation.requestAttack(TUTOR_ID, prey);
      }
      if (alive() === 0 && tally.skillsOnRats.size < SKILLS_ON_RATS) {
        extra = true;
        const id = `tutorial-rat-${String(ids.length + 1)}`;
        ids.push(id);
        watch.watch(id);
        simulation.add(ratSpec(id, RAT_POCKET.extra, RAT_POCKET.extra, undefined, undefined));
      }
    },
  };
}
