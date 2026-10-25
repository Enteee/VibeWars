import type { Vec2 } from "@vibewars/game-core";

/** One of a map's spawn points: game-maps' shape, which this package does not depend on. */
export interface SpawnPoint {
  readonly team: number;
  readonly position: Vec2;
}

/**
 * Where the `seated`-th player on `team` (0 for the first) spawns:
 * cycling through that team's own points as more players arrive (#375).
 *
 * Filtering by team matters: spawning a team-1 player at a team-0 point
 * would drop them in the middle of the enemy's starting position, which
 * is both unfair and exactly the kind of bug that only shows up once
 * more than two people join. A map with no point for the team uses all
 * of them; one with none at all, the origin.
 */
export function spawnPoint(spawns: readonly SpawnPoint[], team: number, seated: number): Vec2 {
  const teamSpawns = spawns.filter((spawn) => spawn.team === team);
  const pool = teamSpawns.length > 0 ? teamSpawns : spawns;
  return pool[seated % pool.length]?.position ?? { x: 0, y: 0 };
}
