import type { Vec2 } from "../vec2.js";

/**
 * The Guild Battle's flags and flag stand (#1225, GW1): each team has
 * one flag in its base; a member carries it to the stand in the centre,
 * and the team whose flag is on it holds the stand. Every
 * `STAND_HOLD_SECONDS` held without a break is a morale boost.
 *
 * Pure: the simulation walks the players and says who arrived, dropped
 * or died; this decides where every flag is and who holds the stand.
 */

/** How near a player walks before taking up or planting a flag. */
export const FLAG_REACH_UNITS = 60;
/** How long the stand is held, without a break, for one morale boost (GW1: 2 minutes). */
export const STAND_HOLD_SECONDS = 120;
/** The boost a held stand gives its team (GW1: +10%). */
export const FLAG_MORALE_BOOST = 10;
/** A carrier's speed is divided by this (GW1 estimate): hands full of flag. */
export const FLAG_CARRIER_SPEED_MULTIPLIER = 1.2;

/** The stand's target id: no seat or creature id is this. */
export const FLAG_STAND_ID = "flag-stand";

/** Where a team's flag stands at the start, from its map's `flag-spawn` objective. */
export interface FlagSpawn {
  readonly team: number;
  readonly position: Vec2;
}

/** A Guild Battle map's flag objectives: one stand, one spawn per team. */
export interface FlagField {
  readonly stand: Vec2;
  readonly spawns: readonly FlagSpawn[];
}

/** Where a flag is: always exactly one of these. */
export type FlagPlace =
  | { readonly kind: "spawn" }
  | { readonly kind: "carried"; readonly carrierId: string }
  | { readonly kind: "ground"; readonly position: Vec2 }
  | { readonly kind: "stand" };

export interface FlagState {
  readonly team: number;
  readonly place: FlagPlace;
}

/** Who holds the stand, and for how long since the last boost or the taking. */
export interface StandState {
  readonly holder: number | undefined;
  readonly heldSeconds: number;
}

export interface FlagsState {
  readonly flags: readonly FlagState[];
  readonly stand: StandState;
}

/** Why Space on a flag or the stand does nothing. */
export type FlagRefusal = "no-target" | "not-your-flag" | "flag-on-stand" | "no-flag-carried";

/** A player who reached a flag or the stand this tick, to take or plant one. */
export interface FlagArrival {
  readonly kind: "interact";
  readonly playerId: string;
  readonly team: number;
  readonly targetId: string;
}

/**
 * One thing that moves a flag this tick, in simulation order: a carrier
 * dropping it where they are, or a player arriving.
 */
export type FlagAction =
  { readonly kind: "drop"; readonly carrierId: string; readonly position: Vec2 } | FlagArrival;

export interface FlagStep extends FlagsState {
  /** The team a held stand boosts this tick, or `undefined`. */
  readonly boostTeam: number | undefined;
}

/** Within a hair, as a swing's interval is: twenty-odd 0.05 s ticks fall just short. */
const HOLD_EPSILON = 1e-6;

const AT_SPAWN: FlagPlace = { kind: "spawn" };

/** The target id of `team`'s flag: no seat's id has a `/` in it. */
export function flagId(team: number): string {
  return `flag/${String(team)}`;
}

/** The team whose flag `id` names, or `undefined` if it names none. */
export function flagTeamOf(id: string): number | undefined {
  const match = /^flag\/(\d+)$/.exec(id);
  return match === null ? undefined : Number(match[1]);
}

/** Whether `id` names a flag or the stand rather than a body. */
export function isFlagObjectId(id: string): boolean {
  return id === FLAG_STAND_ID || flagTeamOf(id) !== undefined;
}

/** Every flag at its spawn; nobody holds the stand. */
export function initialFlags(field: FlagField): FlagsState {
  return {
    flags: field.spawns.map(({ team }) => ({ team, place: AT_SPAWN })),
    stand: { holder: undefined, heldSeconds: 0 },
  };
}

/** The flag `carrierId` carries, or `undefined`. */
export function carriedFlag(flags: readonly FlagState[], carrierId: string): FlagState | undefined {
  return flags.find(({ place }) => place.kind === "carried" && place.carrierId === carrierId);
}

/**
 * Where a player walks to for `targetId`: a flag at its spawn or on the
 * ground, or the stand. `undefined` for a flag carried or on the stand,
 * and for an id that is neither.
 */
export function flagTargetPosition(
  field: FlagField,
  flags: readonly FlagState[],
  targetId: string,
): Vec2 | undefined {
  if (targetId === FLAG_STAND_ID) {
    return field.stand;
  }
  const flag = flags.find(({ team }) => flagId(team) === targetId);
  switch (flag?.place.kind) {
    case "spawn":
      return field.spawns.find(({ team }) => team === flag.team)?.position;
    case "ground":
      return flag.place.position;
    default:
      return undefined;
  }
}

/**
 * Why a member of `team`, `playerId`, may not walk to `targetId` and
 * take or plant a flag there now, or `undefined` if they may: only their
 * own team's flag is theirs to take, and only a carrier plants one.
 */
export function flagRefusal(
  field: FlagField,
  state: FlagsState,
  playerId: string,
  team: number,
  targetId: string,
): FlagRefusal | undefined {
  if (flagTargetPosition(field, state.flags, targetId) === undefined) {
    return "no-target";
  }
  if (targetId !== FLAG_STAND_ID) {
    return flagTeamOf(targetId) === team ? undefined : "not-your-flag";
  }
  if (carriedFlag(state.flags, playerId) !== undefined) {
    return undefined;
  }
  return state.stand.holder === team ? "flag-on-stand" : "no-flag-carried";
}

/** `state` with the flag `carrierId` carries lying at `position`; unchanged if none. */
export function dropFlag(state: FlagsState, carrierId: string, position: Vec2): FlagsState {
  return {
    ...state,
    flags: state.flags.map((flag) =>
      flag.place.kind === "carried" && flag.place.carrierId === carrierId
        ? { team: flag.team, place: { kind: "ground", position } }
        : flag,
    ),
  };
}

/** One interaction, as `stepFlags` takes it: refused ones change nothing. */
function interact(field: FlagField, state: FlagsState, action: FlagArrival): FlagsState {
  const { playerId, team, targetId } = action;
  if (flagRefusal(field, state, playerId, team, targetId) !== undefined) {
    return state;
  }
  if (targetId !== FLAG_STAND_ID) {
    return {
      ...state,
      flags: state.flags.map((flag) =>
        flag.team === team ? { team, place: { kind: "carried", carrierId: playerId } } : flag,
      ),
    };
  }
  // Planted: a foe's flag on the stand goes home, and the countdown is
  // the new holder's, from 0.
  return {
    flags: state.flags.map((flag) => {
      if (flag.team === team) {
        return { team, place: { kind: "stand" } };
      }
      return flag.place.kind === "stand" ? { team: flag.team, place: AT_SPAWN } : flag;
    }),
    stand: { holder: team, heldSeconds: 0 },
  };
}

/**
 * One tick of the flags (#1225): `actions` in order, so of two plantings
 * in one tick the later stands; then the stand's countdown. A holder
 * that held it all tick counts `dt` more, and at `STAND_HOLD_SECONDS`
 * boosts its team and starts again. One that took it this tick starts
 * from 0 next tick.
 */
export function stepFlags(
  field: FlagField,
  state: FlagsState,
  actions: readonly FlagAction[],
  dt: number,
): FlagStep {
  const holder = state.stand.holder;
  let next = state;
  for (const action of actions) {
    next =
      action.kind === "drop"
        ? dropFlag(next, action.carrierId, action.position)
        : interact(field, next, action);
  }
  if (next.stand.holder === undefined || next.stand !== state.stand || holder === undefined) {
    return { ...next, boostTeam: undefined };
  }
  const heldSeconds = next.stand.heldSeconds + dt;
  if (heldSeconds < STAND_HOLD_SECONDS - HOLD_EPSILON) {
    return { ...next, stand: { holder, heldSeconds }, boostTeam: undefined };
  }
  return { ...next, stand: { holder, heldSeconds: 0 }, boostTeam: holder };
}
