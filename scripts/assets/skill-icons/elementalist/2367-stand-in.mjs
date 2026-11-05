/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2367), stand-ins until their art card.
  "elementalist.frigid-armor": { glyph: "frost", modifier: "block" },
  "elementalist.earthen-shackles": { glyph: "shackle-pair", modifier: "area" },
  "elementalist.ether-prism": { glyph: "prism-fan", modifier: "self" },
  "elementalist.slippery-ground": { glyph: "interrupt-knockdown", modifier: "half" },
};

export default rows;
