/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Elementalist auras (#2095), stand-ins until their art card.
  "elementalist.magnetic-aura": { glyph: "ring-mountain", modifier: "block" },
  "elementalist.swirling-aura": { glyph: "gust-curl", modifier: "block" },
  "elementalist.magnetic-surge": { glyph: "mountain-crack", modifier: "block" },
  "elementalist.sliver-armor": { glyph: "stone-skin", modifier: "bolt" },
};

export default rows;
