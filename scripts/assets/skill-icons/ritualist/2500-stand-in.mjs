/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Unwritten corpus skills (#2500), stand-ins until their art card.
  "ritualist.lively-was-naomei": { glyph: "resurrect", modifier: "area" },
  "ritualist.vocal-was-sogolon": { glyph: "was-calm", modifier: "up" },
  "ritualist.wielders-zeal": { glyph: "post-bolt-up", modifier: "renew" },
  "ritualist.sight-beyond-sight": { glyph: "eye", modifier: "block" },
  "ritualist.wielders-remedy": { glyph: "drop-clear-tick", modifier: "renew" },
  "ritualist.caretakers-charge": { glyph: "bolt-urn", modifier: "plus" },
};

export default rows;
