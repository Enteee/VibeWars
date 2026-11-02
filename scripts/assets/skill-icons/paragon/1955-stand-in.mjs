/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Paragon riders (#1955), stand-ins until their art card.
  "paragon.angelic-bond": { glyph: "plus-wings", modifier: "area" },
  "paragon.godspeed": { glyph: "speed", modifier: "plus" },
  "paragon.lead-the-way": { glyph: "dash", modifier: "clock" },
  "paragon.help": { glyph: "heart-plus", modifier: "plus" },
  "paragon.brace-yourself": { glyph: "shield-knock", modifier: "self" },
};

export default rows;
