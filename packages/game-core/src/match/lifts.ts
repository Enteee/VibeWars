import { polygonSides, type Polygon, type Segment } from "../geometry.js";

/**
 * Lifts (#3079): a platform that carries whoever stands on it between a
 * transition's two layers. It rests at the bottom, travels up, rests at
 * the top and travels down. Resting, its area is walked on its resting
 * layer only; travelling, it is closed on both, so nobody gets on or
 * off, and on arrival whoever rode it is on the layer it arrived at.
 *
 * A `timer` lift's phase is read off the match clock, the same on every
 * simulation; a `lever` lift travels to the other layer each time a
 * switch naming it is flipped while it rests, at `LEVER_LIFT_TRAVEL_SECONDS`.
 *
 * Pure: the simulation counts the flips and moves the riders; this decides
 * where the platform is.
 */

/** How long a lever lift takes between its layers, in seconds. */
export const LEVER_LIFT_TRAVEL_SECONDS = 2;

/** How a lift runs: by the clock, or by a lever. */
export type LiftRun =
  | { readonly kind: "timer"; readonly restSeconds: number; readonly travelSeconds: number }
  | { readonly kind: "lever" };

/** Where a lift is: resting at a layer, or on its way to one. */
export type LiftPhase = "low" | "rising" | "high" | "sinking";

/** A lift as the map lays it out. */
export interface LiftField {
  readonly id: string;
  /** Its index in the match's transitions (`MatchLayers.transitions`). */
  readonly transition: number;
  /** Its bottom layer, and its top, one above. */
  readonly from: number;
  readonly to: number;
  readonly area: Polygon;
  readonly run: LiftRun;
}

/** One lift as it stands. */
export interface LiftState {
  readonly phase: LiftPhase;
  /** How high its platform is, from 0 at its bottom layer to 1 at its top. */
  readonly progress: number;
}

/** A lift on the map, and where it is. */
export interface Lift extends LiftField, LiftState {}

/** Whether `phase` is a lift on its way. */
export function travelling(phase: LiftPhase): boolean {
  return phase === "rising" || phase === "sinking";
}

/** The layer a lift resting in `phase` is walked on, or `null` while it travels. */
export function restingLayer(lift: LiftField & LiftState): number | null {
  return lift.phase === "low" ? lift.from : lift.phase === "high" ? lift.to : null;
}

/**
 * Whether a route may cross `lift`: a timer lift always comes round, so a
 * walk over it waits for it; a lever lift only while it rests.
 */
export function routesOver(lift: Lift): boolean {
  return lift.run.kind === "timer" || !travelling(lift.phase);
}

/** Whether `lift` will move with nobody at its lever: a timer lift, or a lever lift on its way. */
export function comesRound(lift: Lift): boolean {
  return lift.run.kind === "timer" || travelling(lift.phase);
}

/** Every lift as the map starts it: at rest at its bottom. */
export function initialLifts(fields: readonly LiftField[]): Lift[] {
  return fields.map((field) => ({ ...field, phase: "low", progress: 0 }));
}

/**
 * A timer lift's state `elapsedSeconds` into the match: rest low, rise,
 * rest high, sink, over and over.
 */
export function timerLiftAt(
  restSeconds: number,
  travelSeconds: number,
  elapsedSeconds: number,
): LiftState {
  const cycle = 2 * (restSeconds + travelSeconds);
  const t = ((elapsedSeconds % cycle) + cycle) % cycle;
  if (t < restSeconds) {
    return { phase: "low", progress: 0 };
  }
  if (t < restSeconds + travelSeconds) {
    return { phase: "rising", progress: (t - restSeconds) / travelSeconds };
  }
  if (t < 2 * restSeconds + travelSeconds) {
    return { phase: "high", progress: 1 };
  }
  return { phase: "sinking", progress: 1 - (t - 2 * restSeconds - travelSeconds) / travelSeconds };
}

/**
 * `lift` one step of `dt` on, `elapsedSeconds` into the match: a timer
 * lift as the clock has it; a lever lift sent off if `flipped` while it
 * rests (a flip while it travels does nothing), and moved on its way.
 */
export function stepLift(lift: Lift, flipped: boolean, dt: number, elapsedSeconds: number): Lift {
  const { run } = lift;
  if (run.kind === "timer") {
    const next = timerLiftAt(run.restSeconds, run.travelSeconds, elapsedSeconds);
    return next.phase === lift.phase && next.progress === lift.progress
      ? lift
      : { ...lift, ...next };
  }
  const phase =
    flipped && lift.phase === "low"
      ? "rising"
      : flipped && lift.phase === "high"
        ? "sinking"
        : lift.phase;
  if (!travelling(phase)) {
    return phase === lift.phase ? lift : { ...lift, phase };
  }
  const step = dt / LEVER_LIFT_TRAVEL_SECONDS;
  const progress =
    phase === "rising" ? Math.min(1, lift.progress + step) : Math.max(0, lift.progress - step);
  const arrived = phase === "rising" ? progress === 1 : progress === 0;
  return { ...lift, phase: arrived ? (phase === "rising" ? "high" : "low") : phase, progress };
}

/** The wall `lift`'s area is on a layer it is closed on: every side of it. */
export function liftSegments(lift: LiftField): Segment[] {
  return polygonSides(lift.area);
}

/** Whether `lift` is closed to bodies on `layer`: travelling, or resting at its other layer. */
export function liftClosedOn(lift: Lift, layer: number): boolean {
  const resting = restingLayer(lift);
  return (layer === lift.from || layer === lift.to) && resting !== layer;
}
