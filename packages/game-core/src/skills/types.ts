import type { SimulationRng } from "../rng.js";

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

export type SkillEffect = DamageEffect | HealEffect | EnergyGainEffect | SacrificeHealthEffect;

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

export interface Skill {
  readonly id: string;
  readonly name: string;
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
}

export interface SkillContext {
  readonly caster: Combatant;
  readonly target: Combatant | undefined;
  readonly rng: SimulationRng;
}
