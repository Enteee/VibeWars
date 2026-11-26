/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Tactics stances that pay on a block (#2069): the modifier says when the adrenaline comes.
  "warrior.wary-stance": { glyph: "shield-stance", modifier: "finale" },
  "warrior.soldiers-defense": { glyph: "shield-stance", modifier: "up" },
  "warrior.defensive-stance": { glyph: "shield-stance", modifier: "hourglass" },
  "warrior.auspicious-parry": { glyph: "shield-stance", modifier: "dot" },
};

export default rows;
