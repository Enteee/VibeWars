/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Paragon staples (#2222), stand-ins until their art card.
  "paragon.song-of-power": { glyph: "energy-ring", modifier: "up" },
  "paragon.ballad-of-restoration": { glyph: "next-chant-heart-plus", modifier: "take" },
  "paragon.leaders-zeal": { glyph: "figure-lead", modifier: "bolt" },
  "paragon.make-your-time": { glyph: "shout-rush-adrenal", modifier: "plus" },
  "paragon.theyre-on-fire": { glyph: "shield-flame", modifier: "less" },
  "paragon.find-their-weakness": { glyph: "eye-crit", modifier: "bleed" },
};

export default rows;
