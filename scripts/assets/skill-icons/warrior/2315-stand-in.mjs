/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Warrior staples 5 (#2315), stand-ins until their art card.
  "warrior.to-the-limit": { glyph: "shout-rush-adrenal", modifier: "up" },
  "warrior.crude-swing": { glyph: "hammer", modifier: "area" },
  "warrior.whirling-axe": { glyph: "axe-sweep", modifier: "less" },
  "warrior.forceful-blow": { glyph: "hammer-weak", modifier: "less" },
  "warrior.auspicious-blow": { glyph: "hammer-bolt", modifier: "plus" },
  "warrior.critical-chop": { glyph: "chop-keen", modifier: "stun" },
};

export default rows;
