/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Stand-ins for the Elementalist self-buffs (#1984), until their art card.
  "elementalist.conjure-flame": { glyph: "flame-halo", modifier: "self" },
  "elementalist.conjure-frost": { glyph: "frost", modifier: "self" },
  "elementalist.conjure-lightning": { glyph: "lightning-orb", modifier: "self" },
  "elementalist.ether-prodigy": { glyph: "bolt-pips", modifier: "self" },
  "elementalist.ether-renewal": { glyph: "energy-ring", modifier: "self" },
  "elementalist.elemental-attunement": { glyph: "prism-fan", modifier: "self" },
};

export default rows;
