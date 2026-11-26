/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mesmer interrupts (#2165, art #2193).
  "mesmer.power-lock": { glyph: "interrupt-lock" },
  "mesmer.signet-of-distraction": { glyph: "signet-interrupt-stack" },
  "mesmer.complicate": { glyph: "interrupt-spread" },
  "mesmer.web-of-disruption": { glyph: "hex-web-interrupts" },
};

export default rows;
