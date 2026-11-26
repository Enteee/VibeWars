/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Party-wide condition and hex moves (#1973).
  "mesmer.mirror-of-disenchantment": { glyph: "ring-mirror", modifier: "area" },
  "mesmer.extend-conditions": { glyph: "drop-push", modifier: "clock" },
  "mesmer.hex-eater-signet": { glyph: "hex-eaten", modifier: "area" },
};

export default rows;
