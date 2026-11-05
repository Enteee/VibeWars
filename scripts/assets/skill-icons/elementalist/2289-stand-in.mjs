/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Elementalist staples (#2289), stand-ins until their art card.
  "elementalist.armor-of-frost": { glyph: "snowflake", modifier: "self" },
  "elementalist.phoenix": { glyph: "meteor", modifier: "plus" },
  "elementalist.incendiary-bonds": { glyph: "hex-flame", modifier: "clock" },
  "elementalist.stone-daggers": { glyph: "rock", modifier: "pair" },
  "elementalist.star-burst": { glyph: "spark", modifier: "area" },
  "elementalist.rust": { glyph: "ice-cage", modifier: "hourglass" },
};

export default rows;
