import type { TeamPlan } from "./plan.js";

/** How long a match goes without progress before a bot team calls it a stalemate (#3834). */
export const STALEMATE_SECONDS = 45;

/**
 * How many of those seconds a team must have spent in contact (#3834),
 * one of its members a foe within `RANGE_SPELL`: two teams standing
 * apart are a hold doing its job, not a stalemate.
 */
export const STALEMATE_CONTACT = 30;

/**
 * One team's stalemate tracker (#3834): when its window opened, at the
 * match's last progress or its own last switch, whichever is later, and
 * its contact seconds since.
 */
export interface StalemateState {
  readonly since: number;
  readonly contactSeconds: number;
}

/** A plan a stalemate forced on a team (#3834), until match second `until`. */
export interface PlanOverride {
  readonly plan: TeamPlan;
  readonly until: number;
}

/** Whether a team with tracker `state` is in a stalemate at match second `now` (#3834). */
export function stalemate(state: StalemateState, now: number): boolean {
  return now - state.since >= STALEMATE_SECONDS && state.contactSeconds >= STALEMATE_CONTACT;
}

/**
 * The plan a team in a stalemate switches to from `current` (#3834): a
 * push flanks, a flank or a hold pushes. `undefined`, no switch, for a
 * push with no flank waypoint (`flankable` false).
 */
export function nextPlan(current: TeamPlan, flankable: boolean): TeamPlan | undefined {
  if (current !== "push") return "push";
  return flankable ? "flank" : undefined;
}
