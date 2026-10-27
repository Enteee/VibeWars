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
  "elementalist.fireball": { glyph: "fireball", modifier: "area" },
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
  "elementalist.armor-of-earth": { glyph: "mountain" },
  "ranger.troll-unguent": { glyph: "heal", modifier: "clock" },
  "monk.mend-condition": { glyph: "cleanse" },
  "monk.guardian": { glyph: "armor" },
  "warrior.sever-artery-lite": { glyph: "sword", modifier: "bleed" },
  "warrior.sprint": { glyph: "speed" },
  "assassin.dash": { glyph: "dash" },
  "paragon.wild-throw": { glyph: "spear" },
  "warrior.healing-signet": { glyph: "heal", modifier: "self" },
  "warrior.watch-yourself": { glyph: "armor", modifier: "area" },
  "ranger.apply-poison": { glyph: "flask" },
  "elementalist.glyph-of-lesser-energy": { glyph: "energy", modifier: "less" },
  "necromancer.rotting-flesh": { glyph: "germ" },
  "necromancer.enfeeble": { glyph: "sword", modifier: "down" },
  "paragon.anthem-of-flame": { glyph: "flame", modifier: "area" },
  "ritualist.weapon-of-warding": { glyph: "armor", modifier: "up" },
  "mesmer.power-spike": { glyph: "interrupt", modifier: "down" },
  "mesmer.power-drain": { glyph: "interrupt", modifier: "up" },
  "mesmer.shatter-enchantment": { glyph: "cleanse", modifier: "down" },
  "mesmer.drain-enchantment": { glyph: "cleanse", modifier: "up" },
};
