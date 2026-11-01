/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Minion care (#1986), stand-ins until their art card.
  "necromancer.blood-of-the-master": { glyph: "bone-minions", modifier: "up" },
  "necromancer.veratas-sacrifice": { glyph: "drops-purge", modifier: "area" },
  "necromancer.dark-bond": { glyph: "drop-pair", modifier: "down" },
  "necromancer.jagged-bones": { glyph: "bone-horror", modifier: "up" },
};

export default rows;
