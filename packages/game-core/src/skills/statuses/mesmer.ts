import { AREA_ADJACENT, AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type MesmerStatusId =
  | "backfire"
  | "empathy"
  | "diversion"
  | "arcane-echo"
  | "echo"
  | "mantra-of-recovery"
  // Mesmer Illusion Magic (#1228).
  | "conjure-phantasm"
  | "imagined-burden"
  | "phantom-pain"
  | "shrinking-armor"
  | "illusion-of-haste"
  | "ineptitude"
  | "crippling-anguish"
  | "hex-breaker"
  // Mesmer skill-use punishers (#1473).
  | "wastrels-worry"
  | "overload"
  | "frustration"
  | "price-of-pride"
  | "migraine"
  | "visions-of-regret"
  // Mesmer "the next spell fails" hexes (#1475).
  | "guilt"
  | "shame"
  | "mistrust"
  | "fragility"
  // Mesmer crowd punishers (#1501).
  | "panic"
  | "wastrels-demise"
  | "arcane-conundrum";

export const MESMER_STATUSES: Readonly<Record<MesmerStatusId, StatusDefinition>> = {
  // "Whenever target foe casts a spell, that foe takes 35...119...140
  // damage": 119, its rank-12 value.
  backfire: define("backfire", "Backfire", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [{ kind: "damage", amount: { flat: 119 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.backfire",
      },
    ],
  }),
  // "Whenever target foe attacks, that foe takes 15...39...45 damage"
  // (PvP): 39, its rank-12 value.
  empathy: define("empathy", "Empathy", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attacks",
        effects: [{ kind: "damage", amount: { flat: 39 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.empathy",
      },
    ],
  }),
  // "For 6 seconds, the next time target foe uses a skill, that skill
  // takes an additional 10...47...56 seconds to recharge" (#949): 47, its
  // rank-12 value.
  diversion: define("diversion", "Diversion", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "lengthen-recharge", of: "target-last-skill", seconds: { flat: 47 } }],
        target: "bearer",
        skillId: "mesmer.diversion",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "If you cast a spell in the next 20 seconds, Arcane Echo is replaced
  // with that spell for 20 seconds. Arcane Echo ends prematurely if you
  // use a non-spell skill" (#469).
  "arcane-echo": define("arcane-echo", "Arcane Echo", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "echo", spellsOnly: true, seconds: 20 }],
        target: "bearer",
        skillId: "mesmer.arcane-echo",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "For 30 seconds, Echo is replaced with the next skill you use. Echo
  // acts as this skill for 20 seconds" (#469).
  echo: define("echo", "Echo", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "echo", spellsOnly: false, seconds: 20 }],
        target: "bearer",
        skillId: "mesmer.echo",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "For 5...17...20 seconds, spells you cast recharge 33% faster" (#938).
  "mantra-of-recovery": define("mantra-of-recovery", "Mantra of Recovery", "stance", {
    profession: "mesmer",
    spellRechargeFaster: 0.33,
  }),

  // Mesmer Illusion Magic (#1228), each at its rank-12 values.
  // "...target foe experiences -5 Health degeneration."
  "conjure-phantasm": define("conjure-phantasm", "Conjure Phantasm", "hex", {
    profession: "mesmer",
    healthPips: -5,
  }),
  // "...target foe moves 50% slower": Crippled's slow, as a hex.
  "imagined-burden": define("imagined-burden", "Imagined Burden", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.5,
  }),
  // "For 10 seconds, target foe suffers -1...3...4 Health degeneration.
  // When Phantom Pain ends, that foe suffers a Deep Wound ... for
  // 5...17...20 seconds." Any end, a strip included.
  "phantom-pain": define("phantom-pain", "Phantom Pain", "hex", {
    profession: "mesmer",
    healthPips: -3,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
        skillId: "mesmer.phantom-pain",
      },
    ],
  }),
  // "For 10 seconds, target foe suffers from -1...3...4 Health
  // degeneration. When this hex ends, that foe has Cracked Armor for
  // 5...17...20 seconds." Any end, a strip included.
  "shrinking-armor": define("shrinking-armor", "Shrinking Armor", "hex", {
    profession: "mesmer",
    healthPips: -3,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 }],
        skillId: "mesmer.shrinking-armor",
      },
    ],
  }),
  // "...you move 33% faster. When Illusion of Haste ends, you become
  // Crippled for 3 seconds" (PvP). Any end, a strip included.
  "illusion-of-haste": define("illusion-of-haste", "Illusion of Haste", "enchantment", {
    profession: "mesmer",
    moveSpeedMultiplier: 1.33,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 3 }],
        skillId: "mesmer.illusion-of-haste",
      },
    ],
  }),
  // "For 4 seconds, the next time the target foe or any adjacent foe
  // attacks, they take 30...114...135 damage and are Blinded for 10
  // seconds": each foe it lands on bears its own, fired once by its own
  // attack. The damage is its caster's Illusion Magic, as the trigger's
  // caster is the hex's source.
  ineptitude: define("ineptitude", "Ineptitude", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attacks",
        target: "bearer",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.illusion-magic", atZero: 30, atTwelve: 114 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "blind", durationSeconds: 10 },
        ],
        skillId: "mesmer.ineptitude",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "...target moves 50% slower and suffers -2...5...6 Health
  // degeneration" (PvP).
  "crippling-anguish": define("crippling-anguish", "Crippling Anguish", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.5,
    healthPips: -5,
  }),
  // "...the next time you are the target of a hex, that hex fails and the
  // caster takes 10...46 damage" (#1403): 39, its rank-12 value.
  "hex-breaker": define("hex-breaker", "Hex Breaker", "stance", {
    profession: "mesmer",
    breaksNextHex: { damage: 39, skillId: "mesmer.hex-breaker" },
  }),

  // Mesmer skill-use punishers (#1473), each at its rank-12 values; the
  // damage is its caster's attribute, as the trigger's caster is the
  // hex's source.
  // "After 3 seconds, target foe takes 20...100 damage and all adjacent
  // foes take 75% of that damage. If that foe successfully uses a skill,
  // Wastrel's Worry ends prematurely and does no damage" (PvP): only its
  // expiry deals it, so a strip or a skill used first does nothing.
  "wastrels-worry": define("wastrels-worry", "Wastrel's Worry", "hex", {
    profession: "mesmer",
    endsWhenBearerUsesSkill: true,
    triggers: [
      {
        on: "expires",
        target: "bearer",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 20, atTwelve: 84 },
            },
            type: "typeless",
            armorPenetration: 0,
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
                  scaling: { attributeId: "mesmer.domination-magic", atZero: 15, atTwelve: 63 },
                },
                type: "typeless",
                armorPenetration: 0,
              },
            ],
          },
        ],
        skillId: "mesmer.wastrels-worry",
      },
    ],
  }),
  // "For 5 seconds, target foe suffers -1...3 Health degeneration." The
  // damage if it is using a skill is the spell's own.
  overload: define("overload", "Overload", "hex", {
    profession: "mesmer",
    healthPips: -3,
  }),
  // "For 5...20 seconds, target foe casts spells 50% slower and takes
  // 5...50 damage whenever interrupted" (PvP): by anyone, Dazed included.
  frustration: define("frustration", "Frustration", "hex", {
    profession: "mesmer",
    castTimeMultiplier: 1.5,
    triggers: [
      {
        on: "bearer-interrupted",
        target: "bearer",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.illusion-magic", atZero: 5, atTwelve: 41 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
        skillId: "mesmer.frustration",
      },
    ],
  }),
  // "For 5 seconds, the next time target foe uses an elite skill, that
  // foe loses 3...15 Energy."
  "price-of-pride": define("price-of-pride", "Price of Pride", "hex", {
    profession: "mesmer",
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { elite: true },
        target: "bearer",
        effects: [
          {
            kind: "energy-loss",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 3, atTwelve: 12.6 },
            },
          },
        ],
        skillId: "mesmer.price-of-pride",
      },
    ],
  }),
  // "For 4...16 seconds, target foe suffers -1...8 Health degeneration
  // and takes 100% longer to activate skills" (PvP): -7, its rank-12
  // 6.6 rounded. GWW: attack skills are not slowed.
  migraine: define("migraine", "Migraine", "hex", {
    profession: "mesmer",
    healthPips: -7,
    skillActivationMultiplier: 2,
  }),
  // "For 10 seconds, target foe and adjacent foes take 10...30 damage
  // whenever they use a skill and 5...40 additional damage if not under
  // the effects of another Mesmer hex" (PvP): each foe it lands on bears
  // its own.
  "visions-of-regret": define("visions-of-regret", "Visions of Regret", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        target: "bearer",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 10, atTwelve: 26 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          {
            kind: "if",
            condition: { kind: "target-lacks-other-hex", profession: "mesmer" },
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "mesmer.domination-magic", atZero: 5, atTwelve: 33 },
                },
                type: "typeless",
                armorPenetration: 0,
              },
            ],
          },
        ],
        skillId: "mesmer.visions-of-regret",
      },
    ],
  }),
  // Mesmer "the next spell fails" hexes (#1475), at their rank-12 values.
  // "...the next time target foe casts a spell that targets a foe, the
  // spell fails and you steal up to 5...14 Energy from that foe": 12.
  guilt: define("guilt", "Guilt", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "foe-targeted",
      effects: [{ kind: "energy-steal", amount: { flat: 12 } }],
      skillId: "mesmer.guilt",
    },
  }),
  // As Guilt, for "a spell that targets an ally": 12.
  shame: define("shame", "Shame", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "ally-targeted",
      effects: [{ kind: "energy-steal", amount: { flat: 12 } }],
      skillId: "mesmer.shame",
    },
  }),
  // "...the next spell that target foe casts on one of your allies fails
  // and deals 10...60 damage to that foe and 75% of that damage to all
  // nearby foes" (PvP): 50, and 38 nearby.
  mistrust: define("mistrust", "Mistrust", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "foe-targeted",
      effects: [
        { kind: "damage", amount: { flat: 50 }, type: "typeless", armorPenetration: 0 },
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_NEARBY,
          maxTargets: undefined,
          effects: [
            { kind: "damage", amount: { flat: 38 }, type: "typeless", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "mesmer.mistrust",
    },
  }),
  // "...take 5...20 damage each time they suffer or recover from a new
  // condition": 17.
  fragility: define("fragility", "Fragility", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-gains-condition",
        effects: [{ kind: "damage", amount: { flat: 17 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.fragility",
      },
      {
        on: "bearer-loses-condition",
        effects: [{ kind: "damage", amount: { flat: 17 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.fragility",
      },
    ],
  }),

  // Mesmer crowd punishers (#1501), at their rank-12 values.
  // "When a foe hexed with Panic successfully uses a skill, all other
  // nearby foes are interrupted": the bearer's own allies, never itself.
  panic: define("panic", "Panic", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "interrupt" }],
          },
        ],
        target: "bearer",
        skillId: "mesmer.panic",
      },
    ],
  }),
  // "Each second while hexed, target foe and all foes adjacent to that
  // foe take 1...10 damage and an additional 1...10 damage for each second
  // this spell is in effect. This hex ends prematurely if target foe uses
  // a skill": 8 and 8, so 8, 16, 24, 32, 40.
  "wastrels-demise": define("wastrels-demise", "Wastrel's Demise", "hex", {
    profession: "mesmer",
    damagePulse: { damage: 8, growth: 8, radius: AREA_ADJACENT, skillId: "mesmer.wastrels-demise" },
    endsWhenBearerUsesSkill: true,
  }),
  // "For 5...15 seconds, spells cast by target foe and all adjacent foes
  // take twice as long to cast. When this hex ends, you gain 1...7
  // energy" (#1570): 6, from each foe's own, however it ends.
  "arcane-conundrum": define("arcane-conundrum", "Arcane Conundrum", "hex", {
    profession: "mesmer",
    castTimeMultiplier: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "energy-gain", amount: { flat: 6 } }],
        target: "source",
        skillId: "mesmer.arcane-conundrum",
      },
    ],
  }),
};
