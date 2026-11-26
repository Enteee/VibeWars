/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mesmer energy and utility (#2132, art #2179).
  "mesmer.ether-signet": { glyph: "signet-bolt-empty" },
  "mesmer.lyssas-aura": { glyph: "energy-ring", modifier: "renew" },
  "mesmer.persistence-of-memory": { glyph: "interrupt-recharge" },
  "mesmer.power-return": { glyph: "interrupt-gives-energy" },
  "mesmer.signet-of-midnight": { glyph: "eyes-slash" },
};

export default rows;
