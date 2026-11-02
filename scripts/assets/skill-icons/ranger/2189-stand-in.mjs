/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Ranger mechanics (#2189), stand-ins until their art card.
  "ranger.melandrus-resilience": { glyph: "shield-regen", modifier: "plus" },
  "ranger.expert-focus": { glyph: "arrow-focus", modifier: "less" },
  "ranger.rapid-fire": { glyph: "arrow-fast", modifier: "clock" },
};

export default rows;
