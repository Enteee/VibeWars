// Does a status glyph's ink stay inside its plate (#2404)? Rasterised rather
// than measured, because strokes, round caps and `<g transform>` all put ink
// where a path's coordinates don't say.
//
// The plate and the glyph are each rendered alone in the icon frame at 4x, on
// transparent. A pixel is outside when the glyph inks it (alpha > 64) and the
// plate does not (alpha < 128): the thresholds absorb both antialias fringes.

import { Resvg } from "@resvg/resvg-js";

import { svg } from "./icon-kit.mjs";

const SIZE = 96;

/**
 * Alpha of every pixel of `body` drawn in the icon frame. Icons have no text,
 * and loading the system fonts would cost ~30 ms a render.
 * @param {string} body
 */
const alpha = (body) => {
  const { pixels } = new Resvg(svg(body), {
    fitTo: { mode: "width", value: SIZE },
    font: { loadSystemFonts: false },
  }).render();
  const out = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = pixels[i * 4 + 3] ?? 0;
  return out;
};

/**
 * How many pixels of `glyphSvg` fall outside `plateSvg`; 0 passes.
 * @param {string} plateSvg
 * @param {string} glyphSvg
 */
export const inkOutsidePlate = (plateSvg, glyphSvg) => {
  const plate = alpha(plateSvg);
  const glyph = alpha(glyphSvg);
  let outside = 0;
  for (let i = 0; i < glyph.length; i++)
    if ((glyph[i] ?? 0) > 64 && (plate[i] ?? 0) < 128) outside++;
  return outside;
};
