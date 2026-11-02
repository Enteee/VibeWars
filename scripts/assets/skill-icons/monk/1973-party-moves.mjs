/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Party-wide condition and hex moves (#1973).
  "monk.martyr": { glyph: "martyr-gather", modifier: "area" },
  "monk.empathic-removal": { glyph: "pair-cleanse", modifier: "plus" },
  "monk.divert-hexes": { glyph: "hex-to-drop", modifier: "plus" },
};

export default rows;
