/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  "dervish.mystic-sweep": { glyph: "sword", modifier: "up" },
  "dervish.mystic-regeneration": { glyph: "heal", modifier: "area" },
  "dervish.fleeting-stability": { glyph: "speed", modifier: "self" },
  "dervish.heart-of-fury": { glyph: "speed", modifier: "up" },
  "dervish.wounding-strike": { glyph: "axe", modifier: "down" },
  "dervish.signet-of-pious-light": { glyph: "heal", modifier: "less" },
  "dervish.pious-restoration": { glyph: "cleanse", modifier: "self" },
  "dervish.vow-of-strength": { glyph: "axe", modifier: "area" },
  "dervish.sand-shards": { glyph: "shard", modifier: "up" },
  "dervish.pious-haste": { glyph: "dash", modifier: "self" },
  "dervish.zealous-sweep": { glyph: "scythe", modifier: "area" },
  "dervish.mystic-twister": { glyph: "twister" },
  "dervish.victorious-sweep": { glyph: "axe", modifier: "self" },
  "dervish.eremites-attack": { glyph: "scythe", modifier: "up" },
  "dervish.staggering-force": { glyph: "mountain-crack", modifier: "area" },
  "dervish.dust-cloak": { glyph: "dust", modifier: "area" },
  "dervish.aura-of-thorns": { glyph: "thorns", modifier: "bleed" },
  // Flash enchantments (#1421, #1447).
  "dervish.enchanted-haste": { glyph: "haste-clean" },
  "dervish.heart-of-holy-flame": { glyph: "flame-halo" },
  "dervish.balthazars-rage": { glyph: "flame-bars" },
  "dervish.harriers-haste": { glyph: "chase" },
  // Forms (#1437, #1468): a figure in the god's shape, the god's mark on it.
  "dervish.avatar-of-melandru": { glyph: "avatar-earth" },
  "dervish.avatar-of-dwayna": { glyph: "avatar-wings" },
  "dervish.avatar-of-balthazar": { glyph: "avatar-flame" },
  "dervish.avatar-of-grenth": { glyph: "avatar-scythe" },
  "dervish.avatar-of-lyssa": { glyph: "avatar-chaos" },
  // Anti-summon (#1528, #1568): the skill's mark, a struck ghost below it.
  "dervish.banishing-strike": { glyph: "anti-summon-scythe" },
  // Scythe attacks that spend an enchantment share one mark: the broken ring (#1573).
  "dervish.mystic-sandstorm": { glyph: "sand-pulse" },
  "dervish.grenths-grasp": { glyph: "grasp" },
  "dervish.rending-aura": { glyph: "ring-rend" },
  "dervish.reapers-sweep": { glyph: "scythe-spend", modifier: "stun" },
  "dervish.pious-assault": { glyph: "scythe-spend", modifier: "clock" },
  "dervish.chilling-victory": { glyph: "scythe-frost" },
  "dervish.wearying-strike": { glyph: "scythe-spend", modifier: "bleed" },
  // Dervish staples 3 (#1707).
  "dervish.reap-impurities": { glyph: "scythe-purge" },
  "dervish.aura-slicer": { glyph: "ring-slice" },
  "dervish.crippling-victory": { glyph: "scythe-limp-star" },
  "dervish.lyssas-assault": { glyph: "scythe-burst" },
  "dervish.rending-touch": { glyph: "hand-rend" },
  "dervish.winds-of-disenchantment": { glyph: "wind-rend" },
  "dervish.signet-of-pious-restraint": { glyph: "signet-limp" },
  "dervish.onslaught": { glyph: "slash-bars" },
  "dervish.zealous-vow": { glyph: "spark-vow" },
  "dervish.featherfoot-grace": { glyph: "feather-swift" },
  "dervish.whirling-charge": { glyph: "spiral-charge" },
  // Dervish staples 2 (#1604, #1645): three scythe riders; the rest take their statuses' shapes.
  "dervish.irresistible-sweep": { glyph: "scythe-unblock" },
  "dervish.crippling-sweep": { glyph: "scythe-limp" },
  "dervish.rending-sweep": { glyph: "scythe-rend" },
  "dervish.pious-fury": { glyph: "slash-trio" },
  "dervish.zealous-renewal": { glyph: "spark-bars" },
  "dervish.mirage-cloak": { glyph: "shield-haze" },
  "dervish.vital-boon": { glyph: "heart-roof" },
  "dervish.guiding-hands": { glyph: "hand-arrow" },
  // The not condition (#1670, #1715): what the foe lacks, struck through.
  "dervish.test-of-faith": { glyph: "hand-bare" },
  // Own-skill modifiers (#1761, #1855).
  "dervish.extend-enchantments": { glyph: "scythe-stretch" },
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  "dervish.watchful-intervention": { glyph: "eye-bar" },
  "dervish.faithful-intervention": { glyph: "heart-bar" },
  // "N for each X" (#1760, #1850): the counted thing, its gift, three pips.
  "dervish.arcane-zeal": { glyph: "each-zeal" },
  "dervish.mystic-vigor": { glyph: "each-vigor" },
  // "Not enchanted" (#1916)
  "dervish.natural-healing": { glyph: "leaf", modifier: "plus" },
};

export default rows;
