/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  "mesmer.power-spike": { glyph: "interrupt", modifier: "down" },
  "mesmer.power-drain": { glyph: "interrupt", modifier: "up" },
  "mesmer.power-block": { glyph: "interrupt", modifier: "clock" },
  "mesmer.shatter-enchantment": { glyph: "cleanse", modifier: "down" },
  "mesmer.drain-enchantment": { glyph: "cleanse", modifier: "up" },
  "mesmer.energy-burn": { glyph: "flame", modifier: "down" },
  "mesmer.energy-tap": { glyph: "energy", modifier: "plus" },
  "mesmer.backfire": { glyph: "fireball", modifier: "self" },
  "mesmer.empathy": { glyph: "sword", modifier: "self" },
  "mesmer.diversion": { glyph: "slow", modifier: "clock" },
  "mesmer.cry-of-frustration": { glyph: "interrupt", modifier: "area" },
  "mesmer.mantra-of-recovery": { glyph: "speed", modifier: "clock" },
  // Mantras (#1981): one frame, and what each holds against.
  "mesmer.mantra-of-concentration": { glyph: "mantra-burst-struck" },
  "mesmer.mantra-of-resolve": { glyph: "mantra-shield" },
  "mesmer.mantra-of-earth": { glyph: "mantra-rock" },
  "mesmer.mantra-of-flame": { glyph: "mantra-flame" },
  "mesmer.mantra-of-frost": { glyph: "mantra-frost" },
  "mesmer.mantra-of-lightning": { glyph: "mantra-lightning" },
  "mesmer.energy-surge": { glyph: "energy", modifier: "area" },
  "mesmer.leech-signet": { glyph: "interrupt", modifier: "self" },
  // A skill seen again: a spell, or any skill, echoed on (#1136).
  "mesmer.arcane-echo": { glyph: "echo-spell", modifier: "clock" },
  "mesmer.echo": { glyph: "echo-skill" },
  "mesmer.inspired-enchantment": { glyph: "take-ench-in" },
  "mesmer.revealed-enchantment": { glyph: "take-ench-rev" },
  "mesmer.inspired-hex": { glyph: "take-hex-in" },
  "mesmer.revealed-hex": { glyph: "take-hex-rev" },
  "mesmer.arcane-thievery": { glyph: "take-skill" },
  "mesmer.arcane-larceny": { glyph: "take-skills" },
  // Illusion hexes and haste: each glyph shows the status it leaves, so the cripple and the cracks read apart (#1243).
  "mesmer.conjure-phantasm": { glyph: "ghost", modifier: "down" },
  "mesmer.imagined-burden": { glyph: "weight", modifier: "half" },
  "mesmer.phantom-pain": { glyph: "ache-cross", modifier: "hourglass" },
  "mesmer.shrinking-armor": { glyph: "armor-shrink", modifier: "hourglass" },
  "mesmer.illusion-of-haste": { glyph: "speed-break", modifier: "self" },
  "mesmer.ineptitude": { glyph: "eye-slash", modifier: "area" },
  "mesmer.crippling-anguish": { glyph: "limp-drain" },
  "mesmer.hex-breaker": { glyph: "hex-return" },
  // Skill-use punishers (#1473, #1534): the hex ring round a small picture of the punishment; elites wear the UI's gold frame.
  "mesmer.wastrels-worry": { glyph: "hex-hourglass" },
  "mesmer.overload": { glyph: "hex-overload" },
  "mesmer.frustration": { glyph: "orb-split" },
  "mesmer.price-of-pride": { glyph: "hex-crown", modifier: "half" },
  "mesmer.signet-of-humility": { glyph: "crown-struck" },
  "mesmer.migraine": { glyph: "hex-ache", modifier: "hourglass" },
  "mesmer.visions-of-regret": { glyph: "eye-tear" },
  "mesmer.unnatural-signet": { glyph: "hex-splash" },
  // The next spell fails (#1475, #1498): a struck orb, a foe's X or an ally's plus after it.
  "mesmer.guilt": { glyph: "hex-fail-foe", modifier: "bolt" },
  "mesmer.shame": { glyph: "hex-fail-ally", modifier: "bolt" },
  "mesmer.mistrust": { glyph: "hex-fail-foe", modifier: "area" },
  "mesmer.fragility": { glyph: "hex-churn", modifier: "area" },
  // Mesmer staples (#1570, #1594).
  "mesmer.power-leak": { glyph: "interrupt-energy-cut" },
  "mesmer.blackout": { glyph: "skills-off" },
  "mesmer.shatter-hex": { glyph: "hex-shatter" },
  "mesmer.psychic-instability": { glyph: "interrupt-knockdown" },
  "mesmer.arcane-conundrum": { glyph: "hex-slow-star" },
  // Crowd punishers (#1501, #1555): the shared hex ring; Epidemic is a condition spell with none.
  "mesmer.panic": { glyph: "hex-panic" },
  "mesmer.wastrels-demise": { glyph: "hex-rising" },
  "mesmer.epidemic": { glyph: "drop-spread" },
  // Anti-summon (#1528, #1568): the skill's mark, a struck ghost below it.
  "mesmer.spiritual-pain": { glyph: "anti-summon-pain" },
  // Mesmer staples 3 (#1627, #1666).
  "mesmer.ether-feast": { glyph: "energy-feast" },
  "mesmer.drain-delusions": { glyph: "hex-energy-feast" },
  "mesmer.signet-of-disruption": { glyph: "hex-interrupt" },
  "mesmer.wandering-eye": { glyph: "eye-burst" },
  "mesmer.hex-eater-vortex": { glyph: "vortex-hex" },
  // Clumsiness (#1593, #1619): the hex ring round a dropped blade.
  "mesmer.clumsiness": { glyph: "hex-sword-drop" },
  // The not condition (#1670, #1715): what the foe lacks, struck through.
  "mesmer.waste-not-want-not": { glyph: "energy-quiet" },
  // Attribute hexes (#1765).
  "mesmer.shatter-delusions": { glyph: "hex-shards" },
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  "mesmer.illusion-of-weakness": { glyph: "haze-heart-bar" },
  // "N for each X" (#1760, #1850): the counted thing, its gift, three pips.
  "mesmer.channeling": { glyph: "each-channeling" },
  // Casting-state hexes (#1931)
  "mesmer.power-leech": { glyph: "bolt-ring" },
  "mesmer.power-flux": { glyph: "burst-bolt", modifier: "down" },
  // Caster staples (#1870).
  "mesmer.ethereal-burden": { glyph: "hex-burden" },
  "mesmer.sum-of-all-fears": { glyph: "hex-ghost" },
  // Caster staples 2 (#1872).
  "mesmer.elemental-resistance": { glyph: "shield-flame" },
  "mesmer.physical-resistance": { glyph: "shield-blow" },
  // Attributes set or borrowed (#1929).
  "mesmer.signet-of-illusions": { glyph: "bars-lent" },
};

export default rows;
