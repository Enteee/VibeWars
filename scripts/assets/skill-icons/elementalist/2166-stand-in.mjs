/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Elementalist staples (#2166), stand-ins until their art card.
  "elementalist.blinding-surge": { glyph: "lightning", modifier: "dot" },
  "elementalist.shell-shock": { glyph: "lightning", modifier: "less" },
  "elementalist.teinais-prison": { glyph: "ice-cage", modifier: "down" },
  "elementalist.glowing-ice": { glyph: "shard", modifier: "plus" },
  "elementalist.vapor-blade": { glyph: "shard", modifier: "half" },
};

export default rows;
