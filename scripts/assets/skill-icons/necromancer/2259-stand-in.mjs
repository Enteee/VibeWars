/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Condition movement (#2259), stand-ins until their art card.
  "necromancer.plague-sending": { glyph: "drop-spread", modifier: "take" },
  "necromancer.mark-of-fury": { glyph: "mark-skull", modifier: "bolt" },
  "necromancer.foul-feast": { glyph: "feast-jaw", modifier: "take" },
};

export default rows;
