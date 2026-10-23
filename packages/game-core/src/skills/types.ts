import type { SimulationRng } from "../rng.js";

import type { CastState } from "./cast-state.js";
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

export type SkillEffect =
  | DamageEffect
  | HealEffect
  | EnergyGainEffect
  | SacrificeHealthEffect
  | ApplyStatusEffect
  | RemoveStatusEffect
  | InterruptEffect;

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

export interface Skill {
  readonly id: string;
  readonly name: string;
  /**
   * The attribute this skill belongs to, and therefore which professions
   * may equip it (brief §6's skill shape).
   *
   * Stated explicitly rather than inferred from the effect list: a skill
   * whose effects are not attribute-scaled (a pure interrupt, say) still
   * belongs to a profession, and inferring it would wrongly make such
   * skills equippable by everyone — a real bug this field replaced.
   */
  readonly attributeId: string;
  readonly cost: SkillCost | undefined;
  /** Cast time in seconds. `0` is instant. */
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
  /** Maximum distance to target, in world units. */
  readonly range: number;
  readonly target: TargetRule;
  readonly effects: readonly SkillEffect[];
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
}

export interface SkillContext {
  readonly caster: Combatant;
  readonly target: Combatant | undefined;
  readonly rng: SimulationRng;
}
