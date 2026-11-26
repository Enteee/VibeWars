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
import { MAX_LIGHTS, validateMapData, type MapData } from "./schema.js";

/**
 * The tutorial canyon (#3245): one trail from the arrival pad past every
 * station site to the mist gate, shut by station 5's wall until it falls,
 * on one map (#3792). Station 13's junction splits the trail into two
 * arms round a rock island, which rejoin at `site-13r`.
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
/** The canyon map `id`. */
function canyon(id: string): MapData {
  const found = maps.find(({ map }) => map.id === id)?.map;
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

const CANYON = canyon("tutorial-canyon");

/** The paving `id` marks a site with on `of`. */
function marked(of: MapData, id: string) {
  const paving = of.paving?.find((each) => each.id === id);
  if (paving === undefined) throw new Error(`${of.id}: no site ${id}`);
  return paving;
}

/** The layer of the site `id` on `of`: the tunnel's (11) is below the ground. */
function layerOf(of: MapData, id: string): number {
  return marked(of, id).layer;
}

/** The centre of the site `id` on `of`'s box, the point canyon-map.ts gives the tutorial. */
function site(of: MapData, id: string): Vec2 {
  const corners = shapeVertices(marked(of, id).area);
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** The trail by one arm of the junction: the arrival, every site, the exit. */
function trail(arm: "site-13n" | "site-13s"): string[] {
  return [
    "arrival",
    ...[4, 5, 6, 7, 8, 9, 11, 12, 13].map((station) => `site-${String(station)}`),
    arm,
    "site-13r",
    "site-14",
    "exit",
  ];
}

/** The trail's legs, site to next site, by either arm. */
const LEGS = (["site-13n", "site-13s"] as const).flatMap((arm) => {
  const ids = trail(arm);
  return ids.slice(1).map((id, k) => [ids[k] ?? "", id] as const);
});

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
    layeredFinder(of, radius).find(
      site(of, from),
      layerOf(of, from),
      site(of, to),
      layerOf(of, to),
    ) !== undefined
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
  it("marks the arrival pad, every station's site but 10's, both arms, the rejoin and the exit", () => {
    for (const id of [...trail("site-13n"), "site-13s", "site-13b"]) {
      expect(
        CANYON.paving?.some((paving) => paving.id === id),
        id,
      ).toBe(true);
    }
    expect(CANYON.paving?.some((paving) => paving.id === "site-10")).toBe(false);
  });

  it("walks from each arrival through every site in order to the exit once the wall is down", () => {
    for (const [from, to] of LEGS) {
      expect(walks(CANYON, from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it("does not pass station 5 while its wall stands", () => {
    const shut = walled(CANYON);
    expect(walks(shut, "arrival", "site-4")).toBe(true);
    expect(walks(shut, "site-4", "site-6")).toBe(false);
    expect(walks(shut, "arrival", "exit")).toBe(false);
  });

  it("walks down from the ledge at station 9 to the trail under it", () => {
    const map = CANYON;
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
        body("foe", site(map, "exit"), layerOf(map, "exit"), 1),
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
    const map = CANYON;
    {
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
    }
  });

  it("holds at most half of MAX_LIGHTS, so zone glow and teleport lights fit (visual-style §2)", () => {
    expect(CANYON.lighting?.lights.length ?? 0).toBeLessThanOrEqual(MAX_LIGHTS / 2);
  });

  it("is at least 340 wide at every pinch, so the tutor and the player pass", () => {
    for (const [from, to] of LEGS) {
      expect(walks(CANYON, from, to, 170), `${from} → ${to}`).toBe(true);
    }
  });

  it("splits the trail at station 13 into two arms round a rock island, neither through it", () => {
    const island = CANYON.walls.find(({ kind }) => kind === "polygon");
    if (island === undefined) throw new Error("no island");
    expect(pointInShape(site(CANYON, "site-13"), island)).toBe(false);
    expect(pointInShape({ x: 5450, y: 700 }, island)).toBe(true);
    // Each arm alone, the other walled shut, still reaches the rejoin.
    for (const [arm, other] of [
      ["site-13n", "site-13s"],
      ["site-13s", "site-13n"],
    ] as const) {
      const { x, y } = site(CANYON, other);
      const shut: MapData = {
        ...CANYON,
        walls: [
          ...CANYON.walls,
          {
            kind: "rect",
            x: x - 30,
            y: y - 250,
            width: 60,
            height: 500,
            layer: CANYON.groundLayer,
          },
        ],
      };
      expect(walks(shut, "site-13", arm, 170), arm).toBe(true);
      expect(walks(shut, arm, "site-13r", 170), arm).toBe(true);
    }
  });
});
