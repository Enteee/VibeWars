import type { PlayerBuild } from "./build.js";
import { NO_UPGRADES, type WeaponSet } from "./equipment/index.js";
import { allocations, armor } from "./starter-armor.js";

/**
 * The starter teams (#2035): what Team Builder's random card rerolls
 * through, one picked at random. Each is a recognisable GW1 PvP archetype,
 * three of 2 and four of 4 for Team Arena and Hosted Games and three of 8
 * for Heroes' Ascent and GvG, built only from skills the engine runs.
 * Every team has a healer.
 *
 * A team's name is its archetype and a member's name its job, never
 * random: a player reads them on the card. Every member is written here;
 * the PvX team builds replace them (#2555).
 */

export interface StarterTeamMember {
  /** The member's job, shown as its character's name: "Healer Monk". */
  readonly name: string;
  readonly build: PlayerBuild;
}

export interface StarterTeam {
  /** The archetype: "Balanced 4v4", "Spike". */
  readonly name: string;
  /** In slot order; how many is the team's size (#2109), 2, 4 or 8. */
  readonly members: readonly StarterTeamMember[];
}

/** A first weapon set and three empty ones. */
function wielding(set: WeaponSet): PlayerBuild["equipment"]["weaponSets"] {
  return [set, null, null, null];
}

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
const INTERRUPT_MESMER: PlayerBuild = {
  name: "Mesmer/Monk",
  primaryProfession: "mesmer",
  secondaryProfession: "monk",
  attributes: allocations({
    "mesmer.domination-magic": 12,
    "mesmer.fast-casting": 10,
    "mesmer.inspiration-magic": 6,
    "monk.protection-prayers": 6,
  }),
  skillBar: [
    "mesmer.power-block",
    "mesmer.power-spike",
    "mesmer.power-leak",
    "mesmer.cry-of-frustration",
    "mesmer.diversion",
    "mesmer.leech-signet",
    "mesmer.energy-tap",
    "monk.mend-condition",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "mesmer.domination-magic",
        upgrades: NO_UPGRADES,
      },
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "mesmer.inspiration-magic",
        upgrades: NO_UPGRADES,
      },
    }),
    armor: armor("prodigys", "mesmer.domination-magic"),
  },
};

// Axe burst for a spike: Eviscerate and Executioner's Strike on one call.
const AXE_WARRIOR: PlayerBuild = {
  name: "Warrior/Monk",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: allocations({
    "warrior.axe-mastery": 12,
    "warrior.strength": 10,
    "warrior.tactics": 6,
    "monk.protection-prayers": 6,
  }),
  skillBar: [
    "warrior.eviscerate",
    "warrior.executioners-strike",
    "warrior.penetrating-blow",
    "warrior.disrupting-chop",
    "warrior.frenzy",
    "warrior.for-great-justice",
    "warrior.healing-signet",
    "monk.mend-condition",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: { weaponId: "axe", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: {
        offhandId: "shield",
        requirementAttributeId: "warrior.tactics",
        upgrades: NO_UPGRADES,
      },
    }),
    armor: armor("knights", "warrior.axe-mastery"),
  },
};

// Hammer knockdowns that hold the enemy healer down.
const HAMMER_WARRIOR: PlayerBuild = {
  name: "Warrior/Monk",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: allocations({
    "warrior.hammer-mastery": 12,
    "warrior.strength": 10,
    "warrior.tactics": 6,
    "monk.protection-prayers": 6,
  }),
  skillBar: [
    "warrior.backbreaker",
    "warrior.hammer-bash",
    "warrior.crushing-blow",
    "warrior.mighty-blow",
    "warrior.rush",
    "warrior.endure-pain",
    "warrior.healing-signet",
    "monk.mend-condition",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: null,
    }),
    armor: armor("stalwart", "warrior.hammer-mastery"),
  },
};

// Lightning spike damage that ignores armor, with Mind Shock to finish.
const AIR_ELEMENTALIST: PlayerBuild = {
  name: "Elementalist/Monk",
  primaryProfession: "elementalist",
  secondaryProfession: "monk",
  attributes: allocations({
    "elementalist.air-magic": 12,
    "elementalist.energy-storage": 10,
    "elementalist.earth-magic": 6,
    "monk.protection-prayers": 6,
  }),
  skillBar: [
    "elementalist.mind-shock",
    "elementalist.lightning-orb",
    "elementalist.lightning-strike",
    "elementalist.chain-lightning",
    "elementalist.lightning-javelin",
    "elementalist.glyph-of-lesser-energy",
    "elementalist.armor-of-earth",
    "monk.mend-condition",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "elementalist.air-magic",
        upgrades: NO_UPGRADES,
      },
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "elementalist.energy-storage",
        upgrades: NO_UPGRADES,
      },
    }),
    armor: armor("survivor", "elementalist.air-magic"),
  },
};

// Burning, bleeding, crippling and poison from range.
const CONDITION_RANGER: PlayerBuild = {
  name: "Ranger/Monk",
  primaryProfession: "ranger",
  secondaryProfession: "monk",
  attributes: allocations({
    "ranger.marksmanship": 12,
    "ranger.expertise": 10,
    "ranger.wilderness-survival": 6,
    "monk.protection-prayers": 6,
  }),
  skillBar: [
    "ranger.burning-arrow",
    "ranger.pin-down",
    "ranger.hunters-shot",
    "ranger.apply-poison",
    "ranger.distracting-shot",
    "ranger.troll-unguent",
    "ranger.natural-stride",
    "monk.mend-condition",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: { weaponId: "flatbow", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: null,
    }),
    armor: armor("survivor", "ranger.marksmanship"),
  },
};

// Big heals and a party heal, with cures for hexes and conditions.
const HEALING_MONK: PlayerBuild = {
  name: "Monk/Mesmer",
  primaryProfession: "monk",
  secondaryProfession: "mesmer",
  attributes: allocations({
    "monk.healing-prayers": 12,
    "monk.divine-favor": 10,
    "monk.protection-prayers": 6,
    "mesmer.inspiration-magic": 6,
  }),
  skillBar: [
    "monk.word-of-healing",
    "monk.healing-breeze",
    "monk.dwaynas-kiss",
    "monk.orison-of-healing",
    "monk.heal-other",
    "monk.mend-condition",
    "monk.holy-veil",
    "mesmer.energy-tap",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "monk.healing-prayers",
        upgrades: NO_UPGRADES,
      },
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "monk.divine-favor",
        upgrades: NO_UPGRADES,
      },
    }),
    armor: armor("radiant", "monk.healing-prayers"),
  },
};

// Damage prevented before it lands: spirits, reversals, Aegis and a ward.
const PROTECTION_MONK: PlayerBuild = {
  name: "Monk/Elementalist",
  primaryProfession: "monk",
  secondaryProfession: "elementalist",
  attributes: allocations({
    "monk.protection-prayers": 12,
    "monk.divine-favor": 10,
    "monk.healing-prayers": 6,
    "elementalist.earth-magic": 6,
  }),
  skillBar: [
    "monk.shield-of-regeneration",
    "monk.protective-spirit",
    "monk.reversal-of-fortune",
    "monk.guardian",
    "monk.aegis",
    "monk.spirit-bond",
    "monk.mend-condition",
    "elementalist.ward-against-melee",
  ],
  equipment: {
    weaponSets: wielding({
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "monk.protection-prayers",
        upgrades: NO_UPGRADES,
      },
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "monk.divine-favor",
        upgrades: NO_UPGRADES,
      },
    }),
    armor: armor("blessed", "monk.protection-prayers"),
  },
};

export const STARTER_TEAMS: readonly StarterTeam[] = [
  // A frontline and its healer.
  {
    name: "Warrior Duo",
    members: [
      // Bleeds and pressure at the front.
      { name: "Frontline Warrior", build: SWORD_WARRIOR },
      // Keeps the warrior standing.
      { name: "Healer Monk", build: HEALER_MONK },
    ],
  },
  // Fire from range, big heals behind it.
  {
    name: "Caster Duo",
    members: [
      // Fireball and burning.
      { name: "Fire Elementalist", build: FIRE_ELEMENTALIST },
      // Heals and cures for the caster.
      { name: "Healer Monk", build: HEALING_MONK },
    ],
  },
  // Hexes that wear the enemy down, damage prevented on the other side.
  {
    name: "Hex Duo",
    members: [
      // Degeneration and hexes.
      { name: "Hex Necromancer", build: HEX_NECROMANCER },
      // Spirits, reversals and Aegis.
      { name: "Protection Monk", build: PROTECTION_MONK },
    ],
  },
  // One of each job: a frontline, a bow, a mesmer, a healer.
  {
    name: "Balanced 4v4",
    members: [
      // Bleeds and interrupts at the front.
      { name: "Frontline Warrior", build: SWORD_WARRIOR },
      // Savage Shot on the enemy healer.
      { name: "Interrupt Ranger", build: INTERRUPT_RANGER },
      // Power Block and Cry of Frustration on their casters.
      { name: "Interrupt Mesmer", build: INTERRUPT_MESMER },
      // Keeps the other three up.
      { name: "Healer Monk", build: HEALER_MONK },
    ],
  },
  // Three damage dealers burst one target at once; one healer.
  {
    name: "Spike",
    members: [
      // Eviscerate and Executioner's Strike on the called target.
      { name: "Axe Warrior", build: AXE_WARRIOR },
      // Lightning that ignores armor, Mind Shock to finish.
      { name: "Air Elementalist", build: AIR_ELEMENTALIST },
      // Fireball and Chain Lightning on the same call.
      { name: "Fire Elementalist", build: FIRE_ELEMENTALIST },
      // Word of Healing for the spike that comes back.
      { name: "Healer Monk", build: HEALING_MONK },
    ],
  },
  // Wear the enemy down with conditions and hexes faster than they cure.
  {
    name: "Condition Pressure",
    members: [
      // Sever Artery bleeds up close.
      { name: "Bleeding Warrior", build: SWORD_WARRIOR },
      // Burning, crippling, bleeding and poison from range.
      { name: "Condition Ranger", build: CONDITION_RANGER },
      // Hexes and Rotting Flesh.
      { name: "Hex Necromancer", build: HEX_NECROMANCER },
      // Heals and cures.
      { name: "Healer Monk", build: HEALING_MONK },
    ],
  },
  // Two monks out-heal the enemy while two hold them down.
  {
    name: "Two Monks",
    members: [
      // Knockdowns on whoever dives the monks.
      { name: "Hammer Warrior", build: HAMMER_WARRIOR },
      // Interrupts the enemy's heals and spikes.
      { name: "Interrupt Ranger", build: INTERRUPT_RANGER },
      // Heals what gets through.
      { name: "Healer Monk", build: HEALER_MONK },
      // Prevents the damage before it lands.
      { name: "Protection Monk", build: PROTECTION_MONK },
    ],
  },
  // The classic eight: two frontline, two casters, a mesmer, a bow, two monks.
  {
    name: "Balanced 8v8",
    members: [
      // Knockdowns at the front.
      { name: "Hammer Warrior", build: HAMMER_WARRIOR },
      // Bleeds and interrupts at the front.
      { name: "Sword Warrior", build: SWORD_WARRIOR },
      // Fire damage over the backline.
      { name: "Fire Elementalist", build: FIRE_ELEMENTALIST },
      // Hexes and conditions.
      { name: "Hex Necromancer", build: HEX_NECROMANCER },
      // Spell interrupts and energy denial.
      { name: "Interrupt Mesmer", build: INTERRUPT_MESMER },
      // Savage Shot on the enemy healer.
      { name: "Interrupt Ranger", build: INTERRUPT_RANGER },
      // Big heals and a party heal.
      { name: "Healer Monk", build: HEALING_MONK },
      // Spirits, reversals and Aegis.
      { name: "Protection Monk", build: PROTECTION_MONK },
    ],
  },
  // Six on one call, two monks behind them.
  {
    name: "Spike 8v8",
    members: [
      // Eviscerate on the call.
      { name: "Axe Warrior", build: AXE_WARRIOR },
      // Backbreaker so the target cannot run or cast.
      { name: "Hammer Warrior", build: HAMMER_WARRIOR },
      // Lightning that ignores armor.
      { name: "Air Elementalist", build: AIR_ELEMENTALIST },
      // Fireball on the call.
      { name: "Fire Elementalist", build: FIRE_ELEMENTALIST },
      // Shuts the target's healer down for the spike.
      { name: "Interrupt Mesmer", build: INTERRUPT_MESMER },
      // Savage Shot on the heal that would save the target.
      { name: "Interrupt Ranger", build: INTERRUPT_RANGER },
      // Heals the counter-spike.
      { name: "Healer Monk", build: HEALER_MONK },
      // Prevents it.
      { name: "Protection Monk", build: PROTECTION_MONK },
    ],
  },
  // Pressure on every front: bleeding, burning, hexes and interrupts.
  {
    name: "Condition 8v8",
    members: [
      // Bleeds at the front.
      { name: "Bleeding Warrior", build: SWORD_WARRIOR },
      // Knocks down whoever tries to run.
      { name: "Hammer Warrior", build: HAMMER_WARRIOR },
      // Burning, bleeding, crippling and poison from range.
      { name: "Condition Ranger", build: CONDITION_RANGER },
      // Savage Shot on the heals that would cure them.
      { name: "Interrupt Ranger", build: INTERRUPT_RANGER },
      // Hexes stacked on the conditions.
      { name: "Hex Necromancer", build: HEX_NECROMANCER },
      // Shuts the enemy healer down.
      { name: "Interrupt Mesmer", build: INTERRUPT_MESMER },
      // Heals the pressure coming back.
      { name: "Healer Monk", build: HEALER_MONK },
      // Prevents it.
      { name: "Protection Monk", build: PROTECTION_MONK },
    ],
  },
];

/**
 * A starter team of `size` members by `random` ([0, 1)), never the one
 * named like `not`, so a reroll always changes it; `undefined` when there
 * is none of that size (#2109).
 */
export function pickStarterTeam(
  random: () => number,
  size: number,
  not?: StarterTeam,
): StarterTeam | undefined {
  const pool = STARTER_TEAMS.filter(
    (team) => team.members.length === size && team.name !== not?.name,
  );
  // Clamped: a `random` just under 1 must not index past the end.
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
