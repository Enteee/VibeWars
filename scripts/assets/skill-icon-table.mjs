// One row per implemented skill: the glyph that shows its primary effect and
// an optional modifier that bends it (#719, docs/art/art-direction.md). The
// icon generator (icons.mjs) draws a row; the test in
// apps/web/src/ui/icons.test.ts checks every implemented skill has one and
// that no two rows are the same picture.
//
// A card that adds a skill to IMPLEMENTED_SKILLS adds its row here and runs
// `node scripts/assets/icons.mjs`. Start from the glyph for the skill's
// primary effect; the modifier tells apart skills that share one.

/**
 * @typedef {object} SkillIconRow
 * @property {string} glyph The shape for the primary effect.
 * @property {string} [modifier] The small mark at the bottom right.
 */

/** @type {Readonly<Record<string, SkillIconRow>>} */
export const SKILL_ICONS = {
  "monk.orison-of-healing": { glyph: "heal" },
  "monk.restore-life": { glyph: "resurrect" },
  "elementalist.fireball": { glyph: "fireball", modifier: "area" },
  "elementalist.chain-lightning": { glyph: "chain" },
  "warrior.swift-chop": { glyph: "axe" },
  "ranger.barrage": { glyph: "volley", modifier: "area" },
  "warrior.backbreaker": { glyph: "hammer", modifier: "down" },
  "necromancer.blood-renewal-lite": { glyph: "heal", modifier: "down" },
  "warrior.distracting-blow": { glyph: "interrupt" },
  "ranger.broad-head-arrow": { glyph: "arrow", modifier: "stun" },
  "necromancer.faintheartedness": { glyph: "slow" },
  "necromancer.weaken-armor": { glyph: "armor", modifier: "down" },
  "necromancer.malaise": { glyph: "energy", modifier: "down" },
  "necromancer.blood-ritual": { glyph: "energy", modifier: "up" },
  "necromancer.contagion": { glyph: "germ", modifier: "area" },
  "necromancer.parasitic-bond": { glyph: "chain", modifier: "down" },
  "elementalist.armor-of-earth": { glyph: "mountain" },
  "ranger.troll-unguent": { glyph: "heal", modifier: "clock" },
  "monk.mend-condition": { glyph: "cleanse" },
  "monk.guardian": { glyph: "armor" },
  "warrior.sever-artery": { glyph: "sword", modifier: "bleed" },
  "warrior.eviscerate": { glyph: "axe", modifier: "bleed" },
  "warrior.disrupting-chop": { glyph: "axe", modifier: "stun" },
  "warrior.executioners-strike": { glyph: "axe", modifier: "up" },
  "assassin.jagged-strike": { glyph: "dagger", modifier: "bleed" },
  "assassin.black-lotus-strike": { glyph: "dagger", modifier: "up" },
  "assassin.fox-fangs": { glyph: "dagger" },
  "assassin.wild-strike": { glyph: "dagger", modifier: "down" },
  "assassin.death-blossom": { glyph: "dagger", modifier: "area" },
  "assassin.twisting-fangs": { glyph: "dagger", modifier: "clock" },
  "assassin.horns-of-the-ox": { glyph: "dagger", modifier: "stun" },
  "assassin.moebius-strike": { glyph: "dagger", modifier: "self" },
  "ranger.punishing-shot": { glyph: "arrow", modifier: "up" },
  "ranger.pin-down": { glyph: "pin", modifier: "less" },
  "ranger.hunters-shot": { glyph: "arrow", modifier: "bleed" },
  // Placeholders until asset-designer's icons (#1008).
  "ranger.crippling-shot": { glyph: "arrow", modifier: "clock" },
  "ranger.debilitating-shot": { glyph: "arrow", modifier: "less" },
  "ranger.burning-arrow": { glyph: "flame", modifier: "up" },
  "ranger.throw-dirt": { glyph: "mountain", modifier: "area" },
  "warrior.sprint": { glyph: "speed" },
  "assassin.dash": { glyph: "dash" },
  "warrior.frenzy": { glyph: "sword", modifier: "clock" },
  "assassin.dark-escape": { glyph: "dash", modifier: "down" },
  "ranger.natural-stride": { glyph: "armor", modifier: "self" },
  "ranger.lightning-reflexes": { glyph: "shield-bolt" },
  "ranger.escape": { glyph: "retreat" },
  "paragon.wild-throw": { glyph: "spear" },
  // A placeholder: the bleed mark stands in for its Deep Wound (#921).
  "paragon.cruel-spear": { glyph: "spear", modifier: "bleed" },
  "warrior.healing-signet": { glyph: "heal", modifier: "self" },
  "warrior.watch-yourself": { glyph: "armor", modifier: "area" },
  "paragon.fall-back": { glyph: "speed", modifier: "area" },
  // A placeholder: no modifier yet says "while not moving" (#921).
  "paragon.stand-your-ground": { glyph: "armor", modifier: "clock" },
  // Placeholders until asset-designer's icons (#956).
  "paragon.incoming": { glyph: "speed-heal" },
  "paragon.make-haste": { glyph: "dash", modifier: "up" },
  "paragon.defensive-anthem": { glyph: "anthem-shield" },
  // A placeholder: the healing banner, for the party in earshot (#999).
  "paragon.song-of-restoration": { glyph: "banner-cross", modifier: "area" },
  "ranger.apply-poison": { glyph: "flask" },
  "elementalist.glyph-of-lesser-energy": { glyph: "energy", modifier: "less" },
  "elementalist.lightning-orb": { glyph: "lightning-orb" },
  "necromancer.rotting-flesh": { glyph: "germ" },
  "necromancer.enfeeble": { glyph: "sword", modifier: "down" },
  "necromancer.enfeebling-blood": { glyph: "sword", modifier: "area" },
  "paragon.anthem-of-flame": { glyph: "flame", modifier: "area" },
  "ritualist.weapon-of-warding": { glyph: "armor", modifier: "up" },
  "ritualist.mend-body-and-soul": { glyph: "plaster", modifier: "area" },
  "ritualist.spirit-light": { glyph: "plaster", modifier: "bleed" },
  "ritualist.wielders-boon": { glyph: "sword-heal" },
  "ritualist.spirit-light-weapon": { glyph: "blade-plus" },
  "ritualist.weapon-of-quickening": { glyph: "blade-turn" },
  "ritualist.weapon-of-aggression": { glyph: "blade-fast" },
  "mesmer.power-spike": { glyph: "interrupt", modifier: "down" },
  "mesmer.power-drain": { glyph: "interrupt", modifier: "up" },
  "mesmer.power-block": { glyph: "interrupt", modifier: "clock" },
  "mesmer.shatter-enchantment": { glyph: "cleanse", modifier: "down" },
  "mesmer.drain-enchantment": { glyph: "cleanse", modifier: "up" },
  "monk.word-of-healing": { glyph: "heal", modifier: "up" },
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
  "dervish.zealous-sweep": { glyph: "energy", modifier: "clock" },
  "dervish.mystic-twister": { glyph: "snowflake", modifier: "self" },
  "dervish.victorious-sweep": { glyph: "axe", modifier: "self" },
  "dervish.eremites-attack": { glyph: "axe", modifier: "less" },
  "dervish.staggering-force": { glyph: "mountain", modifier: "self" },
  "dervish.dust-cloak": { glyph: "shard", modifier: "self" },
  "dervish.aura-of-thorns": { glyph: "shard", modifier: "bleed" },
  "ranger.savage-shot": { glyph: "arrow" },
  // A placeholder until asset-designer's icon (#1008).
  "ranger.concussion-shot": { glyph: "interrupt", modifier: "stun" },
  "ranger.distracting-shot": { glyph: "interrupt", modifier: "less" },
  "mesmer.energy-burn": { glyph: "flame", modifier: "down" },
  "mesmer.energy-tap": { glyph: "energy", modifier: "self" },
  "mesmer.backfire": { glyph: "fireball", modifier: "self" },
  "mesmer.empathy": { glyph: "sword", modifier: "self" },
  "mesmer.diversion": { glyph: "slow", modifier: "clock" },
  "monk.mending": { glyph: "heal", modifier: "upkeep" },
  "elementalist.lightning-strike": { glyph: "lightning" },
  "elementalist.mind-shock": { glyph: "lightning", modifier: "down" },
  "elementalist.shard-storm": { glyph: "shard" },
  "elementalist.ice-spikes": { glyph: "shard", modifier: "area" },
  "elementalist.deep-freeze": { glyph: "snowflake", modifier: "area" },
  // Placeholders until asset-designer's icons (#985).
  "elementalist.blinding-flash": { glyph: "lightning", modifier: "less" },
  "elementalist.shock": { glyph: "lightning", modifier: "stun" },
  "elementalist.aftershock": { glyph: "mountain", modifier: "down" },
  "elementalist.meteor": { glyph: "fireball", modifier: "stun" },
  // Placeholders until asset-designer's icons (#997).
  "elementalist.water-trident": { glyph: "spear", modifier: "stun" },
  "elementalist.searing-flames": { glyph: "flame" },
  "elementalist.ebon-hawk": { glyph: "mountain", modifier: "less" },
  "elementalist.stoning": { glyph: "mountain", modifier: "stun" },
  "mesmer.cry-of-frustration": { glyph: "interrupt", modifier: "area" },
  "mesmer.mantra-of-recovery": { glyph: "speed", modifier: "clock" },
  "necromancer.shadow-of-fear": { glyph: "slow", modifier: "area" },
  "monk.patient-spirit": { glyph: "heal", modifier: "hourglass" },
  "monk.holy-veil": { glyph: "armor", modifier: "upkeep" },
  "necromancer.rend-enchantments": { glyph: "cleanse", modifier: "bleed" },
  "necromancer.plague-touch": { glyph: "germ", modifier: "self" },
  "mesmer.energy-surge": { glyph: "energy", modifier: "area" },
  "mesmer.leech-signet": { glyph: "interrupt", modifier: "self" },
  // A placeholder: no modifier yet says "per enchantment or hex" (#920).
  "monk.dwaynas-kiss": { glyph: "heal", modifier: "stun" },
  // A placeholder: the loop reads as the spin; axe/area is Vow of Strength's (#936).
  "warrior.cyclone-axe": { glyph: "axe", modifier: "upkeep" },
  // A shout for yourself: the banner with the self mark (#936).
  "warrior.for-great-justice": { glyph: "banner", modifier: "clock" },
  // A hit taken is capped: armor with the "less" mark (#936).
  "monk.protective-spirit": { glyph: "armor", modifier: "less" },
  // Your own life, given: the resurrect glyph with the bleed drop (#936).
  "monk.infuse-health": { glyph: "resurrect", modifier: "bleed" },
  // A placeholder: a plain heal on someone else, the plaster (#987).
  "monk.heal-other": { glyph: "plaster" },
  // A placeholder: armor that turns the blood drop into health (#987).
  "monk.reversal-of-fortune": { glyph: "armor", modifier: "bleed" },
  // A placeholder: a hex removed, a burst around the ally (#987).
  "monk.smite-hex": { glyph: "cleanse", modifier: "area" },
  // A placeholder: every condition removed; no modifier says "all" (#987).
  "monk.restore-condition": { glyph: "cleanse", modifier: "stun" },
  "paragon.spear-of-lightning": { glyph: "spear-bolt" },
  "paragon.never-surrender": { glyph: "banner", modifier: "area" },
  "paragon.leaders-comfort": { glyph: "banner-cross", modifier: "self" },
  // Placeholders from existing glyphs (#935).
  "necromancer.spiteful-spirit": { glyph: "fireball", modifier: "down" },
  "necromancer.insidious-parasite": { glyph: "chain", modifier: "self" },
  "necromancer.mark-of-pain": { glyph: "hammer", modifier: "area" },
  "necromancer.vampiric-gaze": { glyph: "heal", modifier: "bleed" },
  // Placeholders until asset-designer's icons (#988).
  "assassin.deaths-charge": { glyph: "dash", modifier: "stun" },
  "assassin.shadow-refuge": { glyph: "plaster", modifier: "clock" },
  "assassin.shroud-of-distress": { glyph: "armor", modifier: "stun" },
  "assassin.critical-eye": { glyph: "dagger", modifier: "hourglass" },
};
