import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
} from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import { KNOCKDOWN_SECONDS, type Skill } from "./types.js";

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
    projectile: undefined,
    effects: [{ kind: "knockdown", durationSeconds: 4 }],
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
    projectile: undefined,
    // "If Hunter's Shot hits, your target begins Bleeding for 3...21...25
    // seconds": 21 s, its rank-12 value, when the arrow lands.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 21 }],
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
    projectile: undefined,
    // A 50% block for 9 seconds, ending on a member's attack-skill hit:
    // its rank-12 numbers, in the status (#956).
    effects: [{ kind: "apply-status", statusId: "defensive-anthem", durationSeconds: 9 }],
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
    projectile: undefined,
    // "That ally loses one condition for each spirit within earshot": there
    // are no spirits yet (#467), so it removes none, as in GW1 with none up.
    effects: [
      {
        kind: "heal",
        perStatusOnTarget: [],
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 20, atTwelve: 96 },
        },
      },
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
    projectile: undefined,
    // "If any Spirits are within earshot, you don't sacrifice Health": there
    // are no spirits yet (#467), so the 17% is always paid, as in GW1 with
    // none up.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 17 },
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
    projectile: undefined,
    // "For 5...13...15 seconds, you attack 25% faster": 13 s, its rank-12
    // value.
    effects: [{ kind: "apply-status", statusId: "weapon-of-aggression", durationSeconds: 13 }],
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
    projectile: undefined,
    // "For 6 seconds, the next time target foe uses a skill, that skill
    // takes an additional 10...47...56 seconds to recharge." The extra
    // recharge is the hex's, at rank 12 (#949).
    effects: [{ kind: "apply-status", statusId: "diversion", durationSeconds: 6 }],
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
    projectile: undefined,
    effects: [{ kind: "interrupt" }],
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
    projectile: undefined,
    // "Target party member is returned to life with 20...56...65% health
    // and 42...80...90% energy."
    effects: [
      {
        kind: "resurrect",
        healthPercent: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 56 },
        },
        energyPercent: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 42, atTwelve: 80 },
        },
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
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
