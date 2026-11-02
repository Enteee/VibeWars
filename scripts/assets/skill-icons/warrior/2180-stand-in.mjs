/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Warrior mechanics 4 (#2180), stand-ins until their art card.
  "warrior.disarm": { glyph: "sword", modifier: "stun" },
  "warrior.desperation-blow": { glyph: "blow", modifier: "self" },
  "warrior.decapitate": { glyph: "axe-burst", modifier: "corpse" },
  "warrior.battle-rage": { glyph: "speed", modifier: "bleed" },
  "warrior.shields-up": { glyph: "shield-arrow", modifier: "area" },
};

export default rows;
