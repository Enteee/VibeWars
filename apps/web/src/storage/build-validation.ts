import {
  CharacterValidationError,
  IMPLEMENTED_SKILLS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  accessibleAttributeIds,
  getSkill,
  validateCharacter,
  type Character,
} from "@vibewars/game-core";

import type { StoredCharacter } from "./schema.js";

/**
 * Validation for stored builds (brief §23: "validate every build before
 * saving. Validate again when loading").
 *
 * Profession/attribute rules come from `game-core`'s `validateCharacter`;
 * what is added here is the *skill bar*, which `game-core`'s Character
 * does not model yet (the skill bar lives in storage until the simulation
 * needs it).
 */

export const SKILL_BAR_SLOTS = 8;

export interface BuildProblem {
  readonly field: string;
  readonly message: string;
}

/** Convert a stored record into the domain `Character` game-core validates. */
export function toCharacter(stored: StoredCharacter): Character {
  return {
    id: stored.id,
    name: stored.name,
    primaryProfession: stored.primaryProfession,
    secondaryProfession: stored.secondaryProfession,
    attributes: stored.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
  };
}

/**
 * Every problem with a build, as a list rather than a thrown first error —
 * a build editor should show everything that is wrong at once.
 */
export function validateBuild(stored: StoredCharacter): BuildProblem[] {
  const problems: BuildProblem[] = [];

  try {
    validateCharacter(toCharacter(stored), MINIMAL_GW_INSPIRED_PVP_V1.attributes);
  } catch (error) {
    if (error instanceof CharacterValidationError) {
      // game-core already formats one problem per line; split them back
      // out so the editor can attribute each to a field.
      for (const line of error.message.split("\n").slice(1)) {
        problems.push({ field: "character", message: line.replace(/^\s*-\s*/, "") });
      }
    } else {
      throw error;
    }
  }

  if (stored.skillBar.length !== SKILL_BAR_SLOTS) {
    problems.push({
      field: "skillBar",
      message: `skill bar must have exactly ${String(SKILL_BAR_SLOTS)} slots, found ${String(
        stored.skillBar.length,
      )}`,
    });
  }

  // Which skills this character's professions actually grant access to.
  // The editor's skill picker already filters by this, but filtering a
  // dropdown is a UI convenience, not a rule: a build can also arrive by
  // import, from storage written by an older build, or from a character
  // whose professions were changed after the bar was filled. The rule has
  // to be enforced where builds are validated, not where they are picked.
  const accessible = new Set(
    accessibleAttributeIds(stored.primaryProfession, stored.secondaryProfession),
  );

  const seen = new Set<string>();
  stored.skillBar.forEach((skillId, index) => {
    if (skillId === null) {
      return;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `unknown or not-yet-implemented skill ${skillId}`,
      });
      return;
    }
    if (!accessible.has(skill.attributeId)) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `${skill.name} needs ${skill.attributeId}, which this character cannot access`,
      });
    }
    if (seen.has(skillId)) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `${skillId} appears more than once on the bar`,
      });
    }
    seen.add(skillId);
  });

  return problems;
}

/**
 * Skills a character may equip: those whose attribute belongs to a
 * profession they actually have access to.
 *
 * A skill whose attribute is not one of this character's accessible
 * attributes is filtered out, which is the same primary/secondary rule
 * the attribute allocator enforces — expressed once, applied in both
 * places.
 */
export function equippableSkills(stored: StoredCharacter): typeof IMPLEMENTED_SKILLS {
  const accessible = new Set(
    accessibleAttributeIds(stored.primaryProfession, stored.secondaryProfession),
  );
  return IMPLEMENTED_SKILLS.filter((skill) => accessible.has(skill.attributeId));
}
