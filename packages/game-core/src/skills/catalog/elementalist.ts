import {
  AREA_ADJACENT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
} from "../../distances.js";
import { KNOCKDOWN_SECONDS, type Skill } from "../types.js";

export const ELEMENTALIST_SKILLS: readonly Skill[] = [
  {
    id: "elementalist.fireball",
    name: "Fireball",
    gwId: 186,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 223,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    id: "elementalist.armor-of-earth",
    name: "Armor of Earth",
    gwId: 165,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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

  /* ---------------------------------------------------------------------- */
  /* Glyphs (#526): change your next spells, one at a time                  */
  /* ---------------------------------------------------------------------- */

  {
    id: "elementalist.glyph-of-lesser-energy",
    name: "Glyph of Lesser Energy",
    gwId: 200,
    type: "glyph",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  {
    id: "elementalist.glyph-of-concentration",
    name: "Glyph of Concentration",
    gwId: 201,
    type: "glyph",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
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
    // "For 15 seconds, your next 1 spells cannot be interrupted" (#1730):
    // the status's `nextSkillRule`.
    effects: [{ kind: "apply-status", statusId: "glyph-of-concentration", durationSeconds: 15 }],
  },
  {
    id: "elementalist.glyph-of-sacrifice",
    name: "Glyph of Sacrifice",
    gwId: 202,
    type: "glyph",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
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
    // "For 15 seconds, your next spell casts instantly, but it takes an
    // additional 30 seconds to recharge" (#1730).
    effects: [{ kind: "apply-status", statusId: "glyph-of-sacrifice", durationSeconds: 15 }],
  },
  {
    id: "elementalist.glyph-of-renewal",
    name: "Glyph of Renewal",
    gwId: 203,
    type: "glyph",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
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
    // "For 15 seconds, your next spell instantly recharges" (#1730).
    effects: [{ kind: "apply-status", statusId: "glyph-of-renewal", durationSeconds: 15 }],
  },
  {
    id: "elementalist.glyph-of-essence",
    name: "Glyph of Essence",
    gwId: 1096,
    type: "glyph",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: undefined,
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
    // "For 15 seconds, your next spell casts instantly but causes you to
    // lose all Energy" (#1730).
    effects: [{ kind: "apply-status", statusId: "glyph-of-essence", durationSeconds: 15 }],
  },
  {
    id: "elementalist.lava-arrows",
    name: "Lava Arrows",
    gwId: 824,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Lava Arrows fly toward up to 3 foes near your target": the target
    // and two more, found as it leaves, one arrow each (#1914).
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
    // Our own tuning, as GW1 publishes no speeds: Lightning Orb's.
    projectile: { speed: 1.5 * RANGE_SPELL, spread: true },
    // "...and strike for 20...65 fire damage if they hit": 56 each.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.fire-magic", atZero: 20, atTwelve: 56 } },
        type: "fire",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.lightning-orb",
    name: "Lightning Orb",
    gwId: 229,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  /* Elementalist and Necromancer staples (#918)                            */
  /* ---------------------------------------------------------------------- */

  {
    id: "elementalist.lightning-strike",
    name: "Lightning Strike",
    gwId: 222,
    // The corpus's is a hex spell whose hex lands only while you are
    // overcast; that half is not modelled, so it is the plain strike.
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 226,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 213,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    id: "elementalist.ice-spikes",
    name: "Ice Spikes",
    gwId: 211,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 234,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  /* Elementalist knockdown staples (#985)                                  */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.blinding-flash",
    name: "Blinding Flash",
    gwId: 220,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 231,
    // A touch skill, not a spell: Dazed does not slow it, Fast Casting does
    // not speed it, Backfire does not answer it.
    type: "skill",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    // Exhaustion, as Mind Shock's (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 0.75,
    rechargeSeconds: 10,
    // "Target touched foe": the foe must be at hand.
    touch: true,
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
    gwId: 174,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 187,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 237,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 884,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 1374,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 171,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  {
    id: "elementalist.ward-against-melee",
    name: "Ward Against Melee",
    gwId: 176,
    type: "ward",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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

  /* ---------------------------------------------------------------------- */
  /* The corpus's last two PvP skills (#1205)                               */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.meteor-shower",
    name: "Meteor Shower",
    gwId: 192,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
            delaySeconds: 0,
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
  /* ---------------------------------------------------------------------- */
  /* Elementalist Fire Magic staples (#1366)                                */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.immolate",
    name: "Immolate",
    gwId: 191,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
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
    projectile: undefined,
    // "Target foe is struck for 20...64...75 fire damage and is set on
    // fire for 1...3 seconds."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 20, atTwelve: 64 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "burning", durationSeconds: 3 },
    ],
  },
  {
    id: "elementalist.flare",
    name: "Flare",
    gwId: 194,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // "Send out a flare": it flies as Fireball does, so a foe who steps
    // out of where it is led to takes nothing, and neither do its neighbours.
    projectile: { speed: RANGE_SPELL },
    // "Strikes target foe for 20...56...65 fire damage if it hits. If you
    // are Overcast, Flare hits adjacent foes as well."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 20, atTwelve: 56 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-overcast" },
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 20, atTwelve: 56 },
                },
                type: "fire",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.inferno",
    name: "Inferno",
    gwId: 183,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    // "All adjacent foes are struck for 30...114...135 fire damage": around
    // the caster, who needs no target to cast it.
    area: {
      radius: AREA_ADJACENT,
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
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 30, atTwelve: 114 },
        },
        type: "fire",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.flame-burst",
    name: "Flame Burst",
    gwId: 188,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    // "All nearby foes are struck for 15...99...120 fire damage": around
    // the caster, Inferno's wider, weaker twin.
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
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 15, atTwelve: 99 },
        },
        type: "fire",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.rodgorts-invocation",
    name: "Rodgort's Invocation",
    gwId: 189,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes are struck for 15...99...120 fire
    // damage and set on fire for 1...3 seconds."
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
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 15, atTwelve: 99 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "burning", durationSeconds: 3 },
    ],
  },
  {
    id: "elementalist.fire-storm",
    name: "Fire Storm",
    gwId: 197,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
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
    // "Create a Fire Storm at target foe's location. For 10 seconds, foes
    // adjacent to that location are struck for 5...29...35 fire damage
    // each second": it stays where they stood as the cast ended, as
    // Meteor Shower's, so a foe who walks out stops burning.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "target",
        durationSeconds: { flat: 10 },
        act: {
          kind: "pulse",
          pulse: {
            count: 10,
            everySeconds: 1,
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 5, atTwelve: 29 },
                },
                type: "fire",
                armorPenetration: 0,
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.mind-burn",
    name: "Mind Burn",
    gwId: 185,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
    // Exhaustion (#461), at the corpus's 5.
    overcast: 5,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all adjacent foes take 15...51...60 fire damage. If
    // you have more Energy than target foe, that foe and all adjacent foes
    // take an additional 15...51...60 fire damage and are set on fire for
    // 1...8...10 seconds": the energy is read against each foe it lands on,
    // as Mind Shock's.
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
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 15, atTwelve: 51 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-more-energy" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.fire-magic", atZero: 15, atTwelve: 51 },
            },
            type: "fire",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "burning", durationSeconds: 8 },
        ],
      },
    ],
  },
  /* ---------------------------------------------------------------------- */
  /* Elementalist Water Magic staples (#1367)                               */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.ice-prison",
    name: "Ice Prison",
    gwId: 210,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "For 8...18...20 seconds, target foe's legs are encased in ice,
    // causing the foe to move 66% slower."
    effects: [{ kind: "apply-status", statusId: "ice-prison", durationSeconds: 18 }],
  },
  {
    id: "elementalist.frozen-burst",
    name: "Frozen Burst",
    gwId: 212,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "self",
    // "All nearby foes are struck for 10...70...85 cold damage and move 66%
    // slower for 3...7...8 seconds": around the caster, as Flame Burst's.
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
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 70 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "frozen-burst", durationSeconds: 7 },
    ],
  },
  {
    id: "elementalist.ice-spear",
    name: "Ice Spear",
    gwId: 214,
    // An "Enchantment Spell" in GW1 by label only: nothing is placed on
    // anyone, so a spell.
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    // "Send out an Ice Spear": it flies as Fireball does, so a foe who
    // steps out of where it is led to takes nothing, and its caster gains
    // nothing.
    projectile: { speed: RANGE_SPELL },
    // "...striking target foe for 10...50...60 cold damage if it hits. If
    // you are Overcast, you gain +1...3...4 Health regeneration for 5
    // seconds."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 50 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-overcast" },
        effects: [{ kind: "caster-gains-status", statusId: "ice-spear", durationSeconds: 5 }],
      },
    ],
  },
  {
    id: "elementalist.maelstrom",
    name: "Maelstrom",
    gwId: 215,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 15 },
    // Exhaustion (#461), at the corpus's 10.
    overcast: 10,
    activationSeconds: 1.5,
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
    // "Create a Maelstrom at target foe's location. For 10 seconds, foes
    // adjacent to that area are struck for 10...22...25 cold damage each
    // second. Maelstrom interrupts spell-casting when it hits": it stays
    // where they stood as the cast ended, as Meteor Shower's, and each
    // pulse interrupts a spell, never an attack nor a chant.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "target",
        durationSeconds: { flat: 10 },
        act: {
          kind: "pulse",
          pulse: {
            count: 10,
            everySeconds: 1,
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 22 },
                },
                type: "cold",
                armorPenetration: 0,
              },
              { kind: "interrupt", only: "spell" },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.blurred-vision",
    name: "Blurred Vision",
    gwId: 235,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "For 4...9...10 seconds, target foe and adjacent foes are hexed with
    // Blurred Vision. While hexed, those foes have a 50% chance to miss
    // with attacks."
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
    effects: [{ kind: "apply-status", statusId: "blurred-vision", durationSeconds: 9 }],
  },
  {
    id: "elementalist.armor-of-mist",
    name: "Armor of Mist",
    gwId: 238,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "For 8...18...20 seconds, you gain +10...34...40 armor and move 33%
    // faster."
    effects: [{ kind: "apply-status", statusId: "armor-of-mist", durationSeconds: 18 }],
  },
  {
    id: "elementalist.shatterstone",
    name: "Shatterstone",
    gwId: 809,
    type: "hex",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
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
    // "Target foe is struck for 25...85...100 cold damage, moves 66% slower,
    // and is hexed with Shatterstone for 3 seconds." Its end's burst is the
    // hex's own trigger.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 25, atTwelve: 85 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      { kind: "apply-status", statusId: "shatterstone", durationSeconds: 3 },
    ],
  },
  {
    id: "elementalist.mind-freeze",
    name: "Mind Freeze",
    // The base record; its numbers are the PvP split's (2803), 10 energy.
    gwId: 209,
    type: "hex",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 10 },
    // Exhaustion (#461), at the corpus's 5.
    overcast: 5,
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
    // "Target foe takes 10...50...60 cold damage. If you have more Energy
    // than target foe, that foe suffers an additional 10...50...60 cold
    // damage and moves 90% slower for 1...4...5 seconds." Equal is not more.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 50 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-more-energy" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 50 },
            },
            type: "cold",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "mind-freeze", durationSeconds: 4 },
        ],
      },
    ],
  },
  {
    id: "elementalist.mind-blast",
    name: "Mind Blast",
    gwId: 1662,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
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
    // "Target foe is struck for 15...51...60 fire damage. If you have more
    // Energy than target foe, you gain 1...7...8 Energy" (#1473), read
    // before the spell lands. Equal is not more.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 15, atTwelve: 51 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-more-energy" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "elementalist.fire-magic", atZero: 1, atTwelve: 6.6 },
            },
          },
        ],
      },
    ],
  },
  // Necromancer and Elementalist staples (#1540).
  {
    id: "elementalist.mark-of-rodgort",
    name: "Mark of Rodgort",
    gwId: 190,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes are hexed": the target, then every
    // foe near it.
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
    // "For 10...35 seconds, whenever each foe is struck for fire damage,
    // that foe is set on fire for 1...4 seconds": 30 s. The Burning is the
    // hex's.
    effects: [{ kind: "apply-status", statusId: "mark-of-rodgort", durationSeconds: 30 }],
  },
  {
    id: "elementalist.lava-font",
    name: "Lava Font",
    gwId: 195,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1.5,
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
    // "For 5 seconds, foes adjacent to the location where this spell was
    // cast are struck for 5...50 fire damage each second": it stays where
    // the caster stood. The Overcast "nearby instead" is not modelled.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: { flat: 5 },
        act: {
          kind: "pulse",
          pulse: {
            count: 5,
            everySeconds: 1,
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 5, atTwelve: 41 },
                },
                type: "fire",
                armorPenetration: 0,
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.ward-against-elements",
    name: "Ward Against Elements",
    gwId: 175,
    type: "ward",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
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
    // "You create a Ward Against Elements at your current location. For
    // 8...20 seconds, non-spirit allies in this area gain +24 armor
    // against elemental damage."
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 8, atTwelve: 17.6 },
        },
        act: {
          kind: "aura",
          aura: {
            statusId: "ward-against-elements",
            affects: "allies",
            radius: AREA_IN_THE_AREA,
          },
        },
      },
    ],
  },
  {
    id: "elementalist.shock-arrow",
    name: "Shock Arrow",
    gwId: 1082,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "...flies swiftly toward target foe": as fast as Lightning Orb.
    projectile: { speed: 1.5 * RANGE_SPELL },
    // "...striking for 5...50 lightning damage. If Shock Arrow strikes a
    // foe suffering from Cracked Armor, you gain 5 Energy plus 1 Energy
    // for every 2 ranks of Energy Storage. Shock Arrow has 25% armor
    // penetration."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 5, atTwelve: 41 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "cracked-armor" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 5, atTwelve: 11 },
            },
          },
        ],
      },
    ],
  },
  // Elementalist staples 2 (#1575), at rank 12.
  {
    id: "elementalist.obsidian-flesh",
    name: "Obsidian Flesh",
    gwId: 218,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 25 },
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
    // "For 8...20 seconds, you gain +20 armor and cannot be the target of
    // enemy spells, but cannot attack and have -2 energy degeneration."
    effects: [{ kind: "apply-status", statusId: "obsidian-flesh", durationSeconds: 18 }],
  },
  {
    id: "elementalist.gale",
    name: "Gale",
    gwId: 162,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
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
    projectile: undefined,
    // "Knock down target foe for 2 seconds." The failure chance at Air
    // Magic 4 or less never applies at rank 12.
    effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
  },
  {
    id: "elementalist.earthquake",
    name: "Earthquake",
    gwId: 170,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "You invoke an Earthquake at target foe's location. All foes near
    // this location...": where the target stands as the cast ends, as
    // Meteor's.
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
    // "...are knocked down and are struck for 26...100 earth damage."
    effects: [
      { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 26, atTwelve: 85.2 },
        },
        type: "earth",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.unsteady-ground",
    name: "Unsteady Ground",
    gwId: 1083,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "You create Unsteady Ground at target foe's location. For 5 seconds,
    // nearby foes take 10...40 earth damage each second. Attacking foes
    // struck by Unsteady Ground are knocked down": each pulse asks each
    // foe it strikes again.
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
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 34 },
                },
                type: "earth",
                armorPenetration: 0,
              },
              {
                kind: "if",
                condition: { kind: "target-attacking" },
                effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.ward-against-foes",
    name: "Ward Against Foes",
    gwId: 177,
    type: "ward",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
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
    // "You create a Ward Against Foes at your current location. For
    // 8...20 seconds, non-spirit foes in this area move 50% slower."
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 8, atTwelve: 17.6 },
        },
        act: {
          kind: "aura",
          aura: { statusId: "ward-against-foes", affects: "foes", radius: AREA_IN_THE_AREA },
        },
      },
    ],
  },
  {
    id: "elementalist.ward-of-stability",
    name: "Ward of Stability",
    gwId: 938,
    type: "ward",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "Create a Ward of Stability at your current location. For 10...25
    // seconds, non-spirit allies cannot be knocked down."
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "caster",
        durationSeconds: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 22 },
        },
        act: {
          kind: "aura",
          aura: { statusId: "ward-of-stability", affects: "allies", radius: AREA_IN_THE_AREA },
        },
      },
    ],
  },
  {
    id: "elementalist.lightning-touch",
    name: "Lightning Touch",
    gwId: 232,
    type: "skill",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 5,
    // "Target touched foe": at hand.
    touch: true,
    range: RANGE_MELEE,
    target: "single-enemy",
    // "...and all adjacent foes".
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
    // "...are struck for 10...60 lightning damage, are Blinded for 1...4
    // seconds, and have Cracked Armor for 1...10 seconds. This skill has
    // 25% armor penetration."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 50 },
        },
        type: "lightning",
        armorPenetration: 0.25,
      },
      { kind: "apply-status", statusId: "blind", durationSeconds: 3 },
      { kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 },
    ],
  },
  {
    id: "elementalist.liquid-flame",
    name: "Liquid Flame",
    gwId: 845,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
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
    // "Target foe is struck for 7...112 fire damage. If that foe is
    // attacking or casting a spell, nearby foes are also struck for
    // 7...112 fire damage."
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-casting-or-attacking" },
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
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
        ],
      },
    ],
  },
  {
    id: "elementalist.glowing-gaze",
    name: "Glowing Gaze",
    gwId: 1379,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "Target foe takes 5...50 fire damage. If that foe is on Fire, you
    // gain 5 Energy plus 1 Energy for every 2 ranks of Energy Storage", as
    // Shock Arrow's.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 5, atTwelve: 41 },
        },
        type: "fire",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "burning" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 5, atTwelve: 11 },
            },
          },
        ],
      },
    ],
  },
  /* ---------------------------------------------------------------------- */
  /* Energy engine (#1614): energy back for the spells you cast             */
  /* ---------------------------------------------------------------------- */

  attunement("fire", "Fire", 184),
  attunement("water", "Water", 208),
  attunement("air", "Air", 225),
  attunement("earth", "Earth", 169),
  {
    id: "elementalist.aura-of-restoration",
    name: "Aura of Restoration",
    gwId: 180,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
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
    // PvP: "For 60 seconds, you gain 0...1 Energy and are healed for
    // 200...400% of the Energy cost each time you cast a spell."
    effects: [{ kind: "apply-status", statusId: "aura-of-restoration", durationSeconds: 60 }],
  },
  {
    id: "elementalist.kinetic-armor",
    name: "Kinetic Armor",
    gwId: 166,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 3,
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
    // "For 12 seconds, you gain +20...80 armor. Whenever you cast a spell,
    // Kinetic Armor is renewed for 12 seconds."
    effects: [{ kind: "apply-status", statusId: "kinetic-armor", durationSeconds: 12 }],
  },
  {
    id: "elementalist.steam",
    name: "Steam",
    gwId: 846,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "Target foe is struck for 20...60 cold damage. If target foe is on
    // fire, Steam Blinds that foe for 5...10 seconds and they take an
    // additional 20...60 fire damage": 52, 9 s and 52.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.water-magic", atZero: 20, atTwelve: 52 } },
        type: "cold",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "burning" },
        effects: [
          { kind: "apply-status", statusId: "blind", durationSeconds: 9 },
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.water-magic", atZero: 20, atTwelve: 52 },
            },
            type: "fire",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  /* ---------------------------------------------------------------------- */
  /* Elementalist staples 3 (#1664): Air and Earth, at rank 12              */
  /* ---------------------------------------------------------------------- */

  {
    id: "elementalist.enervating-charge",
    name: "Enervating Charge",
    gwId: 224,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
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
    // "Target foe is struck for 25...50 lightning damage and suffers from
    // Weakness for 5...20 seconds": 45 and 17 s.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.air-magic", atZero: 25, atTwelve: 45 } },
        type: "lightning",
        armorPenetration: 0.25,
      },
      { kind: "apply-status", statusId: "weakness", durationSeconds: 17 },
    ],
  },
  {
    id: "elementalist.lightning-hammer",
    name: "Lightning Hammer",
    gwId: 865,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // PvP: "Target foe is struck for 10...100 lightning damage", without
    // the PvE split's Cracked Armor.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 82 } },
        type: "lightning",
        armorPenetration: 0.25,
      },
    ],
  },
  {
    id: "elementalist.lightning-javelin",
    name: "Lightning Javelin",
    gwId: 230,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    // "Send out a Lightning Javelin": it flies as Fireball does. GW1's
    // "strikes all foes between you and your target" is left out: there
    // is no line to pierce along yet.
    projectile: { speed: RANGE_SPELL },
    // "...strikes for 15...50 lightning damage if it hits. Lightning
    // Javelin interrupts attacking foes": 43. An attack skill, or a plain
    // swing under way (#1709).
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.air-magic", atZero: 15, atTwelve: 43 } },
        type: "lightning",
        armorPenetration: 0.25,
      },
      { kind: "if", condition: { kind: "target-attacking" }, effects: [{ kind: "interrupt" }] },
    ],
  },
  {
    id: "elementalist.arc-lightning",
    name: "Arc Lightning",
    gwId: 842,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1.5,
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
    // "Target foe is struck for 5...40 lightning damage. If you are
    // Overcast, two foes near your target are struck for 15...85 lightning
    // damage": 33, and 71 on the nearest two.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.air-magic", atZero: 5, atTwelve: 33 } },
        type: "lightning",
        armorPenetration: 0.25,
      },
      {
        kind: "if",
        condition: { kind: "caster-overcast" },
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: 2,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.air-magic", atZero: 15, atTwelve: 71 },
                },
                type: "lightning",
                armorPenetration: 0.25,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.thunderclap",
    name: "Thunderclap",
    gwId: 228,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Create a massive shockwave at target foe's location. Deals 10...50
    // lightning damage to target and all nearby foes."
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
    // "Struck foes are interrupted and suffer from Cracked Armor and
    // Weakness for 5...20 seconds": 42 and 17 s.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.air-magic", atZero: 10, atTwelve: 42 } },
        type: "lightning",
        armorPenetration: 0.25,
      },
      { kind: "interrupt" },
      { kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 },
      { kind: "apply-status", statusId: "weakness", durationSeconds: 17 },
    ],
  },
  {
    id: "elementalist.windborne-speed",
    name: "Windborne Speed",
    gwId: 160,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.air-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
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
    // "For 5...13 seconds, target ally moves 33% faster": 11 s.
    effects: [{ kind: "apply-status", statusId: "windborne-speed", durationSeconds: 11 }],
  },
  {
    id: "elementalist.glowstone",
    name: "Glowstone",
    gwId: 1661,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 7,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: { speed: RANGE_SPELL },
    // "Send a projectile that strikes for 5...50 earth damage if it hits.
    // If this spell hits a weakened foe, you gain 5 Energy plus 1 Energy
    // for every 2 ranks of Energy Storage", as Glowing Gaze's.
    effects: [
      {
        kind: "damage",
        amount: { scaling: { attributeId: "elementalist.earth-magic", atZero: 5, atTwelve: 41 } },
        type: "earth",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "weakness" },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 5, atTwelve: 11 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.dragons-stomp",
    name: "Dragon's Stomp",
    gwId: 1086,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 25 },
    // Exhaustion, at the corpus's 10 (the card left it out).
    overcast: 10,
    activationSeconds: 3,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "You invoke a Dragon's Stomp at target foe's location. All foes near
    // this location...", as Earthquake's.
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
    // "...are knocked down and are struck for 26...100 earth damage."
    effects: [
      { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 26, atTwelve: 85.2 },
        },
        type: "earth",
        armorPenetration: 0,
      },
    ],
  },
  {
    id: "elementalist.eruption",
    name: "Eruption",
    gwId: 167,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 25 },
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
    // "Cause an Eruption at target foe's location. Each second for 5
    // seconds, foes near this location are struck for 10...40 earth damage
    // and are Blinded for 10 seconds": 34. It stays where they stood as
    // the cast ended, as Maelstrom's.
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
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 34 },
                },
                type: "earth",
                armorPenetration: 0,
              },
              { kind: "apply-status", statusId: "blind", durationSeconds: 10 },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.ash-blast",
    name: "Ash Blast",
    gwId: 1085,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target and adjacent foes are struck for 35...65 earth damage": 59.
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
    // "Burning foes struck by Ash Blast are hexed for 5 seconds...": each
    // struck foe on its own, so only the burning ones.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 35, atTwelve: 59 },
        },
        type: "earth",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has-status", statusId: "burning" },
        effects: [{ kind: "apply-status", statusId: "ash-blast", durationSeconds: 5 }],
      },
    ],
  },
  {
    id: "elementalist.shockwave",
    name: "Shockwave",
    gwId: 937,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    // "All foes in the area": the area around you, so it needs no target.
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "All foes in the area take 15...60 earth damage and are Weakened for
    // 1...10 seconds. Nearby foes also take +15...60 earth damage and have
    // Cracked Armor for 1...10 seconds. Adjacent foes suffer the previous
    // effects, take +15...60 earth damage, and are Blinded for 1...10
    // seconds": 51 and 8 s per ring. Each ring is its own packet of 51, not
    // one summed hit; armor is linear, so the total is the same.
    effects: [
      {
        kind: "splash",
        hits: "foes",
        radius: AREA_IN_THE_AREA,
        maxTargets: undefined,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 15, atTwelve: 51 },
            },
            type: "earth",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "weakness", durationSeconds: 8 },
        ],
      },
      {
        kind: "splash",
        hits: "foes",
        radius: AREA_NEARBY,
        maxTargets: undefined,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 15, atTwelve: 51 },
            },
            type: "earth",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 },
        ],
      },
      {
        kind: "splash",
        hits: "foes",
        radius: AREA_ADJACENT,
        maxTargets: undefined,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 15, atTwelve: 51 },
            },
            type: "earth",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "blind", durationSeconds: 8 },
        ],
      },
    ],
  },
  // Attribute hexes (#1765): a Water Magic hex on the foe is what these ask.
  {
    id: "elementalist.icy-prism",
    name: "Icy Prism",
    gwId: 903,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 5,
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
    // "Target foe is struck for 15...75 cold damage. If that foe has a Water
    // Magic hex, Icy Prism deals +15...75 cold damage to all other nearby
    // foes": 63, once however many Water Magic hexes it has.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 15, atTwelve: 63 },
        },
        type: "cold",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has", category: "hex", attribute: "elementalist.water-magic" },
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.water-magic", atZero: 15, atTwelve: 63 },
                },
                type: "cold",
                armorPenetration: 0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.teinais-crystals",
    name: "Teinai's Crystals",
    gwId: 1099,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "Target foe takes 20...40 damage. If target foe has a Water Magic hex,
    // this spell strikes target and nearby foes for an additional 20...40
    // damage, and nearby foes also suffer Cracked Armor for 5...15
    // seconds": 36, and 13 s. The plain "damage" ignores armor (wiki).
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.earth-magic", atZero: 20, atTwelve: 36 },
        },
        type: "typeless",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "target-has", category: "hex", attribute: "elementalist.water-magic" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 20, atTwelve: 36 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.earth-magic", atZero: 20, atTwelve: 36 },
                },
                type: "typeless",
                armorPenetration: 0,
              },
              { kind: "apply-status", statusId: "cracked-armor", durationSeconds: 13 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "elementalist.freezing-gust",
    name: "Freezing Gust",
    gwId: 1382,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
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
    // "If target foe is under the effect of a Water Magic hex, that foe is
    // struck for 20...80 cold damage. Otherwise, that foe moves 66% slower
    // for 1...5 seconds": 68, and 4 s. Both read before either lands, so
    // one cast never does both; the damage applies no hex (GW1's does,
    // with no effect).
    effects: [
      {
        kind: "if",
        condition: { kind: "target-has", category: "hex", attribute: "elementalist.water-magic" },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.water-magic", atZero: 20, atTwelve: 68 },
            },
            type: "cold",
            armorPenetration: 0,
          },
        ],
      },
      {
        kind: "if",
        condition: {
          kind: "not",
          condition: { kind: "target-has", category: "hex", attribute: "elementalist.water-magic" },
        },
        effects: [{ kind: "apply-status", statusId: "freezing-gust", durationSeconds: 4 }],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Caster staples (#1870), at their rank-12 values                        */
  /* ---------------------------------------------------------------------- */
  {
    id: "elementalist.grasping-earth",
    name: "Grasping Earth",
    gwId: 173,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "self",
    // "All nearby foes": around the caster.
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
    // "For 5...17...20 seconds, all nearby foes move 50% slower": 17 s.
    effects: [{ kind: "apply-status", statusId: "grasping-earth", durationSeconds: 17 }],
  },
  {
    id: "elementalist.breath-of-fire",
    name: "Breath of Fire",
    gwId: 1094,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "Create Breath of Fire at target foe's current location. For 5
    // seconds, foes adjacent to that location are struck for 10...34...40
    // fire damage each second": it stays where the foe stood, as Meteor
    // Shower's.
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
            delaySeconds: 0,
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
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 10, atTwelve: 34 },
                },
                type: "fire",
                armorPenetration: 0,
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "elementalist.master-of-magic",
    name: "Master of Magic",
    gwId: 1378,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
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
    // "For 1...49...61 seconds, all of your elemental attributes are set to
    // 8...13...14" (#1929): the status holds the rest.
    effects: [{ kind: "apply-status", statusId: "master-of-magic", durationSeconds: 49 }],
  },
  // Self-buffs (#1984).
  conjure("flame", "Flame", 182, "fire"),
  conjure("frost", "Frost", 207, "water"),
  conjure("lightning", "Lightning", 221, "air"),
  {
    id: "elementalist.ether-prodigy",
    name: "Ether Prodigy",
    gwId: 178,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Lose all enchantments. For 8...20 seconds, you gain +6 Energy
    // regeneration" (#1984): 18; the strip first, so it never strips itself.
    effects: [
      { kind: "remove-status", category: "enchantment", count: "all" },
      { kind: "apply-status", statusId: "ether-prodigy", durationSeconds: 18 },
    ],
  },
  {
    id: "elementalist.ether-renewal",
    name: "Ether Renewal",
    gwId: 181,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
    cost: { kind: "energy", amount: 10 },
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
    // PvP: "For 10 seconds, each time you cast a spell..." (#1984): the
    // status holds the rest.
    effects: [{ kind: "apply-status", statusId: "ether-renewal", durationSeconds: 10 }],
  },
  {
    id: "elementalist.elemental-attunement",
    name: "Elemental Attunement",
    gwId: 164,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
    cost: { kind: "energy", amount: 10 },
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
    // "For 25...60 seconds, you are attuned to Air, Fire, Water, and
    // Earth" (#1984): 53; the status holds the rest.
    effects: [{ kind: "apply-status", statusId: "elemental-attunement", durationSeconds: 53 }],
  },
  // Attributes raised (#1941).
  {
    id: "elementalist.glyph-of-elemental-power",
    name: "Glyph of Elemental Power",
    gwId: 198,
    type: "glyph",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 25 seconds, your elemental attributes are boosted by 2 for your
    // next 10 spells" (#1941): the status holds the rest.
    effects: [{ kind: "apply-status", statusId: "glyph-of-elemental-power", durationSeconds: 25 }],
  },
  {
    id: "elementalist.glyph-of-energy",
    name: "Glyph of Energy",
    gwId: 199,
    type: "glyph",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.energy-storage",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 25,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Your next 1...3 spells do not cause Overcast and cost 10...25 less
    // Energy to cast. Your elemental attributes are increased by 1...2"
    // (#1941): no duration, it lasts until its 3 are spent.
    effects: [
      {
        kind: "apply-status",
        statusId: "glyph-of-energy",
        durationSeconds: Number.POSITIVE_INFINITY,
      },
    ],
  },
  {
    id: "elementalist.elemental-flame",
    name: "Elemental Flame",
    gwId: 1663,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
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
    // PvP (#1951): "For 5...20 seconds, whenever you apply an Elemental hex
    // to a foe, that foe is set on fire for 1...2 seconds": 17 s.
    effects: [{ kind: "apply-status", statusId: "elemental-flame", durationSeconds: 17 }],
  },
  {
    id: "elementalist.mist-form",
    name: "Mist Form",
    gwId: 236,
    type: "enchantment",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: "elementalist.water-magic",
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
    // PvP (#1951): "For 10...45 seconds, you take 33% less damage from foes
    // under the effect of Water Magic hexes. Whenever you cast an elemental
    // spell, all non-spirit allies in earshot are healed for 50...250% of
    // the Energy cost of the spell": 38 s.
    effects: [{ kind: "apply-status", statusId: "mist-form", durationSeconds: 38 }],
  },
];

/**
 * A conjure (#1984): "For 60 seconds, if you're wielding a fire weapon,
 * your attacks strike for an additional 5...20 fire damage", of its
 * element's attribute.
 */
function conjure(
  element: "flame" | "frost" | "lightning",
  name: string,
  gwId: number,
  attribute: "fire" | "water" | "air",
): Skill {
  return {
    id: `elementalist.conjure-${element}`,
    name: `Conjure ${name}`,
    gwId,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: `elementalist.${attribute}-magic`,
    cost: { kind: "energy", amount: 10 },
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
    effects: [{ kind: "apply-status", statusId: `conjure-${element}`, durationSeconds: 60 }],
  };
}

/**
 * An attunement (#1614): "For 36...60 seconds, you are attuned to Fire. You
 * gain 1 Energy plus 30% of the base Energy cost of the skill each time you
 * use Fire Magic": 55 s.
 */
function attunement(
  element: "fire" | "water" | "air" | "earth",
  name: string,
  gwId: number,
): Skill {
  return {
    id: `elementalist.${element}-attunement`,
    name: `${name} Attunement`,
    gwId,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "elementalist",
    attributeId: `elementalist.${element}-magic`,
    cost: { kind: "energy", amount: 10 },
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
    effects: [{ kind: "apply-status", statusId: `${element}-attunement`, durationSeconds: 55 }],
  };
}
