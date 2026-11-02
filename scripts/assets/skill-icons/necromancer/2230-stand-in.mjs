/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Necromancer staples (#2230), stand-ins until their art card.
  "necromancer.virulence": { glyph: "germ", modifier: "plus" },
  "necromancer.chilblains": { glyph: "snowflake", modifier: "unring" },
  "necromancer.deathly-swarm": { glyph: "chill-skull", modifier: "area" },
  "necromancer.ravenous-gaze": { glyph: "eye-drop", modifier: "area" },
  "necromancer.vampiric-spirit": { glyph: "drop-touch", modifier: "up" },
};

export default rows;
