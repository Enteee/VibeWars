import { describe, expect, it } from "vitest";

import { getSkill } from "../../../skills/catalog.js";
import { worthPrecasting } from "./precast.js";

/** Real skills, and whether a bot precasts each in the spawn bubble (#3910). */
const TABLE: readonly (readonly [string, boolean])[] = [
  // On the caster or an ally only: an enchantment, a stance, a shout, a
  // preparation, a glyph, a signet, a heal.
  ["monk.mending", true],
  ["elementalist.aura-of-restoration", true],
  ["warrior.frenzy", true],
  ["warrior.for-great-justice", true],
  ["monk.protective-spirit", true],
  ["monk.heal-other", true],
  ["monk.orison-of-healing", true],
  ["ranger.apply-poison", true],
  ["elementalist.glyph-of-lesser-energy", true],
  ["warrior.healing-signet", true],
  ["necromancer.blood-ritual", true],
  ["ritualist.spirit-light", true],
  ["dervish.vow-of-strength", true],
  // At a foe, an attack, a hex, a summon, a ward, a well, or damage near an ally.
  ["elementalist.fireball", false],
  ["elementalist.flare", false],
  ["warrior.sever-artery", false],
  ["monk.holy-strike", false],
  ["mesmer.empathy", false],
  ["ritualist.painful-bond", false],
  ["mesmer.energy-surge", false],
  ["necromancer.animate-bone-minions", false],
  ["ranger.edge-of-extinction", false],
  ["elementalist.ward-against-melee", false],
  ["necromancer.well-of-blood", false],
  ["monk.smite-hex", false],
  ["assassin.deaths-charge", false],
];

describe("worthPrecasting (#3910)", () => {
  it.each(TABLE)("%s: %s", (id, allowed) => {
    const skill = getSkill(id);
    expect(skill, id).toBeDefined();
    expect(skill === undefined ? undefined : worthPrecasting(skill)).toBe(allowed);
  });
});
