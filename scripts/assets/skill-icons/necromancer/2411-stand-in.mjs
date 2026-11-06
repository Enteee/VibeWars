/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Riders at the caster's ranks, ends on a non-hex skill (#2411), stand-ins until their art card.
  "necromancer.withering-aura": { glyph: "blow", modifier: "upkeep" },
  "necromancer.hexers-vigor": { glyph: "heart-plus", modifier: "clock" },
};

export default rows;
