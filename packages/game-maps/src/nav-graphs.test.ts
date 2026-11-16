import {
  createPathFinder,
  createRng,
  distancePointToSegment,
  isStandable,
  MINIMAL_GW_INSPIRED_PVP_V1,
  pointInPolygon,
  walkCost,
  walkIsClear,
  type NavGraph,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadAllMaps, loadMap } from "./loader.js";
import { mapsIn } from "./maps-in.test-support.js";
import { mapNavGraphs, unlinkedTransitions } from "./nav-graphs.js";

const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;

describe("unlinked transitions (#3177)", () => {
  it("finds none on any map", () => {
    for (const map of loadAllMaps()) {
      expect(unlinkedTransitions(map, RADIUS), map.id).toEqual([]);
    }
  });

  it("names a ramp too narrow at its centre for a body on both layers", () => {
    const canyon = loadMap("arena-canyon");
    const [first, ...rest] = canyon.transitions;
    if (first === undefined) throw new Error("Canyon has no transitions");
    const thin = {
      ...first,
      area: { kind: "rect" as const, x: 450, y: 910, width: 80, height: 10 },
    };
    expect(unlinkedTransitions({ ...canyon, transitions: [thin, ...rest] }, RADIUS)).toEqual([
      `transitions.0: transition ${first.id} has no spot at its centre where a body fits on both layer 0 and layer 1`,
    ]);
  });
});

/**
 * `graph` with the nodes the nav graph kept before #3451 as well: all four
 * diagonals off every wall end that fit, inside a wall or not. Here only,
 * as the reference no path may beat.
 */
function everyCornerGraph(graph: NavGraph): NavGraph {
  const { walls, walkable, bounds, clearance } = graph;
  const offset = clearance + 1;
  const fits = (point: Vec2): boolean =>
    (walkable.length === 0 || walkable.some((area) => pointInPolygon(point, area))) &&
    (bounds === undefined ||
      (point.x >= clearance &&
        point.y >= clearance &&
        point.x <= bounds.width - clearance &&
        point.y <= bounds.height - clearance)) &&
    walls.every((wall) => distancePointToSegment(point, wall) >= clearance);
  const seen = new Set(graph.nodes.map(({ x, y }) => `${String(x)},${String(y)}`));
  const nodes = [...graph.nodes];
  for (const end of walls.flatMap((wall) => [wall.a, wall.b])) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const node = { x: end.x + dx * offset, y: end.y + dy * offset };
      const key = `${String(node.x)},${String(node.y)}`;
      if (!seen.has(key) && fits(node)) {
        seen.add(key);
        nodes.push(node);
      }
    }
  }
  const edges = nodes.map((node, i) =>
    nodes.flatMap((other, j) => (i !== j && walkIsClear(graph, node, other) ? [j] : [])),
  );
  const costs = nodes.map((node, i) =>
    (edges[i] ?? []).map((j) => walkCost(graph.zones, node, nodes[j] ?? node)),
  );
  return { ...graph, nodes, edges, costs };
}

function pathLength(from: Vec2, path: readonly Vec2[]): number {
  let at = from;
  let length = 0;
  for (const point of path) {
    length += Math.hypot(point.x - at.x, point.y - at.y);
    at = point;
  }
  return length;
}

describe("the nav graph's corner nodes (#3451)", () => {
  it.each(
    [...loadAllMaps(), ...mapsIn("training"), ...mapsIn("tutorial")].map(
      (map) => [map.id, map] as const,
    ),
  )(
    "%s: no path is lost, or longer by a node's offset, for the nodes it no longer keeps",
    (_, map) => {
      mapNavGraphs(map, RADIUS).forEach((graph, layer) => {
        // An end right beside a corner could bend round it on a side node
        // a few units tighter than on the outward one: never by more than
        // the offset a node stands off its corner.
        const slack = graph.clearance + 1;
        const finder = createPathFinder(graph);
        const reference = createPathFinder(everyCornerGraph(graph));
        const rng = createRng(0x3451 + layer);
        const spot = (): Vec2 => {
          for (let tries = 0; tries < 100_000; tries += 1) {
            const point = { x: rng.nextFloat() * map.width, y: rng.nextFloat() * map.height };
            if (isStandable(graph, point)) return point;
          }
          throw new Error(`${map.id} layer ${String(layer)}: nowhere to stand`);
        };
        for (let pair = 0; pair < 50; pair += 1) {
          const from = spot();
          const to = spot();
          const was = reference.find(from, to);
          const now = finder.find(from, to);
          const where = `${map.id} layer ${String(layer)} pair ${String(pair)}`;
          expect(now === undefined, where).toBe(was === undefined);
          if (was !== undefined && now !== undefined) {
            expect(pathLength(from, now), where).toBeLessThanOrEqual(pathLength(from, was) + slack);
          }
        }
      });
    },
  );
});
