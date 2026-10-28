import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  SKILL_BAR_SLOTS,
  equippableSkills as equippableSkillsFor,
  validatePlayerBuild,
  type BuildProblem,
  type Character,
  type IMPLEMENTED_SKILLS,
  type PlayerBuild,
} from "@vibewars/game-core";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "./schema.js";

/**
 * Validation for stored builds (brief §23: "validate every build before
 * saving. Validate again when loading").
 *
 * The rules themselves live in `game-core`'s `build.ts`, because the
 * **server** has to apply exactly the same ones when a client claims a
 * build at join time (brief §32). This file is only the adapter between
 * the browser's stored shape and the domain's.
 *
 * Keeping a second copy of the rules here would be the obvious way to get
 * a client and server that quietly disagree about what is legal.
 */

export { SKILL_BAR_SLOTS };
export type { BuildProblem };

/** Convert a stored record into the domain build. */
export function toPlayerBuild(stored: StoredCharacter): PlayerBuild {
  return {
    name: stored.name,
    primaryProfession: stored.primaryProfession,
    secondaryProfession: stored.secondaryProfession,
    attributes: stored.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
    skillBar: stored.skillBar,
    // The bridge that carries gear from the browser to the server. If
    // this line went missing the weapon would validate locally, save
    // locally, and then simply never arrive at the match.
    equipment: stored.equipment,
  };
}

/** A domain build as a stored character `id`, saved `now`: `toPlayerBuild`'s inverse. */
export function fromPlayerBuild(build: PlayerBuild, id: string, now: number): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: build.name,
    primaryProfession: build.primaryProfession,
    secondaryProfession: build.secondaryProfession,
    attributes: build.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
    skillBar: build.skillBar,
    equipment: build.equipment,
    updatedAt: now,
  };
}

/** The character half, kept for callers that only need identity + attributes. */
export function toCharacter(stored: StoredCharacter): Character {
  return {
    id: stored.id,
    name: stored.name,
    primaryProfession: stored.primaryProfession,
    secondaryProfession: stored.secondaryProfession,
    attributes: stored.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
  };
}

export function validateBuild(stored: StoredCharacter): BuildProblem[] {
  return validatePlayerBuild(toPlayerBuild(stored), MINIMAL_GW_INSPIRED_PVP_V1.attributes);
}

export function equippableSkills(stored: StoredCharacter): typeof IMPLEMENTED_SKILLS {
  return equippableSkillsFor(toPlayerBuild(stored));
}
