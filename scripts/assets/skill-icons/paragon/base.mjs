/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  "paragon.wild-throw": { glyph: "spear" },
  // A placeholder: the bleed mark stands in for its Deep Wound (#921).
  "paragon.cruel-spear": { glyph: "spear", modifier: "bleed" },
  "paragon.barbed-spear": { glyph: "spear-barb", modifier: "bleed" },
  "paragon.maiming-spear": { glyph: "spear", modifier: "down" },
  "paragon.merciless-spear": { glyph: "spear", modifier: "half" },
  "paragon.stunning-strike": { glyph: "spear", modifier: "stun" },
  "paragon.harriers-toss": { glyph: "spear-dash" },
  "paragon.fall-back": { glyph: "speed", modifier: "area" },
  // A placeholder: no modifier yet says "while not moving" (#921).
  "paragon.stand-your-ground": { glyph: "armor", modifier: "clock" },
  // The paragon's shout and chant glyphs, drawn to match their statuses (#956).
  "paragon.incoming": { glyph: "speed-heal" },
  "paragon.make-haste": { glyph: "dash", modifier: "up" },
  "paragon.defensive-anthem": { glyph: "anthem-shield" },
  // A banner with a note: a song for every ally in earshot, with the heal mark (#1012).
  "paragon.song-of-restoration": { glyph: "banner-note", modifier: "plus" },
  "paragon.anthem-of-flame": { glyph: "flame", modifier: "area" },
  // "With their next skill" chants: the corner mark is the trigger, the picture the payoff (#1497).
  "paragon.zealous-anthem": { glyph: "next-attack-energy" },
  "paragon.aria-of-zeal": { glyph: "next-spell-energy" },
  "paragon.lyric-of-zeal": { glyph: "next-signet-energy" },
  "paragon.aria-of-restoration": { glyph: "next-spell-heart-plus" },
  "paragon.chorus-of-restoration": { glyph: "next-chant-heart-plus" },
  "paragon.lyric-of-purification": { glyph: "next-signet-cleanse" },
  "paragon.song-of-purification": { glyph: "next-any-cleanse" },
  "paragon.hexbreaker-aria": { glyph: "next-spell-hex-cut" },
  "paragon.anthem-of-fury": { glyph: "next-attack-adrenaline" },
  "paragon.anthem-of-weariness": { glyph: "next-attack-drop-weak" },
  "paragon.crippling-anthem": { glyph: "next-attack-limp" },
  "paragon.anthem-of-disruption": { glyph: "next-attack-interrupt" },
  // Paragon chants 3 (#1505, #1558): the next skill is uninterruptible, unblockable, cheaper or hits harder.
  "paragon.song-of-concentration": { glyph: "next-any-uninterruptible" },
  "paragon.anthem-of-guidance": { glyph: "next-attack-unblockable" },
  "paragon.energizing-chorus": { glyph: "next-chant-cheaper" },
  "paragon.anthem-of-envy": { glyph: "next-attack-vs-healthy" },
  "paragon.spear-of-lightning": { glyph: "spear-bolt" },
  "paragon.never-surrender": { glyph: "banner", modifier: "area" },
  "paragon.leaders-comfort": { glyph: "banner-cross", modifier: "self" },
  "paragon.signet-of-return": { glyph: "resurrect-return" },
  // Paragon echoes (#1423, #1482): a refrain's corner is a turning arrow, a finale's a spark.
  "paragon.aggressive-refrain": { glyph: "blade-fast", modifier: "renew" },
  "paragon.blazing-finale": { glyph: "flame-ring", modifier: "finale" },
  "paragon.burning-refrain": { glyph: "flame-target", modifier: "renew" },
  "paragon.enduring-harmony": { glyph: "note-hold" },
  "paragon.finale-of-restoration": { glyph: "heart-plus", modifier: "finale" },
  "paragon.hasty-refrain": { glyph: "speed", modifier: "renew" },
  "paragon.mending-refrain": { glyph: "ring-heal", modifier: "renew" },
  "paragon.purifying-finale": { glyph: "cleanse", modifier: "finale" },
  // Paragon echoes 2 (#1485, #1524): a glancing blade, a ringed bolt, a spiked blade.
  "paragon.bladeturn-refrain": { glyph: "shield-glance", modifier: "renew" },
  "paragon.energizing-finale": { glyph: "energy-ring", modifier: "finale" },
  "paragon.soldiers-fury": { glyph: "blade-fury" },
  // Paragon spears (#1486, #1508): a spear and its rider; the drop badge is Deep Wound.
  "paragon.blazing-spear": { glyph: "spear-flame" },
  "paragon.mighty-throw": { glyph: "spear-fast" },
  "paragon.unblockable-throw": { glyph: "spear-pierce" },
  "paragon.wearying-spear": { glyph: "spear-weak" },
  "paragon.vicious-attack": { glyph: "spear-crit", modifier: "bleed" },
  "paragon.disrupting-throw": { glyph: "spear-burst" },
  "paragon.slayers-spear": { glyph: "spear-heart", modifier: "bleed" },
  "paragon.swift-javelin": { glyph: "spear-pierce", modifier: "bolt" },
  "paragon.chest-thumper": { glyph: "spear-crack", modifier: "bleed" },
  "paragon.spear-of-redemption": { glyph: "spear-cleanse" },
  "paragon.spear-swipe": { glyph: "spear-swipe", modifier: "stun" },
  // Anti-summon (#1528, #1568): the skill's mark, a struck ghost below it.
  "paragon.holy-spear": { glyph: "anti-summon-spear" },
  // Paragon staples 4 (#1737).
  "paragon.go-for-the-eyes": { glyph: "eye-crit" },
  "paragon.never-give-up": { glyph: "bolt-plus" },
  "paragon.the-power-is-yours": { glyph: "bolt-pips" },
  "paragon.its-just-a-flesh-wound": { glyph: "drop-cure-run" },
  "paragon.focused-anger": { glyph: "bars-rise" },
  "paragon.awe": { glyph: "bar-daze" },
  "paragon.glowing-signet": { glyph: "signet-glow" },
  "paragon.signet-of-aggression": { glyph: "signet-blade" },
  "paragon.remedy-signet": { glyph: "signet-cure" },
  // The not condition (#1670, #1715): what the foe lacks, struck through.
  "paragon.signet-of-synergy": { glyph: "signet-plus-bare" },
  // "Not enchanted" (#1916)
  "paragon.natural-temper": { glyph: "leaf", modifier: "up" },
};

export default rows;
