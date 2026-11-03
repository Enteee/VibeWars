/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Count conditions (#2247), stand-ins until their art card.
  "assassin.signet-of-twilight": { glyph: "signet-strip", modifier: "less" },
  "assassin.signet-of-malice": { glyph: "signet-cure", modifier: "take" },
  "assassin.signet-of-deadly-corruption": { glyph: "drop-shock", modifier: "finale" },
};

export default rows;
