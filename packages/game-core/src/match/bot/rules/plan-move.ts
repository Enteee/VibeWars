import { RANGE_MELEE } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import {
  ESCORT_LEASH,
  activeHumans,
  escortSpot,
  inFlankSwing,
  placedFlank,
  placedHold,
  planFoeTeam,
  planKey,
} from "../plan.js";
import { NOTHING, REGROUP_JOINED, REGROUP_SPREAD, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** How far a holding bot strays from its hold spot before it walks back (#3832). */
export const HOLD_LEASH = REGROUP_SPREAD;

/** Below this share of its health a bot gives its plan's move up (#3832). */
export const PLAN_ABANDON_HEALTH = 0.5;

/** A living foe this near makes a holding bot fight where it stands this think (#3832). */
export const PLAN_ELBOW = 2 * RANGE_MELEE;

/**
 * The plan's move (#3832), ahead of `fight`, which otherwise answers
 * from the first fight on: a flank-party bot walks to its flank waypoint
 * past the foes in its reach, until within `REGROUP_JOINED` of it; a
 * holding bot further than `HOLD_LEASH` from its spot walks back, and
 * within it fights from there. Below `PLAN_ABANDON_HEALTH` it gives the
 * move up, a flanker for the rest of the phase, so a hurt one does not run
 * back out; a holder also with a foe within `PLAN_ELBOW`. A flanker walks
 * on past a foe at its elbow: one sticks to it most of a fight. An
 * escorting bot (#3833) further than `ESCORT_LEASH` from its nearest
 * active human walks back to its escort spot past the foes in its reach,
 * and within it fights; it gives the walk up as a holder does (#3853).
 */
const planMove: BotRule = {
  order: 99.9,
  name: "plan-move",
  decide: ({ context, self, foes, cursor, plan, role, escort }) => {
    const escortAt =
      role === undefined || !escort ? undefined : escortSpot(context, self, role, cursor);
    if (escortAt !== undefined) {
      const strayed = !activeHumans(context, self.combatant.team).some(
        (human) =>
          human.layer === self.layer && distance(human.position, self.position) <= ESCORT_LEASH,
      );
      return strayed &&
        healthFraction(self) >= PLAN_ABANDON_HEALTH &&
        !foes.some((foe) => distance(foe.position, self.position) <= PLAN_ELBOW)
        ? { ...NOTHING, moveTo: escortAt.point, moveToLayer: escortAt.layer }
        : undefined;
    }
    if (plan === "push") return undefined;
    const phase = planKey(context, self.combatant.team);
    if (
      plan === "flank" &&
      (cursor.flankReached === phase || !inFlankSwing(context, self, cursor, phase))
    ) {
      return undefined;
    }
    if (healthFraction(self) < PLAN_ABANDON_HEALTH) {
      if (plan === "flank") cursor.planGaveUp = phase;
      return undefined;
    }
    const foeTeam = planFoeTeam(cursor, foes);
    if (foeTeam === undefined) return undefined;
    if (plan === "hold") {
      if (foes.some((foe) => distance(foe.position, self.position) <= PLAN_ELBOW)) return undefined;
      const at = placedHold(context, self, cursor, foeTeam);
      return at !== undefined &&
        (self.layer !== at.layer || distance(self.position, at.spot) > HOLD_LEASH)
        ? { ...NOTHING, moveTo: at.spot, moveToLayer: at.layer }
        : undefined;
    }
    const at = placedFlank(context, self, cursor, foeTeam);
    if (at === undefined) return undefined;
    if (self.layer === at.layer && distance(self.position, at.point) <= REGROUP_JOINED) {
      cursor.flankReached = phase;
      return undefined;
    }
    return { ...NOTHING, moveTo: at.point, moveToLayer: at.layer };
  },
};

export default planMove;
