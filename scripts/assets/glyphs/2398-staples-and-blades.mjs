// Glyphs (#2398): the stand-ins of #2368 and #2374.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, spiritPost } from "../glyph-kit.mjs";

const SKULL =
  "M12 4C7.500 4 5 7 5 11C5 13.500 6.500 15 8 16V20H16V16C17.500 15 19 13.500 19 11C19 7 16.500 4 12 4Z";
const GHOST =
  "M12 3C7.500 3 5.500 6.500 5.500 10V20L8 18L10 20L12 18L14 20L16 18L18.500 20V10C18.500 6.500 16.500 3 12 3Z";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "skull-daze-star": {
    means: "Golden Skull Strike: a solid skull with a daze star beside it: the foe reels.",
    draw: () =>
      `<g transform="translate(-2,2) scale(0.9)">${inkFill(SKULL)}` +
      `<circle cx="9.500" cy="11" r="2" fill="${C.bg}"/><circle cx="14.500" cy="11" r="2" fill="${C.bg}"/>` +
      `<path d="M10.500 20V16.500M13.500 20V16.500" ${stroke(C.bg, 1.2)}/></g>` +
      inkFill("M19 2L20.300 5.700L24 7L20.300 8.300L19 12L17.700 8.300L14 7L17.700 5.700Z"),
  },
  "fox-solid": {
    means: "Fox's Promise: a solid fox head, ears up, eyes slit: strikes that find their mark.",
    draw: () =>
      inkFill("M3 2.500L9 7.500H15L21 2.500V12L12 22L3 12Z") +
      `<path d="M6.500 12L10 13M17.500 12L14 13" ${stroke(C.bg, 1.8)}/>` +
      `<path d="M10.500 18H13.500L12 20.500Z" fill="${C.bg}"/>`,
  },
  "wound-seeping": {
    means:
      "Seeping Wound: a gash with three drops running from it: bleeding that hurts the afflicted.",
    draw: () =>
      inkFill("M2 7C8 1.500 16 1.500 22 7C16 12.500 8 12.500 2 7Z") +
      `<path d="M5.500 7H18.500" ${stroke(C.bg, 1.8)}/>` +
      inkFill("M6 14C7 16.500 8 17.500 8 18.500A2 2 0 0 1 4 18.500C4 17.500 5 16.500 6 14Z") +
      inkFill(
        "M12 14C13.500 17.500 14.500 19 14.500 20.500A2.500 2.500 0 0 1 9.500 20.500C9.500 19 10.500 17.500 12 14Z",
      ) +
      inkFill(
        "M18 14C19 16.500 20 17.500 20 18.500A2 2 0 0 1 16 18.500C16 17.500 17 16.500 18 14Z",
      ),
  },
  "chevrons-spikes": {
    means: "Shameful Fear: running chevrons over a row of spikes: moving hurts.",
    draw: () =>
      inkLine("M3 3L10 9.500L3 16M12 3L19 9.500L12 16", 3.4) +
      inkFill("M2 22L5 17L8 22ZM8 22L11 17L14 22ZM14 22L17 17L20 22Z"),
  },
  "eye-shut-powder": {
    means: "Blinding Powder: a shut eye under falling powder: blinded foes.",
    draw: () =>
      inkLine("M2 12C7 18 17 18 22 12", 2.6) +
      inkLine("M7 16.500L5.500 20M12 18L12 21.500M17 16.500L18.500 20", 2) +
      `<circle cx="12" cy="2.800" r="1.600" fill="${C.ink}"/>` +
      `<circle cx="6.500" cy="4" r="1.600" fill="${C.ink}"/><circle cx="17.500" cy="4" r="1.600" fill="${C.ink}"/>` +
      `<circle cx="9.200" cy="8" r="1.400" fill="${C.ink}"/><circle cx="14.800" cy="8" r="1.400" fill="${C.ink}"/>`,
  },
  "blades-crossed-flash": {
    means:
      "Flashing Blades: two crossed blades with a flash at the cross: blocking while attacking.",
    draw: () =>
      inkLine("M3.500 20.500L19.500 4.500M20.500 20.500L4.500 4.500", 3) +
      `<circle cx="12" cy="12.500" r="4.600" fill="${C.bg}"/>` +
      inkFill(
        "M12 7.500L13.200 11.300L17 12.500L13.200 13.700L12 17.500L10.800 13.700L7 12.500L10.800 11.300Z",
      ),
  },
  "ghost-wail-bolt": {
    means:
      "Clamor of Souls: a wailing ghost and a bolt it throws: lightning from the voices of the dead.",
    draw: () =>
      `<g transform="translate(-2.500,2) scale(0.85)">${inkFill(GHOST)}` +
      `<circle cx="9.500" cy="10" r="1.500" fill="${C.bg}"/><circle cx="14.500" cy="10" r="1.500" fill="${C.bg}"/>` +
      `<ellipse cx="12" cy="14.500" rx="1.800" ry="2.400" fill="${C.bg}"/></g>` +
      inkFill("M20 2L14.500 11H18.500L16.500 19L23 9.500H19Z"),
  },
  "post-bolt-up": {
    means:
      "Spirit Channeling: a spirit post, a solid bolt and a rising chevron: Energy that keeps coming.",
    draw: () =>
      spiritPost() +
      inkFill("M17 2L10.500 12H15L13.500 19L20.500 9.500H16Z") +
      inkLine("M11 23L15.500 19.500L20 23", 2),
  },
  "hex-drop-to-bolt": {
    means:
      "Renewing Surge: a drop inside a dashed ring, a bolt coming back: damage while it lasts, Energy when it ends.",
    draw: () =>
      `<circle cx="9" cy="9" r="6.800" ${stroke(C.ink, 2)} stroke-dasharray="4 3"/>` +
      inkFill("M9 4.500C10.800 7 12 8.500 12 10A3 3 0 0 1 6 10C6 8.500 7.200 7 9 4.500Z") +
      inkFill("M20 11L14.500 18H18L16.500 23L22.500 15.500H19Z"),
  },
  "germ-ring-plus": {
    means:
      "Mystic Corruption: a spore ringed by a circle open at the top where a plus rises: Disease now, a cure at the end.",
    draw: () =>
      inkLine("M7.100 6A8.500 8.500 0 1 0 16.900 6", 2.2) +
      `<circle cx="12" cy="14" r="3.800" fill="${C.ink}"/>` +
      inkLine(
        "M12 8.800V10M12 18V19.200M6.800 14H8M16 14H17.200M8.300 10.300L9.200 11.200M15.800 10.300L14.900 11.200M8.300 17.700L9.200 16.800M15.800 17.700L14.900 16.800",
        1.6,
      ) +
      inkLine("M12 1.500V6.500M9.500 4H14.500", 2.2),
  },
  "snowflake-footprints": {
    means: "Winter's Embrace: a snowflake over two footprints: a foe slowed and hurt as it moves.",
    draw: () =>
      inkLine("M12 2V13M7 4L17 11M17 4L7 11", 2.2) +
      inkFill(
        "M5 22C3.800 22 3.500 19 4.500 17C5.500 15.500 7.500 16 7.500 18.500C7.500 21 6.300 22 5 22Z",
      ) +
      inkFill(
        "M15 22C13.800 22 13.500 19 14.500 17C15.500 15.500 17.500 16 17.500 18.500C17.500 21 16.300 22 15 22Z",
      ),
  },
  "feather-bolt": {
    means: "Tease: a feather tickling a foe and a bolt taken from it: interrupted, and drained.",
    draw: () =>
      inkFill("M3 3C13 3 18 8 18 15C10 15 4 11 3 3Z") +
      `<path d="M3.500 3.500L14 13" ${stroke(C.bg, 1.4)}/>` +
      inkFill("M21 10L16.500 17H20L18.500 22L23 15H19.500Z"),
  },
  "swing-bolt": {
    means:
      "Signet of Recall: a swing out and back that ends at a bolt: Energy given up, then returned.",
    draw: () =>
      inkLine("M2.500 3C3 14 9 21 17 19", 2.6) +
      inkFill("M16 15L22 19.500L16 23Z") +
      inkFill("M19 2L13.500 10H17.500L16 16L22 8H18Z"),
  },
  "eye-open-plus": {
    means: "Watchful Healing: an open eye with a plus for a pupil: a watched ally mended.",
    draw: () =>
      inkLine("M1.500 12C6 4.500 18 4.500 22.500 12C18 19.500 6 19.500 1.500 12Z", 2.2) +
      inkFill(
        "M10.500 7.500H13.500V10.500H16.500V13.500H13.500V16.500H10.500V13.500H7.500V10.500H10.500Z",
      ),
  },
};

export default glyphs;
