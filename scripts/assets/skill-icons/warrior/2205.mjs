/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  "warrior.disarm": { glyph: "sword-snapped" },
  "warrior.desperation-blow": { glyph: "blow-toppled" },
  "warrior.decapitate": { glyph: "axe-head-off" },
  "warrior.battle-rage": { glyph: "rage-gauge" },
  "warrior.shields-up": { glyph: "shield-raised", modifier: "area" },
};

export default rows;
