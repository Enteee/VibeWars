import { AREA_ADJACENT, AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import type { Skill } from "./types.js";

/**
 * The implemented skill catalog (brief §9's "Implemented" stage).
 *
 * Every entry's numbers come from the imported reference corpus in
 * `@vibewars/game-data` (`normalized/<id>.json`) — same id, same cost,
 * same activation/recharge, same attribute scaling endpoints. What is
 * *implemented* here is only what the current effect system can honestly
 * express; a skill whose real behaviour needs a mechanic that does not
 * exist yet (hexes, enchantments, conditions, regeneration over
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

/** Longbow-ish range. */
const RANGE_LONG = 520;

export const IMPLEMENTED_SKILLS: readonly Skill[] = [
  {
    id: "monk.orison-of-healing",
    name: "Orison of Healing",
    type: "spell",
    profession: "monk",
    attributeId: "monk.healing-prayers",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
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
    type: "spell",
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 1,
    rechargeSeconds: 7,
    range: RANGE_SPELL,
    target: "single-enemy",
    // "...and all nearby foes": the same hit on every enemy near the target.
    area: {
      radius: AREA_NEARBY,
      origin: "target",
      affects: "enemies",
      maxTargets: undefined,
      includesCaster: false,
    },
    attack: undefined,
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
    type: "attack",
    profession: "warrior",
    attributeId: "warrior.axe-mastery",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 0,
    rechargeSeconds: 4,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // The real skill's block-interaction and Deep Wound rider need
    // blocking; the bonus damage is implemented faithfully.
    attack: {
      weapon: "axe",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atZero: 1, atTwelve: 16 } },
    },
    effects: [],
  },
  {
    id: "ranger.barrage",
    name: "Barrage",
    type: "attack",
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 0,
    rechargeSeconds: 1,
    range: RANGE_LONG,
    target: "single-enemy",
    // The volley: an arrow at each of up to six foes adjacent to the
    // target, each a blow of the bow plus the bonus.
    area: {
      radius: AREA_ADJACENT,
      origin: "target",
      affects: "enemies",
      maxTargets: 6,
      includesCaster: false,
    },
    attack: {
      weapon: "bow",
      weaponDamage: 1,
      bonusDamage: { scaling: { attributeId: "ranger.marksmanship", atZero: 5, atTwelve: 12 } },
    },
    effects: [],
  },
  {
    id: "warrior.backbreaker",
    name: "Backbreaker",
    type: "attack",
    profession: "warrior",
    attributeId: "warrior.hammer-mastery",
    cost: { kind: "adrenaline", amount: 9 },
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // GW1: +1...16 damage and a knockdown, 4 s with 8 Strength or more and
    // 2 s below. A PvP Backbreaker has the Strength, so it is a flat 4 s (#544).
    attack: {
      weapon: "hammer",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "warrior.hammer-mastery", atZero: 1, atTwelve: 16 },
      },
    },
    effects: [{ kind: "knockdown", durationSeconds: 4 }],
  },
  {
    id: "necromancer.blood-renewal-lite",
    name: "Vital Transfer",
    type: "spell",
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
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
    id: "warrior.distracting-blow",
    name: "Distracting Blow",
    type: "attack",
    profession: "warrior",
    // GW1's "No Attribute": nothing scales, and any warrior can use it.
    attributeId: undefined,
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 0.5,
    rechargeSeconds: 10,
    range: RANGE_MELEE,
    target: "single-enemy",
    // The real skill also disrupts foes adjacent to the target, but only
    // with a scythe, and there are no scythes yet.
    area: undefined,
    // A swing of any melee weapon that deals no damage: still an attack,
    // so blind makes it miss, and a miss interrupts nothing.
    attack: { weapon: "melee", weaponDamage: 0, bonusDamage: undefined },
    effects: [{ kind: "interrupt" }],
  },
  {
    id: "ranger.broad-head-arrow",
    name: "Broad Head Arrow",
    type: "attack",
    profession: "ranger",
    attributeId: "ranger.marksmanship",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 0,
    rechargeSeconds: 10,
    range: RANGE_LONG,
    target: "single-enemy",
    area: undefined,
    attack: { weapon: "bow", weaponDamage: 1, bonusDamage: undefined },
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
    type: "hex",
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 1,
    rechargeSeconds: 8,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    // A hex combining attack-slowing with health degeneration. The
    // degeneration is modelled by the hex's own healthPerSecond; the
    // attack-speed half awaits weapon attacks (Sprint 15/21).
    effects: [{ kind: "apply-status", statusId: "life-drain", durationSeconds: 13 }],
  },
  {
    id: "necromancer.malaise",
    name: "Malaise",
    type: "hex",
    profession: "necromancer",
    attributeId: "necromancer.curses",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 2,
    rechargeSeconds: 2,
    range: RANGE_SPELL,
    target: "single-enemy",
    area: undefined,
    attack: undefined,
    // GW1's energy-degeneration hex (#503), at its rank-12 duration.
    // Left out: the caster's own -1 health degeneration while it lasts,
    // and the damage that ends it when the foe's energy reaches 0.
    effects: [{ kind: "apply-status", statusId: "malaise", durationSeconds: 24 }],
  },
  {
    id: "necromancer.blood-ritual",
    name: "Blood Ritual",
    type: "enchantment",
    profession: "necromancer",
    attributeId: "necromancer.blood-magic",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 2,
    // A touch skill: the ally must be at hand, and not the caster, or
    // it would be a free +3 energy for the Necromancer.
    range: RANGE_MELEE,
    target: "single-other-ally",
    area: undefined,
    attack: undefined,
    // GW1's energy-regeneration enchantment (#503), at its rank-12 duration.
    effects: [
      { kind: "sacrifice-health", percentOfMax: 17 },
      { kind: "apply-status", statusId: "blood-ritual", durationSeconds: 13 },
    ],
  },
  {
    id: "elementalist.armor-of-earth",
    name: "Armor of Earth",
    type: "enchantment",
    profession: "elementalist",
    attributeId: "elementalist.earth-magic",
    cost: { kind: "energy", amount: 10 },
    activationSeconds: 0.75,
    rechargeSeconds: 15,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    // A self-enchantment: real armor gain, and the real movement penalty
    // that makes it a genuine trade-off rather than a free buff.
    effects: [{ kind: "apply-status", statusId: "armor-boost", durationSeconds: 30 }],
  },
  {
    id: "ranger.troll-unguent",
    name: "Troll Unguent",
    type: "skill",
    profession: "ranger",
    attributeId: "ranger.wilderness-survival",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 3,
    rechargeSeconds: 10,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    // Strong self-regeneration behind a long 3s cast — the canonical
    // "interrupt me" target, which is exactly why it pairs well with the
    // interrupt skills above in a test and in play.
    effects: [{ kind: "apply-status", statusId: "regeneration", durationSeconds: 13 }],
  },
  {
    id: "monk.mend-affliction",
    name: "Mend Affliction",
    type: "spell",
    profession: "monk",
    attributeId: "monk.protection-prayers",
    cost: { kind: "energy", amount: 5 },
    activationSeconds: 1,
    rechargeSeconds: 4,
    range: RANGE_SPELL,
    target: "single-ally",
    area: undefined,
    attack: undefined,
    // Original design, not an import: the corpus's condition-removal
    // skills all also need enchantment-stripping or per-removal scaling
    // the engine does not express yet. This exercises the remove-status
    // effect honestly under its own name.
    effects: [{ kind: "remove-status", category: "condition", count: 2 }],
  },
  {
    id: "warrior.sever-artery-lite",
    name: "Opening Cut",
    type: "attack",
    profession: "warrior",
    attributeId: "warrior.swordsmanship",
    // Costs exactly one hit's worth of adrenaline, so landing a skill
    // immediately opens up the follow-up. Charging more than a hit grants
    // would make it uncastable in practice — a real bug this catalog's
    // own integration tests caught.
    cost: { kind: "adrenaline", amount: 3 },
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: RANGE_MELEE,
    target: "single-enemy",
    area: undefined,
    // Original design: a bleed-applying adrenaline attack, exercising
    // a blow + condition in one skill.
    attack: {
      weapon: "sword",
      weaponDamage: 1,
      bonusDamage: {
        scaling: { attributeId: "warrior.swordsmanship", atZero: 5, atTwelve: 20 },
      },
    },
    effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 15 }],
  },
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  IMPLEMENTED_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}
