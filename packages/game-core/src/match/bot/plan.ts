import { add, scale, sub, vec2, type Vec2 } from "../../vec2.js";
import type { BehaviourContext, BehaviourCursor } from "../behaviour.js";
import type { Participant } from "../simulation.js";
import { roleOf } from "./role.js";
import { botRoll, REGROUP_SPREAD } from "./rules/shared.js";

/**
 * A bot team's plan for one phase (#3831): `push` walks at the foes, as
 * bots always have; `hold` waits at the team's hold point for them to come;
 * `flank` (#3832) sends part of the team wide round to the foes' backline
 * while the rest pushes.
 */
export type TeamPlan = "push" | "hold" | "flank";

/** How long one plan phase lasts, in match seconds (#3831). */
export const PLAN_SECONDS = 40;

/** The weight of `hold` in a phase's roll (#3831, #3832). */
export const HOLD_WEIGHT = 0.3;

/** The weight of `flank` in a phase's roll, after `hold`'s; `push` takes the rest (#3832). */
export const FLANK_WEIGHT = 0.2;

/** How far a flank waypoint lies from the team's spawn toward the foes' (#3832). */
export const FLANK_FRACTION = 0.6;

/** How far a flank waypoint lies off the line between the spawns, of its length (#3832). */
export const FLANK_WIDTH = 0.35;

/** How far a hold point lies from the team's spawn toward the foes' (#3831). */
export const HOLD_FRACTION = 0.35;

/** The plan phase match second `now` falls in (#3831, #3832). */
export function planPhase(now: number): number {
  return Math.floor(now / PLAN_SECONDS);
}

/** What team `team` rolls for phase `phase` (#3832), before the run rule. */
function rolled(seed: number, team: number, phase: number): TeamPlan {
  const roll = botRoll(seed, team, `plan:${String(phase)}`);
  if (roll < HOLD_WEIGHT) return "hold";
  return roll < HOLD_WEIGHT + FLANK_WEIGHT ? "flank" : "push";
}

/**
 * Team `team`'s plan at match second `now` (#3831, #3832): pure, a roll
 * per phase from the match's `seed`. Phase 0 pushes, so a match opens
 * into a fight; a phase after a `hold` or a `flank` pushes, so two
 * holding teams wait each other out for one phase at most.
 */
export function teamPlan(seed: number, team: number, now: number): TeamPlan {
  // The non-push rolls running back from this phase: a run of them
  // alternates rolled, push, rolled, … from the push before it, so an odd
  // run ends on what this phase rolled.
  const phase = planPhase(now);
  let run = 0;
  for (let back = phase; back > 0; back -= 1) {
    if (rolled(seed, team, back) === "push") break;
    run += 1;
  }
  return run % 2 === 1 ? rolled(seed, team, phase) : "push";
}

/** Where a holding bot waits (#3831): its team's hold point, and its own spot near it. */
export interface HoldPlace {
  readonly centre: Vec2;
  readonly spot: Vec2;
  readonly layer: number;
}

/**
 * Where `self`'s team holds against team `foeTeam` (#3831):
 * `HOLD_FRACTION` of the way from its spawn to theirs, on a spot a body
 * fits on, on its spawn's layer. Only spawns, which every player knows,
 * never where a foe stands. Each bot keeps its own spot a quarter of
 * `REGROUP_SPREAD` from it, the team's spots evenly round it, so the team
 * stands spread out. `undefined`, so the bot pushes, on a team of one,
 * on a team with a human, whom holding bots would leave to fight alone
 * until bots group with humans (#3833), and where it has no route there.
 */
export function holdPoint(
  context: BehaviourContext,
  self: Participant,
  foeTeam: number,
): HoldPlace | undefined {
  const own = context.teamSpawn(self.combatant.team);
  const foe = context.teamSpawn(foeTeam);
  if (own === undefined || foe === undefined || own.members < 2) return undefined;
  const mates = context.participants.filter(
    (other) => other.combatant.team === self.combatant.team && other.creature === undefined,
  );
  if (mates.some((mate) => !context.isBot(mate.id))) return undefined;
  const layer = own.layer;
  const centre = context.standableNear(
    add(own.point, scale(sub(foe.point, own.point), HOLD_FRACTION)),
    layer,
  );
  const turn =
    botRoll(context.seed, self.combatant.team, `hold:${String(foeTeam)}`) +
    Math.max(
      0,
      mates.findIndex((mate) => mate.id === self.id),
    ) /
      mates.length;
  const angle = 2 * Math.PI * turn;
  const spot = context.standableNear(
    add(centre, scale(vec2(Math.cos(angle), Math.sin(angle)), REGROUP_SPREAD / 4)),
    layer,
  );
  return Number.isFinite(context.routeLength(spot, layer)) ? { centre, spot, layer } : undefined;
}

/**
 * Whether `self` swings wide in plan phase `phase` of a `flank` (#3832):
 * `max(1, floor(n/2))` of its team's n bots, in an order rolled per phase,
 * healers last. The whole team counts, the dead too, so a death does not
 * swap who flanks mid-phase and a respawned flanker flanks again. Nobody
 * on a team of one, nor on a team with a human, whom flankers would leave
 * to fight alone until bots group with humans (#3833).
 */
export function flankParty(context: BehaviourContext, self: Participant, phase: number): boolean {
  const team = self.combatant.team;
  const mates = context.participants.filter(
    (other) => other.combatant.team === team && other.creature === undefined,
  );
  if (mates.length < 2 || mates.some((mate) => !context.isBot(mate.id))) return false;
  const order = (mate: Participant): number =>
    (roleOf(mate) === "healer" ? 1 : 0) +
    botRoll(context.seed, team, `flank:${String(phase)}:${mate.id}`);
  const party = [...mates]
    .sort((one, other) => order(one) - order(other))
    .slice(0, Math.max(1, Math.floor(mates.length / 2)));
  return party.some((mate) => mate.id === self.id);
}

/** Where a flanker swings to before it strikes (#3832), on its spawn's layer. */
export interface FlankPlace {
  readonly point: Vec2;
  readonly layer: number;
}

/**
 * The waypoint `self` swings round to against team `foeTeam` (#3832):
 * `FLANK_FRACTION` of the way from its spawn to theirs and `FLANK_WIDTH`
 * of that distance off to one side, rolled per phase, on a spot a body
 * fits on. Only spawns, never where a foe stands. The other side where
 * the rolled one has no route; `undefined`, so the bot pushes, where
 * neither has.
 */
export function flankWaypoint(
  context: BehaviourContext,
  self: Participant,
  foeTeam: number,
): FlankPlace | undefined {
  const own = context.teamSpawn(self.combatant.team);
  const foe = context.teamSpawn(foeTeam);
  if (own === undefined || foe === undefined) return undefined;
  const layer = own.layer;
  const across = sub(foe.point, own.point);
  const ahead = add(own.point, scale(across, FLANK_FRACTION));
  const rolledSide =
    botRoll(context.seed, self.combatant.team, `flank-side:${String(planPhase(context.now))}`) < 0.5
      ? 1
      : -1;
  for (const side of [rolledSide, -rolledSide]) {
    const point = context.standableNear(
      add(ahead, scale(vec2(-across.y, across.x), side * FLANK_WIDTH)),
      layer,
    );
    if (Number.isFinite(context.routeLength(point, layer))) return { point, layer };
  }
  return undefined;
}

/**
 * The foe team a bot's plan places it against (#3831): its front, else
 * the first foe player's team. `undefined` with no foe player alive.
 */
export function planFoeTeam(
  cursor: BehaviourCursor,
  foes: readonly Participant[],
): number | undefined {
  return cursor.front ?? foes.find((foe) => foe.creature === undefined)?.combatant.team;
}

/**
 * `self`'s hold spot against `foeTeam` (#3831), kept in `cursor`: placed
 * once per foe team, and where it could not hold, again once per plan
 * phase, so one bad moment does not last the match.
 */
export function placedHold(
  context: BehaviourContext,
  self: Participant,
  cursor: BehaviourCursor,
  foeTeam: number,
): HoldPlace | undefined {
  const phase = planPhase(context.now);
  const kept = cursor.holdPoint;
  if (kept?.foeTeam !== foeTeam || (kept.at === undefined && kept.phase !== phase)) {
    cursor.holdPoint = { foeTeam, at: holdPoint(context, self, foeTeam), phase };
  }
  return cursor.holdPoint?.at;
}

/**
 * `self`'s flank waypoint against `foeTeam` this plan phase (#3832), kept
 * in `cursor`: one route search per phase and foe team.
 */
export function placedFlank(
  context: BehaviourContext,
  self: Participant,
  cursor: BehaviourCursor,
  foeTeam: number,
): FlankPlace | undefined {
  const phase = planPhase(context.now);
  const kept = cursor.flankPoint;
  if (kept?.foeTeam !== foeTeam || kept.phase !== phase) {
    cursor.flankPoint = { foeTeam, at: flankWaypoint(context, self, foeTeam), phase };
  }
  return cursor.flankPoint?.at;
}

/**
 * Whether `self` is on its flank swing in plan phase `phase` (#3832): in
 * the flank party, and it has not given the swing up hurt this phase.
 * The one test of "is this bot flanking" for every rule that asks.
 */
export function inFlankSwing(
  context: BehaviourContext,
  self: Participant,
  cursor: BehaviourCursor,
  phase: number,
): boolean {
  return cursor.planGaveUp !== phase && flankParty(context, self, phase);
}

/**
 * Whether `plan`, not the fight, decides where `self` goes this phase
 * (#3832, pull-in gate): holding with a hold spot, or flanking in the
 * flank party with a waypoint. Such a bot takes a teammate's target only
 * near it, so it fights what reaches it and otherwise follows its plan.
 */
export function planPlaced(
  context: BehaviourContext,
  self: Participant,
  cursor: BehaviourCursor,
  plan: TeamPlan,
  foes: readonly Participant[],
): boolean {
  if (plan === "push") return false;
  const foeTeam = planFoeTeam(cursor, foes);
  if (foeTeam === undefined) return false;
  if (plan === "hold") return placedHold(context, self, cursor, foeTeam) !== undefined;
  return (
    inFlankSwing(context, self, cursor, planPhase(context.now)) &&
    placedFlank(context, self, cursor, foeTeam) !== undefined
  );
}
