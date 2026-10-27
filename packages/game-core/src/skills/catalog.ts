import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
} from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { Skill } from "./types.js";

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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
      unblockable: false,
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
    // A lead attack: in GW1 it opens a dagger chain for an off-hand
    // attack. Nothing reads that until attack chains exist (#341).
    attack: {
      weapon: "daggers",
      weaponDamage: 1,
      bonusDamage: undefined,
      conditionalBonus: undefined,
      unblockable: false,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    // "...your target suffers from Bleeding for 5...17...20 seconds": 17 s,
    // its rank-12 value.
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 17 }],
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
      unblockable: false,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    // "...and your target is interrupted": when the arrow lands, so a miss
    // interrupts nothing.
    effects: [{ kind: "interrupt" }],
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
      unblockable: true,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    // "...and any Stance being used by your target ends."
    effects: [{ kind: "remove-status", category: "stance", count: 1 }],
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
        amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 81 } },
      },
      {
        kind: "if",
        condition: { kind: "target-health-below", fraction: 0.5 },
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 98 },
            },
          },
        ],
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
      unblockable: false,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    effects: [],
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
      unblockable: false,
      onBlocked: [],
    },
    whileActivating: undefined,
    projectile: undefined,
    effects: [{ kind: "interrupt" }],
  },

  /* ---------------------------------------------------------------------- */
  /* Resurrection (#812)                                                    */
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
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
