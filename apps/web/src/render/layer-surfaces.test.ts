import { describe, expect, it } from "vitest";

import {
  actorAtPoint,
  EMPTY_SNAPSHOT,
  type MapStructure,
  type RenderableActor,
} from "./arena-snapshot.js";
import {
  altHeld,
  deckSideLow,
  hiddenCrop,
  DECK_SLAB,
  drawnLayerAt,
  liftAt,
  occludersOf,
  plankLines,
  southFacingEdges,
  WALL_HEIGHT,
  pickSurface,
  rampDrawing,
  RING_PATH,
  traceHiddenOutline,
  traceHiddenPolyline,
} from "./layer-surfaces.js";
import { ELEVATION_STEP } from "./render-order.js";

const bridge = { kind: "rect", x: 100, y: 100, width: 200, height: 100 } as const;
const BRIDGE: MapStructure = {
  layerCount: 2,
  decks: [{ layer: 1, footprint: bridge }],
  transitions: [],
  water: [],
};

function hiddenSegments(y: number, layer: number): { x: number; y: number }[] {
  const seen: { x: number; y: number }[] = [];
  traceHiddenOutline(RING_PATH, 200, y, 10, layer, occludersOf([], BRIDGE), (ax, ay, bx, by) => {
    seen.push({ x: (ax + bx) / 2, y: (ay + by) / 2 });
  });
  return seen;
}

describe("the surface a click names (#2831)", () => {
  // The deck draws ELEVATION_STEP above its footprint.
  const onDeck = { x: 200, y: 150 - ELEVATION_STEP };

  it("is the deck where one is drawn, at the point on it", () => {
    expect(pickSurface(BRIDGE, onDeck, false)).toEqual({ layer: 1, point: { x: 200, y: 150 } });
  });

  it("is the ground under it with Alt", () => {
    expect(pickSurface(BRIDGE, onDeck, true)).toEqual({ layer: 0, point: onDeck });
  });

  it("acts as a plain click where there is nothing below", () => {
    const open = { x: 10, y: 10 };
    expect(pickSurface(BRIDGE, open, true)).toEqual({ layer: 0, point: open });
  });
});

describe("a click on a ramp (#2972)", () => {
  const rect = (x: number, y: number, width: number, height: number) =>
    ({ kind: "rect", x, y, width, height }) as const;
  const STAIRS: MapStructure = {
    layerCount: 3,
    decks: [
      { layer: 1, footprint: rect(200, 100, 200, 100) },
      { layer: 2, footprint: rect(260, -100, 80, 100) },
    ],
    transitions: [
      { from: 0, to: 1, area: rect(100, 100, 120, 100) },
      { from: 1, to: 2, area: rect(280, 0, 40, 120) },
    ],
    water: [],
  };
  const drawnAt = (point: { x: number; y: number }, layer: number) => ({
    x: point.x,
    y: point.y - liftAt(STAIRS, point, layer),
  });

  it("lands where the 0→1 ramp is drawn, its upper half on the upper layer", () => {
    const point = { x: 180, y: 150 };
    const picked = pickSurface(STAIRS, drawnAt(point, 1), false);
    expect(picked.layer).toBe(1);
    expect(picked.point.x).toBeCloseTo(180, 5);
    expect(picked.point.y).toBeCloseTo(150, 5);
  });

  it("is the lower layer in the lower half", () => {
    expect(pickSurface(STAIRS, drawnAt({ x: 130, y: 150 }, 0), false).layer).toBe(0);
  });

  it("lands where the 1→2 ramp is drawn, a slope along y", () => {
    const point = { x: 300, y: 30 };
    const picked = pickSurface(STAIRS, drawnAt(point, 2), false);
    expect(picked.layer).toBe(2);
    expect(picked.point.x).toBeCloseTo(300, 5);
    expect(picked.point.y).toBeCloseTo(30, 3);
  });

  it("gives the surface beneath with Alt", () => {
    const at = drawnAt({ x: 180, y: 150 }, 1);
    expect(pickSurface(STAIRS, at, true)).toEqual({ layer: 0, point: at });
  });
});

describe("Alt on the pointer (#2831)", () => {
  it("is not held before the pointer's first event", () => {
    expect(altHeld({})).toBe(false);
  });

  it("follows the pointer's last event", () => {
    expect(altHeld({ event: { altKey: true } })).toBe(true);
    expect(altHeld({ event: { altKey: false } })).toBe(false);
  });
});

describe("the hidden part of a body (#2831)", () => {
  it("is all of a body well under the deck", () => {
    expect(hiddenSegments(150, 0)).toHaveLength(48);
  });

  it("is only the part under the deck's edge", () => {
    // The deck's face and side reach down to y 200.
    const seen = hiddenSegments(200, 0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(48);
    expect(seen.every((point) => point.y <= 200)).toBe(true);
  });

  it("is nothing for a body clear of it, or standing on it", () => {
    expect(hiddenSegments(400, 0)).toEqual([]);
    expect(hiddenSegments(150, 1)).toEqual([]);
  });

  it("is nothing on a map of one layer", () => {
    expect(occludersOf([], { layerCount: 1, decks: [], transitions: [], water: [] })).toEqual([]);
  });
});

describe("a body under a raised ramp (#2975)", () => {
  // Training Heights' shape: a ground ramp up to the bridge, a raised one up to the platform.
  const lower = {
    from: 0,
    to: 1,
    area: { kind: "rect", x: 300, y: 350, width: 140, height: 200 },
  } as const;
  const upper = {
    from: 1,
    to: 2,
    area: { kind: "rect", x: 540, y: 250, width: 120, height: 120 },
  } as const;
  const HEIGHTS: MapStructure = {
    layerCount: 3,
    decks: [
      { layer: 1, footprint: { kind: "rect", x: 420, y: 350, width: 360, height: 200 } },
      { layer: 2, footprint: { kind: "rect", x: 520, y: 160, width: 160, height: 110 } },
    ],
    transitions: [lower, upper],
    water: [],
  };
  const occluders = occludersOf([], HEIGHTS);
  const slope = rampDrawing(HEIGHTS, upper)?.slope ?? [];
  const middle = {
    x: slope.reduce((sum, { x }) => sum + x, 0) / slope.length,
    y: slope.reduce((sum, { y }) => sum + y, 0) / slope.length,
  };
  const hidden = (layer: number): number => {
    let count = 0;
    traceHiddenOutline(RING_PATH, middle.x, middle.y, 10, layer, occluders, () => {
      count += 1;
    });
    return count;
  };

  it("has an occluder for the raised ramp, drawn as its slope, and none for the ground one", () => {
    expect(occluders).toHaveLength(3);
    expect(occluders[2]).toMatchObject({ outline: slope, hidesThrough: 0, lowLift: 0 });
  });

  it("hides a ground body under the slope, not a body on the deck it starts from", () => {
    expect(hidden(0)).toBeGreaterThan(0);
    expect(hidden(1)).toBe(0);
  });
});

describe("the hidden part of a weapon and symbol (#2972)", () => {
  // The deck draws ELEVATION_STEP above its footprint.
  const under = 150 - ELEVATION_STEP;
  const occluders = occludersOf([], BRIDGE);
  const span = (pieces: readonly { ax: number; bx: number }[]) => ({
    left: Math.min(...pieces.map(({ ax, bx }) => Math.min(ax, bx))),
    right: Math.max(...pieces.map(({ ax, bx }) => Math.max(ax, bx))),
  });

  it("covers only the part of a polyline under a deck", () => {
    const line = [
      { x: 60, y: under },
      { x: 140, y: under },
    ];
    const { left, right } = span(traceHiddenPolyline(line, 0, occluders));
    expect(left).toBeCloseTo(100, 0);
    expect(right).toBeCloseTo(140, 0);
  });

  it("covers a polyline wholly under a deck", () => {
    const line = [
      { x: 150, y: under },
      { x: 190, y: under },
    ];
    const { left, right } = span(traceHiddenPolyline(line, 0, occluders));
    expect(left).toBeCloseTo(150, 0);
    expect(right).toBeCloseTo(190, 0);
  });

  it("covers nothing clear of a deck, or on a layer it does not hide", () => {
    const clear = [
      { x: 20, y: under },
      { x: 60, y: under },
    ];
    const above = [
      { x: 150, y: under },
      { x: 190, y: under },
    ];
    expect(traceHiddenPolyline(clear, 0, occluders)).toEqual([]);
    expect(traceHiddenPolyline(above, 1, occluders)).toEqual([]);
  });

  it("crops a symbol half under the deck to its hidden half", () => {
    expect(hiddenCrop(100, under, 16, 0, occluders)).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
    });
  });

  it("has no crop for a symbol in the clear", () => {
    expect(hiddenCrop(40, under, 16, 0, occluders)).toBeUndefined();
  });
});

describe("clicking a character on a layered map (#2831)", () => {
  const actor = (id: string, y: number, layer: number): RenderableActor => ({
    name: id,
    guildTag: undefined,
    heroRank: 0,
    signet: undefined,
    cape: undefined,
    bot: false,
    facing: 0,
    weaponId: undefined,
    swingElapsed: 0,
    swingTotal: 0,
    attackCast: undefined,
    offhandId: undefined,
    profession: undefined,
    creatureLook: undefined,
    team: "enemy",
    health: 500,
    maxHealth: 500,
    exploited: false,
    knockedDown: false,
    castProgress: undefined,
    castType: undefined,
    statuses: [],
    enchanted: false,
    hexed: false,
    invulnerable: false,
    conditionCues: [],
    id,
    layer,
    dead: false,
    radius: 10,
    position: { x: 200, y },
  });

  it("finds a body on a deck where it is drawn", () => {
    const arena = { ...EMPTY_SNAPSHOT, structure: BRIDGE, actors: [actor("up", 150, 1)] };
    expect(actorAtPoint(arena, { x: 200, y: 150 - ELEVATION_STEP })?.id).toBe("up");
    expect(actorAtPoint(arena, { x: 200, y: 150 })).toBeUndefined();
  });

  it("finds a body under a deck through its outline", () => {
    const arena = { ...EMPTY_SNAPSHOT, structure: BRIDGE, actors: [actor("under", 150, 0)] };
    expect(actorAtPoint(arena, { x: 205, y: 150 })?.id).toBe("under");
  });
});

describe("liftAt (#2958)", () => {
  const deck = (layer: number, x: number, y: number, width: number, height: number) => ({
    layer,
    footprint: { kind: "rect" as const, x, y, width, height },
  });
  const ramp = (from: number, to: number, x: number, y: number, width: number, height: number) => ({
    from,
    to,
    area: { kind: "rect" as const, x, y, width, height },
  });
  const HEIGHTS: MapStructure = {
    layerCount: 3,
    decks: [deck(1, 420, 250, 360, 200), deck(2, 520, 60, 160, 110)],
    transitions: [
      ramp(0, 1, 300, 250, 140, 200),
      ramp(0, 1, 760, 250, 140, 200),
      ramp(1, 2, 540, 150, 120, 120),
    ],
    water: [],
  };
  const STEP = ELEVATION_STEP;
  const R = 14;

  it.each([
    ["west ramp", { x: 300, y: 350 }, { x: 370, y: 350 }, { x: 440, y: 350 }, 0],
    ["east ramp", { x: 900, y: 350 }, { x: 830, y: 350 }, { x: 760, y: 350 }, 0],
    ["1 to 2 ramp", { x: 600, y: 270 }, { x: 600, y: 210 }, { x: 600, y: 150 }, 1],
  ])("%s: low end, midpoint, high end", (_name, low, mid, high, base) => {
    expect(liftAt(HEIGHTS, low, base)).toBeCloseTo(base * STEP);
    expect(liftAt(HEIGHTS, mid, base)).toBeCloseTo((base + 0.5) * STEP);
    expect(liftAt(HEIGHTS, high, base + 1)).toBeCloseTo((base + 1) * STEP);
  });

  it("does not depend on which of the ramp's layers the body is on", () => {
    expect(liftAt(HEIGHTS, { x: 370, y: 350 }, 1)).toBe(liftAt(HEIGHTS, { x: 370, y: 350 }, 0));
  });

  it("leaves a layer the ramp does not join at its own height", () => {
    expect(liftAt(HEIGHTS, { x: 600, y: 260 }, 0)).toBe(0);
  });

  it("is the layer's height off every ramp", () => {
    expect(liftAt(HEIGHTS, { x: 600, y: 400 }, 1)).toBe(STEP);
    expect(liftAt(HEIGHTS, { x: 100, y: 100 }, 0)).toBe(0);
  });

  it("never steps on a walk from the ground to the deck", () => {
    const walked = 5;
    let last = 0;
    for (let x = 280; x <= 460; x += walked) {
      const layer = x < 300 ? 0 : 1;
      const lift = liftAt(HEIGHTS, { x, y: 350 }, layer);
      expect(Math.abs(lift - last)).toBeLessThanOrEqual((walked / 140) * STEP + 1e-9);
      last = lift;
    }
    expect(last).toBe(STEP);
  });

  it("draws a body on a ramp in the ramp's upper layer, so its deck does not cover it", () => {
    expect(drawnLayerAt(HEIGHTS, { x: 430, y: 350 }, 0, R)).toBe(1);
    expect(drawnLayerAt(HEIGHTS, { x: 600, y: 260 }, 0, R)).toBe(0);
    expect(drawnLayerAt(HEIGHTS, { x: 100, y: 100 }, 0, R)).toBe(0);
  });

  it("draws a body whose disc reaches a ramp in front of it (#2965)", () => {
    expect(drawnLayerAt(HEIGHTS, { x: 299, y: 350 }, 0, R)).toBe(1);
    expect(drawnLayerAt(HEIGHTS, { x: 350, y: 455 }, 0, R)).toBe(1);
    expect(drawnLayerAt(HEIGHTS, { x: 535, y: 260 }, 1, R)).toBe(2);
    expect(drawnLayerAt(HEIGHTS, { x: 525, y: 260 }, 1, R)).toBe(1);
  });

  it("keeps a body under a deck there, in reach of the ramp's high end", () => {
    expect(drawnLayerAt(HEIGHTS, { x: 446, y: 350 }, 0, R)).toBe(0);
    expect(drawnLayerAt(HEIGHTS, { x: 530, y: 165 }, 1, R)).toBe(1);
  });

  it("slopes the drawing from the lower layer's height to the upper's", () => {
    const [west] = HEIGHTS.transitions;
    if (west === undefined) throw new Error("no ramp");
    const drawn = rampDrawing(HEIGHTS, west);
    expect(drawn?.slope).toEqual([
      { x: 300, y: 250 },
      { x: 440, y: 250 - STEP },
      { x: 440, y: 450 - STEP },
      { x: 300, y: 450 },
    ]);
    expect(drawn?.side[2]).toEqual({ x: 440, y: 450 });
    expect(drawn?.chevrons).toHaveLength(3);
  });

  it("makes a deck on a ground wall a slab, and leaves other decks solid", () => {
    const [bridge, platform] = HEIGHTS.decks;
    if (bridge === undefined || platform === undefined) throw new Error("no decks");
    const pillar = { kind: "rect" as const, layer: 0, x: 450, y: 420, width: 24, height: 24 };
    expect(deckSideLow(bridge, [pillar])).toBe(STEP - DECK_SLAB);
    expect(deckSideLow(bridge, [])).toBe(0);
    expect(deckSideLow(platform, [pillar])).toBe(STEP);
  });
});

describe("structures with height", () => {
  const wall = { kind: "rect" as const, layer: 0, x: 150, y: 400, width: 100, height: 40 };
  const deck = {
    layer: 1,
    footprint: { kind: "rect" as const, x: 420, y: 250, width: 360, height: 200 },
  };
  const pillar = { kind: "rect" as const, layer: 0, x: 450, y: 420, width: 24, height: 24 };
  const structure: MapStructure = { layerCount: 2, decks: [deck], transitions: [], water: [] };
  const hiddenAt = (y: number): number => {
    let pieces = 0;
    traceHiddenOutline(RING_PATH, 200, y, 10, 0, occludersOf([wall], structure), () => {
      pieces += 1;
    });
    return pieces;
  };

  it("has a wall cover its own height", () => {
    const [occluder] = occludersOf([wall], structure);
    expect([occluder?.lowLift, occluder?.highLift]).toEqual([0, WALL_HEIGHT]);
  });

  it("has a support cover the ground to its deck's underside", () => {
    const [occluder] = occludersOf([pillar], structure);
    expect([occluder?.lowLift, occluder?.highLift]).toEqual([0, ELEVATION_STEP - DECK_SLAB]);
  });

  it("has a slab deck end where its slab does", () => {
    expect(occludersOf([pillar], structure)[1]?.bottom).toBe(406);
  });

  it("hides a body north of a wall within the wall's height, not beyond", () => {
    expect(hiddenAt(400 - WALL_HEIGHT / 2)).toBeGreaterThan(0);
    expect(hiddenAt(400 - WALL_HEIGHT - 12)).toBe(0);
  });

  it("finds the south edges of a shape, whichever way it winds", () => {
    const south = [{ from: { x: 10, y: 10 }, to: { x: 0, y: 10 } }];
    expect(southFacingEdges({ kind: "rect", x: 0, y: 0, width: 10, height: 10 })).toEqual(south);
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(southFacingEdges({ kind: "polygon", points })).toEqual([
      { from: { x: 0, y: 10 }, to: { x: 10, y: 10 } },
    ]);
  });

  it("cuts planks to the shape's outline", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 0, y: 96 },
    ];
    expect(plankLines({ kind: "polygon", points }, 48)).toEqual([
      { from: { x: 48, y: 0 }, to: { x: 48, y: 48 } },
    ]);
  });
});
