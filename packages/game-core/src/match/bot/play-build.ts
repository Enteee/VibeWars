import { RANGE_SPELL } from "../../distances.js";
import type { Skill } from "../../skills/types.js";
import { distance, ZERO, type Vec2 } from "../../vec2.js";
import type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
} from "../behaviour.js";
import { isGhostId } from "../ghost.js";
import { ALTAR_REACH_UNITS } from "../relics.js";
import type { Participant } from "../simulation.js";
import { UPKEEP_DROP_SECONDS } from "./rules/drop-upkeep.js";
import { roleOf, type BotRole } from "./role.js";
import { BOT_RULES } from "./rules/index.js";
import regroup from "./rules/regroup.js";
import {
  FOCUS_REACH,
  HEALER_PRIORITY,
  HURT_FRACTION,
  NOTHING,
  foeReach,
  healthFraction,
  reactionSeconds,
  skillsOf,
} from "./rules/shared.js";
import type { RuleContext } from "./rules/types.js";
import { sacrificesTooMuch } from "./skill-intent.js";

/**
 * Below this share of its health a foe in reach is the team's target
 * (#2545): one about to fall is worth more than one at full health.
 */
const FINISH_FRACTION = 0.6;

/**
 * `play-build` (#1189): a participant playing its own skill bar the way a
 * sensible GW1 hero does. Each think it does what the first of
 * `rules/index.ts`'s `BOT_RULES` with an answer says, one file per rule:
 * interrupt, heal, step away, cleanse, raise, …, fight the team target,
 * and otherwise walk to the nearest foe. Between casts it takes the spot
 * its role gives it (#2545): a frontline closes in, a ranged bot holds
 * near the edge of its reach and steps away from a foe at its elbow, a
 * healer stands behind the ally it looks after.
 *
 * It reads only what a player reads off the screen: positions, teams,
 * health fractions, the statuses on a body, a foe's cast bar and its
 * swing. Never a foe's energy, recharges or bar. Its own state, in full.
 */

type PlayBuild = Extract<Behaviour, { kind: "play-build" }>;
type Guard = Extract<Behaviour, { kind: "guard" }>;

/**
 * A guard walking back acts again within this of its post (#1222), or
 * its leash if shorter: not at the leash's edge, so it does not flicker.
 */
const GUARD_HOME_UNITS = 30;

export function playBuild(
  behaviour: PlayBuild,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const hold = (thinks: number) =>
    reactionSeconds(behaviour.reaction, context.seed, context.self.id, thinks);
  return paced(hold, cursor, context, () => {
    const foes = livingFoes(context);
    const front = foeFront(context, foes);
    return think(
      context,
      cursor,
      foes,
      livingMembers(context),
      teamTarget(context, foes, front),
      roleOf(context.self),
      behaviour.spikeHold !== false,
      front === undefined ? context.foeCentroid : centroid(foes, front),
    );
  });
}

/**
 * `guard` (#1222): `play-build` against only the foes within `aggroUnits`
 * of its post, the weakest of them its target, never the team's. Past the
 * leash it walks back, dropping its target, until home again; with no foe
 * near and no ally to heal, it walks back too. Rooted, it never moves, and
 * fights only the foes it sees: it cannot walk round a wall to one. Its
 * allies are its team's bodies near its post, the map's NPCs among them
 * (#1223), its Guild Lord first, so a tie heals the lord.
 */
export function guard(
  behaviour: Guard,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const self = context.self;
  const home = distance(self.position, behaviour.post);
  if (cursor.returning && home <= Math.min(GUARD_HOME_UNITS, behaviour.leashUnits)) {
    cursor.returning = false;
  } else if (!cursor.returning && home > behaviour.leashUnits) {
    cursor.returning = true;
  }
  const foes = livingFoes(context).filter(
    (foe) =>
      distance(foe.position, behaviour.post) <= behaviour.aggroUnits &&
      (!behaviour.rooted || context.sees(foe.position)),
  );
  const team = self.combatant.team;
  const allies = context.participants
    .filter(
      (other) =>
        !other.combatant.dead &&
        other.combatant.team === team &&
        other.creature?.ownerId === undefined &&
        (other.id === self.id || distance(other.position, behaviour.post) <= behaviour.aggroUnits),
    )
    .sort((a, b) => lordFirst(a) - lordFirst(b));
  const healing = allies.some((ally) => healthFraction(ally) < HURT_FRACTION);
  if (cursor.returning || (foes.length === 0 && !healing)) {
    cursor.heldMove = { moveDirection: ZERO, moveTo: undefined };
    return behaviour.rooted || home <= context.stepUnits
      ? NOTHING
      : { ...NOTHING, moveTo: behaviour.post };
  }
  const intent = paced(
    () => behaviour.thinkSeconds,
    cursor,
    context,
    () =>
      think(
        context,
        cursor,
        foes,
        allies,
        weakest(self, foes)?.id,
        undefined,
        false,
        context.foeCentroid,
      ),
  );
  return behaviour.rooted ? { ...intent, moveDirection: ZERO, moveTo: undefined } : intent;
}

/**
 * Think with `decide`, then hold what it asked for `hold(thinks)` seconds,
 * its reaction time (#2606), before thinking again; nothing new while its
 * last skill is still going, though that time runs on meanwhile.
 */
function paced(
  hold: (thinks: number) => number,
  cursor: BehaviourCursor,
  context: BehaviourContext,
  decide: () => BehaviourIntent,
): BehaviourIntent {
  const self = context.self;
  const cast = self.combatant.cast;
  const holding = { ...NOTHING, targetId: self.targetId };
  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  cursor.upkeepDropSeconds = Math.max(0, cursor.upkeepDropSeconds - context.dt);
  if (cursor.spikeTargetId !== undefined) {
    cursor.spikeHeldSeconds += context.dt;
  }
  if (cursor.spikeReadySeconds !== undefined) {
    cursor.spikeReadySeconds += context.dt;
  }
  // Nothing new while what it last asked for is still going: the retry
  // bound, so it never presses twice for one skill.
  if (cast.isCasting || cast.inAftercast || self.pendingSkill !== undefined) {
    return holding;
  }
  if (cursor.waitSeconds > 0) {
    return { ...holding, ...cursor.heldMove };
  }
  cursor.waitSeconds = hold(cursor.thinks);
  cursor.thinks += 1;
  const intent = decide();
  cursor.heldMove = { moveDirection: intent.moveDirection, moveTo: intent.moveTo };
  return intent;
}

/** 0 for a Guild Lord, 1 for anyone else: a stable sort puts the lord first. */
function lordFirst(participant: Participant): number {
  return participant.creature?.kind === "guild-lord" ? 0 : 1;
}

/** The living players of `context.self`'s team, itself included, in simulation order. */
function livingMembers(context: BehaviourContext): Participant[] {
  const team = context.self.combatant.team;
  return context.participants.filter(
    (other) =>
      !other.combatant.dead && other.combatant.team === team && other.creature === undefined,
  );
}

/** The living foes of `context.self`, in simulation order. */
function livingFoes(context: BehaviourContext): Participant[] {
  const team = context.self.combatant.team;
  return context.participants.filter(
    (other) => !other.combatant.dead && other.combatant.team !== team,
  );
}

/**
 * With foes of two or more teams (#2685), the team to fight: the one
 * engaging ours, the most of its living members targeting one of us; else
 * the weakest by health of those with a member within `FOCUS_REACH` past
 * spell range; else the weakest of all. Ties to the lower team. So a team
 * does not charge a fresh one while another is attacking it. Only players
 * count: a team's ghost, guards or priest neither rank it nor engage for
 * it. Undefined with players of one foe team: every foe is fought, as in
 * a two-team match.
 */
function foeFront(context: BehaviourContext, foes: readonly Participant[]): number | undefined {
  const self = context.self;
  const ours = new Set(
    context.participants
      .filter((other) => other.combatant.team === self.combatant.team)
      .map((other) => other.id),
  );
  const teams = new Map<
    number,
    { engaging: number; health: number; count: number; near: boolean }
  >();
  for (const foe of foes) {
    if (foe.creature !== undefined) {
      continue;
    }
    const team = teams.get(foe.combatant.team) ?? { engaging: 0, health: 0, count: 0, near: false };
    teams.set(foe.combatant.team, team);
    if (foe.targetId !== undefined && ours.has(foe.targetId)) {
      team.engaging += 1;
    }
    team.health += healthFraction(foe);
    team.count += 1;
    team.near ||= distance(foe.position, self.position) <= RANGE_SPELL + FOCUS_REACH;
  }
  if (teams.size < 2) {
    return undefined;
  }
  const ranked = [...teams.entries()].sort(
    ([a, one], [b, other]) =>
      other.engaging - one.engaging ||
      Number(other.near) - Number(one.near) ||
      one.health / one.count - other.health / other.count ||
      a - b,
  );
  return ranked[0]?.[0];
}

/** Where the living players of `team` among `foes` stand on average; `foeFront` names only a team with one. */
function centroid(foes: readonly Participant[], team: number): Vec2 {
  const members = foes.filter((foe) => foe.combatant.team === team && foe.creature === undefined);
  const sum = members.reduce(
    (at, foe) => ({ x: at.x + foe.position.x, y: at.y + foe.position.y }),
    ZERO,
  );
  return { x: sum.x / members.length, y: sum.y / members.length };
}

/**
 * One decision against `foes`, for `allies` (its own included), with
 * `targetId` the one to fight and `foeCentroid` where its foes stand: the
 * first of `BOT_RULES` with an answer.
 */
function think(
  context: BehaviourContext,
  cursor: BehaviourCursor,
  foes: readonly Participant[],
  allies: readonly Participant[],
  targetId: string | undefined,
  role: BotRole | undefined,
  spikeHold: boolean,
  foeCentroid: Vec2 | undefined,
): BehaviourIntent {
  const self = context.self;
  const rule: RuleContext = {
    context,
    self,
    bar: skillsOf(self),
    foes,
    allies,
    targetId,
    nearestFirst: (bodies) =>
      [...bodies].sort(
        (a, b) => distance(a.position, self.position) - distance(b.position, self.position),
      ),
    // Out of range or out of sight, the simulation walks it in (#499).
    // Never a well by a sacrifice it cannot afford (#1730).
    mayUse: (skill: Skill, targetId: string | undefined): boolean => {
      if (sacrificesTooMuch(skill, self.position, healthFraction(self), context.participants)) {
        return false;
      }
      const check = context.check(skill.id, targetId);
      return check.ok || check.reason === "out-of-range" || check.reason === "no-line-of-sight";
    },
    mayEndUpkeep: cursor.upkeepDropSeconds <= 0,
    cursor,
    role,
    foeCentroid,
    spikeHold,
    roleOf,
    foeReach: (foe) => foeReach(cursor.foeReach, foe),
    use: (skill, targetId) => ({ ...NOTHING, targetId, useSkillId: skill.id }),
  };
  for (const each of BOT_RULES) {
    const intent = each.decide(rule);
    if (intent !== undefined) {
      // Any other answer, a fight first among them, ends a wait for the team (#2621).
      if (each !== regroup) {
        cursor.regrouping = false;
      }
      if (intent.endUpkeep !== undefined) {
        cursor.upkeepDropSeconds = UPKEEP_DROP_SECONDS;
      }
      return intent;
    }
  }
  return NOTHING;
}

/**
 * The foe the team called (#1193), while it is alive; else, in King of the
 * Hill, a foe's ghost on an altar the team does not hold (#2600); else
 * the foe the team's bots already target, while it is below `FINISH_FRACTION`; else
 * the weakest foe in spell range once it is below `FINISH_FRACTION`
 * (#2545), so the team commits to a kill and never drops one for
 * another; else the team's target, if one is alive within `FOCUS_REACH`
 * past spell range (#2573), or anywhere while no foe is in range; else
 * `focusPick` in spell range. A creature only while no other foe is in
 * range. With shrines to hold or a relic to run, the team's target only
 * in range. With two foe teams, all but the call and the ghost come from
 * the `front` team (#2685).
 */
function teamTarget(
  context: BehaviourContext,
  all: readonly Participant[],
  front: number | undefined,
): string | undefined {
  const called = all.find((foe) => foe.id === context.calledTargetId);
  if (called !== undefined) {
    return called.id;
  }
  const ghost = foeGhostOnAltar(context, all);
  if (ghost !== undefined) {
    return ghost.id;
  }
  const foes = front === undefined ? all : all.filter((foe) => foe.combatant.team === front);
  const self = context.self;
  const inRange = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
  const held = heldTarget(context, foes, inRange);
  if (held !== undefined && healthFraction(held) < FINISH_FRACTION) {
    return held.id;
  }
  const dying = weakest(self, inRange);
  if (dying !== undefined && healthFraction(dying) < FINISH_FRACTION) {
    return dying.id;
  }
  if (
    held !== undefined &&
    (inRange.length === 0 || distance(held.position, self.position) <= RANGE_SPELL + FOCUS_REACH)
  ) {
    return held.id;
  }
  return focusPick(self, inRange)?.id;
}

/**
 * Of `foes`, the Ghostly Hero within spell range of the bot that stands on
 * an altar its team does not hold (#2600), nearest first, then simulation
 * order: two ghosts on the altar contest it for good, and one holding it
 * keeps ours from claiming, so it dies first, creature or not.
 */
function foeGhostOnAltar(
  context: BehaviourContext,
  foes: readonly Participant[],
): Participant | undefined {
  const { altar, altarHolder } = context.objectives;
  const self = context.self;
  if (altar === undefined || altarHolder === self.combatant.team) {
    return undefined;
  }
  let nearest: Participant | undefined;
  let nearestDistance = RANGE_SPELL;
  for (const foe of foes) {
    const away = distance(foe.position, self.position);
    if (
      isGhostId(foe.id) &&
      distance(foe.position, altar) <= ALTAR_REACH_UNITS &&
      (away < nearestDistance || (nearest === undefined && away === nearestDistance))
    ) {
      nearest = foe;
      nearestDistance = away;
    }
  }
  return nearest;
}

/** The first living foe a bot of `context.self`'s team targets, if it may be fought. */
function heldTarget(
  context: BehaviourContext,
  foes: readonly Participant[],
  inRange: readonly Participant[],
): Participant | undefined {
  const self = context.self;
  const eligible = fightable(inRange);
  // With shrines to hold (#2580) or a relic to run (#2581), a bot leaves
  // them for a foe in its own reach, never for one a teammate fights
  // across the map.
  const objectives =
    context.objectives.capturePoints.length > 0 || context.objectives.altar !== undefined;
  for (const ally of context.participants) {
    if (
      ally.combatant.team !== self.combatant.team ||
      ally.combatant.dead ||
      !context.isBot(ally.id)
    ) {
      continue;
    }
    const held = foes.find((foe) => foe.id === ally.targetId);
    if (held !== undefined && eligible(held) && (!objectives || inRange.includes(held))) {
      return held;
    }
  }
  return undefined;
}

/** Of `foes`, a creature only while none of them is a fighter. */
function fightable(foes: readonly Participant[]): (foe: Participant) => boolean {
  const fighters = foes.some((foe) => foe.creature === undefined);
  return (foe) => !fighters || foe.creature === undefined;
}

/**
 * Of `foes`, the one with the lowest health fraction, ties to the nearer
 * to `self`, then simulation order; a creature only while none is a fighter.
 */
function weakest(self: Participant, foes: readonly Participant[]): Participant | undefined {
  return lowest(self, foes, healthFraction);
}

/**
 * As `weakest`, but a healer counts `HEALER_PRIORITY` more hurt than
 * it is (#2573): in GW1 PvP the healer is the first spike target.
 */
function focusPick(self: Participant, foes: readonly Participant[]): Participant | undefined {
  return lowest(
    self,
    foes,
    (foe) => healthFraction(foe) - (roleOf(foe) === "healer" ? HEALER_PRIORITY : 0),
  );
}

/** Of `foes`, the lowest `score`, ties to the nearer to `self`, then simulation order. */
function lowest(
  self: Participant,
  foes: readonly Participant[],
  score: (foe: Participant) => number,
): Participant | undefined {
  const eligible = fightable(foes);
  let best: Participant | undefined;
  let bestScore = 0;
  for (const foe of foes) {
    if (!eligible(foe)) {
      continue;
    }
    const foeScore = score(foe);
    if (
      best === undefined ||
      foeScore < bestScore ||
      (foeScore === bestScore &&
        distance(foe.position, self.position) < distance(best.position, self.position))
    ) {
      best = foe;
      bestScore = foeScore;
    }
  }
  return best;
}
