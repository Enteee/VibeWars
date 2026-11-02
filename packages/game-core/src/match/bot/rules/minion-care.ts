import type { Participant } from "../../simulation.js";
import type { Skill } from "../../../skills/types.js";
import { minionCareOf } from "../skill-intent.js";
import { HURT_FRACTION, healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** Above this share of its own Health, a bot pays a minion skill's sacrifice (#1986). */
const SACRIFICE_HEALTH_FRACTION = 0.5;

/** Hurt allied minions that make Blood of the Master worth its price (#1986). */
const HURT_MINIONS = 2;

/** Conditions on its own minions that make Verata's Sacrifice worth it (#1986). */
const MINION_CONDITIONS = 2;

/** Own minions that make Dark Bond worth keeping up (#1986). */
const BOND_MINIONS = 2;

/**
 * Minion care (#1986): Blood of the Master while two allied minions are
 * hurt, Verata's Sacrifice while its minions bear two conditions, each
 * only with Health for its sacrifice; Dark Bond kept up over two minions;
 * Jagged Bones on its own most hurt minion that lacks it.
 */
const minionCare: BotRule = {
  order: 85,
  name: "minion-care",
  decide: ({ context, self, bar, mayUse, use }) => {
    const minions = context.participants.filter(
      ({ combatant, creature }) =>
        creature?.kind === "minion" && combatant.team === self.combatant.team && !combatant.dead,
    );
    const own = minions.filter(({ creature }) => creature?.ownerId === self.id);
    const paysSacrifice = healthFraction(self) > SACRIFICE_HEALTH_FRACTION;
    for (const skill of bar) {
      const care = minionCareOf(skill);
      const castOn = ((): string | undefined => {
        switch (care) {
          case "heal-all":
            return paysSacrifice &&
              minions.filter((minion) => healthFraction(minion) < HURT_FRACTION).length >=
                HURT_MINIONS
              ? self.id
              : undefined;
          case "take-conditions":
            return paysSacrifice &&
              own.reduce(
                (sum, minion) => sum + minion.combatant.statuses.countByCategory("condition"),
                0,
              ) >= MINION_CONDITIONS
              ? self.id
              : undefined;
          case "bond":
            return own.length >= BOND_MINIONS && !bears(self, skill) ? self.id : undefined;
          case "replace-on-death":
            return mostHurt(own.filter((minion) => !bears(minion, skill)))?.id;
          case undefined:
            return undefined;
        }
      })();
      if (castOn !== undefined && mayUse(skill, castOn)) {
        return use(skill, castOn);
      }
    }
    return undefined;
  },
};

/** Whether `bearer` already bears the status `skill` puts on. */
function bears(bearer: Participant, skill: Skill): boolean {
  const applied = skill.effects.find((effect) => effect.kind === "apply-status");
  return applied?.kind === "apply-status" && bearer.combatant.statuses.has(applied.statusId);
}

/** The one lowest in Health, ties by id. */
function mostHurt(bodies: readonly Participant[]): Participant | undefined {
  return [...bodies].sort(
    (a, b) => healthFraction(a) - healthFraction(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
}

export default minionCare;
