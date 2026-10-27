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
  "ranger.throw-dirt": { glyph: "mountain", modifier: "area" },
  "warrior.sprint": { glyph: "speed" },
  "assassin.dash": { glyph: "dash" },
  "warrior.frenzy": { glyph: "sword", modifier: "clock" },
  "assassin.dark-escape": { glyph: "dash", modifier: "down" },
  "ranger.natural-stride": { glyph: "armor", modifier: "self" },
  "paragon.wild-throw": { glyph: "spear" },
  "warrior.healing-signet": { glyph: "heal", modifier: "self" },
  "warrior.watch-yourself": { glyph: "armor", modifier: "area" },
  "ranger.apply-poison": { glyph: "flask" },
  "elementalist.glyph-of-lesser-energy": { glyph: "energy", modifier: "less" },
  "elementalist.lightning-orb": { glyph: "lightning-orb" },
  "necromancer.rotting-flesh": { glyph: "germ" },
  "necromancer.enfeeble": { glyph: "sword", modifier: "down" },
  "necromancer.enfeebling-blood": { glyph: "sword", modifier: "area" },
  "paragon.anthem-of-flame": { glyph: "flame", modifier: "area" },
  "ritualist.weapon-of-warding": { glyph: "armor", modifier: "up" },
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
  "ranger.savage-shot": { glyph: "arrow" },
  "ranger.distracting-shot": { glyph: "interrupt", modifier: "less" },
  "mesmer.energy-burn": { glyph: "flame", modifier: "down" },
  "mesmer.energy-tap": { glyph: "energy", modifier: "self" },
  "mesmer.backfire": { glyph: "fireball", modifier: "self" },
  "mesmer.empathy": { glyph: "sword", modifier: "self" },
  "monk.mending": { glyph: "heal", modifier: "upkeep" },
  "elementalist.lightning-strike": { glyph: "lightning" },
  "elementalist.mind-shock": { glyph: "lightning", modifier: "down" },
  "elementalist.shard-storm": { glyph: "shard" },
  "elementalist.ice-spikes": { glyph: "shard", modifier: "area" },
  "elementalist.deep-freeze": { glyph: "snowflake", modifier: "area" },
  "mesmer.cry-of-frustration": { glyph: "interrupt", modifier: "area" },
  "mesmer.mantra-of-recovery": { glyph: "speed", modifier: "clock" },
  "necromancer.shadow-of-fear": { glyph: "slow", modifier: "area" },
  "mesmer.energy-surge": { glyph: "energy", modifier: "area" },
  "mesmer.leech-signet": { glyph: "interrupt", modifier: "self" },
  // A placeholder: no modifier yet says "per enchantment or hex" (#920).
  "monk.dwaynas-kiss": { glyph: "heal", modifier: "stun" },
  "warrior.cyclone-axe": { glyph: "axe", modifier: "area" },
  // A placeholder: no glyph yet says "adrenaline" (#936).
  "warrior.for-great-justice": { glyph: "axe", modifier: "self" },
  "monk.protective-spirit": { glyph: "armor", modifier: "clock" },
  // Your own blood, given: heal with the bleed drop (#936).
  "monk.infuse-health": { glyph: "heal", modifier: "bleed" },
  "paragon.spear-of-lightning": { glyph: "spear-bolt" },
  "paragon.never-surrender": { glyph: "banner", modifier: "area" },
  "paragon.leaders-comfort": { glyph: "banner-cross", modifier: "self" },
};
