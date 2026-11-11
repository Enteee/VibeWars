import {
  distancePointToSegment,
  firstHit,
  GUARD_ROLE_IDS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  minRampLength,
  rampLength,
  TWO_TEAM_MODES,
  UPHILL,
  ZONE_KINDS,
  ZONE_RULES,
  ZONE_TELEGRAPH_SECONDS,
  zoneReach,
  type MatchMode,
  type Segment,
} from "@vibewars/game-core";
import { z } from "zod";

import {
  allWallSegments,
  pointInShape,
  shapeVertices,
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

/** A discrete layer (ADR-0051): the map's `groundLayer` is the ground; its `layers` bounds it. */
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

/**
 * A ramp or stairs (ADR-0051): inside `area`, a body moves between `from`
 * and `to`, one above, climbing towards `uphill` (#2973).
 */
const transitionSchema = z.object({
  from: layerSchema,
  to: layerSchema,
  area: shapeSchema,
  uphill: z.enum(["n", "e", "s", "w"]),
});

/**
 * A hole in the ground down to the layer under it (#2973): open to the sky,
 * entered only by a ramp. A tunnel is a floor of that layer under the ground.
 */
const belowGroundSchema = z.object({
  id: z.string().min(1),
  footprint: rectWallSchema,
});

/** The most points round one body of water (#2983): a curved shore is a polygon with more. */
export const MAX_WATER_POINTS = 64;

/** The most bodies of water on a map (#2983). */
export const MAX_WATER_BODIES = 32;

/**
 * A body of water on one layer (#2983): deep water stops bodies as a wall
 * does, but not sight, shots or spells; shallow water changes nothing in play.
 */
const waterSchema = z.object({
  id: z.string().min(1),
  layer: layerSchema,
  depth: z.enum(["deep", "shallow"]),
  area: z.discriminatedUnion("kind", [
    rectWallSchema,
    polygonWallSchema.extend({ points: z.array(vec2Schema).min(3).max(MAX_WATER_POINTS) }),
  ]),
});

/** The most effect zones on a map (#3024). */
export const MAX_ZONES = 32;

/**
 * The most corners all of a map's harmful zones and teleport entries
 * have together, a rectangle's four included (#3026, #3030): each is a
 * node of the bots' walk graph, whose build grows about with the cube
 * of its nodes.
 */
export const MAX_HARMFUL_ZONE_POINTS = 64;

/**
 * The most points on a moving zone's path (#3029): the simulation walks
 * all of it every tick, and its hull does not count them.
 */
export const MAX_ZONE_PATH_POINTS = 16;

/**
 * An effect zone on one layer (ADR-0053, #3024): ground that puts its
 * kind's status on whoever stands in it. The map names the kind only; what
 * it does is game-core's `ZONE_RULES`.
 */
const zoneSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(ZONE_KINDS),
  layer: layerSchema,
  area: waterSchema.shape.area,
  /** A timed zone's beat (#3029); only a strike kind has one. */
  schedule: z
    .object({
      periodSeconds: z.number().positive(),
      activeSeconds: z.number().positive(),
      offsetSeconds: z.number().min(0),
    })
    .optional(),
  /** A moving zone's way (#3029), its area drawn at the first point; only a strike kind has one. */
  path: z
    .object({
      points: z.array(vec2Schema).min(2).max(MAX_ZONE_PATH_POINTS),
      speed: z.number().positive(),
    })
    .optional(),
});

/**
 * What is wrong with a zone's timing (#3029): a strike kind needs a
 * schedule or a path, not both; a standing kind may have neither. A
 * schedule leaves room for its telegraph, and starts within its period.
 */
function zoneTimingIssues(
  zone: z.infer<typeof zoneSchema>,
): { readonly at: readonly string[]; readonly message: string }[] {
  const strikes = ZONE_RULES[zone.kind].trigger === "strike";
  const issues: { at: readonly string[]; message: string }[] = [];
  if (strikes && (zone.schedule === undefined) === (zone.path === undefined)) {
    issues.push({
      at: [],
      message: `zone ${zone.id} strikes: it needs a schedule or a path, not both`,
    });
  }
  if (!strikes && (zone.schedule !== undefined || zone.path !== undefined)) {
    issues.push({ at: [], message: `zone ${zone.id} stands: it has no schedule or path` });
  }
  const schedule = zone.schedule;
  if (schedule !== undefined) {
    if (schedule.periodSeconds < schedule.activeSeconds + ZONE_TELEGRAPH_SECONDS) {
      issues.push({
        at: ["schedule", "periodSeconds"],
        message: `zone ${zone.id}'s period is shorter than its active window and telegraph`,
      });
    }
    if (schedule.offsetSeconds >= schedule.periodSeconds) {
      issues.push({
        at: ["schedule", "offsetSeconds"],
        message: `zone ${zone.id}'s offset is not within its period`,
      });
    }
  }
  return issues;
}

/** A colour as `0xRRGGBB`. */
const colourSchema = z.number().int().min(0).max(0xffffff);

/** How much of a colour a source gives: 0 is none, 1 is all of it. */
const intensitySchema = z.number().min(0).max(1);

const ambientSchema = z.object({ colour: colourSchema, intensity: intensitySchema });

/** The most lights on a map (ADR-0052): the frame budget is sized for this many. */
export const MAX_LIGHTS = 32;

/** A point light standing on one layer (ADR-0052); its `id` also seeds its flicker. */
const lightSchema = z.object({
  id: z.string().min(1),
  position: vec2Schema,
  layer: layerSchema,
  radius: z.number().positive(),
  colour: colourSchema,
  intensity: intensitySchema,
  /** How far it dims at its dimmest: 0 is steady, 1 goes dark. */
  flicker: z.number().min(0).max(1),
});

/** How a map is lit (ADR-0052). Only the renderer reads it, never the simulation. */
const lightingSchema = z.object({
  ambient: ambientSchema,
  indoorAmbient: ambientSchema,
  /** Where the sun does not reach, and `indoorAmbient` replaces `ambient`. */
  indoor: z.array(shapeSchema),
  sun: z
    .object({
      /** Where the light comes from, clockwise from the top of the map. */
      directionDeg: z.number().min(0).lt(360),
      /** How high it stands: 90 is straight overhead. */
      elevationDeg: z.number().gt(0).max(90),
      colour: colourSchema,
      intensity: intensitySchema,
    })
    .optional(),
  lights: z.array(lightSchema).max(MAX_LIGHTS),
});

/** The most gates on a map (#2691): the match keeps paths for each way they can stand. */
const MAX_GATES = 6;

/** A pressure plate (#2691); `team` is whose plate it is, `null` for anyone's. */
const plateOpenerSchema = z.object({
  kind: z.literal("plate"),
  plate: vec2Schema,
  team: z.number().int().nonnegative().nullable(),
  /** Its plate stands on the altar's side (#2699): only from inside does it open. */
  oneWay: z.literal(true).optional(),
});

/** What opens a gate: a plate held, or a switch flipped (#3025). */
const openerSchema = z.discriminatedUnion("kind", [
  plateOpenerSchema,
  z.object({ kind: z.literal("switch") }),
]);

/** A wall that its opener opens (#2691, #3025). */
const gateSchema = z.object({
  id: z.string().min(1),
  wall: wallSchema,
  opener: openerSchema,
  /**
   * What it stops while closed (#3031): `all` is stone; `bodies-and-shots`
   * is an energy barrier, which sight and a targeted spell pass.
   */
  blocks: z.enum(["all", "bodies-and-shots"]),
});

/** The most switches on a map (#3025). */
export const MAX_SWITCHES = 6;

/** A lever (#3025): flipping it toggles every gate it names in `targets`. */
const switchSchema = z.object({
  id: z.string().min(1),
  layer: layerSchema,
  position: vec2Schema,
  targets: z.array(z.string().min(1)).min(1),
});

/** The most teleports on a map (#3030). */
export const MAX_TELEPORTS = 6;

/**
 * A portal (#3030): a body that walks into `from` stands at `to` on the
 * same tick. One-way; a switch that names it turns it on and off, and
 * `enabled: false` starts it off.
 */
const teleportSchema = z.object({
  id: z.string().min(1),
  from: z.object({ layer: layerSchema, area: polygonWallSchema }),
  to: z.object({ layer: layerSchema, position: vec2Schema }),
  enabled: z.boolean(),
});

/** The most breakable walls on a map (#3031). */
export const MAX_BREAKABLES = 4;

/** A wall with health (#3031): struck down, it is gone for the match. */
const breakableSchema = z.object({
  id: z.string().min(1),
  wall: wallSchema,
  health: z.number().int().min(100).max(5000),
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
 * (#1377); one of Capture Points' shrines (#1378); or a Storm Beacon
 * (#2694), a flag stand that strikes its owner's foes.
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
  z.object({
    kind: z.literal("storm-beacon"),
    layer: layerSchema,
    position: vec2Schema,
  }),
  // The Elite Zaishen Battle's (#2692): a party member entering it starts the clock.
  z.object({
    kind: z.literal("start-line"),
    layer: layerSchema,
    area: rectWallSchema,
  }),
]);

/** An objective that belongs to no team. */
type SharedKind = Extract<
  Objective,
  { kind: "flag-stand" | "altar" | "capture-point" | "storm-beacon" | "start-line" }
>["kind"];
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
  annihilation: ["start-line"],
  "priest-annihilation": ["storm-beacon"],
  "guild-battle": ["flag-stand"],
  "relic-run": ["altar"],
  "king-of-the-hill": ["altar"],
  "capture-points": ["capture-point"],
};

/** The most capture points a map has; a snapshot must be able to carry them all. */
export const MAX_CAPTURE_POINTS = 7;

/** How many of each shared objective a map of a mode that has it has, at least and at most. */
const SHARED_COUNTS: Readonly<Record<SharedKind, { readonly min: number; readonly max: number }>> =
  {
    "flag-stand": { min: 1, max: 1 },
    altar: { min: 1, max: 1 },
    "capture-point": { min: 1, max: MAX_CAPTURE_POINTS },
    "storm-beacon": { min: 0, max: 1 },
    "start-line": { min: 0, max: 1 },
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
  "storm-beacon": "Storm Beacon",
  "start-line": "start line",
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

/** The narrowest a ramp may be across (#2973): a body, and room either side. */
const MIN_RAMP_WIDTH = 2 * BODY_RADIUS + 4;

/** Whether a ramp lies in one of `pits`, its high edge on that pit's edge (#2973). */
function inPitUpToItsEdge(transition: Transition, pits: readonly BelowGround[]): boolean {
  const corners = shapeVertices(transition.area);
  const uphill = UPHILL[transition.uphill];
  const along = (point: Vec2Data): number => point.x * uphill.x + point.y * uphill.y;
  const high = Math.max(...corners.map(along));
  return pits.some(
    (pit) =>
      corners.every((corner) => pointInShape(corner, pit.footprint)) &&
      Math.max(...shapeVertices(pit.footprint).map(along)) === high,
  );
}

/** Points round a body's rim tested against a deck's walkable area. */
const RIM_SAMPLES = 32;

/** What `standsClear` reads of a map. */
interface LayeredMap {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly Wall[];
  readonly groundLayer: number;
  readonly decks: readonly Deck[];
  readonly transitions: readonly Transition[];
  readonly pits: readonly BelowGround[];
  readonly tunnels: readonly BelowGround[];
}

/** Whether a body's whole circle at `position` is on `layer`'s walkable area (ADR-0051). */
function onWalkableArea(map: LayeredMap, position: Vec2Data, layer: number): boolean {
  const { x, y } = position;
  const ramps = map.transitions
    .filter((transition) => transition.from === layer || transition.to === layer)
    .map((transition) => transition.area);
  const rim = Array.from({ length: RIM_SAMPLES }, (_, index) => {
    const angle = (index / RIM_SAMPLES) * 2 * Math.PI;
    return { x: x + BODY_RADIUS * Math.cos(angle), y: y + BODY_RADIUS * Math.sin(angle) };
  });
  if (layer === map.groundLayer) {
    // Everywhere but a pit, unless on a ramp down into it (#2973).
    return (
      x >= BODY_RADIUS &&
      y >= BODY_RADIUS &&
      x <= map.width - BODY_RADIUS &&
      y <= map.height - BODY_RADIUS &&
      [position, ...rim].every(
        (point) =>
          !map.pits.some((pit) => pointInShape(point, pit.footprint)) ||
          ramps.some((area) => pointInShape(point, area)),
      )
    );
  }
  const areas = [
    ...(layer < map.groundLayer
      ? [...map.pits, ...map.tunnels].map((below) => below.footprint)
      : map.decks.filter((deck) => deck.layer === layer).map((deck) => deck.footprint)),
    ...ramps,
  ];
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
    /** How many layers it has (ADR-0051), the ground and what is below and above it. */
    layers: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    /** Which layer is the ground (#2973): 1 only on a map with a pit, the layer under it. */
    groundLayer: z.union([z.literal(0), z.literal(1)]),
    /** Required, may be empty, as `gates`: holes in the ground, on `groundLayer - 1` (#2973). */
    pits: z.array(belowGroundSchema),
    /** Required, may be empty: floors under the ground, on `groundLayer - 1` (#2973). */
    tunnels: z.array(belowGroundSchema),
    /** Required, may be empty, as `gates`. */
    decks: z.array(deckSchema),
    /** Required, may be empty, as `gates`. */
    transitions: z.array(transitionSchema),
    walls: z.array(wallSchema),
    /** Its water (#2983); without it, the map has none. */
    water: z.array(waterSchema).max(MAX_WATER_BODIES).optional(),
    /** Its effect zones (ADR-0053); without it, the map has none. */
    zones: z.array(zoneSchema).max(MAX_ZONES).optional(),
    spawnPoints: z.array(spawnPointSchema).min(1),
    /** Required, may be empty: a map without objectives says so. */
    objectives: z.array(objectiveSchema),
    /** Required, may be empty, as `objectives` (#2691). */
    gates: z.array(gateSchema).max(MAX_GATES),
    switches: z.array(switchSchema).max(MAX_SWITCHES).optional(),
    /** Its portals (#3030); without it, the map has none. */
    teleports: z.array(teleportSchema).max(MAX_TELEPORTS).optional(),
    /** Its breakable walls (#3031); without it, the map has none. */
    breakables: z.array(breakableSchema).max(MAX_BREAKABLES).optional(),
    /**
     * The level of its Ghostly Heroes (#2689): 20, 24 or 28, by where in
     * Heroes' Ascent it stands. With it, the map has one `ghost-spawn` per
     * team, whatever its mode; without it, none. King of the Hill needs one.
     */
    ghostLevel: z.union([z.literal(20), z.literal(24), z.literal(28)]).optional(),
    /** One of the Hall of Heroes' (#2700): it plays `HALLS_MATCH_RULES`. */
    halls: z.literal(true).optional(),
    /** Threefold Keep (#2699): it plays `THREEFOLD_KEEP_MATCH_RULES`. */
    keep: z.literal(true).optional(),
    /** Where a relic scores (#2695): a Relic Run map says, no other map does. */
    relicTarget: z.enum(["altar", "own-ghost"]).optional(),
    /** Whose relic a team carries (#2695): a Relic Run map says, no other map does. */
    relicCarry: z.enum(["own", "foe"]).optional(),
    /** How it is lit (ADR-0052); without it the map is lit flat. */
    lighting: lightingSchema.optional(),
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
    const kinds: readonly TeamKind[] = [
      ...byMode,
      ...(map.ghostLevel !== undefined && !byMode.includes("ghost-spawn")
        ? (["ghost-spawn"] as const)
        : []),
      // A Storm Beacon is captured with a flag (#2694): one per team with it, none without.
      ...(map.objectives.some((objective) => objective.kind === "storm-beacon")
        ? (["flag-spawn"] as const)
        : []),
    ];
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
    (map.breakables ?? []).forEach((breakable, index) => {
      layerInRange(breakable.wall.layer, ["breakables", index, "wall", "layer"]);
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
      if (deck.layer <= map.groundLayer) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "layer"],
          message: `deck ${deck.id} is on layer ${String(deck.layer)}, not above the ground`,
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
        transition.from > map.groundLayer &&
        !map.decks.some((deck) => deck.layer === transition.from && touches(transition, deck))
      ) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "from"],
          message: `transition ${String(index)} touches no deck on layer ${String(transition.from)}`,
        });
      }
      // Measured as pathing measures it (#2995).
      const area = shapeVertices(transition.area);
      const uphill = UPHILL[transition.uphill];
      const length = rampLength(area, uphill);
      const least = minRampLength(BODY_RADIUS);
      if (length < least) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index],
          message: `transition ${String(index)} is ${length.toFixed(1)} long uphill, shorter than the ${least.toFixed(1)} a body needs to route over it`,
        });
      }
      const width = rampLength(area, { x: uphill.y, y: -uphill.x });
      if (width < MIN_RAMP_WIDTH) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "area"],
          message: `transition ${String(index)} is ${width.toFixed(1)} wide, narrower than the ${String(MIN_RAMP_WIDTH)} a body needs`,
        });
      }
      if (transition.to === map.groundLayer && !inPitUpToItsEdge(transition, map.pits)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "area"],
          message: `transition ${String(index)} goes up to the ground, so lies in a pit with its high edge on the pit's`,
        });
      }
    });
    for (let layer = map.groundLayer + 1; layer < map.layers; layer += 1) {
      if (!map.decks.some((deck) => deck.layer === layer)) {
        context.addIssue({
          code: "custom",
          path: ["layers"],
          message: `layer ${String(layer)} has no deck`,
        });
      }
    }
    if (map.groundLayer === 0 && map.pits.length + map.tunnels.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["groundLayer"],
        message: "pits and tunnels are below the ground, and layer 0 has nothing below it",
      });
    }
    if (map.groundLayer === 1 && map.pits.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["groundLayer"],
        message: "the ground is layer 1, so layer 0 under it needs a pit",
      });
    }
    const belowIds = new Set<string>();
    const belowGround = (kind: "pits" | "tunnels", below: BelowGround, index: number): void => {
      if (belowIds.has(below.id)) {
        context.addIssue({
          code: "custom",
          path: [kind, index, "id"],
          message: `id ${below.id} is used twice`,
        });
      }
      belowIds.add(below.id);
      if (!shapeInBounds(below.footprint, map.width, map.height)) {
        context.addIssue({
          code: "custom",
          path: [kind, index, "footprint"],
          message: `${below.id}'s footprint is outside the map`,
        });
      }
    };
    map.pits.forEach((pit, index) => {
      belowGround("pits", pit, index);
    });
    map.tunnels.forEach((tunnel, index) => {
      belowGround("tunnels", tunnel, index);
      if (!map.pits.some((pit) => shapesOverlap(tunnel.footprint, pit.footprint))) {
        context.addIssue({
          code: "custom",
          path: ["tunnels", index],
          message: `tunnel ${tunnel.id} touches no pit`,
        });
      }
    });
    const altar = map.objectives.find((objective) => objective.kind === "altar")?.position;
    map.gates.forEach((gate, index) => {
      const opener = gate.opener;
      if (
        opener.kind === "plate" &&
        opener.oneWay === true &&
        (altar === undefined ||
          firstHit(opener.plate, altar, wallToSegments(gate.wall)) !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["gates", index, "opener", "plate"],
          message: `one-way gate ${gate.id} needs its plate on the altar's side`,
        });
      }
    });
    map.gates.forEach((gate, index) => {
      const opener = gate.opener;
      if (opener.kind !== "plate") {
        return;
      }
      const clear = standsClear(map, opener.plate, gate.wall.layer, wallToSegments(gate.wall));
      if (!clear || (opener.team !== null && !teams.has(opener.team))) {
        context.addIssue({
          code: "custom",
          path: ["gates", index],
          message: `gate ${gate.id} needs a spawning team or none, and its plate on the map and a body clear of every wall`,
        });
      }
    });
    map.objectives.forEach((objective, index) => {
      if (objective.kind === "start-line") {
        const { x, y, width, height } = objective.area;
        if (x < 0 || y < 0 || x + width > map.width || y + height > map.height) {
          context.addIssue({
            code: "custom",
            path: ["objectives", index],
            message: `objective ${String(index)} must lie on the map`,
          });
        }
        return;
      }
      const teamed = !("team" in objective) || teams.has(objective.team);
      if (!teamed || !standsClear(map, objective.position, objective.layer)) {
        context.addIssue({
          code: "custom",
          path: ["objectives", index],
          message: `objective ${String(index)} must be a spawning team's or shared, on the map and a body clear of every wall`,
        });
      }
    });

    const water = map.water ?? [];
    const waterIds = new Set<string>();
    /** Whether a body at `point` would stand in any of `area`. */
    const bodyIn = (point: Vec2Data, area: Shape): boolean =>
      pointInShape(point, area) ||
      wallToSegments(area).some((side) => distancePointToSegment(point, side) < BODY_RADIUS);
    water.forEach((body, index) => {
      layerInRange(body.layer, ["water", index, "layer"]);
      if (waterIds.has(body.id)) {
        context.addIssue({
          code: "custom",
          path: ["water", index, "id"],
          message: `water id ${body.id} is used twice`,
        });
      }
      waterIds.add(body.id);
      if (!shapeInBounds(body.area, map.width, map.height)) {
        context.addIssue({
          code: "custom",
          path: ["water", index, "area"],
          message: `water ${body.id} is outside the map`,
        });
      }
      const decks = map.decks.filter((deck) => deck.layer === body.layer);
      if (
        body.layer > map.groundLayer &&
        !shapeVertices(body.area).every((point) =>
          decks.some((deck) => pointInShape(point, deck.footprint)),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["water", index, "area"],
          message: `water ${body.id} on layer ${String(body.layer)} is not on a deck`,
        });
      }
      water.slice(0, index).forEach((other) => {
        if (other.layer === body.layer && shapesOverlap(other.area, body.area)) {
          context.addIssue({
            code: "custom",
            path: ["water", index, "area"],
            message: `water ${body.id} overlaps water ${other.id}`,
          });
        }
      });
      if (body.depth === "shallow") {
        return;
      }
      const blocked = (path: (string | number)[], what: string): void => {
        context.addIssue({
          code: "custom",
          path: ["water", index, "area"],
          message: `deep water ${body.id} covers ${what} (${path.join(".")})`,
        });
      };
      map.spawnPoints.forEach((spawn, at) => {
        if (spawn.layer === body.layer && bodyIn(spawn.position, body.area)) {
          blocked(["spawnPoints", at], "a spawn");
        }
      });
      map.objectives.forEach((objective, at) => {
        const covered =
          objective.layer === body.layer &&
          (objective.kind === "start-line"
            ? shapesOverlap(objective.area, body.area)
            : bodyIn(objective.position, body.area));
        if (covered) {
          blocked(["objectives", at], `an objective, ${OBJECTIVE_NAMES[objective.kind]}`);
        }
      });
      map.gates.forEach((gate, at) => {
        if (
          gate.wall.layer === body.layer &&
          (shapesOverlap(gate.wall, body.area) ||
            (gate.opener.kind === "plate" && bodyIn(gate.opener.plate, body.area)))
        ) {
          blocked(["gates", at], "a gate");
        }
      });
      (map.breakables ?? []).forEach((breakable, at) => {
        if (breakable.wall.layer === body.layer && shapesOverlap(breakable.wall, body.area)) {
          blocked(["breakables", at], "a breakable wall");
        }
      });
      (map.switches ?? []).forEach((lever, at) => {
        if (lever.layer === body.layer && bodyIn(lever.position, body.area)) {
          blocked(["switches", at], "a switch");
        }
      });
      map.transitions.forEach((transition, at) => {
        if (
          (transition.from === body.layer || transition.to === body.layer) &&
          shapesOverlap(transition.area, body.area)
        ) {
          blocked(["transitions", at], "a transition");
        }
      });
    });

    // A teleport's entry is ground routes go round as well (#3030).
    const harmfulPoints =
      (map.zones ?? [])
        .filter((zone) => ZONE_RULES[zone.kind].harmful)
        .reduce((sum, zone) => sum + zoneReach(shapeVertices(zone.area), zone.path).length, 0) +
      (map.teleports ?? []).reduce((sum, { from }) => sum + shapeVertices(from.area).length, 0);
    if (harmfulPoints > MAX_HARMFUL_ZONE_POINTS) {
      context.addIssue({
        code: "custom",
        path: ["zones"],
        message: `harmful zones and teleport entries have ${String(harmfulPoints)} corners, more than ${String(MAX_HARMFUL_ZONE_POINTS)}`,
      });
    }
    const zoneIds = new Set<string>();
    (map.zones ?? []).forEach((zone, index) => {
      layerInRange(zone.layer, ["zones", index, "layer"]);
      if (zoneIds.has(zone.id)) {
        context.addIssue({
          code: "custom",
          path: ["zones", index, "id"],
          message: `zone id ${zone.id} is used twice`,
        });
      }
      zoneIds.add(zone.id);
      if (!shapeInBounds(zone.area, map.width, map.height)) {
        context.addIssue({
          code: "custom",
          path: ["zones", index, "area"],
          message: `zone ${zone.id} is outside the map`,
        });
      }
      for (const { at, message } of zoneTimingIssues(zone)) {
        context.addIssue({ code: "custom", path: ["zones", index, ...at], message });
      }
      const reach = zoneReach(shapeVertices(zone.area), zone.path);
      if (
        zone.path !== undefined &&
        !reach.every(({ x, y }) => x >= 0 && y >= 0 && x <= map.width && y <= map.height)
      ) {
        context.addIssue({
          code: "custom",
          path: ["zones", index, "path"],
          message: `zone ${zone.id} moves outside the map`,
        });
      }
    });

    const gateKinds = new Map(map.gates.map((gate) => [gate.id, gate.opener.kind]));
    const teleports = map.teleports ?? [];
    const teleportIds = new Set(teleports.map((teleport) => teleport.id));
    const switched = new Set<string>();
    const switchIds = new Set<string>();
    (map.switches ?? []).forEach((lever, index) => {
      layerInRange(lever.layer, ["switches", index, "layer"]);
      if (switchIds.has(lever.id)) {
        context.addIssue({
          code: "custom",
          path: ["switches", index, "id"],
          message: `switch id ${lever.id} is used twice`,
        });
      }
      switchIds.add(lever.id);
      if (!standsClear(map, lever.position, lever.layer)) {
        context.addIssue({
          code: "custom",
          path: ["switches", index, "position"],
          message: `switch ${lever.id} needs a body clear of every wall, on its layer's ground`,
        });
      }
      lever.targets.forEach((target, at) => {
        switched.add(target);
        const kind = gateKinds.get(target);
        if (kind !== "switch" && !teleportIds.has(target)) {
          context.addIssue({
            code: "custom",
            path: ["switches", index, "targets", at],
            message:
              kind === undefined
                ? `switch ${lever.id} names ${target}, which is no gate or teleport`
                : `switch ${lever.id} names ${target}, a plate's gate`,
          });
        }
      });
    });
    map.gates.forEach((gate, index) => {
      if (gate.opener.kind === "switch" && !switched.has(gate.id)) {
        context.addIssue({
          code: "custom",
          path: ["gates", index, "opener"],
          message: `gate ${gate.id} opens by switch, and no switch names it`,
        });
      }
    });
    teleports.forEach((teleport, index) => {
      const at = (...rest: (string | number)[]): (string | number)[] => [
        "teleports",
        index,
        ...rest,
      ];
      const issue = (path: (string | number)[], message: string): void => {
        context.addIssue({ code: "custom", path, message });
      };
      layerInRange(teleport.from.layer, at("from", "layer"));
      layerInRange(teleport.to.layer, at("to", "layer"));
      if (
        gateKinds.has(teleport.id) ||
        teleports.findIndex(({ id }) => id === teleport.id) < index
      ) {
        issue(at("id"), `teleport id ${teleport.id} is used twice among gates and teleports`);
      }
      const exit = teleport.to;
      if (!standsClear(map, exit.position, exit.layer)) {
        issue(
          at("to"),
          `teleport ${teleport.id} needs its exit clear of every wall, on its layer's ground`,
        );
      }
      if (
        teleports.some(({ from }) => from.layer === exit.layer && bodyIn(exit.position, from.area))
      ) {
        issue(at("to"), `teleport ${teleport.id} has its exit in a teleport's entry`);
      }
      if (
        water.some(
          (body) =>
            body.depth === "deep" && body.layer === exit.layer && bodyIn(exit.position, body.area),
        )
      ) {
        issue(at("to"), `teleport ${teleport.id} has its exit in deep water`);
      }
      if (!teleport.enabled && !switched.has(teleport.id)) {
        issue(at("enabled"), `teleport ${teleport.id} starts off, and no switch names it`);
      }
    });
    const breakables = map.breakables ?? [];
    const breakableIds = new Set<string>();
    breakables.forEach((breakable, index) => {
      const issue = (message: string): void => {
        context.addIssue({ code: "custom", path: ["breakables", index], message });
      };
      if (breakableIds.has(breakable.id)) {
        issue(`breakable id ${breakable.id} is used twice`);
      }
      breakableIds.add(breakable.id);
      const layer = breakable.wall.layer;
      const sides = wallToSegments(breakable.wall);
      const covers = (point: Vec2Data): boolean =>
        pointInShape(point, breakable.wall) ||
        sides.some((side) => distancePointToSegment(point, side) < BODY_RADIUS);
      (map.switches ?? []).forEach((lever) => {
        if (lever.layer === layer && covers(lever.position)) {
          issue(`breakable ${breakable.id} covers switch ${lever.id}`);
        }
      });
      map.gates.forEach((gate) => {
        const opener = gate.opener;
        if (opener.kind === "plate" && gate.wall.layer === layer && covers(opener.plate)) {
          issue(`breakable ${breakable.id} covers gate ${gate.id}'s plate`);
        }
      });
    });
    // Each gate, breakable and switched teleport doubles the match's pre-built paths.
    const toggles =
      map.gates.length + breakables.length + teleports.filter(({ id }) => switched.has(id)).length;
    if (toggles > MAX_GATES) {
      context.addIssue({
        code: "custom",
        path: ["gates"],
        message: `${String(toggles)} gates, breakables and switched teleports, more than ${String(MAX_GATES)}`,
      });
    }

    const lighting = map.lighting;
    if (lighting !== undefined) {
      const lightIds = new Set<string>();
      lighting.lights.forEach((light, index) => {
        const onMap =
          light.position.x >= 0 &&
          light.position.y >= 0 &&
          light.position.x <= map.width &&
          light.position.y <= map.height;
        if (light.layer >= map.layers || !onMap || lightIds.has(light.id)) {
          context.addIssue({
            code: "custom",
            path: ["lighting", "lights", index],
            message: `light ${String(index)} must have its own id, on one of the map's layers and on the map`,
          });
        }
        lightIds.add(light.id);
      });
    }
  });

export type Vec2Data = z.infer<typeof vec2Schema>;
export type RectWall = z.infer<typeof rectWallSchema>;
export type PolygonWall = z.infer<typeof polygonWallSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Deck = z.infer<typeof deckSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type BelowGround = z.infer<typeof belowGroundSchema>;
export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type MapLighting = z.infer<typeof lightingSchema>;
export type Water = z.infer<typeof waterSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type GateOpener = z.infer<typeof openerSchema>;
export type Switch = z.infer<typeof switchSchema>;
export type Teleport = z.infer<typeof teleportSchema>;
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
