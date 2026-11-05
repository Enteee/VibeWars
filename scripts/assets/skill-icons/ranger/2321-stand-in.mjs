/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mechanics (#2321), stand-ins until their art card.
  "ranger.natures-renewal": { glyph: "ritual-cycle", modifier: "upkeep" },
  "ranger.equinox": { glyph: "ritual-wind-plus", modifier: "bolt" },
  "ranger.archers-signet": { glyph: "bow-focus", modifier: "plus" },
};

export default rows;
