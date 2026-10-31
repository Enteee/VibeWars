import { AREA_ADJACENT, AREA_IN_THE_AREA } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import type { DamageEffect } from "../types.js";
import { define } from "./define.js";

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
  | "corrupt-enchantment";

/** Spiteful Spirit's damage, on its bearer and each ally beside it (#935). */
const SPITEFUL_SPIRIT_DAMAGE: DamageEffect = {
  kind: "damage",
  amount: { flat: 39 },
  type: "shadow",
  armorPenetration: 0,
};

export const NECROMANCER_STATUSES: Readonly<Record<NecromancerStatusId, StatusDefinition>> = {
  // Faintheartedness at rank 12: attacks 50% slower, −2 pips (GW1 PvP).
  faintheartedness: define("faintheartedness", "Faintheartedness", "hex", {
    profession: "necromancer",
    healthPips: -2,
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
        effects: [{ kind: "heal", amount: { flat: 102 }, perStatusOnTarget: [] }],
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
  // "...takes 4...16 more damage when hit by physical damage" (#1332): 14,
  // its rank-12 value.
  barbs: define("barbs", "Barbs", "hex", {
    profession: "necromancer",
    physicalDamageTakenBonus: 14,
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
};
