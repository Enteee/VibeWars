import { AREA_ADJACENT } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type ParagonStatusId =
  // Paragon shouts (#921).
  | "fall-back"
  | "stand-your-ground"
  // Paragon shouts and a chant (#956).
  | "incoming"
  | "make-haste"
  | "defensive-anthem"
  | "song-of-restoration"
  // Chants and weapon spells (#758).
  | "anthem-of-flame"
  // Paragon chants 2 (#1483): the next skill of a kind.
  | "zealous-anthem"
  | "aria-of-zeal"
  | "lyric-of-zeal"
  | "aria-of-restoration"
  | "chorus-of-restoration"
  | "lyric-of-purification"
  | "song-of-purification"
  | "hexbreaker-aria"
  | "anthem-of-fury"
  | "anthem-of-weariness"
  | "crippling-anthem"
  | "anthem-of-disruption"
  | "song-of-concentration"
  | "anthem-of-guidance"
  | "energizing-chorus"
  | "anthem-of-envy"
  // Paragon command (#923).
  | "never-surrender"
  // Paragon echoes (#1423).
  | "aggressive-refrain"
  | "blazing-finale"
  | "burning-refrain"
  | "enduring-harmony"
  | "finale-of-restoration"
  | "hasty-refrain"
  | "mending-refrain"
  | "purifying-finale"
  | "bladeturn-refrain"
  | "energizing-finale"
  | "soldiers-fury"
  // Paragon staples 4 (#1677).
  | "go-for-the-eyes"
  | "the-power-is-yours"
  | "its-just-a-flesh-wound"
  | "focused-anger"
  // Not enchanted (#1916).
  | "natural-temper"
  // Touch riders (#1966).
  | "cant-touch-this";

export const PARAGON_STATUSES: Readonly<Record<ParagonStatusId, StatusDefinition>> = {
  // "Fall Back!" at rank 12: 13 Health per second while moving, 33%
  // faster, ending on its bearer's hit.
  "fall-back": define("fall-back", "Fall Back!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
    endsWhenBearerHits: true,
  }),
  // "Stand Your Ground!" at rank 12: +24 armor when not moving, ending if
  // its bearer attacks.
  "stand-your-ground": define("stand-your-ground", "Stand Your Ground!", "shout", {
    profession: "paragon",
    armorWhileStill: 24,
    endsWhenBearerAttacks: true,
  }),
  // "Incoming!" at rank 12: "Fall Back!" with no end on a hit (#956).
  incoming: define("incoming", "Incoming!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
  }),
  // "Make Haste!": 33% faster, until that ally successfully hits (#956).
  "make-haste": define("make-haste", "Make Haste!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    endsWhenBearerHits: true,
  }),
  // "...has a 50% chance to block incoming attacks. This chant ends if
  // that party member hits with an attack skill." (#956)
  "defensive-anthem": define("defensive-anthem", "Defensive Anthem", "chant", {
    profession: "paragon",
    block: { chance: 0.5, against: "all" },
    endsWhenBearerHitsWithAttackSkill: true,
  }),
  // "For 10 seconds, the next time each party member within earshot uses a
  // Skill, that party member gains 45...97...110 Health" (#999, PvP): a
  // heal, by the chanter's Motivation.
  "song-of-restoration": define("song-of-restoration", "Song of Restoration", "chant", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "paragon.motivation", atZero: 45, atTwelve: 97 } },
          },
        ],
        target: "bearer",
        skillId: "paragon.song-of-restoration",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),

  // "The next attack skill used by each party member within earshot also
  // causes Burning for 1...3...3 seconds": 3 s, its rank-12 value.
  "anthem-of-flame": define("anthem-of-flame", "Anthem of Flame", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "apply-status", statusId: "burning", durationSeconds: { flat: 3 } }],
  }),
  // "For 10 seconds, the next time each ally within earshot uses an attack
  // skill, that ally gains 1...8 Energy" (#1483): 7, its rank-12 value.
  "zealous-anthem": define("zealous-anthem", "Zealous Anthem", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "attack-skill",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 7 } }],
      skillId: "paragon.zealous-anthem",
    },
  }),
  // "...uses a spell, that ally gains 1...6 Energy" (#1483): 5 at rank 12.
  "aria-of-zeal": define("aria-of-zeal", "Aria of Zeal", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 5 } }],
      skillId: "paragon.aria-of-zeal",
    },
  }),
  // "...uses a signet, that ally gains 1...8 Energy" (#1483): 7 at rank 12.
  "lyric-of-zeal": define("lyric-of-zeal", "Lyric of Zeal", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "signet",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 7 } }],
      skillId: "paragon.lyric-of-zeal",
    },
  }),
  // "...uses a spell, that party member gains 30...90 Health" (#1483): 78
  // at rank 12, a heal.
  "aria-of-restoration": define("aria-of-restoration", "Aria of Restoration", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "heal", amount: { flat: 78 } }],
      skillId: "paragon.aria-of-restoration",
    },
  }),
  // "...uses a shout or chant, that ally is healed for 30...90 Health"
  // (#1483): 78 at rank 12.
  "chorus-of-restoration": define("chorus-of-restoration", "Chorus of Restoration", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "shout-or-chant",
      count: 1,
      effects: [{ kind: "heal", amount: { flat: 78 } }],
      skillId: "paragon.chorus-of-restoration",
    },
  }),
  // "...uses a signet, that ally loses 1 condition" (#1483).
  "lyric-of-purification": define("lyric-of-purification", "Lyric of Purification", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "signet",
      count: 1,
      effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      skillId: "paragon.lyric-of-purification",
    },
  }),
  // "The next 1...6 skills used by each ally within earshot remove 1
  // condition from that ally" (#1483): 5 skills at rank 12.
  "song-of-purification": define("song-of-purification", "Song of Purification", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "any",
      count: 5,
      effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      skillId: "paragon.song-of-purification",
    },
  }),
  // "...casts a spell, that ally loses 1 hex" (#1483).
  "hexbreaker-aria": define("hexbreaker-aria", "Hexbreaker Aria", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "remove-status", category: "hex", count: 1 }],
      skillId: "paragon.hexbreaker-aria",
    },
  }),
  // "...gain 2...5 strikes of adrenaline the next time they use an attack
  // skill" (#1483): 4 at rank 12.
  "anthem-of-fury": define("anthem-of-fury", "Anthem of Fury", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "attack-skill",
      count: 1,
      effects: [{ kind: "adrenaline-gain", strikes: 4 }],
      skillId: "paragon.anthem-of-fury",
    },
  }),
  // "The next attack skill used by each ally within earshot also causes
  // Weakness for 1...16 seconds" (#1483): 13 s at rank 12.
  "anthem-of-weariness": define("anthem-of-weariness", "Anthem of Weariness", "chant", {
    profession: "paragon",
    nextAttackSkill: [
      { kind: "apply-status", statusId: "weakness", durationSeconds: { flat: 13 } },
    ],
  }),
  // "...causes Crippling for 5...15 seconds" (#1483): 13 s at rank 12.
  "crippling-anthem": define("crippling-anthem", "Crippling Anthem", "chant", {
    profession: "paragon",
    nextAttackSkill: [
      { kind: "apply-status", statusId: "crippled", durationSeconds: { flat: 13 } },
    ],
  }),
  // "...also interrupts an action" (#1483).
  "anthem-of-disruption": define("anthem-of-disruption", "Anthem of Disruption", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "interrupt" }],
  }),
  // "For 10 seconds, the next skill used by each ally within earshot
  // cannot be interrupted" (#1505).
  "song-of-concentration": define("song-of-concentration", "Song of Concentration", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "any",
      uninterruptible: true,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "paragon.song-of-concentration",
    },
  }),
  // "...the next attack skill used by each party member within earshot
  // cannot be blocked" (#1505).
  "anthem-of-guidance": define("anthem-of-guidance", "Anthem of Guidance", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "attack-skill",
      uninterruptible: false,
      unblockable: true,
      energyDiscount: 0,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "paragon.anthem-of-guidance",
    },
  }),
  // "...the next shout or chant used by each ally within earshot costs
  // 3...7 less Energy" (#1505): 6 at rank 12.
  "energizing-chorus": define("energizing-chorus", "Energizing Chorus", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "shout-or-chant",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 6,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "paragon.energizing-chorus",
    },
  }),
  // "...the next attack skill used by each ally within earshot deals
  // +10...20 damage against foes with more than 50% Health" (#1505, PvP):
  // 18 at rank 12.
  "anthem-of-envy": define("anthem-of-envy", "Anthem of Envy", "chant", {
    profession: "paragon",
    nextAttackSkillBonus: {
      condition: { kind: "target-health-above", fraction: 0.5 },
      amount: { flat: 18 },
    },
  }),
  // PvP "Never Surrender!": +1...4 Health regeneration (#923), at the
  // shouter's Command (#1976).
  "never-surrender": define("never-surrender", "Never Surrender!", "shout", {
    profession: "paragon",
    healthPips: { scaling: { attributeId: "paragon.command", atZero: 1, atTwelve: 4 } },
  }),

  // Paragon echoes (#1423): each renews, or fires, whenever a chant or a
  // shout ends on its bearer; no removal touches one. Rank-12 values, and
  // a finale's effects scale with its Paragon's attribute.
  // "You attack 25% faster but have -20 armor": 1 − 0.25 (ADR-0029).
  "aggressive-refrain": define("aggressive-refrain", "Aggressive Refrain", "echo", {
    profession: "paragon",
    attackDurationMultiplier: 0.75,
    armorModifier: -20,
    renewsOnChantOrShoutEnd: true,
  }),
  "blazing-finale": define("blazing-finale", "Blazing Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: { flat: 4 } }],
          },
        ],
        target: "bearer",
        skillId: "paragon.blazing-finale",
      },
    ],
  }),
  "burning-refrain": define("burning-refrain", "Burning Refrain", "echo", {
    profession: "paragon",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "target-more-health" },
          effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: { flat: 3 } }],
        },
      ],
      skillId: "paragon.burning-refrain",
    },
    renewsOnChantOrShoutEnd: true,
  }),
  "enduring-harmony": define("enduring-harmony", "Enduring Harmony", "echo", {
    profession: "paragon",
    chantShoutDurationMultiplier: 1.5,
  }),
  // A heal, not a gain, as GWW has it: Deep Wound cuts it.
  "finale-of-restoration": define("finale-of-restoration", "Finale of Restoration", "echo", {
    profession: "paragon",
    endsAfterTriggers: 5,
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "paragon.motivation", atZero: 15, atTwelve: 63 } },
          },
        ],
        target: "bearer",
        skillId: "paragon.finale-of-restoration",
      },
    ],
  }),
  "hasty-refrain": define("hasty-refrain", "Hasty Refrain", "echo", {
    profession: "paragon",
    moveSpeedMultiplier: 1.25,
    renewsOnChantOrShoutEnd: true,
  }),
  "mending-refrain": define("mending-refrain", "Mending Refrain", "echo", {
    profession: "paragon",
    healthPips: 3,
    renewsOnChantOrShoutEnd: true,
  }),
  "purifying-finale": define("purifying-finale", "Purifying Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
        target: "bearer",
        skillId: "paragon.purifying-finale",
      },
    ],
  }),
  // Paragon echoes 2 (#1485), at their rank-12 values.
  // "...+10...40 armor against slashing damage" (PvP): 34.
  "bladeturn-refrain": define("bladeturn-refrain", "Bladeturn Refrain", "echo", {
    profession: "paragon",
    conditionalArmor: [{ amount: 34, conditions: [{ kind: "vs-type", type: "slashing" }] }],
    renewsOnChantOrShoutEnd: true,
  }),
  // "...whenever a shout or chant ends on target non-spirit ally, that
  // ally gains 1...2 Energy": 2.
  "energizing-finale": define("energizing-finale", "Energizing Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [{ kind: "energy-gain", amount: { flat: 2 }, toTarget: true }],
        target: "bearer",
        skillId: "paragon.energizing-finale",
      },
    ],
  }),
  // "...if you are under the effects of a chant or a shout, you attack 33%
  // faster and gain 33% more adrenaline, but you have -20 armor": the
  // armor always.
  "soldiers-fury": define("soldiers-fury", "Soldier's Fury", "echo", {
    profession: "paragon",
    armorModifier: -20,
    whileUnder: {
      categories: ["shout", "chant"],
      statusIds: [],
      attackDurationMultiplier: 0.67,
      adrenalineGainFaster: 0.33,
      healthPips: 0,
      armorModifier: 0,
      attackMissChance: 0,
    },
  }),

  // "Go for the Eyes!" at Command 12 (PvP): +66% chance to crit on the
  // bearer's next attack, a swing or an attack skill, which ends it.
  "go-for-the-eyes": define("go-for-the-eyes", "Go for the Eyes!", "shout", {
    profession: "paragon",
    criticalChanceBonus: 0.66,
    endsWhenBearerAttacks: true,
  }),
  // "The Power Is Yours!" at Motivation 12: +2 Energy regeneration.
  "the-power-is-yours": define("the-power-is-yours", "The Power Is Yours!", "shout", {
    profession: "paragon",
    energyPips: 2,
  }),
  // "It's Just a Flesh Wound.": moves 25% faster.
  "its-just-a-flesh-wound": define("its-just-a-flesh-wound", "It's Just a Flesh Wound.", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.25,
  }),
  // Focused Anger at Leadership 12: 120% more adrenaline.
  "focused-anger": define("focused-anger", "Focused Anger", "skill-effect", {
    profession: "paragon",
    adrenalineGainFaster: 1.2,
  }),
  // "You gain 33% more adrenaline while not under the effects of an
  // enchantment" (#1916).
  "natural-temper": define("natural-temper", "Natural Temper", "skill-effect", {
    profession: "paragon",
    adrenalineGainFaster: 0.33,
    suppressedWhileUnder: ["enchantment"],
  }),
  // "For 20 seconds, the next 1...5 touch skills used against you fail"
  // (PvP, #1966): 4.
  "cant-touch-this": define("cant-touch-this", '"Can\'t Touch This!"', "shout", {
    profession: "paragon",
    failsFoeTouchSkills: 4,
  }),
};
