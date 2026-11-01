import type { AttributeAllocation } from "./attributes.js";
import type { PlayerBuild } from "./build.js";
import type { ArmorPiece, ArmorSet, EquippedRune, InsigniaId } from "./equipment/index.js";

/**
 * The starter builds (#852): what the host hands a player who brings no
 * legal build of their own, one picked at random. Each is a legal
 * two-profession build a player could make in the editor: eight skills
 * that play on their own (damage, a defence or a heal, and an interrupt,
 * a condition or a cure), every attribute point spent, and gear to
 * match. One is a Monk healer.
 *
 * Only skills the engine runs today. A new build is one more entry here.
 */

export function allocations(
  ranks: Readonly<Record<string, number>>,
): readonly AttributeAllocation[] {
  return Object.entries(ranks).map(([attributeId, rank]) => ({ attributeId, rank }));
}

function minorRune(attributeId: string): EquippedRune {
  return { kind: "attribute", attributeId, tier: "minor" };
}

const SUPERIOR_VIGOR: EquippedRune = { kind: "universal", runeId: "vigor", tier: "superior" };

/**
 * One insignia on every piece, a minor rune of the build's main
 * attribute on the head, with its headgear on the same attribute
 * (#1140), and a superior Vigor on the chest; `hands` takes one more
 * rune where the build has a use for it.
 */
export function armor(
  insigniaId: InsigniaId,
  mainAttributeId: string,
  hands?: EquippedRune,
): ArmorSet {
  const piece = (rune: EquippedRune | null): ArmorPiece => ({ insigniaId, rune });
  return {
    head: { ...piece(minorRune(mainAttributeId)), headgearAttributeId: mainAttributeId },
    chest: piece(SUPERIOR_VIGOR),
    hands: piece(hands ?? null),
    legs: piece(null),
    feet: piece(null),
  };
}

export const STARTER_BUILDS: readonly PlayerBuild[] = [
  // Sword melee that keeps itself up: bleeding, an interrupt, a cure.
  {
    name: "Warrior/Monk",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: allocations({
      "warrior.swordsmanship": 12,
      "warrior.tactics": 9,
      "warrior.strength": 2,
      "monk.healing-prayers": 8,
      "monk.protection-prayers": 5,
    }),
    skillBar: [
      "warrior.sever-artery",
      "warrior.distracting-blow",
      "warrior.watch-yourself",
      "warrior.healing-signet",
      "warrior.sprint",
      "monk.mend-condition",
      "monk.orison-of-healing",
      "monk.guardian",
    ],
    equipment: {
      weaponSets: [
        {
          mainHand: { weaponId: "sword", requirementAttributeId: null },
          offHand: { offhandId: "shield", requirementAttributeId: "warrior.tactics" },
        },
        null,
        null,
        null,
      ],
      armor: armor("stalwart", "warrior.swordsmanship", {
        kind: "universal",
        runeId: "absorption",
        tier: "minor",
      }),
    },
  },
  // An interrupting bow: Savage Shot and the Mesmer's spell interrupts.
  {
    name: "Ranger/Mesmer",
    primaryProfession: "ranger",
    secondaryProfession: "mesmer",
    attributes: allocations({
      "ranger.marksmanship": 12,
      "ranger.expertise": 9,
      "ranger.wilderness-survival": 6,
      "mesmer.inspiration-magic": 7,
      "mesmer.domination-magic": 3,
    }),
    skillBar: [
      "ranger.savage-shot",
      "ranger.broad-head-arrow",
      "ranger.apply-poison",
      "ranger.troll-unguent",
      "mesmer.power-drain",
      "mesmer.power-spike",
      "mesmer.drain-enchantment",
      "mesmer.energy-tap",
    ],
    equipment: {
      weaponSets: [
        { mainHand: { weaponId: "recurve-bow", requirementAttributeId: null }, offHand: null },
        null,
        null,
        null,
      ],
      armor: armor("survivor", "ranger.marksmanship"),
    },
  },
  // The healer.
  {
    name: "Monk/Elementalist",
    primaryProfession: "monk",
    secondaryProfession: "elementalist",
    attributes: allocations({
      "monk.healing-prayers": 12,
      "monk.protection-prayers": 10,
      "monk.divine-favor": 6,
      "elementalist.fire-magic": 5,
      "elementalist.earth-magic": 3,
    }),
    skillBar: [
      "monk.word-of-healing",
      "monk.orison-of-healing",
      "monk.mend-condition",
      "monk.guardian",
      "monk.restore-life",
      "elementalist.glyph-of-lesser-energy",
      "elementalist.armor-of-earth",
      "elementalist.fireball",
    ],
    equipment: {
      weaponSets: [
        {
          mainHand: { weaponId: "wand", requirementAttributeId: "monk.healing-prayers" },
          offHand: { offhandId: "focus", requirementAttributeId: "monk.protection-prayers" },
        },
        null,
        null,
        null,
      ],
      armor: armor("radiant", "monk.healing-prayers"),
    },
  },
  // Hexes and conditions, with fire for damage.
  {
    name: "Necromancer/Elementalist",
    primaryProfession: "necromancer",
    secondaryProfession: "elementalist",
    attributes: allocations({
      "necromancer.curses": 12,
      "necromancer.blood-magic": 7,
      "necromancer.death-magic": 6,
      "necromancer.soul-reaping": 3,
      "elementalist.fire-magic": 9,
    }),
    skillBar: [
      "necromancer.faintheartedness",
      "necromancer.enfeeble",
      "necromancer.weaken-armor",
      "necromancer.malaise",
      "necromancer.rotting-flesh",
      "necromancer.blood-renewal-lite",
      "elementalist.fireball",
      "elementalist.armor-of-earth",
    ],
    equipment: {
      weaponSets: [
        {
          mainHand: { weaponId: "wand", requirementAttributeId: "necromancer.curses" },
          offHand: { offhandId: "focus", requirementAttributeId: "elementalist.fire-magic" },
        },
        null,
        null,
        null,
      ],
      armor: armor("survivor", "necromancer.curses"),
    },
  },
  // A nuker with the Mesmer's interrupts.
  {
    name: "Elementalist/Mesmer",
    primaryProfession: "elementalist",
    secondaryProfession: "mesmer",
    attributes: allocations({
      "elementalist.fire-magic": 12,
      "elementalist.air-magic": 9,
      "elementalist.energy-storage": 7,
      "elementalist.earth-magic": 6,
      "mesmer.domination-magic": 3,
    }),
    skillBar: [
      "elementalist.fireball",
      "elementalist.chain-lightning",
      "elementalist.lightning-orb",
      "elementalist.glyph-of-lesser-energy",
      "elementalist.armor-of-earth",
      "mesmer.power-spike",
      "mesmer.power-drain",
      "mesmer.shatter-enchantment",
    ],
    equipment: {
      weaponSets: [
        {
          mainHand: { weaponId: "wand", requirementAttributeId: "elementalist.fire-magic" },
          offHand: { offhandId: "focus", requirementAttributeId: "elementalist.energy-storage" },
        },
        null,
        null,
        null,
      ],
      armor: armor("survivor", "elementalist.fire-magic"),
    },
  },
];

/**
 * A starter build by `random` ([0, 1), the host's own), never one with
 * `not`'s professions, so a reroll always changes it. By professions,
 * not name: a rolled character carries a name of its own (#1149), and
 * every starter build has a pair no other has.
 */
export function pickStarterBuild(random: () => number, not?: PlayerBuild): PlayerBuild {
  return pickBuildFrom(STARTER_BUILDS, random, not);
}

function sameProfessions(a: PlayerBuild, b: PlayerBuild): boolean {
  return (
    a.primaryProfession === b.primaryProfession && a.secondaryProfession === b.secondaryProfession
  );
}

/** `pickStarterBuild` over `builds`. With only `not` to pick, that is what it picks. */
export function pickBuildFrom(
  builds: readonly PlayerBuild[],
  random: () => number,
  not?: PlayerBuild,
): PlayerBuild {
  const others = builds.filter((build) => not === undefined || !sameProfessions(build, not));
  const pool = others.length > 0 ? others : builds;
  // Clamped: a `random` just under 1 must not index past the end.
  const picked = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (picked === undefined) {
    throw new Error("no builds to pick from");
  }
  return picked;
}
