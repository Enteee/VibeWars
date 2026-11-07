import { RANGE_MELEE } from "../../distances.js";
import type { Skill, TargetRule } from "../../skills/types.js";
import type { Participant } from "../simulation.js";
import { skillsOf } from "./rules/shared.js";
import { botUses } from "./skill-intent.js";

/**
 * Where a bot stands in a fight (#2545): a frontline closes in, a ranged
 * bot keeps its distance, a healer stays behind the ally it looks after.
 */
export type BotRole = "frontline" | "ranged" | "healer";

/** This many ally-targeted healing or defence skills on a bar make a healer. */
const HEALER_SKILLS = 2;

/** The targets that let a skill look after an ally rather than only its caster. */
const ALLY_TARGETS: ReadonlySet<TargetRule> = new Set<TargetRule>([
  "single-ally",
  "single-other-ally",
  "single-any",
  "single-ally-not-spirit",
]);

/**
 * The role `bar`, wielding a weapon of `weaponRange`, plays. A melee
 * weapon always makes a frontline, so a Warrior/Monk with a heal or two
 * still closes in.
 */
export function botRole(bar: readonly Skill[], weaponRange: number): BotRole {
  if (weaponRange <= RANGE_MELEE) {
    return "frontline";
  }
  const support = bar.filter((skill) => {
    if (!ALLY_TARGETS.has(skill.target)) {
      return false;
    }
    const uses = botUses(skill);
    return uses.includes("healing") || uses.includes("defence");
  }).length;
  return support >= HEALER_SKILLS ? "healer" : "ranged";
}

/**
 * Each participant's role (#2549), worked out once: bars and weapons are
 * locked in a match. A creature plays none.
 */
const ROLES = new WeakMap<Participant, BotRole>();

/** The role `participant`'s bar gives it, bot or player; a creature: `undefined`. */
export function roleOf(participant: Participant): BotRole | undefined {
  if (participant.creature !== undefined) {
    return undefined;
  }
  let role = ROLES.get(participant);
  if (role === undefined) {
    role = botRole(skillsOf(participant), participant.combatant.equipment.mainHand.weapon.range);
    ROLES.set(participant, role);
  }
  return role;
}
