/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Minion care (#2084): what flows between you and the minions is the modifier.
  "necromancer.blood-of-the-master": { glyph: "bone-minions", modifier: "plus" },
  "necromancer.veratas-sacrifice": { glyph: "drops-purge", modifier: "self" },
  "necromancer.dark-bond": { glyph: "drop-pair", modifier: "pair" },
  "necromancer.jagged-bones": { glyph: "bone-horror", modifier: "up" },
};

export default rows;
