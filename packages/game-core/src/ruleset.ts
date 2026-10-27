/**
 * The versioned ruleset abstraction (brief §11).
 *
 * Game numbers live here as data, not scattered through simulation code —
 * this is what makes future balance experimentation ("try a second
 * ruleset") a new object instead of a search-and-replace across the
 * codebase. `minimal-gw-inspired-pvp-v1` is deliberately small: it only
 * carries the numbers sprints actually need so far, growing one field at a
 * time as movement/skills/combat are implemented, rather than guessing a
 * complete shape up front.
 */

export interface MovementRules {
  /** Top speed in world units per second. World units are arbitrary but
   *  consistent with map/collision geometry (ADR-0006). */
  readonly maxSpeedUnitsPerSecond: number;
}

export interface CollisionRules {
  /** Every player's collision (and rendering) radius, in world units. */
  readonly playerRadius: number;
}

export interface AttributeRules {
  /** Total attribute points a character may spend (brief §5). */
  readonly attributePointBudget: number;
}

/**
 * Resource economy (brief §11's "resource rules").
 *
 * Lives in the ruleset rather than in the server, because the headless
 * runner and the live match must agree: a balance answer from a runner
 * that regenerates energy differently would be an answer about a
 * different game. Energy regeneration is not here: it is each
 * character's, in pips, by profession (`BASE_ENERGY_PIPS_BY_PROFESSION`).
 */
export interface ResourceRules {
  /**
   * Natural health regeneration (GW1, #460): this long out of combat,
   * below full health, and a combatant regenerates +1 health pip.
   */
  readonly naturalRegenDelaySeconds: number;
  /** Then one more pip each this many seconds... */
  readonly naturalRegenStepSeconds: number;
  /** ...up to this many. It sums with every status's pips before the ±10 clamp. */
  readonly naturalRegenMaxPips: number;
  /**
   * Overcast recovered each second, alive or dead (#461): GW1's 1 maximum
   * energy every 3 s, as continuous as the energy tick.
   */
  readonly overcastRecoveryPerSecond: number;
  /** Adrenaline does not keep between fights (GW1, #828): this long out of combat, it all goes. */
  readonly adrenalineLossSeconds: number;
  /** For this long before then, a slot with adrenaline in it blinks. */
  readonly adrenalineWarningSeconds: number;
}

/**
 * Combat numbers (brief §11's "combat rules").
 *
 * The armor curve is the load-bearing part. `armorReferenceLevel` is the
 * armor at which mitigation is exactly 1.0 — set to the caster
 * professions' base, so the damage every existing skill already deals is
 * unchanged against them, and only *armored* targets see a difference.
 * Without that reference point, switching armor on would silently rescale
 * every skill in the catalog overnight.
 */
export interface CombatRules {
  /** Armor at which a hit lands for exactly its stated amount. */
  readonly armorReferenceLevel: number;
  /** Damage halves for each this many points of armor above the reference. */
  readonly armorHalvingPoints: number;
  /** Attribute rank at which a weapon deals exactly its stated damage. */
  readonly damageRankPivot: number;
  /** Damage-exponent slope per rank below the pivot. */
  readonly damageRankSlopeUnder: number;
  /** Slope per rank above it — flatter, so runes are a bonus, not a doubling. */
  readonly damageRankSlopeOver: number;
  /** What base damage is multiplied by when a weapon's requirement is unmet. */
  readonly unmetRequirementMultiplier: number;
  /**
   * A weapon blow's chance to crit (#533): this, plus
   * `criticalChancePerRank` per rank in the weapon's mastery attribute.
   */
  readonly criticalBaseChance: number;
  readonly criticalChancePerRank: number;
  /** Health a character has before runes and insignias. */
  readonly baseHealth: number;
  /** Energy a character has before runes and insignias. */
  readonly baseEnergy: number;
  /** Floor on maximum health, so stacked rune penalties cannot reach zero. */
  readonly minimumMaxHealth: number;
  /**
   * How far past its body a projectile's target may be when it lands and
   * still be hit. Large enough that a point-blank shot cannot be dodged,
   * small enough that reversing dodges a longbow at range.
   */
  readonly projectileTolerance: number;
  /**
   * How long an attack's approach may find no way to its target before the
   * attack ends with "can't reach" (#218). A failure that brief is a body
   * squeezed into a corner, not a target that cannot be reached.
   */
  readonly unreachableAfterSeconds: number;
  /**
   * How much of a target's recent movement a shot is led by. Long enough
   * that tapping back and forth averages out to standing still, short
   * enough that a real change of course shows.
   */
  readonly trackWindowSeconds: number;
  /**
   * The aftercast (#317): how long after a skill with an activation time
   * goes off its caster can neither move, attack, nor start another cast.
   * GW1's "almost always ¾ second". Attack skills have none.
   */
  readonly aftercastSeconds: number;
}

export interface Ruleset {
  readonly id: string;
  /** Fixed server simulation tick rate, in Hz (ADR-0003). */
  readonly tickRateHz: number;
  readonly movement: MovementRules;
  readonly collision: CollisionRules;
  readonly attributes: AttributeRules;
  readonly resources: ResourceRules;
  readonly combat: CombatRules;
}

export const MINIMAL_GW_INSPIRED_PVP_V1: Ruleset = Object.freeze({
  id: "minimal-gw-inspired-pvp-v1",
  tickRateHz: 20,
  movement: Object.freeze({
    maxSpeedUnitsPerSecond: 180,
  }),
  collision: Object.freeze({
    playerRadius: 14,
  }),
  resources: Object.freeze({
    // GW1's 5 s and +7 (14 HP/s); its wiki gives no step, so +7 arrives
    // at 17 s. Retreating to heal is a GW1 decision, and the 5 s without
    // combat already stops it mid-fight.
    naturalRegenDelaySeconds: 5,
    naturalRegenStepSeconds: 2,
    naturalRegenMaxPips: 7,
    overcastRecoveryPerSecond: 1 / 3,
    adrenalineLossSeconds: 25,
    adrenalineWarningSeconds: 5,
  }),
  combat: Object.freeze({
    // 60 is every caster profession's base armor. Anchoring here is what
    // keeps the twelve shipped skills dealing exactly what they dealt
    // before armor existed, against the targets they were tuned on.
    armorReferenceLevel: 60,
    armorHalvingPoints: 40,
    damageRankPivot: 12,
    damageRankSlopeUnder: 5,
    damageRankSlopeOver: 2,
    // A weapon you have not trained for still swings — badly. Severe
    // enough that nobody carries a hammer "for fun" on a caster, mild
    // enough that it is a trade-off rather than a lockout.
    unmetRequirementMultiplier: 1 / 3,
    // Measured in GW1 by players, not a published formula: about 1% at
    // rank 0, rising 1.37% a rank. GW1 adds the attacker's level against
    // the target's; with no levels here, only the rank is left.
    criticalBaseChance: 0.01,
    criticalChancePerRank: 0.0137,
    baseHealth: 500,
    baseEnergy: 50,
    minimumMaxHealth: 100,
    projectileTolerance: 10,
    unreachableAfterSeconds: 0.5,
    trackWindowSeconds: 0.6,
    aftercastSeconds: 0.75,
  }),
  attributes: Object.freeze({
    // GW1's level-20 budget, per the brief, under GW1's cost table
    // (attributes.ts): two maxed attributes cost 2*97=194 points, which
    // leaves 6 for a third at rank 3.
    attributePointBudget: 200,
  }),
});

/**
 * Units in one strike of adrenaline (GW1, #463). A skill's adrenaline cost
 * is in strikes, a blow that lands gives one, and a skill's pool holds
 * units. A rule, not a tunable.
 */
export const ADRENALINE_PER_STRIKE = 25;
