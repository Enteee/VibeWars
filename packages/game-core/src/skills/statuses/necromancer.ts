import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition, StatusTrigger } from "../status.js";
import type { DamageEffect } from "../types.js";
import { define, ownSkills } from "./define.js";

export type NecromancerStatusId =
  // Hexes / enchantments implemented so far.
  | "faintheartedness"
  | "malaise"
  | "parasitic-bond"
  | "contagion"
  | "shadow-of-fear"
  | "spiteful-spirit"
  | "insidious-parasite"
  | "mark-of-pain"
  | "blood-ritual"
  // Wells' auras (#1104), worn while inside a well.
  | "well-of-suffering"
  | "well-of-blood"
  | "well-of-power"
  | "well-of-weariness"
  // Wells 2 (#1732).
  | "well-of-the-profane"
  | "well-of-silence"
  | "well-of-darkness"
  | "well-of-ruin"
  // Necromancer Curses hexes (#1332).
  | "barbs"
  | "price-of-failure"
  | "suffering"
  | "defile-flesh"
  | "rigor-mortis"
  | "lingering-curse"
  // Hex and enchantment gain triggers (#1403).
  | "soul-barbs"
  | "defile-defenses"
  // Necromancer and Elementalist staples (#1540).
  | "blood-is-power"
  | "order-of-pain"
  // Necromancer staples 2 (#1583).
  | "wither"
  | "life-siphon"
  | "life-siphon-regen"
  | "reckless-haste"
  | "corrupt-enchantment"
  | "reapers-mark"
  | "putrid-bile"
  | "icy-veins"
  // Caster staples (#1870).
  | "blood-renewal"
  | "meekness"
  // Caster staples 2 (#1872).
  | "vocal-minority"
  // Skill-type and heal triggers (#1913).
  | "cacophony"
  | "soul-bind"
  // Minions 3 (#1915).
  | "order-of-undeath"
  | "aura-of-the-lich"
  | "infuse-condition"
  // Casting-state hexes (#1931).
  | "spinal-shivers"
  | "shivers-of-dread"
  | "death-nova"
  | "wail-of-doom"
  | "atrophy"
  // Blood Magic orders and leeches (#1979).
  | "order-of-the-vampire"
  | "dark-fury"
  | "awaken-the-blood"
  | "soul-leech"
  // Enchantment party moves (#1975).
  | "order-of-apostasy"
  | "jaundiced-gaze";

/** Spiteful Spirit's damage, on its bearer and each ally beside it (#935). */
const SPITEFUL_SPIRIT_DAMAGE: DamageEffect = {
  kind: "damage",
  amount: { flat: 39 },
  type: "shadow",
  armorPenetration: 0,
};

/**
 * Spinal Shivers' answer (#1931), and its Factions copy's: a cold hit
 * while the bearer uses a skill costs the hex's caster 4 Energy, or ends
 * the hex, and interrupts that skill.
 */
function shivers(skillId: string): StatusTrigger {
  return {
    on: "bearer-takes-damage-from-foe",
    damageType: "cold",
    whileUsingSkill: true,
    effects: [
      { kind: "pay-energy-or-end", amount: 4 },
      { kind: "interrupt", only: "skill" },
    ],
    target: "bearer",
    skillId,
  };
}

export const NECROMANCER_STATUSES: Readonly<Record<NecromancerStatusId, StatusDefinition>> = {
  // Faintheartedness (GW1 PvP): attacks 50% slower, −0...2 pips at the
  // caster's Curses (#1976).
  faintheartedness: define("faintheartedness", "Faintheartedness", "hex", {
    profession: "necromancer",
    healthPips: { scaling: { attributeId: "necromancer.curses", atZero: 0, atTwelve: -2 } },
    attackDurationMultiplier: 1.5,
  }),
  malaise: define("malaise", "Malaise", "hex", {
    profession: "necromancer",
    energyPips: -1,
  }),
  // "For 20 seconds, target foe suffers health degeneration of 1. The
  // caster is healed for 30...102...120 when Parasitic Bond ends": 102,
  // its rank-12 value.
  "parasitic-bond": define("parasitic-bond", "Parasitic Bond", "hex", {
    profession: "necromancer",
    healthPips: -1,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 102 } }],
        target: "source",
        skillId: "necromancer.parasitic-bond",
      },
    ],
  }),
  // "For 60 seconds, whenever you suffer from a new Condition, all foes in
  // the area suffer from that same Condition and you sacrifice
  // 10...6...5% maximum Health": 6%, its rank-12 value.
  contagion: define("contagion", "Contagion", "enchantment", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-gains-condition",
        effects: [
          { kind: "spread-gained-condition", radius: AREA_IN_THE_AREA },
          { kind: "sacrifice-health", percentOfMax: 6 },
        ],
        target: "bearer",
        skillId: "necromancer.contagion",
      },
    ],
  }),
  // "...attack 50% slower": Faintheartedness's slow without its degeneration (#918).
  "shadow-of-fear": define("shadow-of-fear", "Shadow of Fear", "hex", {
    profession: "necromancer",
    attackDurationMultiplier: 1.5,
  }),
  // "Whenever target foe attacks or uses a skill, Spiteful Spirit deals
  // 15...39...45 shadow damage to that foe and all adjacent allies of that
  // foe" (#935): 39, its rank-12 value. An attack skill is both, so twice.
  "spiteful-spirit": define("spiteful-spirit", "Spiteful Spirit", "hex", {
    profession: "necromancer",
    triggers: (["bearer-uses-skill", "bearer-attacks"] as const).map((on) => ({
      on,
      effects: [
        SPITEFUL_SPIRIT_DAMAGE,
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [SPITEFUL_SPIRIT_DAMAGE],
        },
      ],
      target: "bearer",
      skillId: "necromancer.spiteful-spirit",
    })),
  }),
  // "Whenever target foe hits with an attack, you steal 15...39...45
  // health from that foe" (#935): 39, its rank-12 value.
  "insidious-parasite": define("insidious-parasite", "Insidious Parasite", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "life-steal", amount: { flat: 39 } }],
        target: "bearer",
        skillId: "necromancer.insidious-parasite",
      },
    ],
  }),
  // "Whenever target foe takes physical damage, Mark of Pain deals
  // 10...34...40 shadow damage to adjacent foes" (#935): 34, its rank-12
  // value, on the bearer's allies beside it, never the bearer.
  "mark-of-pain": define("mark-of-pain", "Mark of Pain", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-takes-physical-damage",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 34 }, type: "shadow", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "necromancer.mark-of-pain",
      },
    ],
  }),
  "blood-ritual": define("blood-ritual", "Blood Ritual", "enchantment", {
    profession: "necromancer",
    energyPips: 3,
  }),
  // What a well projects on the foes inside it (#1104), at rank 12, as
  // statuses carry fixed numbers: "foes in that area suffer health
  // degeneration of -1...5...6".
  "well-of-suffering": define("well-of-suffering", "Well of Suffering", "skill-effect", {
    profession: "necromancer",
    healthPips: -5,
  }),
  // Wells 2 (#1732), at rank 12 as Well of Suffering's: "foes in that area
  // are stripped of all enchantments and cannot be the target of further
  // enchantments".
  "well-of-the-profane": define("well-of-the-profane", "Well of the Profane", "skill-effect", {
    profession: "necromancer",
    preventsEnchantments: true,
  }),
  // "Foes within the well cannot use shouts or chants and suffer -1...4
  // Health degeneration": 3.
  "well-of-silence": define("well-of-silence", "Well of Silence", "skill-effect", {
    profession: "necromancer",
    healthPips: -3,
    preventsShoutsAndChants: true,
  }),
  // "Hexed foes within the Well of Darkness miss 50% of the time."
  "well-of-darkness": define("well-of-darkness", "Well of Darkness", "skill-effect", {
    profession: "necromancer",
    whileUnder: {
      categories: ["hex"],
      statusIds: [],
      attackDurationMultiplier: 1,
      adrenalineGainFaster: 0,
      healthPips: 0,
      armorModifier: 0,
      attackMissChance: 0.5,
    },
  }),
  // "...whenever a foe in the well takes physical damage, that foe has
  // Cracked Armor for 5...20 seconds": 17, each hit renewing it.
  "well-of-ruin": define("well-of-ruin", "Well of Ruin", "skill-effect", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-takes-physical-damage",
        effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 }],
        target: "bearer",
        skillId: "necromancer.well-of-ruin",
      },
    ],
  }),
  // "Allies in that area receive +1...6 Health regeneration" (#1730): 5
  // at rank 12.
  "well-of-blood": define("well-of-blood", "Well of Blood", "skill-effect", {
    profession: "necromancer",
    healthPips: 5,
  }),
  // "...+1...6 Health regeneration and +2 Energy regeneration" (#1730).
  "well-of-power": define("well-of-power", "Well of Power", "skill-effect", {
    profession: "necromancer",
    healthPips: 5,
    energyPips: 2,
  }),
  // "Enemies within the Well of Weariness suffer -1 Energy degeneration" (#1730).
  "well-of-weariness": define("well-of-weariness", "Well of Weariness", "skill-effect", {
    profession: "necromancer",
    energyPips: -1,
  }),
  // "...takes 4...16 more damage when hit by physical damage" (#1332), at
  // the caster's Curses (#1976).
  barbs: define("barbs", "Barbs", "hex", {
    profession: "necromancer",
    physicalDamageTakenBonus: {
      scaling: { attributeId: "necromancer.curses", atZero: 4, atTwelve: 13.6 },
    },
  }),
  // "...has a 25% chance to miss with attacks and takes 1...46 damage
  // whenever that foe fails to hit in combat" (#1332): 37, its rank-12
  // value.
  "price-of-failure": define("price-of-failure", "Price of Failure", "hex", {
    profession: "necromancer",
    attackMissChance: 0.25,
    triggers: [
      {
        on: "bearer-fails-to-hit",
        effects: [{ kind: "damage", amount: { flat: 37 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.price-of-failure",
      },
    ],
  }),
  // "...suffer -0...3 Health degeneration" (#1332): 2, its rank-12 value.
  suffering: define("suffering", "Suffering", "hex", {
    profession: "necromancer",
    healthPips: -2,
  }),
  // "...gains only two-thirds Health from healing" (#1332).
  "defile-flesh": define("defile-flesh", "Defile Flesh", "hex", {
    profession: "necromancer",
    healingMultiplier: 2 / 3,
  }),
  // "...cannot block" (#1332).
  "rigor-mortis": define("rigor-mortis", "Rigor Mortis", "hex", {
    profession: "necromancer",
    preventsBlocking: true,
  }),
  // "...suffer -1...4 Health degeneration, and receive 25% less benefit
  // from healing" (#1332): 3, its rank-12 value.
  "lingering-curse": define("lingering-curse", "Lingering Curse", "hex", {
    profession: "necromancer",
    healthPips: -3,
    healingMultiplier: 0.75,
  }),
  // "...takes 15...30 damage when an enchantment or hex is cast on that
  // target" (#1403): 27, its rank-12 value. A renewal counts (GW1 wiki).
  "soul-barbs": define("soul-barbs", "Soul Barbs", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-gains-hex-or-enchantment",
        effects: [{ kind: "damage", amount: { flat: 27 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.soul-barbs",
      },
    ],
  }),
  // "...the next time target foe blocks, that foe takes 30...120 damage"
  // (#1403): 102, its rank-12 value. Any block, by any status.
  "defile-defenses": define("defile-defenses", "Defile Defenses", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-blocks",
        effects: [{ kind: "damage", amount: { flat: 102 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.defile-defenses",
      },
    ],
    endsWhenTriggered: true,
  }),
  // Necromancer and Elementalist staples (#1540), at their rank-12 values.
  // "For 10 seconds, target other ally gains +3...6 Energy regeneration": 5.
  "blood-is-power": define("blood-is-power", "Blood is Power", "enchantment", {
    profession: "necromancer",
    energyPips: 5,
  }),
  // "For 5 seconds, whenever a party member hits a foe with physical
  // damage, that party member does +3...16 damage": 13, on each hit.
  "order-of-pain": define("order-of-pain", "Order of Pain", "enchantment", {
    profession: "necromancer",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [{ kind: "damage", amount: { flat: 13 }, type: "typeless", armorPenetration: 1 }],
      skillId: "necromancer.order-of-pain",
    },
  }),
  // Necromancer staples 2 (#1583), at their rank-12 values.
  // "...suffers -2...4 Health degeneration and -1 Energy degeneration. If
  // target foe's Energy reaches 0, that foe takes 15...75 damage and
  // Wither ends": 4 and 63.
  wither: define("wither", "Wither", "hex", {
    profession: "necromancer",
    healthPips: -4,
    energyPips: -1,
    triggers: [
      {
        on: "bearer-energy-empty",
        effects: [{ kind: "damage", amount: { flat: 63 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.wither",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "...target foe suffers -1...3 Health degeneration, and you gain
  // +1...3 Health regeneration": 3 each, the caster's its own status, so
  // it lasts its time when the hex is removed early.
  "life-siphon": define("life-siphon", "Life Siphon", "hex", {
    profession: "necromancer",
    healthPips: -3,
  }),
  "life-siphon-regen": define("life-siphon-regen", "Life Siphon", "skill-effect", {
    profession: "necromancer",
    healthPips: 3,
  }),
  // "...they attack 25% faster but have a 50% chance to miss with attacks."
  "reckless-haste": define("reckless-haste", "Reckless Haste", "hex", {
    profession: "necromancer",
    attackMissChance: 0.5,
    attackDurationMultiplier: 0.75,
  }),
  // "...that foe suffers from -1...8 Health degeneration for 10 seconds": 7.
  "corrupt-enchantment": define("corrupt-enchantment", "Corrupt Enchantment", "hex", {
    profession: "necromancer",
    healthPips: -7,
  }),
  // Death triggers (#1762), at their rank-12 values.
  // "...target foe suffers -1...5 Health degeneration. If that foe dies
  // while hexed with Reaper's Mark, you gain 5...15 Energy": 4 and 13.
  "reapers-mark": define("reapers-mark", "Reaper's Mark", "hex", {
    profession: "necromancer",
    healthPips: -4,
    triggers: [
      {
        on: "bearer-dies",
        effects: [{ kind: "energy-gain", amount: { flat: 13 } }],
        target: "source",
        skillId: "necromancer.reapers-mark",
      },
    ],
  }),
  // "...target foe suffers -1...3 Health degeneration. If that foe dies
  // while under the effects of this hex, all nearby foes take 25...85
  // damage": 3 and 73, to the caster's foes near the corpse.
  "putrid-bile": define("putrid-bile", "Putrid Bile", "hex", {
    profession: "necromancer",
    healthPips: -3,
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 73 }, type: "typeless", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "necromancer.putrid-bile",
      },
    ],
  }),
  // "...if target foe dies all nearby foes are struck for 20...110 cold
  // damage": 92.
  "icy-veins": define("icy-veins", "Icy Veins", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "damage", amount: { flat: 92 }, type: "cold", armorPenetration: 0 }],
          },
        ],
        target: "bearer",
        skillId: "necromancer.icy-veins",
      },
    ],
  }),
  // "For 7 seconds, you gain +3...5...6 Health regeneration. When Blood
  // Renewal ends, you gain 40...160...190 Health" (#1870): any end, a
  // strip included, as Shadow Refuge.
  "blood-renewal": define("blood-renewal", "Blood Renewal", "enchantment", {
    profession: "necromancer",
    healthPips: 5,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 160 } }],
        target: "bearer",
        skillId: "necromancer.blood-renewal",
      },
    ],
  }),
  // "For 5...25...30 seconds, target foe and all foes in the area attack
  // 50% slower" (#1870).
  meekness: define("meekness", "Meekness", "hex", {
    profession: "necromancer",
    attackDurationMultiplier: 1.5,
  }),
  // "Target foe and all nearby foes cannot use shouts or chants" (#1872).
  "vocal-minority": define("vocal-minority", "Vocal Minority", "hex", {
    profession: "necromancer",
    preventsShoutsAndChants: true,
  }),
  // "For 15 seconds, whenever target foe uses a shout or chant, that foe
  // takes 30...90...105 damage" (#1913): 90, its rank-12 value. One trigger
  // a type.
  cacophony: define("cacophony", "Cacophony", "hex", {
    profession: "necromancer",
    triggers: (["shout", "chant"] as const).map((type) => ({
      on: "bearer-uses-skill",
      usedSkill: { type },
      effects: [{ kind: "damage", amount: { flat: 90 }, type: "typeless", armorPenetration: 0 }],
      target: "bearer",
      skillId: "necromancer.cacophony",
    })),
  }),
  // "For 30 seconds, whenever target foe is healed by a skill, the healer
  // takes 20...68...80 damage" (#1913): 68, its rank-12 value. A healer on
  // the caster's own team takes none.
  "soul-bind": define("soul-bind", "Soul Bind", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-healed-by-skill",
        effects: [{ kind: "damage", amount: { flat: 68 }, type: "typeless", armorPenetration: 0 }],
        target: "healer",
        skillId: "necromancer.soul-bind",
      },
    ],
  }),
  // "For 5 seconds, your minions deal +3...13...16 damage. You lose 2%
  // maximum Health each time a minion hits" (#1915).
  "order-of-undeath": define("order-of-undeath", "Order of Undeath", "skill-effect", {
    profession: "necromancer",
    minionDamageBonus: 13,
    minionHitHealthLossPercent: 2,
  }),
  // "For 5...37...45 seconds, you have +1 Death Magic" (#1915).
  "aura-of-the-lich": define("aura-of-the-lich", "Aura of the Lich", "enchantment", {
    profession: "necromancer",
    attributeDeltas: [{ scope: { attributeId: "necromancer.death-magic" }, amount: 1 }],
  }),
  // "For 15...51...60 seconds, the next conditions you would receive are
  // transferred to your closest minion instead" (#1915).
  "infuse-condition": define("infuse-condition", "Infuse Condition", "enchantment", {
    profession: "necromancer",
    redirectsConditionsToMinion: true,
  }),
  // Casting-state hexes (#1931). "Whenever target foe is struck for cold
  // damage while using a skill, that skill is interrupted and you lose
  // 8...4...3 Energy or Spinal Shivers ends": 4, at rank 12. Several cold
  // packets in one tick answer once.
  "spinal-shivers": define("spinal-shivers", "Spinal Shivers", "hex", {
    profession: "necromancer",
    triggers: [shivers("necromancer.spinal-shivers")],
  }),
  // Factions' copy of Spinal Shivers, the same numbers.
  "shivers-of-dread": define("shivers-of-dread", "Shivers of Dread", "hex", {
    profession: "necromancer",
    triggers: [shivers("necromancer.shivers-of-dread")],
  }),
  // "If target ally dies, all adjacent foes take 26...85...100 damage and
  // are Poisoned for 15 seconds": 85, the caster's foes beside the corpse.
  "death-nova": define("death-nova", "Death Nova", "enchantment", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 85 }, type: "typeless", armorPenetration: 0 },
              { kind: "apply-status", statusId: "poison", durationSeconds: 15 },
            ],
          },
        ],
        target: "bearer",
        skillId: "necromancer.death-nova",
      },
    ],
  }),
  // "For 2...5...6 seconds, all of target foe's attributes are set to 0"
  // (#1929): runes and headgear still add theirs.
  "wail-of-doom": define("wail-of-doom", "Wail of Doom", "hex", {
    profession: "necromancer",
    attributeSet: { scope: "all", rank: 0, plusEquipment: true },
  }),
  // "For 3...6...7 seconds, target foe's primary attribute is reduced to 0"
  // (#1929).
  atrophy: define("atrophy", "Atrophy", "hex", {
    profession: "necromancer",
    attributeSet: { scope: "primary", rank: 0, plusEquipment: false },
  }),
  // Blood Magic orders and leeches (#1979), at their rank-12 values.
  // "For 5 seconds, whenever a party member who is not under the effects
  // of another Necromancer enchantment hits a foe with physical damage,
  // that party member steals up to 3...13...16 Health": the rider's
  // caster is the attacker, so the check reads the attacker's statuses.
  "order-of-the-vampire": define("order-of-the-vampire", "Order of the Vampire", "enchantment", {
    profession: "necromancer",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [
        {
          kind: "if",
          condition: {
            kind: "caster-lacks",
            category: "enchantment",
            profession: "necromancer",
            excluding: "order-of-the-vampire",
          },
          effects: [{ kind: "life-steal", amount: { flat: 13 } }],
        },
      ],
      skillId: "necromancer.order-of-the-vampire",
    },
  }),
  // "For 5 seconds, whenever a party member hits with an attack, that
  // party member gains one additional strike of adrenaline."
  "dark-fury": define("dark-fury", "Dark Fury", "enchantment", {
    profession: "necromancer",
    extraStrikesPerHit: 1,
  }),
  // "For 20...39...44 seconds, you have +2 Blood Magic and +2 Curses, and
  // any Health sacrifices you make are 50% larger."
  "awaken-the-blood": define("awaken-the-blood", "Awaken the Blood", "enchantment", {
    profession: "necromancer",
    attributeDeltas: [
      { scope: { attributeId: "necromancer.blood-magic" }, amount: 2 },
      { scope: { attributeId: "necromancer.curses" }, amount: 2 },
    ],
    sacrificeMultiplier: 1.5,
  }),
  // "For 10 seconds, whenever target foe casts a spell, you steal up to
  // 16...67...80 Health from that foe": the trigger's caster is the hex's
  // source, so the Necromancer steals.
  "soul-leech": define("soul-leech", "Soul Leech", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-casts-spell",
        target: "bearer",
        effects: [{ kind: "life-steal", amount: { flat: 67 } }],
        skillId: "necromancer.soul-leech",
      },
    ],
  }),
  // "For 5 seconds, whenever a party member hits a foe with physical
  // damage, that foe loses one enchantment. For each Monk enchantment
  // removed, you lose 10...3% maximum Health" (#1975): 4% at rank 12, the
  // Necromancer's, the status's source.
  "order-of-apostasy": define("order-of-apostasy", "Order of Apostasy", "enchantment", {
    profession: "necromancer",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }],
      skillId: "necromancer.order-of-apostasy",
      sourceLosesPerRemoved: { profession: "monk", percentOfMax: 4 },
    },
  }),
  // "...your next enchantment spell casts 0...1 seconds faster and costs
  // 1...10 less Energy" (#1975): 1 s and 8 at rank 12.
  "jaundiced-gaze": define("jaundiced-gaze", "Jaundiced Gaze", "enchantment", {
    profession: "necromancer",
    ownSkillModifiers: [
      ownSkills(
        { type: "enchantment" },
        { energyDiscount: 8, energyFloor: 0, activationSecondsLess: 1, uses: 1 },
      ),
    ],
  }),
};
