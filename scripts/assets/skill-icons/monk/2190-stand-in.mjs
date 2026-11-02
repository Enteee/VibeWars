/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Monk staples (#2190), stand-ins until their art card.
  "monk.shield-of-absorption": { glyph: "shield-bar", modifier: "down" },
  "monk.divine-intervention": { glyph: "plus-halo", modifier: "up" },
  "monk.healing-hands": { glyph: "hands-plus", modifier: "renew" },
  "monk.shield-of-judgment": { glyph: "shield-knock", modifier: "area" },
};

export default rows;
