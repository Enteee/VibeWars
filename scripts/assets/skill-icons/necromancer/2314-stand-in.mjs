/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2314), stand-ins until their art card.
  "necromancer.ulcerous-lungs": { glyph: "germ", modifier: "bleed" },
  "necromancer.blood-bond": { glyph: "drop-plus", modifier: "pair" },
  "necromancer.poisoned-heart": { glyph: "germ", modifier: "ring" },
  "necromancer.vile-miasma": { glyph: "ring-rot", modifier: "down" },
  "necromancer.depravity": { glyph: "energy", modifier: "take" },
  "necromancer.cultists-fervor": { glyph: "sac-energy", modifier: "less" },
  "necromancer.blood-drinker": { glyph: "drop-siphon", modifier: "bleed" },
};

export default rows;
