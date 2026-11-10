import { AREA_ADJACENT } from "../distances.js";
import type { ActivationCheck } from "../skills/activation.js";
import type { Projectile } from "../skills/projectile.js";
import type { StatusId } from "../skills/status.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import { distance, normalize, sub, ZERO, type Vec2 } from "../vec2.js";
import { guard, playBuild } from "./bot/play-build.js";
import type { CapturePoint } from "./capture-points.js";
import { atObjective } from "./layer-rules.js";
import type { Gate } from "./gates.js";
import type { CarriedSpawn } from "./carried.js";
import { MASTERLESS_TEAM } from "./minions.js";
import type { RelicCarry, RelicState } from "./relics.js";
import type { MatchZone } from "./zones.js";
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

/** A `play-build` bot's reaction time (#2606), in seconds: `[minSeconds, maxSeconds)`. */
export interface Reaction {
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

/** A match bot's (#2542 item 7): a human-like moment to react, not the same tick. */
export const BOT_REACTION: Reaction = { minSeconds: 0.15, maxSeconds: 0.4 };

/** Every tick: a test bot that reacts at once. */
export const INSTANT_REACTION: Reaction = { minSeconds: 0, maxSeconds: 0 };

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
   * another nearer. With a `reach`, a spirit's (#1239): only a target
   * within it, and it never walks; the simulation ends an attack on one
   * that leaves it. `undefined`: any, walked to.
   */
  | {
      readonly kind: "auto-attack";
      readonly targeting: Targeting;
      readonly reach: number | undefined;
    }
  /**
   * A minion's (#467 child 3) or a pet's (#1046): stay by the owner, attack
   * a foe as `engage` picks it, and break off to walk back once the
   * owner is farther than `leashUnits`, until within `heelUnits` again.
   * The owner is its creature's `leaderId` (#1377), else its `ownerId`; anyone
   * else holding it stands still.
   */
  | {
      readonly kind: "follow-and-attack";
      /**
       * A point it walks onto in place of its leader's heel while the
       * leader stands within `withinUnits` of it: a Ghostly Hero led to
       * the altar steps onto it (#1377). Within `holdUnits` of the point
       * it holds its ground: it attacks its leader's foe, else the nearest
       * foe, only while one is adjacent to it, and never steps off after
       * one. `undefined`: none, as a minion's.
       */
      readonly drawnTo:
        | {
            readonly point: Vec2;
            readonly layer: number;
            readonly withinUnits: number;
            readonly holdUnits: number;
          }
        | undefined;
      /**
       * Whom it goes for (#1046). `"owner-target"`: a companion's, the foe
       * its owner is attacking or, on Fight, has selected (#1110), if within
       * `aggroUnits` of itself; on Heel, none.
       * `"owner-target-then-nearest"`: a minion's (#1118), with no fight
       * going, the foe its owner is attacking, if within `leashUnits` of
       * the owner, else the nearest foe within `aggroUnits` of itself.
       */
      readonly engage: "owner-target" | "owner-target-then-nearest";
      /**
       * Skills it uses on the foe it attacks, the first that may be used
       * now: a Ghostly Hero's axe skills (#2689). None, a minion's or a
       * pet's.
       */
      readonly skillIds: readonly string[];
      readonly aggroUnits: number;
      readonly leashUnits: number;
      readonly heelUnits: number;
    }
  /**
   * A priest's (#1186): stand still and cast `skillId` on itself whenever
   * it, or a living ally adjacent to it, is below full Health and the
   * skill may be cast. Nobody hurt, nothing cast, so energy keeps.
   */
  | { readonly kind: "heal-when-hurt"; readonly skillId: string }
  /**
   * A bot playing its own skill bar (#1189), as `bot/play-build.ts` says:
   * interrupt, heal, cleanse, raise, then fight the team target.
   */
  | {
      readonly kind: "play-build";
      /**
       * How long it holds each decision before the next (#2606): drawn per
       * decision from `[minSeconds, maxSeconds)`. Both `0`: every tick.
       */
      readonly reaction: Reaction;
      /**
       * Whether its damage dealers hold their spike skills for the team's
       * (#2631). `false`: each fires the moment it can, the bots the spike
       * is measured against. Unset: they hold.
       */
      readonly spikeHold?: boolean;
    }
  /**
   * A guard's (#1222): hold `post`, and play its bar as `play-build` does
   * against the foes within `aggroUnits` of it, at its own pick of them.
   * Past `leashUnits` from `post`, it walks back and ignores foes until
   * home again. `rooted`: it never moves, as a Guild Lord.
   */
  | {
      readonly kind: "guard";
      readonly post: Vec2;
      readonly aggroUnits: number;
      readonly leashUnits: number;
      readonly rooted: boolean;
      /** Seconds between decisions, as `play-build`'s. */
      readonly thinkSeconds: number;
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
  /** The layer `moveTo` is on, an objective's (ADR-0051); omitted: the walker's leader's or its own. */
  readonly moveToLayer?: number | undefined;
  readonly targetId: string | undefined;
  readonly useSkillId: string | undefined;
  /** Whom to attack with the weapon, through `requestAttack`. */
  readonly attackTargetId: string | undefined;
  readonly applyStatuses: readonly StatusApplication[];
  /**
   * A maintained enchantment of its own to end (#2492), as a player's
   * `end-upkeep` does; `undefined` for none.
   */
  readonly endUpkeep: { readonly targetId: string; readonly status: StatusId } | undefined;
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
  /** `follow-and-attack` and `guard`: walking back to the owner or the post, past the leash. */
  returning: boolean;
  /** `play-build` and `guard`: the movement its last think asked for, held until the next. */
  heldMove: Pick<BehaviourIntent, "moveDirection" | "moveTo" | "moveToLayer">;
  /** `play-build`: seconds before it may end another maintained enchantment (#2492). */
  upkeepDropSeconds: number;
  /** `play-build`, a healer: the ally it looks after, kept until another is clearly worse off (#2615). */
  wardId: string | undefined;
  /** `play-build`, a healer: the spot it walks to, kept until a fresh one is clearly elsewhere (#2615). */
  coverSpot: Vec2 | undefined;
  /** `play-build`: waiting, ahead of its team, for the rest to catch up (#2621). */
  regrouping: boolean;
  /** `play-build`, foes of two teams or more: the team it fights, kept while that team still fights (#2685). */
  front: number | undefined;
  /** `play-build`: the team target it holds its spike skills for (#2631), `undefined` while it holds none. */
  spikeTargetId: string | undefined;
  /** `play-build`: how long it has held them for `spikeTargetId` (#2631). */
  spikeHeldSeconds: number;
  /** `play-build`: how long its team's spike at `spikeTargetId` has been ready, `undefined` while it is not (#2631). */
  spikeReadySeconds: number | undefined;
  /** `play-build` and `guard`: how many decisions it has made, the seed of its next reaction time (#2606). */
  thinks: number;
  /** `play-build`: each foe's reach, read once from its bar (#2598). */
  readonly foeReach: Map<string, number>;
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
   * Whether `self` may cast `skillId` at `targetId` right now, and why not:
   * the same `canActivate` check `requestSkill` makes, asked without casting.
   */
  check(skillId: string, targetId: string | undefined): ActivationCheck;
  /** Whether `participantId` is driven by `play-build` (#1189): a bot. */
  isBot(participantId: string): boolean;
  /** The foe `self`'s team called (#443), if any: a bot's target while it lives (#1193). */
  readonly calledTargetId: string | undefined;
  /** Whether nothing blocks the line of sight from `self` to `point` (#1222). */
  sees(point: Vec2, layer?: number): boolean;
  /** Whether nothing blocks the line of sight from `from` to `to`, each on its layer (#2545, ADR-0051). */
  seesBetween(from: Vec2, to: Vec2, fromLayer: number, toLayer: number): boolean;
  /** Whether `self` could walk straight to `point` and stand there (#2545). */
  walkable(point: Vec2): boolean;
  /** Where the living players of every other team stand on average (#2545). */
  readonly foeCentroid: Vec2 | undefined;
  /** What a bot plays for besides the foes (#2542). */
  readonly objectives: BotObjectives;
  /** The shots in flight (#2590), in release order. */
  readonly projectiles: readonly Readonly<Projectile>[];
  /** The match's seed as a number, mixed into a bot's rolls (#2624). */
  readonly seed: number;
}

/**
 * The match's objectives as bots read them (#2542): a view of the
 * simulation's own state, built once per tick. A mode without one has it
 * empty.
 */
export interface BotObjectives {
  /** Capture Points' shrines (#2580), in map order; `[]` in any other mode. */
  readonly capturePoints: readonly CapturePoint[];
  /** Relic Run's relics (#2581), wherever they are; `[]` in any other mode. */
  readonly relics: readonly RelicState[];
  /** Where each team's relic lies at rest (#2581); `[]` in any other mode. */
  readonly relicSpawns: readonly CarriedSpawn[];
  /** Whose relic a team carries (#2695); `"own"` in any other mode. */
  readonly relicCarry: RelicCarry;
  /**
   * The altar relics are run to (#2581) or Ghostly Heroes claim (#2582);
   * `undefined` in any other mode.
   */
  readonly altar: Vec2 | undefined;
  /** The layer `altar` is on (ADR-0051); 0 in any other mode. */
  readonly altarLayer: number;
  /** The team holding King of the Hill's altar (#2582); `null` when nobody does, or in any other mode. */
  readonly altarHolder: number | null;
  /** The map's gates (#2691), kept current; `[]` on a map without any. */
  readonly gates: readonly Gate[];
  /** The map's harmful ground (#3026), which a bot steps out of; `[]` on a map without any. */
  readonly harmfulZones: readonly MatchZone[];
}

/** No objectives: every mode but those with one. */
export const NO_OBJECTIVES: BotObjectives = {
  capturePoints: [],
  relics: [],
  relicSpawns: [],
  relicCarry: "own",
  altar: undefined,
  altarLayer: 0,
  altarHolder: null,
  gates: [],
  harmfulZones: [],
};

export function createCursor(): BehaviourCursor {
  return {
    nextSkill: 0,
    waitSeconds: 0,
    waypoint: 0,
    children: [],
    returning: false,
    heldMove: { moveDirection: ZERO, moveTo: undefined },
    upkeepDropSeconds: 0,
    wardId: undefined,
    coverSpot: undefined,
    regrouping: false,
    front: undefined,
    spikeTargetId: undefined,
    spikeHeldSeconds: 0,
    spikeReadySeconds: undefined,
    thinks: 0,
    foeReach: new Map(),
  };
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

/**
 * Who `targeting` picks, among those `eligible` lets through: a nearest
 * pick takes the nearest eligible, and a self or fixed one is eligible or
 * nobody.
 */
export function resolveTargeting(
  targeting: Targeting,
  context: BehaviourContext,
  eligible: (other: Participant) => boolean = () => true,
): string | undefined {
  const team = context.self.combatant.team;
  switch (targeting.kind) {
    case "nearest-enemy":
      return nearestLiving(
        context.self,
        context.participants,
        (other) => other.combatant.team !== team && eligible(other),
      );
    case "nearest-ally":
      return nearestLiving(
        context.self,
        context.participants,
        (other) => other.combatant.team === team && eligible(other),
      );
    case "self":
      return eligible(context.self) ? context.self.id : undefined;
    case "fixed": {
      const fixed = context.participants.find((other) => other.id === targeting.participantId);
      return fixed === undefined || eligible(fixed) ? targeting.participantId : undefined;
    }
  }
}

const STAND_STILL: BehaviourIntent = {
  moveDirection: ZERO,
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
  applyStatuses: [],
  endUpkeep: undefined,
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
      // A spirit's pick is the nearest it can shoot: in reach and in sight.
      const { reach } = behaviour;
      const targetId = resolveTargeting(
        behaviour.targeting,
        context,
        reach === undefined
          ? undefined
          : (other) =>
              distance(other.position, context.self.position) <= reach &&
              context.sees(other.position, other.layer),
      );
      return {
        ...STAND_STILL,
        targetId,
        attackTargetId: context.self.combatant.attack?.targetId ?? targetId,
      };
    }
    case "follow-and-attack":
      return withSkill(
        behaviour.skillIds,
        followAndAttack(behaviour, cursor, context),
        cursor,
        context,
      );
    case "heal-when-hurt":
      return healWhenHurt(behaviour, context);
    case "play-build":
      return playBuild(behaviour, cursor, context);
    case "guard":
      return guard(behaviour, cursor, context);
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
    useSkillId = behaviour.skillIds.find((skillId) => context.check(skillId, targetId).ok);
  } else {
    const next = behaviour.skillIds[cursor.nextSkill % behaviour.skillIds.length];
    if (next !== undefined && context.check(next, targetId).ok) {
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

function healWhenHurt(
  behaviour: Extract<Behaviour, { kind: "heal-when-hurt" }>,
  context: BehaviourContext,
): BehaviourIntent {
  const { self } = context;
  const hurt = context.participants.some(
    (other) =>
      !other.combatant.dead &&
      other.combatant.team === self.combatant.team &&
      (other.id === self.id || distance(other.position, self.position) <= AREA_ADJACENT) &&
      other.combatant.health < effectiveMaxHealth(other.combatant),
  );
  const waiting = { ...STAND_STILL, targetId: self.id };
  return hurt && !self.combatant.cast.isCasting && context.check(behaviour.skillId, self.id).ok
    ? { ...waiting, useSkillId: behaviour.skillId }
    : waiting;
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
 * Otherwise it walks to heel, stopping a step early. A masterless minion
 * (#2092) has no heel: it fights on, else goes for the nearest living
 * body in its aggro, whoever's.
 */
function followAndAttack(
  behaviour: Extract<Behaviour, { kind: "follow-and-attack" }>,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const self = context.self;
  if (self.combatant.team === MASTERLESS_TEAM) {
    return masterless(behaviour, context);
  }
  const ownerId = self.creature?.leaderId ?? self.creature?.ownerId;
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
  const drawnTo = behaviour.drawnTo;
  if (
    drawnTo !== undefined &&
    atObjective(drawnTo.point, drawnTo.layer, owner, drawnTo.withinUnits)
  ) {
    const toPoint = distance(drawnTo.point, self.position);
    const there = atObjective(drawnTo.point, drawnTo.layer, self, drawnTo.holdUnits);
    if (there) {
      // Adjacent, so the swing needs no step: a foe that backs off is let
      // go, and the walk back to the point ends the attack.
      const adjacent = (other: Participant): boolean =>
        other.combatant.team !== team && distance(other.position, self.position) <= AREA_ADJACENT;
      const foe =
        ownerFoe !== undefined && adjacent(ownerFoe)
          ? ownerFoe.id
          : nearestLiving(self, context.participants, adjacent);
      if (foe !== undefined) {
        return { ...STAND_STILL, targetId: foe, attackTargetId: foe };
      }
    }
    return toPoint > context.stepUnits || !there
      ? { ...STAND_STILL, moveTo: drawnTo.point, moveToLayer: drawnTo.layer }
      : STAND_STILL;
  }
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

/** How often a follower with skills looks for one to use (#2689): a guard's think. */
const FOLLOWER_SKILL_SECONDS = 0.25;

/**
 * `intent`, using the first of `skillIds` that may be used on the foe it
 * attacks (#2689), looked for every `FOLLOWER_SKILL_SECONDS`.
 */
function withSkill(
  skillIds: readonly string[],
  intent: BehaviourIntent,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  const foeId = intent.attackTargetId;
  const { cast } = context.self.combatant;
  if (
    skillIds.length === 0 ||
    foeId === undefined ||
    cursor.waitSeconds > 0 ||
    cast.isCasting ||
    cast.inAftercast
  ) {
    return intent;
  }
  cursor.waitSeconds = FOLLOWER_SKILL_SECONDS;
  const useSkillId = skillIds.find((skillId) => context.check(skillId, foeId).ok);
  return useSkillId === undefined ? intent : { ...intent, useSkillId };
}

/**
 * A masterless minion's fight (#2092): the one it is in, else the nearest
 * body in aggro. Another masterless one shares its team, so is spared.
 */
function masterless(
  behaviour: Extract<Behaviour, { kind: "follow-and-attack" }>,
  context: BehaviourContext,
): BehaviourIntent {
  const self = context.self;
  const fighting = self.combatant.attack?.targetId;
  const foe =
    context.participants.find((other) => other.id === fighting && !other.combatant.dead)?.id ??
    nearestLiving(
      self,
      context.participants,
      (other) =>
        other.combatant.team !== MASTERLESS_TEAM &&
        distance(other.position, self.position) <= behaviour.aggroUnits,
    );
  return foe === undefined ? STAND_STILL : { ...STAND_STILL, targetId: foe, attackTargetId: foe };
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
 * applied, and the first maintained enchantment one ends. A body that
 * is casting stands still, or a child's walking would cancel its cast.
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
  const moves = !context.self.combatant.cast.isCasting;
  return {
    moveDirection: moves ? (steering?.moveDirection ?? ZERO) : ZERO,
    moveTo: moves ? steering?.moveTo : undefined,
    targetId: (casting ?? intents.find((intent) => intent.targetId !== undefined))?.targetId,
    useSkillId: casting?.useSkillId,
    attackTargetId: intents.find((intent) => intent.attackTargetId !== undefined)?.attackTargetId,
    applyStatuses: intents.flatMap((intent) => intent.applyStatuses),
    endUpkeep: intents.find((intent) => intent.endUpkeep !== undefined)?.endUpkeep,
  };
}
