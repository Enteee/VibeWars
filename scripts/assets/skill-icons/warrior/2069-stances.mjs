/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Tactics stances that pay on a block (#2069): the modifier is what the block pays.
  "warrior.wary-stance": { glyph: "shield-stance", modifier: "finale" },
  "warrior.soldiers-defense": { glyph: "shield-stance", modifier: "plus" },
  "warrior.defensive-stance": { glyph: "shield-stance", modifier: "up" },
  "warrior.auspicious-parry": { glyph: "shield-stance", modifier: "hourglass" },
};

export default rows;
