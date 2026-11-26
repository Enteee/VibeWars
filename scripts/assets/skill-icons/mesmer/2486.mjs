/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mechanics (#2459, #2471, #2472), art #2486.
  "mesmer.stolen-speed": { glyph: "hourglass-take", modifier: "take" },
  "mesmer.calculated-risk": { glyph: "loaded-die", modifier: "half" },
  "mesmer.illusionary-weaponry": { glyph: "blade-dashed", modifier: "self" },
  "mesmer.aneurysm": { glyph: "vessel-burst", modifier: "bolt" },
};

export default rows;
