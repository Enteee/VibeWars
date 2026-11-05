/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Staples (#2288), stand-ins until their art card.
  "elementalist.searing-heat": { glyph: "flame-field", modifier: "area" },
  "elementalist.lightning-bolt": { glyph: "bolt-strike", modifier: "up" },
  "elementalist.shatter-storm": { glyph: "hex-shatter", modifier: "area" },
  "elementalist.gust": { glyph: "gust-fast", modifier: "area" },
  "elementalist.ride-the-lightning": { glyph: "bolt-arc", modifier: "self" },
  "elementalist.mirror-of-ice": { glyph: "ice-cage", modifier: "area" },
};

export default rows;
