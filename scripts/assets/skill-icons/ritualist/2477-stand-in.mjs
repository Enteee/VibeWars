/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Healing spirits (#2477), stand-ins until their art card.
  "ritualist.preservation": { glyph: "totem", modifier: "dot" },
  "ritualist.rejuvenation": { glyph: "totem", modifier: "area" },
  "ritualist.recovery": { glyph: "totem", modifier: "hourglass" },
};

export default rows;
