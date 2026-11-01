/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Blood Magic orders and leeches (#1979), stand-ins until their art card.
  "necromancer.order-of-the-vampire": { glyph: "ring-steal", modifier: "area" },
  "necromancer.dark-fury": { glyph: "skull-order", modifier: "area" },
  "necromancer.awaken-the-blood": { glyph: "drop-plus", modifier: "up" },
  "necromancer.soul-leech": { glyph: "drop-siphon", modifier: "bolt" },
};

export default rows;
