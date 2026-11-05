/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Ranger staples (#2317), stand-ins until their art card.
  "ranger.choking-gas": { glyph: "ash-cloud", modifier: "area" },
  "ranger.dryders-defenses": { glyph: "shield-flame", modifier: "block" },
  "ranger.healing-spring": { glyph: "party-heal", modifier: "clock" },
  "ranger.snare": { glyph: "trap-jaws", modifier: "down" },
  "ranger.bestial-fury": { glyph: "eye-claws", modifier: "bolt" },
  "ranger.scavengers-focus": { glyph: "claw-condition", modifier: "focus" },
  "ranger.piercing-trap": { glyph: "trap-spike", modifier: "pair" },
  "ranger.feral-aggression": { glyph: "paw-speed", modifier: "bolt" },
};

export default rows;
