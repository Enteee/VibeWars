/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Taking foe minions (#2092), stand-ins until their art card.
  "necromancer.veratas-gaze": { glyph: "eye", modifier: "take" },
  "necromancer.veratas-aura": { glyph: "bone-minions", modifier: "take" },
  "necromancer.malign-intervention": { glyph: "bone-horror", modifier: "less" },
};

export default rows;
