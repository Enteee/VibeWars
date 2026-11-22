import { describe, expect, it, vi } from "vitest";

import { pointInPolygon, type Uphill, type Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import { arenaPalette } from "./arena-palette.js";
import type { MapStructure } from "./arena-snapshot.js";
import type Phaser from "phaser";

import {
  FLICKER_INTERVAL_MS,
  LIGHTING_BUDGET_MS,
  LightingBudget,
  LightingPass,
  OVER_BUDGET_LIMIT,
  baseTint,
  flickerRegions,
  flickerRedrawDue,
  groundHoles,
  layerSurfaces,
  lightMapCells,
  lightMapCover,
  lightMapExtent,
  lightsByStability,
  litStructurePalette,
  regionsInView,
  boxInView,
  roofedOver,
  shownStage,
  stageShadows,
  sunShadowTint,
  TUNNEL_GLOW_CAP,
  tunnelGlow,
  tunnelLightCover,
  type LightMapBox,
} from "./lighting-pass.js";
import { shapeOutline } from "./layer-surfaces.js";
import { ELEVATION_STEP } from "./render-order.js";

// Phaser probes for a browser when it loads: only its constants are read here.
vi.mock("phaser", () => ({
  default: {
    Renderer: { Events: { RESTORE_WEBGL: "restorewebgl" } },
    BlendModes: { ADD: 1, MULTIPLY: 2 },
    Math: { Vector2: Object },
  },
}));

/** The blend modes as the mock gives them. */
const ADD = 1;
const MULTIPLY = 2;
const DARK = { colour: 0xffffff, intensity: 0 };
const light = (id: string, layer: number, flicker: number) => ({
  id,
  position: { x: 100, y: 100 },
  layer,
  radius: 50,
  colour: 0xffffff,
  intensity: 1,
  flicker,
});
const BASE: MapLighting = { ambient: DARK, indoorAmbient: DARK, indoor: [], lights: [] };
const WALL = { kind: "rect", x: 90, y: 90, width: 20, height: 20 } as const;

describe("the lighting budget (ADR-0052)", () => {
  it("gives up flicker, then shadows, then the light maps, after runs of slow rebuilds (#2988)", () => {
    const budget = new LightingBudget();
    for (let i = 0; i < OVER_BUDGET_LIMIT - 1; i++) {
      budget.record(LIGHTING_BUDGET_MS + 1);
    }
    expect(budget.stage).toBe("full");
    budget.record(LIGHTING_BUDGET_MS + 1);
    expect(budget.stage).toBe("no-flicker");
    for (let i = 0; i < OVER_BUDGET_LIMIT; i++) {
      budget.record(LIGHTING_BUDGET_MS + 1);
    }
    expect(budget.stage).toBe("no-shadows");
    for (let i = 0; i < OVER_BUDGET_LIMIT; i++) {
      budget.record(LIGHTING_BUDGET_MS + 1);
    }
    expect(budget.stage).toBe("flat");
  });

  it("draws shadows until they are given up (#2988)", () => {
    expect(stageShadows("full")).toBe(true);
    expect(stageShadows("no-flicker")).toBe(true);
    expect(stageShadows("no-shadows")).toBe(false);
    expect(stageShadows("flat")).toBe(false);
  });

  it("forgives a slow frame that a fast one follows", () => {
    const budget = new LightingBudget();
    for (let i = 0; i < OVER_BUDGET_LIMIT * 2; i++) {
      budget.record(i % 2 === 0 ? LIGHTING_BUDGET_MS + 1 : LIGHTING_BUDGET_MS);
    }
    expect(budget.stage).toBe("full");
  });
});

describe("shownStage", () => {
  it("holds the lights steady under reduced motion, as no-flicker does", () => {
    expect(shownStage("full", true)).toBe("no-flicker");
    expect(shownStage("full", false)).toBe("full");
    expect(shownStage("flat", true)).toBe("flat");
  });
});

describe("lightsByStability", () => {
  const lit = {
    ...BASE,
    lights: [light("lamp", 0, 0), light("torch", 0, 0.4), light("deck", 1, 0.4)],
  };

  it("splits a layer's own lights into steady and flickering", () => {
    const { steady, flickering } = lightsByStability(lit, 0, "full");
    expect(steady.map((l) => l.id)).toEqual(["lamp"]);
    expect(flickering.map((l) => l.id)).toEqual(["torch"]);
  });

  it("holds every light steady once flicker is given up", () => {
    const { steady, flickering } = lightsByStability(lit, 0, "no-flicker");
    expect(steady.map((l) => l.id)).toEqual(["lamp", "torch"]);
    expect(flickering).toEqual([]);
  });
});

describe("flickerRedrawDue", () => {
  const flickering = [light("torch", 0, 0.4)];

  it("redraws a flickering layer about 15 times a second", () => {
    expect(flickerRedrawDue(flickering, 1000, 1000 + FLICKER_INTERVAL_MS - 1)).toBe(false);
    expect(flickerRedrawDue(flickering, 1000, 1000 + FLICKER_INTERVAL_MS)).toBe(true);
  });

  it("never redraws a layer whose lights are all steady", () => {
    expect(flickerRedrawDue([], 0, 10_000)).toBe(false);
  });
});

describe("baseTint", () => {
  const lit: MapLighting = {
    ...BASE,
    ambient: { colour: 0xffffff, intensity: 0.6 },
    sun: { directionDeg: 0, elevationDeg: 90, colour: 0xff0000, intensity: 0.2 },
    lights: [{ ...light("torch", 0, 0), position: { x: 0, y: 0 } }],
  };

  it("is the ambient and the sun outdoors, without the point lights", () => {
    expect(baseTint(lit, false)).toBe(0xcc9999);
  });

  it("is the indoor ambient indoors, held to the surface floor", () => {
    expect(baseTint(lit, true)).toBe(0x737373);
  });

  it("is the ambient alone in the sun's shadow (#2988)", () => {
    expect(sunShadowTint(lit)).toBe(0x999999);
  });
});

describe("litStructurePalette", () => {
  const palette = arenaPalette({ layerCount: 2, biome: "hall", ascentAct: null });

  it("leaves an unlit map's colours alone", () => {
    expect(litStructurePalette(palette, undefined, WALL, 0)).toBe(palette);
  });

  it("darkens a wall in the dark and leaves one under a light of its layer bright", () => {
    const lit = { ...BASE, lights: [light("deck", 1, 0)] };
    const dark = litStructurePalette(palette, lit, WALL, 0);
    const bright = litStructurePalette(palette, lit, WALL, 1);
    expect(dark.wallTop).not.toBe(palette.wallTop);
    expect(bright.wallTop).toBe(palette.wallTop);
    expect(bright.slab).toBe(palette.slab);
  });
});

describe("layerSurfaces", () => {
  const deck = (layer: number, x: number, y: number, width: number, height: number) => ({
    layer,
    footprint: { kind: "rect" as const, x, y, width, height },
    look: "platform" as const,
    switched: null,
  });
  const ramp = (
    from: number,
    to: number,
    [x, y, width, height]: readonly [number, number, number, number],
    uphill: Uphill,
  ) => ({
    from,
    to,
    area: { kind: "rect" as const, x, y, width, height },
    uphill,
    look: "ramp" as const,
    lift: null,
  });
  const HEIGHTS: MapStructure = {
    layerCount: 3,
    biome: "hall",
    ascentAct: null,
    bounds: { kind: "rect" },
    ground: 0,
    decks: [deck(1, 420, 250, 360, 200), deck(2, 520, 60, 160, 110)],
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    overhangs: [],
    transitions: [ramp(0, 1, [300, 250, 140, 200], "e"), ramp(1, 2, [540, 150, 120, 120], "n")],
    water: [],
    zones: [],
  };

  it("is a layer's decks and the ramps up to it", () => {
    expect(layerSurfaces(HEIGHTS, 0)).toEqual([]);
    expect(layerSurfaces(HEIGHTS, 1)).toHaveLength(2);
    expect(layerSurfaces(HEIGHTS, 2)).toHaveLength(2);
  });

  it("is a pit's floor on the layer under the ground (#2973)", () => {
    const pit = { kind: "rect" as const, x: 500, y: 520, width: 200, height: 130 };
    const sunk: MapStructure = {
      ...HEIGHTS,
      ground: 1,
      decks: [],
      pits: [{ footprint: pit }],
      transitions: [],
    };
    expect(layerSurfaces(sunk, 0)).toEqual([
      [
        { x: 500, y: 520 },
        { x: 700, y: 520 },
        { x: 700, y: 650 },
        { x: 500, y: 650 },
      ],
    ]);
  });

  it("leaves each pit's hole out of the ground's light, which lights it once from below (#2973)", () => {
    const pit = { kind: "rect" as const, x: 500, y: 520, width: 200, height: 130 };
    expect(groundHoles(HEIGHTS)).toEqual([]);
    expect(groundHoles({ ...HEIGHTS, ground: 1, pits: [{ footprint: pit }] })).toEqual(
      layerSurfaces(
        { ...HEIGHTS, ground: 1, decks: [], pits: [{ footprint: pit }], transitions: [] },
        0,
      ),
    );
  });

  it("outlines a deck by its footprint", () => {
    expect(layerSurfaces(HEIGHTS, 1)[0]).toEqual([
      { x: 420, y: 250 },
      { x: 780, y: 250 },
      { x: 780, y: 450 },
      { x: 420, y: 450 },
    ]);
  });

  it("meets the deck at a ramp's top and falls a step to its foot", () => {
    const slope = layerSurfaces(HEIGHTS, 1)[1] ?? [];
    const top = slope.filter((p) => p.x === 440).map((p) => p.y);
    const foot = slope.filter((p) => p.x === 300).map((p) => p.y);
    expect(top.sort()).toEqual([250, 450]);
    expect(foot.sort()).toEqual([250 + ELEVATION_STEP, 450 + ELEVATION_STEP]);
  });

  it("lights all of the ground and only the box round a raised layer's surfaces (#3157)", () => {
    expect(lightMapExtent(HEIGHTS, 0, 1200, 800)).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    const raised = lightMapExtent(HEIGHTS, 1, 1200, 800);
    expect(raised.x).toBe(150);
    expect(raised.width).toBe(240);
    expect(raised.y).toBeLessThanOrEqual(125);
    expect(raised.y + raised.height).toBeGreaterThanOrEqual(225);
    expect(raised.y + raised.height).toBeLessThanOrEqual(400);
  });

  it("keeps a layer with no surfaces a light map of one pixel", () => {
    expect(lightMapExtent({ ...HEIGHTS, decks: [], transitions: [] }, 1, 1200, 800)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  const holds = (
    box: { x: number; y: number; width: number; height: number },
    x: number,
    y: number,
  ) => box.x <= x && x < box.x + box.width && box.y <= y && y < box.y + box.height;

  it("lights none of the ground a raised deck covers (#3162)", () => {
    const extent = lightMapExtent(HEIGHTS, 0, 1200, 800);
    const cover = lightMapCover(HEIGHTS, [], 0, extent);
    const area = cover.reduce((sum, { width, height }) => sum + width * height, 0);
    expect(area).toBeLessThan(extent.width * extent.height);
    // The lower deck's middle, lifted onto the screen, in light map pixels.
    expect(cover.some((box) => holds(box, 300, (350 - ELEVATION_STEP) / 2))).toBe(false);
    expect(cover.some((box) => holds(box, 10, 10))).toBe(true);
  });

  it("lights a tunnel's floor under the ground, and none of that layer elsewhere (#3329)", () => {
    const tunnel = { kind: "rect" as const, x: 200, y: 600, width: 400, height: 80 };
    const stair = ramp(0, 1, [300, 560, 60, 100], "n");
    const tunnelled: MapStructure = {
      ...HEIGHTS,
      ground: 1,
      decks: [],
      tunnels: [{ footprint: tunnel }],
      transitions: [stair],
    };
    expect(layerSurfaces(tunnelled, 0)).toContainEqual(shapeOutline(tunnel));
    const extent = lightMapExtent(tunnelled, 0, 1200, 800);
    const cover = lightMapCover(tunnelled, [], 0, extent);
    // In light map pixels (half a world unit), against the extent's corner.
    const lit = (x: number, y: number): boolean =>
      cover.some((box) => holds(box, x * 0.5 - extent.x, y * 0.5 - extent.y));
    // A torch in the gallery's middle lights its cell; the bed far off is not this layer's.
    expect(lit(450, 640)).toBe(true);
    expect(lit(450, 300)).toBe(false);
    // The ground over the stair is a hole: its light comes from the tunnel.
    expect(groundHoles(tunnelled)).toContainEqual(
      shapeOutline({ kind: "rect", x: 300, y: 600, width: 60, height: 60 }),
    );
  });

  describe("a tunnel's light, seen through its cut-away roof (#3329)", () => {
    const tunnel = { kind: "rect" as const, x: 200, y: 600, width: 400, height: 80 };
    const tunnelled: MapStructure = {
      ...HEIGHTS,
      ground: 1,
      decks: [],
      tunnels: [{ footprint: tunnel }],
      transitions: [ramp(0, 1, [300, 560, 60, 100], "n")],
    };
    const extent = lightMapExtent(tunnelled, 1, 1200, 800);
    const [own] = tunnelLightCover(tunnelled, extent);
    const meets = (a: LightMapBox, b: LightMapBox): boolean =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const area = (boxes: readonly LightMapBox[]): number =>
      boxes.reduce((sum, { width, height }) => sum + width * height, 0);

    it("gives the ground's light over a tunnel's cover an image of its own, to fade with it", () => {
      // The footprint and the step south of it, in light map pixels.
      expect(own).toEqual({
        tunnel: 0,
        boxes: [{ x: 100, y: 300, width: 200, height: (80 + ELEVATION_STEP) / 2 }],
      });
      // The rest of the ground's map never lies over it, so the tunnel's
      // floor is not dimmed by the ground's light once the cover is cut away.
      const cover = lightMapCover(tunnelled, [], 1, extent);
      const owned = own?.boxes ?? [];
      expect(cover.some((box) => owned.some((other) => meets(box, other)))).toBe(false);
      // Together they still cover the whole ground.
      expect(area([...cover, ...owned])).toBe(extent.width * extent.height);
    });

    it("lights the corner where two tunnels' covers cross once, with the earlier tunnel's", () => {
      const crossed: MapStructure = {
        ...tunnelled,
        tunnels: [
          { footprint: tunnel },
          { footprint: { ...tunnel, x: 500, y: 400, width: 80, height: 400 } },
        ],
      };
      const crossing = lightMapExtent(crossed, 1, 1200, 800);
      const covers = tunnelLightCover(crossed, crossing);
      expect(covers.map(({ tunnel: at }) => at)).toEqual([0, 1]);
      const shown = [
        ...lightMapCover(crossed, [], 1, crossing),
        ...covers.flatMap(({ boxes }) => boxes),
      ];
      // No pixel is multiplied in twice, and none is left out.
      expect(shown.some((box, at) => shown.slice(at + 1).some((other) => meets(box, other)))).toBe(
        false,
      );
      expect(area(shown)).toBe(crossing.width * crossing.height);
      // The earlier tunnel owns the corner they share.
      expect(covers[0]?.boxes).toEqual(tunnelLightCover(tunnelled, crossing)[0]?.boxes);
    });

    it("roofs the tunnel's floor, but for its shaft, so a torch there shows its pool", () => {
      const roofed = roofedOver(tunnelled, 0);
      const under = (x: number, y: number): boolean =>
        roofed.some((outline) => pointInPolygon({ x, y }, outline));
      expect(under(450, 640)).toBe(true);
      expect(under(330, 630)).toBe(false);
      expect(roofedOver(tunnelled, 1)).toEqual([]);
      expect(roofedOver(HEIGHTS, 0)).toEqual([]);
    });

    it("lights all a cut-away cover shows with the tunnel's layer, its far wall too", () => {
      // The cover's top step is the far wall: drawn a step down, so a step
      // north on the tunnel's own map. Unlit, it read as a bright band over
      // a floor its torch could only dim.
      const own = (outlines: readonly (readonly Vec2[])[], x: number, drawnY: number): boolean =>
        outlines.some((outline) => pointInPolygon({ x, y: drawnY - ELEVATION_STEP }, outline));
      const surfaces = layerSurfaces(tunnelled, 0);
      const roofed = roofedOver(tunnelled, 0);
      for (const drawnY of [605, 640, 700, 730]) {
        expect(own(surfaces, 450, drawnY)).toBe(true);
        expect(own(roofed, 450, drawnY)).toBe(true);
      }
      // Over the shaft the wall is open, lit as the stair is, not roofed.
      expect(own(roofed, 330, 620)).toBe(false);
      expect(own(surfaces, 450, 595)).toBe(false);
    });

    it("lights the stair down the shaft with the tunnel's layer, where the ground's is cut", () => {
      const [, slope] = layerSurfaces(tunnelled, 0);
      // Its top, at the ground's height, is on the tunnel layer's map a step down.
      expect(slope?.map(({ y }) => y)).toContain(560 - ELEVATION_STEP);
    });
  });

  it("lights only the cells a raised layer's surfaces are in (#3162)", () => {
    const extent = lightMapExtent(HEIGHTS, 1, 1200, 800);
    const cover = lightMapCover(HEIGHTS, [], 1, extent);
    const area = cover.reduce((sum, { width, height }) => sum + width * height, 0);
    expect(area).toBeGreaterThan(0);
    for (const box of cover) {
      expect(box.x + box.width).toBeLessThanOrEqual(extent.width);
      expect(box.y + box.height).toBeLessThanOrEqual(extent.height);
    }
  });

  it("lights none of a raised layer a deck above it covers (#3671)", () => {
    const stacked: MapStructure = {
      ...HEIGHTS,
      decks: [deck(1, 420, 250, 360, 200), deck(2, 500, 300, 160, 100)],
      transitions: [ramp(0, 1, [300, 250, 140, 200], "e")],
    };
    const extent = lightMapExtent(stacked, 1, 1200, 800);
    // A point of the layer's map, unlifted, at the half scale it is drawn at.
    const at = (x: number, y: number) => ({ x: x / 2 - extent.x, y: y / 2 - extent.y });
    const lit = (cover: readonly LightMapBox[], x: number, y: number) => {
      const p = at(x, y);
      return cover.some((box) => holds(box, p.x, p.y));
    };
    const under = lightMapCover(stacked, [], 1, extent);
    const open = lightMapCover({ ...stacked, decks: [deck(1, 420, 250, 360, 200)] }, [], 1, extent);
    // The upper deck's middle, drawn a step above the layer's map.
    expect(lit(open, 580, 350 - ELEVATION_STEP)).toBe(true);
    expect(lit(under, 580, 350 - ELEVATION_STEP)).toBe(false);
    expect(lit(under, 440, 430)).toBe(true);
    // An arch fades over whoever walks under it, so what it stands over stays lit.
    const arch = { ...deck(2, 500, 300, 160, 100), look: "arch" as const };
    const arched = lightMapCover(
      { ...stacked, decks: [deck(1, 420, 250, 360, 200), arch] },
      [],
      1,
      extent,
    );
    expect(lit(arched, 580, 350 - ELEVATION_STEP)).toBe(true);
  });

  it("lights a tunnel's floor under a deck over it, seen once it is cut away (#3671)", () => {
    const tunnel = { kind: "rect" as const, x: 200, y: 600, width: 400, height: 80 };
    const walled: MapStructure = {
      ...HEIGHTS,
      ground: 1,
      decks: [deck(2, 180, 560, 440, 160)],
      tunnels: [{ footprint: tunnel }],
      transitions: [ramp(0, 1, [300, 560, 60, 100], "n")],
    };
    const extent = lightMapExtent(walled, 0, 1200, 800);
    const cover = lightMapCover(walled, [], 0, extent);
    const lit = (x: number, y: number): boolean =>
      cover.some((box) => holds(box, x * 0.5 - extent.x, y * 0.5 - extent.y));
    expect(lit(450, 640)).toBe(true);
    expect(lit(250, 620)).toBe(true);
  });
});

describe("flickerRegions (#3157, #3254)", () => {
  const extent = { x: 100, y: 50, width: 200, height: 100 };
  const at = (id: string, x: number, y: number) => ({ ...light(id, 1, 1), position: { x, y } });

  it("is nothing to redraw when no light flickers", () => {
    expect(flickerRegions([], extent)).toEqual([]);
  });

  it("is the reach of each flickering light, in the light map's own pixels", () => {
    // Reach 300..400 by 150..250 in the arena: 150..200 by 75..125 at half scale.
    const a = at("a", 350, 200);
    expect(flickerRegions([a], extent)).toEqual([
      { box: { x: 50, y: 25, width: 50, height: 50 }, lights: [a] },
    ]);
  });

  it("is held within the light map", () => {
    expect(flickerRegions([at("a", 190, 90)], extent).map(({ box }) => box)).toEqual([
      { x: 0, y: 0, width: 20, height: 20 },
    ]);
  });

  it("boxes lights far apart one by one, not the dark between them", () => {
    const regions = flickerRegions([at("a", 250, 150), at("b", 450, 150)], extent);
    expect(regions.map(({ box, lights }) => [box, lights.map(({ id }) => id)])).toEqual([
      [{ x: 0, y: 0, width: 50, height: 50 }, ["a"]],
      [{ x: 100, y: 0, width: 50, height: 50 }, ["b"]],
    ]);
  });

  it("boxes lights whose reach overlaps together", () => {
    const regions = flickerRegions([at("a", 250, 150), at("b", 300, 150)], extent);
    expect(regions.map(({ box, lights }) => [box, lights.map(({ id }) => id)])).toEqual([
      [{ x: 0, y: 0, width: 75, height: 50 }, ["a", "b"]],
    ]);
  });

  it("merges until no two boxes overlap, as a merged box can reach a third", () => {
    // a and c are apart; b, last, overlaps both, so all three are one box.
    const lights = [at("a", 250, 150), at("c", 400, 150), at("b", 325, 150)];
    const regions = flickerRegions(lights, extent);
    expect(regions.map(({ lights: own }) => own.map(({ id }) => id).sort())).toEqual([
      ["a", "b", "c"],
    ]);
  });

  it("never gives two boxes that overlap, and gives every light once", () => {
    const lights = Array.from({ length: 12 }, (_, k) =>
      at(`l${String(k)}`, 120 + ((k * 137) % 400), 60 + ((k * 71) % 180)),
    );
    const regions = flickerRegions(lights, extent);
    expect(regions.flatMap(({ lights: own }) => own.map(({ id }) => id)).sort()).toEqual(
      lights.map(({ id }) => id).sort(),
    );
    for (const [i, a] of regions.entries()) {
      for (const b of regions.slice(i + 1)) {
        const apart =
          a.box.x + a.box.width <= b.box.x ||
          b.box.x + b.box.width <= a.box.x ||
          a.box.y + a.box.height <= b.box.y ||
          b.box.y + b.box.height <= a.box.y;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("regionsInView (#3499)", () => {
  const extent = { x: 100, y: 50, width: 200, height: 100 };
  const at = (id: string, x: number, y: number) => ({ ...light(id, 1, 1), position: { x, y } });
  // a's reach is 200..300 by 100..200 in the arena, b's 400..500 by 100..200.
  const regions = flickerRegions([at("a", 250, 150), at("b", 450, 150)], extent);
  const ids = (shown: ReturnType<typeof regionsInView>) =>
    shown.flatMap(({ lights }) => lights.map(({ id }) => id));

  it("redraws only the regions the camera sees", () => {
    expect(
      ids(regionsInView(regions, extent, 0, { left: 150, top: 80, right: 320, bottom: 220 })),
    ).toEqual(["a"]);
    expect(
      ids(regionsInView(regions, extent, 0, { left: 0, top: 0, right: 1000, bottom: 1000 })),
    ).toEqual(["a", "b"]);
    expect(
      ids(regionsInView(regions, extent, 0, { left: 320, top: 80, right: 380, bottom: 220 })),
    ).toEqual([]);
  });

  it("finds a raised map's regions where its images are drawn, lifted", () => {
    const view = { left: 150, top: -200, right: 320, bottom: -120 };
    expect(ids(regionsInView(regions, extent, 300, view))).toEqual(["a"]);
    expect(ids(regionsInView(regions, extent, 0, view))).toEqual([]);
  });
});

describe("boxInView (#3660)", () => {
  const extent = { x: 100, y: 50, width: 200, height: 100 };
  // In the arena, 200..300 by 100..200.
  const box = { x: 0, y: 0, width: 50, height: 50 };

  it("meets a view over the box and misses one beside it", () => {
    expect(boxInView(box, extent, 0, { left: 250, top: 150, right: 400, bottom: 400 })).toBe(true);
    expect(boxInView(box, extent, 0, { left: 300, top: 100, right: 400, bottom: 200 })).toBe(false);
    expect(boxInView(box, extent, 0, { left: 0, top: 0, right: 200, bottom: 1000 })).toBe(false);
  });

  it("finds a raised map's box where it is drawn, lifted", () => {
    const view = { left: 200, top: -200, right: 300, bottom: -120 };
    expect(boxInView(box, extent, 300, view)).toBe(true);
    expect(boxInView(box, extent, 0, view)).toBe(false);
  });
});

describe("LightingPass", () => {
  /**
   * A scene whose light maps, as Phaser 4's DynamicTexture does, queue a
   * draw and run it only at `render()`: what each painted then, and
   * whether its painter was still alive to paint it.
   */
  function fakeScene() {
    const destroyed = new Set<object>();
    const drawn: { colour: number; alive: boolean }[] = [];
    const images: { key: string; alpha: number; blendMode: number; visible: boolean }[] = [];
    const flats: { colour: number; blendMode: number; rects: number }[] = [];
    const graphics = () => {
      const painter = {
        colour: -1,
        blendMode: -1,
        rects: 0,
        fillStyle(colour: number) {
          painter.colour = colour;
          return painter;
        },
        fillPoints: () => painter,
        fillRect() {
          painter.rects += 1;
          return painter;
        },
        setScale: () => painter,
        setDepth: () => painter,
        setBlendMode(mode: number) {
          painter.blendMode = mode;
          return painter;
        },
        destroy: () => destroyed.add(painter),
      };
      return painter;
    };
    const texture = (width: number, height: number) => {
      const queued: ReturnType<typeof graphics>[] = [];
      const self = {
        width,
        height,
        fill: () => self,
        stamp: () => self,
        erase: () => self,
        clear: () => self,
        draw(source: unknown) {
          if (typeof source === "object" && source !== null && "colour" in source) {
            queued.push(source as ReturnType<typeof graphics>);
          }
          return self;
        },
        render() {
          for (const painter of queued.splice(0)) {
            drawn.push({ colour: painter.colour, alive: !destroyed.has(painter) });
          }
          return self;
        },
      };
      return self;
    };
    const scene = {
      game: { renderer: { on: () => undefined, off: () => undefined } },
      textures: {
        exists: () => true,
        remove: () => undefined,
        addDynamicTexture: (_key: string, width: number, height: number) => texture(width, height),
        // A raised or sunk layer's mask is a canvas: drawn on, never read here.
        createCanvas: () => ({
          context: new Proxy({}, { get: () => () => undefined, set: () => true }),
          refresh: () => undefined,
        }),
        get: () => ({ has: () => false, add: () => undefined }),
        getFrame: () => undefined,
      },
      make: { graphics },
      add: {
        graphics: () => {
          const painter = graphics();
          flats.push(painter);
          return painter;
        },
        image: (_x: number, _y: number, key: string) => {
          const image = {
            key,
            alpha: 1,
            blendMode: -1,
            visible: true,
            setOrigin: () => image,
            setVisible(visible: boolean) {
              image.visible = visible;
              return image;
            },
            setScale: () => image,
            setDepth: () => image,
            setBlendMode(mode: number) {
              image.blendMode = mode;
              return image;
            },
            setAlpha(alpha: number) {
              image.alpha = alpha;
              return image;
            },
            destroy: () => undefined,
          };
          images.push(image);
          return image;
        },
      },
    };
    return { scene: scene as unknown as Phaser.Scene, drawn, images, flats };
  }

  const STRUCTURE: MapStructure = {
    layerCount: 1,
    biome: "hall",
    ascentAct: null,
    bounds: { kind: "rect" },
    ground: 0,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    overhangs: [],
    decks: [],
    transitions: [],
    water: [],
    zones: [],
  };
  const SUNLIT: MapLighting = {
    ...BASE,
    ambient: { colour: 0xffffff, intensity: 0.6 },
    indoorAmbient: { colour: 0xffffff, intensity: 0.1 },
    indoor: [{ kind: "rect", x: 0, y: 0, width: 50, height: 50 }],
    sun: { directionDeg: 90, elevationDeg: 30, colour: 0xffffff, intensity: 0.4 },
  };

  it("paints the sun's shadows and the indoors into the light map (#2988)", () => {
    const { scene, drawn } = fakeScene();
    new LightingPass(scene).show(SUNLIT, STRUCTURE, [{ ...WALL, layer: 0 }], 400, 400, false);
    expect(drawn).toEqual([
      { colour: sunShadowTint(SUNLIT), alive: true },
      { colour: baseTint(SUNLIT, true), alive: true },
    ]);
  });

  it("fills the plain outdoor tint flat, multiplied, and textures the rest (#3524)", () => {
    const { scene, images, flats } = fakeScene();
    const lit: MapLighting = {
      ...SUNLIT,
      lights: [{ ...light("lamp", 0, 0), position: { x: 300, y: 300 } }],
    };
    new LightingPass(scene).show(lit, STRUCTURE, [], 400, 400, false);
    expect(flats.map(({ colour, blendMode }) => ({ colour, blendMode }))).toEqual([
      { colour: baseTint(lit, false), blendMode: MULTIPLY },
    ]);
    expect(flats[0]?.rects).toBeGreaterThan(0);
    expect(images.length).toBeGreaterThan(0);
  });

  it("hides the images the camera's view misses, and shows them again in view (#3660)", () => {
    const { scene, images } = fakeScene();
    const lit: MapLighting = {
      ...SUNLIT,
      lights: [
        { ...light("near", 0, 0), position: { x: 50, y: 50 } },
        { ...light("far", 0, 0), position: { x: 350, y: 350 } },
      ],
    };
    const pass = new LightingPass(scene);
    pass.show(lit, STRUCTURE, [], 400, 400, false);
    pass.update(0, { left: 0, top: 0, right: 100, bottom: 100 });
    expect(images.some(({ visible }) => visible)).toBe(true);
    expect(images.some(({ visible }) => !visible)).toBe(true);
    pass.update(0, { left: 0, top: 0, right: 400, bottom: 400 });
    expect(images.every(({ visible }) => visible)).toBe(true);
  });

  describe("a tunnel's lights (#3350)", () => {
    const TUNNELLED: MapStructure = {
      ...STRUCTURE,
      layerCount: 2,
      ground: 1,
      tunnels: [{ footprint: { kind: "rect", x: 100, y: 100, width: 200, height: 80 } }],
    };
    const TORCH = { ...light("torch", 0, 0), colour: 0xffb060 };
    const LIT: MapLighting = { ...BASE, lights: [TORCH] };

    it("lift a pool past the unlit tone, and no further than the cap", () => {
      const glow = tunnelGlow(TORCH.intensity);
      expect(glow).toBeGreaterThan(0);
      expect(glow).toBeLessThanOrEqual(TUNNEL_GLOW_CAP);
      expect(tunnelGlow(10)).toBe(TUNNEL_GLOW_CAP);
    });

    it("add their pools over the tunnels' layer, and only there", () => {
      const { scene, images } = fakeScene();
      new LightingPass(scene).show(LIT, TUNNELLED, [], 400, 400, false);
      const glows = images.filter(({ key }) => key.endsWith("-glow"));
      expect(glows.length).toBeGreaterThan(0);
      expect(glows.every(({ blendMode }) => blendMode === ADD)).toBe(true);
    });

    it("leave a map with no tunnels lit as before", () => {
      const { scene, images } = fakeScene();
      new LightingPass(scene).show(LIT, { ...STRUCTURE, layerCount: 2 }, [], 400, 400, false);
      expect(images.some(({ key }) => key.endsWith("-glow"))).toBe(false);
      expect(images.every(({ blendMode }) => blendMode === MULTIPLY)).toBe(true);
    });

    it("fade the ground's light over a tunnel to its cover's alpha (fadeTunnel)", () => {
      const { scene, images } = fakeScene();
      const pass = new LightingPass(scene);
      pass.show(LIT, TUNNELLED, [], 400, 400, false);
      const before = images.map(({ alpha }) => alpha);
      pass.fadeTunnel(0, 0.15);
      const faded = images.filter(({ alpha }) => alpha === 0.15);
      expect(faded.length).toBeGreaterThan(0);
      expect(faded.length).toBeLessThan(images.length);
      expect(before.every((alpha) => alpha === 1)).toBe(true);
      expect(faded.some(({ key }) => key.endsWith("-glow"))).toBe(false);
    });
  });
});

describe("lightMapCells (#3524)", () => {
  const ARENA = 1000;
  const TUNNELLED: MapStructure = {
    layerCount: 2,
    biome: "hall",
    ascentAct: null,
    bounds: { kind: "rect" },
    ground: 1,
    pits: [],
    tunnels: [{ footprint: { kind: "rect", x: 100, y: 100, width: 200, height: 80 } }],
    dropOffs: [],
    downDecks: [],
    overhangs: [],
    decks: [],
    transitions: [],
    water: [],
    zones: [],
  };
  const LAMP = { ...light("lamp", 1, 0), position: { x: 600, y: 600 } };
  const CANDLE = { ...light("candle", 1, 1), position: { x: 800, y: 300 } };
  const TORCH = { ...light("torch", 0, 0), position: { x: 150, y: 140 } };
  const LIT: MapLighting = {
    ...BASE,
    ambient: { colour: 0xffffff, intensity: 0.5 },
    lights: [LAMP, CANDLE, TORCH],
  };
  /** A light's reach in the light map's own pixels, as a box. */
  const reach = ({ position, radius }: typeof LAMP, extent: LightMapBox): LightMapBox => ({
    x: (position.x - radius) / 2 - extent.x,
    y: (position.y - radius) / 2 - extent.y,
    width: radius,
    height: radius,
  });
  const meets = (a: LightMapBox, b: LightMapBox): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const area = (boxes: readonly LightMapBox[]): number =>
    boxes.reduce((sum, { width, height }) => sum + width * height, 0);

  it("splits the ground's cover into flat and textured, together the whole of it", () => {
    const extent = lightMapExtent(TUNNELLED, 1, ARENA, ARENA);
    const cells = lightMapCells(LIT, TUNNELLED, [], 1, extent, "full");
    expect(area(cells.flat)).toBeGreaterThan(0);
    expect(area(cells.flat) + area(cells.textured)).toBe(
      area(lightMapCover(TUNNELLED, [], 1, extent)),
    );
    expect(cells.flat.some((cell) => cells.textured.some((other) => meets(cell, other)))).toBe(
      false,
    );
  });

  it("keeps every cell a light reaches textured, steady or flickering", () => {
    const extent = lightMapExtent(TUNNELLED, 1, ARENA, ARENA);
    const cells = lightMapCells(LIT, TUNNELLED, [], 1, extent, "full");
    for (const lamp of [LAMP, CANDLE]) {
      const box = reach(lamp, extent);
      expect(cells.flat.some((cell) => meets(cell, box))).toBe(false);
      expect(cells.textured.some((cell) => meets(cell, box))).toBe(true);
    }
  });

  it("shows the warm pools only where a light reaches: the rest is black", () => {
    const extent = lightMapExtent(TUNNELLED, 0, ARENA, ARENA);
    const cells = lightMapCells(LIT, TUNNELLED, [], 0, extent, "full");
    const box = reach(TORCH, extent);
    expect(cells.lit.length).toBeGreaterThan(0);
    expect(cells.lit.every((cell) => meets(cell, box))).toBe(true);
    expect(area(cells.lit)).toBeLessThan(area(lightMapCover(TUNNELLED, [], 0, extent)));
  });

  it("marks only the cells a shape meets, not every cell in its box", () => {
    const extent = lightMapExtent(TUNNELLED, 1, ARENA, ARENA);
    // A thin diagonal hall across the arena: its box is all of it.
    const diagonal: MapLighting = {
      ...LIT,
      lights: [],
      indoor: [
        {
          kind: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 1000, y: 940 },
            { x: 1000, y: 1000 },
            { x: 940, y: 1000 },
            { x: 0, y: 60 },
          ],
        },
      ],
    };
    const cells = lightMapCells(diagonal, TUNNELLED, [], 1, extent, "full");
    // Far off the diagonal, inside its box: flat. On it: textured.
    const off = { x: 400 - extent.x, y: 50 - extent.y, width: 25, height: 25 };
    const on = { x: 250 - extent.x, y: 250 - extent.y, width: 5, height: 5 };
    expect(cells.flat.some((cell) => meets(cell, off))).toBe(true);
    expect(cells.textured.some((cell) => meets(cell, on))).toBe(true);
    expect(cells.flat.some((cell) => meets(cell, on))).toBe(false);
  });

  it("textures a cell the indoors or a sun shadow marks", () => {
    const extent = lightMapExtent(TUNNELLED, 1, ARENA, ARENA);
    const indoor: MapLighting = {
      ...LIT,
      lights: [],
      indoor: [{ kind: "rect", x: 400, y: 800, width: 100, height: 100 }],
    };
    const cells = lightMapCells(indoor, TUNNELLED, [], 1, extent, "full");
    const box = { x: 200 - extent.x, y: 400 - extent.y, width: 50, height: 50 };
    expect(cells.flat.some((cell) => meets(cell, box))).toBe(false);
    expect(cells.textured.some((cell) => meets(cell, box))).toBe(true);
  });
});
