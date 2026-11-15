import type { Vec2 } from "@vibewars/game-core";

/** One of a map's spawn points: game-maps' shape, which this package does not depend on. */
export interface SpawnPoint {
  readonly team: number;
  readonly position: Vec2;
  /** The layer the point stands on (#3344): a deck spawn seats its player on the deck. */
  readonly layer: number;
}

/** Where a player is seated: a position on a layer. */
export interface SpawnPlace {
  readonly position: Vec2;
  readonly layer: number;
}

/**
 * Where the `seated`-th player on `team` (0 for the first) spawns:
 * cycling through that team's own points as more players arrive (#375).
 *
 * Filtering by team matters: spawning a team-1 player at a team-0 point
 * would drop them in the middle of the enemy's starting position, which
 * is both unfair and exactly the kind of bug that only shows up once
 * more than two people join. A map with no point for the team uses all
 * of them; one with none at all, the origin on the ground layer.
 */
export function spawnPoint(
  spawns: readonly SpawnPoint[],
  team: number,
  seated: number,
  groundLayer: number,
): SpawnPlace {
  const teamSpawns = spawns.filter((spawn) => spawn.team === team);
  const pool = teamSpawns.length > 0 ? teamSpawns : spawns;
  const point = pool[seated % pool.length];
  return point === undefined
    ? { position: { x: 0, y: 0 }, layer: groundLayer }
    : { position: point.position, layer: point.layer };
}
