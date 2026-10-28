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
  | { readonly kind: "parallel"; readonly behaviours: readonly Behaviour[] }
  /**
   * Attack the target with the weapon, as Space does (#162), and ask again
   * whenever no attack is going: after the target's respawn, or the
   * dummy's own reset. An attack going on stays on its target, even with
   * another nearer.
   */
  | { readonly kind: "auto-attack"; readonly targeting: Targeting }
  /**
   * A minion's (#467 child 3) or a pet's (#1046): stay by the owner, attack
   * a foe as `engage` picks it, and break off to walk back once the
   * owner is farther than `leashUnits`, until within `heelUnits` again.
   * The owner is `self.creature.ownerId`; anyone else holding it stands still.
   */
  | {
      readonly kind: "follow-and-attack";
      /**
       * Whom it goes for (#1046). `"owner-target"`: a companion's, the foe
       * its owner is attacking or, on Fight, has selected (#1110), if within
       * `aggroUnits` of itself; on Heel, none.
       * `"owner-target-then-nearest"`: a minion's (#1118), with no fight
       * going, the foe its owner is attacking, if within `leashUnits` of
       * the owner, else the nearest foe within `aggroUnits` of itself.
       */
      readonly engage: "owner-target" | "owner-target-then-nearest";
      readonly aggroUnits: number;
      readonly leashUnits: number;
      readonly heelUnits: number;
    };

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
  /**
   * A point to walk to round walls and bodies, as a click-to-walk goes
   * (#1153); `undefined` for none. The simulation owns the path.
   */
  readonly moveTo: Vec2 | undefined;
  readonly targetId: string | undefined;
  readonly useSkillId: string | undefined;
  /** Whom to attack with the weapon, through `requestAttack`. */
  readonly attackTargetId: string | undefined;
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
  /** `follow-and-attack`: walking back to the owner, past the leash. */
  returning: boolean;
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
  return { nextSkill: 0, waitSeconds: 0, waypoint: 0, children: [], returning: false };
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
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
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
    case "auto-attack": {
      const targetId = resolveTargeting(behaviour.targeting, context);
      return {
        ...STAND_STILL,
        targetId,
        attackTargetId: context.self.combatant.attack?.targetId ?? targetId,
      };
    }
    case "follow-and-attack":
      return followAndAttack(behaviour, cursor, context);
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

/**
 * The owner's body, alive or dead, is what a minion keeps to. Past the
 * leash it walks back and fights nobody until at heel again, so it does
 * not flip each tick at the boundary. A pet on Guard goes for whatever its
 * living owner is attacking, within its aggro, switching when the owner
 * does (#1046); on Fight, for whatever foe its owner has selected; on Heel
 * it fights nobody and keeps to heel (#1110). Otherwise a fight it is in
 * goes on, to the foe's death. A minion with none assists (#1118): its
 * living owner's attack target within the leash of the owner, else a foe
 * in aggro of the minion itself, through `requestAttack` as Space does.
 * Otherwise it walks to heel, stopping a step early.
 */
function followAndAttack(
  behaviour: Extract<Behaviour, { kind: "follow-and-attack" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const self = context.self;
  const ownerId = self.creature?.ownerId;
  const owner = context.participants.find((other) => other.id === ownerId);
  if (owner === undefined) {
    return STAND_STILL;
  }
  const d = distance(owner.position, self.position);
  if (cursor.returning && d <= behaviour.heelUnits) {
    cursor.returning = false;
  } else if (!cursor.returning && d > behaviour.leashUnits) {
    cursor.returning = true;
  }
  // By path, not straight: a wall between them is walked round (#1153).
  const toOwner = { ...STAND_STILL, moveTo: owner.position };
  if (cursor.returning) {
    return toOwner;
  }
  const team = self.combatant.team;
  const inAggro = (other: Participant): boolean =>
    other.combatant.team !== team &&
    distance(other.position, self.position) <= behaviour.aggroUnits;
  const livingFoe = (id: string | undefined): Participant | undefined =>
    owner.combatant.dead
      ? undefined
      : context.participants.find(
          (other) => other.id === id && other.combatant.team !== team && !other.combatant.dead,
        );
  // A spell at a foe is not attacking it: only a weapon attack or an
  // attack skill sets `attack` (#1079).
  const ownerFoe = livingFoe(owner.combatant.attack?.targetId);
  const mode = self.creature?.mode;
  if (behaviour.engage === "owner-target" && mode === "heel") {
    return d > behaviour.heelUnits && d - context.stepUnits > behaviour.heelUnits
      ? toOwner
      : STAND_STILL;
  }
  if (behaviour.engage === "owner-target") {
    // Guard goes for what its owner attacks, Fight for what its owner
    // has selected, attacking or not (#1110).
    const foe = mode === "fight" ? livingFoe(owner.targetId) : ownerFoe;
    if (foe !== undefined && inAggro(foe)) {
      return { ...STAND_STILL, targetId: foe.id, attackTargetId: foe.id };
    }
  }
  const attack = self.combatant.attack;
  if (attack !== undefined) {
    return { ...STAND_STILL, targetId: attack.targetId, attackTargetId: attack.targetId };
  }
  if (behaviour.engage === "owner-target-then-nearest") {
    const assisted =
      ownerFoe !== undefined && distance(ownerFoe.position, owner.position) <= behaviour.leashUnits;
    const foe = assisted ? ownerFoe.id : nearestLiving(self, context.participants, inAggro);
    if (foe !== undefined) {
      return { ...STAND_STILL, targetId: foe, attackTargetId: foe };
    }
  }
  if (d > behaviour.heelUnits && d - context.stepUnits > behaviour.heelUnits) {
    return toOwner;
  }
  return STAND_STILL;
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
  const steering = intents.find(
    (intent) => intent.moveDirection !== ZERO || intent.moveTo !== undefined,
  );
  return {
    moveDirection: steering?.moveDirection ?? ZERO,
    moveTo: steering?.moveTo,
    targetId: (casting ?? intents.find((intent) => intent.targetId !== undefined))?.targetId,
    useSkillId: casting?.useSkillId,
    attackTargetId: intents.find((intent) => intent.attackTargetId !== undefined)?.attackTargetId,
    applyStatuses: intents.flatMap((intent) => intent.applyStatuses),
  };
}
