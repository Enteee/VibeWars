/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2313), stand-ins until their art card.
  "necromancer.unholy-feast": { glyph: "feast-jaw", modifier: "area" },
  "necromancer.tainted-flesh": { glyph: "germ", modifier: "block" },
  "necromancer.dark-aura": { glyph: "skull-aura", modifier: "bleed" },
  "necromancer.life-transfer": { glyph: "drop-siphon", modifier: "pair" },
  "necromancer.demonic-flesh": { glyph: "rot-flesh", modifier: "bolt" },
  "necromancer.feast-of-corruption": { glyph: "feast-jaw", modifier: "ring" },
  "necromancer.weaken-knees": { glyph: "knee-cut", modifier: "down" },
};

export default rows;
