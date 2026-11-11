import type { Vec2 } from "../vec2.js";

/**
 * Switches (#3025): a lever on the map. A player walks to it as to a
 * bundle, and arriving flips it: every gate it names toggles, the open
 * ones closing and the closed ones opening, and every teleport it names
 * turns on or off (#3030), and every switched deck it names goes up or
 * down (#3068). Then it rests for
 * `SWITCH_COOLDOWN_SECONDS`, half a second (#3054): short enough that
 * flipping it back feels immediate, long enough that a script cannot
 * strobe a gate every tick. An arrival in that time does nothing, and
 * says nothing.
 *
 * Pure: the simulation says who arrived when; this decides whether the
 * lever moves.
 */

/** Seconds after a flip before the lever moves again. */
export const SWITCH_COOLDOWN_SECONDS = 0.5;

/** A switch as the map lays it out. */
export interface SwitchField {
  readonly id: string;
  /** The layer it stands on (ADR-0051), reached from that layer only. */
  readonly layer: number;
  readonly position: Vec2;
  /** The gates it toggles, as indices into the match's gates. */
  readonly gates: readonly number[];
  /** The teleports it turns on and off (#3030), as indices into the match's teleports. */
  readonly teleports: readonly number[];
  /** The switched decks it toggles (#3068), as indices into the match's switched decks. */
  readonly decks: readonly number[];
  /** The lever lifts it sends off (#3079), as indices into the match's lifts. */
  readonly lifts: readonly number[];
}

/** One switch as it stands. */
export interface SwitchState {
  /** Which way the lever points: up as the match starts, down after one flip. */
  readonly up: boolean;
  /** The match second from which it may be flipped again. */
  readonly readyAt: number;
}

/** A switch on the map, and how it stands. */
export interface Switch extends SwitchField, SwitchState {}

/** Every switch starts up and ready. */
export function initialSwitches(fields: readonly SwitchField[]): Switch[] {
  return fields.map((field) => ({ ...field, up: true, readyAt: 0 }));
}

/** `lever` flipped at match second `now`; the same lever while it rests. */
export function flipSwitch(lever: Switch, now: number): Switch {
  return now < lever.readyAt
    ? lever
    : { ...lever, up: !lever.up, readyAt: now + SWITCH_COOLDOWN_SECONDS };
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
