/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), stand-ins until their art card.
  "monk.scourge-sacrifice": { glyph: "drop-sac-bolt", modifier: "pair" },
  "monk.amity": { glyph: "heart-pair", modifier: "area" },
  "monk.resurrect": { glyph: "ankh-chant", modifier: "corpse" },
  "monk.boon-signet": { glyph: "heal-other", modifier: "plus" },
  "monk.kareis-healing-circle": { glyph: "heal-spark", modifier: "area" },
  "monk.supportive-spirit": { glyph: "heart-shield", modifier: "down" },
};

export default rows;
