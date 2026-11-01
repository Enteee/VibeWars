/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Pets 3 (#1957), stand-ins until their art card.
  "ranger.predators-pounce": { glyph: "paw-leap", modifier: "plus" },
  "ranger.scavenger-strike": { glyph: "claw", modifier: "bolt" },
  "ranger.ferocious-strike": { glyph: "paw-lunge", modifier: "up" },
  "ranger.melandrus-assault": { glyph: "claw", modifier: "area" },
  "ranger.enraged-lunge": { glyph: "paw-lunge", modifier: "clock" },
  "ranger.heal-as-one": { glyph: "figure-paw-plus", modifier: "plus" },
};

export default rows;
