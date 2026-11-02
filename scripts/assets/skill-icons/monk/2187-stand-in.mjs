/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Protection staples (#2187), stand-ins until their art card.
  "monk.reversal-of-damage": { glyph: "star-return", modifier: "up" },
  "monk.spotless-mind": { glyph: "hex-cut", modifier: "clock" },
  "monk.spotless-soul": { glyph: "cleanse", modifier: "clock" },
  "monk.mark-of-protection": { glyph: "heal-turn", modifier: "renew" },
  "monk.protective-bond": { glyph: "armor", modifier: "bolt" },
};

export default rows;
