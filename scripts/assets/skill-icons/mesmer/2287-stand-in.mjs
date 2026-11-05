/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2287), stand-ins until their art card.
  "mesmer.ether-lord": { glyph: "energy-cut", modifier: "up" },
  "mesmer.spirit-of-failure": { glyph: "hex-fail-foe", modifier: "plus" },
  "mesmer.spirit-shackles": { glyph: "chain", modifier: "down" },
  "mesmer.soothing-images": { glyph: "adrenal-fast", modifier: "down" },
  "mesmer.chaos-storm": { glyph: "energy-ring", modifier: "bolt" },
  "mesmer.psychic-distraction": { glyph: "interrupt", modifier: "clock" },
  "mesmer.arcane-languor": { glyph: "energy-quiet", modifier: "stun" },
  "mesmer.illusion-of-pain": { glyph: "heal", modifier: "bleed" },
  "mesmer.feedback": { glyph: "drop-energy", modifier: "take" },
  "mesmer.ether-phantom": { glyph: "ghost", modifier: "less" },
};

export default rows;
