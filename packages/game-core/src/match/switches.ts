import type { Vec2 } from "../vec2.js";

/**
 * Switches (#3025): a lever on the map. A player walks to it as to a
 * bundle, and arriving flips it: every gate it names toggles, the open
 * ones closing and the closed ones opening. It never rests, as in GW1
 * (#3054): the walk to it is the only limit on how fast it moves.
 *
 * Pure: the simulation says who arrived when; this decides whether the
 * lever moves.
 */

/** A switch as the map lays it out. */
export interface SwitchField {
  readonly id: string;
  /** The layer it stands on (ADR-0051), reached from that layer only. */
  readonly layer: number;
  readonly position: Vec2;
  /** The gates it toggles, as indices into the match's gates. */
  readonly targets: readonly number[];
}

/** One switch as it stands. */
export interface SwitchState {
  /** Which way the lever points: up as the match starts, down after one flip. */
  readonly up: boolean;
}

/** A switch on the map, and how it stands. */
export interface Switch extends SwitchField, SwitchState {}

/** Every switch starts up. */
export function initialSwitches(fields: readonly SwitchField[]): Switch[] {
  return fields.map((field) => ({ ...field, up: true }));
}

/** `lever` flipped. */
export function flipSwitch(lever: Switch): Switch {
  return { ...lever, up: !lever.up };
}

const PREFIX = "switch-";

/** The target id a player clicks to walk to the switch `id`. */
export function switchTargetId(id: string): string {
  return `${PREFIX}${id}`;
}

/** The switch id `targetId` names, or `undefined` if it names no switch. */
export function switchIdOf(targetId: string): string | undefined {
  return targetId.startsWith(PREFIX) ? targetId.slice(PREFIX.length) : undefined;
}
