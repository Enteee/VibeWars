import { AREA_ADJACENT } from "../../distances.js";
import { gw1EnergyScaled } from "../../ruleset.js";
import type { StatusDefinition } from "../status.js";
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
  | "warriors-endurance";

export const WARRIOR_STATUSES: Readonly<Record<WarriorStatusId, StatusDefinition>> = {
  sprint: define("sprint", "Sprint", "stance", {
    profession: "warrior",
    moveSpeedMultiplier: 1.25,
  }),
  // "For 8 seconds, you attack 33% faster but take double damage": faster
  // is 1 − x (ADR-0029).
  frenzy: define("frenzy", "Frenzy", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    damageTakenMultiplier: 2,
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

  // "Watch Yourself!" at rank 12: +5...21 armor, ending after 1...3 attacks.
  "watch-yourself": define("watch-yourself", "Watch Yourself!", "shout", {
    profession: "warrior",
    armorModifier: 21,
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
  // "For 7...18 seconds you have an additional 90...300 Health" (#1359):
  // 258, its rank-12 value.
  "endure-pain": define("endure-pain", "Endure Pain", "skill-effect", {
    profession: "warrior",
    maxHealthBonus: 258,
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
  "healing-signet-armor": define("healing-signet-armor", "Healing Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: -40,
  }),
};
