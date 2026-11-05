/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Monk staples (#2286), stand-ins until their art card.
  "monk.essence-bond": { glyph: "signet-energy", modifier: "take" },
  "monk.life-barrier": { glyph: "armor", modifier: "half" },
  "monk.retribution": { glyph: "smite-attacking", modifier: "upkeep" },
  "monk.scourge-healing": { glyph: "heal", modifier: "bleed" },
  "monk.healing-seed": { glyph: "heal", modifier: "pair" },
  "monk.succor": { glyph: "heal", modifier: "plus" },
  "monk.divine-boon": { glyph: "star-aura", modifier: "plus" },
  "monk.restful-breeze": { glyph: "heal", modifier: "renew" },
};

export default rows;
