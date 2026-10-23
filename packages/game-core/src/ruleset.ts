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

export interface Ruleset {
  readonly id: string;
  /** Fixed server simulation tick rate, in Hz (ADR-0003). */
  readonly tickRateHz: number;
  readonly movement: MovementRules;
  readonly collision: CollisionRules;
  readonly attributes: AttributeRules;
  readonly resources: ResourceRules;
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
  attributes: Object.freeze({
    // Enough to max two attributes (12+12=24 ranks -> 2*78=156 points) with
    // a little left for a third — an original budget, not a copied number
    // (see attributes.ts's cost-curve comment for why exact fidelity to any
    // specific game's table is not the goal).
    attributePointBudget: 200,
  }),
});
