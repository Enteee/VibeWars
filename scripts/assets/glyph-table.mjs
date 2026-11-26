// The glyph vocabulary and the modifiers (#719, #2021), one file a family
// in glyphs/ and modifiers/, each a default export of `{ draw, means }` by
// name. A card that needs a new glyph adds `glyphs/<issue>-<slug>.mjs`; the
// helpers they draw with are in glyph-kit.mjs. The vocabulary is the `means`
// lines: `node scripts/assets/icons.mjs --vocabulary` prints them.

import { useGlyphs } from "./glyph-kit.mjs";
import { loadTables, mergeRows } from "./merge-rows.mjs";

/** @typedef {import("./glyph-kit.mjs").GlyphEntry} GlyphEntry */

/** @type {Readonly<Record<string, GlyphEntry>>} */
export const GLYPHS = mergeRows(
  /** @type {Record<string, Record<string, GlyphEntry>>} */ (
    await loadTables(new URL("./glyphs/", import.meta.url), "glyphs/")
  ),
  { prefixed: false, what: "glyph" },
);

/** @type {Readonly<Record<string, GlyphEntry>>} */
export const MODIFIERS = mergeRows(
  /** @type {Record<string, Record<string, GlyphEntry>>} */ (
    await loadTables(new URL("./modifiers/", import.meta.url), "modifiers/")
  ),
  { prefixed: false, what: "modifier" },
);

useGlyphs(GLYPHS);
