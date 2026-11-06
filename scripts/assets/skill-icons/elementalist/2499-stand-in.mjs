/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), stand-ins until their art card.
  "elementalist.double-dragon": { glyph: "flame-wings", modifier: "pair" },
  "elementalist.teinais-heat": { glyph: "flame-field", modifier: "down" },
  "elementalist.sandstorm": { glyph: "dust", modifier: "bolt" },
  "elementalist.glyph-of-immolation": { glyph: "flame-target", modifier: "clock" },
};

export default rows;
