import {
  getSkill,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PROFESSIONS,
  type ProfessionId,
} from "@vibewars/game-core";

import { teamColour, type RenderableActor } from "../render/arena-snapshot.js";
import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import { skillIcon } from "./icons.js";

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
export function equippedCount(character: TeamCharacter): number {
  return character.skillBar.filter((id) => id !== null).length;
}

/** `colour`, a Phaser 0xRRGGBB, as CSS. */
export function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/**
 * Render the preview circle.
 *
 * Sized from the ruleset's collision radius so the proportions match the
 * arena rather than being an arbitrary pretty size.
 */
export function createCharacterDot(character: TeamCharacter): HTMLElement {
  return createProfessionDot(character.primaryProfession, character.secondaryProfession);
}

/**
 * The same circle for any professions, in the colour the arena paints
 * `team` (#580): a lobby shows who will be your ally and who your foe.
 */
export function createProfessionDot(
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
  team: RenderableActor["team"] = "self",
): HTMLElement {
  const dot = document.createElement("span");
  dot.className = "character-dot";
  dot.style.setProperty("--dot-colour", cssColour(teamColour(team)));
  dot.style.width = `${String(MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius * 2)}px`;
  dot.style.height = `${String(MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius * 2)}px`;
  dot.textContent = professionBadge(primary, secondary);
  dot.title = professionLabel(primary, secondary);
  return dot;
}

/** One cell of a mini skill bar: the skill's icon, or `null` for an empty slot. */
export interface MiniSkillCell {
  readonly name: string;
  /** The bare plate for an id this client does not know (#727). */
  readonly icon: string;
}

/** A character's eight slots as stored (#578); an illegal build still shows what it holds. */
export function miniSkillCells(character: TeamCharacter): (MiniSkillCell | null)[] {
  return Array.from({ length: SKILL_BAR_SLOTS }, (_, slot) => {
    const skillId = character.skillBar[slot] ?? null;
    if (skillId === null) {
      return null;
    }
    const skill = getSkill(skillId);
    return { name: skill?.name ?? skillId, icon: skillIcon(skillId) };
  });
}

/** A mini skill bar's icon size, px (#727). */
const MINI_SKILL_ICON_PX = 16;

/**
 * Eight small cells, each its skill's icon (#578, #727), so a list row
 * says what a character plays without opening it. The names are in the
 * cells' titles and the bar's label.
 */
export function miniSkillBar(character: TeamCharacter): HTMLElement {
  const bar = document.createElement("span");
  bar.className = "mini-skill-bar";
  bar.setAttribute("role", "img");
  const cells = miniSkillCells(character);
  bar.setAttribute("aria-label", cells.map((cell) => cell?.name ?? "empty").join(", "));
  for (const cell of cells) {
    const node = document.createElement("span");
    node.className = cell === null ? "mini-skill is-empty" : "mini-skill";
    if (cell !== null) {
      const icon = document.createElement("img");
      icon.className = "skill-icon";
      icon.src = cell.icon;
      icon.alt = "";
      icon.width = MINI_SKILL_ICON_PX;
      icon.height = MINI_SKILL_ICON_PX;
      node.appendChild(icon);
    }
    node.title = cell?.name ?? "Empty slot";
    bar.appendChild(node);
  }
  return bar;
}
