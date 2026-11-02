/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Warrior staples 4 (#2181), stand-ins until their art card.
  "warrior.tiger-stance": { glyph: "sword", modifier: "hourglass" },
  "warrior.berserker-stance": { glyph: "adrenal-fast", modifier: "clock" },
  "warrior.skull-crack": { glyph: "blade-burst", modifier: "stun" },
  "warrior.crippling-slash": { glyph: "blade-limp", modifier: "bleed" },
  "warrior.bulls-charge": { glyph: "speed", modifier: "stun" },
  "warrior.counterattack": { glyph: "sword", modifier: "bolt" },
  "warrior.knee-cutter": { glyph: "blade-limp-up", modifier: "bolt" },
  "warrior.standing-slash": { glyph: "sword", modifier: "plus" },
  "warrior.soldiers-strike": { glyph: "blade-pierce", modifier: "plus" },
};

export default rows;
