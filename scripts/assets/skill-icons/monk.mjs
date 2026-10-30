/** @type {Readonly<Record<string, import("../skill-icon-table.mjs").SkillIconRow>>} */
export const MONK_ICONS = {
  "monk.orison-of-healing": { glyph: "heal" },
  "monk.restore-life": { glyph: "resurrect" },
  "monk.mend-condition": { glyph: "cleanse" },
  "monk.guardian": { glyph: "armor" },
  "monk.word-of-healing": { glyph: "heal", modifier: "up" },
  "monk.mending": { glyph: "heal", modifier: "upkeep" },
  "monk.patient-spirit": { glyph: "heal", modifier: "hourglass" },
  "monk.holy-veil": { glyph: "armor", modifier: "upkeep" },
  // A placeholder: no modifier yet says "per enchantment or hex" (#920).
  "monk.dwaynas-kiss": { glyph: "heal", modifier: "stun" },
  // A hit taken is capped: armor with the "less" mark (#936).
  "monk.protective-spirit": { glyph: "armor", modifier: "less" },
  // Your own life, given: the resurrect glyph with the bleed drop (#936).
  "monk.infuse-health": { glyph: "resurrect", modifier: "bleed" },
  // A heal aimed at another, not the plaster of self-heals (#996).
  "monk.heal-other": { glyph: "heal-other" },
  // The next blow turned back into a heal (#996).
  "monk.reversal-of-fortune": { glyph: "heal-turn" },
  // A hex struck down, the foes near it hurt (#996).
  "monk.smite-hex": { glyph: "hex-bolt" },
  // Conditions cleansed, a heal for each (#996).
  "monk.restore-condition": { glyph: "cleanse", modifier: "plus" },
  "monk.cure-hex": { glyph: "hex-cut", modifier: "plus" },
  "monk.smite-condition": { glyph: "drop-bolt" },
  "monk.mending-touch": { glyph: "drop-pair" },
  "monk.vigorous-spirit": { glyph: "plus-sparks" },
  "monk.remove-hex": { glyph: "hex-cut" },
  "monk.dismiss-condition": { glyph: "drop-ward" },
  "monk.healing-breeze": { glyph: "plus-gusts" },
  "monk.heal-party": { glyph: "party-heal" },
  "monk.heal-area": { glyph: "plus-ripple" },
  "monk.rebirth": { glyph: "resurrect-arrive" },
  "monk.symbol-of-wrath": { glyph: "ring-rays" },
  "monk.contemplation-of-purity": { glyph: "ring-heal" },
  "monk.scourge-enchantment": { glyph: "gain-burst" },
  // Placeholders until the asset-designer's (#1511): Monk staples.
  "monk.aegis": { glyph: "shield-veil", modifier: "area" },
  "monk.shield-of-deflection": { glyph: "armor", modifier: "plus" },
  "monk.shielding-hands": { glyph: "armor", modifier: "hourglass" },
  "monk.zealous-benediction": { glyph: "heal-other", modifier: "plus" },
  "monk.draw-conditions": { glyph: "drop-pair", modifier: "self" },
  "monk.spell-breaker": { glyph: "shield-veil", modifier: "plus" },
  "monk.blessed-light": { glyph: "hex-heal-cut", modifier: "plus" },
  "monk.words-of-comfort": { glyph: "heal", modifier: "half" },
  "monk.light-of-deliverance": { glyph: "party-heal", modifier: "down" },
  "monk.signet-of-rejuvenation": { glyph: "heal", modifier: "bolt" },
  // A placeholder until the asset-designer's (#1528).
  "monk.banish": { glyph: "ghost", modifier: "plus" },
};
