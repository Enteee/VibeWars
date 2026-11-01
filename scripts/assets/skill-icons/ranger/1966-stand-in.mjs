/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Touch and trap riders (#1966), stand-ins until their art card.
  "ranger.strike-as-one": { glyph: "paw-leap", modifier: "bleed" },
  "ranger.trappers-focus": { glyph: "trap-dust", modifier: "plus" },
  "ranger.trappers-speed": { glyph: "trap-dust", modifier: "up" },
};

export default rows;
