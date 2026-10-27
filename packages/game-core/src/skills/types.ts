import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";

import type { ResolvedEquipment } from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import type { ProfessionId } from "../professions.js";
import type { CastState } from "./cast-state.js";
import type { AttackState } from "./weapon-attack.js";
import type { StatusCategory, StatusId, StatusSet } from "./status.js";

/**
 * The composable skill/effect system (brief §6).
 *
 * The central design rule: a skill is *data* — an identity plus a list of
 * effects — never a bespoke class with custom logic. Adding a skill means
 * adding a record; adding a new *mechanic* means adding one effect kind
 * plus its handler. This is what makes "hundreds of skills without a
 * switch statement the size of a building" (brief §41) achievable.
 */

export type ResourceKind = "energy" | "adrenaline";

export interface SkillCost {
  readonly kind: ResourceKind;
  readonly amount: number;
}

/**
 * How a skill's magnitude scales with an attribute rank.
 *
 * `atZero`/`atTwelve` mirror how the source corpus expresses scaling
 * ("1...16...20" = value at rank 0, 12, and 15). We interpolate linearly
 * between the rank-0 and rank-12 values, which is both the dominant shape
 * in the real data and trivially testable — rather than encoding a
 * bespoke curve per skill.
 */
export interface AttributeScaling {
  readonly attributeId: string;
  readonly atZero: number;
  readonly atTwelve: number;
}

/** A magnitude that is either flat or attribute-scaled. */
export type Magnitude = { readonly flat: number } | { readonly scaling: AttributeScaling };

export type TargetRule =
  | "self"
  | "single-enemy"
  | "single-ally"
  /** An ally other than the caster (GW1's "Cannot target self"). */
  | "single-other-ally"
  /** Any single target including self; the caster chooses. */
  | "single-any"
  /** A dead ally other than the caster: a resurrection's (#812). */
  | "single-dead-ally";

/* -------------------------------------------------------------------------- */
/* Effects                                                                     */
/* -------------------------------------------------------------------------- */

export interface DamageEffect {
  readonly kind: "damage";
  readonly amount: Magnitude;
  /** GW1's type, which decides the typed armor that applies (#759). */
  readonly type: DamageType;
  /** The share of the target's armor it ignores, 0..1: Lightning Orb's 0.25 (#761). */
  readonly armorPenetration: number;
  /**
   * The amount is per point of energy the same target lost to an earlier
   * `energy-loss` of this skill, as Energy Burn's "9 damage for each
   * point of energy lost" (#793). None lost: no damage.
   */
  readonly perEnergyLost?: true;
}

export interface HealEffect {
  readonly kind: "heal";
  readonly amount: Magnitude;
  /**
   * `caster`: the caster is healed, as Drain Enchantment's "you gain N
   * Health" (#521). Absent: the target.
   */
  readonly recipient?: "caster";
}

export interface EnergyGainEffect {
  readonly kind: "energy-gain";
  readonly amount: Magnitude;
  /**
   * Per point of energy the target lost to an earlier `energy-loss`, as
   * Energy Tap's "2 Energy for each point of Energy target foe lost"
   * (#793). None lost: no gain.
   */
  readonly perEnergyLost?: true;
}

/** The effect's target loses up to `amount` energy (never below 0). */
export interface EnergyLossEffect {
  readonly kind: "energy-loss";
  readonly amount: Magnitude;
}

/** Health sacrificed by the *caster*, as a percentage of their maximum. */
export interface SacrificeHealthEffect {
  readonly kind: "sacrifice-health";
  readonly percentOfMax: number;
}

/** Apply a condition/hex/enchantment to the effect's target. */
export interface ApplyStatusEffect {
  readonly kind: "apply-status";
  readonly statusId: StatusId;
  readonly durationSeconds: number;
}

/** Remove up to `count` statuses of a category from the target. */
export interface RemoveStatusEffect {
  readonly kind: "remove-status";
  readonly category: StatusCategory;
  readonly count: number;
}

/**
 * Interrupt the target's in-progress cast (brief §14). Only lands if the
 * target is actually casting — a mistimed interrupt is wasted, which is
 * the entire skill-expression point of the mechanic.
 */
export interface InterruptEffect {
  readonly kind: "interrupt";
  /**
   * `spell-or-chant`: only a spell (`isSpell`) or a chant is interrupted,
   * as Power Spike's "If target foe is casting a Spell or Chant" (#521).
   * Anything else is left alone, as if the target were not casting.
   */
  readonly only?: "spell-or-chant";
}

/**
 * Knock the target down (#468): for `durationSeconds` it cannot move,
 * attack or use skills, and whatever it was doing ends. Not an
 * interrupt, and not a status: `Combatant.knockdownRemaining`.
 */
export interface KnockdownEffect {
  readonly kind: "knockdown";
  readonly durationSeconds: number;
}

/**
 * Bring a dead target back to life where it lies (#812), with these
 * percentages of its maximum health and energy, as Restore Life's
 * "returned to life with 20...56...65% health and 42...80...90% energy".
 * A living target is left alone.
 */
export interface ResurrectEffect {
  readonly kind: "resurrect";
  readonly healthPercent: Magnitude;
  readonly energyPercent: Magnitude;
}

/** How long "knocks down" lasts when a skill names no duration (GW1). */
export const KNOCKDOWN_SECONDS = 2;

/** What an earlier effect of the same skill did to the same target (#521). */
export type EventCondition =
  /** An `interrupt` earlier in the list cancelled an action. */
  | { readonly kind: "interrupted" }
  /** A `remove-status` earlier in the list removed at least one status of this category. */
  | { readonly kind: "removed"; readonly category: StatusCategory };

/**
 * How the target or the caster stands (#794), read once, before any
 * effect of the skill lands, so a heal cannot lift its own target out of
 * its bonus.
 */
export type StateCondition =
  /** The effect's target is below this fraction of its maximum health (0.5 = 50%). */
  | { readonly kind: "target-health-below"; readonly fraction: number }
  /** The effect's target has at least one status of this category. */
  | { readonly kind: "target-has"; readonly category: StatusCategory }
  /** The effect's target is activating a spell (`isSpell`); a chant is not one. */
  | { readonly kind: "target-casting"; readonly spell: true }
  /** The caster has at least one status of this category. */
  | { readonly kind: "caster-has"; readonly category: StatusCategory };

export type EffectCondition = EventCondition | StateCondition;

/**
 * Effects that land only if a condition holds for the same target: an
 * earlier effect of the skill did something to it (#521), as Power
 * Spike's damage if it interrupted a spell, or it or the caster stands
 * a certain way (#794), as Word of Healing's more if the ally is below
 * half health. Evaluated per target.
 */
export interface ConditionalEffect {
  readonly kind: "if";
  readonly condition: EffectCondition;
  /** Applied only when the condition holds. No nesting. */
  readonly effects: readonly UnconditionalEffect[];
}

/** Every effect but `if`: what an `if` may hold. */
export type UnconditionalEffect =
  | DamageEffect
  | HealEffect
  | EnergyGainEffect
  | EnergyLossEffect
  | SacrificeHealthEffect
  | ApplyStatusEffect
  | RemoveStatusEffect
  | InterruptEffect
  | KnockdownEffect
  | ResurrectEffect;

export type SkillEffect = UnconditionalEffect | ConditionalEffect;

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What kind of skill this is, as GW1 names it. Shown to the player as a
 * badge, so a skill's nature reads by shape rather than by colour (#75).
 * An attack skill is also a blow of its weapon (ADR-0029).
 */
export type SkillType =
  | "attack"
  | "spell"
  | "enchantment"
  | "hex"
  | "signet"
  | "shout"
  | "stance"
  | "preparation"
  | "glyph"
  | "chant"
  | "weapon-spell"
  | "skill";

/**
 * Whether a skill of this type is a spell, as GW1's rules that "affect
 * spells" mean it: enchantments, hexes and weapon spells are spells,
 * signets, shouts, chants, stances and glyphs are not (#524, #526, #527,
 * #758). Every such rule asks this, never the type directly.
 */
export function isSpell(type: SkillType): boolean {
  return type === "spell" || type === "enchantment" || type === "hex" || type === "weapon-spell";
}

/**
 * The weapon an attack skill needs (ADR-0029). `melee` is any of the six
 * melee weapons, not fists; `bow` is any of the five bows.
 */
export type AttackWeaponClass =
  "axe" | "sword" | "hammer" | "daggers" | "scythe" | "spear" | "bow" | "melee";

/** Bonus damage an attack skill adds only while `condition` holds (#794). */
export interface ConditionalBonus {
  readonly condition: StateCondition;
  readonly amount: Magnitude;
}

/** What makes an attack skill a blow of its weapon (ADR-0029). */
export interface AttackSkillRule {
  readonly weapon: AttackWeaponClass;
  /**
   * What the weapon's roll is multiplied by: 1 for a blow of the weapon,
   * 0 for one that deals no damage but still hits (Distracting Blow).
   */
  readonly weaponDamage: number;
  /** Added to the weapon's roll before armor; `undefined`: no bonus. */
  readonly bonusDamage: Magnitude | undefined;
  /**
   * More bonus while a state holds (#794), read as each blow lands on its
   * victim, and added to that blow: Mystic Sweep's "If you are enchanted,
   * +10 damage". One damage number, not a second hit. `undefined`: none.
   */
  readonly conditionalBonus: ConditionalBonus | undefined;
  /** Whether no block stops it (Wild Throw's "This attack cannot be blocked"). */
  readonly unblockable: boolean;
  /**
   * What a blocked blow does to its target instead of the skill's
   * `effects` (#534): Swift Chop's damage and Deep Wound. Usually none.
   */
  readonly onBlocked: readonly SkillEffect[];
  /** Its place in a dagger chain (#831); `undefined`: not a chain attack. */
  readonly chain: ChainStep | undefined;
}

/** GW1's dagger chain: a lead attack, then an off-hand, then a dual (#831). */
export type ChainRole = "lead" | "off-hand" | "dual";

/** Where a chain attack stands in its chain (#831). */
export interface ChainStep {
  readonly role: ChainRole;
  /**
   * The mark of yours its target must bear for it to hit, as Fox Fangs'
   * "Must follow a lead attack"; `undefined`: it may open a chain.
   */
  readonly follows: ChainRole | undefined;
}

/** A chain mark one attacker left on one target (#831). */
export interface ChainMark {
  readonly role: ChainRole;
  remainingSeconds: number;
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly type: SkillType;
  /**
   * A GW1 elite skill (#459): drawn with a gold frame, and at most one
   * per bar (`validatePlayerBuild`).
   */
  readonly elite: boolean;
  /**
   * The profession this skill belongs to, and therefore who may equip it:
   * a character whose primary or secondary it is (brief §6's skill shape).
   *
   * Stated explicitly rather than inferred from the effect list: a skill
   * whose effects are not attribute-scaled (a pure interrupt, say) still
   * belongs to a profession, and inferring it would wrongly make such
   * skills equippable by everyone — a real bug this field replaced.
   */
  readonly profession: ProfessionId;
  /**
   * The attribute of `profession` it is linked to; `undefined` for GW1's
   * "No Attribute" skills, whose numbers are written for rank 0 (#445).
   */
  readonly attributeId: string | undefined;
  readonly cost: SkillCost | undefined;
  /**
   * Maximum energy it takes away when activation starts, on top of its
   * cost (#461): GW1's overcast, once called exhaustion. `0` for none.
   */
  readonly overcast: number;
  /** Cast time in seconds. `0` is instant. */
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
  /** Maximum distance to target, in world units. */
  readonly range: number;
  /** What must be selected, and whether the cast is legal. */
  readonly target: TargetRule;
  /** Who else is caught once it lands. `undefined`: only the target. */
  readonly area: AreaRule | undefined;
  /** Set exactly when `type === "attack"` (ADR-0029). */
  readonly attack: AttackSkillRule | undefined;
  /**
   * A status the caster bears while activating it, gone the moment the
   * cast ends however it ends (#524): Healing Signet's armor loss.
   */
  readonly whileActivating: StatusId | undefined;
  /**
   * A spell that flies (#535): at cast completion it leaves the caster as
   * a led shot, and its effects and area land with it, or not at all if
   * it is dodged. `undefined`: it lands at once.
   */
  readonly projectile: SkillProjectile | undefined;
  readonly effects: readonly SkillEffect[];
}

/** How a flying spell flies (#535). */
export interface SkillProjectile {
  /**
   * World units per second. GW1 publishes no spell speeds, so these are
   * this project's tuning.
   */
  readonly speed: number;
}

/**
 * An area a skill also hits (ADR-0018). Orthogonal to `target`: Fireball
 * is still a legal-single-enemy spell, with a splash.
 */
export interface AreaRule {
  readonly radius: number;
  /** Centred on the caster, or on the target it was cast at. */
  readonly origin: "caster" | "target";
  readonly affects: "enemies" | "allies" | "all";
  /** At most this many hit, the primary target included. */
  readonly maxTargets: number | undefined;
  /** Whether the caster can be caught in its own area. */
  readonly includesCaster: boolean;
}

/* -------------------------------------------------------------------------- */
/* Simulation-facing combatant view                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the skill engine needs to know about a combatant. Deliberately a
 * narrow interface rather than the full match entity: the engine does not
 * know about wire messages, peers, or rendering.
 */
export interface Combatant {
  readonly id: string;
  health: number;
  readonly maxHealth: number;
  energy: number;
  readonly maxEnergy: number;
  /**
   * Maximum energy lost to overcast (#461), recovering over time; the
   * ceiling energy fills to is `maxEnergy − overcast`, and may be below 0.
   */
  overcast: number;
  /** Energy regeneration before statuses, in pips (`ENERGY_PER_PIP`). */
  readonly baseEnergyPips: number;
  adrenaline: number;
  /** Attribute ranks by attribute id; absent means rank 0. */
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly team: number;
  /** Set once health reaches 0; a dead combatant is skipped by the simulation. */
  dead: boolean;
  /** Active conditions, hexes and enchantments. */
  readonly statuses: StatusSet;
  /** In-progress cast and per-skill recharge; also the interrupt target. */
  readonly cast: CastState;
  /**
   * The weapon auto-attack in progress, if any (ADR-0026). Lives next to
   * `cast` because a cast pauses it and resets its swing.
   */
  attack: AttackState | undefined;
  /**
   * Seconds left lying down from a knockdown (#468); `0` standing. A
   * state of its own rather than a status, so nothing that removes
   * statuses can stand anyone up.
   */
  knockdownRemaining: number;
  /**
   * Match times Soul Reaping last triggered (#530), at most the 3 that can
   * still count against the next. Kept across a respawn.
   */
  soulReapingTriggers: readonly number[];
  /**
   * Chain marks this combatant placed, by target id (#831): what its next
   * off-hand attack on each may follow.
   */
  readonly chainMarks: Map<string, ChainMark>;
  /**
   * Weapon, armor and rune effects, already resolved (ADR-0012).
   *
   * Readonly, and resolved once before this combatant was built. Gear is
   * fixed at join, so nothing in the simulation ever needs to change it —
   * and making it immutable is what guarantees a rune cannot be applied
   * twice.
   */
  readonly equipment: ResolvedEquipment;
}

export interface SkillContext {
  readonly caster: Combatant;
  readonly target: Combatant | undefined;
  readonly rng: SimulationRng;
  /**
   * Combat numbers, threaded rather than imported.
   *
   * `game-core` must not pick a ruleset on the caller's behalf — the
   * whole point of the abstraction (brief §11) is that a balance
   * experiment is a different object, not a different build.
   */
  readonly rules: CombatRules;
}
