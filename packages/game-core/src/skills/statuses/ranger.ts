import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type RangerStatusId =
  | "regeneration"
  | "natural-stride"
  | "lightning-reflexes"
  | "escape"
  // Preparations.
  | "apply-poison"
  // Spirits' auras (#1064), worn while in a spirit's range.
  | "winnowing"
  // Ranger calls and bonds on a pet (#1108).
  | "call-of-haste"
  | "call-of-protection"
  | "symbiotic-bond"
  // Infuriating Heat (#1540).
  | "infuriating-heat";

export const RANGER_STATUSES: Readonly<Record<RangerStatusId, StatusDefinition>> = {
  // Troll Unguent's (a ranger skill), though it is an enchantment here.
  regeneration: define("regeneration", "Regeneration", "enchantment", {
    profession: "ranger",
    healthPips: 4,
  }),
  // "For 1...7...8 seconds, you run 33% faster and have a 50% chance to
  // block incoming attacks. Natural Stride ends if you become Hexed or
  // Enchanted."
  "natural-stride": define("natural-stride", "Natural Stride", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerGains: ["hex", "enchantment"],
  }),
  // "For 5...10...11 seconds, you have a 75% chance to block melee and
  // projectile attacks, and you attack 33% faster" (#976).
  "lightning-reflexes": define("lightning-reflexes", "Lightning Reflexes", "stance", {
    profession: "ranger",
    block: { chance: 0.75, against: "all" },
    attackDurationMultiplier: 0.67,
  }),
  // "For 1...7...8 seconds, you move 33% faster and have a 75% chance to
  // block attacks. Escape ends if you make a melee attack." (#976, PvP)
  escape: define("escape", "Escape", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.75, against: "all" },
    endsWhenBearerAttacksInMelee: true,
  }),
  // What a spirit projects on whoever is in its range (#1064): worn while
  // there, never stripped, only escaped. "Non-spirit creatures within
  // range take 4 additional damage whenever they take physical damage."
  winnowing: define("winnowing", "Winnowing", "skill-effect", {
    profession: "ranger",
    physicalDamageTakenBonus: 4,
  }),
  // Calls and a bond on a Ranger's pet (#1108), at rank 12. Call of
  // Haste: "25% faster attack speed and moves 25% faster".
  "call-of-haste": define("call-of-haste", "Call of Haste", "shout", {
    profession: "ranger",
    moveSpeedMultiplier: 1.25,
    attackDurationMultiplier: 0.75,
  }),
  // Call of Protection: "5...17...20 base damage reduction".
  "call-of-protection": define("call-of-protection", "Call of Protection", "shout", {
    profession: "ranger",
    damageReduction: 17,
  }),
  // Symbiotic Bond: "+1...3...3 health regeneration, and half of any
  // physical damage dealt to your animal companion is redirected to you".
  "symbiotic-bond": define("symbiotic-bond", "Symbiotic Bond", "shout", {
    profession: "ranger",
    healthPips: 3,
    redirectsPhysicalDamage: 0.5,
  }),

  // "Enemies struck by your physical attacks become poisoned for
  // 3...13...15 seconds": 13 s, its rank-12 value.
  "apply-poison": define("apply-poison", "Apply Poison", "preparation", {
    profession: "ranger",
    onAttackHit: {
      attackSkillsOnly: false,
      effects: [{ kind: "apply-status", statusId: "poison", durationSeconds: 13 }],
      skillId: "ranger.apply-poison",
    },
  }),
  // Infuriating Heat (#1540), at its rank-12 value.
  // The spirit's aura, PvP: "Non-spirit creatures within its range gain
  // adrenaline 33...66% as fast": 59% faster.
  "infuriating-heat": define("infuriating-heat", "Infuriating Heat", "skill-effect", {
    profession: "ranger",
    adrenalineGainFaster: 0.59,
  }),
};
