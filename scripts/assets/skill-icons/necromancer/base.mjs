/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  "necromancer.blood-renewal-lite": { glyph: "heal", modifier: "down" },
  "necromancer.faintheartedness": { glyph: "slow" },
  "necromancer.weaken-armor": { glyph: "armor", modifier: "down" },
  "necromancer.malaise": { glyph: "energy", modifier: "down" },
  "necromancer.blood-ritual": { glyph: "energy", modifier: "up" },
  "necromancer.contagion": { glyph: "germ", modifier: "area" },
  "necromancer.parasitic-bond": { glyph: "chain", modifier: "down" },
  "necromancer.rotting-flesh": { glyph: "germ" },
  "necromancer.enfeeble": { glyph: "sword", modifier: "down" },
  "necromancer.enfeebling-blood": { glyph: "sword", modifier: "area" },
  "necromancer.shadow-of-fear": { glyph: "slow", modifier: "area" },
  "necromancer.rend-enchantments": { glyph: "cleanse", modifier: "bleed" },
  "necromancer.plague-touch": { glyph: "germ", modifier: "self" },
  // Shapes of their statuses (#935).
  "necromancer.spiteful-spirit": { glyph: "hex-burst" },
  "necromancer.insidious-parasite": { glyph: "drop-arrow" },
  "necromancer.mark-of-pain": { glyph: "pain-cross" },
  "necromancer.vampiric-gaze": { glyph: "eye-drop" },
  // Health taken from a corpse: the heal glyph with the corpse mark (#1075).
  "necromancer.soul-feast": { glyph: "heal", modifier: "corpse" },
  "necromancer.well-of-suffering": { glyph: "well-sink", modifier: "corpse" },
  // Wells (#1730).
  "necromancer.well-of-blood": { glyph: "well-regen" },
  "necromancer.well-of-power": { glyph: "well-regen-energy" },
  "necromancer.well-of-weariness": { glyph: "well-drain" },
  // Wells 2 (#1749).
  "necromancer.well-of-the-profane": { glyph: "well-profane" },
  "necromancer.well-of-silence": { glyph: "well-silence" },
  "necromancer.well-of-darkness": { glyph: "well-darkness" },
  "necromancer.well-of-ruin": { glyph: "well-ruin" },
  // Bodies raised from a corpse: a skull pack, and one horned skull (#1112).
  "necromancer.animate-bone-minions": { glyph: "bone-minions" },
  "necromancer.animate-bone-horror": { glyph: "bone-horror" },
  // Minions 2 (#1836), art #1860.
  "necromancer.animate-vampiric-horror": { glyph: "vampire-horror" },
  "necromancer.animate-flesh-golem": { glyph: "golem" },
  "necromancer.animate-shambling-horror": { glyph: "bleed-horror" },
  "necromancer.putrid-flesh": { glyph: "rot-flesh", modifier: "area" },
  "necromancer.feast-for-the-dead": { glyph: "feast-jaw", modifier: "plus" },
  "necromancer.barbs": { glyph: "hex-barbs" },
  "necromancer.price-of-failure": { glyph: "hex-miss" },
  "necromancer.suffering": { glyph: "hex-drain" },
  "necromancer.defile-flesh": { glyph: "hex-heal-cut" },
  "necromancer.rigor-mortis": { glyph: "hex-nobloc" },
  "necromancer.lingering-curse": { glyph: "hex-drain-cut" },
  "necromancer.vampiric-touch": { glyph: "drop-touch" },
  "necromancer.vampiric-swarm": { glyph: "drop-trio" },
  "necromancer.shadow-strike": { glyph: "drop-half" },
  "necromancer.blood-of-the-aggressor": { glyph: "drop-weak" },
  "necromancer.barbed-signet": { glyph: "drop-barbs", modifier: "bleed" },
  "necromancer.offering-of-blood": { glyph: "drop-energy" },
  // Hex and enchantment gain triggers (#1403, #1440): a corner cue, a payoff.
  "necromancer.soul-barbs": { glyph: "gain-barbs" },
  "necromancer.defile-defenses": { glyph: "gain-shield" },
  // Necro/Ele/Ranger staples (#1540, #1572).
  "necromancer.blood-is-power": { glyph: "sac-energy" },
  "necromancer.order-of-pain": { glyph: "sac-blade" },
  "necromancer.plague-signet": { glyph: "drop-to-signet" },
  // Touch skills (#1643, #1666).
  "necromancer.vile-touch": { glyph: "hand-skull" },
  "necromancer.touch-of-agony": { glyph: "hand-drop-bolt" },
  "necromancer.wallows-bite": { glyph: "jaws-bolt" },
  "necromancer.vampiric-bite": { glyph: "jaws-drop" },
  // Target Health loss (#1648, #1680).
  "necromancer.enfeebling-touch": { glyph: "hand-drop-weak" },
  "necromancer.pain-of-disenchantment": { glyph: "ring-rend-burst" },
  // Necromancer staples 2 (#1583): the shapes of their statuses where they have one.
  "necromancer.wither": { glyph: "hex-wither" },
  "necromancer.life-siphon": { glyph: "drop-siphon" },
  "necromancer.reckless-haste": { glyph: "hex-haste-miss" },
  "necromancer.corrupt-enchantment": { glyph: "ring-rot" },
  "necromancer.strip-enchantment": { glyph: "ring-steal" },
  "necromancer.deathly-chill": { glyph: "chill-skull" },
  "necromancer.putrid-explosion": { glyph: "burst-skull" },
  "necromancer.signet-of-agony": { glyph: "signet-agony" },
  // Necromancer staples 3 (#1640, #1651): a gauge under or over half for the Health riders; the cold spells share the snowflake.
  "necromancer.dark-pact": { glyph: "drop-sac-bolt" },
  "necromancer.lifebane-strike": { glyph: "drop-arrow-high" },
  "necromancer.taste-of-pain": { glyph: "heal-drop-low" },
  "necromancer.signet-of-lost-souls": { glyph: "signet-low" },
  "necromancer.fetid-ground": { glyph: "snowflake-ground" },
  "necromancer.toxic-chill": { glyph: "snowflake-hexed" },
  "necromancer.bitter-chill": { glyph: "snowflake-recharge" },
  "necromancer.rip-enchantment": { glyph: "ring-rip-bleed" },
  "necromancer.gaze-of-contempt": { glyph: "eye-high" },
  // Death triggers (#1762, #1832): a skull and what its death gives.
  "necromancer.reapers-mark": { glyph: "death-bolt" },
  "necromancer.putrid-bile": { glyph: "death-bile" },
  "necromancer.icy-veins": { glyph: "death-frost" },
  // "N for each X" (#1760, #1850): the counted thing, its gift, three pips.
  "necromancer.desecrate-enchantments": { glyph: "each-desecrate" },
  "necromancer.defile-enchantments": { glyph: "each-defile" },
  // Skill-type and heal triggers (#1913)
  "necromancer.cacophony": { glyph: "horn" },
  "necromancer.soul-bind": { glyph: "plus-ring", modifier: "down" },
  // Casting-state hexes (#1931)
  "necromancer.spinal-shivers": { glyph: "spine", modifier: "stun" },
  "necromancer.shivers-of-dread": { glyph: "frost", modifier: "stun" },
  "necromancer.death-nova": { glyph: "nova", modifier: "corpse" },
  // Caster staples (#1870).
  "necromancer.blood-renewal": { glyph: "drop-plus" },
  "necromancer.meekness": { glyph: "hex-sword-limp" },
  // Caster staples 2 (#1872).
  "necromancer.vocal-minority": { glyph: "hex-bubble-cut" },
  // Minions 3, attribute and trigger skills (#1915, #1929, #1913).
  "necromancer.order-of-undeath": { glyph: "skull-order" },
  "necromancer.aura-of-the-lich": { glyph: "skull-aura" },
  "necromancer.infuse-condition": { glyph: "drop-skull" },
  "necromancer.taste-of-death": { glyph: "skull-heal" },
  "necromancer.wail-of-doom": { glyph: "bars-wail" },
  "necromancer.atrophy": { glyph: "bars-wilt" },
};

export default rows;
