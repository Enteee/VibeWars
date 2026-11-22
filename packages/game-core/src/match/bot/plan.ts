import { add, length, scale, sub, vec2, type Vec2 } from "../../vec2.js";
import type { BehaviourContext } from "../behaviour.js";
import type { Participant } from "../simulation.js";
import { roleOf } from "./role.js";
import { botRoll, REGROUP_SPREAD } from "./rules/shared.js";

/**
 * A bot team's plan for one phase: `push` walks at the foes, as bots
 * always have; `hold` waits at the team's hold point for them to come
 * (#3831); `flank` sends part of the team wide round one side at the
 * foes' backline while the rest pushes (#3832).
 */
export type TeamPlan = "push" | "hold" | "flank";

/** How long one plan phase lasts, in match seconds (#3831). */
export const PLAN_SECONDS = 40;

/** The weight of `hold` in a phase's roll (#3832). */
export const HOLD_WEIGHT = 0.3;

/** The weight of `flank` in a phase's roll, `push` taking the rest (#3832). */
export const FLANK_WEIGHT = 0.2;

/** How far a hold point lies from the team's spawn toward the foes' (#3831). */
export const HOLD_FRACTION = 0.35;

/** How far a flank waypoint lies from the team's spawn toward the foes' (#3832). */
export const FLANK_FRACTION = 0.6;

/** How far a flank waypoint lies to one side of that line, a share of the spawns' distance (#3832). */
export const FLANK_SWING = 0.35;

/** The plan phase match second `now` falls in (#3832). */
export function planPhase(now: number): number {
  return Math.floor(now / PLAN_SECONDS);
}

/** The plan team `team` rolls for `phase`, before the run rule (#3832). */
function rolledPlan(seed: number, team: number, phase: number): TeamPlan {
  const r = botRoll(seed, team, `plan:${String(phase)}`);
  if (r < HOLD_WEIGHT) return "hold";
  return r < HOLD_WEIGHT + FLANK_WEIGHT ? "flank" : "push";
}

/**
 * Team `team`'s plan at match second `now` (#3831, #3832): pure, a roll
 * per phase from the match's `seed`. Phase 0 pushes, so a match opens
 * into a fight; a phase after a hold or a flank pushes, so two holding
 * teams wait each other out for one phase at most.
 */
export function teamPlan(seed: number, team: number, now: number): TeamPlan {
  // The non-push rolls running back from this phase: a run of them
  // alternates rolled, push, rolled, … from the push before it, so an odd
  // run ends on this phase's roll.
  const phase = planPhase(now);
  let run = 0;
  for (let back = phase; back > 0; back -= 1) {
    if (rolledPlan(seed, team, back) === "push") break;
    run += 1;
  }
  return run % 2 === 1 ? rolledPlan(seed, team, phase) : "push";
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
 * `self`'s team's bots, when it is a bot-only team of two or more
 * (#3832): flanking, like holding, would leave a human to fight alone
 * until bots group with humans (#3833). Dead ones count, so a flanker
 * who respawns flanks again and the party does not reshuffle.
 */
function flankingTeam(context: BehaviourContext, self: Participant): Participant[] {
  const mates = context.participants.filter(
    (other) => other.combatant.team === self.combatant.team && other.creature === undefined,
  );
  return mates.length >= 2 && mates.every((mate) => context.isBot(mate.id)) ? mates : [];
}

/**
 * Whether `self` is in its team's flank party in plan `phase` (#3832):
 * `max(1, floor(n/2))` of its team's n bots, in an order rolled per
 * phase, a healer only once no other is left. Nobody on a team of one or
 * a team with a human.
 */
export function flankParty(context: BehaviourContext, self: Participant, phase: number): boolean {
  const mates = flankingTeam(context, self);
  if (mates.length === 0) return false;
  const team = self.combatant.team;
  const order = (mate: Participant): number =>
    (roleOf(mate) === "healer" ? 1 : 0) +
    botRoll(context.seed, team, `flank:${String(phase)}:${mate.id}`);
  const party = [...mates]
    .sort((a, b) => order(a) - order(b))
    .slice(0, Math.max(1, Math.floor(mates.length / 2)));
  return party.some((mate) => mate.id === self.id);
}

/** Where a flank party swings to before it strikes (#3832). */
export interface FlankPlace {
  readonly point: Vec2;
  readonly layer: number;
}

/**
 * Where `self`'s flank party swings to against team `foeTeam` (#3832):
 * `FLANK_FRACTION` of the way from its spawn to theirs, and `FLANK_SWING`
 * of that distance to the side rolled for the phase, on a spot a body
 * fits on, on its spawn's layer. Only spawns, never where a foe stands.
 * The other side where the rolled one has no route; `undefined`, so the
 * party pushes, where neither has, and on a team that cannot flank.
 */
export function flankWaypoint(
  context: BehaviourContext,
  self: Participant,
  foeTeam: number,
): FlankPlace | undefined {
  if (flankingTeam(context, self).length === 0) return undefined;
  const own = context.teamSpawn(self.combatant.team);
  const foe = context.teamSpawn(foeTeam);
  if (own === undefined || foe === undefined) return undefined;
  const along = sub(foe.point, own.point);
  const d = length(along);
  if (d === 0) return undefined;
  const side = scale(vec2(-along.y, along.x), FLANK_SWING);
  const ahead = add(own.point, scale(along, FLANK_FRACTION));
  const rolled =
    botRoll(context.seed, self.combatant.team, `flank-side:${String(planPhase(context.now))}`) < 0.5
      ? 1
      : -1;
  for (const s of [rolled, -rolled]) {
    const point = context.standableNear(add(ahead, scale(side, s)), own.layer);
    if (Number.isFinite(context.routeLength(point, own.layer))) {
      return { point, layer: own.layer };
    }
  }
  return undefined;
}
