import { getStatusDefinition } from "./status.js";
import type { StatusDefinition } from "./status.js";
import type { Skill, SkillEffect } from "./types.js";

/**
 * What a skill does for a team, as the team editor counts it (#575).
 * A skill may have several roles: Broad Head Arrow interrupts and
 * applies a condition.
 */
export type SkillRole =
  "interrupt" | "healing" | "removal" | "knockdown" | "hex" | "condition" | "defence";

/** Every role, in the order the team editor shows its counters. */
export const SKILL_ROLES: readonly SkillRole[] = [
  "interrupt",
  "healing",
  "removal",
  "knockdown",
  "hex",
  "condition",
  "defence",
];

/** The roles one effect gives its skill. */
function effectRoles(effect: SkillEffect): readonly SkillRole[] {
  switch (effect.kind) {
    case "interrupt":
      return ["interrupt"];
    case "heal":
      return ["healing"];
    case "remove-status":
      // Stripping a foe's enchantment helps no ally: not removal.
      return effect.category === "condition" || effect.category === "hex" ? ["removal"] : [];
    case "knockdown":
      return ["knockdown"];
    case "maintain-status":
    case "apply-status":
      return statusRoles(getStatusDefinition(effect.statusId));
    case "if":
      return effect.effects.flatMap(effectRoles);
    case "damage":
    case "energy-gain":
    case "energy-loss":
    case "sacrifice-health":
    case "resurrect":
      return [];
  }
}

/**
 * What applying a status does for a team: hexes and conditions are
 * their own roles, any other status that raises armor or blocks is
 * defence, and one that interrupts a spell (Dazed) is an interrupt.
 * What it does on each attack hit counts too: Apply Poison poisons,
 * and so does what it adds to the next attack skill: Anthem of Flame burns.
 */
function statusRoles(status: StatusDefinition): readonly SkillRole[] {
  const roles: SkillRole[] = [];
  if (status.category === "hex" || status.category === "condition") {
    roles.push(status.category);
  } else if (status.armorModifier > 0 || status.block !== undefined) {
    roles.push("defence");
  }
  if (status.interruptsSpells) roles.push("interrupt");
  const riders = [...status.onAttackHit, ...(status.nextAttackSkill ?? [])];
  return [...roles, ...riders.flatMap(effectRoles)];
}

/**
 * A skill's roles, derived from its effects only, never a hand-kept
 * list: adding a skill tags it. A blocked blow's effects count too,
 * since they are still what the skill does (Swift Chop's Deep Wound).
 */
export function skillRoles(skill: Skill): readonly SkillRole[] {
  const effects = [...skill.effects, ...(skill.attack?.onBlocked ?? [])];
  const roles = new Set(effects.flatMap(effectRoles));
  return SKILL_ROLES.filter((role) => roles.has(role));
}
