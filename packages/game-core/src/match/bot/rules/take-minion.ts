import { AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import { MASTERLESS_TEAM } from "../../minions.js";
import type { Participant } from "../../simulation.js";
import { healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** Foe minions round it that make Verata's Aura worth its price (#2092). */
const AURA_MINIONS = 2;

/** Above this share of its own Health, a bot pays Verata's Aura's 33% (#2092). */
const AURA_HEALTH_FRACTION = 0.4;

/** At or under this share of its Health, a foe is worth Malign Intervention (#2092). */
const MALIGN_HEALTH_FRACTION = 0.5;

/**
 * Taking foe minions (#2092). Verata's Gaze on a masterless minion in
 * reach first, to take it, else on a foe's minion near an ally, to free
 * it; Verata's Aura with two foe minions round it and Health to spare;
 * Malign Intervention on a foe at half Health or less, not hexed with it.
 */
const takeMinion: BotRule = {
  order: 88,
  name: "take-minion",
  decide: ({ context, self, bar, allies, foes, nearestFirst, mayUse, use }) => {
    const living = (other: Participant): boolean => !other.combatant.dead;
    const foeMinions = context.participants.filter(
      (other) =>
        other.creature?.kind === "minion" &&
        other.combatant.team !== self.combatant.team &&
        living(other),
    );
    const aura = bar.find((skill) => skill.id === "necromancer.veratas-aura");
    if (
      aura !== undefined &&
      healthFraction(self) > AURA_HEALTH_FRACTION &&
      !self.combatant.statuses.active.some((status) => status.id === "veratas-aura") &&
      foeMinions.filter((minion) => distance(minion.position, self.position) <= AREA_IN_THE_AREA)
        .length >= AURA_MINIONS &&
      mayUse(aura, self.id)
    ) {
      return use(aura, self.id);
    }
    const gaze = bar.find((skill) => skill.target === "enemy-minion");
    if (gaze !== undefined) {
      const inReach = foeMinions.filter(
        (minion) => distance(minion.position, self.position) <= RANGE_SPELL,
      );
      const masterless = inReach.filter((minion) => minion.combatant.team === MASTERLESS_TEAM);
      const nearAllies = inReach.filter(
        (minion) =>
          minion.combatant.team !== MASTERLESS_TEAM &&
          allies.some(
            (ally) => living(ally) && distance(ally.position, minion.position) <= AREA_NEARBY,
          ),
      );
      for (const minion of [...nearestFirst(masterless), ...nearestFirst(nearAllies)]) {
        if (mayUse(gaze, minion.id)) {
          return use(gaze, minion.id);
        }
      }
    }
    const malign = bar.find((skill) => skill.id === "necromancer.malign-intervention");
    if (malign !== undefined) {
      const hurt = foes.filter(
        (foe) =>
          living(foe) &&
          healthFraction(foe) <= MALIGN_HEALTH_FRACTION &&
          !foe.combatant.statuses.active.some((status) => status.id === "malign-intervention"),
      );
      for (const foe of nearestFirst(hurt)) {
        if (mayUse(malign, foe.id)) {
          return use(malign, foe.id);
        }
      }
    }
    return undefined;
  },
};

export default takeMinion;
