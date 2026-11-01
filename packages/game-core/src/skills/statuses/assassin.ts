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
  | "mark-of-death"
  // Shadow Prison (#1551).
  | "shadow-prison"
  // Assassin staples 5 (#1757).
  | "siphon-speed"
  | "siphon-speed-haste"
  | "way-of-the-fox"
  | "assassins-promise"
  // Shadow Step and return (#1826).
  | "shadow-fang"
  | "aura-of-displacement"
  | "shadow-meld"
  | "shadow-of-haste"
  // Shadow step 2 (#1930).
  | "recall"
  | "dark-prison"
  | "shadow-walk"
  // PvP forms (#1951).
  | "shadow-form"
  // Enchantment party moves (#1975).
  | "dark-apostasy"
  // Take what another has (#1965).
  | "mirrored-stance";

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
            effects: [{ kind: "heal", amount: { flat: 88 } }],
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
  // "For 1...7 seconds, that foe moves 66% slower" (#1551): 6 s.
  "shadow-prison": define("shadow-prison", "Shadow Prison", "hex", {
    profession: "assassin",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 5...15 seconds, target foe moves 33% slower and you move 33%
  // faster" (#1757): the foe's half; the 13 s are the skill's.
  "siphon-speed": define("siphon-speed", "Siphon Speed", "hex", {
    profession: "assassin",
    moveSpeedMultiplier: 0.67,
  }),
  // Siphon Speed's caster half (#1757), its own status: it stays when the
  // hex is removed.
  "siphon-speed-haste": define("siphon-speed-haste", "Siphon Speed", "skill-effect", {
    profession: "assassin",
    moveSpeedMultiplier: 1.33,
  }),
  // "For 10...35 seconds, your next 1...6 attacks cannot be blocked"
  // (#1757): 5, its rank-12 value; the 30 s are the skill's.
  "way-of-the-fox": define("way-of-the-fox", "Way of the Fox", "enchantment", {
    profession: "assassin",
    unblockableAttacks: 5,
  }),
  // "...if target foe dies, you gain 5...20 Energy and all your skills are
  // recharged" (#1762): 17, this one included, as the wiki notes.
  "assassins-promise": define("assassins-promise", "Assassin's Promise", "hex", {
    profession: "assassin",
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          { kind: "energy-gain", amount: { flat: 17 } },
          { kind: "recharge-others", which: "all" },
        ],
        target: "source",
        skillId: "assassin.assassins-promise",
      },
    ],
  }),
  // "For 10 seconds, this hex does nothing. When this hex ends, you return
  // to your original location and that foe suffers from a Deep Wound for
  // 5...17...20 seconds" (#1826). Any end, a removal included.
  "shadow-fang": define("shadow-fang", "Shadow Fang", "hex", {
    profession: "assassin",
    returnsSource: { skillId: "assassin.shadow-fang", recastKeepsPoint: false },
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
        skillId: "assassin.shadow-fang",
      },
    ],
  }),
  // "When you stop maintaining Aura of Displacement you return to your
  // original location" (#1826): worn by its caster.
  "aura-of-displacement": define("aura-of-displacement", "Aura of Displacement", "enchantment", {
    profession: "assassin",
    returnsSource: { skillId: "assassin.aura-of-displacement", recastKeepsPoint: false },
  }),
  // "When you stop maintaining this enchantment, you return to your
  // original location" (#1826): worn by its caster.
  "shadow-meld": define("shadow-meld", "Shadow Meld", "enchantment", {
    profession: "assassin",
    returnsSource: { skillId: "assassin.shadow-meld", recastKeepsPoint: false },
  }),
  // "You move 15% faster than normal. When Shadow of Haste ends, you
  // Shadow Step to your original location" (#1826).
  "shadow-of-haste": define("shadow-of-haste", "Shadow of Haste", "stance", {
    profession: "assassin",
    moveSpeedMultiplier: 1.15,
    returnsSource: { skillId: "assassin.shadow-of-haste", recastKeepsPoint: false },
  }),
  // "When Recall ends, you Shadow Step to the ally you targeted when you
  // activated this skill, and all of your skills are disabled for 3
  // seconds" (#1930): maintained on its caster, and ended by that ally
  // leaving compass range.
  recall: define("recall", "Recall", "enchantment", {
    profession: "assassin",
    stepsToTarget: { skillId: "assassin.recall", disableSeconds: 3 },
  }),
  // "For 1...6 seconds, that foe moves 33% slower" (#1930): 5 s.
  "dark-prison": define("dark-prison", "Dark Prison", "hex", {
    profession: "assassin",
    moveSpeedMultiplier: 0.67,
  }),
  // "For 15 seconds, nothing happens. When this stance ends, you return to
  // your original location" (#1930).
  "shadow-walk": define("shadow-walk", "Shadow Walk", "stance", {
    profession: "assassin",
    returnsSource: { skillId: "assassin.shadow-walk", recastKeepsPoint: true },
  }),
  // PvP: "For 5...15 seconds, all hostile spells that target you fail and
  // all attacks against you miss. When Shadow Form ends, lose all but
  // 5...50 Health" (#1951): 41. Any end, a strip included; a dead bearer
  // loses nothing.
  "shadow-form": define("shadow-form", "Shadow Form", "enchantment", {
    profession: "assassin",
    foeSpellsFail: true,
    attacksAgainstMiss: true,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "lose-health-to", keep: { flat: 41 } }],
        target: "bearer",
        skillId: "assassin.shadow-form",
      },
    ],
  }),
  // "For 3...17 seconds, every time you successfully land a critical hit,
  // you remove one enchantment from your target. If you remove an
  // enchantment in this way, you lose 10...3 Energy or Dark Apostasy ends"
  // (#1975): 4 at rank 12.
  "dark-apostasy": define("dark-apostasy", "Dark Apostasy", "enchantment", {
    profession: "assassin",
    onCriticalHit: {
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }],
      energyIfRemoved: 4,
      skillId: "assassin.dark-apostasy",
    },
  }),
  // "For 10...35 seconds, whenever target foe enters a stance, you enter
  // the same stance" (#1965): 30. Only the stance itself, at the foe's
  // ranks; nothing else the foe's skill does.
  "mirrored-stance": define("mirrored-stance", "Mirrored Stance", "hex", {
    profession: "assassin",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "stance" },
        effects: [{ kind: "mirror-stance" }],
        target: "source",
        skillId: "assassin.mirrored-stance",
      },
    ],
  }),
};
