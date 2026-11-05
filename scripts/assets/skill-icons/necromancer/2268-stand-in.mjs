/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Corpse teleports (#2268), stand-ins until their art card.
  "necromancer.consume-corpse": { glyph: "blink", modifier: "corpse" },
  "necromancer.necrotic-traversal": { glyph: "germ", modifier: "bolt" },
};

export default rows;
