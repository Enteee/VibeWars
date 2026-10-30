import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type AssassinStatusId =
  | "shadow-refuge"
  | "shroud-of-distress"
  | "dash"
  | "dark-escape"
  | "critical-eye"
  | "critical-defenses"
  // Shadow Arts (#1326).
  | "feigned-neutrality"
  | "way-of-perfection"
  // Assassin Deadly Arts (#1234).
  | "shroud-of-silence"
  | "expose-defenses"
  | "enduring-toxin"
  | "mark-of-death";

export const ASSASSIN_STATUSES: Readonly<Record<AssassinStatusId, StatusDefinition>> = {
  // "For 6 seconds, you gain 5...9...10 Health regeneration. When Shadow
  // Refuge ends, you gain 40...88...100 Health if you are attacking" (#988).
  // Any end, a strip included: GW1 says "ends", not "expires".
  "shadow-refuge": define("shadow-refuge", "Shadow Refuge", "enchantment", {
    profession: "assassin",
    healthPips: 9,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "if",
            condition: { kind: "target-attacking" },
            effects: [{ kind: "heal", amount: { flat: 88 }, perStatusOnTarget: [] }],
          },
        ],
        target: "bearer",
        skillId: "assassin.shadow-refuge",
      },
    ],
  }),
  // "For 30...54...60 seconds, if you are below 50% Health, you have a 75%
  // chance to block attacks" (#988), read at each block roll.
  "shroud-of-distress": define("shroud-of-distress", "Shroud of Distress", "enchantment", {
    profession: "assassin",
    block: { chance: 0.75, against: "all" },
    blockBelowHealth: 0.5,
  }),
  dash: define("dash", "Dash", "stance", { profession: "assassin", moveSpeedMultiplier: 1.5 }),
  // "For 5...13...15 seconds, you move 25% faster and take half damage.
  // Dark Escape ends if you successfully hit with an attack."
  "dark-escape": define("dark-escape", "Dark Escape", "stance", {
    profession: "assassin",
    moveSpeedMultiplier: 1.25,
    damageTakenMultiplier: 0.5,
    endsWhenBearerHits: true,
  }),
  // "For 10...30...35 seconds, you have an additional 3...13...15% chance
  // to land a critical hit when attacking. You gain 1 Energy whenever you
  // score a critical hit" (#988). A skill effect: no strip removes it.
  "critical-eye": define("critical-eye", "Critical Eye", "skill-effect", {
    profession: "assassin",
    criticalChanceBonus: 0.13,
    energyPerCritical: 1,
  }),
  // "For 4...10 seconds, you have +7 Health regeneration and +80 armor.
  // This enchantment ends if you successfully hit with an attack or use a
  // skill" (#1326): 9 s at rank 12. Its own cast is no use of a skill,
  // since it is applied after the use.
  "feigned-neutrality": define("feigned-neutrality", "Feigned Neutrality", "enchantment", {
    profession: "assassin",
    healthPips: 7,
    armorModifier: 80,
    endsWhenBearerHits: true,
    endsWhenBearerUsesSkill: true,
  }),
  // "For 60 seconds, whenever you successfully land a critical hit, you
  // gain 10...40 Health" (#1326): 34 at rank 12.
  "way-of-perfection": define("way-of-perfection", "Way of Perfection", "enchantment", {
    profession: "assassin",
    healthPerCritical: 34,
  }),
  // "For 4...10 seconds, you have a 75% chance to block. Critical Defenses
  // refreshes every time you land a critical hit" (#1315).
  "critical-defenses": define("critical-defenses", "Critical Defenses", "enchantment", {
    profession: "assassin",
    block: { chance: 0.75, against: "all" },
    refreshesOnCritical: true,
  }),

  // Assassin Deadly Arts (#1234), each at its rank-12 values.
  // "For 1...6 seconds, target touched foe cannot cast spells."
  "shroud-of-silence": define("shroud-of-silence", "Shroud of Silence", "hex", {
    profession: "assassin",
    preventsSpells: true,
  }),
  // "For 1...11 seconds, target foe cannot block your attacks."
  "expose-defenses": define("expose-defenses", "Expose Defenses", "hex", {
    profession: "assassin",
    unblockableBySource: true,
  }),
  // "For 5 seconds, target foe suffers -1...5 Health degeneration. If that
  // foe is moving when Enduring Toxin would end, Enduring Toxin is renewed
  // for another 5 seconds."
  "enduring-toxin": define("enduring-toxin", "Enduring Toxin", "hex", {
    profession: "assassin",
    healthPips: -4,
    renewsWhileMoving: 5,
  }),
  // "For 4...10 seconds, target foe gains 50% less benefit from healing."
  "mark-of-death": define("mark-of-death", "Mark of Death", "hex", {
    profession: "assassin",
    healingMultiplier: 0.5,
  }),
};
