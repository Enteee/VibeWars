/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mesmer interrupts (#2165), stand-ins until their art card.
  "mesmer.power-lock": { glyph: "interrupt", modifier: "hourglass" },
  "mesmer.signet-of-distraction": { glyph: "interrupt", modifier: "dot" },
  "mesmer.complicate": { glyph: "interrupt", modifier: "ring" },
  "mesmer.web-of-disruption": { glyph: "interrupt", modifier: "pair" },
};

export default rows;
