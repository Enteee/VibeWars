import { RANGE_SPELL } from "../../../distances.js";
import { distance, vec2 } from "../../../vec2.js";
import { holdsPlate } from "../../gates.js";
import { flankParty, planPhase } from "../plan.js";
import { NOTHING, REGROUP_JOINED, REGROUP_MAX_WAIT, REGROUP_SPREAD } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * No foe in reach, and far ahead of its team (#2621): it stands and waits
 * for the rest rather than walk into the foes alone. Ahead means nearer
 * the foes' centre than its team's centre is; a straggler walks on to
 * the team. Once waiting it waits until within `REGROUP_JOINED` of the
 * team's centre, so it does not stop and go every think, unless a foe
 * comes into reach or the team is no longer behind it. A bot on its
 * team's plate (#2691) stays there, so it is nobody to wait for (#2697).
 * Nor is a human who stands idle (#3489): only bots and players who gave
 * a command lately make the team's centre.
 *
 * It waits at most `REGROUP_MAX_WAIT` seconds (#3489), then walks on,
 * and waits no more until it has joined the team or a foe has come into
 * reach: a mate who lags behind does not park it for good.
 *
 * While its team flanks (#3832), the flank party and the rest each make a
 * team of their own: neither waits for the other.
 */
const regroup: BotRule = {
  order: 118,
  name: "regroup",
  decide: (rule) => {
    const { cursor, context } = rule;
    cursor.regrouping = waits(rule);
    if (!cursor.regrouping) {
      cursor.regroupSince = undefined;
    } else if (cursor.regroupSince === undefined) {
      cursor.regroupSince = context.now;
    } else if (context.now - cursor.regroupSince >= REGROUP_MAX_WAIT) {
      cursor.regrouping = false;
      cursor.regroupSince = undefined;
      cursor.regroupSpent = true;
    }
    return rule.cursor.regrouping ? { ...NOTHING, targetId: rule.self.targetId } : undefined;
  },
};

/** Whether a match bot, its team two or more, waits for it now. */
function waits({
  context,
  self,
  foes,
  allies,
  role,
  foeCentroid,
  cursor,
  plan,
}: RuleContext): boolean {
  const phase = planPhase(context.now);
  const flanks = plan === "flank" && flankParty(context, self, phase);
  const coming = allies.filter(
    (ally) =>
      !context.objectives.gates.some((gate) =>
        holdsPlate(gate, ally.combatant.team, ally.position),
      ) &&
      !context.isIdle(ally.id) &&
      (plan !== "flank" || flankParty(context, ally, phase) === flanks),
  );
  if (role === undefined || foeCentroid === undefined || coming.length < 2) return false;
  if (foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)) {
    cursor.regroupSpent = false;
    return false;
  }
  let x = 0;
  let y = 0;
  for (const ally of coming) {
    x += ally.position.x;
    y += ally.position.y;
  }
  const centre = vec2(x / coming.length, y / coming.length);
  if (distance(self.position, centre) <= REGROUP_JOINED) cursor.regroupSpent = false;
  if (cursor.regroupSpent) return false;
  const ahead = distance(self.position, foeCentroid) < distance(centre, foeCentroid);
  return (
    ahead && distance(self.position, centre) > (cursor.regrouping ? REGROUP_JOINED : REGROUP_SPREAD)
  );
}

export default regroup;
