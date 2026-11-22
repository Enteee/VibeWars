import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { flankParty, flankWaypoint, planPhase } from "../plan.js";
import type { BotRole } from "../role.js";
import { NOTHING, REGROUP_JOINED, atElbow, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** Below this share of its health a flanker gives the swing up for the phase (#3832). */
export const FLANK_GIVE_UP_FRACTION = 0.5;

/**
 * The swing (#3832): while its team's plan is `flank`, a bot of the
 * flank party walks to its flank waypoint ahead of `fight`, past the foes
 * in its reach, until within `REGROUP_JOINED` of it. Then `play-build`'s
 * team target is the foes' healer, and `close-in` walks it there. It
 * gives the swing up for the phase, and fights where it stands, once
 * below `FLANK_GIVE_UP_FRACTION` or with a foe at its elbow. The waypoint
 * is placed once per phase and foe team.
 */
const flank: BotRule = {
  order: 94,
  name: "flank",
  decide: ({ context, self, foes, cursor, plan }) => {
    if (plan !== "flank") return undefined;
    const phase = planPhase(context.now);
    if (cursor.flankReached === phase || cursor.flankAbandoned === phase) return undefined;
    if (!flankParty(context, self, phase)) return undefined;
    if (healthFraction(self) < FLANK_GIVE_UP_FRACTION || foes.some((foe) => atElbow(self, foe))) {
      cursor.flankAbandoned = phase;
      return undefined;
    }
    const foeTeam = cursor.front ?? foes.find((foe) => foe.creature === undefined)?.combatant.team;
    if (foeTeam === undefined) return undefined;
    const kept = cursor.flankPoint;
    if (kept?.foeTeam !== foeTeam || kept.phase !== phase) {
      cursor.flankPoint = { foeTeam, at: flankWaypoint(context, self, foeTeam), phase };
    }
    const at = cursor.flankPoint?.at;
    if (at === undefined) return undefined;
    if (self.layer === at.layer && distance(self.position, at.point) <= REGROUP_JOINED) {
      cursor.flankReached = phase;
      return undefined;
    }
    return { ...NOTHING, moveTo: at.point, moveToLayer: at.layer };
  },
};

/** Whom a flanker makes for once round (#3832): the foes' healers, else their ranged, else anyone. */
const BACKLINE: readonly BotRole[] = ["healer", "ranged"];

/** The nearest of `foes` to `self` among their healers, else their ranged, else all of them (#3832). */
export function backlineFoe(
  self: Participant,
  foes: readonly Participant[],
  roleOf: (participant: Participant) => BotRole | undefined,
): Participant | undefined {
  const players = foes.filter((foe) => foe.creature === undefined);
  const pool =
    BACKLINE.map((role) => players.filter((foe) => roleOf(foe) === role)).find(
      (each) => each.length > 0,
    ) ?? foes;
  let foe: Participant | undefined;
  for (const each of pool) {
    if (
      foe === undefined ||
      distance(self.position, each.position) < distance(self.position, foe.position)
    ) {
      foe = each;
    }
  }
  return foe;
}

export default flank;
