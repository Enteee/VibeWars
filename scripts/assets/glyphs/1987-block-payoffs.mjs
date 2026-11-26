// Glyphs (#1987): blocks that pay off.

import { inkFill, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "arrow-drip-turned": {
    means: "The dripping arrow turned about, so the drop clears the block modifier (Glass Arrows).",
    draw: () => `<g transform="translate(24,0) scale(-1,1)">${glyph("arrow-drip")}</g>`,
  },
  "axe-adrenaline": {
    means: "The axe and three rising bars: the adrenaline a block pays (Furious Axe).",
    draw: () =>
      `<g transform="translate(9,14) scale(0.8) translate(-12,-12)">${glyph("axe")}</g>` +
      inkFill("M13.5 9V7.5H15.5V9ZM16.5 9V5H18.5V9ZM19.5 9V2.5H21V9Z"),
  },
};

export default glyphs;
