/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Mechanics (#2478), stand-ins until their art card.
  "ritualist.restoration": { glyph: "totem", modifier: "renew" },
  "ritualist.empowerment": { glyph: "totem", modifier: "focus" },
  "ritualist.soul-twisting": { glyph: "totem", modifier: "clock" },
};

export default rows;
