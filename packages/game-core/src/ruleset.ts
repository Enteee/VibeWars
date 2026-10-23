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

export interface Ruleset {
  readonly id: string;
  /** Fixed server simulation tick rate, in Hz (ADR-0003). */
  readonly tickRateHz: number;
  readonly movement: MovementRules;
  readonly collision: CollisionRules;
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
});
