import { distance, type Vec2 } from "../vec2.js";
import {
  AT_SPAWN,
  carriedBy,
  carriedObjectId,
  carriedObjectTeam,
  dropCarried,
  lyingPosition,
  type CarriedArrival,
  type CarriedDrop,
  type CarriedObject,
  type CarriedSpawn,
} from "./carried.js";
import { FLAG_REACH_UNITS } from "./flags.js";

/**
 * Heroes' Ascent's Relic Run (#1374, GW1): each team has one relic in
 * its base; a member carries it onto the altar in the centre to score a
 * point. A foe who reaches it lying on the ground sends it home.
 *
 * Pure, as `flags.ts` is: the simulation walks the players and says who
 * arrived, scored, dropped or died; this decides where every relic is
 * and who scored.
 */

/** How near a carrier comes to the altar to score: as near as a flag is reached. */
export const ALTAR_REACH_UNITS = FLAG_REACH_UNITS;

/** A Relic Run map's objectives: one altar, one `relic-spawn` per team. */
export interface RelicField {
  readonly altar: Vec2;
  readonly spawns: readonly CarriedSpawn[];
}

/** A team's relic: at its spawn, carried, or lying where it fell. */
export type RelicState = CarriedObject;

export interface RelicsState {
  readonly relics: readonly RelicState[];
}

/** Why Space on a relic does nothing. */
export type RelicRefusal = "no-target" | "not-your-relic" | "hands-full";

/**
 * One thing that moves a relic this tick, in simulation order: a carrier
 * on the altar scoring, a carrier dropping it, or a player arriving.
 */
export type RelicAction =
  { readonly kind: "score"; readonly carrierId: string } | CarriedDrop | CarriedArrival;

export interface RelicStep {
  readonly state: RelicsState;
  /** The team of every point scored this tick, in order. */
  readonly scored: readonly number[];
}

/** The target id of `team`'s relic: no seat's id has a `/` in it. */
export function relicId(team: number): string {
  return carriedObjectId("relic", team);
}

/** The team whose relic `id` names, or `undefined` if it names none. */
export function relicTeamOf(id: string): number | undefined {
  return carriedObjectTeam("relic", id);
}

/** Every relic at its spawn. */
export function initialRelics(field: RelicField): RelicsState {
  return { relics: field.spawns.map(({ team }) => ({ team, place: AT_SPAWN })) };
}

/** The relic `carrierId` carries, or `undefined`. */
export function carriedRelic(
  relics: readonly RelicState[],
  carrierId: string,
): RelicState | undefined {
  return carriedBy(relics, carrierId);
}

/** Whether `position` is on the altar: near enough for a carrier to score. */
export function onAltar(field: RelicField, position: Vec2): boolean {
  return distance(position, field.altar) <= ALTAR_REACH_UNITS;
}

/**
 * Where a player walks to for `targetId`: a relic at its spawn or on the
 * ground. `undefined` for one carried, and for an id that names none.
 */
export function relicTargetPosition(
  field: RelicField,
  relics: readonly RelicState[],
  targetId: string,
): Vec2 | undefined {
  const relic = relics.find(({ team }) => relicId(team) === targetId);
  return relic === undefined ? undefined : lyingPosition(field.spawns, relic);
}

/**
 * Why a member of `team`, `playerId`, may not walk to `targetId` and
 * take up or return a relic there now, or `undefined` if they may: their
 * own wherever it lies; a foe's only on the ground, never at its spawn,
 * and only with empty hands.
 */
export function relicRefusal(
  field: RelicField,
  state: RelicsState,
  playerId: string,
  team: number,
  targetId: string,
): RelicRefusal | undefined {
  if (relicTargetPosition(field, state.relics, targetId) === undefined) {
    return "no-target";
  }
  if (relicTeamOf(targetId) === team) {
    return undefined;
  }
  const relic = state.relics.find((each) => relicId(each.team) === targetId);
  if (relic?.place.kind !== "ground") {
    return "not-your-relic";
  }
  return carriedRelic(state.relics, playerId) === undefined ? undefined : "hands-full";
}

/** One arrival, as `stepRelics` takes it: refused ones change nothing. */
function interact(field: RelicField, state: RelicsState, action: CarriedArrival): RelicsState {
  const { playerId, team, targetId } = action;
  if (relicRefusal(field, state, playerId, team, targetId) !== undefined) {
    return state;
  }
  // Your own is taken up; a foe's, lying, goes home at once.
  return {
    relics: state.relics.map((relic) => {
      if (relicId(relic.team) !== targetId) {
        return relic;
      }
      return relic.team === team
        ? { team, place: { kind: "carried", carrierId: playerId } }
        : { team: relic.team, place: AT_SPAWN };
    }),
  };
}

/** A carrier's score: their relic goes home, and their team has a point. */
function score(state: RelicsState, carrierId: string): RelicStep {
  const relic = carriedRelic(state.relics, carrierId);
  if (relic === undefined) {
    return { state, scored: [] };
  }
  return {
    state: {
      relics: state.relics.map((each) =>
        each === relic ? { team: each.team, place: AT_SPAWN } : each,
      ),
    },
    scored: [relic.team],
  };
}

/**
 * One tick of the relics (#1374): `actions` in order. The simulation
 * puts the scores first, so a carrier who reaches the altar and dies in
 * the same tick scores before the drop; and the drops before arrivals,
 * so a returned relic is returned once, by whoever reached it first.
 */
export function stepRelics(
  field: RelicField,
  state: RelicsState,
  actions: readonly RelicAction[],
): RelicStep {
  let next = state;
  const scored: number[] = [];
  for (const action of actions) {
    switch (action.kind) {
      case "score": {
        const step = score(next, action.carrierId);
        next = step.state;
        scored.push(...step.scored);
        break;
      }
      case "drop":
        next = { relics: dropCarried(next.relics, action.carrierId, action.position) };
        break;
      case "interact":
        next = interact(field, next, action);
        break;
    }
  }
  return { state: next, scored };
}
