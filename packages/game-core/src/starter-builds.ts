import type { PlayerBuild } from "./build.js";
import type { ArmorSet, EquippedRune, InsigniaId } from "./equipment/index.js";

/**
 * Curated starter builds (#851): what a player gets when they bring no
 * build of their own, or one the host refuses.
 *
 * Each is a legal two-profession build a player could make in the
 * editor, fully specced: eight skills, every attribute point spent, a
 * weapon every attack skill on the bar can use, and runes and insignias
 * where they help. Each plays on its own: damage, a heal or a defence,
 * and an interrupt, a condition or a removal.
 *
 * Adding a build is one more entry here and nothing else; the tests walk
 * the whole list.
 */

/** Five armor pieces with one insignia throughout and these runes. */
function armor(
  insigniaId: InsigniaId,
  runes: Partial<Record<keyof ArmorSet, EquippedRune>>,
): ArmorSet {
  const piece = (slot: keyof ArmorSet) => ({ insigniaId, rune: runes[slot] ?? null });
  return {
    head: piece("head"),
    chest: piece("chest"),
    hands: piece("hands"),
    legs: piece("legs"),
    feet: piece("feet"),
  };
}

const MINOR = "minor";
const SUPERIOR = "superior";

const VIGOR: EquippedRune = { kind: "universal", runeId: "vigor", tier: SUPERIOR };
const VITAE: EquippedRune = { kind: "universal", runeId: "vitae", tier: MINOR };
const ATTUNEMENT: EquippedRune = { kind: "universal", runeId: "attunement", tier: SUPERIOR };
const RESTORATION: EquippedRune = { kind: "universal", runeId: "restoration", tier: MINOR };

/** A minor rune: +1 rank for no health. */
function minorRune(attributeId: string): EquippedRune {
  return { kind: "attribute", attributeId, tier: MINOR };
}

/** A caster's armor: Radiant for energy, the top attribute's minor rune. */
function casterArmor(topAttributeId: string): ArmorSet {
  return armor("radiant", {
    head: minorRune(topAttributeId),
    chest: VIGOR,
    hands: ATTUNEMENT,
    legs: VITAE,
  });
}

export const STARTER_BUILDS: readonly PlayerBuild[] = [
  {
    // Keeps the team up, cleanses and raises the fallen; the Glyph pays
    // for a Fireball or Chain Lightning when nobody needs healing.
    name: "Monk/Elementalist",
    primaryProfession: "monk",
    secondaryProfession: "elementalist",
    attributes: [
      { attributeId: "monk.healing-prayers", rank: 12 },
      { attributeId: "monk.protection-prayers", rank: 8 },
      { attributeId: "monk.divine-favor", rank: 4 },
      { attributeId: "elementalist.fire-magic", rank: 7 },
      { attributeId: "elementalist.air-magic", rank: 7 },
    ],
    skillBar: [
      "monk.word-of-healing",
      "monk.orison-of-healing",
      "monk.mend-condition",
      "monk.guardian",
      "monk.restore-life",
      "elementalist.fireball",
      "elementalist.chain-lightning",
      "elementalist.glyph-of-lesser-energy",
    ],
    equipment: {
      mainHand: { weaponId: "wand", requirementAttributeId: "monk.healing-prayers" },
      offHand: { offhandId: "focus", requirementAttributeId: "monk.healing-prayers" },
      armor: casterArmor("monk.healing-prayers"),
    },
  },
  {
    // Sprints in, cracks armor and bleeds, knocks the caster off a spell;
    // hexes the enemy warrior, and signets and shouts to stay up.
    name: "Warrior/Necromancer",
    primaryProfession: "warrior",
    secondaryProfession: "necromancer",
    attributes: [
      { attributeId: "warrior.swordsmanship", rank: 12 },
      { attributeId: "warrior.tactics", rank: 10 },
      { attributeId: "warrior.strength", rank: 6 },
      { attributeId: "necromancer.curses", rank: 6 },
    ],
    skillBar: [
      "warrior.sever-artery-lite",
      "warrior.distracting-blow",
      "warrior.healing-signet",
      "warrior.watch-yourself",
      "warrior.sprint",
      "necromancer.weaken-armor",
      "necromancer.enfeeble",
      "necromancer.faintheartedness",
    ],
    equipment: {
      mainHand: { weaponId: "sword", requirementAttributeId: null },
      offHand: { offhandId: "shield", requirementAttributeId: "warrior.tactics" },
      armor: armor("stalwart", {
        head: minorRune("warrior.swordsmanship"),
        chest: VIGOR,
        hands: { kind: "universal", runeId: "absorption", tier: SUPERIOR },
        legs: VITAE,
        feet: RESTORATION,
      }),
    },
  },
  {
    // Poisoned Barrage pressure from range; Savage Shot and Power Drain
    // for spells, the enchantment strips for monks, Troll Unguent to heal.
    name: "Ranger/Mesmer",
    primaryProfession: "ranger",
    secondaryProfession: "mesmer",
    attributes: [
      { attributeId: "ranger.marksmanship", rank: 12 },
      { attributeId: "ranger.expertise", rank: 10 },
      { attributeId: "ranger.wilderness-survival", rank: 6 },
      { attributeId: "mesmer.inspiration-magic", rank: 6 },
    ],
    skillBar: [
      "ranger.barrage",
      "ranger.savage-shot",
      "ranger.apply-poison",
      "ranger.troll-unguent",
      "mesmer.power-drain",
      "mesmer.energy-tap",
      "mesmer.drain-enchantment",
      "mesmer.shatter-enchantment",
    ],
    equipment: {
      // The fastest arrow, for interrupts.
      mainHand: { weaponId: "flatbow", requirementAttributeId: null },
      offHand: null,
      armor: armor("survivor", {
        head: minorRune("ranger.marksmanship"),
        chest: VIGOR,
        legs: VITAE,
        feet: RESTORATION,
      }),
    },
  },
  {
    // Burst from range, with a heal for itself, a cleanse and a spare
    // resurrection for the team.
    name: "Elementalist/Monk",
    primaryProfession: "elementalist",
    secondaryProfession: "monk",
    attributes: [
      { attributeId: "elementalist.air-magic", rank: 12 },
      { attributeId: "elementalist.fire-magic", rank: 10 },
      { attributeId: "elementalist.energy-storage", rank: 6 },
      { attributeId: "monk.healing-prayers", rank: 6 },
    ],
    skillBar: [
      "elementalist.chain-lightning",
      "elementalist.lightning-orb",
      "elementalist.fireball",
      "elementalist.glyph-of-lesser-energy",
      "monk.orison-of-healing",
      "monk.mend-condition",
      "monk.guardian",
      "monk.restore-life",
    ],
    equipment: {
      mainHand: { weaponId: "wand", requirementAttributeId: "elementalist.air-magic" },
      offHand: { offhandId: "focus", requirementAttributeId: "elementalist.air-magic" },
      armor: casterArmor("elementalist.air-magic"),
    },
  },
  {
    // Interrupts and energy denial against casters, hexes and weakness
    // against warriors, and Blood Renewal to heal.
    name: "Mesmer/Necromancer",
    primaryProfession: "mesmer",
    secondaryProfession: "necromancer",
    attributes: [
      { attributeId: "mesmer.domination-magic", rank: 12 },
      { attributeId: "mesmer.inspiration-magic", rank: 10 },
      { attributeId: "mesmer.fast-casting", rank: 6 },
      { attributeId: "necromancer.blood-magic", rank: 6 },
    ],
    skillBar: [
      "mesmer.energy-burn",
      "mesmer.power-spike",
      "mesmer.shatter-enchantment",
      "mesmer.power-drain",
      "mesmer.energy-tap",
      "necromancer.blood-renewal-lite",
      "necromancer.faintheartedness",
      "necromancer.enfeeble",
    ],
    equipment: {
      mainHand: { weaponId: "wand", requirementAttributeId: "mesmer.domination-magic" },
      offHand: { offhandId: "focus", requirementAttributeId: "mesmer.domination-magic" },
      armor: casterArmor("mesmer.domination-magic"),
    },
  },
];

/**
 * One build of `from`, the starter builds unless a test says otherwise,
 * picked by `random` (in [0, 1), the host's own). Never the one named
 * like `not`, so a reroll always changes something; with nothing else
 * to pick, `not` comes back after all.
 */
export function pickStarterBuild(
  random: () => number,
  not?: PlayerBuild,
  from: readonly PlayerBuild[] = STARTER_BUILDS,
): PlayerBuild {
  const others = from.filter((build) => build.name !== not?.name);
  const pool = others.length > 0 ? others : from;
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  const build = pool[index];
  if (build === undefined) {
    throw new Error("internal: no starter builds");
  }
  return build;
}
