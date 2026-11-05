// Glyphs (#2354): the stand-ins of #2311 and #2333.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "ankh-sword": {
    means: "Vengeance: an ankh beside an upright sword: back from the dead, striking harder.",
    draw: () =>
      `<circle cx="7.500" cy="6.500" r="3.200" ${stroke(C.ink, 2)}/>` +
      inkLine("M7.500 9.700V21M3.500 14H11.500", 2.2) +
      inkLine("M17.500 8V19M14.500 17H20.500", 2.2) +
      inkFill("M17.500 2L19.500 8H15.500Z"),
  },
  "plus-burst": {
    means:
      "Healing Burst: a solid cross with four rays flung off its corners: a heal bursting out.",
    draw: () =>
      inkFill("M9.500 6H14.500V9.500H18V14.500H14.500V18H9.500V14.500H6V9.500H9.500Z") +
      inkLine("M4 4L6 6M20 4L18 6M4 20L6 18M20 20L18 18", 2.2),
  },
  "drops-gather": {
    means: "Hypochondria: three drops drawn in toward one ring: conditions gathered onto a foe.",
    draw: () =>
      `<circle cx="12" cy="14" r="3.500" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M4 2C6 5 7 6 7 7.500A3 3 0 0 1 1 7.500C1 6 2 5 4 2Z") +
      inkFill("M20 2C22 5 23 6 23 7.500A3 3 0 0 1 17 7.500C17 6 18 5 20 2Z") +
      inkLine("M5 9.500L9 12M19 9.500L15 12M12 17.500V22", 1.8),
  },
  "cloud-mist": {
    means: "Iron Mist: a cloud over three trailing mist lines: air that moves faster.",
    draw: () =>
      inkFill("M6 14A4 4 0 0 1 6 6A5 5 0 0 1 15 4A5 5 0 0 1 18 14Z") +
      inkLine("M3 17.500H15M7 21H21M12 17.500H21", 2),
  },
  "wind-flake": {
    means: "Chilling Winds: curling wind lines pushing a snowflake: cold carried on the wind.",
    draw: () =>
      inkLine("M2 8H10A2.500 2.500 0 1 0 7.500 5.500M2 14H8M2 19H12", 2) +
      inkLine("M18 5V19M12 8L24 16M12 16L24 8", 1.8),
  },
  "signet-thorns": {
    means: "Signet of Suffering: a signet ring with a bleeding drop and thorns on its rim.",
    draw: () =>
      `<circle cx="12" cy="12" r="7" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M12 8C14 11 15 12 15 13.500A3 3 0 0 1 9 13.500C9 12 10 11 12 8Z") +
      inkLine("M12 5V1.500M5 12H1.500M19 12H22.500M7 7L4.500 4.500M17 7L19.500 4.500", 1.8),
  },
};

export default glyphs;
