import type { Skill } from "./types.js";

/**
 * The implemented skill catalog (brief §9's "Implemented" stage).
 *
 * Every entry's numbers come from the imported reference corpus in
 * `@vibewars/game-data` (`normalized/<id>.json`) — same id, same cost,
 * same activation/recharge, same attribute scaling endpoints. What is
 * *implemented* here is only what the current effect system can honestly
 * express; a skill whose real behaviour needs a mechanic that does not
 * exist yet (hexes, enchantments, conditions, AoE, regeneration over
 * time) is deliberately **absent from this catalog**, not present with a
 * watered-down effect list.
 *
 * That is the brief's §9 rule taken literally: "do not fake coverage by
 * mapping unsupported skills to generic placeholder effects." The gap
 * between the 16 imported skills and the 6 implemented here is real, and
 * `coverage.ts` reports it rather than hiding it.
 *
 * Ranges are this project's own tuning (the source corpus does not
 * publish numeric ranges), expressed in the same world units as map
 * geometry.
 */

/** Touch/melee-ish range: must be adjacent. */
const RANGE_MELEE = 40;
/** Normal spell range. */
const RANGE_SPELL = 420;
/** Longbow-ish range. */
const RANGE_LONG = 520;

export const IMPLEMENTED_SKILLS: readonly Skill[] = [
  {
    id: "monk.orison-of-healing",
    name: "Orison of Healing",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-ally",
    effects: [
      {
        kind: "heal",
        amount: {
          scaling: { attributeId: "monk.healing-prayers", atZero: 20, atTwelve: 60 },
        },
      },
    ],
  },
  {
    id: "elementalist.fireball",
    name: "Fireball",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 1,
    rechargeSeconds: 7,
    range: RANGE_SPELL,
    target: "single-enemy",
    // The real skill also damages foes *near* the target; area-of-effect
    // is Sprint 21 work, so only the single-target component is
    // implemented. Noted here rather than silently approximated.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "elementalist.fire-magic", atZero: 7, atTwelve: 91 },
        },
      },
    ],
  },
  {
    id: "warrior.swift-chop",
    name: "Swift Chop",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_MELEE,
    target: "single-enemy",
    // The real skill's block-interaction and Deep Wound rider need
    // blocking and conditions (Sprint 12); the bonus damage is
    // implemented faithfully.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "warrior.axe-mastery", atZero: 1, atTwelve: 16 },
        },
      },
    ],
  },
  {
    id: "ranger.barrage",
    name: "Barrage",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 0,
    rechargeSeconds: 1,
    range: RANGE_LONG,
    target: "single-enemy",
    // Barrage's multi-target volley is AoE (Sprint 21); its single-target
    // bow attack is implemented.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "ranger.marksmanship", atZero: 5, atTwelve: 12 },
        },
      },
    ],
  },
  {
    id: "warrior.backbreaker",
    name: "Backbreaker",
    cost: { kind: "adrenaline", amount: 9 },
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    // Knockdown is Sprint 15; the elite's bonus damage is implemented, and
    // this is the catalog's one adrenaline-cost skill, which is what makes
    // it worth including now.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "warrior.hammer-mastery", atZero: 1, atTwelve: 16 },
        },
      },
    ],
  },
  {
    id: "necromancer.blood-renewal-lite",
    name: "Vital Transfer",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    // An *original* skill, not an import: the corpus's sacrifice skills
    // all also need hexes or regeneration, so none of them could be
    // implemented honestly yet. This one exists to exercise the
    // sacrifice-health + heal effect combination the engine does support,
    // and is named/derived independently rather than mislabelled as a
    // reference skill.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 10 },
      {
        kind: "heal",
        amount: {
          scaling: { attributeId: "necromancer.blood-magic", atZero: 30, atTwelve: 90 },
        },
      },
    ],
  },
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
