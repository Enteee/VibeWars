import { effectiveRanks } from "@vibewars/game-core";
import type { TeamCharacter } from "../storage/schema.js";

/**
 * The ranks a character's skill text reads (#1900): bought ranks plus
 * its runes and headgear, as `game-core` resolves them at join. Where
 * bought points are what counts (the attribute editor, serialising),
 * read `character.attributes` instead.
 */
export function characterRanks(character: TeamCharacter): Map<string, number> {
  return effectiveRanks(
    new Map(character.attributes.map((a) => [a.attributeId, a.rank])),
    character.equipment,
    character.primaryProfession,
    character.secondaryProfession,
  );
}
