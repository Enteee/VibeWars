/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Tease and Signet of Recall (#2374), stand-ins until their art card.
  "mesmer.tease": { glyph: "interrupt", modifier: "area" },
  "mesmer.signet-of-recall": { glyph: "signet-energy", modifier: "clock" },
};

export default rows;
