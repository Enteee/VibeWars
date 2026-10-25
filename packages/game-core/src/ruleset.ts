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
 * different game.
 */
export interface ResourceRules {
  /** Energy regained per second. The pacing lever for how often skills fire. */
  readonly energyRegenPerSecond: number;
  /** Adrenaline earned each time one of your skills damages an enemy. */
  readonly adrenalinePerHit: number;
  /** Adrenaline ceiling, so it cannot be banked indefinitely between fights. */
  readonly maxAdrenaline: number;
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
    energyRegenPerSecond: 2,
    adrenalinePerHit: 3,
    maxAdrenaline: 25,
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
    baseHealth: 500,
    baseEnergy: 50,
    minimumMaxHealth: 100,
    projectileTolerance: 10,
    unreachableAfterSeconds: 0.5,
    trackWindowSeconds: 0.6,
    aftercastSeconds: 0.75,
  }),
  attributes: Object.freeze({
    // Enough to max two attributes (12+12=24 ranks -> 2*78=156 points) with
    // a little left for a third — an original budget, not a copied number
    // (see attributes.ts's cost-curve comment for why exact fidelity to any
    // specific game's table is not the goal).
    attributePointBudget: 200,
  }),
});
