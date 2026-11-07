/**
 * `@vibewars/game-core/testing`: what a test needs and a match never
 * does. Five fixed builds a test names to know its bar, slot for slot:
 * the built-in builds are the PvX wiki's (#2554, #2555) and change when
 * it does, so a test that presses "Fireball" brings one of these.
 */

import type { PlayerBuild } from "./build.js";
import { NO_UPGRADES } from "./equipment/index.js";
import { allocations, armor } from "./starter-builds.js";

// Sword melee that keeps itself up: bleeding, an interrupt, a cure.
const SWORD_WARRIOR: PlayerBuild = {
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
        mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
        offHand: {
          offhandId: "shield",
          requirementAttributeId: "warrior.tactics",
          upgrades: NO_UPGRADES,
        },
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
};

// An interrupting bow: Savage Shot and the Mesmer's spell interrupts.
const INTERRUPT_RANGER: PlayerBuild = {
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
      {
        mainHand: {
          weaponId: "recurve-bow",
          requirementAttributeId: null,
          upgrades: NO_UPGRADES,
        },
        offHand: null,
      },
      null,
      null,
      null,
    ],
    armor: armor("survivor", "ranger.marksmanship"),
  },
};

// The healer.
const HEALER_MONK: PlayerBuild = {
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
        mainHand: {
          weaponId: "wand",
          requirementAttributeId: "monk.healing-prayers",
          upgrades: NO_UPGRADES,
        },
        offHand: {
          offhandId: "focus",
          requirementAttributeId: "monk.protection-prayers",
          upgrades: NO_UPGRADES,
        },
      },
      null,
      null,
      null,
    ],
    armor: armor("radiant", "monk.healing-prayers"),
  },
};

// Hexes and conditions, with fire for damage.
const HEX_NECROMANCER: PlayerBuild = {
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
        mainHand: {
          weaponId: "wand",
          requirementAttributeId: "necromancer.curses",
          upgrades: NO_UPGRADES,
        },
        offHand: {
          offhandId: "focus",
          requirementAttributeId: "elementalist.fire-magic",
          upgrades: NO_UPGRADES,
        },
      },
      null,
      null,
      null,
    ],
    armor: armor("survivor", "necromancer.curses"),
  },
};

// A nuker with the Mesmer's interrupts.
const FIRE_ELEMENTALIST: PlayerBuild = {
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
        mainHand: {
          weaponId: "wand",
          requirementAttributeId: "elementalist.fire-magic",
          upgrades: NO_UPGRADES,
        },
        offHand: {
          offhandId: "focus",
          requirementAttributeId: "elementalist.energy-storage",
          upgrades: NO_UPGRADES,
        },
      },
      null,
      null,
      null,
    ],
    armor: armor("survivor", "elementalist.fire-magic"),
  },
};

// Spell interrupts and energy denial, with a cure.
/** By name: "Warrior/Monk", "Ranger/Mesmer" and so on. */
export const TEST_BUILDS: readonly PlayerBuild[] = [
  SWORD_WARRIOR,
  INTERRUPT_RANGER,
  HEALER_MONK,
  HEX_NECROMANCER,
  FIRE_ELEMENTALIST,
];
