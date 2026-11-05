/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Warrior shouts that count (#2320), stand-ins until their art card.
  "warrior.i-will-avenge-you": { glyph: "shout-fall", modifier: "up" },
  "warrior.fear-me": { glyph: "bolt-drain", modifier: "area" },
  "warrior.none-shall-pass": { glyph: "bull-horns", modifier: "area" },
  "warrior.on-your-knees": { glyph: "adrenal-fast", modifier: "down" },
  "warrior.burst-of-aggression": { glyph: "blade-fast", modifier: "down" },
};

export default rows;
