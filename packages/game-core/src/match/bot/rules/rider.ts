import { AREA_ADJACENT, AREA_EARSHOT } from "../../../distances.js";
import type { Skill } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import { riderOf } from "../skill-intent.js";
import { healthFraction } from "./shared.js";
import type { BotRule } from "./types.js";

/** Below this share of its health, an ally in earshot is worth Angelic Bond (#1955). */
const LAST_STAND_FRACTION = 0.25;

/** Enchanted allies in earshot, the bot among them, worth Godspeed (#1955). */
const ENCHANTED_SPEED_ALLIES = 2;

/** Allies in earshot, the bot among them, worth "Lead the Way!" (#1955). */
const SPEED_PER_ALLY_ALLIES = 3;

/**
 * A Paragon's rider (#1955), once what it waits for is there: an ally in
 * earshot near death, enchanted allies, a party on the move (the bot
 * itself too), an ally with a foe at its elbow. Never again on a body
 * that still bears what it put on.
 */
const rider: BotRule = {
  order: 92,
  name: "rider",
  decide: ({ self, bar, foes, allies, mayUse, use }) => {
    const inEarshot = allies.filter(
      (ally) => distance(ally.position, self.position) <= AREA_EARSHOT,
    );
    const aimOf = (skill: Skill): string | undefined => {
      switch (riderOf(skill)) {
        case "last-stand":
          return inEarshot.some((ally) => healthFraction(ally) < LAST_STAND_FRACTION)
            ? self.id
            : undefined;
        case "enchanted-speed":
          return inEarshot.filter(
            (ally) => ally.combatant.statuses.countByCategory("enchantment") > 0,
          ).length >= ENCHANTED_SPEED_ALLIES
            ? self.id
            : undefined;
        case "speed-per-ally":
          return inEarshot.length >= SPEED_PER_ALLY_ALLIES
            ? inEarshot.find((ally) => ally.combatant.moving)?.id
            : undefined;
        case "brace":
          return inEarshot.find(
            (ally) =>
              ally.id !== self.id &&
              foes.some((foe) => distance(foe.position, ally.position) <= AREA_ADJACENT),
          )?.id;
        case undefined:
          return undefined;
      }
    };
    const bears = (skill: Skill, id: string): boolean => {
      const statuses = allies.find((ally) => ally.id === id)?.combatant.statuses;
      return skill.effects.some(
        (effect) => effect.kind === "apply-status" && statuses?.has(effect.statusId) === true,
      );
    };
    for (const skill of bar) {
      const aim = aimOf(skill);
      if (aim !== undefined && !bears(skill, aim) && mayUse(skill, aim)) {
        return use(skill, aim);
      }
    }
    return undefined;
  },
};

export default rider;
