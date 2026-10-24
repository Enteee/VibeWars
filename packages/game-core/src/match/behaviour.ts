import { ZERO, type Vec2 } from "../vec2.js";
import type { Participant } from "./simulation.js";

/**
 * Behaviours: what a participant nobody is driving does, as data (ADR-0017).
 *
 * A behaviour only ever *asks*. `decide` returns an intent, and the
 * simulation puts that intent through exactly the path a player's
 * messages take: `setTarget`, then `requestSkill`, which is
 * `canActivate` → `payCost` → `beginCast`. No behaviour can bypass a rule,
 * which is what makes a fight against one an honest measurement.
 *
 * Only `idle` and `cast-loop` exist yet; the rest arrive with the training
 * dummies that need them (#4).
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
    };

/** What a behaviour *asks* for. Never what happens. */
export interface BehaviourIntent {
  readonly moveDirection: Vec2;
  readonly targetId: string | undefined;
  readonly useSkillId: string | undefined;
}

/** A behaviour's own memory between ticks. One per participant. */
export interface BehaviourCursor {
  /** `cast-loop` without `firstLegal`: index of the next skill to cast. */
  nextSkill: number;
  /** Seconds left before the next cast may be attempted. */
  waitSeconds: number;
}

export interface BehaviourContext {
  readonly self: Participant;
  /** Everyone, in the simulation's order, the living and the dead. */
  readonly participants: readonly Participant[];
  readonly dt: number;
  /**
   * Whether `self` may cast `skillId` at `targetId` right now. The same
   * `canActivate` check `requestSkill` makes, asked without casting.
   */
  canUse(skillId: string, targetId: string | undefined): boolean;
}

export function createCursor(): BehaviourCursor {
  return { nextSkill: 0, waitSeconds: 0 };
}

/**
 * The nearest living participant `accept` lets through. Ties go to the
 * first in simulation order, so the choice is deterministic.
 */
function nearest(
  context: BehaviourContext,
  accept: (other: Participant) => boolean,
): string | undefined {
  const from = context.self.position;
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of context.participants) {
    if (other.id === context.self.id || other.combatant.dead || !accept(other)) {
      continue;
    }
    const d = Math.hypot(other.position.x - from.x, other.position.y - from.y);
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
      return nearest(context, (other) => other.combatant.team !== team);
    case "nearest-ally":
      return nearest(context, (other) => other.combatant.team === team);
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
  }
}

function castLoop(
  behaviour: Extract<Behaviour, { kind: "cast-loop" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const targetId = resolveTargeting(behaviour.targeting, context);
  const waiting = { moveDirection: ZERO, targetId, useSkillId: undefined };

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
  return { moveDirection: ZERO, targetId, useSkillId };
}
