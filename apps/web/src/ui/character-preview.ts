import {
  getSkill,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PROFESSIONS,
  type ProfessionId,
} from "@vibewars/game-core";

import {
  BODY_EDGE,
  BODY_GLYPH_ALPHA,
  BODY_GLYPH_SIZE,
  teamColour,
  type RenderableActor,
} from "../render/arena-snapshot.js";
import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import { professionIcon, skillIcon } from "./icons.js";

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
 * primary profession's glyph sits inside it as the arena draws it on
 * your body (#1785), tinted rather than coloured, and the secondary's
 * on a small dark disc at its lower right.
 */

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

/** The secondary's disc, as a share of the circle's diameter (#1785). */
export const SECONDARY_BADGE_SHARE = 0.45;
/** Below this, px, the secondary's disc is unreadable and left out. */
export const SECONDARY_BADGE_MIN_PX = 8;
/** The secondary's glyph, as a share of its disc. */
const SECONDARY_GLYPH_SHARE = 0.75;

/** A profession glyph, its SVG as a mask over `tint`: the SVGs carry their own fill. */
function professionGlyph(profession: ProfessionId, sizePx: number, tint: string): HTMLElement {
  const glyph = document.createElement("span");
  glyph.className = "character-dot-glyph";
  glyph.style.setProperty("mask-image", `url("${professionIcon(profession)}")`);
  glyph.style.setProperty("background-color", tint);
  glyph.style.width = `${String(sizePx)}px`;
  glyph.style.height = `${String(sizePx)}px`;
  return glyph;
}

/** `BODY_EDGE` at `alpha`, as CSS. */
function bodyEdge(alpha: number): string {
  const channel = (shift: number): string => String((BODY_EDGE >> shift) & 0xff);
  return `rgba(${channel(16)}, ${channel(8)}, ${channel(0)}, ${String(alpha)})`;
}

/**
 * The same circle for any professions, in the colour the arena paints
 * `team` (#580): a lobby shows who will be your ally and who your foe.
 * It holds no text; its label is the professions' names.
 */
export function createProfessionDot(
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
  team: RenderableActor["team"] = "self",
): HTMLElement {
  const dot = document.createElement("span");
  dot.className = "character-dot";
  dot.style.setProperty("--dot-colour", cssColour(teamColour(team)));
  const diameter = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius * 2;
  dot.style.width = `${String(diameter)}px`;
  dot.style.height = `${String(diameter)}px`;
  const label = professionLabel(primary, secondary);
  dot.title = label;
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", label);
  // The arena's glyph is BODY_GLYPH_SIZE across a body of the same diameter.
  dot.appendChild(professionGlyph(primary, BODY_GLYPH_SIZE, bodyEdge(BODY_GLYPH_ALPHA)));
  const badgePx = Math.round(diameter * SECONDARY_BADGE_SHARE);
  if (secondary !== undefined && badgePx >= SECONDARY_BADGE_MIN_PX) {
    const badge = document.createElement("span");
    badge.className = "character-dot-secondary";
    badge.style.width = `${String(badgePx)}px`;
    badge.style.height = `${String(badgePx)}px`;
    badge.style.setProperty("background-color", bodyEdge(1));
    badge.appendChild(
      professionGlyph(secondary, Math.round(badgePx * SECONDARY_GLYPH_SHARE), "var(--ink)"),
    );
    dot.appendChild(badge);
  }
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
