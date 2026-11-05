/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Vengeance, Healing Burst (#2311), stand-ins until their art card.
  "monk.vengeance": { glyph: "resurrect", modifier: "up" },
  "monk.healing-burst": { glyph: "heal-spark", modifier: "area" },
};

export default rows;
