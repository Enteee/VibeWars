/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mind Wrack, Ignorance, Simple Thievery (#2290), stand-ins until their art card.
  "mesmer.mind-wrack": { glyph: "hex-energy-feast", modifier: "down" },
  "mesmer.ignorance": { glyph: "skills-off", modifier: "half" },
  "mesmer.simple-thievery": { glyph: "interrupt", modifier: "take" },
};

export default rows;
