/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2413), stand-ins until their art card.
  "ritualist.wielders-strike": { glyph: "bolt-pips", modifier: "pair" },
  "ritualist.offering-of-spirit": { glyph: "spirit-energy", modifier: "self" },
  "ritualist.binding-chains": { glyph: "spirit-bound", modifier: "area" },
};

export default rows;
