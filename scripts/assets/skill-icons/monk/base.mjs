/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
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
  // Anti-summon (#1528, #1568): the skill's mark, a struck ghost below it.
  "monk.banish": { glyph: "anti-summon-spell" },
  // Monk staples (#1511, #1541).
  "monk.aegis": { glyph: "block-half" },
  "monk.shield-of-deflection": { glyph: "block-most" },
  "monk.shielding-hands": { glyph: "shield-cut-heal" },
  "monk.zealous-benediction": { glyph: "heal-bolt" },
  "monk.draw-conditions": { glyph: "draw-drops" },
  "monk.spell-breaker": { glyph: "target-struck" },
  "monk.blessed-light": { glyph: "heal-clear" },
  "monk.words-of-comfort": { glyph: "heal-drop" },
  "monk.light-of-deliverance": { glyph: "plus-trio" },
  "monk.signet-of-rejuvenation": { glyph: "plus-cycle" },
  // Monk staples 3 (#1650, #1703): a plus and what it brings.
  "monk.healing-whisper": { glyph: "plus-whisper" },
  "monk.jameis-gaze": { glyph: "eye-heal" },
  "monk.glimmer-of-light": { glyph: "heal-spark" },
  "monk.healing-light": { glyph: "plus-rays" },
  "monk.signet-of-devotion": { glyph: "signet-plus" },
  "monk.divine-healing": { glyph: "plus-halo" },
  "monk.heavens-delight": { glyph: "plus-wings" },
  "monk.purge-conditions": { glyph: "drops-purge" },
  "monk.mend-ailment": { glyph: "drop-mend" },
  "monk.stonesoul-strike": { glyph: "hand-star" },
  "monk.shield-of-regeneration": { glyph: "shield-regen" },
  // Monk mechanics (#1754, #1784): linked rings, a returning star, a star in an aura ring, a healing hand.
  "monk.spirit-bond": { glyph: "bond-plus-hit" },
  "monk.holy-wrath": { glyph: "star-return" },
  "monk.balthazars-aura": { glyph: "star-aura" },
  "monk.healing-touch": { glyph: "hand-plus-double" },
  // Monk smiting staples (#1519, #1584): holy star, signet ring, the foe attacking or knocked down.
  "monk.smite": { glyph: "smite-attacking" },
  "monk.spear-of-light": { glyph: "spear-light" },
  "monk.word-of-censure": { glyph: "star-below-half" },
  "monk.ray-of-judgment": { glyph: "star-beam-flame" },
  "monk.judges-insight": { glyph: "sword-star" },
  "monk.bane-signet": { glyph: "signet-attacking" },
  "monk.castigation-signet": { glyph: "signet-energy" },
  "monk.signet-of-judgment": { glyph: "signet-quake" },
  "monk.holy-strike": { glyph: "star-prone" },
  // Monk staples 6 (#1767).
  "monk.ethereal-light": { glyph: "plus-fragile" },
  "monk.gift-of-health": { glyph: "gift-plus", modifier: "down" },
  "monk.live-vicariously": { glyph: "blow-plus", modifier: "upkeep" },
  "monk.purifying-veil": { glyph: "veil-drop", modifier: "upkeep" },
  "monk.pacifism": { glyph: "blade-struck" },
  "monk.watchful-spirit": { glyph: "eye-plus", modifier: "upkeep" },
  "monk.kirins-wrath": { glyph: "horn-ring" },
  "monk.signet-of-removal": { glyph: "signet-strip" },
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  "monk.judges-intervention": { glyph: "halo-heart-bar" },
  // Own-skill modifiers (#1761, #1855).
  "monk.divine-spirit": { glyph: "halo-bolt", modifier: "less" },
  "monk.blessed-aura": { glyph: "ring-figure-arrow" },
  "monk.healers-covenant": { glyph: "hands-plus" },
  "monk.holy-haste": { glyph: "plus-streaks" },
  // Death trigger (#1762, #1832): a skull and a plus.
  "monk.dwaynas-sorrow": { glyph: "death-heal" },
  // Skill-type and heal triggers (#1913)
  "monk.scribes-insight": { glyph: "scroll", modifier: "bolt" },
  // Caster staples (#1870).
  "monk.aura-of-stability": { glyph: "ring-mountain" },
  "monk.healing-ring": { glyph: "ring-healers" },
  // Caster staples 2 (#1872).
  "monk.vital-blessing": { glyph: "ring-heart" },
};

export default rows;
