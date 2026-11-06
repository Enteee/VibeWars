/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Unwritten corpus skills (#2500), stand-ins until their art card.
  "warrior.drunken-blow": { glyph: "blow-toppled", modifier: "bleed" },
  "warrior.yeti-smash": { glyph: "club-swing", modifier: "down" },
  "warrior.grapple": { glyph: "blow-toppled", modifier: "pair" },
  "warrior.i-meant-to-do-that": { glyph: "shout-rush-adrenal", modifier: "down" },
  "warrior.distracting-strike": { glyph: "interrupt-lock", modifier: "half" },
  "warrior.symbolic-strike": { glyph: "signet-blade", modifier: "plus" },
};

export default rows;
