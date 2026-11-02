/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Elementalist staples (#2232), stand-ins until their art card.
  "elementalist.obsidian-flame": { glyph: "flame", modifier: "focus" },
  "elementalist.invoke-lightning": { glyph: "bolt-arc", modifier: "plus" },
  "elementalist.teinais-wind": { glyph: "flame", modifier: "block" },
  "elementalist.crystal-wave": { glyph: "crystal-glow", modifier: "area" },
  "elementalist.energy-blast": { glyph: "energy", modifier: "bolt" },
};

export default rows;
