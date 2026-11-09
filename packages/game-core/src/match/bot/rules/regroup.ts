import { RANGE_SPELL } from "../../../distances.js";
import { distance, vec2 } from "../../../vec2.js";
import { holdsPlate } from "../../gates.js";
import { NOTHING, REGROUP_JOINED, REGROUP_SPREAD } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * No foe in reach, and far ahead of its team (#2621): it stands and waits
 * for the rest rather than walk into the foes alone. Ahead means nearer
 * the foes' centre than its team's centre is; a straggler walks on to
 * the team. Once waiting it waits until within `REGROUP_JOINED` of the
 * team's centre, so it does not stop and go every think, unless a foe
 * comes into reach or the team is no longer behind it. A bot on its
 * team's plate (#2691) stays there, so it is nobody to wait for (#2697).
 */
const regroup: BotRule = {
  order: 118,
  name: "regroup",
  decide: (rule) => {
    rule.cursor.regrouping = waits(rule);
    return rule.cursor.regrouping ? { ...NOTHING, targetId: rule.self.targetId } : undefined;
  },
};

/** Whether a match bot, its team two or more, waits for it now. */
function waits({ context, self, foes, allies, role, foeCentroid, cursor }: RuleContext): boolean {
  const coming = allies.filter(
    (ally) =>
      !context.objectives.gates.some((gate) =>
        holdsPlate(gate, ally.combatant.team, ally.position),
      ),
  );
  if (role === undefined || foeCentroid === undefined || coming.length < 2) return false;
  if (foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)) return false;
  let x = 0;
  let y = 0;
  for (const ally of coming) {
    x += ally.position.x;
    y += ally.position.y;
  }
  const centre = vec2(x / coming.length, y / coming.length);
  const ahead = distance(self.position, foeCentroid) < distance(centre, foeCentroid);
  return (
    ahead && distance(self.position, centre) > (cursor.regrouping ? REGROUP_JOINED : REGROUP_SPREAD)
  );
}

export default regroup;
