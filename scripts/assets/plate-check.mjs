// Counts the ink of a status glyph that falls outside its plate (#2404).
// Rasterises, because strokes, round caps and transforms make a geometric
// bounds check bigger and less exact than looking at the pixels.

import { Resvg } from "@resvg/resvg-js";

import { C } from "./icon-kit.mjs";
import { PLATES, svg } from "./status-plates.mjs";

const SIZE = 96;
/** A glyph pixel counts when its alpha passes this, a plate pixel when its alpha reaches PLATE_ALPHA: the antialias fringe on both sides. */
const GLYPH_ALPHA = 64;
const PLATE_ALPHA = 128;

/**
 * The alpha channel of `body` drawn alone, SIZE x SIZE, on a transparent background.
 * @param {string} body
 */
const alphaOf = (body) => {
  const image = new Resvg(svg(body), {
    fitTo: { mode: "width", value: SIZE },
    font: { loadSystemFonts: false },
  }).render();
  const rgba = image.pixels;
  return Uint8Array.from({ length: SIZE * SIZE }, (_, i) => rgba[i * 4 + 3] ?? 0);
};

/**
 * How many pixels of the glyph lie outside the plate. A glyph passes at 0.
 * @param {string} plateSvg the plate shape, as in PLATES
 * @param {string} glyphSvg the glyph drawn in the plate's ink
 */
export const inkOutsidePlate = (plateSvg, glyphSvg) => {
  const plate = alphaOf(plateSvg);
  const ink = alphaOf(glyphSvg);
  let outside = 0;
  for (let i = 0; i < ink.length; i += 1) {
    if ((ink[i] ?? 0) > GLYPH_ALPHA && (plate[i] ?? 0) < PLATE_ALPHA) outside += 1;
  }
  return outside;
};

/**
 * How many pixels of a status row's glyph lie outside its category's plate.
 * @param {import("./icon-kit.mjs").Category} category
 * @param {import("./icon-kit.mjs").Glyph} glyph
 */
export const statusInkOutside = (category, glyph) =>
  inkOutsidePlate(PLATES[category], glyph(C.plate));
