/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Life Bond, Life Attunement, Aura of Faith, Peace and Harmony (#2291), stand-ins until their art card.
  "monk.life-bond": { glyph: "bond", modifier: "upkeep" },
  "monk.life-attunement": { glyph: "heart-plus", modifier: "upkeep" },
  "monk.aura-of-faith": { glyph: "heart-shield", modifier: "plus" },
  "monk.peace-and-harmony": { glyph: "cleanse", modifier: "hourglass" },
};

export default rows;
