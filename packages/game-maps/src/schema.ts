import { z } from "zod";

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

export const mapDataSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "map id must be lowercase-kebab-case"),
  name: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  walls: z.array(wallSchema),
  spawnPoints: z.array(spawnPointSchema).min(1),
});

/**
 * The modes a map may name (#1185), game-core's `MatchMode`: a test keeps
 * the two equal. Kept here as a list, as zod's enum wants one.
 */
export const MAP_MODES = ["annihilation", "kill-count"] as const;

/**
 * An arena: a map a match is played on, so it names its mode, with no
 * default (#1185). The training arenas have no match and no mode.
 */
export const arenaMapSchema = mapDataSchema.extend({
  mode: z.enum(MAP_MODES),
});

export type Vec2Data = z.infer<typeof vec2Schema>;
export type RectWall = z.infer<typeof rectWallSchema>;
export type PolygonWall = z.infer<typeof polygonWallSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type MapData = z.infer<typeof mapDataSchema>;
export type ArenaMapData = z.infer<typeof arenaMapSchema>;

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
  return parseOrThrow(mapDataSchema, value);
}

/** Validate `value` as an arena, mode and all; `validateMapData`'s rules otherwise. */
export function validateArenaMap(value: unknown): ArenaMapData {
  return parseOrThrow(arenaMapSchema, value);
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new MapValidationError(`Invalid map data:\n${issues}`);
  }
  return result.data;
}
