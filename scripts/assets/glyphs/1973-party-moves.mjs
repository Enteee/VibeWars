// Glyphs (#1973): the party-wide condition and hex moves.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallFigure } from "../glyph-kit.mjs";

/**
 * An arrow from one point to another, with a head at the tip: a condition or hex moving (#1973).
 * Martyr gathers (tips point in), Extend Conditions spreads (tips point out).
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
const moveArrow = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (/** @type {number} */ d) =>
    `${(x2 + 2.6 * Math.cos(a + d)).toFixed(2)} ${(y2 + 2.6 * Math.sin(a + d)).toFixed(2)}`;
  return (
    inkLine(`M${String(x1)} ${String(y1)}L${String(x2)} ${String(y2)}`, 1.8) +
    inkLine(`M${p(Math.PI - 0.6)}L${String(x2)} ${String(y2)}L${p(Math.PI + 0.6)}`, 1.8)
  );
};
/** A small solid drop centred on a point. @param {number} cx @param {number} cy */
const miniDrop = (cx, cy) =>
  inkFill(
    `M${String(cx)} ${String(cy - 3)}C${String(cx - 1.8)} ${String(cy - 0.6)} ${String(cx - 2.6)} ${String(cy + 0.4)} ${String(cx - 2.6)} ${String(cy + 1)}A2.6 2.6 0 0 0 ${String(cx + 2.6)} ${String(cy + 1)}C${String(cx + 2.6)} ${String(cy + 0.4)} ${String(cx + 1.8)} ${String(cy - 0.6)} ${String(cx)} ${String(cy - 3)}Z`,
  );
/** A small ring with a slash through it: one enchantment stripped. @param {number} cx @param {number} cy */
const struckRing = (cx, cy) =>
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="3.6" ${stroke(C.ink, 1.9)}/>` +
  inkLine(`M${String(cx - 4.2)} ${String(cy + 4.2)}L${String(cx + 4.2)} ${String(cy - 4.2)}`, 1.9);
/** A small dashed ring with a slash through it: one hex cut. @param {number} cx @param {number} cy */
const struckHex = (cx, cy) =>
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="3.8" ${stroke(C.ink, 1.9)} stroke-dasharray="2.6 2"/>` +
  inkLine(`M${String(cx - 4.4)} ${String(cy + 4.4)}L${String(cx + 4.4)} ${String(cy - 4.4)}`, 1.9);

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "martyr-gather": {
    means: "Drops from two allies drawn in by arrows to the one who takes them (Martyr).",
    draw: () =>
      miniDrop(4, 5) +
      miniDrop(4, 17) +
      moveArrow(7.5, 6.5, 12, 10) +
      moveArrow(7.5, 15.5, 12, 12.5) +
      smallFigure(16.5, 9.5, 0.65),
  },
  "pair-cleanse": {
    means: "A hex cut and a drop cut, once for each of two bodies (Empathic Removal).",
    draw: () =>
      struckHex(6, 6) +
      inkFill(
        "M15.5 2.5C13.5 5.5 12.3 6.8 12.3 8.6A3.2 3.2 0 0 0 18.7 8.6C18.7 6.8 17.5 5.5 15.5 2.5Z",
      ) +
      inkLine("M11.5 10.5L19.5 2.5", 1.9) +
      smallFigure(6, 17, 0.55) +
      smallFigure(12.5, 17, 0.55),
  },
  "hex-to-drop": {
    means: "A cut hex and an arrow to the drop it pays with (Divert Hexes).",
    draw: () => struckHex(6, 9) + moveArrow(11, 9, 14, 9) + miniDrop(18.5, 9),
  },
  "ring-mirror": {
    means:
      "An enchantment ring struck out on each side of a mirror line (Mirror of Disenchantment).",
    draw: () => struckRing(6, 8) + inkLine("M12 2.5V14.5", 1.8) + struckRing(18, 8),
  },
  "drop-push": {
    means: "A drop on the foe and the same one pushed out to its neighbours (Extend Conditions).",
    draw: () =>
      inkFill("M10 6.5C8 9.5 6.8 10.8 6.8 12.6A3.2 3.2 0 0 0 13.2 12.6C13.2 10.8 12 9.5 10 6.5Z") +
      moveArrow(7.5, 10, 4.5, 7) +
      moveArrow(12.5, 10, 16, 7) +
      moveArrow(10, 16.5, 10, 20) +
      miniDrop(3, 4) +
      miniDrop(18.5, 4.5),
  },
  "hex-eaten": {
    means: "A cut hex and the Energy it feeds (Hex Eater Signet).",
    draw: () => struckHex(8, 9) + inkFill("M18 3.5L13.5 10.5H17L15.5 16.5L21 8.5H17.5Z"),
  },
};

export default glyphs;
