/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Dervish staples (#2207), stand-ins until their art card.
  "dervish.mystic-healing": { glyph: "drop-plus", modifier: "ring" },
  "dervish.imbue-health": { glyph: "drop-mend", modifier: "self" },
  "dervish.intimidating-aura": { glyph: "armor", modifier: "plus" },
  "dervish.eremites-zeal": { glyph: "drop-energy", modifier: "area" },
  "dervish.vow-of-silence": { glyph: "bar-daze", modifier: "block" },
};

export default rows;
