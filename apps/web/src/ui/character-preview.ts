import { MINIMAL_GW_INSPIRED_PVP_V1, PROFESSIONS, type ProfessionId } from "@vibewars/game-core";

import { teamColour } from "../render/arena-snapshot.js";
import type { StoredCharacter } from "../storage/schema.js";

/**
 * The little circle that stands for a character in a list.
 *
 * It is drawn in the colour the arena actually paints *you* — reusing
 * `teamColour("self")` rather than a fresh constant, so the menu can
 * never disagree with the game about what you look like.
 *
 * It deliberately does *not* colour-code by profession. Arena colour
 * means team, not class, and inventing a per-profession palette here
 * would teach players something the match then contradicts. The
 * profession is shown as text inside the circle instead, which
 * identifies the character without implying anything false.
 */

/** "E/Mo", or just "E" when there is no secondary. */
export function professionBadge(
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): string {
  const first = PROFESSIONS[primary].abbreviation;
  if (secondary === undefined) {
    return first;
  }
  return `${first}/${PROFESSIONS[secondary].abbreviation}`;
}

/** "Elementalist / Monk", for the line under the name. */
export function professionLabel(
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): string {
  const first = PROFESSIONS[primary].name;
  return secondary === undefined ? first : `${first} / ${PROFESSIONS[secondary].name}`;
}

/** How many of the eight bar slots are filled. */
export function equippedCount(character: StoredCharacter): number {
  return character.skillBar.filter((id) => id !== null).length;
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/**
 * Render the preview circle.
 *
 * Sized from the ruleset's collision radius so the proportions match the
 * arena rather than being an arbitrary pretty size.
 */
export function createCharacterDot(character: StoredCharacter): HTMLElement {
  const dot = document.createElement("span");
  dot.className = "character-dot";
  dot.style.setProperty("--dot-colour", hex(teamColour("self")));
  dot.style.width = `${String(MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius * 2)}px`;
  dot.style.height = `${String(MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius * 2)}px`;
  dot.textContent = professionBadge(character.primaryProfession, character.secondaryProfession);
  dot.title = professionLabel(character.primaryProfession, character.secondaryProfession);
  return dot;
}
