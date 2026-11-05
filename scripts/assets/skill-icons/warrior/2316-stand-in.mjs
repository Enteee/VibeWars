/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2316), stand-ins until their art card.
  "warrior.charging-strike": { glyph: "dash", modifier: "up" },
  "warrior.headbutt": { glyph: "bar-daze", modifier: "self" },
  "warrior.barbarous-slice": { glyph: "chop-bleed", modifier: "down" },
  "warrior.signet-of-stamina": { glyph: "signet-glow", modifier: "up" },
  "warrior.soldiers-stance": { glyph: "blade-fast", modifier: "self" },
  "warrior.steady-stance": { glyph: "dolyak", modifier: "self" },
  "warrior.lions-comfort": { glyph: "heart-plus", modifier: "self" },
};

export default rows;
