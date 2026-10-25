import type { StatusId } from "../skills/status.js";
import { distance, normalize, sub, ZERO, type Vec2 } from "../vec2.js";
import type { Participant } from "./simulation.js";

/**
 * Behaviours: what a participant nobody is driving does, as data (ADR-0017).
 *
 * A behaviour only ever *asks*. `decide` returns an intent, and the
 * simulation puts that intent through exactly the path a player's
 * messages take: `setInputDirection`, `setTarget`, then `requestSkill`,
 * which is `canActivate` → `payCost` → `beginCast`. No behaviour can
 * bypass a rule, which is what makes a fight against one an honest
 * measurement.
 *
 * The one intent with no player equivalent is `apply-status-cadence`: the
 * training ground's stand-in for "someone keeps hexing your ally". It
 * applies a status the way a skill effect does, with the dummy as its
 * source, so degeneration is attributed to it like any other.
 *
 * Only the kinds a training scenario uses exist (#2 Phase 5). There is
 * deliberately no `sequence`.
 */

export type Targeting =
  | { readonly kind: "nearest-enemy" }
  | { readonly kind: "nearest-ally" }
  | { readonly kind: "self" }
  | { readonly kind: "fixed"; readonly participantId: string };

export type Behaviour =
  | { readonly kind: "idle" }
  | {
      readonly kind: "cast-loop";
      readonly skillIds: readonly string[];
      readonly targeting: Targeting;
      /** Seconds to wait after starting a cast before trying the next. */
      readonly gapSeconds: number;
      /**
       * True: every time, the first skill in `skillIds` that may be cast
       * right now. False: `skillIds` in order, waiting on each until it
       * may be cast.
       */
      readonly firstLegal: boolean;
    }
  | {
      readonly kind: "patrol";
      readonly waypoints: readonly Vec2[];
      /** True: back to the first waypoint after the last. False: stop there. */
      readonly loop: boolean;
    }
  | {
      readonly kind: "chase";
      readonly targeting: Targeting;
      /** Stop once this close to the target. */
      readonly standOffUnits: number;
    }
  | {
      readonly kind: "keep-away";
      readonly targeting: Targeting;
      /** Back off while the target is closer than this. */
      readonly distanceUnits: number;
    }
  | {
      readonly kind: "apply-status-cadence";
      readonly statusId: StatusId;
      readonly durationSeconds: number;
      /** From one application to the next. The first is immediate. */
      readonly everySeconds: number;
      readonly targeting: Targeting;
    }
  | { readonly kind: "parallel"; readonly behaviours: readonly Behaviour[] };

/**
 * When a participant is put back as it started: the respawn path, at its
 * starting health. Omitted on a spec, it is `never`.
 */
export type ResetPolicy =
  | { readonly kind: "never" }
  | { readonly kind: "on-death"; readonly afterSeconds: number }
  | { readonly kind: "on-interval"; readonly everySeconds: number }
  | { readonly kind: "below-health"; readonly fraction: number };

/** A status a behaviour applies, with itself as the source. */
export interface StatusApplication {
  readonly statusId: StatusId;
  readonly durationSeconds: number;
  readonly targetId: string;
}

/** What a behaviour *asks* for. Never what happens. */
export interface BehaviourIntent {
  readonly moveDirection: Vec2;
  readonly targetId: string | undefined;
  readonly useSkillId: string | undefined;
  readonly applyStatuses: readonly StatusApplication[];
}

/** A behaviour's own memory between ticks. One per participant. */
export interface BehaviourCursor {
  /** `cast-loop` without `firstLegal`: index of the next skill to cast. */
  nextSkill: number;
  /** Seconds left before the next cast or status may be attempted. */
  waitSeconds: number;
  /** `patrol`: index of the waypoint being walked to. */
  waypoint: number;
  /** `parallel`: one cursor per child, in the same order. */
  readonly children: BehaviourCursor[];
}

export interface BehaviourContext {
  readonly self: Participant;
  /** Everyone, in the simulation's order, the living and the dead. */
  readonly participants: readonly Participant[];
  readonly dt: number;
  /**
   * How far one tick of movement carries `self`, slowed by its statuses.
   * Movement is always at that speed, so "arrived" means "within one step".
   */
  readonly stepUnits: number;
  /**
   * Whether `self` may cast `skillId` at `targetId` right now. The same
   * `canActivate` check `requestSkill` makes, asked without casting.
   */
  canUse(skillId: string, targetId: string | undefined): boolean;
}

export function createCursor(): BehaviourCursor {
  return { nextSkill: 0, waitSeconds: 0, waypoint: 0, children: [] };
}

/**
 * The nearest living participant other than `self` that `accept` lets
 * through. Ties go to the first in simulation order, so the choice is
 * deterministic. Behaviours target with it, and so does a player's
 * auto-target.
 */
export function nearestLiving(
  self: Participant,
  participants: Iterable<Participant>,
  accept: (other: Participant) => boolean,
): string | undefined {
  const from = self.position;
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of participants) {
    if (other.id === self.id || other.combatant.dead || !accept(other)) {
      continue;
    }
    const d = distance(other.position, from);
    if (d < bestDistance) {
      bestDistance = d;
      best = other.id;
    }
  }
  return best;
}

export function resolveTargeting(
  targeting: Targeting,
  context: BehaviourContext,
): string | undefined {
  const team = context.self.combatant.team;
  switch (targeting.kind) {
    case "nearest-enemy":
      return nearestLiving(
        context.self,
        context.participants,
        (other) => other.combatant.team !== team,
      );
    case "nearest-ally":
      return nearestLiving(
        context.self,
        context.participants,
        (other) => other.combatant.team === team,
      );
    case "self":
      return context.self.id;
    case "fixed":
      return targeting.participantId;
  }
}

const STAND_STILL: BehaviourIntent = {
  moveDirection: ZERO,
  targetId: undefined,
  useSkillId: undefined,
  applyStatuses: [],
};

export function decide(
  behaviour: Behaviour,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  switch (behaviour.kind) {
    case "idle":
      return STAND_STILL;
    case "cast-loop":
      return castLoop(behaviour, cursor, context);
    case "patrol":
      return patrol(behaviour, cursor, context);
    case "chase":
      return keepRange(behaviour.targeting, context, (d) => d > behaviour.standOffUnits, 1);
    case "keep-away":
      return keepRange(behaviour.targeting, context, (d) => d < behaviour.distanceUnits, -1);
    case "apply-status-cadence":
      return statusCadence(behaviour, cursor, context);
    case "parallel":
      return parallel(behaviour, cursor, context);
  }
}

function castLoop(
  behaviour: Extract<Behaviour, { kind: "cast-loop" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const targetId = resolveTargeting(behaviour.targeting, context);
  const waiting = { ...STAND_STILL, targetId };

  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  if (cursor.waitSeconds > 0 || context.self.combatant.cast.isCasting) {
    return waiting;
  }

  let useSkillId: string | undefined;
  if (behaviour.firstLegal) {
    useSkillId = behaviour.skillIds.find((skillId) => context.canUse(skillId, targetId));
  } else {
    const next = behaviour.skillIds[cursor.nextSkill % behaviour.skillIds.length];
    if (next !== undefined && context.canUse(next, targetId)) {
      useSkillId = next;
      cursor.nextSkill = (cursor.nextSkill + 1) % behaviour.skillIds.length;
    }
  }
  if (useSkillId === undefined) {
    return waiting;
  }
  cursor.waitSeconds = behaviour.gapSeconds;
  return { ...waiting, useSkillId };
}

function patrol(
  behaviour: Extract<Behaviour, { kind: "patrol" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const count = behaviour.waypoints.length;
  // Arriving at one waypoint turns toward the next in the same tick, so a
  // patrol never pauses at a corner.
  for (let tries = 0; tries < count; tries += 1) {
    const waypoint = behaviour.waypoints[cursor.waypoint];
    if (waypoint === undefined) {
      return STAND_STILL;
    }
    if (distance(waypoint, context.self.position) > context.stepUnits) {
      return { ...STAND_STILL, moveDirection: normalize(sub(waypoint, context.self.position)) };
    }
    cursor.waypoint += 1;
    if (cursor.waypoint >= count) {
      if (!behaviour.loop) {
        return STAND_STILL;
      }
      cursor.waypoint = 0;
    }
  }
  return STAND_STILL;
}

/**
 * Walk toward (`sign` 1) or away from (`sign` -1) the target while
 * `shouldMove` says so, and stop a step early rather than overshoot and
 * turn back the next tick.
 */
function keepRange(
  targeting: Targeting,
  context: BehaviourContext,
  shouldMove: (distanceUnits: number) => boolean,
  sign: 1 | -1,
): BehaviourIntent {
  const targetId = resolveTargeting(targeting, context);
  const target = context.participants.find((other) => other.id === targetId);
  if (target === undefined || target.combatant.dead || target.id === context.self.id) {
    return { ...STAND_STILL, targetId };
  }
  const here = context.self.position;
  const d = distance(target.position, here);
  const afterStep = d + -sign * context.stepUnits;
  if (!shouldMove(d) || !shouldMove(afterStep)) {
    return { ...STAND_STILL, targetId };
  }
  // On top of the target there is no "away": back off along +x, so the
  // choice is deterministic.
  const toward = d < 1e-9 ? { x: -1, y: 0 } : normalize(sub(target.position, here));
  return {
    ...STAND_STILL,
    targetId,
    moveDirection: { x: sign * toward.x, y: sign * toward.y },
  };
}

function statusCadence(
  behaviour: Extract<Behaviour, { kind: "apply-status-cadence" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  const targetId = resolveTargeting(behaviour.targeting, context);
  const target = context.participants.find((other) => other.id === targetId);
  if (cursor.waitSeconds > 0 || target === undefined || target.combatant.dead) {
    return STAND_STILL;
  }
  cursor.waitSeconds = behaviour.everySeconds;
  return {
    ...STAND_STILL,
    applyStatuses: [
      {
        statusId: behaviour.statusId,
        durationSeconds: behaviour.durationSeconds,
        targetId: target.id,
      },
    ],
  };
}

/**
 * Every child decides, each with its own cursor. The first child that
 * moves steers; the first that casts picks the skill and its target,
 * and otherwise the first that targets anything does. Every status is
 * applied.
 */
function parallel(
  behaviour: Extract<Behaviour, { kind: "parallel" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const intents = behaviour.behaviours.map((child, index) => {
    const childCursor = cursor.children[index] ?? createCursor();
    cursor.children[index] = childCursor;
    return decide(child, childCursor, context);
  });
  const casting = intents.find((intent) => intent.useSkillId !== undefined);
  return {
    moveDirection: intents.find((intent) => intent.moveDirection !== ZERO)?.moveDirection ?? ZERO,
    targetId: (casting ?? intents.find((intent) => intent.targetId !== undefined))?.targetId,
    useSkillId: casting?.useSkillId,
    applyStatuses: intents.flatMap((intent) => intent.applyStatuses),
  };
}
