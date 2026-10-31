// One row per implemented skill: the glyph that shows its primary effect and
// an optional modifier that bends it (#719, docs/art/art-direction.md). The
// icon generator (icons.mjs) draws a row; the test in
// apps/web/src/ui/icons.test.ts checks every implemented skill has one and
// that no two rows are the same picture.
//
// A card that adds a skill to IMPLEMENTED_SKILLS adds its row to
// `skill-icons/<profession>.mjs`, by the id's prefix, and runs
// `node scripts/assets/icons.mjs`. Start from the glyph for the skill's
// primary effect; the modifier tells apart skills that share one.

import { mergeRows } from "./merge-rows.mjs";
import { WARRIOR_ICONS } from "./skill-icons/warrior.mjs";
import { RANGER_ICONS } from "./skill-icons/ranger.mjs";
import { MONK_ICONS } from "./skill-icons/monk.mjs";
import { NECROMANCER_ICONS } from "./skill-icons/necromancer.mjs";
import { MESMER_ICONS } from "./skill-icons/mesmer.mjs";
import { ELEMENTALIST_ICONS } from "./skill-icons/elementalist.mjs";
import { ASSASSIN_ICONS } from "./skill-icons/assassin.mjs";
import { RITUALIST_ICONS } from "./skill-icons/ritualist.mjs";
import { PARAGON_ICONS } from "./skill-icons/paragon.mjs";
import { DERVISH_ICONS } from "./skill-icons/dervish.mjs";
import { COMMON_ICONS } from "./skill-icons/common.mjs";

/**
 * @typedef {object} SkillIconRow
 * @property {string} glyph The shape for the primary effect.
 * @property {string} [modifier] The small mark at the bottom right.
 */

/** The tables by file name, so a test can check no id is in two. */
export const SKILL_ICON_TABLES = {
  warrior: WARRIOR_ICONS,
  ranger: RANGER_ICONS,
  monk: MONK_ICONS,
  necromancer: NECROMANCER_ICONS,
  mesmer: MESMER_ICONS,
  elementalist: ELEMENTALIST_ICONS,
  assassin: ASSASSIN_ICONS,
  ritualist: RITUALIST_ICONS,
  paragon: PARAGON_ICONS,
  dervish: DERVISH_ICONS,
  common: COMMON_ICONS,
};

/** @type {Readonly<Record<string, SkillIconRow>>} */
export const SKILL_ICONS = mergeRows(SKILL_ICON_TABLES, { prefixed: true });
