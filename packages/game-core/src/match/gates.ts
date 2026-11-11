import { add, distance, normalize, scale, sub, type Vec2 } from "../vec2.js";
import { firstHit, type Segment } from "../geometry.js";
import type { Projectile } from "../skills/projectile.js";

/**
 * Gates (#2691): a wall with a pressure plate. A player standing on the
 * plate holds the gate open; it closes when the last one steps off, and
 * then cannot open again for `GATE_REOPEN_SECONDS`. A switch's gate
 * (#3025) has no plate: it stays as its last flip left it.
 *
 * Pure: the simulation says who stands on each plate; this decides how
 * the gate stands, and what a closing one does to a shot in flight.
 */

/** Seconds after a gate closes before its plate opens it again. */
export const GATE_REOPEN_SECONDS = 8;

/** How near a player stands to a plate to count on it. */
export const GATE_PLATE_REACH_UNITS = 30;

/** What opens a gate: a plate held, or a switch flipped (#3025). */
export type GateOpener =
  | {
      readonly kind: "plate";
      readonly plate: Vec2;
      /** The team whose players its plate answers to; `null` for anyone's. */
      readonly team: number | null;
    }
  | { readonly kind: "switch" };

/** A gate as the map lays it out. */
export interface GateField {
  /** The wall it is while closed. */
  readonly segments: readonly Segment[];
  /** The layer it stands on (ADR-0051). Omitted: the ground. */
  readonly layer?: number;
  readonly opener: GateOpener;
  /**
   * What it stops while closed (#3031): `all`, a stone gate; or
   * `bodies-and-shots`, an energy barrier, which sight passes, and so
   * a spell that needs no shot.
   */
  readonly blocks: GateBlocks;
}

/** What a closed gate stops (#3031). */
export type GateBlocks = "all" | "bodies-and-shots";

/** One gate as it stands. */
export interface GateState {
  readonly open: boolean;
  /** Seconds until its plate opens it again; 0 while open or ready. */
  readonly reopenSeconds: number;
}

/** A gate on the map, and how it stands. */
export interface Gate extends GateField, GateState {}

/** Every gate starts closed and ready to open. */
export function initialGates(fields: readonly GateField[]): Gate[] {
  return fields.map((field) => ({ ...field, open: false, reopenSeconds: 0 }));
}

/** Whether a player of `team` at `position` holds down `gate`'s plate; never a switch's gate. */
export function holdsPlate(gate: GateField, team: number, position: Vec2): boolean {
  const opener = gate.opener;
  return (
    opener.kind === "plate" &&
    (opener.team === null || opener.team === team) &&
    distance(opener.plate, position) <= GATE_PLATE_REACH_UNITS
  );
}

/**
 * `gate`, `dt` seconds on, with its plate `held` or not; a switch's
 * gate toggled if `flipped`, and otherwise as it was.
 */
export function stepGate(gate: Gate, held: boolean, flipped: boolean, dt: number): Gate {
  if (gate.opener.kind === "switch") {
    return flipped ? { ...gate, open: !gate.open } : gate;
  }
  if (gate.open) {
    return held ? gate : { ...gate, open: false, reopenSeconds: GATE_REOPEN_SECONDS };
  }
  const reopenSeconds = Math.max(0, gate.reopenSeconds - dt);
  if (held && reopenSeconds === 0) {
    return { ...gate, open: true, reopenSeconds: 0 };
  }
  return reopenSeconds === gate.reopenSeconds ? gate : { ...gate, reopenSeconds };
}

/**
 * `shot`, stopped by `gate` if the rest of its flight crosses it: like a
 * shot released at a wall (#215), it lands `obstructed`, a unit short.
 */
export function cutShotAtGate(shot: Projectile, gate: GateField): Projectile {
  const at = shot.flightSeconds === 0 ? 1 : shot.elapsed / shot.flightSeconds;
  const now = add(shot.from, scale(sub(shot.aimPoint, shot.from), at));
  const impact = firstHit(now, shot.aimPoint, gate.segments);
  if (impact === undefined) {
    return shot;
  }
  const aimPoint =
    distance(now, impact) <= 1 ? now : add(impact, scale(normalize(sub(now, impact)), 1));
  return {
    ...shot,
    aimPoint,
    obstructed: true,
    flightSeconds: Math.max(shot.elapsed, distance(shot.from, aimPoint) / shot.speed),
  };
}
