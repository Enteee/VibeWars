import { distancePointToSegment, MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { z } from "zod";

import { allWallSegments } from "./geometry.js";

/**
 * Declarative map format (ADR-0006), validated with zod rather than
 * hand-rolled checks: map data is exactly the kind of "strongly validated
 * declarative representation" zod exists for.
 *
 * A wall is a rectangle *or* an arbitrary polygon; both reduce to the same
 * `Segment[]` the collision/LOS engine in `@vibewars/game-core` consumes
 * (see `wallToSegments` in `./geometry.js`).
 */

const vec2Schema = z.object({ x: z.number(), y: z.number() });

const rectWallSchema = z.object({
  kind: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const polygonWallSchema = z.object({
  kind: z.literal("polygon"),
  // A polygon needs at least 3 points to enclose any area; two or fewer
  // points is not a shape, just a stray segment.
  points: z.array(vec2Schema).min(3),
});

const wallSchema = z.discriminatedUnion("kind", [rectWallSchema, polygonWallSchema]);

const spawnPointSchema = z.object({
  team: z.number().int().nonnegative(),
  position: vec2Schema,
});

/**
 * A map objective (#1186). One kind so far: a team's Resurrection Shrine,
 * where Priest Annihilation's priest stands and the team's dead come back.
 */
const objectiveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resurrection-shrine"),
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
]);

/** A body's radius: a shrine stands clear of every wall and edge by one. */
const BODY_RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

export const mapDataSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "map id must be lowercase-kebab-case"),
    name: z.string().min(1),
    /** The mode its matches play (#476), one of game-core's `MatchMode`s; there is no default. */
    mode: z.enum(["annihilation", "kill-count", "priest-annihilation"]),
    width: z.number().positive(),
    height: z.number().positive(),
    walls: z.array(wallSchema),
    spawnPoints: z.array(spawnPointSchema).min(1),
    /** Required, may be empty: a map without objectives says so. */
    objectives: z.array(objectiveSchema),
  })
  .superRefine((map, context) => {
    // Every objective is a shrine, so far.
    const shrines = map.objectives;
    if (map.mode !== "priest-annihilation") {
      if (shrines.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `a ${map.mode} map has no resurrection shrine`,
        });
      }
      return;
    }
    const teams = new Set(map.spawnPoints.map((spawn) => spawn.team));
    for (const team of teams) {
      const count = shrines.filter((shrine) => shrine.team === team).length;
      if (count !== 1) {
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `team ${String(team)} has ${String(count)} resurrection shrines, not one`,
        });
      }
    }
    const walls = allWallSegments(map.walls);
    shrines.forEach((shrine, index) => {
      const { x, y } = shrine.position;
      const inBounds =
        x >= BODY_RADIUS &&
        y >= BODY_RADIUS &&
        x <= map.width - BODY_RADIUS &&
        y <= map.height - BODY_RADIUS;
      const clear = walls.every(
        (wall) => distancePointToSegment(shrine.position, wall) >= BODY_RADIUS,
      );
      if (!teams.has(shrine.team) || !inBounds || !clear) {
        context.addIssue({
          code: "custom",
          path: ["objectives", index],
          message: `shrine ${String(index)} must be a spawning team's, on the map and a body clear of every wall`,
        });
      }
    });
  });

export type Vec2Data = z.infer<typeof vec2Schema>;
export type RectWall = z.infer<typeof rectWallSchema>;
export type PolygonWall = z.infer<typeof polygonWallSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type MapData = z.infer<typeof mapDataSchema>;

export class MapValidationError extends Error {
  public override readonly name = "MapValidationError";
}

/**
 * Validate an arbitrary parsed JSON value as `MapData`, or throw with every
 * failing field named — never silently drop an unrecognized/malformed field
 * (brief §7.8's "never silently discard unknown fields" applies just as
 * much to map data as to skill data).
 */
export function validateMapData(value: unknown): MapData {
  const result = mapDataSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new MapValidationError(`Invalid map data:\n${issues}`);
  }
  return result.data;
}
