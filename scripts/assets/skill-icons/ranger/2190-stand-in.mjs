/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Ranger staples (#2190), stand-ins until their art card.
  "ranger.disrupting-shot": { glyph: "arrow-keen", modifier: "plus" },
  "ranger.incendiary-arrows": { glyph: "arrow-flame", modifier: "area" },
  "ranger.marauders-shot": { glyph: "arrow-power", modifier: "clock" },
  "ranger.body-shot": { glyph: "arrow-sunder", modifier: "bolt" },
  "ranger.quick-shot": { glyph: "arrow-fast", modifier: "up" },
  "ranger.tigers-fury": { glyph: "claws-rampage", modifier: "self" },
};

export default rows;
