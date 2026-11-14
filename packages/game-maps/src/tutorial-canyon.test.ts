import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  resolveLoadout,
  type Vec2,
} from "@vibewars/game-core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pointInShape, shapeVertices } from "./geometry.js";
import { layeredFinder } from "./layered-finder.test-support.js";
import { mapSimulationFields } from "./match-fields.js";
import { unlinkedTransitions } from "./nav-graphs.js";
import { validateMapData, type MapData } from "./schema.js";

/**
 * The tutorial canyon (#3245): one trail from the arrival pad past every
 * station site to the mist gate, shut by station 5's wall until it falls.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const RADIUS = RULESET.collision.playerRadius;

const root = fileURLToPath(new URL("../tutorial/", import.meta.url));
const maps = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    dir: entry.name,
    map: validateMapData(JSON.parse(readFileSync(join(root, entry.name, "map.json"), "utf8"))),
  }));
const canyon = maps.find(({ map }) => map.id === "tutorial-canyon")?.map;
if (canyon === undefined) throw new Error("no tutorial-canyon");
const map: MapData = canyon;

/** The layer of the paving `id` marks a site with: the tunnel's (11) is below the ground. */
function layerOf(id: string): number {
  const paving = map.paving?.find((each) => each.id === id);
  if (paving === undefined) throw new Error(`no site ${id}`);
  return paving.layer;
}

/** The centre of the paving `id` marks a site with. */
function site(id: string): Vec2 {
  const paving = map.paving?.find((each) => each.id === id);
  if (paving === undefined) throw new Error(`no site ${id}`);
  const corners = shapeVertices(paving.area);
  return {
    x: corners.reduce((sum, { x }) => sum + x, 0) / corners.length,
    y: corners.reduce((sum, { y }) => sum + y, 0) / corners.length,
  };
}

const TRAIL = ["arrival", ...Array.from({ length: 11 }, (_, k) => `site-${String(k + 4)}`), "exit"];

/** The trail's legs, site to next site. */
const LEGS = TRAIL.slice(1).map((id, k) => [TRAIL[k] ?? "", id] as const);

/** How far `point` is from the segment `a`–`b`. */
function toSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** The sides of a closed outline. */
function sides(corners: readonly Vec2[]): (readonly [Vec2, Vec2])[] {
  return corners.map((corner, k) => [corner, corners[(k + 1) % corners.length] ?? corner] as const);
}

/** `map` as it stands before station 5: its cracked wall is a wall. */
function walled(of: MapData): MapData {
  return { ...of, walls: [...of.walls, ...(of.breakables ?? []).map(({ wall }) => wall)] };
}

/** Whether a body of `radius` walks from site `from` to site `to` on `of`. */
function walks(of: MapData, from: string, to: string, radius = RADIUS): boolean {
  return (
    layeredFinder(of, radius).find(site(from), layerOf(from), site(to), layerOf(to)) !== undefined
  );
}

describe("every tutorial map (#3245)", () => {
  it("is named for its directory and joins every transition it has", () => {
    for (const { dir, map: each } of maps) {
      expect(each.id).toBe(dir);
      expect(unlinkedTransitions(each, RADIUS), each.id).toEqual([]);
    }
  });
});

describe("the tutorial canyon (#3245)", () => {
  it("marks the arrival pad, every station site 4 to 14 and the exit", () => {
    expect(TRAIL.map((id) => map.paving?.some((paving) => paving.id === id))).not.toContain(false);
  });

  it("walks from the arrival through every site in order to the exit once the wall is down", () => {
    for (const [from, to] of LEGS) {
      expect(walks(map, from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it("does not pass station 5 while its wall stands", () => {
    const shut = walled(map);
    expect(walks(shut, "arrival", "site-4")).toBe(true);
    expect(walks(shut, "site-4", "site-6")).toBe(false);
    expect(walks(shut, "arrival", "exit")).toBe(false);
  });

  it("walks down from the ledge at station 9 to the trail under it", () => {
    const ledge = map.decks.find(({ id }) => id === "ledge");
    if (ledge?.footprint.kind !== "rect") throw new Error("no ledge");
    const { x, y, width, height } = ledge.footprint;
    const start = { x: x + width / 2, y: y + height / 2 };
    const under = { x: x + width / 2, y: y + height / 2 + 30 };
    const route = layeredFinder(map, RADIUS).find(start, ledge.layer, under, map.groundLayer);
    expect(route).toBeDefined();

    const build = STARTER_BUILDS[0];
    if (build === undefined) throw new Error("no starter build");
    const loadout = loadoutOf(build);
    const resolved = resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
        secondaryProfession: loadout.secondaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      RULESET.combat,
    );
    const body = (id: string, at: Vec2, layer: number, team: number) => ({
      id,
      team,
      layer,
      skillBar: [],
      attributeRanks: resolved.attributeRanks,
      equipment: resolved.weaponSets[0].equipment,
      baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
      maxHealth: 1e6,
      spawn: at,
      facing: 0,
    });
    const sim = new MatchSimulation({
      seed: "tutorial-canyon:ledge",
      ruleset: RULESET,
      ...mapSimulationFields(map, map.teams),
      participants: [
        body("walker", start, ledge.layer, 0),
        body("foe", site("exit"), layerOf("exit"), 1),
      ],
    });
    sim.walkTo("walker", under, map.groundLayer);
    const DT = 1 / RULESET.tickRateHz;
    for (let t = 0; t < 10; t += DT) sim.step(DT);
    const walker = sim.get("walker");
    expect(walker?.layer).toBe(map.groundLayer);
    expect(
      Math.hypot((walker?.position.x ?? 0) - under.x, (walker?.position.y ?? 0) - under.y),
    ).toBeLessThanOrEqual(4);
  });

  it("runs its lava streams in rock, a body's radius and more from anywhere a body stands", () => {
    if (map.bounds.kind !== "outline") throw new Error("the canyon has an outline");
    const ground = { kind: "polygon" as const, points: map.bounds.outline };
    // Every floor: the ground inside the outline, and every deck on it.
    const floors = [ground, ...map.decks.map(({ footprint }) => footprint)];
    const streams = (map.paving ?? []).filter(({ look }) => look === "lava");
    expect(streams).toHaveLength(4);
    for (const stream of streams) {
      const lava = shapeVertices(stream.area);
      for (const floor of floors) {
        const edge = shapeVertices(floor);
        const near = Math.min(
          ...lava.flatMap((point) => sides(edge).map(([a, b]) => toSegment(point, a, b))),
          ...edge.flatMap((point) => sides(lava).map(([a, b]) => toSegment(point, a, b))),
        );
        expect(near, stream.id).toBeGreaterThanOrEqual(RADIUS);
        expect(
          lava.some((point) => pointInShape(point, floor)),
          stream.id,
        ).toBe(false);
        expect(
          edge.some((point) => pointInShape(point, stream.area)),
          stream.id,
        ).toBe(false);
      }
    }
  });

  it("is at least 340 wide at every pinch, so the tutor and the player pass", () => {
    for (const [from, to] of LEGS) {
      expect(walks(map, from, to, 170), `${from} → ${to}`).toBe(true);
    }
  });
});
