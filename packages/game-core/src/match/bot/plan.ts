import { add, scale, sub, vec2, type Vec2 } from "../../vec2.js";
import type { BehaviourContext } from "../behaviour.js";
import type { Participant } from "../simulation.js";
import { botRoll, REGROUP_SPREAD } from "./rules/shared.js";

/**
 * A bot team's plan for one phase (#3831): `push` walks at the foes, as
 * bots always have; `hold` waits at the team's hold point for them to come.
 */
export type TeamPlan = "push" | "hold";

/** How long one plan phase lasts, in match seconds (#3831). */
export const PLAN_SECONDS = 40;

/** The weight of `hold` in a phase's roll, `push` taking the rest (#3831). */
export const HOLD_WEIGHT = 0.4;

/** How far a hold point lies from the team's spawn toward the foes' (#3831). */
export const HOLD_FRACTION = 0.35;

/**
 * Team `team`'s plan at match second `now` (#3831): pure, a roll per
 * phase from the match's `seed`. Phase 0 pushes, so a match opens into a
 * fight; a phase after a `hold` pushes, so two holding teams wait each
 * other out for one phase at most.
 */
export function teamPlan(seed: number, team: number, now: number): TeamPlan {
  // The hold rolls running back from this phase: a run of them alternates
  // hold, push, hold, … from the push before it, so an odd run ends on hold.
  let run = 0;
  for (let phase = Math.floor(now / PLAN_SECONDS); phase > 0; phase -= 1) {
    if (botRoll(seed, team, `plan:${String(phase)}`) >= HOLD_WEIGHT) break;
    run += 1;
  }
  return run % 2 === 1 ? "hold" : "push";
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
 * stands spread out. `undefined`,
 * so the bot pushes, on a team of one and where it has no route there.
 */
export function holdPoint(
  context: BehaviourContext,
  self: Participant,
  foeTeam: number,
): HoldPlace | undefined {
  const own = context.teamSpawn(self.combatant.team);
  const foe = context.teamSpawn(foeTeam);
  if (own === undefined || foe === undefined || own.members < 2) return undefined;
  const layer = own.layer;
  const centre = context.standableNear(
    add(own.point, scale(sub(foe.point, own.point), HOLD_FRACTION)),
    layer,
  );
  const mates = context.participants.filter(
    (other) => other.combatant.team === self.combatant.team && other.creature === undefined,
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
