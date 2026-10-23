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

  /* ---------------------------------------------------------------------- */
  /* Skills enabled by the status/interrupt mechanics (Sprints 12-15)         */
  /* ---------------------------------------------------------------------- */

  {
    id: "ranger.broad-head-arrow",
    name: "Broad Head Arrow",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    // The real elite: Daze the target, and interrupt them if they were
    // casting. Both halves are now genuinely implementable — this is the
    // archetypal "shut down a caster" skill the whole interrupt mechanic
    // exists for. (The real arrow also flies slower; projectile travel
    // time is Sprint 21.)
    effects: [
      { kind: "interrupt" },
      { kind: "apply-status", statusId: "dazed", durationSeconds: 17 },
    ],
  },
  {
    id: "necromancer.faintheartedness",
    name: "Faintheartedness",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    // A hex combining attack-slowing with health degeneration. The
    // degeneration is modelled by the hex's own healthPerSecond; the
    // attack-speed half awaits weapon attacks (Sprint 15/21).
    effects: [{ kind: "apply-status", statusId: "life-drain", durationSeconds: 13 }],
  },
  {
    id: "elementalist.armor-of-earth",
    name: "Armor of Earth",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 0.75,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    // A self-enchantment: real armor gain, and the real movement penalty
    // that makes it a genuine trade-off rather than a free buff.
    effects: [{ kind: "apply-status", statusId: "armor-boost", durationSeconds: 30 }],
  },
  {
    id: "ranger.troll-unguent",
    name: "Troll Unguent",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 3,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    // Strong self-regeneration behind a long 3s cast — the canonical
    // "interrupt me" target, which is exactly why it pairs well with the
    // interrupt skills above in a test and in play.
    effects: [{ kind: "apply-status", statusId: "regeneration", durationSeconds: 13 }],
  },
  {
    id: "monk.mend-affliction",
    name: "Mend Affliction",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    // Original design, not an import: the corpus's condition-removal
    // skills all also need enchantment-stripping or per-removal scaling
    // the engine does not express yet. This exercises the remove-status
    // effect honestly under its own name.
    effects: [{ kind: "remove-status", category: "condition", count: 2 }],
  },
  {
    id: "warrior.sever-artery-lite",
    name: "Opening Cut",
    // Costs exactly one hit's worth of adrenaline, so landing a skill
    // immediately opens up the follow-up. Charging more than a hit grants
    // would make it uncastable in practice — a real bug this catalog's
    // own integration tests caught.
    cost: { kind: "adrenaline", amount: 3 },
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    // Original design: a bleed-applying adrenaline attack, exercising
    // damage + condition in one skill.
    effects: [
      {
        kind: "damage",
        amount: {
          scaling: { attributeId: "warrior.swordsmanship", atZero: 5, atTwelve: 20 },
        },
      },
      { kind: "apply-status", statusId: "bleeding", durationSeconds: 15 },
    ],
  },
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
