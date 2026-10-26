import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";

import type { ResolvedEquipment } from "../equipment/resolve.js";
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
  | "single-any";

/* -------------------------------------------------------------------------- */
/* Effects                                                                     */
/* -------------------------------------------------------------------------- */

export interface DamageEffect {
  readonly kind: "damage";
  readonly amount: Magnitude;
}

export interface HealEffect {
  readonly kind: "heal";
  readonly amount: Magnitude;
}

export interface EnergyGainEffect {
  readonly kind: "energy-gain";
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

/** How long "knocks down" lasts when a skill names no duration (GW1). */
export const KNOCKDOWN_SECONDS = 2;

export type SkillEffect =
  | DamageEffect
  | HealEffect
  | EnergyGainEffect
  | SacrificeHealthEffect
  | ApplyStatusEffect
  | RemoveStatusEffect
  | InterruptEffect
  | KnockdownEffect;

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What kind of skill this is, as GW1 names it. Shown to the player as a
 * badge, so a skill's nature reads by shape rather than by colour (#75).
 * An attack skill is also a blow of its weapon (ADR-0029).
 */
export type SkillType =
  "attack" | "spell" | "enchantment" | "hex" | "signet" | "shout" | "stance" | "skill";

/**
 * Whether a skill of this type is a spell, as GW1's rules that "affect
 * spells" mean it: enchantments and hexes are spells, signets, shouts and
 * stances are not (#524, #527). Every such rule asks this, never the type
 * directly.
 */
export function isSpell(type: SkillType): boolean {
  return type === "spell" || type === "enchantment" || type === "hex";
}

/**
 * The weapon an attack skill needs (ADR-0029). `melee` is any of the six
 * melee weapons, not fists; `bow` is any of the five bows.
 */
export type AttackWeaponClass =
  "axe" | "sword" | "hammer" | "daggers" | "scythe" | "spear" | "bow" | "melee";

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
  /** Whether no block stops it (Wild Throw's "This attack cannot be blocked"). */
  readonly unblockable: boolean;
  /**
   * What a blocked blow does to its target instead of the skill's
   * `effects` (#534): Swift Chop's damage and Deep Wound. Usually none.
   */
  readonly onBlocked: readonly SkillEffect[];
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly type: SkillType;
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
  readonly effects: readonly SkillEffect[];
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
 * know about Colyseus schema objects, sessions, or rendering.
 */
export interface Combatant {
  readonly id: string;
  health: number;
  readonly maxHealth: number;
  energy: number;
  readonly maxEnergy: number;
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
