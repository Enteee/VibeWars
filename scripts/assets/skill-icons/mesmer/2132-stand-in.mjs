/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mesmer energy and utility (#2132), stand-ins until their art card.
  "mesmer.ether-signet": { glyph: "signet-energy", modifier: "plus" },
  "mesmer.lyssas-aura": { glyph: "energy", modifier: "renew" },
  "mesmer.persistence-of-memory": { glyph: "interrupt", modifier: "renew" },
  "mesmer.power-return": { glyph: "interrupt", modifier: "plus" },
  "mesmer.signet-of-midnight": { glyph: "eye", modifier: "pair" },
};

export default rows;
