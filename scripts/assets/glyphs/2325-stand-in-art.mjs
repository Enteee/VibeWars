// Glyphs (#2325): the stand-ins of #2288.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "flame-haze": {
    means: "Searing Heat: a flame with heat-haze waves either side: the area shimmers and burns.",
    draw: () =>
      inkFill(
        "M12 3C15 8 17 11 17 14.500A5 5 0 0 1 7 14.500C7 12 8.500 10 9.500 8.500C10 10 11 10.500 11 10.500C11 8 11.500 5.500 12 3Z",
      ) +
      inkLine("M3.500 7Q1.500 10 3.500 13T3.500 19", 1.8) +
      inkLine("M20.500 7Q18.500 10 20.500 13T20.500 19", 1.8) +
      inkLine("M5 22H19", 2.2),
  },
  "gust-curls": {
    means: "Gust: three wind streaks, the outer two curling over: a quick gust of air.",
    draw: () =>
      inkLine("M2 8H15A3.500 3.500 0 1 0 11.500 4.500", 2.2) +
      inkLine("M2 13H21", 2.2) +
      inkLine("M2 18H13A3.500 3.500 0 1 1 9.500 21.500", 2.2),
  },
  "bolt-target": {
    means: "Lightning Bolt: a tall solid bolt striking a flat ground ring: the strike lands.",
    draw: () =>
      inkFill("M15 1.500L6 12.500H11L8.500 19L17.500 8H12.500Z") +
      `<ellipse cx="11" cy="20.500" rx="8" ry="2.500" ${stroke(C.ink, 2)}/>`,
  },
  "cloud-shards": {
    means: "Shatter Storm: a cloud with three shards falling from it: a storm of broken glass.",
    draw: () =>
      inkFill("M6 12A4.500 4.500 0 0 1 8 3.500A5.500 5.500 0 0 1 18.500 5A4 4 0 0 1 18 12Z") +
      inkFill("M5 15L8 15L6.500 20ZM10.500 15L13.500 15L12 22ZM16 15L19 15L17.500 20Z"),
  },
  "figure-bolt-dash": {
    means:
      "Ride the Lightning: a figure at the start of a zigzag bolt that ends in an arrowhead: you travel on it.",
    draw: () =>
      `<circle cx="5" cy="14" r="2.500" ${stroke(C.ink, 2)}/>` +
      inkLine("M5 17V22", 2.4) +
      inkLine("M9 17L13 12L12 16L17 8", 2.2) +
      inkFill("M15.500 4L21 4L21 9.500Z"),
  },
  "mirror-frost": {
    means:
      "Mirror of Ice: a diamond mirror with two glints and an ice spike below it: foes slowed by their own reflection.",
    draw: () =>
      `<path d="M12 2L19 9L12 16L5 9Z" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M9.500 8L11.500 6M12 11L14.500 8.500", 1.6) +
      inkFill("M9 17.500H15L12 23Z"),
  },
};

export default glyphs;
