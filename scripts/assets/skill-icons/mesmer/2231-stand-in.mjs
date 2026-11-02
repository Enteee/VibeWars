/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mesmer staples 5 (#2231), stand-ins until their art card.
  "mesmer.energy-drain": { glyph: "energy", modifier: "take" },
  "mesmer.signet-of-weariness": { glyph: "energy", modifier: "area" },
  "mesmer.conjure-nightmare": { glyph: "vortex-hex", modifier: "dot" },
  "mesmer.images-of-remorse": { glyph: "ring-mirror", modifier: "bleed" },
  "mesmer.confusing-images": { glyph: "slow", modifier: "hourglass" },
  "mesmer.discharge-enchantment": { glyph: "take-ench-rev", modifier: "clock" },
  "mesmer.expel-hexes": { glyph: "cleanse", modifier: "pair" },
};

export default rows;
