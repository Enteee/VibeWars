import { describe, expect, it, vi } from "vitest";

import type { Uphill } from "@vibewars/game-core";
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
  flickerRedrawDue,
  groundHoles,
  layerSurfaces,
  lightsByStability,
  litStructurePalette,
  shownStage,
  stageShadows,
  sunShadowTint,
} from "./lighting-pass.js";
import { ELEVATION_STEP } from "./render-order.js";

// Phaser probes for a browser when it loads: only its constants are read here.
vi.mock("phaser", () => ({
  default: {
    Renderer: { Events: { RESTORE_WEBGL: "restorewebgl" } },
    BlendModes: { ADD: 1, MULTIPLY: 2 },
    Math: { Vector2: Object },
  },
}));

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
  const palette = arenaPalette(2);

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
    bounds: { kind: "rect" },
    ground: 0,
    decks: [deck(1, 420, 250, 360, 200), deck(2, 520, 60, 160, 110)],
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
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
});

describe("LightingPass", () => {
  /** Something whose every method does nothing and returns it, as a Phaser chain. */
  function inert(): unknown {
    const self: object = new Proxy(() => self, { get: () => () => self });
    return self;
  }

  /**
   * A scene whose light maps, as Phaser 4's DynamicTexture does, queue a
   * draw and run it only at `render()`: what each painted then, and
   * whether its painter was still alive to paint it.
   */
  function fakeScene() {
    const destroyed = new Set<object>();
    const drawn: { colour: number; alive: boolean }[] = [];
    const graphics = () => {
      const painter = {
        colour: -1,
        fillStyle(colour: number) {
          painter.colour = colour;
          return painter;
        },
        fillPoints: () => painter,
        fillRect: () => painter,
        setScale: () => painter,
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
      },
      make: { graphics },
      add: { image: inert },
    };
    return { scene: scene as unknown as Phaser.Scene, drawn };
  }

  const STRUCTURE: MapStructure = {
    layerCount: 1,
    bounds: { kind: "rect" },
    ground: 0,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
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
});
