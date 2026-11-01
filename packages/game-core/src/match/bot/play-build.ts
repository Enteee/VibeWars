import { RANGE_SPELL } from "../../distances.js";
import type { Skill } from "../../skills/types.js";
import { distance, ZERO } from "../../vec2.js";
import type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
} from "../behaviour.js";
import type { Participant } from "../simulation.js";
import { BOT_RULES } from "./rules/index.js";
import { HURT_FRACTION, NOTHING, healthFraction, skillsOf } from "./rules/shared.js";
import type { RuleContext } from "./rules/types.js";
import { sacrificesTooMuch } from "./skill-intent.js";

/**
 * `play-build` (#1189): a participant playing its own skill bar the way a
 * sensible GW1 hero does. Each think it does what the first of
 * `rules/index.ts`'s `BOT_RULES` with an answer says, one file per rule:
 * interrupt, heal, step away, cleanse, raise, …, fight the team target,
 * and otherwise walk to the nearest foe. A ranged bot stands and fights a
 * foe at its elbow: at equal speed, backing off would never end.
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
  return paced(behaviour.thinkSeconds, cursor, context, () => {
    const foes = livingFoes(context);
    return think(context, foes, livingMembers(context), teamTarget(context, foes));
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
    cursor.heldMove = { moveTo: undefined };
    return behaviour.rooted || home <= context.stepUnits
      ? NOTHING
      : { ...NOTHING, moveTo: behaviour.post };
  }
  const intent = paced(behaviour.thinkSeconds, cursor, context, () =>
    think(context, foes, allies, weakest(self, foes)?.id),
  );
  return behaviour.rooted ? { ...intent, moveDirection: ZERO, moveTo: undefined } : intent;
}

/**
 * Think every `thinkSeconds` with `decide`, and in between hold what it
 * last asked for; nothing new while its last skill is still going.
 */
function paced(
  thinkSeconds: number,
  cursor: BehaviourCursor,
  context: BehaviourContext,
  decide: () => BehaviourIntent,
): BehaviourIntent {
  const self = context.self;
  const cast = self.combatant.cast;
  const holding = { ...NOTHING, targetId: self.targetId };
  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  // Nothing new while what it last asked for is still going: the retry
  // bound, so it never presses twice for one skill.
  if (cast.isCasting || cast.inAftercast || self.pendingSkill !== undefined) {
    return holding;
  }
  if (cursor.waitSeconds > 0) {
    return { ...holding, ...cursor.heldMove };
  }
  cursor.waitSeconds = thinkSeconds;
  const intent = decide();
  cursor.heldMove = { moveTo: intent.moveTo };
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
 * One decision against `foes`, for `allies` (its own included), with
 * `targetId` the one to fight: the first of `BOT_RULES` with an answer.
 */
function think(
  context: BehaviourContext,
  foes: readonly Participant[],
  allies: readonly Participant[],
  targetId: string | undefined,
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
    use: (skill, targetId) => ({ ...NOTHING, targetId, useSkillId: skill.id }),
  };
  for (const { decide } of BOT_RULES) {
    const intent = decide(rule);
    if (intent !== undefined) {
      return intent;
    }
  }
  return NOTHING;
}

/**
 * The foe the team called (#1193), while it is alive; else the foe the
 * team's bots already target, if one is alive; else the living foe within
 * spell range with the lowest health fraction, ties to the nearer, then
 * simulation order. A creature only while no other foe is in range.
 */
function teamTarget(context: BehaviourContext, foes: readonly Participant[]): string | undefined {
  const called = foes.find((foe) => foe.id === context.calledTargetId);
  if (called !== undefined) {
    return called.id;
  }
  const self = context.self;
  const inRange = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
  const eligible = fightable(inRange);
  for (const ally of context.participants) {
    if (
      ally.combatant.team !== self.combatant.team ||
      ally.combatant.dead ||
      !context.isBot(ally.id)
    ) {
      continue;
    }
    const held = foes.find((foe) => foe.id === ally.targetId);
    if (held !== undefined && eligible(held)) {
      return held.id;
    }
  }
  return weakest(self, inRange)?.id;
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
  const eligible = fightable(foes);
  let best: Participant | undefined;
  for (const foe of foes) {
    if (!eligible(foe)) {
      continue;
    }
    if (
      best === undefined ||
      healthFraction(foe) < healthFraction(best) ||
      (healthFraction(foe) === healthFraction(best) &&
        distance(foe.position, self.position) < distance(best.position, self.position))
    ) {
      best = foe;
    }
  }
  return best;
}
