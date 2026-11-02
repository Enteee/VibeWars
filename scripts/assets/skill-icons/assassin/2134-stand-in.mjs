/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Chain and Paradox tools (#2134), stand-ins until their art card.
  "assassin.way-of-the-empty-palm": { glyph: "hand-bare", modifier: "less" },
  "assassin.mark-of-instability": { glyph: "hex-burst", modifier: "stun" },
  "assassin.deadly-paradox": { glyph: "dagger-pair", modifier: "clock" },
  "assassin.wastrels-collapse": { glyph: "step-haste", modifier: "stun" },
  "assassin.unseen-fury": { glyph: "daggers-unblock", modifier: "self" },
};

export default rows;
