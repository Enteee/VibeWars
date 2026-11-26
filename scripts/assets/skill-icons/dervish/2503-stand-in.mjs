/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mechanics (#2503), stand-ins until their art card.
  "dervish.veil-of-thorns": { glyph: "shield-veil", modifier: "less" },
  "dervish.armor-of-sanctity": { glyph: "armor", modifier: "focus" },
  "dervish.pious-concentration": { glyph: "next-any-uninterruptible", modifier: "take" },
  "dervish.grenths-fingers": { glyph: "drops-pass", modifier: "area" },
};

export default rows;
