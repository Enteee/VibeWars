/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mechanics (#2453), stand-ins until their art card.
  "elementalist.stoneflesh-aura": { glyph: "rock", modifier: "less" },
  "elementalist.icy-shackles": { glyph: "ice-cage", modifier: "down" },
  "elementalist.glyph-of-swiftness": { glyph: "speed", modifier: "focus" },
  "elementalist.ward-of-weakness": { glyph: "mountain", modifier: "down" },
};

export default rows;
