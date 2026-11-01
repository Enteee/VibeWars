/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Stand-ins for the party-wide condition and hex moves (#1954).
  "monk.martyr": { glyph: "draw-drops", modifier: "area" },
  "monk.empathic-removal": { glyph: "cleanse", modifier: "half" },
  "monk.divert-hexes": { glyph: "hex-cut", modifier: "up" },
};

export default rows;
