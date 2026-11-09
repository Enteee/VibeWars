import {
  distancePointToSegment,
  GUARD_ROLE_IDS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  TWO_TEAM_MODES,
  type MatchMode,
  type Segment,
} from "@vibewars/game-core";
import { z } from "zod";

import {
  allWallSegments,
  pointInShape,
  shapeInBounds,
  shapesOverlap,
  wallToSegments,
} from "./geometry.js";

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

/** An area: a wall's outline, a deck's footprint or a transition's area (ADR-0051). */
const shapeSchema = z.discriminatedUnion("kind", [rectWallSchema, polygonWallSchema]);

/** A discrete layer (ADR-0051): 0 is the ground; the map's `layers` bounds it. */
const layerSchema = z.number().int().nonnegative();

/** A shape standing on one layer: walls on other layers do not count (ADR-0051). */
const wallSchema = z.discriminatedUnion("kind", [
  rectWallSchema.extend({ layer: layerSchema }),
  polygonWallSchema.extend({ layer: layerSchema }),
]);

/** A walkable floor above the ground (ADR-0051). */
const deckSchema = z.object({
  id: z.string().min(1),
  layer: layerSchema,
  footprint: shapeSchema,
});

/** A ramp or stairs (ADR-0051): inside `area`, a body moves between `from` and `to`, one above. */
const transitionSchema = z.object({
  from: layerSchema,
  to: layerSchema,
  area: shapeSchema,
});

/** The most gates on a map (#2691): the match keeps paths for each way they can stand. */
const MAX_GATES = 6;

/** A wall that a pressure plate opens (#2691); `team` is whose plate it is, `null` for anyone's. */
const gateSchema = z.object({
  id: z.string().min(1),
  wall: wallSchema,
  plate: vec2Schema,
  team: z.number().int().nonnegative().nullable(),
});

const spawnPointSchema = z.object({
  team: z.number().int().nonnegative(),
  layer: layerSchema,
  position: vec2Schema,
});

/**
 * A map objective: a team's Resurrection Shrine (#1186), where its dead
 * come back and Priest Annihilation's priest stands, where a Guild
 * Battle's Guild Lord stands (#1222), one of its base guards' posts
 * (#1223), or its flag stand and where each team's flag starts (#1225);
 * a Relic Run's altar and where each team's relic starts (#1374);
 * King of the Hill's altar and where each team's Ghostly Hero starts
 * (#1377); or one of Capture Points' shrines (#1378).
 */
const objectiveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resurrection-shrine"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("guild-lord"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("guard"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    role: z.enum(GUARD_ROLE_IDS),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("flag-spawn"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("flag-stand"),
    layer: layerSchema,
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("relic-spawn"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("ghost-spawn"),
    layer: layerSchema,
    team: z.number().int().nonnegative(),
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("altar"),
    layer: layerSchema,
    position: vec2Schema,
  }),
  z.object({
    kind: z.literal("capture-point"),
    layer: layerSchema,
    /** The team whose base it stands in, if a match without that team goes without it (#2700). */
    base: z.literal(2).optional(),
    position: vec2Schema,
  }),
]);

/** An objective that belongs to no team. */
type SharedKind = Extract<Objective, { kind: "flag-stand" | "altar" | "capture-point" }>["kind"];
type TeamKind = Exclude<Objective["kind"], SharedKind>;

/** Which team objectives each mode may have; none for a mode not here. A map with a `ghostLevel` may have `ghost-spawn`s too. */
const OBJECTIVES_BY_MODE: Readonly<Partial<Record<MatchMode, readonly TeamKind[]>>> = {
  "priest-annihilation": ["resurrection-shrine"],
  "guild-battle": ["resurrection-shrine", "guild-lord", "guard", "flag-spawn"],
  "relic-run": ["relic-spawn"],
  "king-of-the-hill": ["ghost-spawn"],
  "capture-points": ["resurrection-shrine"],
};

/** A Relic Run's team objectives where a ghost takes the relic (#2695): it has no altar, and its bases raise the dead. */
const OWN_GHOST_RELIC_OBJECTIVES: readonly TeamKind[] = [
  "relic-spawn",
  "ghost-spawn",
  "resurrection-shrine",
];

/** Which shared objectives each mode has; none for a mode not here. */
const SHARED_OBJECTIVES_BY_MODE: Readonly<Partial<Record<MatchMode, readonly SharedKind[]>>> = {
  "guild-battle": ["flag-stand"],
  "relic-run": ["altar"],
  "king-of-the-hill": ["altar"],
  "capture-points": ["capture-point"],
};

/** How many of each shared objective a map of a mode that has it has, at least and at most. */
const SHARED_COUNTS: Readonly<Record<SharedKind, { readonly min: number; readonly max: number }>> =
  {
    "flag-stand": { min: 1, max: 1 },
    altar: { min: 1, max: 1 },
    "capture-point": { min: 1, max: 5 },
  };

/** The kinds a map of a mode that has them has exactly one of per spawning team. */
const ONE_PER_TEAM: readonly TeamKind[] = [
  "resurrection-shrine",
  "guild-lord",
  "flag-spawn",
  "relic-spawn",
  "ghost-spawn",
];

/** What a map calls each objective kind, in its validation messages. */
const OBJECTIVE_NAMES: Readonly<Record<Objective["kind"], string>> = {
  "resurrection-shrine": "resurrection shrine",
  "guild-lord": "Guild Lord",
  guard: "guard",
  "flag-spawn": "flag spawn",
  "flag-stand": "flag stand",
  "relic-spawn": "relic spawn",
  "ghost-spawn": "ghost spawn",
  altar: "altar",
  "capture-point": "capture point",
};

/**
 * The team sizes a map may suit (#2108): one side's players, as the
 * modes play them, 1v1 up to 8v8.
 */
export const TEAM_SIZES_ALL = [1, 2, 4, 8] as const;

/** One of `TEAM_SIZES_ALL`. */
export type TeamSize = (typeof TEAM_SIZES_ALL)[number];

/** A body's radius: an objective stands clear of every wall and edge by one. */
const BODY_RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

/** Points round a body's rim tested against a deck's walkable area. */
const RIM_SAMPLES = 32;

/** What `standsClear` reads of a map. */
interface LayeredMap {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly Wall[];
  readonly decks: readonly Deck[];
  readonly transitions: readonly Transition[];
}

/** Whether a body's whole circle at `position` is on `layer`'s walkable area (ADR-0051). */
function onWalkableArea(map: LayeredMap, position: Vec2Data, layer: number): boolean {
  const { x, y } = position;
  if (layer === 0) {
    return (
      x >= BODY_RADIUS &&
      y >= BODY_RADIUS &&
      x <= map.width - BODY_RADIUS &&
      y <= map.height - BODY_RADIUS
    );
  }
  const areas = [
    ...map.decks.filter((deck) => deck.layer === layer).map((deck) => deck.footprint),
    ...map.transitions
      .filter((transition) => transition.from === layer || transition.to === layer)
      .map((transition) => transition.area),
  ];
  const rim = Array.from({ length: RIM_SAMPLES }, (_, index) => {
    const angle = (index / RIM_SAMPLES) * 2 * Math.PI;
    return { x: x + BODY_RADIUS * Math.cos(angle), y: y + BODY_RADIUS * Math.sin(angle) };
  });
  return [position, ...rim].every((point) => areas.some((area) => pointInShape(point, area)));
}

/** A body at `position` is on `layer`'s walkable area and a radius from that layer's walls, and from `extra`. */
function standsClear(
  map: LayeredMap,
  position: Vec2Data,
  layer: number,
  extra: readonly Segment[] = [],
): boolean {
  const walls = allWallSegments(map.walls.filter((wall) => wall.layer === layer));
  return (
    onWalkableArea(map, position, layer) &&
    [...walls, ...extra].every((wall) => distancePointToSegment(position, wall) >= BODY_RADIUS)
  );
}

export const mapDataSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "map id must be lowercase-kebab-case"),
    name: z.string().min(1),
    /** The mode its matches play (#476), one of game-core's `MatchMode`s; there is no default. */
    mode: z.enum([
      "annihilation",
      "kill-count",
      "priest-annihilation",
      "guild-battle",
      "relic-run",
      "king-of-the-hill",
      "capture-points",
    ]),
    /** The team sizes it suits (#2108), one or several of `TEAM_SIZES_ALL`; there is no default. */
    teamSizes: z
      .array(z.literal(TEAM_SIZES_ALL))
      .min(1)
      .refine((sizes) => new Set(sizes).size === sizes.length, "team sizes must be unique"),
    /**
     * How many teams its matches have (#2682): two, or Heroes' Ascent's
     * three; every spawn is one of theirs. There is no default.
     */
    teams: z.union([z.literal(2), z.literal(3)]),
    width: z.number().positive(),
    height: z.number().positive(),
    /** How many layers it has (ADR-0051); layer 0 is the ground. */
    layers: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Required, may be empty, as `gates`. */
    decks: z.array(deckSchema),
    /** Required, may be empty, as `gates`. */
    transitions: z.array(transitionSchema),
    walls: z.array(wallSchema),
    spawnPoints: z.array(spawnPointSchema).min(1),
    /** Required, may be empty: a map without objectives says so. */
    objectives: z.array(objectiveSchema),
    /** Required, may be empty, as `objectives` (#2691). */
    gates: z.array(gateSchema).max(MAX_GATES),
    /**
     * The level of its Ghostly Heroes (#2689): 20, 24 or 28, by where in
     * Heroes' Ascent it stands. With it, the map has one `ghost-spawn` per
     * team, whatever its mode; without it, none. King of the Hill needs one.
     */
    ghostLevel: z.union([z.literal(20), z.literal(24), z.literal(28)]).optional(),
    /** One of the Hall of Heroes' (#2700): it plays `HALLS_MATCH_RULES`. */
    halls: z.literal(true).optional(),
    /** Where a relic scores (#2695): a Relic Run map says, no other map does. */
    relicTarget: z.enum(["altar", "own-ghost"]).optional(),
    /** Whose relic a team carries (#2695): a Relic Run map says, no other map does. */
    relicCarry: z.enum(["own", "foe"]).optional(),
  })
  .superRefine((map, context) => {
    if (map.teams !== 2 && TWO_TEAM_MODES.includes(map.mode)) {
      context.addIssue({
        code: "custom",
        path: ["teams"],
        message: `a ${map.mode} map has two teams, not ${String(map.teams)}`,
      });
    }
    map.spawnPoints.forEach((spawn, index) => {
      if (spawn.team >= map.teams) {
        context.addIssue({
          code: "custom",
          path: ["spawnPoints", index, "team"],
          message: `spawn ${String(index)} is team ${String(spawn.team)}, not one of ${String(map.teams)}`,
        });
      }
    });
    const relicRun = map.mode === "relic-run";
    if (
      relicRun !== (map.relicTarget !== undefined) ||
      relicRun !== (map.relicCarry !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["relicTarget"],
        message: "a relic-run map has a relicTarget and a relicCarry, and no other map does",
      });
    }
    const ownGhost = map.relicTarget === "own-ghost";
    const byMode = ownGhost ? OWN_GHOST_RELIC_OBJECTIVES : (OBJECTIVES_BY_MODE[map.mode] ?? []);
    const kinds: readonly TeamKind[] =
      map.ghostLevel !== undefined && !byMode.includes("ghost-spawn")
        ? [...byMode, "ghost-spawn"]
        : byMode;
    if (byMode.includes("ghost-spawn") && map.ghostLevel === undefined) {
      context.addIssue({
        code: "custom",
        path: ["ghostLevel"],
        message: `a ${map.mode} map has ghosts, so a ghostLevel`,
      });
    }
    const shared = ownGhost ? [] : (SHARED_OBJECTIVES_BY_MODE[map.mode] ?? []);
    const allowed: readonly Objective["kind"][] = [...kinds, ...shared];
    for (const kind of new Set(map.objectives.map((objective) => objective.kind))) {
      if (!allowed.includes(kind)) {
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `a ${map.mode} map has no ${OBJECTIVE_NAMES[kind]}`,
        });
      }
    }
    for (const kind of shared) {
      const count = map.objectives.filter((objective) => objective.kind === kind).length;
      const { min, max } = SHARED_COUNTS[kind];
      if (count < min || count > max) {
        const wanted = min === max ? "one" : `${String(min)} to ${String(max)}`;
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `a ${map.mode} map has ${String(count)} ${OBJECTIVE_NAMES[kind]}s, not ${wanted}`,
        });
      }
    }
    const teams = new Set(map.spawnPoints.map((spawn) => spawn.team));
    for (const kind of kinds.filter((each) => ONE_PER_TEAM.includes(each))) {
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
    for (const team of teams) {
      const bodyguards = map.objectives.filter(
        (objective) =>
          objective.kind === "guard" && objective.team === team && objective.role === "bodyguard",
      ).length;
      if (bodyguards > 1) {
        context.addIssue({
          code: "custom",
          path: ["objectives"],
          message: `team ${String(team)} has ${String(bodyguards)} bodyguards, at most one`,
        });
      }
    }
    const layerInRange = (layer: number, path: (string | number)[]): void => {
      if (layer >= map.layers) {
        context.addIssue({
          code: "custom",
          path,
          message: `layer ${String(layer)} is not one of the map's ${String(map.layers)}`,
        });
      }
    };
    map.walls.forEach((wall, index) => {
      layerInRange(wall.layer, ["walls", index, "layer"]);
    });
    map.gates.forEach((gate, index) => {
      layerInRange(gate.wall.layer, ["gates", index, "wall", "layer"]);
    });
    map.objectives.forEach((objective, index) => {
      layerInRange(objective.layer, ["objectives", index, "layer"]);
    });
    map.spawnPoints.forEach((spawn, index) => {
      layerInRange(spawn.layer, ["spawnPoints", index, "layer"]);
      if (!standsClear(map, spawn.position, spawn.layer)) {
        context.addIssue({
          code: "custom",
          path: ["spawnPoints", index],
          message: `spawn ${String(index)} must be on its layer's walkable area and a body clear of that layer's walls`,
        });
      }
    });
    const deckIds = new Set<string>();
    const touches = (transition: Transition, deck: Deck): boolean =>
      (transition.to === deck.layer || transition.from === deck.layer) &&
      shapesOverlap(transition.area, deck.footprint);
    map.decks.forEach((deck, index) => {
      layerInRange(deck.layer, ["decks", index, "layer"]);
      if (deck.layer === 0) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "layer"],
          message: `deck ${deck.id} is on layer 0, the ground`,
        });
      }
      if (deckIds.has(deck.id)) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "id"],
          message: `deck id ${deck.id} is used twice`,
        });
      }
      deckIds.add(deck.id);
      if (!shapeInBounds(deck.footprint, map.width, map.height)) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "footprint"],
          message: `deck ${deck.id}'s footprint is outside the map`,
        });
      }
      const reached = map.transitions.some(
        (transition) => transition.to === deck.layer && touches(transition, deck),
      );
      if (!reached) {
        context.addIssue({
          code: "custom",
          path: ["decks", index],
          message: `deck ${deck.id} has no transition up to it touching it`,
        });
      }
    });
    map.transitions.forEach((transition, index) => {
      layerInRange(transition.from, ["transitions", index, "from"]);
      layerInRange(transition.to, ["transitions", index, "to"]);
      if (transition.to !== transition.from + 1) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "to"],
          message: `transition ${String(index)} goes to ${String(transition.to)}, not one above ${String(transition.from)}`,
        });
      }
      if (!shapeInBounds(transition.area, map.width, map.height)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "area"],
          message: `transition ${String(index)}'s area is outside the map`,
        });
      }
      if (
        transition.from >= 1 &&
        !map.decks.some((deck) => deck.layer === transition.from && touches(transition, deck))
      ) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "from"],
          message: `transition ${String(index)} touches no deck on layer ${String(transition.from)}`,
        });
      }
    });
    for (let layer = 1; layer < map.layers; layer += 1) {
      if (!map.decks.some((deck) => deck.layer === layer)) {
        context.addIssue({
          code: "custom",
          path: ["layers"],
          message: `layer ${String(layer)} has no deck`,
        });
      }
    }
    map.gates.forEach((gate, index) => {
      const clear = standsClear(map, gate.plate, gate.wall.layer, wallToSegments(gate.wall));
      if (!clear || (gate.team !== null && !teams.has(gate.team))) {
        context.addIssue({
          code: "custom",
          path: ["gates", index],
          message: `gate ${gate.id} needs a spawning team or none, and its plate on the map and a body clear of every wall`,
        });
      }
    });
    map.objectives.forEach((objective, index) => {
      const teamed = !("team" in objective) || teams.has(objective.team);
      if (!teamed || !standsClear(map, objective.position, objective.layer)) {
        context.addIssue({
          code: "custom",
          path: ["objectives", index],
          message: `objective ${String(index)} must be a spawning team's or shared, on the map and a body clear of every wall`,
        });
      }
    });
  });

export type Vec2Data = z.infer<typeof vec2Schema>;
export type RectWall = z.infer<typeof rectWallSchema>;
export type PolygonWall = z.infer<typeof polygonWallSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Deck = z.infer<typeof deckSchema>;
export type Transition = z.infer<typeof transitionSchema>;
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
