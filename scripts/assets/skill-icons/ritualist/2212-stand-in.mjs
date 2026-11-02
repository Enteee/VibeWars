/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Ritualist staples (#2212), stand-ins until their art card.
  "ritualist.gaze-from-beyond": { glyph: "eye-blur", modifier: "bolt" },
  "ritualist.ancestors-rage": { glyph: "bolt-ring", modifier: "clock" },
  "ritualist.channeled-strike": { glyph: "bolt-cap", modifier: "plus" },
  "ritualist.soothing-memories": { glyph: "plus-whisper", modifier: "up" },
  "ritualist.ghostmirror-light": { glyph: "heal-other", modifier: "self" },
  "ritualist.dulled-weapon": { glyph: "sword-snapped", modifier: "down" },
};

export default rows;
