/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Narrower filters (#2432), stand-ins until their art card.
  "monk.release-enchantments": { glyph: "heal", modifier: "unring" },
  "monk.pensive-guardian": { glyph: "armor", modifier: "ring" },
};

export default rows;
