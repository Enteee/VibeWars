/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Ranger staples 5 (#2133), stand-ins until their art card.
  "ranger.disrupting-accuracy": { glyph: "arrow-keen", modifier: "stun" },
  "ranger.oath-shot": { glyph: "bow-recharge", modifier: "clock" },
  "ranger.marksmans-wager": { glyph: "arrow-energy", modifier: "down" },
  "ranger.storm-chaser": { glyph: "arrow-wind", modifier: "bolt" },
  "ranger.screaming-shot": { glyph: "arrow-barbed", modifier: "bleed" },
};

export default rows;
