/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2368), stand-ins until their art card.
  "assassin.golden-skull-strike": { glyph: "burst-skull", modifier: "stun" },
  "assassin.foxs-promise": { glyph: "fox-head", modifier: "block" },
  "assassin.seeping-wound": { glyph: "dagger-wound", modifier: "down" },
  "assassin.shameful-fear": { glyph: "drop-run", modifier: "up" },
  "assassin.blinding-powder": { glyph: "smoke-plume", modifier: "area" },
};

export default rows;
