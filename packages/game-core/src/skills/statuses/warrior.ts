import { AREA_ADJACENT } from "../../distances.js";
import { gw1EnergyScaled } from "../../ruleset.js";
import type { StatusDefinition } from "../status.js";
import { KNOCKDOWN_SECONDS } from "../types.js";
import { define } from "./define.js";

export type WarriorStatusId =
  // Stances.
  | "sprint"
  | "frenzy"
  // Warrior Tactics stances (#1329).
  | "bonettis-defense"
  | "deflect-arrows"
  | "gladiators-defense"
  | "disciplined-stance"
  | "balanced-stance"
  // Shouts and skill effects (#524).
  | "watch-yourself"
  | "healing-signet-armor"
  | "for-great-justice"
  // Swordsmanship (#1354).
  | "hundred-blades"
  // Strength (#1359).
  | "rush"
  | "dolyak-signet"
  | "endure-pain"
  | "warriors-endurance"
  // Warrior staples (#1549).
  | "flail"
  | "defy-pain"
  | "riposte"
  | "deadly-riposte"
  | "charge"
  | "enraging-charge"
  // Warrior staples 2 (#1592).
  | "shield-bash"
  | "shield-stance"
  | "rage-of-the-ntouka"
  // Staples (#1869).
  | "frenzied-defense"
  | "flurry"
  // Your next N attacks (#1916).
  | "signet-of-strength"
  // Tactics stances that pay on a block (#1978).
  | "wary-stance"
  | "soldiers-defense"
  | "defensive-stance"
  | "auspicious-parry";

export const WARRIOR_STATUSES: Readonly<Record<WarriorStatusId, StatusDefinition>> = {
  sprint: define("sprint", "Sprint", "stance", {
    profession: "warrior",
    moveSpeedMultiplier: 1.25,
  }),
  // PvP: "For 8 seconds, you attack 33% faster but take 200...150% damage"
  // (#1958), at the warrior's Strength (#1976). Faster is 1 − x (ADR-0029).
  frenzy: define("frenzy", "Frenzy", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    damageTakenMultiplier: {
      scaling: { attributeId: "warrior.strength", atZero: 2, atTwelve: 1.6 },
    },
  }),
  // "For 5...11 seconds, you have a 75% chance to block melee and
  // projectile attacks. You gain 5 Energy for each successful melee attack
  // blocked. Bonetti's Defense ends if you use a skill." (#1329)
  "bonettis-defense": define("bonettis-defense", "Bonetti's Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    endsWhenBearerUsesSkill: true,
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "bearer",
        effects: [{ kind: "energy-gain", amount: { flat: 5 } }],
        skillId: "warrior.bonettis-defense",
      },
    ],
  }),
  // "For 1...6 seconds, you have a 75% chance to block attacks. If you
  // block a projectile attack, adjacent foes suffer from Bleeding for
  // 5...15 seconds" (#1329): 13 s, its rank-12 value.
  "deflect-arrows": define("deflect-arrows", "Deflect Arrows", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-projectile",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 13 }],
          },
        ],
        skillId: "warrior.deflect-arrows",
      },
    ],
  }),
  // "For 5...11 seconds, you have a 75% chance to block incoming attacks.
  // Whenever you block a melee attack this way, the attacker suffers
  // 5...35 damage" (#1329): 29, its rank-12 value.
  "gladiators-defense": define("gladiators-defense", "Gladiator's Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "offender",
        effects: [{ kind: "damage", amount: { flat: 29 }, type: "typeless", armorPenetration: 0 }],
        skillId: "warrior.gladiators-defense",
      },
    ],
  }),
  // "For 1...4 seconds, you gain +10 armor and have a 75% chance to block
  // attacks. Disciplined Stance ends if you use an adrenal skill." (#1329)
  "disciplined-stance": define("disciplined-stance", "Disciplined Stance", "stance", {
    profession: "warrior",
    armorModifier: 10,
    block: { chance: 0.75, against: "all" },
    endsWhenBearerUsesAdrenalSkill: true,
  }),
  // "For 8...20 seconds, you cannot be knocked down and you do not suffer
  // extra damage from a critical attack." (#1329) Unlike Fleeting
  // Stability, stopping a knockdown does not end it.
  "balanced-stance": define("balanced-stance", "Balanced Stance", "stance", {
    profession: "warrior",
    preventsKnockdown: true,
    ignoresCriticalDamage: true,
  }),

  // "Watch Yourself!": +5...21 armor at the shouter's Tactics (#1976),
  // ending after 1...3 attacks: 3, its rank-12 value.
  "watch-yourself": define("watch-yourself", "Watch Yourself!", "shout", {
    profession: "warrior",
    armorModifier: { scaling: { attributeId: "warrior.tactics", atZero: 5, atTwelve: 21 } },
    endsAfterAttacks: 3,
  }),
  // "For Great Justice!" (PvP): "For 8 seconds, whenever you hit with an
  // attack, you gain 1 additional strike of adrenaline."
  "for-great-justice": define("for-great-justice", "For Great Justice!", "shout", {
    profession: "warrior",
    extraStrikesPerHit: 1,
  }),
  // "For 15 seconds, whenever you attack with a sword, all adjacent foes
  // take 10...30 slashing damage" (PvP, #1354): 26, its rank-12 value. Any
  // attack, an auto-attack or a skill, hit or not. The splash is centred
  // on the bearer and leaves it out.
  "hundred-blades": define("hundred-blades", "Hundred Blades", "skill-effect", {
    profession: "warrior",
    triggers: [
      {
        on: "bearer-attacks",
        weapon: "sword",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 26 }, type: "slashing", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "warrior.hundred-blades",
      },
    ],
  }),
  // "For 8...20 seconds, you move 25% faster" (#1359).
  rush: define("rush", "Rush", "stance", { profession: "warrior", moveSpeedMultiplier: 1.25 }),
  // "For 8...20 seconds, you have +10...40 armor and cannot be knocked
  // down, but your movement is slowed by 75%" (#1359): +34, its rank-12
  // value.
  "dolyak-signet": define("dolyak-signet", "Dolyak Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: 34,
    preventsKnockdown: true,
    moveSpeedMultiplier: 0.25,
  }),
  // "For 7...18 seconds you have an additional 90...300 Health" (#1359),
  // at Strength (#1976).
  "endure-pain": define("endure-pain", "Endure Pain", "skill-effect", {
    profession: "warrior",
    maxHealthBonus: { scaling: { attributeId: "warrior.strength", atZero: 90, atTwelve: 258 } },
  }),
  // "For 5...35 seconds, you gain 3 Energy each time you hit with a melee
  // attack. Warrior's Endurance cannot raise your Energy above 10...25"
  // (PvP, #1359): 22, its rank-12 value, scaled to the pool (#1395): 55 of
  // 50, as 22 sat against GW1's 20. A bow or a thrown spear gains none.
  "warriors-endurance": define("warriors-endurance", "Warrior's Endurance", "stance", {
    profession: "warrior",
    triggers: [
      {
        on: "bearer-hits",
        weapon: "melee",
        effects: [{ kind: "energy-gain", amount: { flat: 3 }, upTo: gw1EnergyScaled(22) }],
        target: "bearer",
        skillId: "warrior.warriors-endurance",
      },
    ],
  }),
  // "For 1...15 seconds, you attack 33% faster but move 33% slower"
  // (PvP, #1549): 12 s at rank 12, on the skill. Its "ends if you use a
  // ranged attack skill" is left out.
  flail: define("flail", "Flail", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    moveSpeedMultiplier: 0.67,
  }),
  // "For 20 seconds, you have an additional 90...300 Health and an
  // additional 20 armor" (PvP, #1549): 258, its rank-12 value.
  "defy-pain": define("defy-pain", "Defy Pain", "stance", {
    profession: "warrior",
    maxHealthBonus: 258,
    armorModifier: 20,
  }),
  // "For 8 seconds, while you have a sword equipped, you block the next
  // melee attack against you and your attacker is struck for 20...80
  // damage" (#1549): 68, its rank-12 value. The sword is checked on use.
  // Any status's block of a melee attack fires it, and it ends.
  riposte: define("riposte", "Riposte", "skill-effect", {
    profession: "warrior",
    block: { chance: 1, against: "melee" },
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-blocks",
        blocked: "melee",
        target: "offender",
        effects: [{ kind: "damage", amount: { flat: 68 }, type: "typeless", armorPenetration: 0 }],
        skillId: "warrior.riposte",
      },
    ],
  }),
  // As Riposte, but "your attacker is struck for 15...90 damage and begins
  // Bleeding for 3...25 seconds" (#1549): 75 and 21 s at rank 12.
  "deadly-riposte": define("deadly-riposte", "Deadly Riposte", "skill-effect", {
    profession: "warrior",
    block: { chance: 1, against: "melee" },
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-blocks",
        blocked: "melee",
        target: "offender",
        effects: [
          { kind: "damage", amount: { flat: 75 }, type: "typeless", armorPenetration: 0 },
          { kind: "apply-status", statusId: "bleeding", durationSeconds: 21 },
        ],
        skillId: "warrior.deadly-riposte",
      },
    ],
  }),
  // "For 5...13 seconds, these allies move 33% faster" (#1549): 11 s at
  // rank 12, on the skill.
  charge: define("charge", '"Charge!"', "shout", {
    profession: "warrior",
    moveSpeedMultiplier: 1.33,
  }),
  // "For 5...15 seconds, you move 25% faster. Enraging Charge ends when you
  // successfully strike a target, at which point you gain 0...3 strikes of
  // adrenaline if you hit with a melee attack" (#1549): 2 strikes at rank
  // 12 (2.4). A bow hit ends it with none.
  "enraging-charge": define("enraging-charge", "Enraging Charge", "stance", {
    profession: "warrior",
    moveSpeedMultiplier: 1.25,
    endsWhenBearerHits: true,
    triggers: [
      {
        on: "bearer-hits",
        weapon: "melee",
        effects: [{ kind: "adrenaline-gain", strikes: 2 }],
        target: "bearer",
        skillId: "warrior.enraging-charge",
      },
    ],
  }),
  // "For 5...11 seconds, while wielding a shield, the next melee attack
  // skill used against you is blocked, your attacker is knocked down, and
  // that skill is disabled for an additional 15 seconds" (#1592): 10 s at
  // rank 12, on the skill. The shield is checked on use. Any melee attack,
  // a plain swing too, and no disable: a block trigger knows no skill.
  "shield-bash": define("shield-bash", "Shield Bash", "skill-effect", {
    profession: "warrior",
    block: { chance: 1, against: "melee" },
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-blocks",
        blocked: "melee",
        target: "offender",
        effects: [{ kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS }],
        skillId: "warrior.shield-bash",
      },
    ],
  }),
  // "For 1...6 seconds, while using a shield, you have a 75% chance to
  // block incoming attacks, and damage is reduced by 2 for each rank of
  // Strength (maximum 15 damage reduction)" (#1592): 5 s at rank 12, on
  // the skill. The shield is checked on use.
  "shield-stance": define("shield-stance", "Shield Stance", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    damageReductionPerRank: { attributeId: "warrior.strength", perRank: 2, max: 15 },
  }),
  // "For 8 seconds, whenever you use an adrenal skill, that skill recharges
  // for 3 seconds" (#1592).
  "rage-of-the-ntouka": define("rage-of-the-ntouka", "Rage of the Ntouka", "skill-effect", {
    profession: "warrior",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { adrenal: true },
        target: "bearer",
        effects: [{ kind: "lengthen-recharge", of: "target-last-skill", seconds: { flat: 3 } }],
        skillId: "warrior.rage-of-the-ntouka",
      },
    ],
  }),
  "healing-signet-armor": define("healing-signet-armor", "Healing Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: -40,
  }),
  // Staples (#1869). "For 8 seconds, you have a 75% chance to block
  // incoming attacks, but take double damage": all damage, from anyone.
  "frenzied-defense": define("frenzied-defense", "Frenzied Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    damageTakenMultiplier: 2,
  }),
  // "For 5 seconds, your attack rate is increased by 33%, but you deal 25%
  // less damage": the weapon roll, as Weakness's; a skill's bonus is not
  // scaled.
  flurry: define("flurry", "Flurry", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    weaponDamageMultiplier: 0.75,
  }),
  // "Your next 1...13...16 attacks deal +5 damage" (#1916): a hit, a miss
  // and a block each spend one, and nothing else ends it.
  "signet-of-strength": define("signet-of-strength", "Signet of Strength", "skill-effect", {
    profession: "warrior",
    attackDamageDelta: 5,
    endsAfterAttackCount: 13,
  }),
  // "For 1...6 seconds, you block any attack skills used against you. For
  // each successful block, you gain adrenaline and 5 Energy. Wary Stance
  // ends if you use a skill" (#1978): 1 strike a block. A plain swing is
  // not an attack skill, and is not blocked.
  "wary-stance": define("wary-stance", "Wary Stance", "stance", {
    profession: "warrior",
    block: { chance: 1, against: "all", attackSkillsOnly: true },
    endsWhenBearerUsesSkill: true,
    triggers: [
      {
        on: "bearer-blocks",
        target: "bearer",
        effects: [
          { kind: "adrenaline-gain", strikes: 1 },
          { kind: "energy-gain", amount: { flat: 5 } },
        ],
        skillId: "warrior.wary-stance",
      },
    ],
  }),
  // "For 1...6 seconds, you have a 75% chance to block attacks while under
  // the effects of a shout or chant. You gain 1 strike of adrenaline for
  // each blocked attack" (#1978). The shout ending stops the block, not
  // the stance.
  "soldiers-defense": define("soldiers-defense", "Soldier's Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    blockWhileUnder: { categories: ["shout", "chant"], statusIds: [] },
    triggers: [
      {
        on: "bearer-blocks",
        target: "bearer",
        effects: [{ kind: "adrenaline-gain", strikes: 1 }],
        skillId: "warrior.soldiers-defense",
      },
    ],
  }),
  // "For 1...5 seconds, you have a 75% chance to block melee and projectile
  // attacks. When Defensive Stance ends, you gain one strike of adrenaline
  // for each melee attack skill you have (maximum 0...4)" (#1978): at most
  // 3, its rank-12 value. Bow attacks and a thrown spear are not melee.
  "defensive-stance": define("defensive-stance", "Defensive Stance", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "adrenaline-gain", strikes: 1, perOwnMeleeAttackSkill: { max: 3 } }],
        skillId: "warrior.defensive-stance",
      },
    ],
  }),
  // "For 8 seconds, the next attack against you is blocked. You gain 1...4
  // strikes of adrenaline when this stance ends" (#1978): 3, its rank-12
  // value. An unblockable attack still spends it, and any end pays.
  "auspicious-parry": define("auspicious-parry", "Auspicious Parry", "stance", {
    profession: "warrior",
    block: { chance: 1, against: "all" },
    endsAfterAttacks: 1,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "adrenaline-gain", strikes: 3 }],
        skillId: "warrior.auspicious-parry",
      },
    ],
  }),
};
