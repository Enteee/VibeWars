/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Stand-ins for the party-wide condition and hex moves (#1954).
  "mesmer.mirror-of-disenchantment": { glyph: "cleanse", modifier: "area" },
  "mesmer.extend-conditions": { glyph: "drop-spread", modifier: "plus" },
  "mesmer.hex-eater-signet": { glyph: "vortex-hex", modifier: "up" },
};

export default rows;
