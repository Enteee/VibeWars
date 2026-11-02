import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
  RANGE_SPIRIT,
} from "../../distances.js";
import { KNOCKDOWN_SECONDS, type CreatureTemplate, type DeathBurst, type Skill } from "../types.js";
import { attackingSpirit, protectiveSpirit, spiritHealth } from "./shared.js";

export const RITUALIST_SKILLS: readonly Skill[] = [
  {
    id: "ritualist.weapon-of-warding",
    name: "Weapon of Warding",
    gwId: 793,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-warding",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 3, atTwelve: 7 },
        },
      },
    ],
  },
  {
    id: "ritualist.mend-body-and-soul",
    name: "Mend Body and Soul",
    gwId: 1234,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 915,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
        amount: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 60, atTwelve: 156 },
        },
      },
    ],
  },
  {
    id: "ritualist.wielders-boon",
    name: "Wielder's Boon",
    gwId: 1265,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    gwId: 1257,
    type: "weapon-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [
      { kind: "apply-status", statusId: "spirit-light-weapon", durationSeconds: { flat: 10 } },
    ],
  },
  {
    id: "ritualist.weapon-of-quickening",
    name: "Weapon of Quickening",
    gwId: 1268,
    type: "weapon-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-quickening",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 5, atTwelve: 21 },
        },
      },
    ],
  },
  {
    id: "ritualist.weapon-of-aggression",
    name: "Weapon of Aggression",
    gwId: 2073,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-aggression",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 13 },
        },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Ritualist weapon spells 2 (#1022)                                       */
  /* ---------------------------------------------------------------------- */

  {
    id: "ritualist.weapon-of-remedy",
    name: "Weapon of Remedy",
    gwId: 1752,
    type: "weapon-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [{ kind: "apply-status", statusId: "weapon-of-remedy", durationSeconds: { flat: 8 } }],
  },
  {
    id: "ritualist.vengeful-weapon",
    name: "Vengeful Weapon",
    gwId: 964,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [{ kind: "apply-status", statusId: "vengeful-weapon", durationSeconds: { flat: 8 } }],
  },
  {
    id: "ritualist.splinter-weapon",
    name: "Splinter Weapon",
    gwId: 792,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    effects: [{ kind: "apply-status", statusId: "splinter-weapon", durationSeconds: { flat: 20 } }],
  },
  {
    id: "ritualist.mending-grip",
    name: "Mending Grip",
    gwId: 2202,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  {
    id: "ritualist.flesh-of-my-flesh",
    name: "Flesh of My Flesh",
    gwId: 791,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
  {
    id: "ritualist.recuperation",
    name: "Recuperation",
    gwId: 981,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
          maxHealth: spiritHealth("ritualist.restoration-magic", [1, 10]),
          armor: { flat: 51 },
          attack: undefined,
          durationSeconds: {
            scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 39 },
          },
          behaviour: { kind: "idle" },
          aura: { statusId: "recuperation", affects: "allies", radius: RANGE_SPIRIT },
          replacedBy: undefined,
          leavesCorpses: undefined,
          onePerOwner: false,
          onDeath: "vanish",
          ownerDisableOnDeath: undefined,
          deathBurst: undefined,
          onDeathInRange: undefined,
        },
      },
    ],
  },
  {
    id: "ritualist.pain",
    name: "Pain",
    gwId: 1247,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1.5,
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
    // PvP: "Create a level 1...8 spirit. This spirit's attacks deal 5...30
    // damage. This spirit dies after 30...150 seconds." Rank 0...15, so
    // at 12: level 6.6, 25 damage, 126 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: attackingSpirit(
          "Pain",
          "ritualist.communing",
          [1, 8],
          { scaling: { attributeId: "ritualist.communing", atZero: 30, atTwelve: 126 } },
          { atZero: 5, atTwelve: 25 },
          [],
        ),
      },
    ],
  },
  {
    id: "ritualist.shadowsong",
    name: "Shadowsong",
    gwId: 871,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
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
    // PvP: "Create a level 1...6 spirit. This spirit's attacks deal 5...20
    // damage and cause Blindness for 1...6 seconds. This spirit dies after
    // 30 seconds." At 12: level 5, 17 damage, blind 5 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: attackingSpirit(
          "Shadowsong",
          "ritualist.communing",
          [1, 6],
          { flat: 30 },
          { atZero: 5, atTwelve: 17 },
          [
            {
              kind: "apply-status",
              statusId: "blind",
              durationSeconds: {
                scaling: { attributeId: "ritualist.communing", atZero: 1, atTwelve: 5 },
              },
            },
          ],
        ),
      },
    ],
  },
  {
    id: "ritualist.dissonance",
    name: "Dissonance",
    gwId: 921,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 2,
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
    // PvP: "Create a level 1...8 spirit. This spirit deals 5...20 damage
    // and anyone struck by its attack is interrupted. This spirit dies
    // after 10...25 seconds." At 12: level 6.6, 17 damage, 22 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: attackingSpirit(
          "Dissonance",
          "ritualist.communing",
          [1, 8],
          { scaling: { attributeId: "ritualist.communing", atZero: 10, atTwelve: 22 } },
          { atZero: 5, atTwelve: 17 },
          [{ kind: "interrupt" }],
        ),
      },
    ],
  },
  {
    id: "ritualist.disenchantment",
    name: "Disenchantment",
    gwId: 923,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 3,
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
    // PvP: "Create a level 1...8 spirit. This spirit deals 5...20 damage
    // and anyone struck by its attack loses one enchantment. This spirit
    // dies after 15...40 seconds." At 12: level 6.6, 17 damage, 35 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: attackingSpirit(
          "Disenchantment",
          "ritualist.communing",
          [1, 8],
          { scaling: { attributeId: "ritualist.communing", atZero: 15, atTwelve: 35 } },
          { atZero: 5, atTwelve: 17 },
          [{ kind: "remove-status", category: "enchantment", count: 1 }],
        ),
      },
    ],
  },
  {
    id: "ritualist.shelter",
    name: "Shelter",
    gwId: 982,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 25 },
    overcast: 0,
    activationSeconds: 5,
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
    // PvP: "Create a level 1...8 spirit. Non-spirit allies within its range
    // cannot lose more than 10% maximum Health from a single attack. When
    // this spirit prevents damage, it loses 75...45 Health. This spirit
    // lasts 30...60 seconds." At 12: level 6.6, 54 s, 51 a capped blow.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: protectiveSpirit(
          "Shelter",
          "ritualist.communing",
          [1, 8],
          { atZero: 30, atTwelve: 54 },
          "shelter",
          "allies",
        ),
      },
    ],
  },
  {
    id: "ritualist.union",
    name: "Union",
    gwId: 911,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 15 },
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
    // PvP: "Create a level 1...8 spirit. Whenever a non-spirit ally in its
    // range takes damage or life steal, it is reduced by 15 and the spirit
    // takes 15 damage. This spirit dies after 30...60 seconds." At 12:
    // level 6.6, 54 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: protectiveSpirit(
          "Union",
          "ritualist.communing",
          [1, 8],
          { atZero: 30, atTwelve: 54 },
          "union",
          "allies",
        ),
      },
    ],
  },
  {
    id: "ritualist.displacement",
    name: "Displacement",
    gwId: 1249,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 15 },
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
    // PvP: "Create a level 1...10 spirit. All non-spirit allies within its
    // range have a 75% chance to block incoming attacks. Every time an
    // attack is blocked in this way, this spirit takes 60 damage. This
    // spirit dies after 30...60 seconds." At 12: level 8.2, 54 s.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: protectiveSpirit(
          "Displacement",
          "ritualist.communing",
          [1, 10],
          { atZero: 30, atTwelve: 54 },
          "displacement",
          "allies",
        ),
      },
    ],
  },
  {
    id: "ritualist.earthbind",
    name: "Earthbind",
    gwId: 1252,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 15 },
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
    // PvP: "Create a level 1...10 spirit. All non-spirit foes knocked down
    // within its range are knocked down for at least 3 seconds. Whenever
    // this happens, this spirit loses 50...25 Health. This spirit dies
    // after 15...45 seconds." At 12: level 8.2, 39 s, 30 a knockdown.
    effects: [
      {
        kind: "summon",
        count: 1,
        creature: protectiveSpirit(
          "Earthbind",
          "ritualist.communing",
          [1, 10],
          { atZero: 15, atTwelve: 39 },
          "earthbind",
          "foes",
        ),
      },
    ],
  },
  // Spawning Power's spirit sacrifice (#1309): spend a spirit of your
  // side, whoever summoned it, for a burst; Consume Soul answers foes'.
  {
    id: "ritualist.rupture-soul",
    name: "Rupture Soul",
    gwId: 917,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "allied-spirit",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target allied spirit is destroyed. All nearby enemies are struck
    // for 50...140 lightning damage and become blinded for 3...12
    // seconds": nearby the spirit, 10 s blind, its rank-12 value. The
    // blow lands first, centred where the spirit stood.
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
              scaling: { attributeId: "ritualist.spawning-power", atZero: 50, atTwelve: 122 },
            },
            type: "lightning",
            armorPenetration: 0,
          },
          {
            kind: "apply-status",
            statusId: "blind",
            durationSeconds: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 3, atTwelve: 10.2 },
            },
          },
        ],
      },
      { kind: "destroy-target-spirit" },
    ],
  },
  {
    id: "ritualist.spirit-to-flesh",
    name: "Spirit to Flesh",
    gwId: 918,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 0.75,
    rechargeSeconds: 15,
    // "Target touched allied spirit".
    touch: true,
    range: RANGE_MELEE,
    target: "allied-spirit",
    area: {
      radius: AREA_NEARBY,
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
    // "...is destroyed. All nearby allies are healed for 30...240":
    // nearby you, you included.
    effects: [
      {
        kind: "heal",
        amount: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 30, atTwelve: 198 },
        },
      },
      { kind: "destroy-target-spirit" },
    ],
  },
  {
    id: "ritualist.spirit-transfer",
    name: "Spirit Transfer",
    gwId: 962,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "The spirit nearest you loses 5...50 Health. Target ally is healed
    // for 5 for each point of Health lost" (#1947): any team's spirit,
    // within earshot; 41 at rank 12, so a 205 heal.
    effects: [
      {
        kind: "drain-nearest-spirit",
        health: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 41 },
        },
        healPerPoint: 5,
      },
    ],
  },
  {
    id: "ritualist.gaze-of-fury",
    name: "Gaze of Fury",
    gwId: 1734,
    type: "binding-ritual",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 20,
    range: RANGE_SPELL,
    target: "allied-spirit",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // PvP (#1947): "Destroy target allied spirit and create a level 1...10
    // Spirit of Fury. This spirit's attacks deal 5...20 damage. This
    // spirit dies after 30...60 seconds." Rank 0...15, so at 12: level 8,
    // 17 damage, 54 s; it stands where the destroyed one stood, and is
    // the caster's whoever's that was.
    effects: [
      { kind: "destroy-target-spirit" },
      {
        kind: "summon",
        count: 1,
        at: "target",
        creature: attackingSpirit(
          "Fury",
          "ritualist.channeling-magic",
          [1, 10],
          { scaling: { attributeId: "ritualist.channeling-magic", atZero: 30, atTwelve: 54 } },
          { atZero: 5, atTwelve: 17 },
          [],
        ),
      },
    ],
  },
  {
    id: "ritualist.feast-of-souls",
    name: "Feast of Souls",
    gwId: 980,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: { origin: "party" },
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Destroy all nearby allies' spirits. For each spirit destroyed in
    // this way, all party members are healed for 50...100 Health". None
    // nearby: used, and nobody healed.
    effects: [
      { kind: "destroy-allied-spirits", radius: AREA_NEARBY },
      {
        kind: "heal",
        perDestroyedSpirit: true,
        amount: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 50, atTwelve: 90 },
        },
      },
    ],
  },
  {
    id: "ritualist.consume-soul",
    name: "Consume Soul",
    gwId: 914,
    type: "spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
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
    // "You steal 5...70 Health from target foe. All hostile summoned
    // creatures in earshot of that foe take 25...125 damage".
    effects: [
      {
        kind: "life-steal",
        amount: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 57 },
        },
      },
      {
        kind: "splash",
        hits: "foe-creatures",
        radius: AREA_EARSHOT,
        maxTargets: undefined,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 25, atTwelve: 105 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  // Ritualist Channeling staples (#1270).
  {
    id: "ritualist.spirit-rift",
    name: "Spirit Rift",
    gwId: 910,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
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
    projectile: undefined,
    // "Open a Spirit Rift at target foe's location. After 3 seconds, all
    // adjacent foes are struck for 25...105...125 lightning damage and
    // suffer from Cracked Armor for 1...16...20 seconds": 16 s, its
    // rank-12 value. It strikes whoever is adjacent then, and is gone a
    // moment after.
    effects: [
      {
        kind: "create-ground-effect",
        anchor: "target",
        durationSeconds: { flat: 3.1 },
        act: {
          kind: "pulse",
          pulse: {
            count: 1,
            everySeconds: 0.1,
            delaySeconds: 3,
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
                  scaling: { attributeId: "ritualist.channeling-magic", atZero: 25, atTwelve: 105 },
                },
                type: "lightning",
                armorPenetration: 0,
              },
              {
                kind: "apply-status",
                statusId: "cracked-armor",
                durationSeconds: {
                  scaling: { attributeId: "ritualist.channeling-magic", atZero: 1, atTwelve: 16.2 },
                },
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "ritualist.spirit-burn",
    name: "Spirit Burn",
    gwId: 919,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 6,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Target foe is struck for 5...41...50 lightning damage. If any
    // spirits are within earshot, Spirit Burn causes Burning for
    // 1...4...5 seconds": 4 s, its rank-12 value; earshot of you, any
    // team's spirit.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 41 },
        },
        type: "lightning",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-spirit-within", radius: AREA_EARSHOT },
        effects: [
          {
            kind: "apply-status",
            statusId: "burning",
            durationSeconds: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 1, atTwelve: 4.2 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.essence-strike",
    name: "Essence Strike",
    gwId: 1227,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
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
    // "Target foe is struck for 15...51...60 lightning damage. If any
    // spirits are within earshot, you gain 1...7...9 Energy": 7.4 at rank
    // 12 keeps rank 15's 9.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 15, atTwelve: 51 },
        },
        type: "lightning",
        armorPenetration: 0,
      },
      {
        kind: "if",
        condition: { kind: "caster-spirit-within", radius: AREA_EARSHOT },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 1, atTwelve: 7.4 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.painful-bond",
    name: "Painful Bond",
    gwId: 1237,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 12,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes": the target, then every foe nearby.
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
    // "For 10...18...20 seconds, ... take 8...18...20 damage whenever hit
    // by a spirit's attack": 18 s, its rank-12 value; the damage is the
    // status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "painful-bond",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 10, atTwelve: 18 },
        },
      },
    ],
  },
  {
    id: "ritualist.lamentation",
    name: "Lamentation",
    gwId: 916,
    type: "hex",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "Target foe and all nearby foes": the target, then every foe nearby.
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
    // "For 5...17...20 seconds, ... suffer -0...2...3 Health degeneration.
    // When this hex is applied, these foes take 10...42...50 damage if you
    // are within earshot of a spirit or corpse": 17 s, its rank-12 value;
    // the degeneration is the status's. GW1 names no type: typeless.
    effects: [
      {
        kind: "apply-status",
        statusId: "lamentation",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 17 },
        },
      },
      {
        kind: "if",
        condition: { kind: "caster-spirit-or-corpse-within", radius: AREA_EARSHOT },
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 10, atTwelve: 42 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.signet-of-spirits",
    name: "Signet of Spirits",
    gwId: 1239,
    type: "signet",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 1,
    // Its PvP record's (gw 2965).
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
    // PvP: "You gain 3...10...12 Energy if you are within earshot of a
    // spirit": 10.2 at rank 12 keeps rank 15's 12. No spirit, no effect,
    // but it is used and recharges.
    effects: [
      {
        kind: "if",
        condition: { kind: "caster-spirit-within", radius: AREA_EARSHOT },
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 3, atTwelve: 10.2 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.boon-of-creation",
    name: "Boon of Creation",
    gwId: 1230,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 2,
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
    // "For 15...51...60 seconds": 51, its rank-12 value. The health and
    // energy for each creature are the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "boon-of-creation",
        durationSeconds: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.explosive-growth",
    name: "Explosive Growth",
    gwId: 1229,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
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
    // "For 15...51...60 seconds": 51, its rank-12 value. The lightning
    // round each new creature is the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "explosive-growth",
        durationSeconds: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.spirits-gift",
    name: "Spirit's Gift",
    gwId: 1480,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
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
    // "For 60 seconds": the heal and cleanse round each new creature are
    // the status's.
    effects: [{ kind: "apply-status", statusId: "spirits-gift", durationSeconds: { flat: 60 } }],
  },
  {
    id: "ritualist.signet-of-creation",
    name: "Signet of Creation",
    gwId: 1238,
    type: "signet",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
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
    // "You gain 4 Energy for every summoned creature you control within
    // earshot (maximum 3...12 Energy)": 10.2 at rank 12 keeps rank 15's
    // 12. No creature, no energy, but it is used and recharges.
    effects: [
      {
        kind: "energy-gain",
        amount: { flat: 4 },
        perOwnCreatureWithin: {
          radius: AREA_EARSHOT,
          max: {
            scaling: { attributeId: "ritualist.spawning-power", atZero: 3, atTwelve: 10.2 },
          },
        },
      },
    ],
  },
  // Ritualist item spells (#1434): ashes held, a bundle in the hands, and
  // a drop effect when they fall. The held bonus and the drop are the
  // item status's; durations at rank 12.
  {
    id: "ritualist.protective-was-kaolai",
    name: "Protective Was Kaolai",
    gwId: 1219,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Kaolai's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "protective-was-kaolai",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.generous-was-tsungrai",
    name: "Generous Was Tsungrai",
    gwId: 772,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Tsungrai's ashes for up to 15...60 seconds": 51, for a 10%
    // sacrifice.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 10 },
      {
        kind: "apply-status",
        statusId: "generous-was-tsungrai",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.defiant-was-xinrae",
    name: "Defiant Was Xinrae",
    gwId: 812,
    type: "item-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Xinrae's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "defiant-was-xinrae",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.blind-was-mingson",
    name: "Blind Was Mingson",
    gwId: 788,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Mingson's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "blind-was-mingson",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.grasping-was-kuurong",
    name: "Grasping Was Kuurong",
    gwId: 789,
    type: "item-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 1.5,
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
    // "Hold Kuurong's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "grasping-was-kuurong",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.energetic-was-lee-sa",
    name: "Energetic Was Lee Sa",
    gwId: 2016,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 10 },
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
    // "Hold Lee Sa's ashes for 5...15 seconds": 13.
    effects: [
      {
        kind: "apply-status",
        statusId: "energetic-was-lee-sa",
        durationSeconds: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 13 },
        },
      },
    ],
  },
  // Ritualist item spells 2 (#1464), as #1434's.
  {
    id: "ritualist.mighty-was-vorizun",
    name: "Mighty Was Vorizun",
    gwId: 773,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
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
    // "Hold Vorizun's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "mighty-was-vorizun",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.cruel-was-daoshen",
    name: "Cruel Was Daoshen",
    gwId: 1218,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 15 },
    overcast: 0,
    activationSeconds: 2,
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
    // "Hold Daoshen's ashes for up to 15...60 seconds": 51.
    effects: [
      {
        kind: "apply-status",
        statusId: "cruel-was-daoshen",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 15, atTwelve: 51 },
        },
      },
    ],
  },
  {
    id: "ritualist.destructive-was-glaive",
    name: "Destructive Was Glaive",
    gwId: 1732,
    type: "item-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
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
    // PvP (3157): "Hold Glaive's ashes for up to 30...60 seconds": 54.
    effects: [
      {
        kind: "apply-status",
        statusId: "destructive-was-glaive",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 30, atTwelve: 54 },
        },
      },
    ],
  },
  {
    id: "ritualist.tranquil-was-tanasen",
    name: "Tranquil Was Tanasen",
    gwId: 913,
    type: "item-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Tanasen's ashes for up to 5...20 seconds": 17.
    effects: [
      {
        kind: "apply-status",
        statusId: "tranquil-was-tanasen",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 17 },
        },
      },
    ],
  },
  {
    id: "ritualist.vengeful-was-khanhei",
    name: "Vengeful Was Khanhei",
    gwId: 790,
    type: "item-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 5 },
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
    // "Hold Khanhei's ashes for 5...11 seconds": 10.
    effects: [
      {
        kind: "apply-status",
        statusId: "vengeful-was-khanhei",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 9.8 },
        },
      },
    ],
  },
  {
    id: "ritualist.pure-was-li-ming",
    name: "Pure Was Li Ming",
    gwId: 2072,
    type: "item-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "Hold Li Ming's ashes for 5...20 seconds": 17.
    effects: [
      {
        kind: "apply-status",
        statusId: "pure-was-li-ming",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 17 },
        },
      },
    ],
  },
  // Ritualist spirits (#1550): on-hit effects past a status, and death bursts.
  bindingRitual({
    id: "ritualist.bloodsong",
    name: "Bloodsong",
    gwId: 1253,
    elite: false,
    attributeId: "ritualist.channeling-magic",
    energy: 5,
    activationSeconds: 1.5,
    rechargeSeconds: 30,
    // PvP: "Create a level 1...8 spirit who dies after 30...150 seconds.
    // Attacks by that spirit steal up to 5...25 Health." At 12: level 6.6,
    // 126 s, 21 stolen; its blow itself deals nothing.
    creature: attackingSpirit(
      "Bloodsong",
      "ritualist.channeling-magic",
      [1, 8],
      { scaling: { attributeId: "ritualist.channeling-magic", atZero: 30, atTwelve: 126 } },
      { atZero: 0, atTwelve: 0 },
      [
        {
          kind: "life-steal",
          amount: {
            scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 21 },
          },
        },
      ],
    ),
  }),
  bindingRitual({
    id: "ritualist.anguish",
    name: "Anguish",
    gwId: 1745,
    elite: false,
    attributeId: "ritualist.communing",
    energy: 25,
    activationSeconds: 1.5,
    rechargeSeconds: 30,
    // PvP: "Create a level 1...7 spirit. This spirit's attacks deal 5...20
    // damage and deal double damage to hexed foes. This spirit dies after
    // 15...45 seconds." At 12: level 5.8, 17 damage, 39 s; the double is a
    // second 17, mitigated apart.
    creature: attackingSpirit(
      "Anguish",
      "ritualist.communing",
      [1, 7],
      { scaling: { attributeId: "ritualist.communing", atZero: 15, atTwelve: 39 } },
      { atZero: 5, atTwelve: 17 },
      [
        {
          kind: "if",
          condition: { kind: "target-has", category: "hex" },
          effects: [
            {
              kind: "damage",
              amount: { scaling: { attributeId: "ritualist.communing", atZero: 5, atTwelve: 17 } },
              type: "piercing",
              armorPenetration: 0,
            },
          ],
        },
      ],
    ),
  }),
  bindingRitual({
    id: "ritualist.wanderlust",
    name: "Wanderlust",
    gwId: 1255,
    elite: true,
    attributeId: "ritualist.communing",
    energy: 10,
    activationSeconds: 3,
    rechargeSeconds: 45,
    // PvP: "Create a level 1...8 spirit. Whenever this spirit's attack hits
    // a stationary foe, that foe is knocked down and the spirit loses
    // 70...50 Health. This spirit dies after 30...60 seconds." At 12:
    // level 6.6, 54 s, 54 a knockdown; its blow itself deals nothing.
    creature: attackingSpirit(
      "Wanderlust",
      "ritualist.communing",
      [1, 8],
      { scaling: { attributeId: "ritualist.communing", atZero: 30, atTwelve: 54 } },
      { atZero: 0, atTwelve: 0 },
      [
        {
          kind: "if",
          condition: { kind: "target-not-moving" },
          effects: [
            { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
            {
              kind: "lose-health",
              amount: { scaling: { attributeId: "ritualist.communing", atZero: 70, atTwelve: 54 } },
              perRemovedOfProfession: undefined,
            },
          ],
        },
      ],
    ),
  }),
  bindingRitual({
    id: "ritualist.soothing",
    name: "Soothing",
    gwId: 1266,
    elite: false,
    attributeId: "ritualist.communing",
    energy: 25,
    activationSeconds: 5,
    rechargeSeconds: 60,
    // PvP: "Create a level 1...8 spirit. All foes within its range take
    // twice as long to build adrenaline. This spirit dies after 15...45
    // seconds." At 12: level 6.6, 39 s.
    creature: protectiveSpirit(
      "Soothing",
      "ritualist.communing",
      [1, 8],
      { atZero: 15, atTwelve: 39 },
      "soothing",
      "foes",
    ),
  }),
  bindingRitual({
    id: "ritualist.destruction",
    name: "Destruction",
    gwId: 920,
    elite: false,
    attributeId: "ritualist.channeling-magic",
    energy: 10,
    activationSeconds: 3,
    rechargeSeconds: 20,
    // PvP: "Create a level 1...10 Spirit that dies after 30 seconds. When
    // this Spirit dies, all foes in the area take 1...10 damage for each
    // second the Spirit was alive (maximum of 150 damage)." At 12: level
    // 8.2, 8 a second: a rank's number is whole, as GW1 prints it.
    creature: burstingSpirit("Destruction", "ritualist.channeling-magic", 30, {
      effect: "damage",
      perSecondAlive: {
        scaling: { attributeId: "ritualist.channeling-magic", atZero: 1, atTwelve: 8.2 },
      },
      max: 150,
      affects: "foes",
      radius: AREA_IN_THE_AREA,
    }),
  }),
  bindingRitual({
    id: "ritualist.life",
    name: "Life",
    gwId: 1251,
    elite: false,
    attributeId: "ritualist.restoration-magic",
    energy: 10,
    activationSeconds: 3,
    rechargeSeconds: 20,
    // PvP: "Create a level 1...10 spirit. When this spirit dies, all
    // non-spirit allies within its range are healed for 1...7 Health for
    // each second this spirit was alive. This spirit dies after 20
    // seconds." At 12: level 8.2, 6 a second.
    creature: burstingSpirit("Life", "ritualist.restoration-magic", 20, {
      effect: "heal",
      perSecondAlive: {
        scaling: { attributeId: "ritualist.restoration-magic", atZero: 1, atTwelve: 5.8 },
      },
      max: undefined,
      affects: "allies",
      radius: RANGE_SPIRIT,
    }),
  }),
  {
    id: "ritualist.xinraes-weapon",
    name: "Xinrae's Weapon",
    gwId: 1750,
    type: "weapon-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    // "For 8 seconds, the next time target ally takes damage from a foe
    // that damage is limited to 5% of that ally's max Health and that ally
    // steals up to 20...80 Health from that foe": the cap and the 68 are
    // the status's.
    effects: [{ kind: "apply-status", statusId: "xinraes-weapon", durationSeconds: { flat: 8 } }],
  },
  // Ritualist weapon spells 3 (#1654).
  {
    id: "ritualist.resilient-weapon",
    name: "Resilient Weapon",
    gwId: 787,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "For 3...12 seconds, target ally has a Resilient Weapon. While
    // suffering from a hex or condition, that ally gains +1...6 Health
    // regeneration and +24 armor": the 5 and the 24 are the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "resilient-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 3, atTwelve: 10.2 },
        },
      },
    ],
  },
  {
    id: "ritualist.ghostly-weapon",
    name: "Ghostly Weapon",
    gwId: 2206,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 3 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 1,
    range: RANGE_SPELL,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...20 seconds, target other ally's next attack cannot be
    // blocked."
    effects: [
      {
        kind: "apply-status",
        statusId: "ghostly-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 5, atTwelve: 17 },
        },
      },
    ],
  },
  {
    id: "ritualist.guided-weapon",
    name: "Guided Weapon",
    gwId: 1259,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 2,
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
    // "For 4...10 seconds, target ally's attacks cannot be blocked": the
    // PvP page, 3462.
    effects: [
      {
        kind: "apply-status",
        statusId: "guided-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 4, atTwelve: 8.8 },
        },
      },
    ],
  },
  {
    id: "ritualist.sundering-weapon",
    name: "Sundering Weapon",
    gwId: 2148,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 4...10 seconds, target ally's next 3 attacks have 10% armor
    // penetration and cause Cracked Armor for 5...20 seconds": the 17 is
    // the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "sundering-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 4, atTwelve: 8.8 },
        },
      },
    ],
  },
  {
    id: "ritualist.weapon-of-shadow",
    name: "Weapon of Shadow",
    gwId: 983,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
    cost: { kind: "energy", amount: 10 },
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
    // "For 1...7 seconds, target ally has a Weapon of Shadow": what it
    // blinds is the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-shadow",
        durationSeconds: {
          scaling: { attributeId: "ritualist.restoration-magic", atZero: 1, atTwelve: 5.8 },
        },
      },
    ],
  },
  {
    id: "ritualist.warmongers-weapon",
    name: "Warmonger's Weapon",
    gwId: 1751,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 30,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 3...13 seconds, if target ally attacks a foe who is not
    // attacking, that foe is interrupted."
    effects: [
      {
        kind: "apply-status",
        statusId: "warmongers-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 3, atTwelve: 11 },
        },
      },
    ],
  },
  {
    id: "ritualist.wailing-weapon",
    name: "Wailing Weapon",
    gwId: 794,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 3...14 seconds, target ally has a Wailing Weapon. Whenever the
    // Wailing Weapon strikes an attacking foe, that foe is interrupted."
    effects: [
      {
        kind: "apply-status",
        statusId: "wailing-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 3, atTwelve: 11.8 },
        },
      },
    ],
  },
  {
    id: "ritualist.nightmare-weapon",
    name: "Nightmare Weapon",
    gwId: 795,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 12 seconds, target ally has a Nightmare Weapon. Target ally's
    // next 3 attacks are reduced by 10...50 damage and steal up to 10...50
    // Health": the 42 is the status's.
    effects: [
      { kind: "apply-status", statusId: "nightmare-weapon", durationSeconds: { flat: 12 } },
    ],
  },
  {
    id: "ritualist.weapon-of-fury",
    name: "Weapon of Fury",
    gwId: 1749,
    type: "weapon-spell",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
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
    // "For 5...20 seconds, target ally gains 100% more adrenaline and 1
    // Energy whenever that ally successfully hits with an attack."
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-fury",
        durationSeconds: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 17 },
        },
      },
    ],
  },
  {
    id: "ritualist.weapon-of-renewal",
    name: "Weapon of Renewal",
    gwId: 2149,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "For 5...20 seconds, the next time target ally hits with an attack
    // skill, that ally gains 1...7 Energy": the 6 is the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "weapon-of-renewal",
        durationSeconds: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 17 },
        },
      },
    ],
  },
  // Your spirits within earshot (#1777): measured from you, whoever the
  // skill strikes.
  {
    id: "ritualist.spirit-boon-strike",
    name: "Spirit Boon Strike",
    gwId: 1226,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.channeling-magic",
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 1,
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
    // "Target foe is struck for 20...65 lightning damage, and all spirits
    // you control within earshot gain 20...65 Health": 56 each.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "ritualist.channeling-magic", atZero: 20, atTwelve: 56 },
        },
        type: "lightning",
        armorPenetration: 0,
      },
      {
        kind: "splash",
        hits: "own-spirits",
        radius: AREA_EARSHOT,
        maxTargets: undefined,
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 20, atTwelve: 56 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.spiritleech-aura",
    name: "Spiritleech Aura",
    gwId: 2203,
    type: "skill",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.restoration-magic",
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
    // "For 5...20 seconds, all of your spirits within earshot deal 5...20
    // less damage and steal 5...20 Health when they attack": 17 s; the
    // 17s are the status's. No spirit near: spent, and nothing happens.
    effects: [
      {
        kind: "splash",
        hits: "own-spirits",
        radius: AREA_EARSHOT,
        maxTargets: undefined,
        effects: [
          {
            kind: "apply-status",
            statusId: "spiritleech-aura",
            durationSeconds: {
              scaling: { attributeId: "ritualist.restoration-magic", atZero: 5, atTwelve: 17 },
            },
          },
        ],
      },
    ],
  },
  {
    id: "ritualist.draw-spirit",
    name: "Draw Spirit",
    gwId: 1224,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    overcast: 0,
    activationSeconds: 0.25,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "allied-spirit",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Teleport target allied spirit to your location": any ally's
    // spirit; it keeps its owner and its timer.
    effects: [{ kind: "pull-to-caster" }],
  },
  // The PvP Communing pair (#1827), each under its base record's gwId.
  {
    id: "ritualist.armor-of-unfeeling",
    name: "Armor of Unfeeling",
    gwId: 1232,
    type: "enchantment",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
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
    // PvP: "For 10...35 seconds, you have 10 base damage reduction while
    // casting binding rituals": 30 s, its rank-12 value.
    effects: [
      {
        kind: "apply-status",
        statusId: "armor-of-unfeeling",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 10, atTwelve: 30 },
        },
      },
    ],
  },
  {
    id: "ritualist.signet-of-ghostly-might",
    name: "Signet of Ghostly Might",
    gwId: 1742,
    type: "signet",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    range: RANGE_SPELL,
    target: "allied-summoned-creature",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // PvP: "Target allied summoned creature's attacks deal 5...35 more
    // damage. After 10 seconds, that creature is destroyed": the +29 and
    // the destroying are the status's.
    effects: [
      { kind: "apply-status", statusId: "signet-of-ghostly-might", durationSeconds: { flat: 10 } },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Caster staples 2 (#1872), at their rank-12 values                      */
  /* ---------------------------------------------------------------------- */
  {
    id: "ritualist.vital-weapon",
    name: "Vital Weapon",
    gwId: 1267,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
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
    // "For 5...30 seconds": 25 s; the maximum Health is the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "vital-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 5, atTwelve: 25 },
        },
      },
    ],
  },
  // Suppressed while enchanted (#1916).
  {
    id: "ritualist.brutal-weapon",
    name: "Brutal Weapon",
    gwId: 1258,
    type: "weapon-spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.communing",
    cost: { kind: "energy", amount: 10 },
    overcast: 0,
    activationSeconds: 1,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Give target ally a Brutal Weapon for 10...34...40 seconds. The
    // bearer's weapon strikes for +5...13...15 damage as long as the bearer
    // is under no enchantments": the 13 is the status's.
    effects: [
      {
        kind: "apply-status",
        statusId: "brutal-weapon",
        durationSeconds: {
          scaling: { attributeId: "ritualist.communing", atZero: 10, atTwelve: 34 },
        },
      },
    ],
  },
  // Attributes raised (#1941).
  {
    id: "ritualist.ritual-lord",
    name: "Ritual Lord",
    gwId: 1217,
    type: "skill",
    elite: true,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    cost: undefined,
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
    // "For 5...29...35 seconds, your Ritualist attributes are boosted by
    // 2...4 for your next skill. If that skill is a Binding Ritual, it
    // recharges 10...50...60% faster and Ritual Lord recharges instantly"
    // (#1941): the status holds the rest.
    effects: [
      {
        kind: "apply-status",
        statusId: "ritual-lord",
        durationSeconds: {
          scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 29 },
        },
      },
    ],
  },
  {
    id: "ritualist.signet-of-binding",
    name: "Signet of Binding",
    gwId: 1743,
    type: "signet",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: "ritualist.spawning-power",
    // A signet costs nothing: usable at 0 energy.
    cost: undefined,
    overcast: 0,
    activationSeconds: 2,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "enemy-spirit",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "You lose 200...50 Health and take control of target enemy-controlled
    // spirit" (#1965): 80, and it can kill. Its "50% failure chance with
    // Spawning Power 4 or less" is out of reach at rank 12.
    effects: [
      {
        kind: "lose-health",
        amount: { scaling: { attributeId: "ritualist.spawning-power", atZero: 200, atTwelve: 80 } },
        perRemovedOfProfession: undefined,
      },
      { kind: "take-control" },
    ],
  },
];

/**
 * A binding ritual that makes one spirit (#1550), Ritualist, cast on
 * yourself: what every spirit skill shares, round its creature.
 */
function bindingRitual(ritual: {
  readonly id: string;
  readonly name: string;
  readonly gwId: number;
  readonly elite: boolean;
  readonly attributeId: string;
  readonly energy: number;
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
  readonly creature: CreatureTemplate;
}): Skill {
  return {
    id: ritual.id,
    name: ritual.name,
    gwId: ritual.gwId,
    type: "binding-ritual",
    elite: ritual.elite,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "ritualist",
    attributeId: ritual.attributeId,
    cost: { kind: "energy", amount: ritual.energy },
    overcast: 0,
    activationSeconds: ritual.activationSeconds,
    rechargeSeconds: ritual.rechargeSeconds,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    projectile: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    effects: [{ kind: "summon", count: 1, creature: ritual.creature }],
  };
}

/**
 * A level 1...10 spirit that does nothing while it lives and bursts as it
 * leaves (#1550): Destruction's and Life's, 214 Health at 12 in
 * `attributeId`, armor 51, for `seconds` flat.
 */
function burstingSpirit(
  name: string,
  attributeId: string,
  seconds: number,
  deathBurst: DeathBurst,
): CreatureTemplate {
  return {
    kind: "spirit",
    look: "spirit",
    name,
    maxHealth: spiritHealth(attributeId, [1, 10]),
    armor: { flat: 51 },
    attack: undefined,
    durationSeconds: { flat: seconds },
    behaviour: { kind: "idle" },
    aura: undefined,
    replacedBy: undefined,
    leavesCorpses: undefined,
    onePerOwner: false,
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst,
    onDeathInRange: undefined,
  };
}
