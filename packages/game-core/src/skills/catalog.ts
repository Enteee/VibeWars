import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  PET_REACH,
  RANGE_MELEE,
  RANGE_NATURE_RITUAL,
  RANGE_SPELL,
  RANGE_SPIRIT,
} from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { Behaviour } from "../match/behaviour.js";
import { KNOCKDOWN_SECONDS, type CreatureTemplate, type Skill } from "./types.js";

/**
 * The implemented skill catalog (brief §9's "Implemented" stage).
 *
 * Every entry's numbers come from the imported reference corpus in
 * `@vibewars/game-data` (`normalized/<id>.json`) — same id, same cost,
 * same activation/recharge, same attribute scaling endpoints. What is
 * *implemented* here is only what the current effect system can honestly
 * express; a skill whose real behaviour needs a mechanic that does not
 * exist yet (hexes, enchantments, conditions, regeneration over
 * time) is deliberately **absent from this catalog**, not present with a
 * watered-down effect list.
 *
 * That is the brief's §9 rule taken literally: "do not fake coverage by
 * mapping unsupported skills to generic placeholder effects." The gap
 * between the 16 imported skills and the 6 implemented here is real, and
 * `coverage.ts` reports it rather than hiding it.
 *
 * Ranges are this project's own tuning (the source corpus does not
 * publish numeric ranges), expressed in the same world units as map
 * geometry.
 */

/** Longbow-ish range. */
const RANGE_LONG = 520;

/**
 * What a minion does (#467): heel by its master, fight what its master
 * attacks within cast range of the master, else foes in earshot of
 * itself (#1118), back to heel past cast range. House numbers.
 */
const MINION_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  engage: "owner-target-then-nearest",
  aggroUnits: AREA_EARSHOT,
  leashUnits: RANGE_SPELL,
  heelUnits: AREA_IN_THE_AREA,
};

/**
 * Level 0...10 at Death Magic 0...12. Health 80 + 20 per level and armor
 * about 3 per level (fandom "Health", "Bone Minion"); a blow every 3.10 s
 * (GWW "Bone Minion"). 6-11 is GWW's 6-15 against armor 60 at Death
 * Magic 12, its maximum a critical's, so ÷√2 (#1131).
 */
const BONE_MINION: CreatureTemplate = {
  kind: "minion",
  look: "bone-minion",
  name: "Bone Minion",
  maxHealth: { scaling: { attributeId: "necromancer.death-magic", atZero: 80, atTwelve: 280 } },
  armor: { scaling: { attributeId: "necromancer.death-magic", atZero: 0, atTwelve: 30 } },
  attack: {
    attributeId: "necromancer.death-magic",
    damageMin: 6,
    damageMax: 11,
    level: { atZero: 0, atTwelve: 10 },
    damageType: "blunt",
    attackIntervalSeconds: 3.1,
    range: RANGE_MELEE,
  },
  behaviour: MINION_BEHAVIOUR,
  aura: undefined,
  onDeath: "vanish",
  ownerDisableOnDeath: undefined,
};

/**
 * Level 1...14 at Death Magic 0...12. Health 80 + 20 per level and armor
 * 4 per level (fandom "Bone Horror"); a blow every 3.10 s (GWW "Bone
 * Horror"). 12-24 is GWW's 12-34 against armor 60 at Death Magic 12, its
 * maximum a critical's, so ÷√2 (#1131).
 */
const BONE_HORROR: CreatureTemplate = {
  kind: "minion",
  look: "bone-horror",
  name: "Bone Horror",
  maxHealth: { scaling: { attributeId: "necromancer.death-magic", atZero: 100, atTwelve: 360 } },
  armor: { scaling: { attributeId: "necromancer.death-magic", atZero: 4, atTwelve: 56 } },
  attack: {
    attributeId: "necromancer.death-magic",
    damageMin: 12,
    damageMax: 24,
    level: { atZero: 1, atTwelve: 14 },
    damageType: "blunt",
    attackIntervalSeconds: 3.1,
    range: RANGE_MELEE,
  },
  behaviour: MINION_BEHAVIOUR,
  aura: undefined,
  onDeath: "vanish",
  ownerDisableOnDeath: undefined,
};

/**
 * What a pet does (#1046): heel by its owner, go for whatever its owner is
 * attacking within twice earshot of itself, back to heel past that.
 */
const PET_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  engage: "owner-target",
  aggroUnits: PET_REACH,
  leashUnits: PET_REACH,
  heelUnits: AREA_IN_THE_AREA,
};

/**
 * GW1's PvP pet, a level-20 Elder Wolf (fandom "Wolf"). Health = level ×
 * 20 + 80 and armor = level × 3 + 20 (fandom "Animal companion"),
 * whatever its owner's attributes. "With the critical hits removed, the
 * base damage is 17-29" at Beast Mastery 12 against armor 60, "one attack
 * every 2.15 seconds"; wolves deal slashing damage. Its death disables
 * its owner's bar "between 10 and 3 seconds based on the owner's Beast
 * Mastery" (fandom "Beast Mastery"): 10...4 is linear and unverified.
 */
const WOLF: CreatureTemplate = {
  kind: "pet",
  look: "beast",
  name: "Wolf",
  maxHealth: { flat: 480 },
  armor: { flat: 80 },
  attack: {
    attributeId: "ranger.beast-mastery",
    damageMin: 17,
    damageMax: 29,
    level: undefined,
    damageType: "slashing",
    attackIntervalSeconds: 2.15,
    range: RANGE_MELEE,
  },
  behaviour: PET_BEHAVIOUR,
  aura: undefined,
  onDeath: "lie",
  ownerDisableOnDeath: {
    scaling: { attributeId: "ranger.beast-mastery", atZero: 10, atTwelve: 4 },
  },
};

export const IMPLEMENTED_SKILLS: readonly Skill[] = [
  {
    id: "monk.orison-of-healing",
    name: "Orison of Healing",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 60 },
        },
      },
    ],
  },
  {
    id: "elementalist.fireball",
    name: "Fireball",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 7,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "...and all nearby foes": the same hit on every enemy near the target.
    area: {
      radius: AREA_NEARBY,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Slower than any arrow: a second's flight at full range, so a foe who
    // sees it leave can step out of where it is led to.
    projectile: { speed: RANGE_SPELL },
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
        },
        type: "fire",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.chain-lightning",
    name: "Chain Lightning",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 10 },
    // The first overcast skill (#461): each cast lowers maximum energy by 5.
    overcast: 5,
    activationSeconds: 2,
    rechargeSeconds: 6,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and up to two other foes near your target": the target
    // first, then the nearest two (`targeting.ts`).
    area: {
      radius: AREA_NEARBY,
      origin: "target",
      affects: "enemies",
      maxTargets: 3,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 70 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
    ],
  },
  {
    id: "warrior.swift-chop",
    name: "Swift Chop",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 1, atTwelve: 16 } },
      // "If Swift Chop is blocked, target foe takes 1...16 damage and
      // suffers a Deep Wound for 20 seconds."
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [
        {
          kind: "damage",
          amount: { scaling: { attributeId: "warrior.axe-mastery", atZero: 1, atTwelve: 16 } },
          type: "typeless",
          armorPenetration: 0,
        },
        { kind: "apply-status", statusId: "deep-wound", durationSeconds: 20 },
      ],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "ranger.barrage",
    name: "Barrage",
    type: "attack",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 1,
    range: RANGE_LONG,
    target: "single-enemy",
    // The volley: an arrow at each of up to six foes adjacent to the
    // target, each a blow of the bow plus the bonus.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: 6,
      includesCaster: false,
    },
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.marksmanship", atZero: 5, atTwelve: 12 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "warrior.backbreaker",
    name: "Backbreaker",
    type: "attack",
    elite: true,
    profession: "warrior",
    attributeId: "warrior.hammer-mastery",
    cost: { kind: "adrenaline", amount: 9 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // GW1: +1...16 damage and a knockdown, 4 s with 8 Strength or more and
    // 2 s below. A PvP Backbreaker has the Strength, so it is a flat 4 s (#544).
    attack: {
      weapon: "hammer",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "warrior.hammer-mastery", atZero: 1, atTwelve: 16 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "knockdown", durationSeconds: 4 }],
  },
  {
    id: "warrior.hammer-bash",
    name: "Hammer Bash",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.hammer-mastery",
    // GW1: "Lose all adrenaline. If Hammer Bash hits, your target is
    // knocked down." The loss is the price, paid on a miss too (#1097).
    cost: { kind: "adrenaline", amount: 6, losesAll: true },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "hammer",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
  },
  {
    id: "necromancer.blood-renewal-lite",
    name: "Vital Transfer",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // An *original* skill, not an import: the corpus's sacrifice skills
    // all also need hexes or regeneration, so none of them could be
    // implemented honestly yet. This one exists to exercise the
    // sacrifice-health + heal effect combination the engine does support,
    // and is named/derived independently rather than mislabelled as a
    // reference skill.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 10 },
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "necromancer.blood-magic", atZero: 30, atTwelve: 90 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Skills enabled by the status/interrupt mechanics (Sprints 12-15)         */
  /* ---------------------------------------------------------------------- */

  {
    id: "warrior.distracting-blow",
    name: "Distracting Blow",
    type: "attack",
    elite: false,
    profession: "warrior",
    // GW1's "No Attribute": nothing scales, and any warrior can use it.
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 10,
    range: RANGE_MELEE,
    target: "single-enemy",
    // The real skill also disrupts foes adjacent to the target, but only
    // with a scythe, and there are no scythes yet.
    area: undefined,
    // A swing of any melee weapon that deals no damage: still an attack,
    // so blind makes it miss, and a miss interrupts nothing.
    attack: {
      weapon: "melee",
      weaponDamage: 0,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "interrupt" }],
  },
  {
    id: "ranger.broad-head-arrow",
    name: "Broad Head Arrow",
    type: "attack",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // The real elite: Daze the target. Applying Dazed interrupts a spell
    // by itself (#546), so it still shuts a caster down, a spell-caster
    // only. It lands with the arrow (#416). (The real arrow also flies
    // slower; per-skill arrow speeds are not modelled.)
    effects: [{ kind: "apply-status", statusId: "dazed", durationSeconds: 17 }],
  },
  {
    id: "necromancer.faintheartedness",
    name: "Faintheartedness",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "apply-status", statusId: "faintheartedness", durationSeconds: 13 }],
  },
  {
    id: "necromancer.weaken-armor",
    name: "Weaken Armor",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and foes adjacent to your target": the target, then
    // every foe adjacent to it.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...have Cracked Armor for 5...17...20 seconds": 17 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 }],
  },
  {
    id: "necromancer.malaise",
    name: "Malaise",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // GW1's energy-degeneration hex (#503), at its rank-12 duration.
    // Left out: the caster's own -1 health degeneration while it lasts,
    // and the damage that ends it when the foe's energy reaches 0.
    effects: [{ kind: "apply-status", statusId: "malaise", durationSeconds: 24 }],
  },
  {
    id: "necromancer.enfeeble",
    name: "Enfeeble",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target suffers from weakness for 10...26...30 seconds": 26 s, its
    // rank-12 value. Weakness's first source (#762).
    effects: [{ kind: "apply-status", statusId: "weakness", durationSeconds: 26 }],
  },
  {
    id: "necromancer.enfeebling-blood",
    name: "Enfeebling Blood",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 1 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes".
    area: {
      radius: AREA_NEARBY,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // The 17% sacrifice is paid once a cast, however many foes it reaches;
    // "...suffer from weakness for 1...13...16 seconds": 13 s, its rank-12
    // value.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 17 },
      { kind: "apply-status", statusId: "weakness", durationSeconds: 13 },
    ],
  },
  {
    id: "necromancer.rotting-flesh",
    name: "Rotting Flesh",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target fleshy foe becomes Diseased for 10...22...25 seconds": 22 s,
    // its rank-12 value. Disease spreads on its own (#765); everyone
    // here is fleshy.
    effects: [{ kind: "apply-status", statusId: "disease", durationSeconds: 22 }],
  },
  {
    id: "necromancer.blood-ritual",
    name: "Blood Ritual",
    type: "enchantment",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 2,
    // A touch skill: the ally must be at hand, and not the caster, or
    // it would be a free +3 energy for the Necromancer.
    range: RANGE_MELEE,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // GW1's energy-regeneration enchantment (#503), at its rank-12 duration.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 17 },
      { kind: "apply-status", statusId: "blood-ritual", durationSeconds: 13 },
    ],
  },
  {
    id: "elementalist.armor-of-earth",
    name: "Armor of Earth",
    type: "enchantment",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // A self-enchantment: real armor gain, and the real movement penalty
    // that makes it a genuine trade-off rather than a free buff.
    effects: [{ kind: "apply-status", statusId: "armor-boost", durationSeconds: 30 }],
  },
  {
    id: "ranger.troll-unguent",
    name: "Troll Unguent",
    type: "skill",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // Strong self-regeneration behind a long 3s cast — the canonical
    // "interrupt me" target, which is exactly why it pairs well with the
    // interrupt skills above in a test and in play.
    effects: [{ kind: "apply-status", statusId: "regeneration", durationSeconds: 13 }],
  },
  {
    id: "monk.mend-condition",
    name: "Mend Condition",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove one condition from target other ally. If a condition is
    // removed, that ally is healed for 5...57...70 health."
    effects: [
      { kind: "remove-status", category: "condition", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "condition" },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            amount: {
              scaling: { attributeId: "monk.protection-prayers", atZero: 5, atTwelve: 57 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "monk.guardian",
    name: "Guardian",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 6,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // A 50% chance to block attacks (#534), at its rank-12 duration.
    effects: [{ kind: "apply-status", statusId: "guardian", durationSeconds: 6 }],
  },
  {
    id: "monk.mending",
    name: "Mending",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // The first maintained enchantment (#837): +3 Health regeneration, its
    // rank-12 value, for −1 energy pip on its caster while it lasts.
    effects: [{ kind: "maintain-status", statusId: "mending" }],
  },
  {
    id: "warrior.sever-artery",
    name: "Sever Artery",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.swordsmanship",
    cost: { kind: "adrenaline", amount: 4 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "sword",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...the opponent begins bleeding for 5...21...25 seconds": 21 s, its
    // rank-12 value.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 21 }],
  },
  {
    id: "warrior.eviscerate",
    name: "Eviscerate",
    type: "attack",
    elite: true,
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "adrenaline", amount: 8 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 10, atTwelve: 38 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...and inflict a Deep Wound ... for 5...17...20 seconds": 17 s, its
    // rank-12 value.
    effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
  },
  {
    id: "warrior.executioners-strike",
    name: "Executioner's Strike",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "adrenaline", amount: 8 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 10, atTwelve: 34 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "assassin.jagged-strike",
    name: "Jagged Strike",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 2,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // A lead attack: it opens a dagger chain for an off-hand attack (#831).
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "lead", follows: undefined },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...your target suffers from Bleeding for 5...17...20 seconds": 17 s,
    // its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 17 }],
  },
  {
    id: "assassin.black-lotus-strike",
    name: "Black Lotus Strike",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.critical-strikes",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If it hits, Black Lotus Strike strikes for +10...27...31 damage."
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.critical-strikes", atZero: 10, atTwelve: 27 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "lead", follows: undefined },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If target foe is suffering from a Hex, you gain 5...11...13 Energy."
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has", category: "hex" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "assassin.critical-strikes", atZero: 5, atTwelve: 11 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "assassin.fox-fangs",
    name: "Fox Fangs",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow a lead attack. Fox Fangs cannot be blocked or evaded and
    // strikes for +10...22...25 damage if it hits." Nothing evades here, so
    // unblockable is all of it.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 10, atTwelve: 22 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: true,
      chain: { role: "off-hand", follows: "lead" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "assassin.wild-strike",
    name: "Wild Strike",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow a lead attack. If it hits, this attack strikes for
    // +10...30...35 damage ... This attack cannot be blocked."
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 10, atTwelve: 30 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: true,
      chain: { role: "off-hand", follows: "lead" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...and any Stance being used by target foe ends."
    effects: [{ kind: "remove-status", category: "stance", count: 1 }],
  },
  {
    id: "assassin.death-blossom",
    name: "Death Blossom",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow an off-hand attack. If it hits, Death Blossom strikes
    // target foe for +20...40...45 damage and all adjacent foes take
    // 20...40...45 damage." A dual attack: both blows splash.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 20, atTwelve: 40 },
      },
      conditionalBonus: undefined,
      strikes: 2,
      unblockable: false,
      chain: { role: "dual", follows: "off-hand" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "splash",
        radius: AREA_ADJACENT,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "assassin.dagger-mastery", atZero: 20, atTwelve: 40 },
            },
            type: "piercing",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  {
    id: "assassin.twisting-fangs",
    name: "Twisting Fangs",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.critical-strikes",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 15,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow an off-hand attack. If it hits, Twisting Fangs strikes
    // for +10...18...20 damage and struck foe suffers from Bleeding and
    // Deep Wound for 5...17...20 seconds": 17 s, its rank-12 value.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.critical-strikes", atZero: 10, atTwelve: 18 },
      },
      conditionalBonus: undefined,
      strikes: 2,
      unblockable: false,
      chain: { role: "dual", follows: "off-hand" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      { kind: "apply-status", statusId: "bleeding", durationSeconds: 17 },
      { kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 },
    ],
  },
  {
    id: "assassin.horns-of-the-ox",
    name: "Horns of the Ox",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 12,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow an off-hand attack. If it hits, Horns of the Ox strikes
    // for +1...9...11 damage. If struck foe is not adjacent to any allies,
    // that foe is knocked down."
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 1, atTwelve: 9 },
      },
      conditionalBonus: undefined,
      strikes: 2,
      unblockable: false,
      chain: { role: "dual", follows: "off-hand" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-alone", radius: AREA_ADJACENT },
        effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
      },
    ],
  },
  {
    id: "assassin.moebius-strike",
    name: "Moebius Strike",
    type: "attack",
    elite: true,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 2,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow a Dual Attack. If it hits, Moebius Strike strikes for
    // +10...30...35 damage. If you strike a foe whose Health is below 50%,
    // all your other attack skills are recharged." An off-hand attack that
    // follows a dual: lead, off-hand, dual, Moebius, dual, and round.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 10, atTwelve: 30 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "off-hand", follows: "dual" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.5 },
        effects: [{ kind: "recharge-others", which: "attack" }],
      },
    ],
  },
  {
    id: "ranger.punishing-shot",
    name: "Punishing Shot",
    type: "attack",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 5,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.marksmanship", atZero: 10, atTwelve: 18 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...and your target is interrupted": when the arrow lands, so a miss
    // interrupts nothing.
    effects: [{ kind: "interrupt" }],
  },
  {
    id: "ranger.pin-down",
    name: "Pin Down",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 8,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If Pin Down hits, your target is crippled for 3...13...15 seconds":
    // 13 s, its rank-12 value, when the arrow lands.
    effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 13 }],
  },
  {
    id: "ranger.hunters-shot",
    name: "Hunter's Shot",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If Hunter's Shot hits, your target begins Bleeding for 3...21...25
    // seconds": 21 s, its rank-12 value, when the arrow lands.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 21 }],
  },
  {
    id: "ranger.crippling-shot",
    name: "Crippling Shot",
    type: "attack",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    // The 2026-04-28 revision's 2 s and 1...10...12; its 2010 "twice as
    // fast" arrow is gone, so it flies at the bow's speed.
    rechargeSeconds: 2,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    // "This attack cannot be blocked", as Wild Throw.
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: true,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If Crippling Shot hits, your target becomes Crippled for 1...10...12
    // seconds": 10 s, its rank-12 value, when the arrow lands.
    effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 10 }],
  },
  {
    id: "ranger.debilitating-shot",
    name: "Debilitating Shot",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If Debilitating Shot hits, your target loses 1...8...10 energy."
    effects: [
      {
        kind: "energy-loss",
        amount: { scaling: { attributeId: "ranger.marksmanship", atZero: 1, atTwelve: 8 } },
      },
    ],
  },
  {
    id: "ranger.burning-arrow",
    name: "Burning Arrow",
    type: "attack",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 5,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits, you strike for +10...26...30 damage..."
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.marksmanship", atZero: 10, atTwelve: 26 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...and cause Burning for 1...6...7 seconds": 6 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 6 }],
  },
  {
    id: "ranger.throw-dirt",
    name: "Throw Dirt",
    type: "skill",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.expertise",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 30,
    // "Target touched foe": the foe must be at hand.
    range: RANGE_MELEE,
    target: "single-enemy",
    // "...and foes adjacent to your target".
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...become blinded for 3...13...15 seconds": 13 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 13 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Stances (#523): one at a time, a new one ends the old                  */
  /* ---------------------------------------------------------------------- */

  {
    id: "warrior.sprint",
    name: "Sprint",
    type: "stance",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.strength",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 8...13...14 seconds, you move 25% faster": 13 s, its rank-12
    // value, until durations scale with ranks.
    effects: [{ kind: "apply-status", statusId: "sprint", durationSeconds: 13 }],
  },
  {
    id: "assassin.dash",
    name: "Dash",
    type: "stance",
    elite: false,
    profession: "assassin",
    // GW1's "No Attribute": any assassin can use it.
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "apply-status", statusId: "dash", durationSeconds: 3 }],
  },
  {
    id: "warrior.frenzy",
    name: "Frenzy",
    type: "stance",
    elite: false,
    profession: "warrior",
    // GW1's "No Attribute": any warrior can use it.
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 8 seconds, you attack 33% faster but take double damage."
    effects: [{ kind: "apply-status", statusId: "frenzy", durationSeconds: 8 }],
  },
  {
    id: "assassin.dark-escape",
    name: "Dark Escape",
    type: "stance",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.shadow-arts",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...13...15 seconds, you move 25% faster and take half damage":
    // 13 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "dark-escape", durationSeconds: 13 }],
  },
  {
    id: "ranger.natural-stride",
    name: "Natural Stride",
    type: "stance",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 1...7...8 seconds, you run 33% faster and have a 50% chance to
    // block incoming attacks": 7 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "natural-stride", durationSeconds: 7 }],
  },
  {
    id: "ranger.lightning-reflexes",
    name: "Lightning Reflexes",
    type: "stance",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.expertise",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    // PvP: 45 s; the PvE copy recharges in 30.
    rechargeSeconds: 45,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...10...11 seconds, you have a 75% chance to block melee and
    // projectile attacks, and you attack 33% faster": 10 s, its rank-12
    // value.
    effects: [{ kind: "apply-status", statusId: "lightning-reflexes", durationSeconds: 10 }],
  },
  {
    id: "ranger.escape",
    name: "Escape",
    type: "stance",
    elite: true,
    profession: "ranger",
    attributeId: "ranger.expertise",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 1...7...8 seconds, you move 33% faster and have a 75% chance to
    // block attacks. Escape ends if you make a melee attack" (PvP): 7 s,
    // its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "escape", durationSeconds: 7 }],
  },
  {
    id: "paragon.wild-throw",
    name: "Wild Throw",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "adrenaline", amount: 7 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    // "All of your non-spear attack skills are disabled for 3 seconds"
    // waits for disabled skills (#469). It never matters to a bar with
    // only spear attacks.
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "paragon.spear-mastery", atZero: 5, atTwelve: 17 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: true,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...and any Stance being used by your target ends."
    effects: [{ kind: "remove-status", category: "stance", count: 1 }],
  },
  {
    id: "paragon.cruel-spear",
    name: "Cruel Spear",
    type: "attack",
    elite: true,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "adrenaline", amount: 6 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "paragon.spear-mastery", atZero: 10, atTwelve: 42 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If it hits a non-moving target, you inflict a Deep Wound for
    // 5...17...20 seconds": read as the spear lands (#921).
    effects: [
      {
        kind: "if",
        condition: { kind: "target-not-moving" },
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
      },
    ],
  },
  {
    id: "paragon.barbed-spear",
    name: "Barbed Spear",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "adrenaline", amount: 2 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If this attack hits, your target begins Bleeding for 5...17...20
    // seconds": 17 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 17 }],
  },
  {
    id: "paragon.maiming-spear",
    name: "Maiming Spear",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 5,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If your attack hits a Bleeding foe, that foe is Crippled for
    // 5...17...20 seconds": read as the spear lands.
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "bleeding" },
        effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 17 }],
      },
    ],
  },
  {
    id: "paragon.merciless-spear",
    name: "Merciless Spear",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "adrenaline", amount: 6 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If this attack hits a foe with less than 50% Health, that foe
    // suffers from a Deep Wound for 5...17...20 seconds": read after the
    // spear's own damage has landed.
    effects: [
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.5 },
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
      },
    ],
  },
  {
    id: "paragon.stunning-strike",
    name: "Stunning Strike",
    type: "attack",
    elite: true,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "adrenaline", amount: 8 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "paragon.spear-mastery", atZero: 10, atTwelve: 42 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If it hits a foe suffering from a Condition, that foe is also Dazed
    // for 4...9...10 seconds": 9 s, read after the spear has landed.
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has", category: "condition" },
        effects: [{ kind: "apply-status", statusId: "dazed", durationSeconds: 9 }],
      },
    ],
  },
  {
    id: "paragon.harriers-toss",
    name: "Harrier's Toss",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits a moving foe, it deals an additional
    // 5...33...40 damage": one packet with the +17, read as the spear
    // lands on `moving`, one tick late (#921).
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "paragon.spear-mastery", atZero: 5, atTwelve: 17 },
      },
      conditionalBonus: {
        condition: { kind: "target-moving" },
        amount: { scaling: { attributeId: "paragon.spear-mastery", atZero: 5, atTwelve: 33 } },
      },
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },

  /* ---------------------------------------------------------------------- */
  /* Signets and shouts (#524)                                               */
  /* ---------------------------------------------------------------------- */

  {
    id: "warrior.healing-signet",
    name: "Healing Signet",
    type: "signet",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.tactics",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    // "You have -40 armor while using this skill."
    whileActivating: "healing-signet-armor",
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: { scaling: { attributeId: "warrior.tactics", atZero: 82, atTwelve: 154 } },
      },
    ],
  },
  {
    id: "warrior.watch-yourself",
    name: '"Watch Yourself!"',
    type: "shout",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.tactics",
    cost: { kind: "adrenaline", amount: 4 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "self",
    // "Party members within earshot", the shouter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // +21 armor for 10 seconds, ending after 3 incoming attacks: its
    // rank-12 numbers, in the status.
    effects: [{ kind: "apply-status", statusId: "watch-yourself", durationSeconds: 10 }],
  },
  {
    id: "paragon.fall-back",
    name: '"Fall Back!"',
    type: "shout",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.command",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 25,
    range: RANGE_SPELL,
    target: "self",
    // "All allies within earshot", the shouter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // 13 Health per second while moving and 33% faster for 9 seconds,
    // ending on a hit: its rank-12 numbers, in the status.
    effects: [{ kind: "apply-status", statusId: "fall-back", durationSeconds: 9 }],
  },
  {
    id: "paragon.stand-your-ground",
    name: '"Stand Your Ground!"',
    type: "shout",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.command",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "self",
    // "All party members within earshot", the shouter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // +24 armor when not moving for 17 seconds, ending if its bearer
    // attacks: its rank-12 numbers, in the status.
    effects: [{ kind: "apply-status", statusId: "stand-your-ground", durationSeconds: 17 }],
  },
  {
    id: "paragon.incoming",
    name: '"Incoming!"',
    type: "shout",
    elite: true,
    profession: "paragon",
    attributeId: "paragon.command",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 25,
    range: RANGE_SPELL,
    target: "self",
    // "All allies within earshot", the shouter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // 33% faster and 13 Health per second while moving for 9 seconds:
    // its rank-12 numbers, in the status (#956).
    effects: [{ kind: "apply-status", statusId: "incoming", durationSeconds: 9 }],
  },
  {
    id: "paragon.make-haste",
    name: '"Make Haste!"',
    type: "shout",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.command",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...17...20 seconds, target other ally moves 33% faster. This
    // skill ends if that ally successfully hits with an attack." (#956)
    effects: [{ kind: "apply-status", statusId: "make-haste", durationSeconds: 17 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Preparations (#525): ride your attacks, one at a time                  */
  /* ---------------------------------------------------------------------- */

  {
    id: "ranger.apply-poison",
    name: "Apply Poison",
    type: "preparation",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 24 seconds, enemies struck by your physical attacks become
    // poisoned for 3...13...15 seconds": the poison is the status's
    // `onAttackHit`.
    effects: [{ kind: "apply-status", statusId: "apply-poison", durationSeconds: 24 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Glyphs (#526): change your next spells, one at a time                  */
  /* ---------------------------------------------------------------------- */

  {
    id: "elementalist.glyph-of-lesser-energy",
    name: "Glyph of Lesser Energy",
    type: "glyph",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 15 seconds, your next 2 spells cost 10...16...18 less Energy to
    // cast": the two spells and the 16 are the status's `nextSpells`.
    effects: [{ kind: "apply-status", statusId: "glyph-of-lesser-energy", durationSeconds: 15 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Chants and weapon spells (#758)                                         */
  /* ---------------------------------------------------------------------- */

  {
    id: "paragon.anthem-of-flame",
    name: "Anthem of Flame",
    type: "chant",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.leadership",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    // "Each party member within earshot", the chanter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10 seconds, the next attack skill used ... also causes Burning
    // for 1...3...3 seconds": the burning is the status's `nextAttackSkill`.
    effects: [{ kind: "apply-status", statusId: "anthem-of-flame", durationSeconds: 10 }],
  },
  {
    id: "paragon.defensive-anthem",
    name: "Defensive Anthem",
    type: "chant",
    elite: true,
    profession: "paragon",
    attributeId: "paragon.leadership",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 25,
    range: RANGE_SPELL,
    target: "self",
    // "Each party member within earshot", the chanter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // A 50% block for 9 seconds, ending on a member's attack-skill hit:
    // its rank-12 numbers, in the status (#956).
    effects: [{ kind: "apply-status", statusId: "defensive-anthem", durationSeconds: 9 }],
  },
  {
    id: "paragon.song-of-restoration",
    name: "Song of Restoration",
    type: "chant",
    elite: true,
    profession: "paragon",
    attributeId: "paragon.motivation",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    // "Each party member within earshot", the chanter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10 seconds, the next time each party member within earshot uses
    // a Skill, that party member gains 45...97...110 Health" (PvP, #999):
    // 97 at rank 12, in the status. A heal, not a gain, as the fandom's
    // anomaly note has it, so Deep Wound cuts it. The chanter's own cast
    // does not use it up: its next skill does.
    effects: [{ kind: "apply-status", statusId: "song-of-restoration", durationSeconds: 10 }],
  },
  {
    id: "ritualist.weapon-of-warding",
    name: "Weapon of Warding",
    type: "weapon-spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 3...7...8 seconds": 7 s, its rank-12 value; the regeneration,
    // the block and the end on attacking are the status's.
    effects: [{ kind: "apply-status", statusId: "weapon-of-warding", durationSeconds: 7 }],
  },
  {
    id: "ritualist.mend-body-and-soul",
    name: "Mend Body and Soul",
    type: "spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "That ally loses one condition for each spirit within earshot"
    // (#1064): earshot of the ally, any team's spirit.
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 20, atTwelve: 96 },
        },
      },
      { kind: "remove-status", category: "condition", count: 1, perSpiritNear: AREA_EARSHOT },
    ],
  },
  {
    id: "ritualist.spirit-light",
    name: "Spirit Light",
    type: "spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If any Spirits are within earshot, you don't sacrifice Health"
    // (#1064): earshot of you, any team's spirit.
    effects: [
      {
        kind: "if",
        condition: { kind: "caster-no-spirit-within", radius: AREA_EARSHOT },
        effects: [{ kind: "sacrifice-health", percentOfMax: 17 }],
      },
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 60, atTwelve: 156 },
        },
      },
    ],
  },
  {
    id: "ritualist.wielders-boon",
    name: "Wielder's Boon",
    type: "spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If that ally is under the effects of a Weapon Spell, Wielder's Boon
    // heals for an additional 15...63...75 Health."
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 51 },
        },
      },
      {
        kind: "if",
        condition: { kind: "target-has", category: "weapon-spell" },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            amount: {
              scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 63 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.spirit-light-weapon",
    name: "Spirit Light Weapon",
    type: "weapon-spell",
    elite: true,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10 seconds, target ally gains 5...21...25 Health per second and an
    // additional 5...21...25 Health per second if that ally is within
    // earshot of a Spirit": the 21 is the status's; there are no spirits
    // yet (#467), so never the additional 21, as in GW1 with none up.
    effects: [{ kind: "apply-status", statusId: "spirit-light-weapon", durationSeconds: 10 }],
  },
  {
    id: "ritualist.weapon-of-quickening",
    name: "Weapon of Quickening",
    type: "weapon-spell",
    elite: true,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...21...25 seconds, target ally has a Weapon of Quickening, and
    // Spells and Binding Rituals recharge 33% faster": 21 s, its rank-12
    // value. There are no binding rituals yet (#467), so spells alone.
    effects: [{ kind: "apply-status", statusId: "weapon-of-quickening", durationSeconds: 21 }],
  },
  {
    id: "ritualist.weapon-of-aggression",
    name: "Weapon of Aggression",
    type: "weapon-spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...13...15 seconds, you attack 25% faster": 13 s, its rank-12
    // value.
    effects: [{ kind: "apply-status", statusId: "weapon-of-aggression", durationSeconds: 13 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Ritualist weapon spells 2 (#1022)                                       */
  /* ---------------------------------------------------------------------- */

  {
    id: "ritualist.weapon-of-remedy",
    name: "Weapon of Remedy",
    type: "weapon-spell",
    elite: true,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 3 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 8 seconds, the next time target ally takes damage or life steal
    // from a foe, that ally steals up to 20...68...80 health from that foe
    // and loses 2 conditions": the 2026-04-28 revision (3 energy, 68, 2
    // conditions); the steal and the removal are the status's.
    effects: [{ kind: "apply-status", statusId: "weapon-of-remedy", durationSeconds: 8 }],
  },
  {
    id: "ritualist.vengeful-weapon",
    name: "Vengeful Weapon",
    type: "weapon-spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 8 seconds, the next time target ally takes damage or life steal
    // from a foe, that ally steals up to 15...51...60 Health from that
    // foe": the 51 is the status's.
    effects: [{ kind: "apply-status", statusId: "vengeful-weapon", durationSeconds: 8 }],
  },
  {
    id: "ritualist.splinter-weapon",
    name: "Splinter Weapon",
    type: "weapon-spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 20 seconds, target ally has a Splinter Weapon. Target ally's next
    // 1...4...5 attacks deal 5...25...30 damage to up to 4 adjacent foes":
    // the PvP page, 726; the 4 hits and the 25 are the status's.
    effects: [{ kind: "apply-status", statusId: "splinter-weapon", durationSeconds: 20 }],
  },
  {
    id: "ritualist.mending-grip",
    name: "Mending Grip",
    type: "spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target ally is healed for 15...68...80 Health. If that ally is under
    // the effects of a weapon Spell, that ally loses one Condition": the
    // 2026-04-28 revision (4 s, 68). The weapon spell is read before the
    // heal, as Wielder's Boon's.
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 68 },
        },
      },
      {
        kind: "if",
        condition: { kind: "target-has", category: "weapon-spell" },
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* An effect that depends on an earlier one (#521)                         */
  /* ---------------------------------------------------------------------- */

  {
    id: "mesmer.power-spike",
    name: "Power Spike",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If target foe is casting a Spell or Chant, the Skill is interrupted
    // and target foe takes 30...102...120 damage."
    effects: [
      { kind: "interrupt", only: "spell-or-chant" },
      {
        kind: "if",
        condition: { kind: "interrupted" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 30, atTwelve: 102 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  {
    id: "mesmer.power-drain",
    name: "Power Drain",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.inspiration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If target foe is casting a Spell or Chant, the Skill is interrupted
    // and you gain 1...25...31 Energy."
    effects: [
      { kind: "interrupt", only: "spell-or-chant" },
      {
        kind: "if",
        condition: { kind: "interrupted" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 1, atTwelve: 25 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "mesmer.leech-signet",
    name: "Leech Signet",
    type: "signet",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.inspiration-magic",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Interrupt target foe's action. If that action was a spell, you gain
    // 3...13...15 Energy" (#920): any action, and energy for a spell only.
    effects: [
      { kind: "interrupt" },
      {
        kind: "if",
        condition: { kind: "interrupted-spell" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 3, atTwelve: 13 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "mesmer.shatter-enchantment",
    name: "Shatter Enchantment",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove an enchantment from target foe. If an enchantment is
    // removed, that foe takes 14...83...100 damage."
    effects: [
      { kind: "remove-status", category: "enchantment", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 14, atTwelve: 83 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  {
    id: "mesmer.drain-enchantment",
    name: "Drain Enchantment",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.inspiration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove an Enchantment from target foe. If an Enchantment is
    // removed, you gain 8...15...17 Energy and 40...104...120 Health."
    effects: [
      { kind: "remove-status", category: "enchantment", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 8, atTwelve: 15 },
            },
          },
          {
            kind: "heal",
            perStatusOnTarget: [],
            recipient: "caster",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 40, atTwelve: 104 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.lightning-orb",
    name: "Lightning Orb",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Our own tuning, as GW1 publishes no speeds: lightning flies half as
    // fast again as Fireball, so it is harder to step out of (#761).
    projectile: { speed: 1.5 * RANGE_SPELL },
    // "...strikes target foe for 10...82...100 lightning damage if it
    // hits. This spell has 25% armor penetration."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 82 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Energy loss, and amounts per point lost (#793)                         */
  /* ---------------------------------------------------------------------- */

  {
    id: "mesmer.energy-burn",
    name: "Energy Burn",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target foe loses 1...8...10 Energy and takes 9 damage for each
    // point of energy lost."
    effects: [
      {
        kind: "energy-loss",
        amount: { scaling: { attributeId: "mesmer.domination-magic", atZero: 1, atTwelve: 8 } },
      },
      {
        kind: "damage",
        amount: { flat: 9 },
        type: "typeless",
        armorPenetration: 0,
        perEnergyLost: true,
      },
    ],
  },
  {
    id: "mesmer.energy-tap",
    name: "Energy Tap",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.inspiration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target foe loses 4...6...7 Energy. You then gain 2 Energy for each
    // point of Energy target foe lost."
    effects: [
      {
        kind: "energy-loss",
        amount: { scaling: { attributeId: "mesmer.inspiration-magic", atZero: 4, atTwelve: 6 } },
      },
      { kind: "energy-gain", amount: { flat: 2 }, perEnergyLost: true },
    ],
  },
  {
    id: "mesmer.energy-surge",
    name: "Energy Surge",
    type: "spell",
    elite: true,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target foe loses 1...8...10 energy. For each point of energy lost,
    // that foe and all nearby foes take 7 damage and all nearby foes take
    // 75% of that damage" (PvP, #920): nearby the target, 5.25 a point of
    // what the target lost, rounded as all damage is.
    effects: [
      {
        kind: "energy-loss",
        amount: { scaling: { attributeId: "mesmer.domination-magic", atZero: 1, atTwelve: 8 } },
      },
      {
        kind: "damage",
        amount: { flat: 7 },
        type: "typeless",
        armorPenetration: 0,
        perEnergyLost: true,
      },
      {
        kind: "splash",
        radius: AREA_NEARBY,
        effects: [
          {
            kind: "damage",
            amount: { flat: 5.25 },
            type: "typeless",
            armorPenetration: 0,
            perEnergyLost: true,
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Hexes that answer what their target does (#469)                        */
  /* ---------------------------------------------------------------------- */
  {
    id: "mesmer.backfire",
    name: "Backfire",
    type: "hex",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10 seconds, whenever target foe casts a spell, that foe takes
    // 35...119...140 damage." The damage is the hex's, at rank 12.
    effects: [{ kind: "apply-status", statusId: "backfire", durationSeconds: 10 }],
  },
  {
    id: "mesmer.diversion",
    name: "Diversion",
    type: "hex",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 6 seconds, the next time target foe uses a skill, that skill
    // takes an additional 10...47...56 seconds to recharge." The extra
    // recharge is the hex's, at rank 12 (#949).
    effects: [{ kind: "apply-status", statusId: "diversion", durationSeconds: 6 }],
  },
  {
    id: "mesmer.arcane-echo",
    name: "Arcane Echo",
    type: "enchantment",
    elite: false,
    profession: "mesmer",
    attributeId: undefined,
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If you cast a spell in the next 20 seconds, Arcane Echo is replaced
    // with that spell for 20 seconds." The copy is the status's (#469).
    effects: [{ kind: "apply-status", statusId: "arcane-echo", durationSeconds: 20 }],
  },
  {
    id: "mesmer.echo",
    name: "Echo",
    type: "enchantment",
    elite: true,
    profession: "mesmer",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 30 seconds, Echo is replaced with the next skill you use. Echo
    // acts as this skill for 20 seconds." The copy is the status's (#469).
    effects: [{ kind: "apply-status", statusId: "echo", durationSeconds: 30 }],
  },
  {
    id: "mesmer.empathy",
    name: "Empathy",
    type: "hex",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...13...15 seconds, whenever target foe attacks, that foe takes
    // 15...39...45 damage" (PvP). Both at rank 12, as every status is.
    effects: [{ kind: "apply-status", statusId: "empathy", durationSeconds: 13 }],
  },
  {
    id: "necromancer.parasitic-bond",
    name: "Parasitic Bond",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 20 seconds, target foe suffers health degeneration of 1. The
    // caster is healed for 30...102...120 when Parasitic Bond ends." The
    // heal is the hex's, at rank 12 (#887).
    effects: [{ kind: "apply-status", statusId: "parasitic-bond", durationSeconds: 20 }],
  },
  {
    id: "necromancer.contagion",
    name: "Contagion",
    type: "enchantment",
    elite: true,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 60 seconds, whenever you suffer from a new Condition, all foes
    // in the area suffer from that same Condition and you sacrifice
    // 10...6...5% maximum Health." The spread and the 6% are the
    // enchantment's (#887).
    effects: [{ kind: "apply-status", statusId: "contagion", durationSeconds: 60 }],
  },

  /* ---------------------------------------------------------------------- */
  /* An effect that depends on how things stand (#794)                      */
  /* ---------------------------------------------------------------------- */

  {
    id: "monk.word-of-healing",
    name: "Word of Healing",
    type: "spell",
    elite: true,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Heal target ally for 5...81...100 Health. Heal for an additional
    // 30...98...115 Health if that ally is below 50% health."
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 81 } },
      },
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.5 },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 98 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "monk.dwaynas-kiss",
    name: "Dwayna's Kiss",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Heal target other ally for 15...51...60 Health and an additional
    // 10...30...35 Health for each enchantment or hex on that ally" (#920).
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 15, atTwelve: 51 } },
      },
      {
        kind: "heal",
        perStatusOnTarget: ["enchantment", "hex"],
        amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 10, atTwelve: 30 } },
      },
    ],
  },
  {
    id: "dervish.mystic-sweep",
    name: "Mystic Sweep",
    type: "attack",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.mysticism",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits, you deal +3...10...12 damage. If you are
    // enchanted, this attack deals an additional +3...10...12 damage."
    attack: {
      weapon: "melee",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "dervish.mysticism", atZero: 3, atTwelve: 10 } },
      conditionalBonus: {
        condition: { kind: "caster-has", category: "enchantment" },
        amount: { scaling: { attributeId: "dervish.mysticism", atZero: 3, atTwelve: 10 } },
      },
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "dervish.mystic-regeneration",
    name: "Mystic Regeneration",
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...17...20 seconds, you have 1...3...4 Health regeneration for
    // each Enchantment (maximum of 3) on you": 17 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "mystic-regeneration", durationSeconds: 17 }],
  },
  {
    id: "dervish.fleeting-stability",
    name: "Fleeting Stability",
    // A flash enchantment: an enchantment spell with no activation.
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 4...9...10 seconds, you cannot be knocked down and move 25%
    // faster": 9 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "fleeting-stability", durationSeconds: 9 }],
  },
  {
    id: "dervish.heart-of-fury",
    name: "Heart of Fury",
    type: "stance",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.mysticism",
    cost: { kind: "adrenaline", amount: 4 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 2...8...10 seconds, you attack 25% faster": 8 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "heart-of-fury", durationSeconds: 8 }],
  },
  {
    id: "dervish.wounding-strike",
    name: "Wounding Strike",
    type: "attack",
    elite: true,
    profession: "dervish",
    attributeId: "dervish.scythe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 3,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "scythe",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If this attack hits, target foe suffers from Bleeding for 5...17...20
    // seconds, and you lose 1 Dervish enchantment. If an enchantment is
    // removed, target foe also suffers from a Deep Wound for 5...17...20
    // seconds": 17 s each, the rank-12 values.
    effects: [
      { kind: "apply-status", statusId: "bleeding", durationSeconds: 17 },
      {
        kind: "remove-status",
        category: "enchantment",
        count: 1,
        profession: "dervish",
        from: "caster",
      },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment", from: "caster" },
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
      },
    ],
  },
  {
    id: "dervish.signet-of-pious-light",
    name: "Signet of Pious Light",
    type: "signet",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove 1 Dervish Enchantment. Target ally is healed for
    // 30...126...150 Health. If an Enchantment was removed in this way,
    // this Signet recharges 75% faster."
    effects: [
      {
        kind: "remove-status",
        category: "enchantment",
        count: 1,
        profession: "dervish",
        from: "caster",
      },
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: { scaling: { attributeId: "dervish.earth-prayers", atZero: 30, atTwelve: 126 } },
      },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment", from: "caster" },
        effects: [{ kind: "recharge-faster", fraction: 0.75 }],
      },
    ],
  },
  {
    id: "dervish.pious-restoration",
    name: "Pious Restoration",
    type: "spell",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.wind-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "You gain 80...136...150 Health and remove 1 Dervish enchantment. If
    // an enchantment was removed in this way, you also lose 1...3...3
    // hexes": 3, its rank-12 value.
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        recipient: "caster",
        amount: { scaling: { attributeId: "dervish.wind-prayers", atZero: 80, atTwelve: 136 } },
      },
      {
        kind: "remove-status",
        category: "enchantment",
        count: 1,
        profession: "dervish",
        from: "caster",
      },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment", from: "caster" },
        effects: [{ kind: "remove-status", category: "hex", count: 3, from: "caster" }],
      },
    ],
  },
  {
    id: "dervish.vow-of-strength",
    name: "Vow of Strength",
    type: "enchantment",
    elite: true,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 15 seconds, whenever you attack a foe with your scythe, you deal
    // 10...22...25 slashing damage to all adjacent foes": the status deals it.
    effects: [{ kind: "apply-status", statusId: "vow-of-strength", durationSeconds: 15 }],
  },
  {
    id: "dervish.sand-shards",
    name: "Sand Shards",
    // A flash enchantment: an enchantment spell with no activation.
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 30 seconds, the next 1...4...5 times you hit with a scythe, all
    // other adjacent foes take 10...50...60 earth damage": the status does.
    effects: [{ kind: "apply-status", statusId: "sand-shards", durationSeconds: 30 }],
  },
  {
    id: "dervish.pious-haste",
    name: "Pious Haste",
    type: "stance",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.mysticism",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "You remove 1 Dervish enchantment and for 1...6...7 you move 25%
    // faster. If an enchantment was removed, you run 50% faster instead":
    // 6 s, its rank-12 value. The run is a stance too, so it replaces the
    // 25% one as it lands.
    effects: [
      {
        kind: "remove-status",
        category: "enchantment",
        count: 1,
        profession: "dervish",
        from: "caster",
      },
      { kind: "apply-status", statusId: "pious-haste", durationSeconds: 6 },
      {
        kind: "if",
        condition: { kind: "removed", category: "enchantment", from: "caster" },
        effects: [{ kind: "apply-status", statusId: "pious-haste-run", durationSeconds: 6 }],
      },
    ],
  },
  {
    id: "dervish.victorious-sweep",
    name: "Victorious Sweep",
    type: "attack",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.scythe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits, you deal +5...21...25 damage. If target foe has
    // less Health than you, you gain 30...70...80 Health." Read after the
    // blow, so its own damage counts.
    attack: {
      weapon: "melee",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "dervish.scythe-mastery", atZero: 5, atTwelve: 21 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-less-health" },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            recipient: "caster",
            amount: {
              scaling: { attributeId: "dervish.scythe-mastery", atZero: 30, atTwelve: 70 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "dervish.zealous-sweep",
    name: "Zealous Sweep",
    type: "attack",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.scythe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits, you deal +5...17...20 damage. You gain 3 Energy
    // and 1 strike of adrenaline for each foe you hit." A scythe cleaves,
    // so that is up to 3 (#977).
    attack: {
      weapon: "scythe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "dervish.scythe-mastery", atZero: 5, atTwelve: 17 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      { kind: "energy-gain", amount: { flat: 3 }, perTarget: true },
      { kind: "adrenaline-gain", strikes: 1, perTarget: true },
    ],
  },
  {
    id: "dervish.mystic-twister",
    name: "Mystic Twister",
    type: "spell",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.wind-prayers",
    cost: { kind: "adrenaline", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "self",
    // "Deals 10...50...60 cold damage to all nearby foes. If you are
    // enchanted, this spell deals an additional +10...50...60 cold
    // damage": one packet, the bonus read as it lands (#977).
    area: {
      radius: AREA_NEARBY,
      origin: "caster",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "damage",
        type: "cold",
        armorPenetration: 0,
        amount: { scaling: { attributeId: "dervish.wind-prayers", atZero: 10, atTwelve: 50 } },
        conditionalBonus: {
          condition: { kind: "caster-has", category: "enchantment" },
          amount: { scaling: { attributeId: "dervish.wind-prayers", atZero: 10, atTwelve: 50 } },
        },
      },
    ],
  },
  // Dervish earth enchantments and Eremite's Attack (#1021).
  {
    id: "dervish.eremites-attack",
    name: "Eremite's Attack",
    type: "attack",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.scythe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If it hits, this attack deals +1...8...10 damage and removes a
    // Dervish enchantment. If an enchantment is removed, you do an
    // additional +1...8...10 damage and strike all adjacent foes": +8 and
    // +8, the rank-12 values. The blow reads the enchantment the removal
    // will take, before it lands (ADR-0029).
    attack: {
      weapon: "scythe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "dervish.scythe-mastery", atZero: 1, atTwelve: 8 } },
      conditionalBonus: {
        condition: { kind: "caster-has", category: "enchantment", profession: "dervish" },
        amount: { scaling: { attributeId: "dervish.scythe-mastery", atZero: 1, atTwelve: 8 } },
      },
      cleavesAllWhen: { kind: "caster-has", category: "enchantment", profession: "dervish" },
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "remove-status",
        category: "enchantment",
        count: 1,
        profession: "dervish",
        from: "caster",
      },
    ],
  },
  {
    id: "dervish.staggering-force",
    name: "Staggering Force",
    // A flash enchantment: an enchantment spell with no activation.
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "All nearby foes are struck for 10...34...40 earth damage. For 30
    // seconds, your attacks deal earth damage": 34, its rank-12 value. The
    // status turns the attacks, and cracks armor when it ends.
    effects: [
      { kind: "apply-status", statusId: "staggering-force", durationSeconds: 30 },
      {
        kind: "splash",
        radius: AREA_NEARBY,
        effects: [
          {
            kind: "damage",
            type: "earth",
            armorPenetration: 0,
            amount: { scaling: { attributeId: "dervish.earth-prayers", atZero: 10, atTwelve: 34 } },
          },
        ],
      },
    ],
  },
  {
    id: "dervish.dust-cloak",
    name: "Dust Cloak",
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "All nearby foes are struck for 10...34...40 earth damage. For 30
    // seconds, your attacks deal earth damage": 34. The status blinds
    // when it ends.
    effects: [
      { kind: "apply-status", statusId: "dust-cloak", durationSeconds: 30 },
      {
        kind: "splash",
        radius: AREA_NEARBY,
        effects: [
          {
            kind: "damage",
            type: "earth",
            armorPenetration: 0,
            amount: { scaling: { attributeId: "dervish.earth-prayers", atZero: 10, atTwelve: 34 } },
          },
        ],
      },
    ],
  },
  {
    id: "dervish.aura-of-thorns",
    name: "Aura of Thorns",
    type: "enchantment",
    elite: false,
    profession: "dervish",
    attributeId: "dervish.earth-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "All nearby foes begin Bleeding for 5...13...15 seconds. For 30
    // seconds, this enchantment does nothing": 13 s. The status cripples
    // when it ends.
    effects: [
      { kind: "apply-status", statusId: "aura-of-thorns", durationSeconds: 30 },
      {
        kind: "splash",
        radius: AREA_NEARBY,
        effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 13 }],
      },
    ],
  },
  {
    id: "ranger.savage-shot",
    name: "Savage Shot",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 5,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    // "If Savage Shot hits, your target's action is interrupted. If that
    // action was a spell, you strike for 13...25...28 damage." The bonus
    // is read as the arrow lands, before its interrupt cuts the spell.
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: {
        condition: { kind: "target-casting", spell: true },
        amount: { scaling: { attributeId: "ranger.marksmanship", atZero: 13, atTwelve: 25 } },
      },
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "interrupt" }],
  },
  {
    id: "ranger.concussion-shot",
    name: "Concussion Shot",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 5,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    // "This attack deals only 1...13...16 damage": Distracting Shot's
    // shape, the arrow's own roll counts for nothing (ADR-0029, #760).
    attack: {
      weapon: "bow",
      weaponDamage: 0,
      bonusDamage: { scaling: { attributeId: "ranger.marksmanship", atZero: 1, atTwelve: 13 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If Concussion Shot hits while target foe is casting a spell, the
    // spell is interrupted and your target is dazed for 5...17...20
    // seconds": 17 s. A chant is not a spell. On a foe already Dazed the
    // arrow's own hit cuts the spell (#817); the daze still refreshes.
    effects: [
      { kind: "interrupt", only: "spell" },
      {
        kind: "if",
        condition: { kind: "interrupted-spell" },
        effects: [{ kind: "apply-status", statusId: "dazed", durationSeconds: 17 }],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Disables (#914): an interrupt that also locks the skill out            */
  /* ---------------------------------------------------------------------- */

  {
    id: "mesmer.power-block",
    name: "Power Block",
    type: "spell",
    elite: true,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If target foe is casting a spell or chant, that skill and all
    // skills of the same attribute are disabled for 1...10...12 seconds
    // and that skill is interrupted."
    effects: [
      { kind: "interrupt", only: "spell-or-chant" },
      {
        kind: "disable-skill",
        which: "interrupted-and-attribute",
        seconds: { scaling: { attributeId: "mesmer.domination-magic", atZero: 1, atTwelve: 10 } },
      },
    ],
  },
  {
    id: "ranger.distracting-shot",
    name: "Distracting Shot",
    type: "attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.expertise",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    // "If Distracting Shot hits, it interrupts target foe's action but
    // deals only 1...13...16 damage": the arrow's own roll counts for
    // nothing, and the bonus it deals ignores armor (ADR-0029, #760).
    attack: {
      weapon: "bow",
      weaponDamage: 0,
      bonusDamage: { scaling: { attributeId: "ranger.expertise", atZero: 1, atTwelve: 13 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If the interrupted action was a skill, that skill is disabled for
    // an additional 20 seconds."
    effects: [
      { kind: "interrupt" },
      { kind: "disable-skill", which: "interrupted", seconds: { flat: 20 } },
    ],
  },
  {
    id: "warrior.disrupting-chop",
    name: "Disrupting Chop",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "adrenaline", amount: 6 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 1,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If it hits, this attack interrupts the target's current action. If
    // that action was a skill, that skill is disabled for an additional
    // 20 seconds."
    effects: [
      { kind: "interrupt" },
      { kind: "disable-skill", which: "interrupted", seconds: { flat: 20 } },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Resurrection (#812)                                                   */
  /* ---------------------------------------------------------------------- */

  {
    id: "monk.restore-life",
    name: "Restore Life",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 4,
    rechargeSeconds: 8,
    // "Touch the body of a fallen party member": at hand, as Blood Ritual.
    range: RANGE_MELEE,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target party member is returned to life with 20...56...65% health
    // and 42...80...90% energy."
    effects: [
      {
        kind: "resurrect",
        health: {
          kind: "percent",
          percent: {
            scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 56 },
          },
        },
        energyPercent: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 42, atTwelve: 80 },
        },
        perPartyMemberWithin: undefined,
        at: "corpse",
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Resurrection skills (#474)                                             */
  /* ---------------------------------------------------------------------- */

  {
    id: "common.resurrection-signet",
    name: "Resurrection Signet",
    type: "signet",
    elite: false,
    profession: "common",
    attributeId: undefined,
    cost: undefined,
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 0,
    // "This signet only recharges when you gain a morale boost."
    rechargesOnMoraleBoost: true,
    range: RANGE_SPELL,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Resurrect target party member. That party member is returned to
    // life with 100% Health and 25% Energy."
    effects: [
      {
        kind: "resurrect",
        health: { kind: "percent", percent: { flat: 100 } },
        energyPercent: { flat: 25 },
        perPartyMemberWithin: undefined,
        at: "corpse",
      },
    ],
  },
  {
    id: "monk.rebirth",
    name: "Rebirth",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 5,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target party member is returned to life with 25% Health and zero
    // Energy, and is teleported to your current location. All of target's
    // skills are disabled for 10...4...3 seconds. This spell consumes all
    // your remaining energy." 4 s at Protection Prayers 12.
    effects: [
      {
        kind: "resurrect",
        health: { kind: "percent", percent: { flat: 25 } },
        energyPercent: { flat: 0 },
        perPartyMemberWithin: undefined,
        at: "caster",
      },
      {
        kind: "if",
        condition: { kind: "resurrected" },
        effects: [
          {
            kind: "disable-skill",
            which: "all",
            seconds: {
              scaling: { attributeId: "monk.protection-prayers", atZero: 10, atTwelve: 4 },
            },
          },
        ],
      },
      { kind: "drain-own-energy" },
    ],
  },
  {
    id: "paragon.signet-of-return",
    name: "Signet of Return",
    type: "signet",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.leadership",
    cost: undefined,
    overcast: 0,
    activationSeconds: 5,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Resurrect target party member with 5...13...15% Health and
    // 1...3...4% Energy for each party member within earshot." 13% and 3%
    // at Leadership 12; the caster is a party member.
    effects: [
      {
        kind: "resurrect",
        health: {
          kind: "percent",
          percent: { scaling: { attributeId: "paragon.leadership", atZero: 5, atTwelve: 13 } },
        },
        energyPercent: { scaling: { attributeId: "paragon.leadership", atZero: 1, atTwelve: 3 } },
        perPartyMemberWithin: AREA_EARSHOT,
        at: "corpse",
      },
    ],
  },
  {
    id: "ritualist.flesh-of-my-flesh",
    name: "Flesh of My Flesh",
    type: "spell",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 4,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Lose half your Health. Resurrect target ally with your current
    // Health and 5...17...20% Energy." 17% at Restoration Magic 12.
    effects: [
      {
        kind: "resurrect",
        health: { kind: "caster-current", casterLosesFractionOfCurrent: 0.5 },
        energyPercent: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 17 },
        },
        perPartyMemberWithin: undefined,
        at: "corpse",
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Elementalist and Necromancer staples (#918)                            */
  /* ---------------------------------------------------------------------- */

  {
    id: "elementalist.lightning-strike",
    name: "Lightning Strike",
    // The corpus's is a hex spell whose hex lands only while you are
    // overcast; that half is not modelled, so it is the plain strike.
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Strike target foe for 5...33...40 lightning damage. This spell has
    // 25% armor penetration."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 5, atTwelve: 33 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
    ],
  },
  {
    id: "elementalist.mind-shock",
    name: "Mind Shock",
    type: "spell",
    elite: true,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    // Exhaustion, as Chain Lightning's (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target foe suffers 10...42...50 lightning damage. If you have more
    // energy than target foe, that foe suffers 10...42...50 additional
    // lightning damage and is knocked down."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 42 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
      {
        kind: "if",
        condition: { kind: "caster-more-energy" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 42 },
            },
            type: "lightning",
            armorPenetration: 0.25,
          },
          { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
        ],
      },
    ],
  },
  {
    id: "elementalist.shard-storm",
    name: "Shard Storm",
    type: "hex",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Our own tuning, as GW1 publishes no speeds: a shard flies a little
    // faster than Fireball, slower than Lightning Orb.
    projectile: { speed: 1.25 * RANGE_SPELL },
    // "...strikes target foe for 10...70...85 cold damage if it hits and
    // causing target foe to move 66% slower for 2...5...6 seconds."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 70 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "shard-storm", durationSeconds: 5 },
    ],
  },
  {
    id: "necromancer.animate-bone-horror",
    name: "Animate Bone Horror",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    // The nearest fresh corpse within cast range, as Soul Feast's (#467).
    corpse: { radius: RANGE_SPELL },
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Exploit nearest corpse to animate a level 1...14...17 Bone Horror."
    effects: [{ kind: "summon", creature: BONE_HORROR, count: 1 }],
  },
  {
    id: "necromancer.animate-bone-minions",
    name: "Animate Bone Minions",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    // The nearest fresh corpse within cast range, as Soul Feast's (#467).
    corpse: { radius: RANGE_SPELL },
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Exploit nearest corpse to animate two level 0...10...12 Bone Minions."
    effects: [{ kind: "summon", creature: BONE_MINION, count: 2 }],
  },
  {
    id: "necromancer.soul-feast",
    name: "Soul Feast",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    // The nearest fresh corpse of either team within cast range of the
    // caster, no line of sight (#466, Q2).
    corpse: { radius: RANGE_SPELL },
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Exploit nearest corpse to steal 50...234...280 Health."
    effects: [
      {
        kind: "steal-from-corpse",
        amount: {
          scaling: { attributeId: "necromancer.death-magic", atZero: 50, atTwelve: 234 },
        },
      },
    ],
  },
  {
    id: "necromancer.well-of-suffering",
    name: "Well of Suffering",
    type: "well",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.death-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    // The nearest fresh corpse, as Soul Feast's (#1104).
    corpse: { radius: RANGE_SPELL },
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // PvP: "Exploit nearest corpse to create a Well of Suffering at its
    // location. For 10...26...30 seconds, foes in that area suffer health
    // degeneration of -1...5...6."
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "corpse",
        durationSeconds: {
          scaling: { attributeId: "necromancer.death-magic", atZero: 10, atTwelve: 26 },
        },
        act: {
          kind: "aura",
          aura: { statusId: "well-of-suffering", affects: "foes", radius: AREA_IN_THE_AREA },
        },
      },
    ],
  },
  {
    id: "necromancer.shadow-of-fear",
    name: "Shadow of Fear",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all adjacent foes": the target, then every foe
    // adjacent to it.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...attack 50% slower for the next 5...25...30 seconds."
    effects: [{ kind: "apply-status", statusId: "shadow-of-fear", durationSeconds: 25 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Necromancer curses (#935)                                              */
  /* ---------------------------------------------------------------------- */

  {
    id: "necromancer.spiteful-spirit",
    name: "Spiteful Spirit",
    type: "hex",
    elite: true,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10...22...25 seconds, whenever target foe attacks or uses a
    // skill, Spiteful Spirit deals 15...39...45 shadow damage to that foe
    // and all adjacent allies of that foe." The damage is the hex's.
    effects: [{ kind: "apply-status", statusId: "spiteful-spirit", durationSeconds: 22 }],
  },
  {
    id: "necromancer.insidious-parasite",
    name: "Insidious Parasite",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...13...15 seconds, whenever target foe hits with an attack,
    // you steal 15...39...45 health from that foe." The steal is the hex's.
    effects: [{ kind: "apply-status", statusId: "insidious-parasite", durationSeconds: 13 }],
  },
  {
    id: "necromancer.mark-of-pain",
    name: "Mark of Pain",
    type: "hex",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 30 seconds, whenever target foe takes physical damage, Mark of
    // Pain deals 10...34...40 shadow damage to adjacent foes." The damage
    // is the hex's.
    effects: [{ kind: "apply-status", statusId: "mark-of-pain", durationSeconds: 30 }],
  },
  {
    id: "necromancer.vampiric-gaze",
    name: "Vampiric Gaze",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Steal up to 18...52...60 Health from target foe."
    effects: [
      {
        kind: "life-steal",
        amount: {
          scaling: { attributeId: "necromancer.blood-magic", atZero: 18, atTwelve: 52 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Warrior and Monk staples (#936)                                        */
  /* ---------------------------------------------------------------------- */

  {
    id: "warrior.cyclone-axe",
    name: "Cyclone Axe",
    type: "attack",
    elite: false,
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_MELEE,
    target: "single-enemy",
    // "Perform a spinning axe attack striking for +4...10...12 damage to
    // all adjacent opponents": the target, then every foe adjacent to
    // you, each its own blow.
    area: {
      radius: AREA_ADJACENT,
      origin: "caster",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 4, atTwelve: 10 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "warrior.for-great-justice",
    name: '"For Great Justice!"',
    type: "shout",
    elite: false,
    profession: "warrior",
    // GW1's "No Attribute": any warrior can use it.
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 45,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // The PvP split: "For 8 seconds, whenever you hit with an attack, you
    // gain 1 additional strike of adrenaline."
    effects: [{ kind: "apply-status", statusId: "for-great-justice", durationSeconds: 8 }],
  },
  {
    id: "monk.protective-spirit",
    name: "Protective Spirit",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...19...23 seconds, target ally cannot lose more than 10%
    // health due to damage from a single attack or spell": 19 s, its
    // rank-12 value; the cap is the status's.
    effects: [{ kind: "apply-status", statusId: "protective-spirit", durationSeconds: 19 }],
  },
  {
    id: "monk.infuse-health",
    name: "Infuse Health",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Lose half your current health. Target other ally is healed for
    // 100...129...136% of the amount you lost."
    effects: [
      {
        kind: "give-health",
        fractionOfCurrent: 0.5,
        healPercent: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 100, atTwelve: 129 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Paragon command (#923)                                                 */
  /* ---------------------------------------------------------------------- */

  {
    id: "paragon.spear-of-lightning",
    name: "Spear of Lightning",
    type: "attack",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.spear-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 6,
    range: WEAPONS.spear.range,
    target: "single-enemy",
    area: undefined,
    // "If this attack hits, it deals +8...18...20 lightning damage. This
    // attack has 25% armor penetration." GW1 makes the whole blow one
    // lightning packet, the spear's damage and the bonus alike.
    attack: {
      weapon: "spear",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "paragon.spear-mastery", atZero: 8, atTwelve: 18 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: "lightning",
      armorPenetration: 0.25,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [],
  },
  {
    id: "paragon.never-surrender",
    name: '"Never Surrender!"',
    type: "shout",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.command",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    // "All party members within earshot", the shouter among them.
    area: {
      radius: AREA_EARSHOT,
      origin: "caster",
      affects: "allies",
      maxTargets: undefined,
      includesCaster: true,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // PvP: "...and below 75% Health, gain +1...4...5 Health regeneration"
    // for 10 seconds. Read as it lands; it stays on one healed above.
    effects: [
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.75 },
        effects: [{ kind: "apply-status", statusId: "never-surrender", durationSeconds: 10 }],
      },
    ],
  },
  {
    id: "paragon.leaders-comfort",
    name: "Leader's Comfort",
    type: "skill",
    elite: false,
    profession: "paragon",
    attributeId: "paragon.leadership",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "You gain 30...66...75 Health. For each ally within earshot, you
    // also gain +10...18...20 Health (maximum 140 Health)." The caster is
    // one of those allies, as GW1 counts it, and 140 caps the whole heal.
    effects: [
      {
        kind: "heal",
        amount: { scaling: { attributeId: "paragon.leadership", atZero: 30, atTwelve: 66 } },
        perStatusOnTarget: [],
        perAlly: {
          amount: { scaling: { attributeId: "paragon.leadership", atZero: 10, atTwelve: 18 } },
          radius: AREA_EARSHOT,
          max: 140,
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Mesmer and Elementalist staples (#938)                                 */
  /* ---------------------------------------------------------------------- */
  {
    id: "mesmer.cry-of-frustration",
    name: "Cry of Frustration",
    type: "spell",
    elite: false,
    profession: "mesmer",
    attributeId: "mesmer.domination-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "If target foe is using a skill, that foe and all foes in the area
    // are interrupted and suffer 15...63...75 damage and foes in the area
    // take 75% of that damage." Not using one: nothing, to anyone.
    effects: [
      { kind: "interrupt" },
      {
        kind: "if",
        condition: { kind: "interrupted" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 15, atTwelve: 63 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          {
            kind: "splash",
            radius: AREA_IN_THE_AREA,
            effects: [
              { kind: "interrupt" },
              {
                kind: "damage",
                amount: {
                  scaling: {
                    attributeId: "mesmer.domination-magic",
                    atZero: 11.25,
                    atTwelve: 47.25,
                  },
                },
                type: "typeless",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "mesmer.mantra-of-recovery",
    name: "Mantra of Recovery",
    type: "stance",
    elite: true,
    profession: "mesmer",
    attributeId: "mesmer.fast-casting",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...17...20 seconds, spells you cast recharge 33% faster."
    effects: [{ kind: "apply-status", statusId: "mantra-of-recovery", durationSeconds: 17 }],
  },
  {
    id: "elementalist.ice-spikes",
    name: "Ice Spikes",
    type: "hex",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target and adjacent foes": dropped from the sky, so no projectile.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...are struck for 20...68...80 cold damage and move 66% slower for
    // 2...5...6 seconds."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 20, atTwelve: 68 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "ice-spikes", durationSeconds: 5 },
    ],
  },
  {
    id: "elementalist.deep-freeze",
    name: "Deep Freeze",
    type: "hex",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "...at target foe's location. All foes in this area".
    area: {
      radius: AREA_IN_THE_AREA,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...are struck for 10...70...85 cold damage. For 10 seconds, all foes
    // move 66% slower."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 70 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "deep-freeze", durationSeconds: 10 },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Monk and Necromancer staples (#944)                                    */
  /* ---------------------------------------------------------------------- */
  {
    id: "monk.patient-spirit",
    name: "Patient Spirit",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 2 seconds ... Unless this enchantment ends prematurely, that
    // ally is healed for 30...102...120 Health": the status's `expires`.
    effects: [{ kind: "apply-status", statusId: "patient-spirit", durationSeconds: 2 }],
  },
  {
    id: "monk.holy-veil",
    name: "Holy Veil",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "While you maintain this enchantment, any hex cast on target ally
    // take twice as long to cast. When Holy Veil ends, one hex is removed."
    effects: [{ kind: "maintain-status", statusId: "holy-veil" }],
  },
  {
    id: "necromancer.rend-enchantments",
    name: "Rend Enchantments",
    type: "spell",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove 5...8...9 enchantments from target foe. For each Monk
    // Enchantment removed, you lose 55...31...25" Health: fewer, the
    // better you are at Curses.
    effects: [
      { kind: "remove-status", category: "enchantment", count: 8 },
      {
        kind: "lose-health",
        amount: { scaling: { attributeId: "necromancer.curses", atZero: 55, atTwelve: 31 } },
        perRemovedOfProfession: "monk",
      },
    ],
  },
  {
    id: "necromancer.plague-touch",
    name: "Plague Touch",
    type: "skill",
    elite: false,
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 0,
    // "Target touched foe", as Throw Dirt's.
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Transfer 1...3...3 negative conditions and their remaining
    // durations from yourself to target touched foe."
    effects: [{ kind: "transfer-conditions", count: 3 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Elementalist knockdown staples (#985)                                  */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.blinding-flash",
    name: "Blinding Flash",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    // The 2011 revision's 8 s, which the corpus carries.
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target enemy is blinded for 3...7...8 seconds": 7 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 7 }],
  },
  {
    id: "elementalist.shock",
    name: "Shock",
    // A touch skill, not a spell: Dazed does not slow it, Fast Casting does
    // not speed it, Backfire does not answer it.
    type: "skill",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    // Exhaustion, as Mind Shock's (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 0.75,
    rechargeSeconds: 10,
    // "Target touched foe": the foe must be at hand.
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...is knocked down and struck for 10...50...60 lightning damage. This
    // skill has 25% armor penetration."
    effects: [
      { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 50 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
    ],
  },
  {
    id: "elementalist.aftershock",
    name: "Aftershock",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    // "Nearby foes": the latest revision's radius, around the caster.
    area: {
      radius: AREA_NEARBY,
      origin: "caster",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...are struck for 26...85...100 earth damage. Knocked down foes are
    // struck for 10...56...68 additional earth damage." Down is read before
    // the first strike lands.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 26, atTwelve: 85 },
        },
        type: "earth",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-knocked-down" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 56 },
            },
            type: "earth",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.meteor",
    name: "Meteor",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
    // Exhaustion (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 2,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all adjacent foes": it lands as the cast ends, with no
    // impact delay.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...are struck for 7...91...112 fire damage and knocked down."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Elementalist condition staples (#997)                                  */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.water-trident",
    name: "Water Trident",
    type: "spell",
    elite: true,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-enemy",
    // The 2012 revision's "target foe and up to 2 adjacent foes": the
    // target first, then the nearest two (`targeting.ts`).
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: 3,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Our own tuning, as GW1 publishes no speeds: "fast-moving", Lightning
    // Orb's speed.
    projectile: { speed: 1.5 * RANGE_SPELL },
    // "...for 10...74...90 cold damage if it hits. If it hits a moving foe,
    // that foe is knocked down." Moving is read per foe, before it lands.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 74 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-moving" },
        effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
      },
    ],
  },
  {
    id: "elementalist.searing-flames",
    name: "Searing Flames",
    type: "spell",
    elite: true,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes": Fireball's area, with no flight.
    area: {
      radius: AREA_NEARBY,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Foes already on fire ... are struck for 10...82...100 fire damage.
    // Foes not already on fire begin Burning for 1...6...7 seconds": 6 s,
    // its rank-12 value. Both are read before either lands, so exactly
    // one holds on each foe.
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "burning" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.fire-magic", atZero: 10, atTwelve: 82 },
            },
            type: "fire",
            armorPenetration: 0,
          },
        ],
      },
      {
        kind: "if",
        condition: { kind: "target-lacks-status", statusId: "burning" },
        effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 6 }],
      },
    ],
  },
  {
    id: "elementalist.ebon-hawk",
    name: "Ebon Hawk",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Our own tuning: Fireball's speed.
    projectile: { speed: RANGE_SPELL },
    // "...strikes target foe for 10...70...85 earth damage and causes
    // Weakness for 5...13...15 seconds if it hits": 13 s, its rank-12 value.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 70 },
        },
        type: "earth",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "weakness", durationSeconds: 13 },
    ],
  },
  {
    id: "elementalist.stoning",
    name: "Stoning",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // Our own tuning: "a large stone", Fireball's speed.
    projectile: { speed: RANGE_SPELL },
    // "...for 45...93...105 earth damage if it hits. If Stoning hits a foe
    // suffering from Weakness, that foe is knocked down." Weakness is read
    // as the stone lands.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 45, atTwelve: 93 },
        },
        type: "earth",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "weakness" },
        effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Monk staples (#987)                                                    */
  /* ---------------------------------------------------------------------- */

  {
    id: "monk.heal-other",
    name: "Heal Other",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Heal target other ally for 35...151...180 health."
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 35, atTwelve: 151 },
        },
      },
    ],
  },
  {
    id: "monk.reversal-of-fortune",
    name: "Reversal of Fortune",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 8 seconds, the next time target ally would take damage or life
    // steal, that ally gains that amount of health instead, maximum
    // 15...67...80": the 67 cap is the status's.
    effects: [{ kind: "apply-status", statusId: "reversal-of-fortune", durationSeconds: 8 }],
  },
  {
    id: "monk.smite-hex",
    name: "Smite Hex",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.smiting-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove a hex from target ally. If a hex is removed, foes in the area
    // suffer 10...70...85 holy damage": the area is the ally's.
    effects: [
      { kind: "remove-status", category: "hex", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "hex" },
        effects: [
          {
            kind: "splash",
            radius: AREA_IN_THE_AREA,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "monk.smiting-prayers", atZero: 10, atTwelve: 70 },
                },
                type: "holy",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "monk.restore-condition",
    name: "Restore Condition",
    type: "spell",
    elite: true,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove all conditions from target other ally. That ally is healed
    // 10...58...70 health for each condition removed."
    effects: [
      { kind: "remove-status", category: "condition", count: "all" },
      {
        kind: "heal",
        perStatusOnTarget: [],
        perRemoved: "condition",
        amount: {
          scaling: { attributeId: "monk.protection-prayers", atZero: 10, atTwelve: 58 },
        },
      },
    ],
  },
  /* ---------------------------------------------------------------------- */
  /* Monk staples 3 (#1039)                                                 */
  /* ---------------------------------------------------------------------- */

  {
    id: "monk.cure-hex",
    name: "Cure Hex",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove one Hex from target ally. If a Hex was removed, that ally is
    // healed for 30...86...100 Health": the current page's 86, not the 102
    // guildwars.fandom still quotes from before the cut.
    effects: [
      { kind: "remove-status", category: "hex", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "hex" },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 86 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "monk.smite-condition",
    name: "Smite Condition",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.smiting-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 7,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove one Condition from target ally. If a Condition was removed,
    // foes in the area take 10...50...60 damage": holy, and the area is the
    // ally's, as Smite Hex's.
    effects: [
      { kind: "remove-status", category: "condition", count: 1 },
      {
        kind: "if",
        condition: { kind: "removed", category: "condition" },
        effects: [
          {
            kind: "splash",
            radius: AREA_IN_THE_AREA,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "monk.smiting-prayers", atZero: 10, atTwelve: 50 },
                },
                type: "holy",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "monk.mending-touch",
    name: "Mending Touch",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 6,
    // "Touched ally": at hand, as Blood Ritual's.
    range: RANGE_MELEE,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Touched ally loses two conditions and is healed for 15...51...60
    // Health for each condition removed in this way."
    effects: [
      { kind: "remove-status", category: "condition", count: 2 },
      {
        kind: "heal",
        perStatusOnTarget: [],
        perRemoved: "condition",
        amount: {
          scaling: { attributeId: "monk.protection-prayers", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "monk.vigorous-spirit",
    name: "Vigorous Spirit",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 30 seconds, each time target ally attacks or casts a spell, that
    // ally is healed for 5...17...20 health": the 17 is the status's.
    effects: [{ kind: "apply-status", statusId: "vigorous-spirit", durationSeconds: 30 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Assassin staples (#988)                                                */
  /* ---------------------------------------------------------------------- */
  {
    id: "assassin.deaths-charge",
    name: "Death's Charge",
    type: "spell",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.shadow-arts",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Shadow Step to target foe. If that foe has more Health than you, you
    // are healed for 65...173...200": who has more is read before the step.
    effects: [
      { kind: "shadow-step" },
      {
        kind: "if",
        condition: { kind: "target-more-health" },
        effects: [
          {
            kind: "heal",
            recipient: "caster",
            amount: { scaling: { attributeId: "assassin.shadow-arts", atZero: 65, atTwelve: 173 } },
            perStatusOnTarget: [],
          },
        ],
      },
    ],
  },
  {
    id: "assassin.shadow-refuge",
    name: "Shadow Refuge",
    type: "enchantment",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.shadow-arts",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 6 seconds, you gain 5...9...10 Health regeneration. When Shadow
    // Refuge ends, you gain 40...88...100 Health if you are attacking."
    effects: [{ kind: "apply-status", statusId: "shadow-refuge", durationSeconds: 6 }],
  },
  {
    id: "assassin.shroud-of-distress",
    name: "Shroud of Distress",
    type: "enchantment",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.shadow-arts",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 45,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 30...54...60 seconds, if you are below 50% Health, you have a 75%
    // chance to block attacks": 54 s, its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "shroud-of-distress", durationSeconds: 54 }],
  },
  {
    id: "assassin.critical-eye",
    name: "Critical Eye",
    type: "skill",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.critical-strikes",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 10...30...35 seconds, you have an additional 3...13...15% chance
    // to land a critical hit when attacking. You gain 1 Energy whenever you
    // score a critical hit": 30 s and 13%, the rank-12 values.
    effects: [{ kind: "apply-status", statusId: "critical-eye", durationSeconds: 30 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Assassin staples 2 (#1041)                                             */
  /* ---------------------------------------------------------------------- */

  {
    id: "assassin.leaping-mantis-sting",
    name: "Leaping Mantis Sting",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 8,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "If Mantis Sting hits, target foe takes +5...13...15 damage. If this
    // attack strikes a moving foe that foe is Crippled for 3...13...15
    // seconds": 13 s, its rank-12 value. The +13 is the 2012 update;
    // fandom's template still has the older +14...19.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 5, atTwelve: 13 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "lead", follows: undefined },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-moving" },
        effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 13 }],
      },
    ],
  },
  {
    id: "assassin.jungle-strike",
    name: "Jungle Strike",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.5,
    rechargeSeconds: 6,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow a lead attack. If it hits, this attack strikes for
    // +10...22...25 damage. If it hits a foe that was Crippled, that foe
    // and all adjacent foes take 1...25...31 damage." The 2026 update's 6 s
    // recharge; fandom still says 10. The same update dropped the "+" from
    // the 25, so it is its own damage on the foe, through armor as Death
    // Blossom's splash, not a bonus on the blow.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 10, atTwelve: 22 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "off-hand", follows: "lead" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "crippled" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "assassin.dagger-mastery", atZero: 1, atTwelve: 25 },
            },
            type: "piercing",
            armorPenetration: 0,
          },
          {
            kind: "splash",
            radius: AREA_ADJACENT,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "assassin.dagger-mastery", atZero: 1, atTwelve: 25 },
                },
                type: "piercing",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "assassin.trampling-ox",
    name: "Trampling Ox",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 8,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must follow an off-hand attack. If it hits, you deal +5...17...20
    // damage. If you hit a Crippled foe, that foe is knocked down." Both
    // blows may knock down; the second finds the foe down already.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 5, atTwelve: 17 },
      },
      conditionalBonus: undefined,
      strikes: 2,
      unblockable: false,
      chain: { role: "dual", follows: "off-hand" },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "crippled" },
        effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
      },
    ],
  },
  {
    id: "assassin.falling-spider",
    name: "Falling Spider",
    type: "attack",
    elite: false,
    profession: "assassin",
    attributeId: "assassin.dagger-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 8,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // "Must strike a knocked-down foe. If it hits, Falling Spider strikes
    // for +15...31...35 damage and target foe is Poisoned for 5...17...20":
    // 17 s. It needs no lead. On a standing foe it misses as GW1's
    // off-hand attacks do when their condition is unmet: energy spent,
    // recharged at once.
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "assassin.dagger-mastery", atZero: 15, atTwelve: 31 },
      },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: { role: "off-hand", follows: undefined, requires: { kind: "target-knocked-down" } },
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "apply-status", statusId: "poison", durationSeconds: 17 }],
  },

  /* ---------------------------------------------------------------------- */
  /* Pets (#1046)                                                           */
  /* ---------------------------------------------------------------------- */
  {
    id: "ranger.charm-animal",
    name: "Charm Animal",
    type: "skill",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 10,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    // "Once charmed, your animal companion will travel with you whenever
    // you have Charm Animal equipped." No match has an animal to charm:
    // on the bar, it brings the wolf, and it is never cast.
    companion: WOLF,
    petAttack: undefined,
    effects: [],
  },
  {
    id: "ranger.comfort-animal",
    name: "Comfort Animal",
    type: "skill",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 1,
    range: RANGE_SPELL,
    target: "companion",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // The PvP version: "You heal your animal companion for 20...87...104
    // Health. If your companion is dead, it is resurrected with
    // 10...48...58% Health." The heal skips the dead and the
    // resurrection the living, so one cast is never both.
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ranger.beast-mastery", atZero: 20, atTwelve: 87 },
        },
      },
      {
        kind: "resurrect",
        health: {
          kind: "percent",
          percent: {
            scaling: { attributeId: "ranger.beast-mastery", atZero: 10, atTwelve: 48 },
          },
        },
        energyPercent: { flat: 0 },
        perPartyMemberWithin: undefined,
        at: "corpse",
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Pet attacks (#1046)                                                    */
  /* ---------------------------------------------------------------------- */
  {
    id: "ranger.brutal-strike",
    name: "Brutal Strike",
    type: "pet-attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 5,
    range: AREA_EARSHOT,
    target: "companion",
    area: undefined,
    attack: undefined,
    // "Your animal companion attempts a brutal strike that deals
    // +5...29...35 damage. If that attack strikes a foe whose health is
    // below 50%, that foe takes an additional +5...29...35 damage."
    petAttack: {
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.beast-mastery", atZero: 5, atTwelve: 29 } },
      conditionalBonus: {
        condition: { kind: "target-health-below", fraction: 0.5 },
        amount: { scaling: { attributeId: "ranger.beast-mastery", atZero: 5, atTwelve: 29 } },
      },
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    effects: [],
  },
  {
    id: "ranger.maiming-strike",
    name: "Maiming Strike",
    type: "pet-attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 5,
    range: AREA_EARSHOT,
    target: "companion",
    area: undefined,
    attack: undefined,
    // "Your animal companion attempts a maiming strike that deals
    // +5...17...20 damage."
    petAttack: {
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.beast-mastery", atZero: 5, atTwelve: 17 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "If that attack hits, that foe becomes Crippled for 3...13...15
    // seconds": 13 s, its rank-12 value, as Pin Down's.
    effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 13 }],
  },
  {
    id: "ranger.disrupting-lunge",
    name: "Disrupting Lunge",
    type: "pet-attack",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: AREA_EARSHOT,
    target: "companion",
    area: undefined,
    attack: undefined,
    // "Your animal companion attempts a disrupting lunge that deals
    // +1...10...12 damage."
    petAttack: {
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.beast-mastery", atZero: 1, atTwelve: 10 } },
      conditionalBonus: undefined,
      strikes: 1,
      unblockable: false,
      chain: undefined,
      damageType: undefined,
      armorPenetration: 0,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "If that attack strikes a foe using a skill, that skill is
    // interrupted and is disabled for an additional 20 seconds", as
    // Distracting Shot's.
    effects: [
      { kind: "interrupt" },
      { kind: "disable-skill", which: "interrupted", seconds: { flat: 20 } },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Pet calls and bonds (#1108)                                            */
  /* ---------------------------------------------------------------------- */
  {
    id: "ranger.call-of-haste",
    name: "Call of Haste",
    type: "shout",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 25,
    range: PET_REACH,
    target: "living-companion",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // The PvP version: "For 30 seconds, your animal companion has a 25%
    // faster attack speed and moves 25% faster."
    effects: [{ kind: "apply-status", statusId: "call-of-haste", durationSeconds: 30 }],
  },
  {
    id: "ranger.call-of-protection",
    name: "Call of Protection",
    type: "shout",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 90,
    range: PET_REACH,
    target: "living-companion",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "For 120 seconds, your animal companion has a 5...17...20 base
    // damage reduction."
    effects: [{ kind: "apply-status", statusId: "call-of-protection", durationSeconds: 120 }],
  },
  {
    id: "ranger.symbiotic-bond",
    name: "Symbiotic Bond",
    type: "shout",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 55,
    range: PET_REACH,
    target: "living-companion",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "For 120...264...300 seconds, your animal companion gains
    // +1...3...3 health regeneration, and half of any physical damage
    // dealt to your animal companion is redirected to you."
    effects: [{ kind: "apply-status", statusId: "symbiotic-bond", durationSeconds: 264 }],
  },
  {
    id: "ranger.revive-animal",
    name: "Revive Animal",
    type: "skill",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.beast-mastery",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "Resurrect all nearby allied animal companions. They come back to
    // life with 10...77...94% Health."
    effects: [
      {
        kind: "resurrect-companions",
        radius: AREA_NEARBY,
        healthPercent: {
          scaling: { attributeId: "ranger.beast-mastery", atZero: 10, atTwelve: 77 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Spirits (#1064)                                                        */
  /* ---------------------------------------------------------------------- */
  {
    id: "ranger.winnowing",
    name: "Winnowing",
    type: "nature-ritual",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 60,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // "Create a level 1...8...10 Spirit. Non-spirit creatures within range
    // take 4 additional damage whenever they take physical damage. This
    // Spirit dies after 30...198...240 seconds." A level-8 spirit: 50 + 20
    // per level, armor 51.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: {
          kind: "spirit",
          look: "spirit",
          name: "Winnowing",
          maxHealth: {
            scaling: { attributeId: "ranger.wilderness-survival", atZero: 70, atTwelve: 210 },
          },
          armor: { flat: 51 },
          attack: undefined,
          durationSeconds: {
            scaling: { attributeId: "ranger.wilderness-survival", atZero: 30, atTwelve: 198 },
          },
          behaviour: { kind: "idle" },
          aura: { statusId: "winnowing", affects: "all", radius: RANGE_NATURE_RITUAL },
          onDeath: "vanish",
          ownerDisableOnDeath: undefined,
        },
      },
    ],
  },
  {
    id: "ritualist.recuperation",
    name: "Recuperation",
    type: "binding-ritual",
    elite: false,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 45,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // PvP: "Create a level 1...8...10 Spirit. Non-Spirit allies within its
    // range gain +1...3...3 Health regeneration. This Spirit dies after
    // 15...39...45 seconds." A level-8 spirit: 50 + 20 per level, armor 51.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: {
          kind: "spirit",
          look: "spirit",
          name: "Recuperation",
          maxHealth: {
            scaling: { attributeId: "ritualist.restoration-magic", atZero: 70, atTwelve: 210 },
          },
          armor: { flat: 51 },
          attack: undefined,
          durationSeconds: {
            scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 39 },
          },
          behaviour: { kind: "idle" },
          aura: { statusId: "recuperation", affects: "allies", radius: RANGE_SPIRIT },
          onDeath: "vanish",
          ownerDisableOnDeath: undefined,
        },
      },
    ],
  },
  {
    id: "elementalist.ward-against-melee",
    name: "Ward Against Melee",
    type: "ward",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // PvP: "You create a Ward Against Melee at your current location. For
    // 5...17...20 seconds, non-spirit allies in this area have a 50%
    // chance to block melee attacks" (#1087).
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 5, atTwelve: 17 },
        },
        act: {
          kind: "aura",
          aura: { statusId: "ward-against-melee", affects: "allies", radius: AREA_IN_THE_AREA },
        },
      },
    ],
  },
  {
    id: "ranger.barbed-trap",
    name: "Barbed Trap",
    type: "trap",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // PvP: "When Barbed Trap is triggered, all nearby foes are struck for
    // 7...20...23 piercing damage, become Crippled, and begin Bleeding for
    // 3...21...25 seconds. Barbed Trap ends after 90 seconds" (#1105): the
    // conditions last 21 s, their rank-12 value.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: { flat: 90 },
        act: {
          kind: "trap",
          trap: {
            triggerRadius: AREA_ADJACENT,
            springsAtEnd: false,
            spring: {
              count: 1,
              everySeconds: 1,
              area: {
                radius: AREA_NEARBY,
                origin: "caster",
                affects: "enemies",
                maxTargets: undefined,
                includesCaster: false,
              },
              effects: [
                {
                  kind: "damage",
                  amount: {
                    scaling: { attributeId: "ranger.wilderness-survival", atZero: 7, atTwelve: 20 },
                  },
                  type: "piercing",
                  armorPenetration: 0,
                },
                { kind: "apply-status", statusId: "crippled", durationSeconds: 21 },
                { kind: "apply-status", statusId: "bleeding", durationSeconds: 21 },
              ],
            },
          },
        },
      },
    ],
  },
  {
    id: "ranger.flame-trap",
    name: "Flame Trap",
    type: "trap",
    elite: false,
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "When Flame Trap is triggered, every second (for 3 seconds total),
    // all nearby foes are struck for 5...17...20 fire damage and set on
    // fire for 1...3...3 seconds. Flame Trap automatically triggers after
    // 90 seconds" (#1113): Burning lasts 3 s, its rank-12 value.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: { flat: 90 },
        act: {
          kind: "trap",
          trap: {
            triggerRadius: AREA_ADJACENT,
            springsAtEnd: true,
            spring: {
              count: 3,
              everySeconds: 1,
              area: {
                radius: AREA_NEARBY,
                origin: "caster",
                affects: "enemies",
                maxTargets: undefined,
                includesCaster: false,
              },
              effects: [
                {
                  kind: "damage",
                  amount: {
                    scaling: { attributeId: "ranger.wilderness-survival", atZero: 5, atTwelve: 17 },
                  },
                  type: "fire",
                  armorPenetration: 0,
                },
                { kind: "apply-status", statusId: "burning", durationSeconds: 3 },
              ],
            },
          },
        },
      },
    ],
  },
  {
    id: "monk.symbol-of-wrath",
    name: "Symbol of Wrath",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.smiting-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "Create a Symbol of Wrath at target foe's location. For 5 seconds,
    // adjacent foes are struck for 10...34...40 holy damage each second"
    // (#1113): it stays where they stood.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "target",
        durationSeconds: { flat: 5 },
        act: {
          kind: "pulse",
          pulse: {
            count: 5,
            everySeconds: 1,
            area: {
              radius: AREA_ADJACENT,
              origin: "caster",
              affects: "enemies",
              maxTargets: undefined,
              includesCaster: false,
            },
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "monk.smiting-prayers", atZero: 10, atTwelve: 34 },
                },
                type: "holy",
                armorPenetration: 0,
              },
            ],
          },
        },
      },
    ],
  },
  /* ---------------------------------------------------------------------- */
  /* Monk staples 2 (#1013)                                                 */
  /* ---------------------------------------------------------------------- */
  {
    id: "monk.remove-hex",
    name: "Remove Hex",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove a hex from target ally": the newest.
    effects: [{ kind: "remove-status", category: "hex", count: 1 }],
  },
  {
    id: "monk.dismiss-condition",
    name: "Dismiss Condition",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 3,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Remove one condition from target ally. If that ally is under the
    // effects of an Enchantment, that ally is healed for 15...63...75
    // Health": the enchantment is read before anything lands, and the heal
    // does not ask for a condition removed.
    effects: [
      { kind: "remove-status", category: "condition", count: 1 },
      {
        kind: "if",
        condition: { kind: "target-has", category: "enchantment" },
        effects: [
          {
            kind: "heal",
            perStatusOnTarget: [],
            amount: {
              scaling: { attributeId: "monk.protection-prayers", atZero: 15, atTwelve: 63 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "monk.healing-breeze",
    name: "Healing Breeze",
    type: "enchantment",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    // gw-memorial's current 5 s; guildwars.fandom's 2 s is stale.
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 15 seconds, target ally gains health regeneration of 4...8...9":
    // the status's +8.
    effects: [{ kind: "apply-status", statusId: "healing-breeze", durationSeconds: 15 }],
  },
  {
    id: "monk.heal-party",
    name: "Heal Party",
    type: "spell",
    elite: false,
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    // The PvP page (167): 1 s, 20 s. The PvE split (1330) is not imported.
    activationSeconds: 1,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "self",
    // "Heal entire party": the caster and every living team-mate, however
    // far, through walls. The party is the team.
    area: { origin: "party" },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "...for 30...66...75 health."
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 66 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* The corpus's last two PvP skills (#1205)                               */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.meteor-shower",
    name: "Meteor Shower",
    type: "spell",
    elite: false,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 25 },
    // Exhaustion (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 5,
    rechargeSeconds: 60,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "Create a Meteor Shower at target foe's location. For 9 seconds, foes
    // adjacent to that location are struck for 7...91...112 fire damage
    // and knocked down every 3 seconds": it stays where they stood as the
    // cast ended, as Symbol of Wrath's, so stepping out dodges the next.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "target",
        durationSeconds: { flat: 9 },
        act: {
          kind: "pulse",
          pulse: {
            count: 3,
            everySeconds: 3,
            area: {
              radius: AREA_ADJACENT,
              origin: "caster",
              affects: "enemies",
              maxTargets: undefined,
              includesCaster: false,
            },
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
                },
                type: "fire",
                armorPenetration: 0,
              },
              { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
            ],
          },
        },
      },
    ],
  },
  {
    id: "monk.contemplation-of-purity",
    name: "Contemplation of Purity",
    type: "skill",
    elite: false,
    profession: "monk",
    attributeId: "monk.divine-favor",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    petAttack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    // "Lose all enchantments. For each one lost, you gain 0...64...80
    // health, lose one hex, and lose one condition (maximum 1...7...8
    // hexes and conditions)." With none to lose it only costs: one heal
    // of the whole, then the hexes and conditions, one each per
    // enchantment lost.
    effects: [
      { kind: "remove-status", category: "enchantment", count: "all", from: "caster" },
      {
        kind: "heal",
        perStatusOnTarget: [],
        perRemoved: "enchantment",
        amount: { scaling: { attributeId: "monk.divine-favor", atZero: 0, atTwelve: 64 } },
      },
      {
        kind: "remove-status",
        category: "hex",
        count: 0,
        from: "caster",
        perRemoved: {
          category: "enchantment",
          max: { scaling: { attributeId: "monk.divine-favor", atZero: 1, atTwelve: 7 } },
        },
      },
      {
        kind: "remove-status",
        category: "condition",
        count: 0,
        from: "caster",
        perRemoved: {
          category: "enchantment",
          max: { scaling: { attributeId: "monk.divine-favor", atZero: 1, atTwelve: 7 } },
        },
      },
    ],
  },
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
