/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Tactics stances that pay on a block (#1978), stand-ins until their art card.
  "warrior.wary-stance": { glyph: "shield-stance", modifier: "plus" },
  "warrior.soldiers-defense": { glyph: "shield-stance", modifier: "area" },
  "warrior.defensive-stance": { glyph: "shield-stance", modifier: "up" },
  "warrior.auspicious-parry": { glyph: "shield-stance", modifier: "hourglass" },
};

export default rows;
