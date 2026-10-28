/**
 * Conditions, hexes and enchantments (brief §12–§13).
 *
 * All three are *timed status effects* on a combatant and share one
 * lifecycle (apply → tick → expire/remove), so they share one
 * implementation parameterised by `category` rather than three parallel
 * systems that would inevitably drift apart. What differs between them is
 * genuine game rules, encoded as data here:
 *
 * - `condition`  — negative, applied by foes, removed by condition removal.
 * - `hex`        — negative, applied by foes, removed by hex removal.
 * - `enchantment`— positive, applied by allies, removed by enchantment removal/strip.
 * - `stance`     — positive, on yourself only, ended by stance removal (#465).
 * - `preparation`— on yourself only; changes your attacks while it lasts (#525).
 * - `glyph`      — on yourself only; changes your next spells, then is gone (#526).
 * - `shout`      — a shout's lingering effect (#524); no removal touches it.
 * - `chant`      — a chant's lingering effect (#758); no removal touches it.
 * - `weapon-spell`— a spell on an ally's weapon (#758), one at a time; not
 *   an enchantment, so enchantment removal leaves it.
 * - `skill-effect`— none of GW1's removable kinds: Healing Signet's armor
 *   loss while it is activated. No removal touches it either.
 *
 * Re-application does not stack duration (GW1-style): the longer of the
 * existing and incoming duration wins. That single rule is why a spammed
 * short condition cannot out-last one well-timed long one. An exclusive
 * category (`EXCLUSIVE_CATEGORIES`) is the exception: one at a time.
 */

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import type { DamageType } from "../equipment/types.js";
import { wieldsFor, type WeaponId } from "../equipment/weapons.js";
import type { ProfessionId } from "../professions.js";
import type {
  AttackWeaponClass,
  Combatant,
  DamageEffect,
  HealEffect,
  SkillEffect,
} from "./types.js";

export type StatusCategory =
  | "condition"
  | "hex"
  | "enchantment"
  | "stance"
  | "preparation"
  | "glyph"
  | "shout"
  | "chant"
  | "weapon-spell"
  | "skill-effect";

/**
 * Categories of which a combatant has at most one at a time (GW1): a new
 * one ends whichever is up, the same one included, and starts at its full
 * duration.
 */
export const EXCLUSIVE_CATEGORIES: ReadonlySet<StatusCategory> = new Set([
  "stance",
  "preparation",
  "glyph",
  "weapon-spell",
]);

export type StatusId =
  // Conditions (brief §12's starting set).
  | "bleeding"
  | "burning"
  | "poison"
  | "crippled"
  | "blind"
  | "weakness"
  | "cracked-armor"
  | "deep-wound"
  | "dazed"
  | "disease"
  // Hexes / enchantments implemented so far.
  | "faintheartedness"
  | "malaise"
  | "backfire"
  | "empathy"
  | "parasitic-bond"
  | "contagion"
  | "shard-storm"
  | "shadow-of-fear"
  | "spiteful-spirit"
  | "insidious-parasite"
  | "mark-of-pain"
  | "diversion"
  | "ice-spikes"
  | "deep-freeze"
  | "regeneration"
  | "blood-ritual"
  | "armor-boost"
  | "guardian"
  | "mending"
  | "patient-spirit"
  | "holy-veil"
  | "protective-spirit"
  | "shadow-refuge"
  | "shroud-of-distress"
  | "reversal-of-fortune"
  | "vigorous-spirit"
  // Stances.
  | "sprint"
  | "dash"
  | "frenzy"
  | "dark-escape"
  | "natural-stride"
  | "lightning-reflexes"
  | "escape"
  | "mantra-of-recovery"
  // Preparations.
  | "apply-poison"
  // Glyphs.
  | "glyph-of-lesser-energy"
  // Shouts and skill effects (#524).
  | "watch-yourself"
  | "healing-signet-armor"
  | "for-great-justice"
  | "critical-eye"
  // Paragon shouts (#921).
  | "fall-back"
  | "stand-your-ground"
  // Paragon shouts and a chant (#956).
  | "incoming"
  | "make-haste"
  | "defensive-anthem"
  | "song-of-restoration"
  // Chants and weapon spells (#758).
  | "anthem-of-flame"
  | "weapon-of-warding"
  // Ritualist weapon spells (#975).
  | "spirit-light-weapon"
  | "weapon-of-quickening"
  | "weapon-of-aggression"
  // Ritualist weapon spells 2 (#1022).
  | "weapon-of-remedy"
  | "vengeful-weapon"
  | "splinter-weapon"
  // Paragon command (#923).
  | "never-surrender"
  // Dervish enchantments and stances (#845).
  | "mystic-regeneration"
  | "fleeting-stability"
  | "heart-of-fury"
  | "vow-of-strength"
  | "sand-shards"
  | "pious-haste"
  | "pious-haste-run"
  // Dervish earth enchantments (#1021).
  | "staggering-force"
  | "dust-cloak"
  | "aura-of-thorns"
  // Spirits' auras (#1064), worn while in a spirit's range.
  | "winnowing"
  | "recuperation";

/** Health one pip of regeneration or degeneration is worth, per second (GW1). */
export const HEALTH_PER_PIP = 2;
/** Energy one pip of regeneration is worth, per second (GW1). */
export const ENERGY_PER_PIP = 1 / 3;
/** The most pips a net regeneration or degeneration can reach, either way (GW1). */
export const MAX_PIPS = 10;

/** A net pip count as it applies: clamped to `MAX_PIPS` either way. */
export function clampPips(pips: number): number {
  return Math.max(-MAX_PIPS, Math.min(MAX_PIPS, pips));
}

/**
 * A chance to block incoming attacks (#534): a blocked attack does nothing.
 * `against` says which attacks: melee blows, projectiles, or both. Spells
 * are never blocked.
 */
export interface BlockRule {
  readonly chance: number;
  readonly against: "all" | "melee" | "projectile";
}

export interface StatusDefinition {
  readonly id: StatusId;
  readonly name: string;
  readonly category: StatusCategory;
  /**
   * The profession of the skill that applies it (#845): "Dervish
   * enchantment" asks this. `undefined`: a condition or anything no
   * profession owns.
   */
  readonly profession: ProfessionId | undefined;
  /**
   * Health regeneration while active, in GW1 pips (`HEALTH_PER_PIP`):
   * negative degenerates. Every status's pips sum, clamped to
   * `MAX_PIPS` either way, and apply continuously, not in lumps.
   */
  readonly healthPips: number;
  /**
   * Health pips for each enchantment on the bearer, itself included,
   * counting at most `max` (#845): Mystic Regeneration. Summed with
   * `healthPips`. `undefined`: none.
   */
  readonly healthPipsPerEnchantment: PipsPerEnchantment | undefined;
  /** Energy regeneration while active, in pips (`ENERGY_PER_PIP`), summed with the base. */
  readonly energyPips: number;
  /** Flat armor modifier while active. */
  readonly armorModifier: number;
  /**
   * Armor added while the bearer is not moving (#921, `Combatant.moving`):
   * "Stand Your Ground!"'s +24.
   */
  readonly armorWhileStill: number;
  /**
   * Health per second healed while the bearer is moving (#921): "Fall
   * Back!"'s. A heal, so `healingMultiplier` scales it; not pips, so
   * outside `MAX_PIPS` and not regeneration.
   */
  readonly healthPerSecondWhileMoving: number;
  /**
   * Health per second healed, moving or not (#975): Spirit Light
   * Weapon's. A heal, like `healthPerSecondWhileMoving`: scaled by
   * `healingMultiplier`, outside `MAX_PIPS` and not regeneration.
   */
  readonly healthPerSecond: number;
  /**
   * Health per second healed on top of `healthPerSecond` while the bearer
   * is within earshot of a living spirit, any team's (#1064): Spirit Light
   * Weapon's "an additional 21 Health per second". A heal, as its sibling.
   */
  readonly healthPerSecondNearSpirit: number;
  /**
   * Armor taken before `armorModifier`s add, never below a floor (#763):
   * Cracked Armor's −20, not below 60. `undefined`: none.
   */
  readonly armorReduction: ArmorReduction | undefined;
  /** Movement speed multiplier while active (1 = unaffected). */
  readonly moveSpeedMultiplier: number;
  /**
   * Chance in [0, 1] that the bearer's *attacks* miss. Drawn from the
   * injectable simulation RNG, never Math.random (brief §35).
   */
  readonly attackMissChance: number;
  /**
   * What the bearer loses of its maximum health (deep wound's signature):
   * `fraction` of it, at most `cap`. `undefined`: none.
   */
  readonly maxHealthLoss: MaxHealthLoss | undefined;
  /**
   * Multiplier on the heals the bearer receives from skills (1 = unaffected).
   * Regeneration and life steal ignore it.
   */
  readonly healingMultiplier: number;
  /**
   * Multiplier on the bearer's weapon roll (#762): weakness's 0.34. An
   * attack skill's bonus damage is not scaled.
   */
  readonly weaponDamageMultiplier: number;
  /**
   * Damage added to each physical hit the bearer takes (#1064):
   * Winnowing's 4. After the attacker's side and before armor, fixed
   * "deals only N damage" hits included: it is on the victim, not on the
   * attack.
   */
  readonly physicalDamageTakenBonus: number;
  /**
   * The type the bearer's attacks deal, the weapon's roll included
   * (#1021): Staggering Force's and Dust Cloak's "your attacks deal
   * earth damage". An attack skill's own `damageType` (Spear of
   * Lightning) still wins. `undefined`: the weapon's.
   */
  readonly attackDamageType: DamageType | undefined;
  /**
   * Added to every attribute of the bearer above rank 0 (#762): weakness's
   * −1. Read through `rankOf` alone (ADR-0019).
   */
  readonly attributeDelta: number;
  /**
   * Multiplier on the bearer's spell cast time; >1 is a penalty. Dazed
   * doubles it. A signet or any other skill that is not a spell ignores
   * it (#524).
   */
  readonly castTimeMultiplier: number;
  /**
   * GW1's daze (#546): applying it interrupts a spell the bearer is
   * casting, and so does every attack that lands on the bearer while it
   * lasts. Anything that is not a spell is left alone.
   */
  readonly interruptsSpells: boolean;
  /**
   * Multiplier on how long the bearer's attacks take, swings and attack
   * skills alike; <1 is faster (ADR-0029). "50% slower" is 1.5, as GW1
   * counts it.
   */
  readonly attackDurationMultiplier: number;
  /** While active, a knockdown does nothing to the bearer (#468). */
  readonly preventsKnockdown: boolean;
  /** It ends when it stops a knockdown (#845): Fleeting Stability. */
  readonly endsOnKnockdownPrevented: boolean;
  /** The bearer's chance to block attacks; `undefined`: none. */
  readonly block: BlockRule | undefined;
  /**
   * `block` holds only while the bearer's health is below this share of
   * its maximum after a deep wound (#988): Shroud of Distress's "if you
   * are below 50% Health". `undefined`: at any health.
   */
  readonly blockBelowHealth: number | undefined;
  /** Added to the bearer's chance to land a critical hit (#988): Critical Eye's 0.13. */
  readonly criticalChanceBonus: number;
  /** Energy the bearer gains on each critical hit it lands, beyond Critical Strikes' (#988). */
  readonly energyPerCritical: number;
  /**
   * It ends after this many incoming attacks, each a hit or a block
   * (#524); `undefined`: only its duration ends it. Counted on each
   * bearer's own status, so allies sharing a shout wear theirs out apart.
   */
  readonly endsAfterAttacks: number | undefined;
  /**
   * Effects on whoever the bearer's physical attacks hit while it lasts
   * (#525): a preparation's rider, as Apply Poison's poison. Applied
   * where a blow lands, swing, attack skill or arrow alike, never on a
   * miss or a block.
   */
  readonly onAttackHit: AttackHitRider | undefined;
  /**
   * It ends after this many of the bearer's hits with a weapon of
   * `weapon` (#939): Sand Shards' "the next 4 times you hit with a
   * scythe". Each victim a blow lands on is a hit, a cleave's included;
   * a blow of another weapon spends none. `undefined`: no such limit.
   */
  readonly endsAfterHits: EndsAfterHits | undefined;
  /**
   * What it does to the bearer's next spells (#526): each costs
   * `costReduction` less energy, and it ends once `count` spells have
   * started. `undefined`: spells leave it alone.
   */
  readonly nextSpells: NextSpells | undefined;
  /**
   * It spreads (#765): every living combatant adjacent to a bearer, on
   * either team, catches it, once per outbreak. Disease's signature.
   */
  readonly spreads: boolean;
  /**
   * Effects on whoever the bearer's next attack skill hits (#758): a
   * chant's rider, as Anthem of Flame's burning. It ends when that attack
   * skill resolves, hit, miss or block, and applies only on a hit.
   * `undefined`: attack skills leave it alone.
   */
  readonly nextAttackSkill: readonly SkillEffect[] | undefined;
  /**
   * It ends the moment the bearer attacks (#758): strikes a blow or
   * releases a shot, swing or attack skill alike. A weapon spell's price.
   */
  readonly endsWhenBearerAttacks: boolean;
  /**
   * It ends the moment the bearer makes a melee attack (#976): a swing or
   * a melee attack skill, hit, miss or block. A shot or a thrown spear
   * keeps it. Escape's price.
   */
  readonly endsWhenBearerAttacksInMelee: boolean;
  /**
   * It ends the moment one of the bearer's attacks hits (#919): a blow
   * lands, swing, attack skill or arrow alike. A miss or a block keeps
   * it. Dark Escape's price.
   */
  readonly endsWhenBearerHits: boolean;
  /**
   * It ends the moment the bearer uses a skill (#949), after its own
   * triggers have answered that use: Diversion's "the next time target
   * foe uses a skill". An interrupted or cancelled skill is not used.
   */
  readonly endsWhenBearerUsesSkill: boolean;
  /**
   * It ends once one of its triggers has fired (#1022): Vengeful Weapon's
   * and Weapon of Remedy's "the next time". Ended where the trigger fires,
   * after its effects, logged as its expiry.
   */
  readonly endsWhenTriggered: boolean;
  /**
   * It ends the moment one of the bearer's attack skills hits (#956): a
   * plain swing or arrow keeps it, as does a miss or a block. Defensive
   * Anthem's price.
   */
  readonly endsWhenBearerHitsWithAttackSkill: boolean;
  /**
   * It ends the moment a new status of one of these categories lands on
   * the bearer (#919): Natural Stride's hex or enchantment. A refresh of
   * one already on it does not end it.
   */
  readonly endsWhenBearerGains: readonly ("hex" | "enchantment")[];
  /**
   * Multiplier on the damage the bearer takes (#919): Frenzy's 2, Dark
   * Escape's 0.5. Applied to every damage packet after armor; health
   * loss and degeneration never pass through it.
   */
  readonly damageTakenMultiplier: number;
  /**
   * The most of its max health the bearer can lose to one hit (#936):
   * Protective Spirit's 0.1. Applied last in `mitigate`, so it caps
   * every typed damage packet; degeneration and sacrifice are not hits.
   * `undefined`: no cap.
   */
  readonly maxDamageFractionPerHit: number | undefined;
  /**
   * The next damage or life steal the bearer would take heals it instead,
   * up to this much, and the status ends (#987): Reversal of Fortune's 67.
   * The whole packet is negated, after `mitigate`; degeneration and
   * sacrifice are neither. `undefined`: no reversal.
   */
  readonly reversesNextDamage: number | undefined;
  /**
   * Strikes of adrenaline the bearer gains on top of each hit it lands
   * (#936): "For Great Justice!"'s 1. Taking damage is not a hit.
   */
  readonly extraStrikesPerHit: number;
  /**
   * The share taken off the recharge of each spell the bearer finishes
   * (#938): Mantra of Recovery's 0.33. Read as the recharge starts, so
   * a recharge already running keeps its length when the status ends.
   */
  readonly spellRechargeFaster: number;
  /**
   * The share taken off the recharge of each binding ritual the bearer
   * finishes (#1064): Weapon of Quickening's 0.33, read as
   * `spellRechargeFaster` is.
   */
  readonly bindingRitualRechargeFaster: number;
  /**
   * Multiplier on how long a hex takes to cast on the bearer (#944): Holy
   * Veil's 2. Read once, as the cast begins; an instant hex stays instant.
   */
  readonly incomingHexCastTimeMultiplier: number;
  /**
   * What it does when its bearer does something (#469): Backfire's damage
   * on each spell the bearer finishes. Applied by whoever put it on.
   */
  readonly triggers: readonly StatusTrigger[];
}

/**
 * Something that happens to the bearer that a status answers (#469):
 * it casts a spell, attacks, gains a condition it did not have (#887), or
 * the status itself ends, for any reason but a refresh or a reset (#887).
 * Or (#935) it completes any skill, lands a hit, or loses health to
 * physical damage. `expires` is only the end of its duration (#944):
 * Patient Spirit's "unless it ends prematurely". Or (#1022) it loses
 * health to damage or life steal from a foe.
 */
export type StatusTriggerEvent =
  | "bearer-casts-spell"
  | "bearer-attacks"
  | "bearer-uses-skill"
  | "bearer-hits"
  | "bearer-takes-physical-damage"
  /**
   * The bearer lost health to damage or life steal from a foe (#1022):
   * any typed packet through `applyDamage`, or a `stealLife`, whose dealer
   * is on the other team. Degeneration, sacrifice and a reversed packet are
   * neither. Recorded with the dealer, and fired at the drain, as hits are.
   */
  | "bearer-takes-damage-from-foe"
  | "bearer-gains-condition"
  | "ends"
  | "expires";

export interface StatusTrigger {
  readonly on: StatusTriggerEvent;
  /**
   * Applied with the status's source as caster, on `target`: the bearer
   * (Backfire's damage), or the source itself (Parasitic Bond's heal, #887).
   * Or `offender` (#1022): the bearer turns on the foe whose damage or
   * steal set it off. The bearer is the effects' caster and that foe their
   * target, so "that ally steals ... from that foe" heals the bearer, and a
   * `remove-status` with `from: "caster"` strips the bearer.
   */
  readonly effects: readonly TriggerEffect[];
  readonly target: "bearer" | "source" | "offender";
  /** The skill the log names it after: "mesmer.backfire". */
  readonly skillId: string;
}

/**
 * What a status adds to each of the bearer's physical hits (#525), and
 * the skill the log names it after, apart from the blow (#939): "Sand
 * Shards hits", not "Scythe hits".
 */
export interface AttackHitRider {
  readonly effects: readonly SkillEffect[];
  readonly skillId: string;
}

/** How many of the bearer's hits, with which weapon, a status lasts (#939). */
export interface EndsAfterHits {
  readonly count: number;
  /** `undefined`: a hit with any weapon whose blow carries riders (#1022): Splinter Weapon's. */
  readonly weapon: AttackWeaponClass | undefined;
}

/**
 * Contagion's spread (#887): the condition the bearer just gained, for the
 * duration it was put on the bearer, on every living foe of the bearer
 * within `radius` of it. It needs positions, so the simulation resolves it.
 */
export interface SpreadGainedConditionEffect {
  readonly kind: "spread-gained-condition";
  readonly radius: number;
}

/** What a trigger can do: any skill effect, or Contagion's spread. */
export type TriggerEffect = SkillEffect | SpreadGainedConditionEffect;

/**
 * What happened to a `StatusSet` that a trigger may answer (#887), in the
 * order it happened, until the simulation drains it: a condition newly on
 * the bearer, or a status gone from it, with who had applied it and
 * whether its duration ran out (`expired`, #944) rather than something
 * ending it. Or (#935) a hit the bearer landed, or physical damage it
 * took, with the triggers on it that answered at that moment (#953): a
 * killing blow ends them before the drain, and they still fire for it.
 * Or (#1022) damage or life steal it took from a foe, with that foe.
 */
export type StatusChange =
  | { readonly kind: "gained-condition"; readonly id: StatusId; readonly durationSeconds: number }
  | {
      readonly kind: "ended";
      readonly id: StatusId;
      readonly sourceId: string;
      readonly expired: boolean;
    }
  | { readonly kind: "hit"; readonly fired: readonly AnsweringTrigger[] }
  | { readonly kind: "took-physical-damage"; readonly fired: readonly AnsweringTrigger[] }
  | {
      readonly kind: "took-damage-from-foe";
      readonly offenderId: string;
      readonly fired: readonly AnsweringTrigger[];
    };

/** A trigger on the bearer that answered an event, the status that holds it, and who applied it. */
export interface AnsweringTrigger {
  readonly statusId: StatusId;
  readonly sourceId: string;
  readonly trigger: StatusTrigger;
}

/** A share of maximum health a status takes, at most `cap` (GW1's deep wound). */
export interface MaxHealthLoss {
  readonly fraction: number;
  readonly cap: number;
}

/** Armor taken, but never below `floor`, nor any armor already under it (#763). */
export interface ArmorReduction {
  readonly amount: number;
  readonly floor: number;
}

/** Pips for each enchantment on the bearer, at most `max` of them counted (#845). */
export interface PipsPerEnchantment {
  readonly pips: number;
  readonly max: number;
}

/** A glyph's hold on the next spells: how many, and how much cheaper (#526). */
export interface NextSpells {
  readonly count: number;
  readonly costReduction: number;
}

function define(
  id: StatusId,
  name: string,
  category: StatusCategory,
  overrides: Partial<Omit<StatusDefinition, "id" | "name" | "category">> = {},
): StatusDefinition {
  return {
    id,
    name,
    category,
    profession: undefined,
    healthPips: 0,
    healthPipsPerEnchantment: undefined,
    energyPips: 0,
    armorModifier: 0,
    armorWhileStill: 0,
    healthPerSecondWhileMoving: 0,
    healthPerSecond: 0,
    healthPerSecondNearSpirit: 0,
    armorReduction: undefined,
    moveSpeedMultiplier: 1,
    attackMissChance: 0,
    maxHealthLoss: undefined,
    healingMultiplier: 1,
    weaponDamageMultiplier: 1,
    physicalDamageTakenBonus: 0,
    attackDamageType: undefined,
    attributeDelta: 0,
    castTimeMultiplier: 1,
    interruptsSpells: false,
    attackDurationMultiplier: 1,
    preventsKnockdown: false,
    endsOnKnockdownPrevented: false,
    block: undefined,
    blockBelowHealth: undefined,
    criticalChanceBonus: 0,
    energyPerCritical: 0,
    endsAfterAttacks: undefined,
    onAttackHit: undefined,
    endsAfterHits: undefined,
    nextSpells: undefined,
    spreads: false,
    nextAttackSkill: undefined,
    endsWhenBearerAttacks: false,
    endsWhenBearerAttacksInMelee: false,
    endsWhenBearerHits: false,
    endsWhenBearerUsesSkill: false,
    endsWhenTriggered: false,
    endsWhenBearerHitsWithAttackSkill: false,
    endsWhenBearerGains: [],
    damageTakenMultiplier: 1,
    maxDamageFractionPerHit: undefined,
    reversesNextDamage: undefined,
    extraStrikesPerHit: 0,
    spellRechargeFaster: 0,
    bindingRitualRechargeFaster: 0,
    incomingHexCastTimeMultiplier: 1,
    triggers: [],
    ...overrides,
  };
}

/**
 * Status definitions. Conditions follow GW1: its mechanics and its
 * magnitudes (#492). Every other status carries its skill's rank-12
 * values.
 */
/** Spiteful Spirit's damage, on its bearer and each ally beside it (#935). */
const SPITEFUL_SPIRIT_DAMAGE: DamageEffect = {
  kind: "damage",
  amount: { flat: 39 },
  type: "shadow",
  armorPenetration: 0,
};
/**
 * Vigorous Spirit's heal, each time its bearer attacks or casts a spell:
 * scaled by its caster's Healing Prayers, as the trigger's caster is the
 * status's source.
 */
const VIGOROUS_SPIRIT_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 17 } },
  perStatusOnTarget: [],
};

export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = {
  bleeding: define("bleeding", "Bleeding", "condition", { healthPips: -3 }),
  burning: define("burning", "Burning", "condition", { healthPips: -7 }),
  poison: define("poison", "Poison", "condition", { healthPips: -4 }),
  crippled: define("crippled", "Crippled", "condition", { moveSpeedMultiplier: 0.5 }),
  blind: define("blind", "Blind", "condition", { attackMissChance: 0.9 }),
  weakness: define("weakness", "Weakness", "condition", {
    weaponDamageMultiplier: 0.34,
    attributeDelta: -1,
  }),
  "cracked-armor": define("cracked-armor", "Cracked Armor", "condition", {
    armorReduction: { amount: 20, floor: 60 },
  }),
  "deep-wound": define("deep-wound", "Deep Wound", "condition", {
    maxHealthLoss: { fraction: 0.2, cap: 100 },
    healingMultiplier: 0.8,
  }),
  dazed: define("dazed", "Dazed", "condition", { castTimeMultiplier: 2, interruptsSpells: true }),
  disease: define("disease", "Disease", "condition", { healthPips: -4, spreads: true }),

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
  // "...move 66% slower for 2...5...6 seconds" (#918).
  "shard-storm": define("shard-storm", "Shard Storm", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
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
        { kind: "splash", radius: AREA_ADJACENT, effects: [SPITEFUL_SPIRIT_DAMAGE] },
      ],
      target: "bearer",
      skillId: "necromancer.spiteful-spirit",
    })),
  }),
  // "For 6 seconds, the next time target foe uses a skill, that skill
  // takes an additional 10...47...56 seconds to recharge" (#949): 47, its
  // rank-12 value.
  diversion: define("diversion", "Diversion", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "lengthen-recharge", seconds: { flat: 47 } }],
        target: "bearer",
        skillId: "mesmer.diversion",
      },
    ],
    endsWhenBearerUsesSkill: true,
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
            radius: AREA_ADJACENT,
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
  // "...move 66% slower for 2...5...6 seconds" (#938).
  "ice-spikes": define("ice-spikes", "Ice Spikes", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 10 seconds, all foes move 66% slower" (#938).
  "deep-freeze": define("deep-freeze", "Deep Freeze", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // Troll Unguent's (a ranger skill), though it is an enchantment here.
  regeneration: define("regeneration", "Regeneration", "enchantment", {
    profession: "ranger",
    healthPips: 4,
  }),
  "blood-ritual": define("blood-ritual", "Blood Ritual", "enchantment", {
    profession: "necromancer",
    energyPips: 3,
  }),
  // The slow is Armor of Earth's price: without it, +24 armor is free.
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", {
    profession: "elementalist",
    armorModifier: 24,
    moveSpeedMultiplier: 0.75,
  }),
  guardian: define("guardian", "Guardian", "enchantment", {
    profession: "monk",
    block: { chance: 0.5, against: "all" },
  }),
  // Mending at rank 12: +3 Health regeneration while maintained (#837).
  mending: define("mending", "Mending", "enchantment", { profession: "monk", healthPips: 3 }),
  // "...Unless Patient Spirit ends prematurely, that ally is healed for
  // 30...102...120 Health when Patient Spirit ends", by its caster's
  // Healing Prayers.
  "patient-spirit": define("patient-spirit", "Patient Spirit", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "expires",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 102 },
            },
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "monk.patient-spirit",
      },
    ],
  }),
  // "While you maintain this enchantment, any hexes cast on target other
  // ally take twice as long to cast. When Holy Veil ends, 1 hex is removed
  // from that ally."
  "holy-veil": define("holy-veil", "Holy Veil", "enchantment", {
    profession: "monk",
    incomingHexCastTimeMultiplier: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "remove-status", category: "hex", count: 1 }],
        target: "bearer",
        skillId: "monk.holy-veil",
      },
    ],
  }),
  // "For 5...19...23 seconds, target ally cannot lose more than 10% max
  // Health from a single hit": 19 s, its rank-12 value, on the skill.
  "protective-spirit": define("protective-spirit", "Protective Spirit", "enchantment", {
    profession: "monk",
    maxDamageFractionPerHit: 0.1,
  }),
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
  // "For 8 seconds, the next time target ally would take damage or life
  // steal, that ally gains that amount of health instead, maximum
  // 15...67...80": 67, its rank-12 cap; the 8 s are the skill's.
  "reversal-of-fortune": define("reversal-of-fortune", "Reversal of Fortune", "enchantment", {
    profession: "monk",
    reversesNextDamage: 67,
  }),
  // "For 30 seconds, each time target ally attacks or casts a spell,
  // that ally is healed for 5...17...20 health", at the caster's rank.
  "vigorous-spirit": define("vigorous-spirit", "Vigorous Spirit", "enchantment", {
    profession: "monk",
    triggers: (["bearer-attacks", "bearer-casts-spell"] as const).map((on) => ({
      on,
      effects: [VIGOROUS_SPIRIT_HEAL],
      target: "bearer",
      skillId: "monk.vigorous-spirit",
    })),
  }),

  sprint: define("sprint", "Sprint", "stance", {
    profession: "warrior",
    moveSpeedMultiplier: 1.25,
  }),
  dash: define("dash", "Dash", "stance", { profession: "assassin", moveSpeedMultiplier: 1.5 }),
  // "For 8 seconds, you attack 33% faster but take double damage": faster
  // is 1 − x (ADR-0029).
  frenzy: define("frenzy", "Frenzy", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    damageTakenMultiplier: 2,
  }),
  // "For 5...13...15 seconds, you move 25% faster and take half damage.
  // Dark Escape ends if you successfully hit with an attack."
  "dark-escape": define("dark-escape", "Dark Escape", "stance", {
    profession: "assassin",
    moveSpeedMultiplier: 1.25,
    damageTakenMultiplier: 0.5,
    endsWhenBearerHits: true,
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
  // "For 5...17...20 seconds, spells you cast recharge 33% faster" (#938).
  "mantra-of-recovery": define("mantra-of-recovery", "Mantra of Recovery", "stance", {
    profession: "mesmer",
    spellRechargeFaster: 0.33,
  }),

  // "Watch Yourself!" at rank 12: +5...21 armor, ending after 1...3 attacks.
  "watch-yourself": define("watch-yourself", "Watch Yourself!", "shout", {
    profession: "warrior",
    armorModifier: 21,
    endsAfterAttacks: 3,
  }),
  // "For Great Justice!" (PvP): "For 8 seconds, whenever you hit with an
  // attack, you gain 1 additional strike of adrenaline."
  "for-great-justice": define("for-great-justice", "For Great Justice!", "shout", {
    profession: "warrior",
    extraStrikesPerHit: 1,
  }),
  // "For 10...30...35 seconds, you have an additional 3...13...15% chance
  // to land a critical hit when attacking. You gain 1 Energy whenever you
  // score a critical hit" (#988). A skill effect: no strip removes it.
  "critical-eye": define("critical-eye", "Critical Eye", "skill-effect", {
    profession: "assassin",
    criticalChanceBonus: 0.13,
    energyPerCritical: 1,
  }),
  "healing-signet-armor": define("healing-signet-armor", "Healing Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: -40,
  }),
  // What a spirit projects on whoever is in its range (#1064): worn while
  // there, never stripped, only escaped. "Non-spirit creatures within
  // range take 4 additional damage whenever they take physical damage."
  winnowing: define("winnowing", "Winnowing", "skill-effect", {
    profession: "ranger",
    physicalDamageTakenBonus: 4,
  }),
  // "Non-Spirit allies within its range gain +1...3...3 Health
  // regeneration": the rank-12 3, as statuses carry fixed numbers.
  recuperation: define("recuperation", "Recuperation", "skill-effect", {
    profession: "ritualist",
    healthPips: 3,
  }),
  // "Fall Back!" at rank 12: 13 Health per second while moving, 33%
  // faster, ending on its bearer's hit.
  "fall-back": define("fall-back", "Fall Back!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
    endsWhenBearerHits: true,
  }),
  // "Stand Your Ground!" at rank 12: +24 armor when not moving, ending if
  // its bearer attacks.
  "stand-your-ground": define("stand-your-ground", "Stand Your Ground!", "shout", {
    profession: "paragon",
    armorWhileStill: 24,
    endsWhenBearerAttacks: true,
  }),
  // "Incoming!" at rank 12: "Fall Back!" with no end on a hit (#956).
  incoming: define("incoming", "Incoming!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
  }),
  // "Make Haste!": 33% faster, until that ally successfully hits (#956).
  "make-haste": define("make-haste", "Make Haste!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    endsWhenBearerHits: true,
  }),
  // "...has a 50% chance to block incoming attacks. This chant ends if
  // that party member hits with an attack skill." (#956)
  "defensive-anthem": define("defensive-anthem", "Defensive Anthem", "chant", {
    profession: "paragon",
    block: { chance: 0.5, against: "all" },
    endsWhenBearerHitsWithAttackSkill: true,
  }),
  // "For 10 seconds, the next time each party member within earshot uses a
  // Skill, that party member gains 45...97...110 Health" (#999, PvP): a
  // heal, by the chanter's Motivation.
  "song-of-restoration": define("song-of-restoration", "Song of Restoration", "chant", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "paragon.motivation", atZero: 45, atTwelve: 97 } },
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "paragon.song-of-restoration",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),

  // "Enemies struck by your physical attacks become poisoned for
  // 3...13...15 seconds": 13 s, its rank-12 value.
  "apply-poison": define("apply-poison", "Apply Poison", "preparation", {
    profession: "ranger",
    onAttackHit: {
      effects: [{ kind: "apply-status", statusId: "poison", durationSeconds: 13 }],
      skillId: "ranger.apply-poison",
    },
  }),

  // "Your next 2 spells cost 10...16...18 less Energy to cast": 16, its
  // rank-12 value; Energy Storage scaling waits for #532.
  "glyph-of-lesser-energy": define("glyph-of-lesser-energy", "Glyph of Lesser Energy", "glyph", {
    profession: "elementalist",
    nextSpells: { count: 2, costReduction: 16 },
  }),

  // "The next attack skill used by each party member within earshot also
  // causes Burning for 1...3...3 seconds": 3 s, its rank-12 value.
  "anthem-of-flame": define("anthem-of-flame", "Anthem of Flame", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
  }),
  // "+2...4...4 Health regeneration and a 50% chance to block. Weapon of
  // Warding ends if that ally attacks."
  "weapon-of-warding": define("weapon-of-warding", "Weapon of Warding", "weapon-spell", {
    profession: "ritualist",
    healthPips: 4,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerAttacks: true,
  }),
  // "Target ally gains 5...21...25 Health per second and an additional
  // 5...21...25 Health per second if that ally is within earshot of a
  // Spirit" (#1064): any team's spirit.
  "spirit-light-weapon": define("spirit-light-weapon", "Spirit Light Weapon", "weapon-spell", {
    profession: "ritualist",
    healthPerSecond: 21,
    healthPerSecondNearSpirit: 21,
  }),
  // "Spells and Binding Rituals recharge 33% faster" (#1064).
  "weapon-of-quickening": define("weapon-of-quickening", "Weapon of Quickening", "weapon-spell", {
    profession: "ritualist",
    spellRechargeFaster: 0.33,
    bindingRitualRechargeFaster: 0.33,
  }),
  // "You attack 25% faster": Heart of Fury's speed-up, as a weapon spell.
  "weapon-of-aggression": define("weapon-of-aggression", "Weapon of Aggression", "weapon-spell", {
    profession: "ritualist",
    attackDurationMultiplier: 0.75,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 20...68...80 health from that foe
  // and loses 2 conditions" (#1022): 68, its rank-12 value, as for every
  // trigger (#935).
  "weapon-of-remedy": define("weapon-of-remedy", "Weapon of Remedy", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [
          { kind: "life-steal", amount: { flat: 68 } },
          { kind: "remove-status", category: "condition", count: 2, from: "caster" },
        ],
        skillId: "ritualist.weapon-of-remedy",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 15...51...60 Health from that foe"
  // (#1022): 51.
  "vengeful-weapon": define("vengeful-weapon", "Vengeful Weapon", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 51 } }],
        skillId: "ritualist.vengeful-weapon",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 20 seconds, target ally's next 1...4...5 attacks deal 5...25...30
  // damage to up to 4 adjacent foes" (#1022): 4 and 25, its rank-12
  // values. Adjacent to the foe hit, that foe excluded, as Sand Shards
  // (#939). GW1's is armor-ignoring physical; typeless ignores armor here.
  "splinter-weapon": define("splinter-weapon", "Splinter Weapon", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      effects: [
        {
          kind: "splash",
          radius: AREA_ADJACENT,
          effects: [
            { kind: "damage", amount: { flat: 25 }, type: "typeless", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "ritualist.splinter-weapon",
    },
    endsAfterHits: { count: 4, weapon: undefined },
  }),

  // "For 5...17...20 seconds, you have 1...3...4 Health regeneration for
  // each Enchantment (maximum of 3) on you."
  "mystic-regeneration": define("mystic-regeneration", "Mystic Regeneration", "enchantment", {
    profession: "dervish",
    healthPipsPerEnchantment: { pips: 3, max: 3 },
  }),
  // "You cannot be knocked down and move 25% faster. This enchantment
  // ends prematurely if it prevents a knockdown."
  "fleeting-stability": define("fleeting-stability", "Fleeting Stability", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    preventsKnockdown: true,
    endsOnKnockdownPrevented: true,
  }),
  // "You attack 25% faster": GW1 counts faster as 1 − x (ADR-0029).
  "heart-of-fury": define("heart-of-fury", "Heart of Fury", "stance", {
    profession: "dervish",
    attackDurationMultiplier: 0.75,
  }),
  // "For 15 seconds, whenever you attack a foe with your scythe, you deal
  // 10...22...25 slashing damage to all adjacent foes": 22, its rank-12
  // value. Hit, miss or block: an attack. Its own Dervish is the splash's
  // centre, so the foe it attacks is among them (#939).
  "vow-of-strength": define("vow-of-strength", "Vow of Strength", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "bearer-attacks",
        target: "bearer",
        effects: [
          {
            kind: "if",
            condition: { kind: "caster-wields", weapon: "scythe" },
            effects: [
              {
                kind: "splash",
                radius: AREA_ADJACENT,
                effects: [
                  { kind: "damage", amount: { flat: 22 }, type: "slashing", armorPenetration: 0 },
                ],
              },
            ],
          },
        ],
        skillId: "dervish.vow-of-strength",
      },
    ],
  }),
  // "For 30 seconds, the next 1...4...5 times you hit with a scythe, all
  // other adjacent foes take 10...50...60 earth damage": 4 and 50, its
  // rank-12 values. Adjacent to the foe hit, not to the Dervish: at melee
  // reach the two barely differ (#939).
  "sand-shards": define("sand-shards", "Sand Shards", "enchantment", {
    profession: "dervish",
    onAttackHit: {
      effects: [
        {
          kind: "if",
          condition: { kind: "caster-wields", weapon: "scythe" },
          effects: [
            {
              kind: "splash",
              radius: AREA_ADJACENT,
              effects: [
                { kind: "damage", amount: { flat: 50 }, type: "earth", armorPenetration: 0 },
              ],
            },
          ],
        },
      ],
      skillId: "dervish.sand-shards",
    },
    endsAfterHits: { count: 4, weapon: "scythe" },
  }),
  // "...for 1...6...7 [seconds] you move 25% faster. If an enchantment was
  // removed, you run 50% faster instead" (#939): two stances, so the
  // faster replaces the slower as it lands.
  "pious-haste": define("pious-haste", "Pious Haste", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
  }),
  "pious-haste-run": define("pious-haste-run", "Pious Haste (run)", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.5,
  }),
  // "For 30 seconds, your attacks deal earth damage. When this enchantment
  // ends, all nearby foes have Cracked Armor for 1...8...10 seconds" (#1021):
  // 8 s, its rank-12 value. Any end counts: expiry, a strip, a death.
  "staggering-force": define("staggering-force", "Staggering Force", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            radius: AREA_NEARBY,
            effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 }],
          },
        ],
        skillId: "dervish.staggering-force",
      },
    ],
  }),
  // "For 30 seconds, your attacks deal earth damage. When this Enchantment
  // ends, all nearby foes are Blinded for 1...3...4 seconds" (#1021): 3 s.
  "dust-cloak": define("dust-cloak", "Dust Cloak", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            radius: AREA_NEARBY,
            effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.dust-cloak",
      },
    ],
  }),
  // "For 30 seconds, this enchantment does nothing. When this enchantment
  // ends, all nearby foes are Crippled for 3...7...8 seconds" (#1021): 7 s.
  // Until then it counts as a Dervish enchantment, nothing more.
  "aura-of-thorns": define("aura-of-thorns", "Aura of Thorns", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            radius: AREA_NEARBY,
            effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 7 }],
          },
        ],
        skillId: "dervish.aura-of-thorns",
      },
    ],
  }),
  // PvP "Never Surrender!" at rank 12: +4 Health regeneration (#923).
  "never-surrender": define("never-surrender", "Never Surrender!", "shout", {
    profession: "paragon",
    healthPips: 4,
  }),
};

/**
 * One application of a spreading status by a skill, and everyone it has
 * reached (#765): the bearer it was applied to, and each combatant that
 * caught it since. Shared by every copy it spread to, so a cured
 * combatant still next to a carrier of the same outbreak is not caught
 * again. A new cast is a new outbreak. Compared by identity, so it needs
 * no id, and it is gone once no status holds it.
 */
export interface Outbreak {
  readonly infected: Set<string>;
}

export interface ActiveStatus {
  readonly id: StatusId;
  /** Seconds of duration still remaining. */
  remainingSeconds: number;
  /** The length of the application that set this entry: a duration bar's full width. */
  durationSeconds: number;
  /** Incoming attacks before it ends (`endsAfterAttacks`); `undefined`: no such limit. */
  attacksLeft: number | undefined;
  /** The bearer's hits before it ends (`endsAfterHits`); `undefined`: no such limit. */
  hitsLeft: number | undefined;
  /** Spells still to start before it ends (`nextSpells`); `undefined`: no such limit. */
  spellsLeft: number | undefined;
  /** Who applied it — needed so a future "when this ends, heal the caster"
   *  effect knows whom to credit. */
  readonly sourceId: string;
  /** The outbreak it belongs to, for a status that spreads; `null` for every other. */
  outbreak: Outbreak | null;
  /**
   * Set for a maintained enchantment (#837): one with no end of its own,
   * which costs its caster an energy pip while it lasts. `seq` orders its
   * caster's, newest highest. `outOfRangeSeconds`: how long its bearer has
   * been beyond compass range of its caster, without a break (#839).
   * `null` for every other status.
   */
  readonly maintained: { readonly seq: number; outOfRangeSeconds: number } | null;
  /**
   * Worn from a spirit while in its range (#1064, `project`): no end of its
   * own, and it leaves when its bearer does. `false` for every other.
   */
  readonly projected: boolean;
}

export function isStatusId(value: unknown): value is StatusId {
  return typeof value === "string" && Object.hasOwn(STATUS_DEFINITIONS, value);
}

/** Look up a status from an id of unknown provenance (a wire string, a tooltip). */
export function findStatusDefinition(id: string): StatusDefinition | undefined {
  return isStatusId(id) ? STATUS_DEFINITIONS[id] : undefined;
}

export function getStatusDefinition(id: StatusId): StatusDefinition {
  return STATUS_DEFINITIONS[id];
}

/**
 * All active statuses on one combatant, plus the lifecycle rules that
 * govern them.
 */
export class StatusSet {
  readonly #statuses = new Map<StatusId, ActiveStatus>();
  #changes: StatusChange[] = [];

  /**
   * What happened to this set since the last drain (#887), oldest first,
   * and forget it: the simulation reads it once a tick for the triggers.
   */
  public drainChanges(): StatusChange[] {
    const changes = this.#changes;
    this.#changes = [];
    return changes;
  }

  /**
   * Take `ids` off the bearer, each recorded as ended: `expired` when its
   * duration ran out (`advance`), and for every other end not (#944).
   */
  #end(ids: readonly StatusId[], expired = false): void {
    for (const id of ids) {
      const status = this.#statuses.get(id);
      if (status !== undefined) {
        this.#statuses.delete(id);
        this.#changes.push({ kind: "ended", id, sourceId: status.sourceId, expired });
      }
    }
  }

  /**
   * The bearer landed a hit (#935), recorded only if a status on it
   * answers one, with the triggers that do (#953).
   */
  public recordHit(): void {
    const fired = this.#answering("bearer-hits");
    if (fired.length > 0) {
      this.#changes.push({ kind: "hit", fired });
    }
  }

  /**
   * The bearer lost health to physical damage (#935), recorded only if a
   * status on it answers that, with the triggers that do (#953).
   */
  public recordPhysicalDamage(): void {
    const fired = this.#answering("bearer-takes-physical-damage");
    if (fired.length > 0) {
      this.#changes.push({ kind: "took-physical-damage", fired });
    }
  }

  /**
   * The bearer lost health to damage or life steal from `offenderId`, a
   * foe (#1022), recorded only if a status on it answers that, with the
   * triggers that do. A status already waiting to answer one, undrained,
   * does not answer another: it fires once, at the first foe.
   */
  public recordDamageFromFoe(offenderId: string): void {
    const pending = new Set(
      this.#changes.flatMap((change) =>
        change.kind === "took-damage-from-foe" ? change.fired.map(({ statusId }) => statusId) : [],
      ),
    );
    const fired = this.#answering("bearer-takes-damage-from-foe").filter(
      ({ statusId }) => !pending.has(statusId),
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "took-damage-from-foe", offenderId, fired });
    }
  }

  #answering(event: StatusTriggerEvent): AnsweringTrigger[] {
    return this.triggersOn(event);
  }

  /** Record a condition newly on the bearer (#887); any other category is not one. */
  #gained(id: StatusId, durationSeconds: number): void {
    if (getStatusDefinition(id).category === "condition") {
      this.#changes.push({ kind: "gained-condition", id, durationSeconds });
    }
  }

  public get active(): readonly ActiveStatus[] {
    return [...this.#statuses.values()];
  }

  public has(id: StatusId): boolean {
    return this.#statuses.has(id);
  }

  public get(id: StatusId): ActiveStatus | undefined {
    return this.#statuses.get(id);
  }

  public get size(): number {
    return this.#statuses.size;
  }

  /**
   * Apply (or refresh) a status. Durations do not stack — the longer of
   * the existing and incoming duration wins, so re-applying a shorter
   * one never shortens a longer one already running. In an exclusive
   * category the new one replaces every one of its category, itself
   * included, at the incoming duration (a stance, #523).
   *
   * A status that spreads starts a new outbreak, even where the duration
   * already running is the longer one: a new cast is a new outbreak (#765).
   *
   * Returns whether it is newly on the bearer: `false` for a refresh, or
   * for a duration of nothing. What a status does once, as it lands
   * (deep wound's health), hangs on this. A status newly on it ends every
   * one that ends when its bearer gains that category (#919).
   */
  public apply(id: StatusId, durationSeconds: number, sourceId: string): boolean {
    if (durationSeconds <= 0) {
      return false;
    }
    const wasActive = this.#statuses.has(id);
    const definition = getStatusDefinition(id);
    if (EXCLUSIVE_CATEGORIES.has(definition.category)) {
      this.removeByCategory(definition.category);
    }
    const existing = this.#statuses.get(id);
    const outbreak = definition.spreads ? { infected: new Set<string>() } : null;
    // A re-application is the newest, whichever duration wins: removal
    // takes the newest first (`removeByCategory`).
    this.#statuses.delete(id);
    if (existing !== undefined && existing.remainingSeconds >= durationSeconds) {
      existing.outbreak = outbreak;
      this.#statuses.set(id, existing);
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      durationSeconds,
      attacksLeft: definition.endsAfterAttacks,
      hitsLeft: definition.endsAfterHits?.count,
      spellsLeft: definition.nextSpells?.count,
      sourceId,
      outbreak,
      maintained: null,
      projected: false,
    });
    if (!wasActive) {
      this.#gained(id, durationSeconds);
      this.#endOnGaining(definition.category);
    }
    return !wasActive;
  }

  /**
   * Catch a spreading status from a bearer of `outbreak` (#765). The
   * longer duration wins, as for `apply`, but a combatant already
   * carrying it keeps the outbreak it has.
   */
  public catch(id: StatusId, durationSeconds: number, sourceId: string, outbreak: Outbreak): void {
    if (durationSeconds <= 0) {
      return;
    }
    const existing = this.#statuses.get(id);
    if (existing !== undefined) {
      existing.remainingSeconds = Math.max(existing.remainingSeconds, durationSeconds);
      // A bar is never over full.
      existing.durationSeconds = Math.max(existing.durationSeconds, existing.remainingSeconds);
      return;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      durationSeconds,
      attacksLeft: undefined,
      hitsLeft: undefined,
      spellsLeft: undefined,
      sourceId,
      outbreak,
      maintained: null,
      projected: false,
    });
    this.#gained(id, durationSeconds);
  }

  /**
   * Maintain an enchantment from `sourceId` (#837): it lasts until
   * something ends it, so `advance` never expires it. One of the same id
   * already on the bearer is replaced, whoever maintains it, and this one
   * is the newest, as `apply` makes it. Returns whether it is newly on the
   * bearer; one that is ends what `apply` would end. Throws for a status that is not an enchantment: a catalog bug,
   * not data.
   */
  public maintain(id: StatusId, sourceId: string, seq: number): boolean {
    if (getStatusDefinition(id).category !== "enchantment") {
      throw new Error(`only an enchantment can be maintained, not ${id}`);
    }
    const wasActive = this.#statuses.delete(id);
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      spellsLeft: undefined,
      sourceId,
      outbreak: null,
      maintained: { seq, outOfRangeSeconds: 0 },
      projected: false,
    });
    if (!wasActive) {
      this.#endOnGaining("enchantment");
    }
    return !wasActive;
  }

  /**
   * Wear `id` from a spirit, `sourceId` (#1064), for as long as the
   * simulation keeps projecting it: `advance` never expires it, and it is
   * removed when its bearer leaves every such spirit's range. Already
   * worn: nothing. Returns whether it is newly on the bearer.
   */
  public project(id: StatusId, sourceId: string): boolean {
    if (this.#statuses.has(id)) {
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      spellsLeft: undefined,
      sourceId,
      outbreak: null,
      maintained: null,
      projected: true,
    });
    this.#endOnGaining(getStatusDefinition(id).category);
    return true;
  }

  /** A status of `category` is newly on the bearer (#919): Natural Stride ends on a hex. */
  #endOnGaining(category: StatusCategory): void {
    this.#end(
      this.active
        .filter(({ id }) =>
          getStatusDefinition(id).endsWhenBearerGains.some((gained) => gained === category),
        )
        .map(({ id }) => id),
    );
  }

  /**
   * Remove every status, of every category: what a respawn leaves. A
   * reset, not an ending: nothing is recorded (#887).
   */
  public clear(): void {
    this.#statuses.clear();
  }

  /**
   * End every status, of every category, each recorded as ended, in
   * `active` order: what a death does (#940), so every `ends` trigger fires.
   */
  public endAll(): void {
    this.#end([...this.#statuses.keys()]);
  }

  /** End one status by id, recorded as ended (#1022): a trigger that spends it. */
  public end(id: StatusId): void {
    this.#end([id]);
  }

  /** Remove one status by id. Returns whether anything was removed. */
  public remove(id: StatusId): boolean {
    const had = this.#statuses.has(id);
    this.#end([id]);
    return had;
  }

  /**
   * Remove up to `count` statuses of a category — the shape every
   * "remove a condition"/"strip an enchantment" skill needs. Returns the
   * ids actually removed, so a caller can report exactly what it stripped.
   *
   * The newest applied goes first, as in GW1 (#521), where covering an
   * important enchantment or condition with a cheaper one is a tactic.
   * With a `profession`, only that profession's statuses go (#845): "lose
   * 1 Dervish enchantment".
   */
  public removeByCategory(
    category: StatusCategory,
    count = Number.POSITIVE_INFINITY,
    profession?: ProfessionId,
  ): StatusId[] {
    const removed: StatusId[] = [];
    for (const status of [...this.#statuses.values()].reverse()) {
      if (removed.length >= count) {
        break;
      }
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession)
      ) {
        removed.push(status.id);
      }
    }
    this.#end(removed);
    return removed;
  }

  /**
   * Spend the newest status that reverses the next damage (#987),
   * recorded as ended, and return its cap; `undefined` if none is up.
   */
  public takeReversal(): { readonly id: StatusId; readonly cap: number } | undefined {
    for (const status of [...this.#statuses.values()].reverse()) {
      const cap = getStatusDefinition(status.id).reversesNextDamage;
      if (cap !== undefined) {
        this.#end([status.id]);
        return { id: status.id, cap };
      }
    }
    return undefined;
  }

  /**
   * Take up to `count` statuses of a category off the bearer, newest first,
   * as `removeByCategory`, with the time each had left (#944): Plague
   * Touch's "transfer ... with their remaining durations".
   */
  public takeNewest(
    category: StatusCategory,
    count: number,
  ): { id: StatusId; remainingSeconds: number }[] {
    const taken = [...this.#statuses.values()]
      .reverse()
      .filter(({ id }) => getStatusDefinition(id).category === category)
      .slice(0, count)
      .map(({ id, remainingSeconds }) => ({ id, remainingSeconds }));
    this.#end(taken.map(({ id }) => id));
    return taken;
  }

  /**
   * An attack hit the bearer or was blocked (#524): one fewer for every
   * status that ends after so many. Returns the ids that ended on it.
   */
  public countIncomingAttack(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.attacksLeft !== undefined) {
        status.attacksLeft -= 1;
        if (status.attacksLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * One of the bearer's blows of `weaponId` hit (#939): one fewer for
   * every status that ends after so many hits with a weapon it is, or
   * with any weapon (#1022). Returns
   * the ids that ended on it.
   */
  public countHit(weaponId: WeaponId): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      const limit = getStatusDefinition(status.id).endsAfterHits;
      if (
        status.hitsLeft !== undefined &&
        limit !== undefined &&
        (limit.weapon === undefined || wieldsFor(weaponId, limit.weapon))
      ) {
        status.hitsLeft -= 1;
        if (status.hitsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * A spell of the bearer's started (#526): one fewer for every status
   * that holds the next spells. Returns the ids that ended on it.
   */
  public countSpellStarted(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.spellsLeft !== undefined) {
        status.spellsLeft -= 1;
        if (status.spellsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer attacked (#758): every status that ends when it does is
   * gone, and, if it was a melee attack, every one that ends on one
   * (#976). Returns the ids that ended on it.
   */
  public endOnBearerAttack(kind: "melee" | "projectile"): StatusId[] {
    const ended = this.active
      .filter(({ id }) => {
        const definition = getStatusDefinition(id);
        return (
          definition.endsWhenBearerAttacks ||
          (kind === "melee" && definition.endsWhenBearerAttacksInMelee)
        );
      })
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer used a skill (#949): every status that ends when it does
   * is gone, but those in `spared`, which that skill put on its own user
   * (#999). Returns the ids that ended on it.
   */
  public endOnBearerUseSkill(spared: ReadonlySet<StatusId>): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsWhenBearerUsesSkill && !spared.has(id))
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * One of the bearer's attacks hit (#919): every status that ends when it
   * does is gone, and, if it was an attack skill, every one that ends when
   * an attack skill hits (#956). Returns the ids that ended on it.
   */
  public endOnBearerHit(withAttackSkill: boolean): StatusId[] {
    const ended = this.active
      .filter(({ id }) => {
        const definition = getStatusDefinition(id);
        return (
          definition.endsWhenBearerHits ||
          (withAttackSkill && definition.endsWhenBearerHitsWithAttackSkill)
        );
      })
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * A knockdown was stopped (#845): every status that ends when it stops
   * one is gone. Returns the ids that ended on it.
   */
  public endOnKnockdownPrevented(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsOnKnockdownPrevented)
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * Every trigger on the bearer that answers `event` (#469), in `active`
   * order, with who applied the status that holds it.
   */
  public triggersOn(
    event: StatusTriggerEvent,
  ): { statusId: StatusId; sourceId: string; trigger: StatusTrigger }[] {
    return this.active.flatMap(({ id, sourceId }) =>
      getStatusDefinition(id)
        .triggers.filter((trigger) => trigger.on === event)
        .map((trigger) => ({ statusId: id, sourceId, trigger })),
    );
  }

  /** How many are up of a category; with a `profession`, only that profession's (#1021). */
  public countByCategory(category: StatusCategory, profession?: ProfessionId): number {
    let count = 0;
    for (const status of this.#statuses.values()) {
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession)
      ) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Advance all durations by `dt` seconds, dropping any that expire.
   * Returns the ids that expired on this tick so the caller can emit
   * end-of-status effects.
   */
  public advance(dt: number): StatusId[] {
    const expired: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      status.remainingSeconds -= dt;
      if (status.remainingSeconds <= 0) {
        expired.push(status.id);
      }
    }
    this.#end(expired, true);
    return expired;
  }
}

/**
 * How long a status lasts on `target`: its nominal duration, shortened
 * by the target's condition-duration runes (a Rune of Restoration takes
 * bleeding to 80%). Every path that puts a status on a combatant asks
 * this first, so a rune cannot work for skills and not for dummies. The
 * scale is the wearer's, never the caster's.
 */
export function scaledStatusDuration(
  target: Pick<Combatant, "equipment">,
  statusId: StatusId,
  durationSeconds: number,
): number {
  return durationSeconds * (target.equipment.statusDurationScale.get(statusId) ?? 1);
}

/* -------------------------------------------------------------------------- */
/* Aggregated modifiers                                                        */
/* -------------------------------------------------------------------------- */

export interface StatusModifiers {
  /** Every status's health pips, summed and not yet clamped. */
  readonly healthPips: number;
  /** Every status's energy pips, summed and not yet clamped. */
  readonly energyPips: number;
  readonly armorModifier: number;
  /** Every status's, summed: armor while the bearer is not moving (#921). */
  readonly armorWhileStill: number;
  /** Every status's, summed: health per second while the bearer is moving (#921). */
  readonly healthPerSecondWhileMoving: number;
  /** Every status's, summed: health per second, moving or not (#975). */
  readonly healthPerSecond: number;
  /** Every status's, summed: health per second near a spirit (#1064). */
  readonly healthPerSecondNearSpirit: number;
  /** The largest armor reduction; `undefined`: none. */
  readonly armorReduction: ArmorReduction | undefined;
  readonly moveSpeedMultiplier: number;
  readonly attackMissChance: number;
  /** The largest single status's: losses do not add up. */
  readonly maxHealthLoss: MaxHealthLoss | undefined;
  /** Every status's, multiplied, and floored at `HEALING_MULTIPLIER_FLOOR`. */
  readonly healingMultiplier: number;
  readonly weaponDamageMultiplier: number;
  /** Every status's, summed (#1064). */
  readonly physicalDamageTakenBonus: number;
  readonly attributeDelta: number;
  readonly castTimeMultiplier: number;
  readonly attackDurationMultiplier: number;
  /** Every status's, multiplied (#919). */
  readonly damageTakenMultiplier: number;
  /** The lowest single status's (#936); `undefined`: no cap. */
  readonly maxDamageFractionPerHit: number | undefined;
  /** Every status's, summed (#936). */
  readonly extraStrikesPerHit: number;
  /**
   * The share taken off a spell's recharge (#938): several combine as
   * 1 − Π(1 − f), never more than `MAX_RECHARGE_REDUCTION` (#975).
   */
  readonly spellRechargeFaster: number;
  /** As `spellRechargeFaster`, for a binding ritual (#1064). */
  readonly bindingRitualRechargeFaster: number;
  /** Every status's, multiplied (#944). */
  readonly incomingHexCastTimeMultiplier: number;
  /** Every status's, summed (#988). */
  readonly criticalChanceBonus: number;
  /** Every status's, summed (#988). */
  readonly energyPerCritical: number;
}

/**
 * The most recharge reductions together take off (GW1, "Recharge"): they
 * multiply, and never shorten a recharge by more than half.
 */
export const MAX_RECHARGE_REDUCTION = 0.5;

/**
 * A spell's recharge of `seconds`, `faster` shorter (`StatusModifiers.
 * spellRechargeFaster`, #975): never below 1 s, and one already under
 * 1 s is not raised to it.
 */
export function reducedRecharge(seconds: number, faster: number): number {
  return faster > 0 ? Math.max(Math.min(seconds, 1), seconds * (1 - faster)) : seconds;
}

/** The weakest heals get, whatever reduces them (GW1: at most −40%). */
export const HEALING_MULTIPLIER_FLOOR = 0.6;

/**
 * Collapse every active status into one set of modifiers.
 *
 * Additive effects (health and energy pips, armor, attributes) sum;
 * multiplicative ones (move speed, healing, weapon damage, cast time,
 * damage taken, a hex's cast time on the bearer) multiply; miss chance takes the
 * worst rather than compounding, so two blinding effects cannot push a
 * player past certain failure in a way that feels arbitrary. A maximum
 * health loss and an armor reduction are each the largest single one,
 * a cap on damage per hit the lowest (#936), and healing is floored at `HEALING_MULTIPLIER_FLOOR`.
 * Attack duration is GW1's rule: only the strongest speed-up and the
 * strongest slow-down count, and they multiply. Pips per enchantment
 * (#845) count every enchantment in `statuses`, the one giving them
 * included.
 */
export function aggregateModifiers(statuses: readonly Pick<ActiveStatus, "id">[]): StatusModifiers {
  let healthPips = 0;
  let energyPips = 0;
  let armorModifier = 0;
  let armorWhileStill = 0;
  let healthPerSecondWhileMoving = 0;
  let healthPerSecond = 0;
  let healthPerSecondNearSpirit = 0;
  let armorReduction: ArmorReduction | undefined;
  let moveSpeedMultiplier = 1;
  let attackMissChance = 0;
  let maxHealthLoss: MaxHealthLoss | undefined;
  const healingMultipliers: number[] = [];
  let weaponDamageMultiplier = 1;
  let physicalDamageTakenBonus = 0;
  let attributeDelta = 0;
  let castTimeMultiplier = 1;
  let attackFaster = 1;
  let attackSlower = 1;
  let damageTakenMultiplier = 1;
  let maxDamageFractionPerHit: number | undefined;
  let extraStrikesPerHit = 0;
  let spellRechargeKept = 1;
  let bindingRitualRechargeKept = 1;
  let incomingHexCastTimeMultiplier = 1;
  let criticalChanceBonus = 0;
  let energyPerCritical = 0;
  const enchantments = statuses.filter(
    (status) => getStatusDefinition(status.id).category === "enchantment",
  ).length;

  for (const status of statuses) {
    const def = getStatusDefinition(status.id);
    healthPips += def.healthPips;
    if (def.healthPipsPerEnchantment !== undefined) {
      const { pips, max } = def.healthPipsPerEnchantment;
      healthPips += pips * Math.min(enchantments, max);
    }
    energyPips += def.energyPips;
    armorModifier += def.armorModifier;
    armorWhileStill += def.armorWhileStill;
    healthPerSecondWhileMoving += def.healthPerSecondWhileMoving;
    healthPerSecond += def.healthPerSecond;
    healthPerSecondNearSpirit += def.healthPerSecondNearSpirit;
    if (
      def.armorReduction !== undefined &&
      (armorReduction === undefined || def.armorReduction.amount > armorReduction.amount)
    ) {
      armorReduction = def.armorReduction;
    }
    moveSpeedMultiplier *= def.moveSpeedMultiplier;
    attackMissChance = Math.max(attackMissChance, def.attackMissChance);
    if (
      def.maxHealthLoss !== undefined &&
      (maxHealthLoss === undefined || def.maxHealthLoss.fraction > maxHealthLoss.fraction)
    ) {
      maxHealthLoss = def.maxHealthLoss;
    }
    healingMultipliers.push(def.healingMultiplier);
    weaponDamageMultiplier *= def.weaponDamageMultiplier;
    physicalDamageTakenBonus += def.physicalDamageTakenBonus;
    attributeDelta += def.attributeDelta;
    castTimeMultiplier *= def.castTimeMultiplier;
    attackFaster = Math.min(attackFaster, def.attackDurationMultiplier);
    attackSlower = Math.max(attackSlower, def.attackDurationMultiplier);
    damageTakenMultiplier *= def.damageTakenMultiplier;
    if (
      def.maxDamageFractionPerHit !== undefined &&
      (maxDamageFractionPerHit === undefined ||
        def.maxDamageFractionPerHit < maxDamageFractionPerHit)
    ) {
      maxDamageFractionPerHit = def.maxDamageFractionPerHit;
    }
    extraStrikesPerHit += def.extraStrikesPerHit;
    spellRechargeKept *= 1 - def.spellRechargeFaster;
    bindingRitualRechargeKept *= 1 - def.bindingRitualRechargeFaster;
    incomingHexCastTimeMultiplier *= def.incomingHexCastTimeMultiplier;
    criticalChanceBonus += def.criticalChanceBonus;
    energyPerCritical += def.energyPerCritical;
  }

  return {
    healthPips,
    energyPips,
    armorModifier,
    armorWhileStill,
    healthPerSecondWhileMoving,
    healthPerSecond,
    healthPerSecondNearSpirit,
    armorReduction,
    moveSpeedMultiplier,
    attackMissChance,
    maxHealthLoss,
    healingMultiplier: combinedHealingMultiplier(healingMultipliers),
    weaponDamageMultiplier,
    physicalDamageTakenBonus,
    attributeDelta,
    castTimeMultiplier,
    attackDurationMultiplier: attackFaster * attackSlower,
    damageTakenMultiplier,
    maxDamageFractionPerHit,
    extraStrikesPerHit,
    spellRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - spellRechargeKept),
    bindingRitualRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - bindingRitualRechargeKept),
    incomingHexCastTimeMultiplier,
    criticalChanceBonus,
    energyPerCritical,
  };
}

/**
 * Several healing reductions together (GW1): they multiply, and heals are
 * never cut below `HEALING_MULTIPLIER_FLOOR`.
 */
export function combinedHealingMultiplier(multipliers: readonly number[]): number {
  return Math.max(
    HEALING_MULTIPLIER_FLOOR,
    multipliers.reduce((product, multiplier) => product * multiplier, 1),
  );
}
