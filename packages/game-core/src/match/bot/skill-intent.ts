import { isCompanionRule } from "../../skills/activation.js";
import { skillRoles } from "../../skills/roles.js";
import type { StatusCategory } from "../../skills/status.js";
import type { Skill, SkillEffect } from "../../skills/types.js";

/**
 * What a bot may use a skill for (#1189), in the order `play-build`
 * weighs them. Read off the team editor's roles (`skillRoles`), which
 * this never changes, plus what those leave out: damage, an attack
 * skill, and raising the dead.
 */
export type BotUse = "interrupt" | "healing" | "defence" | "removal" | "resurrect" | "offence";

/**
 * Every use `skill` has; empty for none. A skill on the bot's own pet
 * (#1046) has none: companion commands are not a bot's yet.
 */
export function botUses(skill: Skill): readonly BotUse[] {
  if (isCompanionRule(skill.target)) {
    return [];
  }
  const roles = skillRoles(skill);
  const uses: BotUse[] = [];
  if (roles.includes("interrupt")) uses.push("interrupt");
  if (roles.includes("healing")) uses.push("healing");
  if (roles.includes("defence")) uses.push("defence");
  if (removedCategories(skill).length > 0) uses.push("removal");
  if (skill.target === "single-dead-ally") uses.push("resurrect");
  if (
    roles.includes("hex") ||
    roles.includes("condition") ||
    roles.includes("knockdown") ||
    skill.attack !== undefined ||
    skill.effects.some(dealsDamage)
  ) {
    uses.push("offence");
  }
  return uses;
}

/**
 * The only role `skill` has is `interrupt`: Distracting Blow's, Power
 * Drain's. Held for a foe's cast, never spent on anything else.
 */
export function onlyInterrupts(skill: Skill): boolean {
  const roles = skillRoles(skill);
  return roles.length === 1 && roles[0] === "interrupt";
}

/**
 * The categories `skill` takes off an ally: a `remove-status` of hexes
 * or conditions, or conditions passed on to a foe (Plague Touch, #944).
 */
export function removedCategories(skill: Skill): readonly StatusCategory[] {
  const found = new Set<StatusCategory>();
  for (const effect of skill.effects.flatMap(flatten)) {
    if (
      effect.kind === "remove-status" &&
      (effect.category === "hex" || effect.category === "condition")
    ) {
      found.add(effect.category);
    } else if (effect.kind === "transfer-conditions") {
      found.add("condition");
    }
  }
  return [...found];
}

/**
 * Whether the removal comes off the caster rather than the target:
 * Plague Touch's, cast on a foe, or a `remove-status` `from` the caster.
 * Draw Conditions' comes off the ally it is cast on (#1511).
 */
export function removesFromCaster(skill: Skill): boolean {
  return skill.effects
    .flatMap(flatten)
    .some(
      (effect) =>
        (effect.kind === "transfer-conditions" && effect.from === "caster") ||
        (effect.kind === "remove-status" && effect.from === "caster"),
    );
}

/** An `if`'s and a splash's effects, as well as the effect itself. */
function flatten(effect: SkillEffect): readonly SkillEffect[] {
  return effect.kind === "if" || effect.kind === "splash" ? [effect, ...effect.effects] : [effect];
}

function dealsDamage(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "damage":
    case "life-steal":
      return true;
    // A spirit that shoots (#1239): Pain's, one that works on foes
    // (#1265): Earthbind's, or one whose death hurts them (#1550):
    // Destruction's. A minion needs a corpse first.
    case "summon":
      return (
        effect.creature.kind === "spirit" &&
        (effect.creature.attack !== undefined ||
          effect.creature.aura?.affects === "foes" ||
          effect.creature.deathBurst?.affects === "foes")
      );
    case "if":
    case "splash":
      return effect.effects.some(dealsDamage);
    case "create-ground-effect": {
      const { act } = effect;
      return act.kind === "trap"
        ? act.trap.spring.effects.some(dealsDamage)
        : act.kind === "pulse" && act.pulse.effects.some(dealsDamage);
    }
    default:
      return false;
  }
}
