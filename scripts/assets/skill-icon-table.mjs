// One row per implemented skill: the glyph that shows its primary effect and
// an optional modifier that bends it (#719, docs/art/art-direction.md). The
// icon generator (icons.mjs) draws a row; the test in
// apps/web/src/ui/icons.test.ts checks every implemented skill has one and
// that no two rows are the same picture.
//
// A card that adds a skill to IMPLEMENTED_SKILLS adds a file of its own
// (#2021): `skill-icons/<profession>/<issue>-<slug>.mjs`, by the id's
// prefix, whose default export is its rows, and runs
// `node scripts/assets/icons.mjs`. It edits no other card's file, so two
// cards never conflict. A row drawn as a stand-in until its art card goes in
// `<issue>-stand-in.mjs`; the art card deletes that file and adds its own.
// Start from the glyph for the skill's primary effect (glyphs/, or
// `node scripts/assets/icons.mjs --vocabulary`); the modifier tells apart
// skills that share one.

import { loadDirectories, mergeRows } from "./merge-rows.mjs";

/**
 * @typedef {object} SkillIconRow
 * @property {string} glyph The shape for the primary effect.
 * @property {string} [modifier] The small mark at the bottom right.
 */

/**
 * The tables by profession, so a test can check no id is in two.
 * @type {Readonly<Record<string, Readonly<Record<string, SkillIconRow>>>>}
 */
export const SKILL_ICON_TABLES = /** @type {Record<string, Record<string, SkillIconRow>>} */ (
  await loadDirectories(new URL("./skill-icons/", import.meta.url), "icon row")
);

/** @type {Readonly<Record<string, SkillIconRow>>} */
export const SKILL_ICONS = mergeRows(SKILL_ICON_TABLES, { prefixed: true, what: "icon row" });
