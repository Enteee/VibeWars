import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import type { DamageEffect } from "../types.js";
import { ILLUSION_OF_PAIN_HEAL } from "../catalog/shared.js";
import { define, ownSkills } from "./define.js";

export type MesmerStatusId =
  | "backfire"
  | "empathy"
  | "diversion"
  | "arcane-echo"
  | "echo"
  | "mantra-of-recovery"
  // Mesmer mantras (#1964).
  | "mantra-of-concentration"
  | "mantra-of-resolve"
  | "mantra-of-earth"
  | "mantra-of-flame"
  | "mantra-of-frost"
  | "mantra-of-lightning"
  // Mesmer Illusion Magic (#1228).
  | "conjure-phantasm"
  | "imagined-burden"
  | "phantom-pain"
  | "shrinking-armor"
  | "illusion-of-haste"
  | "ineptitude"
  | "clumsiness"
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
  | "arcane-conundrum"
  // Mesmer staples 3 (#1627).
  | "wandering-eye"
  | "illusion-of-weakness"
  // "N for each X" (#1760).
  | "channeling"
  // Caster staples (#1870).
  | "ethereal-burden"
  | "sum-of-all-fears"
  // Caster staples 2 (#1872).
  | "elemental-resistance"
  | "physical-resistance"
  // Casting-state hexes (#1931).
  | "power-leech"
  | "power-flux"
  | "signet-of-illusions"
  // Blocks that pay (#1974).
  | "distortion"
  // Mesmer energy and utility (#2132).
  | "lyssas-aura"
  | "persistence-of-memory"
  // Mesmer interrupts (#2165).
  | "web-of-disruption"
  // Mesmer staples 5 (#2231).
  | "conjure-nightmare"
  | "images-of-remorse"
  | "confusing-images"
  // Condition movement (#2259).
  | "fevered-dreams"
  | "keystone-signet"
  // Staples (#2278).
  | "mantra-of-recall"
  | "enchanters-conundrum"
  // Source-targets triggers and signet lockout (#2290).
  | "mind-wrack"
  | "ignorance"
  // Staples (#2287).
  | "ether-lord"
  | "ether-lord-regeneration"
  | "spirit-of-failure"
  | "spirit-shackles"
  | "soothing-images"
  | "arcane-languor"
  | "illusion-of-pain"
  | "ether-phantom"
  | "signet-of-recall"
  // Staples (#2414).
  | "sympathetic-visage"
  | "mantra-of-inscriptions"
  | "air-of-disenchantment"
  // Staples (#2367).
  | "shared-burden"
  // Mechanics (#2438).
  | "mantra-of-signets"
  // Staples (#2447).
  | "ancestors-visage"
  // Dropped leftovers (#2446).
  | "symbolic-celerity"
  // Attack backfire (#2471).
  | "calculated-risk"
  // Mechanics (#2459).
  | "stolen-speed"
  // Mechanics (#2472).
  | "illusionary-weaponry"
  // Mechanics (#2501).
  | "recurring-insecurity";

/** Wandering Eye's 76 (#1627), to its bearer and to each foe nearby. */
const WANDERING_EYE_DAMAGE: DamageEffect = {
  kind: "damage",
  amount: { scaling: { attributeId: "mesmer.illusion-magic", atZero: 10, atTwelve: 76 } },
  type: "typeless",
  armorPenetration: 0,
};

/**
 * Mantra of Earth, Flame, Frost or Lightning (#1964), at rank 12: 45% less
 * damage of `type` taken, and 2 Energy each time a foe deals it.
 */
function elementMantra(
  id: MesmerStatusId,
  name: string,
  type: "earth" | "fire" | "cold" | "lightning",
): StatusDefinition {
  return define(id, name, "stance", {
    profession: "mesmer",
    damageTypeTakenMultiplier: { type, multiplier: 0.55 },
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        damageType: type,
        effects: [{ kind: "energy-gain", amount: { flat: 2 } }],
        target: "bearer",
        skillId: `mesmer.${id}`,
      },
    ],
  });
}

/**
 * "Whenever target ally is hit by a melee attack, all adjacent foes lose
 * all adrenaline and 3 Energy", for the Visage whose `skillId` it is.
 */
function visageTriggers(skillId: string): StatusDefinition["triggers"] {
  return [
    {
      on: "bearer-hit-by-attack",
      weapon: "melee",
      target: "bearer",
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [{ kind: "adrenaline-loss" }, { kind: "energy-loss", amount: { flat: 3 } }],
        },
      ],
      skillId,
    },
  ];
}

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
  // "For 1...31...38 seconds, the next time you would be interrupted, you
  // are not" (#1964).
  "mantra-of-concentration": define(
    "mantra-of-concentration",
    "Mantra of Concentration",
    "stance",
    { profession: "mesmer", interruptGuard: { kind: "once" } },
  ),
  // PvP: "For 5 seconds, you cannot be interrupted. Each time you would be,
  // lose 10...5...4 Energy or Mantra of Resolve ends" (#1964).
  "mantra-of-resolve": define("mantra-of-resolve", "Mantra of Resolve", "stance", {
    profession: "mesmer",
    interruptGuard: { kind: "pay-energy", amount: 5 },
  }),
  // "For 30...78...90 seconds, <type> damage you take is reduced by
  // 26...45...50%, and you gain 2 Energy whenever you take <type> damage"
  // (#1964).
  "mantra-of-earth": elementMantra("mantra-of-earth", "Mantra of Earth", "earth"),
  "mantra-of-flame": elementMantra("mantra-of-flame", "Mantra of Flame", "fire"),
  "mantra-of-frost": elementMantra("mantra-of-frost", "Mantra of Frost", "cold"),
  "mantra-of-lightning": elementMantra("mantra-of-lightning", "Mantra of Lightning", "lightning"),
  // PvP: "you have +3 armor for each signet you have equipped. Whenever you
  // use a signet, you gain 5...60 Health" (#2438): one stack a signet,
  // counted as it lands; the heal at the bearer's Inspiration Magic.
  "mantra-of-signets": define("mantra-of-signets", "Mantra of Signets", "stance", {
    profession: "mesmer",
    armorModifier: 3,
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "signet" },
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 5, atTwelve: 49 },
            },
          },
        ],
        target: "bearer",
        skillId: "mesmer.mantra-of-signets",
      },
    ],
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
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: { flat: 17 } }],
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
        effects: [
          { kind: "apply-status", statusId: "cracked-armor", durationSeconds: { flat: 17 } },
        ],
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
        effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: { flat: 3 } }],
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
          { kind: "apply-status", statusId: "blind", durationSeconds: { flat: 10 } },
        ],
        skillId: "mesmer.ineptitude",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "The next time each foe attacks, the attack is interrupted and that
  // foe suffers 10...80 damage" (#1593): fired as the attack begins, so a
  // swing never lands and an arrow never leaves. The damage is its
  // caster's Illusion Magic.
  clumsiness: define("clumsiness", "Clumsiness", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attack-begins",
        target: "bearer",
        effects: [
          { kind: "cancel-attack" },
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.illusion-magic", atZero: 10, atTwelve: 66 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
        skillId: "mesmer.clumsiness",
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
    damagePulse: {
      damage: 8,
      growth: 8,
      type: "typeless",
      radius: AREA_ADJACENT,
      hitsBearer: true,
      skillId: "mesmer.wastrels-demise",
    },
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
  // "For 4 seconds, the next time target foe attacks, that attack is
  // interrupted and all nearby foes take 10...92 damage" (PvP, #1627):
  // 76, fired as Clumsiness's is. The bearer is one of those foes, and a
  // splash spares its centre, so it is hit on its own.
  "wandering-eye": define("wandering-eye", "Wandering Eye", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attack-begins",
        target: "bearer",
        effects: [
          { kind: "cancel-attack" },
          WANDERING_EYE_DAMAGE,
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [WANDERING_EYE_DAMAGE],
          },
        ],
        skillId: "mesmer.wandering-eye",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "Illusion of Weakness ends if damage drops your Health below 25% of
  // your maximum. When Illusion of Weakness ends, you gain 50...240
  // Health" (#1789): any end, a strip too.
  "illusion-of-weakness": define("illusion-of-weakness", "Illusion of Weakness", "enchantment", {
    profession: "mesmer",
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-health-drops-below",
        healthBelow: 0.25,
        effects: [],
        target: "bearer",
        skillId: "mesmer.illusion-of-weakness",
      },
      {
        on: "ends",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "mesmer.illusion-magic", atZero: 50, atTwelve: 202 },
            },
          },
        ],
        target: "bearer",
        skillId: "mesmer.illusion-of-weakness",
      },
    ],
  }),
  // "Whenever you cast a spell, you gain 1 Energy for each foe in the
  // area" (#1760): counted as the spell is cast.
  channeling: define("channeling", "Channeling", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [
          {
            kind: "energy-gain",
            amount: { flat: 0 },
            per: {
              count: { kind: "foes-within", radius: AREA_IN_THE_AREA },
              amount: { flat: 1 },
              max: undefined,
            },
          },
        ],
        target: "bearer",
        skillId: "mesmer.channeling",
      },
    ],
  }),
  // "For 6...11...12 seconds, target foe moves 50% slower. When Ethereal
  // Burden ends, you gain 10...16...18 Energy" (#1870): the caster, however
  // it ends, the target dead included.
  "ethereal-burden": define("ethereal-burden", "Ethereal Burden", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.5,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "energy-gain", amount: { flat: 16 } }],
        target: "source",
        skillId: "mesmer.ethereal-burden",
      },
    ],
  }),
  // "For 4...10...12 seconds, target foe moves, attacks, and casts spells
  // 33% slower" (#1870).
  "sum-of-all-fears": define("sum-of-all-fears", "Sum of All Fears", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.67,
    attackDurationMultiplier: 1.33,
    castTimeMultiplier: 1.33,
  }),
  // "For 30...90 seconds, You gain +40 armor against elemental damage, but
  // you lose 24...12 armor against physical damage" (#1872): 14 at rank 12.
  "elemental-resistance": define("elemental-resistance", "Elemental Resistance", "stance", {
    profession: "mesmer",
    conditionalArmor: [
      { amount: 40, conditions: [{ kind: "vs-elemental" }] },
      { amount: -14, conditions: [{ kind: "vs-physical" }] },
    ],
  }),
  // Its mirror (#1872): +40 against physical, -14 against elemental.
  "physical-resistance": define("physical-resistance", "Physical Resistance", "stance", {
    profession: "mesmer",
    conditionalArmor: [
      { amount: 40, conditions: [{ kind: "vs-physical" }] },
      { amount: -14, conditions: [{ kind: "vs-elemental" }] },
    ],
  }),
  // Casting-state hexes (#1931), put on whether or not the skill's
  // interrupt landed. "For 10 seconds, whenever target foe casts a spell,
  // you steal up to 5...13...15 Energy": 13, at rank 12.
  "power-leech": define("power-leech", "Power Leech", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [{ kind: "energy-steal", amount: { flat: 13 } }],
        target: "bearer",
        skillId: "mesmer.power-leech",
      },
    ],
  }),
  // "...target foe suffers -2 Energy degeneration for 4...9...10 seconds."
  "power-flux": define("power-flux", "Power Flux", "hex", {
    profession: "mesmer",
    energyPips: -2,
  }),
  // "Your next 1...3...3 non-Illusion spells use your Illusion attribute
  // instead of its normal attribute" (#1929): no duration, it lasts
  // until its 3 are spent.
  "signet-of-illusions": define("signet-of-illusions", "Signet of Illusions", "skill-effect", {
    profession: "mesmer",
    borrowsAttribute: { attributeId: "mesmer.illusion-magic", skillType: "spell", uses: 3 },
  }),
  // "For 1...5 seconds, you have a 75% chance to block attacks. Whenever
  // you block an attack this way, you lose 2 Energy or Distortion ends"
  // (#1974). The block stands either way.
  distortion: define("distortion", "Distortion", "stance", {
    profession: "mesmer",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "bearer",
        effects: [{ kind: "pay-energy-or-end", amount: 2 }],
        skillId: "mesmer.distortion",
      },
      {
        on: "bearer-blocks-projectile",
        target: "bearer",
        effects: [{ kind: "pay-energy-or-end", amount: 2 }],
        skillId: "mesmer.distortion",
      },
    ],
  }),
  // Mesmer energy and utility (#2132), at their rank-12 values.
  // "For 10 seconds, you have +0...5 Energy regeneration. This enchantment
  // reapplies itself every time you cast a spell on a foe." At the
  // caster's Inspiration Magic (#2328): 4 at rank 12, none at 0.
  "lyssas-aura": define("lyssas-aura", "Lyssa's Aura", "enchantment", {
    profession: "mesmer",
    energyPips: { scaling: { attributeId: "mesmer.inspiration-magic", atZero: 0, atTwelve: 4 } },
    renewsOn: ["bearer-casts-spell-at-foe"],
  }),
  // "For 5...20 seconds, whenever a spell you cast is interrupted, that
  // spell is instantly recharged." A disable the interrupt adds stays.
  "persistence-of-memory": define("persistence-of-memory", "Persistence of Memory", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-interrupted",
        target: "bearer",
        usedSkill: { spell: true },
        effects: [{ kind: "recharge-reset", of: "used-skill" }],
        skillId: "mesmer.persistence-of-memory",
      },
    ],
  }),
  // "When this hex ends, that foe is interrupted again" (#2165): on
  // expiry and on removal; a recast refreshes it, which is no end.
  "web-of-disruption": define("web-of-disruption", "Web of Disruption", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "interrupt" }],
        target: "bearer",
        skillId: "mesmer.web-of-disruption",
      },
    ],
  }),
  // "For 2...16 seconds, target foe suffers -8 Health degeneration" (#2231).
  "conjure-nightmare": define("conjure-nightmare", "Conjure Nightmare", "hex", {
    profession: "mesmer",
    healthPips: -8,
  }),
  // "For 5...10 seconds, target foe suffers -1...3 Health degeneration"
  // (#2231). The damage if it was attacking is the skill's.
  "images-of-remorse": define("images-of-remorse", "Images of Remorse", "hex", {
    profession: "mesmer",
    healthPips: { scaling: { attributeId: "mesmer.illusion-magic", atZero: -1, atTwelve: -2.6 } },
  }),
  // "...target foe takes twice as long to activate non-attack skills"
  // (#2231), as Migraine's.
  "confusing-images": define("confusing-images", "Confusing Images", "hex", {
    profession: "mesmer",
    skillActivationMultiplier: 2,
  }),
  // PvP: "whenever target foe suffers from a new condition, all foes in the
  // area suffer from that condition as well" (#2259): the hexed foe's
  // allies, as the Mesmer's; a copy never spreads again.
  "fevered-dreams": define("fevered-dreams", "Fevered Dreams", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-gains-condition",
        effects: [
          { kind: "spread-gained-condition", radius: AREA_IN_THE_AREA, to: "bearer-allies" },
        ],
        target: "bearer",
        skillId: "mesmer.fevered-dreams",
      },
    ],
  }),
  // "For 20 seconds, the next 0...6 times you use a signet that targets a
  // foe, all other foes adjacent to your target take 15...60 damage and
  // are interrupted" (#2275), at its Mesmer's rank.
  "keystone-signet": define("keystone-signet", "Keystone Signet", "skill-effect", {
    profession: "mesmer",
    nextSkill: {
      which: "signet-at-foe",
      count: { scaling: { attributeId: "mesmer.fast-casting", atZero: 0, atTwelve: 4.8 } },
      at: "skill-target",
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [
            {
              kind: "damage",
              amount: { scaling: { attributeId: "mesmer.fast-casting", atZero: 15, atTwelve: 51 } },
              type: "typeless",
              armorPenetration: 0,
            },
            { kind: "interrupt" },
          ],
        },
      ],
      skillId: "mesmer.keystone-signet",
    },
  }),
  // Staples (#2278). "For 20 seconds, you gain no benefit from it. You
  // gain 10...25 Energy when Mantra of Recall ends": any end, a removal
  // included, as GW1 says "ends".
  "mantra-of-recall": define("mantra-of-recall", "Mantra of Recall", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 10, atTwelve: 22 },
            },
          },
        ],
        skillId: "mesmer.mantra-of-recall",
      },
    ],
  }),
  // PvP (#2291): "For 10 seconds, target foe casts enchantments
  // 100...200% slower", by the Mesmer's Domination Magic; the damage is
  // the skill's.
  "enchanters-conundrum": define("enchanters-conundrum", "Enchanter's Conundrum", "hex", {
    profession: "mesmer",
    ownSkillModifiers: [
      ownSkills(
        { type: "enchantment" },
        {
          activationMultiplier: {
            scaling: { attributeId: "mesmer.domination-magic", atZero: 2, atTwelve: 2.8 },
          },
        },
      ),
    ],
  }),
  // Source-targets triggers and signet lockout (#2290). "...whenever this
  // foe is the target of one of your non-hex Mesmer skills, that foe loses
  // 1 Energy. If the target foe's Energy drops to 0, Mind Wrack ends and
  // that foe takes 15...100 damage": once, as the hex goes with it.
  "mind-wrack": define("mind-wrack", "Mind Wrack", "hex", {
    profession: "mesmer",
    attribute: "mesmer.domination-magic",
    triggers: [
      {
        on: "source-targets-bearer",
        usedSkill: { profession: "mesmer", notType: "hex" },
        effects: [{ kind: "energy-loss", amount: { flat: 1 } }],
        target: "bearer",
        skillId: "mesmer.mind-wrack",
      },
      {
        on: "bearer-energy-drops-empty",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.domination-magic", atZero: 15, atTwelve: 83 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          { kind: "remove-status", category: "hex", count: 1, statusId: "mind-wrack" },
        ],
        target: "bearer",
        skillId: "mesmer.mind-wrack",
      },
    ],
  }),
  // "...target foe cannot use signets."
  ignorance: define("ignorance", "Ignorance", "hex", {
    profession: "mesmer",
    preventsSignets: true,
  }),
  // Staples (#2287). Ether Lord's "-1...3 Energy degeneration ... +1...3
  // Energy regeneration", at the caster's Inspiration Magic (#2328): 3
  // at rank 12, on either side.
  "ether-lord": define("ether-lord", "Ether Lord", "hex", {
    profession: "mesmer",
    energyPips: {
      scaling: { attributeId: "mesmer.inspiration-magic", atZero: -1, atTwelve: -2.6 },
    },
  }),
  "ether-lord-regeneration": define("ether-lord-regeneration", "Ether Lord", "skill-effect", {
    profession: "mesmer",
    energyPips: { scaling: { attributeId: "mesmer.inspiration-magic", atZero: 1, atTwelve: 2.6 } },
  }),
  // "...has a 25% chance to miss with attacks. You gain 1...3 Energy
  // whenever that foe fails to hit in combat": the hex's caster gains it.
  "spirit-of-failure": define("spirit-of-failure", "Spirit of Failure", "hex", {
    profession: "mesmer",
    attackMissChance: 0.25,
    triggers: [
      {
        on: "bearer-fails-to-hit",
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 1, atTwelve: 2.6 },
            },
          },
        ],
        target: "source",
        skillId: "mesmer.spirit-of-failure",
      },
    ],
  }),
  // "...target foe loses 5 Energy whenever that foe attacks."
  "spirit-shackles": define("spirit-shackles", "Spirit Shackles", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attacks",
        effects: [{ kind: "energy-loss", amount: { flat: 5 } }],
        target: "bearer",
        skillId: "mesmer.spirit-shackles",
      },
    ],
  }),
  // "...cannot gain adrenaline": what it holds already stays.
  "soothing-images": define("soothing-images", "Soothing Images", "hex", {
    profession: "mesmer",
    preventsAdrenalineGain: true,
  }),
  // "...all spells cast by the target foe cause 10 Overcast."
  "arcane-languor": define("arcane-languor", "Arcane Languor", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [{ kind: "overcast", amount: { flat: 10 } }],
        target: "bearer",
        skillId: "mesmer.arcane-languor",
      },
    ],
  }),
  // "...has -3...10 Health degeneration and takes 3...10 damage each
  // second. When Illusion of Pain ends or is reapplied, that foe is healed
  // for 36...120": any end, a removal included; the recast's heal is the
  // skill's own.
  "illusion-of-pain": define("illusion-of-pain", "Illusion of Pain", "hex", {
    profession: "mesmer",
    healthPips: { scaling: { attributeId: "mesmer.illusion-magic", atZero: -3, atTwelve: -8.6 } },
    pulse: {
      everySeconds: 1,
      effects: [
        {
          kind: "damage",
          amount: { scaling: { attributeId: "mesmer.illusion-magic", atZero: 3, atTwelve: 8.6 } },
          type: "typeless",
          armorPenetration: 0,
        },
      ],
      skillId: "mesmer.illusion-of-pain",
    },
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: ILLUSION_OF_PAIN_HEAL }],
        target: "bearer",
        skillId: "mesmer.illusion-of-pain",
      },
    ],
  }),
  // "...-1 Energy degeneration. If this hex is removed prematurely, that
  // foe loses 1...5 Energy": any early end, never its natural one.
  "ether-phantom": define("ether-phantom", "Ether Phantom", "hex", {
    profession: "mesmer",
    energyPips: -1,
    triggers: [
      {
        on: "ends-early",
        effects: [
          {
            kind: "energy-loss",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 1, atTwelve: 4.2 },
            },
          },
        ],
        target: "bearer",
        skillId: "mesmer.ether-phantom",
      },
    ],
  }),
  // "For 5...20 seconds, target foe and all foes in the area attack, cast
  // spells, and move 33% slower" (PvP, #2367).
  "shared-burden": define("shared-burden", "Shared Burden", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.67,
    attackDurationMultiplier: 1.33,
    castTimeMultiplier: 1.33,
  }),
  // Mechanics (#2374). "...-4 Energy regeneration. When this effect ends,
  // you gain 13...20 Energy": 19 at rank 12. Any end pays, a removal too.
  "signet-of-recall": define("signet-of-recall", "Signet of Recall", "skill-effect", {
    profession: "mesmer",
    energyPips: -4,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "mesmer.inspiration-magic", atZero: 13, atTwelve: 18.6 },
            },
          },
        ],
        target: "bearer",
        skillId: "mesmer.signet-of-recall",
      },
    ],
  }),
  // Staples (#2414). "...whenever target ally is hit by a melee attack,
  // all adjacent foes lose all adrenaline and 3 Energy": round the ally,
  // the enchanter's foes, the attacker too when beside it; never a shot.
  "sympathetic-visage": define("sympathetic-visage", "Sympathetic Visage", "enchantment", {
    profession: "mesmer",
    triggers: visageTriggers("mesmer.sympathetic-visage"),
  }),
  // Staples (#2447). Ancestor's Visage: the same text as Sympathetic
  // Visage's under its own id, so both can be on one ally.
  "ancestors-visage": define("ancestors-visage", "Ancestor's Visage", "enchantment", {
    profession: "mesmer",
    triggers: visageTriggers("mesmer.ancestors-visage"),
  }),
  // "For 5...25 seconds, signets you successfully activate while in this
  // stance recharge 10...40% faster", at the Mesmer's Inspiration Magic.
  "mantra-of-inscriptions": define("mantra-of-inscriptions", "Mantra of Inscriptions", "stance", {
    profession: "mesmer",
    ownSkillModifiers: [
      ownSkills(
        { type: "signet" },
        {
          rechargeFaster: {
            scaling: { attributeId: "mesmer.inspiration-magic", atZero: 0.1, atTwelve: 0.34 },
          },
        },
      ),
    ],
  }),
  // "For 5...20 seconds, enchantments expire 150...300% faster on those
  // foes" (#2373).
  "air-of-disenchantment": define("air-of-disenchantment", "Air of Disenchantment", "hex", {
    profession: "mesmer",
    attribute: "mesmer.illusion-magic",
    enchantmentsExpireFaster: {
      scaling: { attributeId: "mesmer.illusion-magic", atZero: 1.5, atTwelve: 2.7 },
    },
  }),
  // "All of your signets use your Fast Casting attribute instead of their
  // normal attributes" (#2446): every one while it lasts, weaker too at a
  // low Fast Casting, as in GW1.
  "symbolic-celerity": define("symbolic-celerity", "Symbolic Celerity", "enchantment", {
    profession: "mesmer",
    borrowsAttribute: { attributeId: "mesmer.fast-casting", skillType: "signet", uses: undefined },
  }),
  // "Target foe's attacks do +10 damage, but there is a 50% chance that the
  // damage from each attack will be done to that foe instead. (Maximum
  // 15...60 damage.)" (PvP, #2471): every blow that lands, its cap by the
  // Mesmer's Illusion Magic.
  "calculated-risk": define("calculated-risk", "Calculated Risk", "hex", {
    profession: "mesmer",
    attribute: "mesmer.illusion-magic",
    attackDamageDelta: 10,
    attackBackfire: {
      chance: 0.5,
      max: { scaling: { attributeId: "mesmer.illusion-magic", atZero: 15, atTwelve: 51 } },
    },
  }),
  // "Spells cast by the target foe and all adjacent foes take 100% longer
  // to cast. Spells you cast that target these foes take 50% less time to
  // cast" (PvP, #2459): only its own caster's, aimed at the bearer.
  "stolen-speed": define("stolen-speed", "Stolen Speed", "hex", {
    profession: "mesmer",
    castTimeMultiplier: 2,
    sourceSpellCastTimeMultiplier: 0.5,
  }),
  // "For 30 seconds, your melee attacks neither hit nor fail to hit.
  // Instead, Illusionary Weaponry deals 20...60 damage to your targets for
  // each melee attack" (#2472), at the Mesmer's Illusion Magic as it landed.
  "illusionary-weaponry": define("illusionary-weaponry", "Illusionary Weaponry", "enchantment", {
    profession: "mesmer",
    replacesMeleeBlows: {
      damage: { scaling: { attributeId: "mesmer.illusion-magic", atZero: 20, atTwelve: 52 } },
      skillId: "mesmer.illusionary-weaponry",
    },
  }),
  // "For 5 seconds, target foe suffers from -1...6 Health degeneration.
  // If that foe has another hex when Recurring Insecurity would end, it is
  // reapplied" (#2501): -5 at 12, for as long as another hex stays.
  "recurring-insecurity": define("recurring-insecurity", "Recurring Insecurity", "hex", {
    profession: "mesmer",
    healthPips: { scaling: { attributeId: "mesmer.illusion-magic", atZero: -1, atTwelve: -5 } },
    reappliesOnExpiryIf: { bearerHasOtherHex: true },
  }),
};
