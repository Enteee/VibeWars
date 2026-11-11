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
  segmentsIntersect,
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

/**
 * What a deck is drawn as (#3067, #3078): the floor walks the same whatever
 * its look, but a tower, a wall-walk and a bridge each have a role in play.
 */
export const DECK_LOOKS = [
  "platform",
  "tower",
  "wall-walk",
  "terrace",
  "bridge-stone",
  "bridge-plank",
  "bridge-log",
  "ledge",
  "ruin",
  "arch",
  "gatehouse-roof",
  "rooftop",
  "pier",
  "plinth",
] as const;

/** What a transition is drawn as (#3067); #3069 gives each its own climbing pace. */
export const TRANSITION_LOOKS = [
  "ramp",
  "stairs",
  "stairs-landing",
  "ladder",
  "rough-steps",
  "lift",
] as const;

/**
 * A deck that comes and goes (#3068). Up, it is walked as any deck; down,
 * nobody can step on it, and whoever stands on it is pushed off to its
 * nearer end (`push-off`, a drawbridge raised at its `hinge`) or falls to
 * the layer under it (`fall`, a rope bridge cut or a floor collapsed).
 * A switch that names it toggles it; a `once` deck goes down only once,
 * and an `afterCrossings` one goes down by itself once that many bodies
 * have stepped onto it.
 */
/** The most bodies a floor takes before it gives way (#3068), as `MAX_WIRE_CRACKS` in game-protocol. */
export const MAX_AFTER_CROSSINGS = 16;

const switchedDeckSchema = z.object({
  startsUp: z.boolean(),
  whenDown: z.enum(["push-off", "fall"]),
  once: z.boolean(),
  afterCrossings: z.number().int().positive().max(MAX_AFTER_CROSSINGS).nullable(),
  hinge: z.enum(["n", "e", "s", "w"]).nullable(),
});

/**
 * The looks a switched deck may have, by what it does going down (#3068):
 * a drawbridge is a bridge; what gives way under you is planks or a ruin.
 */
const SWITCHED_DECK_LOOKS: Readonly<
  Record<"push-off" | "fall", readonly (typeof DECK_LOOKS)[number][]>
> = {
  "push-off": ["bridge-stone", "bridge-plank", "bridge-log"],
  fall: ["bridge-plank", "ruin"],
};

/** A walkable floor above the ground (ADR-0051). */
const deckSchema = z.object({
  id: z.string().min(1),
  layer: layerSchema,
  footprint: shapeSchema,
  look: z.enum(DECK_LOOKS),
  /** `null` for a deck that is always there. */
  switched: switchedDeckSchema.nullable(),
});

/**
 * A lift (#3079): a platform that carries whoever stands on it between a
 * transition's two layers, resting at each in turn. A `timer` lift rests
 * `restSeconds` at the bottom, travels `travelSeconds`, rests at the top
 * and travels down, over and over; a `lever` lift travels to the other
 * layer each time a switch naming it is flipped while it rests. A rest
 * lasts half a second at least, longer than any step, so a lift always
 * stops at each end.
 */
const liftSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("timer"),
    restSeconds: z.number().min(0.5).max(60),
    travelSeconds: z.number().positive().max(10),
  }),
  z.object({ kind: z.literal("lever") }),
]);

/**
 * A ramp or stairs (ADR-0051): inside `area`, a body moves between `from`
 * and `to`, one above, climbing towards `uphill` (#2973). A lift (#3079)
 * is not climbed: it carries.
 */
const transitionSchema = z.object({
  id: z.string().min(1),
  from: layerSchema,
  to: layerSchema,
  area: shapeSchema,
  uphill: z.enum(["n", "e", "s", "w"]),
  look: z.enum(TRANSITION_LOOKS),
  /** `null` for a transition walked up and down. */
  lift: liftSchema.nullable(),
});

/** The most drop-offs on a map (#3069). */
export const MAX_DROP_OFFS = 16;

/**
 * A drop-off (#3069): a stretch of `layer`'s edge from `from` to `to`
 * that a body steps off onto the layer below, and never climbs.
 */
const dropOffSchema = z.object({
  layer: layerSchema,
  from: vec2Schema,
  to: vec2Schema,
});

/**
 * A hole in the ground down to the layer under it (#2973): open to the sky,
 * entered only by a ramp. A tunnel is a floor of that layer under the ground.
 */
const belowGroundSchema = z.object({
  id: z.string().min(1),
  footprint: rectWallSchema,
});

/**
 * The most corners of a ground outline (#3066): each one is a nav node on
 * the ground, against the 600-node budget the bots path with.
 */
export const MAX_OUTLINE_POINTS = 32;

/** What lies beyond a ground outline (#3066), each its own art; cliffs and deep water leave sight open. */
export const OUTSIDE_KINDS = ["cliff", "rock", "forest", "deep-water"] as const;

/**
 * A map's ground (#3066): its whole rectangle, or a simple polygon inside
 * it, natural impassable land outside. Required, as `gates`.
 */
const boundsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect") }),
  z.object({
    kind: z.literal("outline"),
    outline: z.array(vec2Schema).min(3).max(MAX_OUTLINE_POINTS),
    outside: z.enum(OUTSIDE_KINDS),
  }),
]);

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

/** The most fog banks on a map (#3032). */
export const MAX_FOG_BANKS = 8;

/** The most smoke or steam plumes on a map (#3032). */
export const MAX_PLUMES = 12;

/**
 * A map's atmosphere (#3032): fog banks, plumes and weather. Only the
 * renderer reads it, never the simulation, and it changes nothing in play.
 */
const atmosphereSchema = z.object({
  /** Soft, slowly drifting haze over one layer's ground. */
  fog: z.array(z.object({ layer: layerSchema, area: waterSchema.shape.area })).max(MAX_FOG_BANKS),
  /** Smoke or steam rising from a point. */
  plumes: z
    .array(
      z.object({
        id: z.string().min(1),
        layer: layerSchema,
        position: vec2Schema,
        kind: z.enum(["smoke", "steam"]),
      }),
    )
    .max(MAX_PLUMES),
  /** Rain or snow over the whole view, or none. */
  weather: z
    .object({ kind: z.enum(["rain", "snow"]), intensity: z.number().min(0).max(1) })
    .nullable(),
});

/**
 * The most things on a map that change how it is walked (#2691, #3068):
 * gates, breakable walls, switched teleports, switched decks and lifts
 * (#3079) together.
 * The match keeps paths for each way they can stand.
 */
const MAX_TOGGLES = 6;

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
  /**
   * What it is drawn as while closed (#3068): a `door`, a `portcullis`,
   * or a `secret` passage that looks like the rock wall round it.
   */
  look: z.enum(["door", "portcullis", "secret"]),
});

/** The most switches on a map (#3025). */
export const MAX_SWITCHES = 6;

/** A lever (#3025): flipping it toggles every gate, teleport (#3030) or switched deck (#3068) it names in `targets`. */
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

/** The widest a tower's top may be either way (#3067): room for two to four bodies, easy to rush. */
export const MAX_TOWER_SIZE = 120;

/** The widest a plinth may be either way (#3078): a statue's base, a capture spot one step up. */
export const MAX_PLINTH_SIZE = 200;

/** The widest a ladder may be across (#3067): under two bodies, so it is climbed single file. */
export const MAX_LADDER_WIDTH = 48;

/** How far a wall-walk may stand out past the walls under it (#3067). */
export const WALL_WALK_OVERHANG = 8;

/** How far apart the points are that test a wall-walk lies over walls. */
const WALL_WALK_SAMPLE = 8;

/**
 * Whether all of `footprint` lies over `walls`, give or take
 * `WALL_WALK_OVERHANG`: each point of a grid over it is in a wall, or
 * that close to one's edge.
 */
function overWalls(footprint: Shape, walls: readonly Wall[]): boolean {
  const corners = shapeVertices(footprint);
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  const edges = allWallSegments(walls);
  const covered = (point: Vec2Data): boolean =>
    walls.some((wall) => pointInShape(point, wall)) ||
    edges.some((edge) => distancePointToSegment(point, edge) <= WALL_WALK_OVERHANG);
  const along = (low: number, high: number): number[] => {
    const steps = Math.max(1, Math.ceil((high - low) / WALL_WALK_SAMPLE));
    return Array.from({ length: steps + 1 }, (_, k) => low + ((high - low) * k) / steps);
  };
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return (
    along(left, right).every((x) =>
      along(top, bottom).every((y) => !pointInShape({ x, y }, footprint) || covered({ x, y })),
    ) && corners.every(covered)
  );
}

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
export interface LayeredMap {
  readonly width: number;
  readonly height: number;
  readonly bounds: MapBounds;
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
          (onGround(map.bounds, point) &&
            !map.pits.some((pit) => pointInShape(point, pit.footprint))) ||
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

/** Whether `point` is on a map's ground (#3066): inside its outline, if it has one. */
function onGround(bounds: MapBounds, point: Vec2Data): boolean {
  return bounds.kind === "rect" || pointInShape(point, { kind: "polygon", points: bounds.outline });
}

/** Whether all of `shape` is on a map's ground (#3066): no corner outside, no side crossing its edge. */
function shapeOnGround(bounds: MapBounds, shape: Shape): boolean {
  if (bounds.kind === "rect") {
    return true;
  }
  const edge = wallToSegments({ kind: "polygon", points: bounds.outline });
  return (
    shapeVertices(shape).every((point) => onGround(bounds, point)) &&
    !wallToSegments(shape).some((side) => edge.some((other) => segmentsCross(side, other)))
  );
}

/** Whether two segments cross, touching at an end not counted: a ramp may run along the edge. */
function segmentsCross(first: Segment, second: Segment): boolean {
  const side = (point: Vec2Data, { a, b }: Segment): number =>
    Math.sign((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
  return (
    side(first.a, second) * side(first.b, second) < 0 &&
    side(second.a, first) * side(second.b, first) < 0
  );
}

/** Whether an outline is simple (#3066): no side crosses or touches another but its neighbours at a corner. */
function outlineSimple(outline: readonly Vec2Data[]): boolean {
  const sides = wallToSegments({ kind: "polygon", points: outline });
  return sides.every((side, i) =>
    sides.every((other, j) => {
      const neighbours = Math.abs(i - j) <= 1 || Math.abs(i - j) === sides.length - 1;
      return neighbours || !segmentsIntersect(side, other);
    }),
  );
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

/** How far off its layer's edge a drop-off may lie, and how far apart the points are that test it (#3069). */
const DROP_OFF_SLACK = 4;
const DROP_OFF_SAMPLE = 8;

/** Whether `point` is on `layer`'s floor, ramps aside: its decks, the ground but its pits, or a pit (#3069). */
function onFloor(map: LayeredMap, point: Vec2Data, layer: number): boolean {
  if (layer === map.groundLayer) {
    return (
      onGround(map.bounds, point) && !map.pits.some((pit) => pointInShape(point, pit.footprint))
    );
  }
  const floors =
    layer < map.groundLayer
      ? [...map.pits, ...map.tunnels].map((below) => below.footprint)
      : map.decks.filter((deck) => deck.layer === layer).map((deck) => deck.footprint);
  return floors.some((floor) => pointInShape(point, floor));
}

/** Points along a drop-off, `DROP_OFF_SAMPLE` apart, ends included. */
function alongDropOff({ from, to }: DropOff): Vec2Data[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / DROP_OFF_SAMPLE));
  return Array.from({ length: steps + 1 }, (_, k) => ({
    x: from.x + ((to.x - from.x) * k) / steps,
    y: from.y + ((to.y - from.y) * k) / steps,
  }));
}

/**
 * Which way a body steps off a drop-off (#3069), a unit vector, or
 * `undefined` if it is no stretch of its layer's edge: all along it, its
 * layer's floor on one side and open on the other.
 */
export function dropOffOutward(map: LayeredMap, dropOff: DropOff): Vec2Data | undefined {
  const { layer, from, to } = dropOff;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) {
    return undefined;
  }
  const points = alongDropOff(dropOff);
  return [
    { x: (from.y - to.y) / length, y: (to.x - from.x) / length },
    { x: (to.y - from.y) / length, y: (from.x - to.x) / length },
  ].find((out) =>
    points.every(
      (point) =>
        !onFloor(map, step(point, out, DROP_OFF_SLACK), layer) &&
        onFloor(map, step(point, out, -DROP_OFF_SLACK), layer),
    ),
  );
}

/** `point` moved `by` along the unit vector `way`. */
function step(point: Vec2Data, way: Vec2Data, by: number): Vec2Data {
  return { x: point.x + way.x * by, y: point.y + way.y * by };
}

/**
 * Why a drop-off (#3069) is wrong, or `undefined`: it is a stretch of a
 * raised layer's edge, and a body stands clear on the layer below one
 * radius and one diameter past it, all along it, out of `deep` water.
 */
function dropOffFault(
  map: LayeredMap,
  dropOff: DropOff,
  deep: (point: Vec2Data) => boolean,
): string | undefined {
  if (dropOff.layer < 1) {
    return "is not a stretch of a raised edge";
  }
  const out = dropOffOutward(map, dropOff);
  if (out === undefined) {
    return `is not on layer ${String(dropOff.layer)}'s edge`;
  }
  const below = dropOff.layer - 1;
  const lands = alongDropOff(dropOff).every((point) =>
    [BODY_RADIUS, 2 * BODY_RADIUS].every((by) => {
      const landing = step(point, out, by);
      return standsClear(map, landing, below) && !deep(landing);
    }),
  );
  return lands ? undefined : `lands where a body cannot stand on layer ${String(below)}`;
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
    /** Its ground (#3066): the whole rectangle, or an outline inside it. */
    bounds: boundsSchema,
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
    /** Required, may be empty, as `gates` (#3069). */
    dropOffs: z.array(dropOffSchema).max(MAX_DROP_OFFS),
    walls: z.array(wallSchema),
    /** Its water (#2983); without it, the map has none. */
    water: z.array(waterSchema).max(MAX_WATER_BODIES).optional(),
    /** Its effect zones (ADR-0053); without it, the map has none. */
    zones: z.array(zoneSchema).max(MAX_ZONES).optional(),
    spawnPoints: z.array(spawnPointSchema).min(1),
    /** Required, may be empty: a map without objectives says so. */
    objectives: z.array(objectiveSchema),
    /** Required, may be empty, as `objectives` (#2691). */
    gates: z.array(gateSchema).max(MAX_TOGGLES),
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
    /** Its fog, smoke, steam and weather (#3032); without it, the map has none. */
    atmosphere: atmosphereSchema.optional(),
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
    if (map.bounds.kind === "outline") {
      const { outline } = map.bounds;
      if (outline.some(({ x, y }) => x < 0 || y < 0 || x > map.width || y > map.height)) {
        context.addIssue({
          code: "custom",
          path: ["bounds", "outline"],
          message: "the ground's outline must lie on the map",
        });
      }
      if (!outlineSimple(outline)) {
        context.addIssue({
          code: "custom",
          path: ["bounds", "outline"],
          message: "the ground's outline must not cross itself",
        });
      }
    }
    // Spawns, objectives, levers and plates stand on the ground through
    // `standsClear`; a deck may overhang the outside, it is a floor above.
    const offGround = (shape: Shape, path: (string | number)[], what: string): void => {
      if (!shapeOnGround(map.bounds, shape)) {
        context.addIssue({
          code: "custom",
          path,
          message: `${what} must be inside the ground's outline`,
        });
      }
    };
    map.transitions.forEach((transition, index) => {
      offGround(transition.area, ["transitions", index, "area"], `transition ${String(index)}`);
    });
    map.gates.forEach((gate, index) => {
      if (gate.wall.layer === map.groundLayer) {
        offGround(gate.wall, ["gates", index, "wall"], `gate ${gate.id}`);
      }
    });
    (map.zones ?? []).forEach((zone, index) => {
      if (zone.layer === map.groundLayer) {
        offGround(zone.area, ["zones", index, "area"], `zone ${zone.id}`);
      }
    });
    map.objectives.forEach((objective, index) => {
      if (objective.kind === "start-line") {
        offGround(objective.area, ["objectives", index], "the start line");
      }
    });
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
      const corners = shapeVertices(deck.footprint);
      const across = (axis: "x" | "y"): number =>
        Math.max(...corners.map((corner) => corner[axis])) -
        Math.min(...corners.map((corner) => corner[axis]));
      if (deck.look === "tower" && Math.max(across("x"), across("y")) > MAX_TOWER_SIZE) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "footprint"],
          message: `tower ${deck.id} is ${String(across("x"))} × ${String(across("y"))}, wider than the ${String(MAX_TOWER_SIZE)} a tower may be`,
        });
      }
      if (deck.look === "plinth") {
        if (Math.max(across("x"), across("y")) > MAX_PLINTH_SIZE) {
          context.addIssue({
            code: "custom",
            path: ["decks", index, "footprint"],
            message: `plinth ${deck.id} is ${String(across("x"))} × ${String(across("y"))}, wider than the ${String(MAX_PLINTH_SIZE)} a plinth may be`,
          });
        }
        if (deck.layer !== map.groundLayer + 1) {
          context.addIssue({
            code: "custom",
            path: ["decks", index, "layer"],
            message: `plinth ${deck.id} is on layer ${String(deck.layer)}, not one step above the ground`,
          });
        }
      }
      if (
        deck.look === "pier" &&
        !(map.water ?? []).some(
          (body) => body.layer < deck.layer && shapesOverlap(body.area, deck.footprint),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["decks", index, "footprint"],
          message: `pier ${deck.id} stands over no water`,
        });
      }
      if (deck.look === "wall-walk") {
        // A stone gate is wall to stand on, open or shut; an energy barrier is no floor (#3104).
        const gatesBelow = map.gates.filter(({ wall }) => wall.layer === deck.layer - 1);
        const stone = gatesBelow.filter(({ blocks }) => blocks === "all").map(({ wall }) => wall);
        const under = [...map.walls.filter((wall) => wall.layer === deck.layer - 1), ...stone];
        if (!overWalls(deck.footprint, under)) {
          const barriers = gatesBelow.filter(({ blocks }) => blocks === "bodies-and-shots");
          const spanned = overWalls(deck.footprint, [...under, ...barriers.map(({ wall }) => wall)])
            ? barriers.filter(
                (barrier) =>
                  !overWalls(deck.footprint, [
                    ...under,
                    ...barriers.filter((other) => other !== barrier).map(({ wall }) => wall),
                  ]),
              )
            : [];
          const gap = spanned.map(({ id }) => `, energy barrier ${id} is no floor`).join("");
          context.addIssue({
            code: "custom",
            path: ["decks", index, "footprint"],
            message: `wall-walk ${deck.id} does not lie over walls on layer ${String(deck.layer - 1)}${gap}`,
          });
        }
      }
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
      const switched = deck.switched;
      if (switched !== null) {
        const issue = (message: string): void => {
          context.addIssue({ code: "custom", path: ["decks", index, "switched"], message });
        };
        if (!SWITCHED_DECK_LOOKS[switched.whenDown].includes(deck.look)) {
          issue(`deck ${deck.id} is a ${deck.look}, which cannot ${switched.whenDown}`);
        }
        if ((switched.whenDown === "push-off") !== (switched.hinge !== null)) {
          issue(`deck ${deck.id} has a hinge only if it pushes off, as a drawbridge does`);
        }
        if (switched.whenDown === "fall" && !switched.once) {
          issue(`deck ${deck.id} falls, so it goes down once`);
        }
        if (
          switched.afterCrossings !== null &&
          (!switched.startsUp || switched.whenDown !== "fall")
        ) {
          issue(`deck ${deck.id} collapses under crossings, so it starts up and falls`);
        }
        if (
          switched.afterCrossings === null &&
          !(map.switches ?? []).some((lever) => lever.targets.includes(deck.id))
        ) {
          issue(
            `deck ${deck.id} is switched, and no switch names it nor do crossings bring it down`,
          );
        }
      }
    });
    /** Whether a body at `position` on `layer` would stand on a switched deck (#3068). */
    const onSwitchedDeck = (position: Vec2Data, layer: number): boolean =>
      map.decks.some(
        (deck) =>
          deck.switched !== null &&
          deck.layer === layer &&
          (pointInShape(position, deck.footprint) ||
            wallToSegments(deck.footprint).some(
              (side) => distancePointToSegment(position, side) < BODY_RADIUS,
            )),
      );
    map.spawnPoints.forEach((spawn, index) => {
      if (onSwitchedDeck(spawn.position, spawn.layer)) {
        context.addIssue({
          code: "custom",
          path: ["spawnPoints", index],
          message: `spawn ${String(index)} stands on a switched deck`,
        });
      }
    });
    map.objectives.forEach((objective, index) => {
      if ("position" in objective && onSwitchedDeck(objective.position, objective.layer)) {
        context.addIssue({
          code: "custom",
          path: ["objectives", index],
          message: `objective ${String(index)} stands on a switched deck`,
        });
      }
    });
    (map.teleports ?? []).forEach((teleport, index) => {
      if (onSwitchedDeck(teleport.to.position, teleport.to.layer)) {
        context.addIssue({
          code: "custom",
          path: ["teleports", index, "to"],
          message: `teleport ${teleport.id} has its exit on a switched deck`,
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
      if (transition.look === "ladder" && width > MAX_LADDER_WIDTH) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "area"],
          message: `ladder ${String(index)} is ${width.toFixed(1)} wide, wider than the ${String(MAX_LADDER_WIDTH)} a ladder may be`,
        });
      }
      if (map.transitions.findIndex(({ id }) => id === transition.id) < index) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "id"],
          message: `transition id ${transition.id} is used twice`,
        });
      }
      if ((transition.look === "lift") !== (transition.lift !== null)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "lift"],
          message:
            transition.lift === null
              ? `transition ${transition.id} looks a lift but does not run as one`
              : `lift ${transition.id} must look a lift`,
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
    map.dropOffs.forEach((dropOff, index) => {
      layerInRange(dropOff.layer, ["dropOffs", index, "layer"]);
      const fault = dropOffFault(map, dropOff, (point) =>
        water.some(
          (body) =>
            body.depth === "deep" && body.layer === dropOff.layer - 1 && bodyIn(point, body.area),
        ),
      );
      if (fault !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["dropOffs", index],
          message: `drop-off ${String(index)} ${fault}`,
        });
      }
    });
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
    const switchedDeckIds = new Set(
      map.decks.flatMap((deck) => (deck.switched === null ? [] : [deck.id])),
    );
    const leverLiftIds = new Set(
      map.transitions.flatMap(({ id, lift }) => (lift?.kind === "lever" ? [id] : [])),
    );
    const liftCount = map.transitions.filter(({ lift }) => lift !== null).length;
    map.transitions.forEach((transition, index) => {
      if (
        transition.lift !== null &&
        (map.gates.some(({ id }) => id === transition.id) ||
          map.decks.some(({ id }) => id === transition.id) ||
          (map.teleports ?? []).some(({ id }) => id === transition.id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "id"],
          message: `lift id ${transition.id} is also a gate's, deck's or teleport's`,
        });
      }
    });
    map.gates.forEach((gate, index) => {
      if (
        map.gates.findIndex(({ id }) => id === gate.id) < index ||
        map.decks.some(({ id }) => id === gate.id)
      ) {
        context.addIssue({
          code: "custom",
          path: ["gates", index, "id"],
          message: `gate id ${gate.id} is used twice among gates and decks`,
        });
      }
    });
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
        if (
          kind !== "switch" &&
          !teleportIds.has(target) &&
          !switchedDeckIds.has(target) &&
          !leverLiftIds.has(target)
        ) {
          context.addIssue({
            code: "custom",
            path: ["switches", index, "targets", at],
            message:
              kind === undefined
                ? `switch ${lever.id} names ${target}, which is no gate, teleport, switched deck or lever lift`
                : `switch ${lever.id} names ${target}, a plate's gate`,
          });
        }
      });
    });
    map.transitions.forEach((transition, index) => {
      if (leverLiftIds.has(transition.id) && !switched.has(transition.id)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "lift"],
          message: `lever lift ${transition.id} is named by no switch`,
        });
      }
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
        map.decks.some(({ id }) => id === teleport.id) ||
        teleports.findIndex(({ id }) => id === teleport.id) < index
      ) {
        issue(
          at("id"),
          `teleport id ${teleport.id} is used twice among gates, decks and teleports`,
        );
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
    // Each gate, breakable, switched teleport, switched deck and lift doubles the match's pre-built paths.
    const toggles =
      map.gates.length +
      breakables.length +
      teleports.filter(({ id }) => switched.has(id)).length +
      switchedDeckIds.size +
      liftCount;
    if (toggles > MAX_TOGGLES) {
      context.addIssue({
        code: "custom",
        path: ["gates"],
        message: `${String(toggles)} gates, breakables, switched teleports, switched decks and lifts, more than ${String(MAX_TOGGLES)}`,
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

    const atmosphere = map.atmosphere;
    if (atmosphere !== undefined) {
      atmosphere.fog.forEach((bank, index) => {
        layerInRange(bank.layer, ["atmosphere", "fog", index, "layer"]);
        if (!shapeInBounds(bank.area, map.width, map.height)) {
          context.addIssue({
            code: "custom",
            path: ["atmosphere", "fog", index, "area"],
            message: `fog bank ${String(index)} is outside the map`,
          });
        }
      });
      const plumeIds = new Set<string>();
      atmosphere.plumes.forEach((plume, index) => {
        layerInRange(plume.layer, ["atmosphere", "plumes", index, "layer"]);
        const onMap =
          plume.position.x >= 0 &&
          plume.position.y >= 0 &&
          plume.position.x <= map.width &&
          plume.position.y <= map.height;
        if (!onMap || plumeIds.has(plume.id)) {
          context.addIssue({
            code: "custom",
            path: ["atmosphere", "plumes", index],
            message: `plume ${String(index)} must have its own id and be on the map`,
          });
        }
        plumeIds.add(plume.id);
      });
    }
  });

export type Vec2Data = z.infer<typeof vec2Schema>;
export type RectWall = z.infer<typeof rectWallSchema>;
export type PolygonWall = z.infer<typeof polygonWallSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Deck = z.infer<typeof deckSchema>;
export type DeckLook = Deck["look"];
export type TransitionLook = Transition["look"];
export type Transition = z.infer<typeof transitionSchema>;
export type BelowGround = z.infer<typeof belowGroundSchema>;
export type DropOff = z.infer<typeof dropOffSchema>;
export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type MapLighting = z.infer<typeof lightingSchema>;
export type MapAtmosphere = z.infer<typeof atmosphereSchema>;
export type Water = z.infer<typeof waterSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type GateLook = Gate["look"];
/** How a switched deck (#3068) comes and goes, as the map lays it out. */
export type SwitchedDeckData = NonNullable<Deck["switched"]>;
/** How a lift (#3079) runs, as the map lays it out. */
export type TransitionLift = NonNullable<Transition["lift"]>;
export type GateOpener = z.infer<typeof openerSchema>;
export type Switch = z.infer<typeof switchSchema>;
export type Teleport = z.infer<typeof teleportSchema>;
export type MapData = z.infer<typeof mapDataSchema>;
export type MapBounds = z.infer<typeof boundsSchema>;
export type OutsideKind = (typeof OUTSIDE_KINDS)[number];

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
