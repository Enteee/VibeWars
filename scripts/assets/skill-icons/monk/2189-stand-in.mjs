/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Monk mechanics (#2189), stand-ins until their art card.
  "monk.spell-shield": { glyph: "shield-veil", modifier: "clock" },
  "monk.withdraw-hexes": { glyph: "cleanse", modifier: "area" },
  "monk.convert-hexes": { glyph: "armor", modifier: "take" },
};

export default rows;
