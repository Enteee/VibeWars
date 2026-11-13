import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  type Vec2,
} from "@vibewars/game-core";
import type { MapData } from "@vibewars/game-maps/schema";
import { mapSimulationFields } from "@vibewars/game-maps/match-fields";
import { describe, expect, it, vi } from "vitest";

import type { ArenaSnapshot, MapStructure, RenderableWall } from "./arena-snapshot.js";
import { standingDraw, type Occluder } from "./layer-surfaces.js";
import { recordingGraphics, type RecordingGraphics } from "./recording-graphics.js";
import { characterBand, renderOrder, type RenderItem } from "./render-order.js";
import { coversOutline, hiddenSpots, type GateBody, type PaintedFill } from "./visibility-gate.js";

// Phaser probes for a browser when it loads: the scene needs a base class,
// and the triangulation its shapes are filled by.
vi.mock("phaser", async () => {
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const require = createRequire(import.meta.url);
  // Phaser's own earcut, which its package does not export by name.
  const Earcut = require(
    path.join(path.dirname(require.resolve("phaser/package.json")), "src/geom/polygon/Earcut.js"),
  ) as (points: readonly number[]) => number[];
  class Vector2 {
    public x: number;
    public y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  }
  return { default: { Scene: Object, Geom: { Polygon: { Earcut } }, Math: { Vector2 } } };
});

const { ArenaScene } = await import("./arena-scene.js");
const { gateWalls, toRenderableWall } = await import("../match-view.js");
const { ARENA_MAPS, breakableDescriptors, gateDescriptor, mapStructure, wallDescriptor } =
  await import("../net/maps.js");
const { TRAINING_MAPS } = await import("../training/maps.js");

/** The grid the sweep stands a body on, in world units (#3251). */
const STEP = 8;
const RADIUS = RULESET.collision.playerRadius;

/**
 * Maps whose geometry hides a body, each until its issue is fixed. A
 * listed map that no longer hides one fails as a stale entry, so this
 * only shrinks.
 */
const KNOWN_HIDDEN: readonly { readonly mapId: string; readonly issue: number }[] = [];

/** The scene's private parts the gate drives and reads. */
interface GatedScene {
  snapshot: ArenaSnapshot;
  arena: { width: number; height: number };
  mapGraphics: RecordingGraphics | undefined;
  floorGraphics: RecordingGraphics | undefined;
  add: unknown;
  textures: unknown;
  occluders: readonly Occluder[];
  structureAt(item: RenderItem): RecordingGraphics;
  drawMap(): void;
  drawPaving(): void;
}

/** `map` drawn by the scene's own map drawing: every fill it painted, and its occluders. */
function paint(
  map: MapData,
  structure: MapStructure,
  walls: readonly RenderableWall[],
): { fills: PaintedFill[]; occluders: readonly Occluder[] } {
  const scene = new ArenaScene() as unknown as GatedScene;
  const made: RecordingGraphics[] = [];
  const graphics = (): RecordingGraphics => {
    const g = recordingGraphics();
    made.push(g);
    return g;
  };
  scene.add = new Proxy(
    { graphics },
    { get: (_object, key) => (key === "graphics" ? graphics : () => recordingGraphics()) },
  );
  // The land outside a map's outline is a texture, under the floor: none is made.
  scene.textures = { exists: () => true };
  // Roads are a canvas texture on their layer's ground, not a Graphics fill: not recorded.
  scene.drawPaving = () => undefined;
  scene.arena = { width: map.width, height: map.height };
  scene.snapshot = { ...scene.snapshot, walls, structure, breakables: [], lifts: [] };
  scene.floorGraphics = graphics().setDepth(renderOrder({ kind: "floor" }));
  scene.mapGraphics = graphics().setDepth(renderOrder({ kind: "terrain" }));
  const structureAt = scene.structureAt.bind(scene);
  scene.structureAt = (item) => {
    const g = structureAt(item);
    g.what = JSON.stringify(item);
    return g;
  };
  scene.drawMap();
  return {
    fills: made.flatMap((g) =>
      g.fills.map(({ polygon }) => ({ polygon, depth: g.depth, what: g.what || "map" })),
    ),
    occluders: scene.occluders,
  };
}

/** Every point a body may stand on `map`, per layer, on the grid, where it draws. */
function standingBodies(map: MapData, structure: MapStructure): GateBody[] {
  const sim = new MatchSimulation({
    seed: "visibility-gate",
    ruleset: RULESET,
    teamCount: map.teams,
    ...mapSimulationFields(map, map.teams),
    participants: [],
  });
  const bodies: GateBody[] = [];
  for (let layer = 0; layer < sim.layerCount; layer += 1) {
    for (let y = STEP / 2; y < map.height; y += STEP) {
      for (let x = STEP / 2; x < map.width; x += STEP) {
        const point: Vec2 = { x, y };
        if (!sim.standable(point, layer)) {
          continue;
        }
        // On a map of one layer a body draws where it stands, as `liftActors` has it.
        const drawn =
          structure.layerCount === 1
            ? { lift: 0, layer }
            : standingDraw(structure, [], point, layer, RADIUS);
        bodies.push({
          stands: { x, y, layer },
          x,
          y: y - drawn.lift,
          r: RADIUS,
          layer: drawn.layer,
          depth: renderOrder({
            kind: "character",
            band: characterBand(drawn.layer, structure.layerCount),
            part: "body",
          }),
        });
      }
    }
  }
  return bodies;
}

/** A deck of layer 1 over 100..200 × 100..200, as painted and as it hides, on a map whose ground is 0. */
const DECK_OUTLINE: readonly Vec2[] = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 },
];
const DECK_FILL: PaintedFill = {
  polygon: DECK_OUTLINE,
  depth: renderOrder({ kind: "deck", deckLayer: 1 }),
  what: "deck 1",
};
const DECK_OCCLUDER: Occluder = {
  outline: DECK_OUTLINE,
  left: 100,
  top: 100,
  right: 200,
  bottom: 200,
  lowLift: 0,
  highLift: 0,
  hidesThrough: 0,
  exempt: null,
};

/** A body standing at (150, 150) on `layer` of a two-layer map. */
function bodyOn(layer: number): GateBody {
  return {
    stands: { x: 150, y: 150, layer },
    x: 150,
    y: 150,
    r: RADIUS,
    layer,
    depth: renderOrder({ kind: "character", band: characterBand(layer, 2), part: "body" }),
  };
}

describe("hiddenSpots (#3251)", () => {
  it("finds no body under a deck that is an occluder: its outline shows", () => {
    expect(
      hiddenSpots({ fills: [DECK_FILL], occluders: [DECK_OCCLUDER], bodies: [bodyOn(0)] }),
    ).toEqual([]);
  });

  it("finds the body under a deck painted with no occluder, and names the deck", () => {
    const spots = hiddenSpots({ fills: [DECK_FILL], occluders: [], bodies: [bodyOn(0)] });
    expect(spots.map(({ fill, uncovered }) => [fill.what, uncovered.length])).toEqual([
      ["deck 1", 48],
    ]);
  });

  it("finds a body under a fill painted over the hidden outline itself", () => {
    const over = { ...DECK_FILL, depth: renderOrder({ kind: "hidden-outline" }), what: "over" };
    expect(coversOutline(over)).toBe(true);
    expect(coversOutline(DECK_FILL)).toBe(false);
    const spots = hiddenSpots({ fills: [over], occluders: [DECK_OCCLUDER], bodies: [bodyOn(0)] });
    expect(spots.map(({ fill }) => fill.what)).toEqual(["over"]);
  });

  it("finds no body on the deck's own layer: it draws over the deck", () => {
    expect(hiddenSpots({ fills: [DECK_FILL], occluders: [], bodies: [bodyOn(1)] })).toEqual([]);
  });
});

describe("recordingGraphics (#3251)", () => {
  it("takes a call it does not know as a chaining no-op", () => {
    const g = recordingGraphics();
    const lineStyle: unknown = Reflect.get(g, "lineStyle");
    expect(typeof lineStyle === "function" && lineStyle(2, 0xffffff, 1)).toBe(g);
  });

  it("throws on a fill it does not record, so the gate never passes blind", () => {
    const g = recordingGraphics();
    for (const fill of ["fill", "fillGradientStyle", "fillSomethingNew"]) {
      expect(() => Reflect.get(g, fill), fill).toThrow(fill);
    }
  });

  it("records every fill it does know", () => {
    const g = recordingGraphics();
    g.fillStyle(0xffffff, 0.5).fillRect(0, 0, 10, 10).fillCircle(0, 0, 5);
    expect(g.fills.map(({ alpha }) => alpha)).toEqual([0.5, 0.5]);
  });
});

describe("the visibility gate's sweep (#3251)", () => {
  const maps = [...ARENA_MAPS, ...TRAINING_MAPS.values()];
  it.each(maps.map((map) => [map.id, map] as const))(
    "%s hides no body",
    { timeout: 60_000 },
    (_id, map) => {
      const { structure, wallLayers, gateLayers, gateLooks } = mapStructure(map.id);
      const walls = gateWalls(
        map.gates.map(gateDescriptor),
        gateLayers,
        gateLooks,
        map.walls.map((wall, at) => toRenderableWall(wallDescriptor(wall), wallLayers[at] ?? 0)),
        [],
        breakableDescriptors(map),
      )([], []).walls;
      const { fills, occluders } = paint(map, structure, walls);
      const overOutline = fills
        .filter(coversOutline)
        .map(({ what, depth }) => `${what} at ${String(depth)}`);
      const bodies = standingBodies(map, structure);
      const spots = hiddenSpots({ fills, occluders, bodies });
      const report = spots
        .slice(0, 20)
        .map(
          ({ body, fill, uncovered }) =>
            `layer ${String(body.stands.layer)} (${String(body.stands.x)}, ${String(body.stands.y)}) under ${fill.what} at ${String(fill.depth)}: ${uncovered.map((p) => `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`).join(" ")}`,
        );
      const known = KNOWN_HIDDEN.find((entry) => entry.mapId === map.id);
      if (known === undefined) {
        expect({ overOutline, spots: spots.length, report }).toEqual({
          overOutline: [],
          spots: 0,
          report: [],
        });
      } else {
        expect(
          spots.length,
          `${map.id} hides no body now: drop its KNOWN_HIDDEN entry (#${String(known.issue)})`,
        ).toBeGreaterThan(0);
      }
    },
  );
});
