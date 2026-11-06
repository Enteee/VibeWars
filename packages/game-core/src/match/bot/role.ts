import { RANGE_MELEE } from "../../distances.js";
import type { Skill } from "../../skills/types.js";
import { botUses } from "./skill-intent.js";

/**
 * Where a bot stands in a fight (#2545): a frontline closes in, a ranged
 * bot keeps its distance, a healer stays behind the ally it looks after.
 */
export type BotRole = "frontline" | "ranged" | "healer";

/** This many healing or defence skills on a bar make a healer, whatever it wields. */
const HEALER_SKILLS = 2;

/** The role `bar`, wielding a weapon of `weaponRange`, plays. */
export function botRole(bar: readonly Skill[], weaponRange: number): BotRole {
  const support = bar.filter((skill) => {
    const uses = botUses(skill);
    return uses.includes("healing") || uses.includes("defence");
  }).length;
  if (support >= HEALER_SKILLS) {
    return "healer";
  }
  return weaponRange <= RANGE_MELEE ? "frontline" : "ranged";
}
