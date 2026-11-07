import { RANGE_SPELL } from "../../../distances.js";
import type { Participant } from "../../simulation.js";
import { distance } from "../../../vec2.js";
import { botUses } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/**
 * Raise a dead ally where the ground is ours (#2628): no living foe
 * within `RANGE_SPELL` of the corpse, or fewer than living allies,
 * itself included, and never while a foe targets it, which would cut
 * the cast short or kill it mid-way. The fewest foes near first, then
 * the nearest. With no foe alive every corpse is safe: the nearest.
 */
const raise: BotRule = {
  order: 60,
  name: "raise",
  decide: ({ context, self, bar, nearestFirst, mayUse, use }) => {
    const raises = bar.filter((skill) => botUses(skill).includes("resurrect"));
    if (raises.length === 0) {
      return undefined;
    }
    const team = self.combatant.team;
    const living = (other: Participant): boolean =>
      !other.combatant.dead && other.creature === undefined;
    if (
      context.participants.some(
        (other) => living(other) && other.combatant.team !== team && other.targetId === self.id,
      )
    ) {
      return undefined;
    }
    /** The living foes near `corpse`, or with `ours` the living allies. */
    const near = (corpse: Participant, ours: boolean): number => {
      let count = 0;
      for (const other of context.participants) {
        if (
          living(other) &&
          (other.combatant.team === team) === ours &&
          distance(other.position, corpse.position) <= RANGE_SPELL
        ) {
          count += 1;
        }
      }
      return count;
    };
    /** No foe near `corpse`, or fewer than allies. */
    const safe = (corpse: Participant): boolean => {
      const foes = near(corpse, false);
      return foes === 0 || foes < near(corpse, true);
    };
    const corpses = context.participants.filter(
      (other) =>
        other.combatant.dead &&
        other.combatant.team === team &&
        other.creature === undefined &&
        other.id !== self.id &&
        safe(other),
    );
    // A stable sort: among as many foes near, nearest first still.
    for (const corpse of nearestFirst(corpses).sort((a, b) => near(a, false) - near(b, false))) {
      const skill = raises.find((held) => mayUse(held, corpse.id));
      if (skill !== undefined) {
        return use(skill, corpse.id);
      }
    }
    return undefined;
  },
};

export default raise;
