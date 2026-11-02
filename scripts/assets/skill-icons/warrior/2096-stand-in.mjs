/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Warrior conditions (#2096), stand-ins until their art card.
  "warrior.thrill-of-victory": { glyph: "sword-adrenal", modifier: "less" },
  "warrior.you-will-die": { glyph: "shout-rush-adrenal", modifier: "down" },
  "warrior.youre-all-alone": { glyph: "shout-fall", modifier: "dot" },
  "warrior.retreat": { glyph: "speed", modifier: "corpse" },
  "warrior.protectors-defense": { glyph: "shield-stance", modifier: "area" },
};

export default rows;
