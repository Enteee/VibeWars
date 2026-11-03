/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Count conditions (#2247), stand-ins until their art card.
  "mesmer.accumulated-pain": { glyph: "hex-ache", modifier: "bleed" },
  "mesmer.lyssas-balance": { glyph: "hex-shatter", modifier: "half" },
};

export default rows;
