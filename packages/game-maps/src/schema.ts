import {
  distancePointToSegment,
  MINIMAL_GW_INSPIRED_PVP_V1,
  type MatchMode,
} from "@vibewars/game-core";
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
 * A map objective: a team's Resurrection Shrine (#1186), where its dead
 * come back and Priest Annihilation's priest stands, or where a Guild
 * Battle's Guild Lord stands (#1222).
 */
const objectiveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resurrection-shrine"),
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("guild-lord"),
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
]);

/** Which objectives each mode has, one a spawning team; none for a mode not here. */
const OBJECTIVES_BY_MODE: Readonly<Partial<Record<MatchMode, readonly Objective["kind"][]>>> = {
  "priest-annihilation": ["resurrection-shrine"],
  "guild-battle": ["resurrection-shrine", "guild-lord"],
};

/** What a map calls each objective kind, in its validation messages. */
const OBJECTIVE_NAMES: Readonly<Record<Objective["kind"], string>> = {
  "resurrection-shrine": "resurrection shrine",
  "guild-lord": "Guild Lord",
};

/** A body's radius: an objective stands clear of every wall and edge by one. */
const BODY_RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

export const mapDataSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "map id must be lowercase-kebab-case"),
    name: z.string().min(1),
    /** The mode its matches play (#476), one of game-core's `MatchMode`s; there is no default. */
    mode: z.enum(["annihilation", "kill-count", "priest-annihilation", "guild-battle"]),
    width: z.number().positive(),
    height: z.number().positive(),
    walls: z.array(wallSchema),
    spawnPoints: z.array(spawnPointSchema).min(1),
    /** Required, may be empty: a map without objectives says so. */
    objectives: z.array(objectiveSchema),
  })
  .superRefine((map, context) => {
    const kinds = OBJECTIVES_BY_MODE[map.mode] ?? [];
    for (const kind of new Set(map.objectives.map((objective) => objective.kind))) {
      if (!kinds.includes(kind)) {
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `a ${map.mode} map has no ${OBJECTIVE_NAMES[kind]}`,
        });
      }
    }
    const teams = new Set(map.spawnPoints.map((spawn) => spawn.team));
    for (const kind of kinds) {
      for (const team of teams) {
        const count = map.objectives.filter(
          (objective) => objective.kind === kind && objective.team === team,
        ).length;
        if (count !== 1) {
          context.addIssue({
            code: "custom",
            path: ["objectives"],
            message: `team ${String(team)} has ${String(count)} ${OBJECTIVE_NAMES[kind]}s, not one`,
          });
        }
      }
    }
    const walls = allWallSegments(map.walls);
    map.objectives.forEach((objective, index) => {
      const { x, y } = objective.position;
      const inBounds =
        x >= BODY_RADIUS &&
        y >= BODY_RADIUS &&
        x <= map.width - BODY_RADIUS &&
        y <= map.height - BODY_RADIUS;
      const clear = walls.every(
        (wall) => distancePointToSegment(objective.position, wall) >= BODY_RADIUS,
      );
      if (!teams.has(objective.team) || !inBounds || !clear) {
        context.addIssue({
          code: "custom",
          path: ["objectives", index],
          message: `objective ${String(index)} must be a spawning team's, on the map and a body clear of every wall`,
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
