import type { SkillBar } from "../build.js";
import { getSkill } from "../skills/catalog.js";
import type { CreatureTemplate, Skill } from "../skills/types.js";

/**
 * Companions (#1046): creatures that come with a skill on their owner's
 * bar rather than from a cast, as Charm Animal's pet "will travel with
 * you whenever you have Charm Animal equipped". The rules they share, pure.
 */

/** A skill on a bar that brings a companion, with the companion it brings. */
export type CompanionSkill = Skill & { readonly companion: CreatureTemplate };

/** The skills on `bar` that bring a companion, in bar order. */
export function companionSkills(bar: SkillBar): readonly CompanionSkill[] {
  const found: CompanionSkill[] = [];
  for (const id of bar) {
    const skill = id === null ? undefined : getSkill(id);
    if (skill?.companion !== undefined) {
      found.push({ ...skill, companion: skill.companion });
    }
  }
  return found;
}

/**
 * A pet that dies this soon after it was resurrected costs its owner
 * nothing (fandom "Beast Mastery": "If a pet dies soon after it is
 * resurrected (approximately within 15 seconds), the owner's skills will
 * not be disabled for this death").
 */
export const PET_DEATH_GRACE_SECONDS = 15;
