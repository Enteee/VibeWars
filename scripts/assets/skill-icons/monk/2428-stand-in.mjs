/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Rank-scaled speed, reversal and next-hit cut (#2428), stand-ins until their art card.
  "monk.life-sheath": { glyph: "shield-heart", modifier: "ring" },
  "monk.reverse-hex": { glyph: "hex-to-shield", modifier: "down" },
};

export default rows;
