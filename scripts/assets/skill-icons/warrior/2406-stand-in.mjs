/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2406), stand-ins until their art card.
  "warrior.primal-rage": { glyph: "face-furious", modifier: "up" },
  "warrior.pulverizing-smash": { glyph: "hammer-slam", modifier: "bleed" },
  "warrior.renewing-smash": { glyph: "hammer-slam", modifier: "renew" },
  "warrior.mokele-smash": { glyph: "hammer-slam", modifier: "plus" },
};

export default rows;
