import { describe, expect, it } from "vitest";

import type { Polygon, Segment } from "./geometry.js";
import {
  buildLayeredNavGraph,
  buildNavGraph,
  createLayeredPathFinder,
  createPathFinder,
  isStandable,
  navGraphFor,
  walkIsClear,
  walkableOutline,
  type NavGraph,
  type NavLayer,
  type NavTransition,
} from "./pathing.js";
import { vec2 } from "./vec2.js";

const RADIUS = 14;
const BOUNDS = { width: 1600, height: 800 };

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];
const wall = (shape: Polygon): Segment[] =>
  shape.flatMap((a, at) => {
    const b = shape[(at + 1) % shape.length];
    return b === undefined ? [] : [{ a, b }];
  });

/** The `layer-test` shape with a ramp at each end of the bridge. */
const DECK = rect(500, 300, 600, 200);
const WEST = rect(350, 300, 170, 200);
const EAST = rect(1080, 300, 170, 200);
const TRANSITIONS: readonly NavTransition[] = [
  { from: 0, to: 1, area: WEST },
  { from: 0, to: 1, area: EAST },
];
const WEST_PORTAL = vec2(435, 400);
const EAST_PORTAL = vec2(1165, 400);

function graphs(groundWalls: readonly Segment[] = []): readonly NavGraph[] {
  const layers: readonly NavLayer[] = [
    { walls: groundWalls, walkable: [], open: [] },
    { walls: [], walkable: [DECK, WEST, EAST], open: [] },
  ];
  return buildLayeredNavGraph(layers, [], BOUNDS, RADIUS).map((gated) => navGraphFor(gated, 0));
}

function finder(groundWalls: readonly Segment[] = []) {
  return createLayeredPathFinder(graphs(groundWalls), TRANSITIONS);
}

describe("a ramp's waypoints (#2972)", () => {
  // A ramp with a way up, reaching onto the deck: 140 long, Training Heights' length.
  const RAMP = rect(380, 300, 140, 200);
  const CLIMBS: readonly NavTransition[] = [{ from: 0, to: 1, area: RAMP, uphill: vec2(1, 0) }];

  // A second storey: its ramp ends past the deck, so the deck's outline runs across its top.
  const UPPER_RAMP = rect(1000, 300, 140, 200);
  const UPPER_DECK = rect(1120, 300, 400, 200);
  const UPPER_CLIMBS: readonly NavTransition[] = [
    { from: 1, to: 2, area: UPPER_RAMP, uphill: vec2(1, 0) },
  ];

  const navOf = (walkable: readonly (readonly Polygon[])[]): readonly NavGraph[] =>
    buildLayeredNavGraph(
      walkable.map((areas) => ({ walls: [], walkable: areas, open: [] })),
      [],
      BOUNDS,
      RADIUS,
    ).map((gated) => navGraphFor(gated, 0));
  const ramp = navOf([[], [DECK, RAMP]]);
  const storeys = navOf([[], [DECK, UPPER_RAMP], [UPPER_DECK, UPPER_RAMP]]);

  /** Every leg of a route is walkable on the layer its body is on, so the route cache keeps it. */
  const expectEveryLegClear = (
    nav: readonly NavGraph[],
    transitions: readonly NavTransition[],
    from: ReturnType<typeof vec2>,
    fromLayer: number,
    to: ReturnType<typeof vec2>,
    toLayer: number,
  ): void => {
    const route = createLayeredPathFinder(nav, transitions).find(from, fromLayer, to, toLayer);
    expect(route).toBeDefined();
    let at = from;
    let layer = fromLayer;
    for (const waypoint of route ?? []) {
      const graph = nav[layer];
      expect(graph !== undefined && walkIsClear(graph, at, waypoint)).toBe(true);
      at = waypoint;
      layer = waypoint.layer;
    }
  };

  it("keeps its waypoints in sight of a body coming down from the deck", () => {
    expectEveryLegClear(ramp, CLIMBS, vec2(800, 400), 1, vec2(200, 400), 0);
  });

  it("keeps its waypoints in sight of a body going up from the ground", () => {
    expectEveryLegClear(ramp, CLIMBS, vec2(200, 400), 0, vec2(800, 400), 1);
  });

  it("keeps its waypoints in sight of a body climbing from the deck to the next storey", () => {
    expectEveryLegClear(storeys, UPPER_CLIMBS, vec2(700, 400), 1, vec2(1400, 400), 2);
  });
});

describe("paths across layers (ADR-0051)", () => {
  it("routes over the bridge by its ramp, one waypoint for the ramp, on the far layer", () => {
    expect(finder().find(vec2(300, 400), 0, vec2(800, 400), 1)).toEqual([
      { ...WEST_PORTAL, layer: 1 },
      { x: 800, y: 400, layer: 1 },
    ]);
  });

  it("walks straight under the bridge on the ground", () => {
    expect(finder().find(vec2(300, 400), 0, vec2(1400, 400), 0)).toEqual([
      { x: 1400, y: 400, layer: 0 },
    ]);
  });

  it("takes no shortcut up through a deck", () => {
    const path = finder().find(vec2(800, 100), 0, vec2(800, 400), 1);
    expect(path?.[0]?.layer).toBe(1);
    expect(path?.length).toBe(2);
    expect([WEST_PORTAL.x, EAST_PORTAL.x]).toContain(path?.[0]?.x);
  });

  it("goes back by a ramp to leave a deck, never off its edge", () => {
    const path = finder().find(vec2(800, 400), 1, vec2(800, 100), 0);
    expect(path?.[0]?.layer).toBe(0);
    expect([WEST_PORTAL.x, EAST_PORTAL.x]).toContain(path?.[0]?.x);
  });

  it("refuses a goal on a layer that has no floor there", () => {
    expect(finder().find(vec2(800, 400), 1, vec2(800, 100), 1)).toBeUndefined();
  });

  it("passes the opening a ramp shares with its deck", () => {
    expect(finder().find(vec2(400, 400), 1, vec2(800, 400), 1)).toEqual([
      { x: 800, y: 400, layer: 1 },
    ]);
  });

  it("goes over the deck between two ground points a wall parts", () => {
    const river = wall(rect(890, -10, 20, 820));
    expect(finder(river).find(vec2(300, 400), 0, vec2(1400, 400), 0)).toEqual([
      { ...WEST_PORTAL, layer: 1 },
      { ...EAST_PORTAL, layer: 0 },
      { x: 1400, y: 400, layer: 0 },
    ]);
  });

  it("starts a body at a deck's edge from the nearest spot it fits on", () => {
    const path = finder().find(vec2(800, 300), 1, vec2(800, 400), 1);
    expect(path?.[0]).toMatchObject({ x: 800, layer: 1 });
    expect(path?.[0]?.y).toBeGreaterThan(300 + RADIUS);
    expect(path?.at(-1)).toEqual({ x: 800, y: 400, layer: 1 });
  });

  it("gives a ramp no link where a body does not fit on both layers", () => {
    const narrow = rect(350, 300, 170, 10);
    const layers: readonly NavLayer[] = [
      { walls: [], walkable: [], open: [] },
      { walls: [], walkable: [DECK, narrow], open: [] },
    ];
    const built = buildLayeredNavGraph(layers, [], BOUNDS, RADIUS).map((gated) =>
      navGraphFor(gated, 0),
    );
    const none = createLayeredPathFinder(built, [{ from: 0, to: 1, area: narrow }]);
    expect(none.find(vec2(300, 400), 0, vec2(800, 400), 1)).toBeUndefined();
  });

  it("routes in through a ramp's open low end, its rim enclosing nothing (#2975)", () => {
    // The west ramp's rim: every edge but its low one, at x = 350.
    const rim: Segment[] = [
      { a: vec2(350, 300), b: vec2(520, 300) },
      { a: vec2(520, 300), b: vec2(520, 500) },
      { a: vec2(520, 500), b: vec2(350, 500) },
    ];
    const layers: readonly NavLayer[] = [
      { walls: [], walkable: [], open: rim },
      { walls: [], walkable: [DECK, WEST], open: [] },
    ];
    const built = buildLayeredNavGraph(layers, [], BOUNDS, RADIUS).map((gated) =>
      navGraphFor(gated, 0),
    );
    const [ground] = built;
    const [west] = TRANSITIONS;
    if (ground === undefined || west === undefined) throw new Error("no ground or ramp");
    expect(isStandable(ground, WEST_PORTAL)).toBe(true);
    const path = createLayeredPathFinder(built, [west]).find(vec2(435, 200), 0, vec2(800, 400), 1);
    expect(path?.at(-1)).toEqual({ x: 800, y: 400, layer: 1 });
    expect(path?.some(({ x, layer }) => layer === 0 && x < 350)).toBe(true);
  });

  it("counts every layer's nodes and both sides of each portal", () => {
    const built = graphs();
    const nodes = built.reduce((sum, graph) => sum + graph.nodes.length, 0);
    expect(createLayeredPathFinder(built, TRANSITIONS).nodeCount).toBe(nodes + 4);
  });

  it("finds on one layer exactly the path the plain finder does", () => {
    const pillar = wall(rect(700, 300, 100, 200));
    const graph = buildNavGraph(pillar, BOUNDS, RADIUS);
    const from = vec2(300, 400);
    const to = vec2(1200, 400);
    const plain = createPathFinder(graph).find(from, to);
    const layered = createLayeredPathFinder([graph], []).find(from, 0, to, 0);
    expect(layered?.map(({ x, y }) => vec2(x, y))).toEqual(plain);
    expect(layered?.every((waypoint) => waypoint.layer === 0)).toBe(true);
  });
});

describe("a layer's walkable areas (ADR-0051)", () => {
  const [ground, deck] = graphs();

  it("stands anywhere on the ground, and only on the areas above it", () => {
    expect(ground !== undefined && isStandable(ground, vec2(800, 100))).toBe(true);
    expect(deck !== undefined && isStandable(deck, vec2(800, 400))).toBe(true);
    expect(deck !== undefined && isStandable(deck, vec2(800, 100))).toBe(false);
  });

  it("does not stand at a deck's very edge", () => {
    expect(deck !== undefined && isStandable(deck, vec2(800, 304))).toBe(false);
  });

  it("leaves no edge inside the overlap of a deck and its ramp", () => {
    const outline = walkableOutline([DECK, WEST]);
    const crosses = outline.filter(
      ({ a, b }) =>
        (a.x === 500 && b.x === 500 && a.y !== b.y) || (a.x === 520 && b.x === 520 && a.y !== b.y),
    );
    expect(crosses).toEqual([]);
  });
});
