import { pointInPolygon, type Polygon } from "../geometry.js";
import type { Vec2 } from "../vec2.js";

/**
 * Teleports (#3030), portals to a player: a body inside an on one's
 * entry stands at its exit on the same tick, and then takes no teleport
 * for `TELEPORT_COOLDOWN_SECONDS`, so it cannot bounce between two. One
 * way. A switch that names one turns it on and off as it does a gate.
 *
 * Pure: the simulation says who stands where; this decides who goes.
 */

/** Seconds after a teleport before the same body takes any again. */
export const TELEPORT_COOLDOWN_SECONDS = 5;

/** A teleport as the map lays it out. */
export interface TeleportField {
  readonly id: string;
  /** Its entry: a body inside `area` on `layer` goes. */
  readonly from: { readonly layer: number; readonly area: Polygon };
  /** Where it goes. */
  readonly to: { readonly layer: number; readonly position: Vec2 };
  /** Whether it is on as the match starts. */
  readonly enabled: boolean;
}

/** One teleport as it stands. */
export interface TeleportState {
  readonly on: boolean;
}

/** A teleport on the map, and how it stands. */
export interface Teleport extends TeleportField, TeleportState {}

/** Every teleport starts as its map says: on, or off until a switch turns it on. */
export function initialTeleports(fields: readonly TeleportField[]): Teleport[] {
  return fields.map((field) => ({ ...field, on: field.enabled }));
}

/** `teleport` turned on or off if `flipped`, and otherwise as it was. */
export function stepTeleport(teleport: Teleport, flipped: boolean): Teleport {
  return flipped ? { ...teleport, on: !teleport.on } : teleport;
}

/**
 * The teleport a body at `position` on `layer` takes at match second
 * `now`, if it may port again from `readyAt`: the first on one whose
 * entry it stands in. `undefined` for none.
 */
export function teleportTaken(
  teleports: readonly Teleport[],
  position: Vec2,
  layer: number,
  readyAt: number,
  now: number,
): Teleport | undefined {
  if (now < readyAt) {
    return undefined;
  }
  return teleports.find(
    (teleport) =>
      teleport.on && teleport.from.layer === layer && pointInPolygon(position, teleport.from.area),
  );
}
