/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Removed and maintained counts (#2260), stand-ins until their art card.
  "monk.purge-signet": { glyph: "drops-purge", modifier: "less" },
  "monk.blessed-signet": { glyph: "signet-energy", modifier: "upkeep" },
};

export default rows;
