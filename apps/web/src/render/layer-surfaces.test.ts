import { describe, expect, it } from "vitest";

import type { Uphill, Vec2 } from "@vibewars/game-core";

import {
  actorAtPoint,
  EMPTY_SNAPSHOT,
  FLAT_STRUCTURE,
  type MapStructure,
  type RenderableActor,
} from "./arena-snapshot.js";
import {
  trackAlt,
  besideDropOff,
  brokenLip,
  deckSideLow,
  hiddenCrop,
  DECK_SLAB,
  HIDDEN_DASH,
  HIDDEN_GAP,
  type HiddenPiece,
  drawnLayerAt,
  liftAt,
  occludersOf,
  overhangAt,
  plankLines,
  southFacingEdges,
  surfacesAt,
  sweptEdges,
  WALL_HEIGHT,
  pickSurface,
  pitDrawing,
  tunnelCover,
  rampDrawing,
  RING_PATH,
  traceHiddenOutline,
  traceHiddenPolyline,
} from "./layer-surfaces.js";
import { ELEVATION_STEP } from "./render-order.js";

const bridge = { kind: "rect", x: 100, y: 100, width: 200, height: 100 } as const;
const BRIDGE: MapStructure = {
  layerCount: 2,
  bounds: { kind: "rect" },
  ground: 0,
  pits: [],
  tunnels: [],
  dropOffs: [],
  downDecks: [],
  decks: [{ layer: 1, footprint: bridge, look: "platform", switched: null }],
  transitions: [],
  water: [],
  zones: [],
};

function hiddenPieces(x: number, y: number): HiddenPiece[] {
  const pieces: HiddenPiece[] = [];
  traceHiddenOutline(RING_PATH, x, y, 14, 0, occludersOf([], BRIDGE), (ax, ay, bx, by) => {
    pieces.push({ ax, ay, bx, by });
  });
  return pieces;
}

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
    bounds: { kind: "rect" },
    ground: 0,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    decks: [
      { layer: 1, footprint: rect(200, 100, 200, 100), look: "platform", switched: null },
      { layer: 2, footprint: rect(260, -100, 80, 100), look: "platform", switched: null },
    ],
    transitions: [
      { from: 0, to: 1, area: rect(100, 100, 120, 100), uphill: "e", look: "ramp", lift: null },
      { from: 1, to: 2, area: rect(280, 0, 40, 120), uphill: "n", look: "ramp", lift: null },
    ],
    water: [],
    zones: [],
  };
  const drawnAt = (point: { x: number; y: number }, layer: number) => ({
    x: point.x,
    y: point.y - liftAt(STAIRS, [], point, layer),
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

describe("the hidden part of a body (#2831)", () => {
  it("is all of a body well under the deck, dashed (#2979)", () => {
    const shown = hiddenSegments(150, 0).length;
    expect(shown / 48).toBeCloseTo(HIDDEN_DASH / (HIDDEN_DASH + HIDDEN_GAP), 1);
  });

  it("is dashes no longer than a dash and a piece, with gaps between (#2979)", () => {
    const pieces = hiddenPieces(200, 150);
    const lengthOf = ({ ax, ay, bx, by }: HiddenPiece): number => Math.hypot(bx - ax, by - ay);
    const piece = Math.max(...pieces.map(lengthOf));
    const dashes: number[] = [];
    pieces.forEach((each, at) => {
      const before = pieces[at - 1];
      const joined = before?.bx === each.ax && before.by === each.ay;
      const length = lengthOf(each);
      if (joined) {
        dashes[dashes.length - 1] = (dashes.at(-1) ?? 0) + length;
      } else {
        dashes.push(length);
      }
    });
    expect(dashes.length).toBeGreaterThan(1);
    expect(dashes.every((dash) => dash <= HIDDEN_DASH + piece + 1e-9)).toBe(true);
  });

  it("keeps its dashes to a body that moves, not crawling round it (#2979)", () => {
    const moved = hiddenPieces(201, 150).map(({ ax, ay, bx, by }) => ({
      ax: ax - 1,
      ay,
      bx: bx - 1,
      by,
    }));
    const here = hiddenPieces(200, 150);
    expect(moved).toHaveLength(here.length);
    const rounded = (pieces: readonly HiddenPiece[]): string[] =>
      pieces.map(({ ax, ay, bx, by }) => [ax, ay, bx, by].map((n) => n.toFixed(6)).join(","));
    expect(rounded(moved)).toEqual(rounded(here));
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
    expect(occludersOf([], FLAT_STRUCTURE)).toEqual([]);
  });
});

describe("a body under a raised ramp (#2975)", () => {
  // Training Heights' shape: a ground ramp up to the bridge, a raised one up to the platform.
  const lower = {
    from: 0,
    to: 1,
    area: { kind: "rect", x: 300, y: 350, width: 140, height: 200 },
    uphill: "e",
    look: "ramp",
    lift: null,
  } as const;
  const upper = {
    from: 1,
    to: 2,
    area: { kind: "rect", x: 540, y: 250, width: 120, height: 120 },
    uphill: "n",
    look: "ramp",
    lift: null,
  } as const;
  const HEIGHTS: MapStructure = {
    layerCount: 3,
    bounds: { kind: "rect" },
    ground: 0,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    decks: [
      {
        layer: 1,
        footprint: { kind: "rect", x: 420, y: 350, width: 360, height: 200 },
        look: "platform",
        switched: null,
      },
      {
        layer: 2,
        footprint: { kind: "rect", x: 520, y: 160, width: 160, height: 110 },
        look: "platform",
        switched: null,
      },
    ],
    transitions: [lower, upper],
    water: [],
    zones: [],
  };
  const occluders = occludersOf([], HEIGHTS);
  const slope = rampDrawing(HEIGHTS, upper).slope;
  const middle = {
    x: slope.reduce((sum, { x }) => sum + x, 0) / slope.length,
    y: slope.reduce((sum, { y }) => sum + y, 0) / slope.length,
  };
  const hidden = (
    layer: number,
    at: { readonly x: number; readonly y: number } = middle,
  ): number => {
    let count = 0;
    traceHiddenOutline(RING_PATH, at.x, at.y, 10, layer, occluders, () => {
      count += 1;
    });
    return count;
  };

  it("has an occluder for each ramp, drawn as its slope", () => {
    expect(occluders).toHaveLength(4);
    expect(occluders[3]).toMatchObject({
      outline: slope,
      hidesThrough: 0,
      lowLift: 0,
      exempt: null,
    });
  });

  it("hides a ground body under the slope, not a body on the deck it starts from", () => {
    expect(hidden(0)).toBeGreaterThan(0);
    expect(hidden(1)).toBe(0);
  });

  // West of the bridge's deck, north of the ground ramp, where its lifted slope is drawn (#3000).
  const behind = { x: 400, y: 335 };

  it("hides a ground body behind the ground ramp's lifted slope (#3000)", () => {
    expect(hidden(0, behind)).toBeGreaterThan(0);
  });

  it("hides neither a ground body on the ground ramp nor a body above it (#3000)", () => {
    expect(hidden(0, { x: 330, y: 450 })).toBe(0);
    expect(hidden(1, behind)).toBe(0);
  });

  it("covers a polyline behind the ground ramp, not one on it (#3000)", () => {
    const across = (y: number, from: number, to: number) => [
      { x: from, y },
      { x: to, y },
    ];
    expect(traceHiddenPolyline(across(behind.y, 390, 410), 0, occluders)).not.toHaveLength(0);
    expect(traceHiddenPolyline(across(450, 310, 360), 0, occluders)).toHaveLength(0);
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
    // 136 is 76 along the line, inside its dash from 72 to 77.
    const line = [
      { x: 60, y: under },
      { x: 136, y: under },
    ];
    const { left, right } = span(traceHiddenPolyline(line, 0, occluders));
    expect(left).toBeCloseTo(100, 0);
    expect(right).toBeCloseTo(136, 0);
  });

  it("dashes one long straight segment, measured from the line's start (#2979)", () => {
    const line = [
      { x: 150, y: under },
      { x: 190, y: under },
    ];
    const pieces = traceHiddenPolyline(line, 0, occluders);
    const along = (x: number): number => x - 150;
    expect(pieces.length).toBeGreaterThan(0);
    for (const { ax, bx } of pieces) {
      const from = along(Math.min(ax, bx)) % (HIDDEN_DASH + HIDDEN_GAP);
      expect(from).toBeLessThan(HIDDEN_DASH);
      expect(from + Math.abs(bx - ax)).toBeLessThanOrEqual(HIDDEN_DASH + 1e-9);
    }
    const covered = pieces.reduce((sum, { ax, bx }) => sum + Math.abs(bx - ax), 0);
    // 40 long: dashes at 0, 9, 18, 27 and 36, the last cut at 40.
    expect(covered).toBeCloseTo(4 * HIDDEN_DASH + 4, 9);
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
    teleportReadyAt: 0,
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
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    decks: [deck(1, 420, 250, 360, 200), deck(2, 520, 60, 160, 110)],
    transitions: [
      ramp(0, 1, [300, 250, 140, 200], "e"),
      ramp(0, 1, [760, 250, 140, 200], "w"),
      ramp(1, 2, [540, 150, 120, 120], "n"),
    ],
    water: [],
    zones: [],
  };
  const STEP = ELEVATION_STEP;
  const R = 14;

  it.each([
    ["west ramp", { x: 300, y: 350 }, { x: 370, y: 350 }, { x: 440, y: 350 }, 0],
    ["east ramp", { x: 900, y: 350 }, { x: 830, y: 350 }, { x: 760, y: 350 }, 0],
    ["1 to 2 ramp", { x: 600, y: 270 }, { x: 600, y: 210 }, { x: 600, y: 150 }, 1],
  ])("%s: low end, midpoint, high end", (_name, low, mid, high, base) => {
    expect(liftAt(HEIGHTS, [], low, base)).toBeCloseTo(base * STEP);
    expect(liftAt(HEIGHTS, [], mid, base)).toBeCloseTo((base + 0.5) * STEP);
    expect(liftAt(HEIGHTS, [], high, base + 1)).toBeCloseTo((base + 1) * STEP);
  });

  it("does not depend on which of the ramp's layers the body is on", () => {
    expect(liftAt(HEIGHTS, [], { x: 370, y: 350 }, 1)).toBe(
      liftAt(HEIGHTS, [], { x: 370, y: 350 }, 0),
    );
  });

  it("leaves a layer the ramp does not join at its own height", () => {
    expect(liftAt(HEIGHTS, [], { x: 600, y: 260 }, 0)).toBe(0);
  });

  it("is the layer's height off every ramp", () => {
    expect(liftAt(HEIGHTS, [], { x: 600, y: 400 }, 1)).toBe(STEP);
    expect(liftAt(HEIGHTS, [], { x: 100, y: 100 }, 0)).toBe(0);
  });

  it("never steps on a walk from the ground to the deck", () => {
    const walked = 5;
    let last = 0;
    for (let x = 280; x <= 460; x += walked) {
      const layer = x < 300 ? 0 : 1;
      const lift = liftAt(HEIGHTS, [], { x, y: 350 }, layer);
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
    expect(drawn.slope).toEqual([
      { x: 300, y: 250 },
      { x: 440, y: 250 - STEP },
      { x: 440, y: 450 - STEP },
      { x: 300, y: 450 },
    ]);
    expect(drawn.side[2]).toEqual({ x: 440, y: 450 });
    expect(drawn.chevrons).toHaveLength(3);
  });

  it("makes a deck on a ground wall a slab, and leaves other decks solid", () => {
    const [bridge, platform] = HEIGHTS.decks;
    if (bridge === undefined || platform === undefined) throw new Error("no decks");
    const pillar = { kind: "rect" as const, layer: 0, x: 450, y: 420, width: 24, height: 24 };
    expect(deckSideLow(bridge, [pillar], 0)).toBe(STEP - DECK_SLAB);
    expect(deckSideLow(bridge, [], 0)).toBe(0);
    expect(deckSideLow(platform, [pillar], 0)).toBe(STEP);
  });
});

describe("structures with height", () => {
  const wall = { kind: "rect" as const, layer: 0, x: 150, y: 400, width: 100, height: 40 };
  const deck = {
    layer: 1,
    footprint: { kind: "rect" as const, x: 420, y: 250, width: 360, height: 200 },
    look: "platform" as const,
    switched: null,
  };
  const pillar = { kind: "rect" as const, layer: 0, x: 450, y: 420, width: 24, height: 24 };
  const structure: MapStructure = { ...FLAT_STRUCTURE, layerCount: 2, decks: [deck] };
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

describe("a level under the ground (#2973)", () => {
  const rect = (x: number, y: number, width: number, height: number) =>
    ({ kind: "rect", x, y, width, height }) as const;
  // Training Heights' pit and tunnel: the ground is layer 1, they are layer 0.
  const SUNK: MapStructure = {
    ...FLAT_STRUCTURE,
    layerCount: 3,
    bounds: { kind: "rect" },
    ground: 1,
    pits: [{ footprint: rect(500, 520, 200, 130) }],
    tunnels: [{ footprint: rect(700, 550, 280, 70) }],
    downDecks: [],
  };
  const STEP = ELEVATION_STEP;
  const occluders = occludersOf([], SUNK);
  // A body on layer 0 draws a step down.
  const hidden = (x: number, y: number, layer: number): number => {
    let count = 0;
    const drawnY = layer === 0 ? y + STEP : y;
    traceHiddenOutline(RING_PATH, x, drawnY, 10, layer, occluders, () => {
      count += 1;
    });
    return count;
  };

  it("hides a body in the tunnel, not one on the ground over it", () => {
    expect(hidden(840, 585, 0)).toBeGreaterThan(0);
    expect(hidden(840, 585, 1)).toBe(0);
  });

  it("hides a pit's body behind the near lip, and shows it in the open pit", () => {
    expect(hidden(600, 640, 0)).toBeGreaterThan(0);
    expect(hidden(600, 560, 0)).toBe(0);
  });

  it("names the pit's floor where it is drawn, and nothing above it", () => {
    const world = { x: 650, y: 600 };
    expect(surfacesAt(SUNK, world)).toEqual([{ layer: 0, point: { x: 650, y: 600 - STEP } }]);
    expect(pickSurface(SUNK, world, true)).toEqual({ layer: 0, point: { x: 650, y: 600 - STEP } });
  });

  it("names the ground over the tunnel, and the tunnel's floor with Alt", () => {
    const world = { x: 840, y: 610 };
    expect(pickSurface(SUNK, world, false)).toEqual({ layer: 1, point: world });
    expect(pickSurface(SUNK, world, true)).toEqual({ layer: 0, point: { x: 840, y: 610 - STEP } });
  });

  it("names the ground on the near lip, and the pit's floor behind it with Alt", () => {
    const world = { x: 600, y: 680 };
    expect(surfacesAt(SUNK, world)).toEqual([
      { layer: 1, point: world },
      { layer: 0, point: { x: 600, y: 680 - STEP } },
    ]);
  });

  it("draws the pit a step down, the tunnel's mouth at the foot of its east wall", () => {
    const [pit] = SUNK.pits;
    if (pit === undefined) throw new Error("no pit");
    const drawn = pitDrawing(SUNK, pit);
    expect(drawn.floor[0]).toEqual({ x: 500, y: 520 + STEP });
    expect(drawn.farWall[2]).toEqual({ x: 700, y: 520 + STEP });
    expect(drawn.mouths).toHaveLength(1);
    expect(drawn.mouths[0]?.[1]).toEqual({ x: 700, y: 550 + STEP });
    expect(drawn.mouths[0]?.[2]).toEqual({ x: 700, y: 620 + STEP });
  });

  it("covers the tunnel and the step south of it, where whoever is in it draws", () => {
    const [tunnel] = SUNK.tunnels;
    if (tunnel === undefined) throw new Error("no tunnel");
    const cover = tunnelCover(SUNK, tunnel);
    expect(cover[0]).toEqual({ x: 700, y: 550 });
    expect(cover[2]).toEqual({ x: 980, y: 620 + STEP });
  });

  it("lifts a ramp out of the pit from its floor to the ground", () => {
    const ramp = {
      from: 0,
      to: 1,
      area: rect(500, 545, 110, 80),
      uphill: "w",
      look: "ramp",
      lift: null,
    } as const;
    const withRamp = { ...SUNK, transitions: [ramp] };
    expect(liftAt(withRamp, [], { x: 610, y: 580 }, 0)).toBeCloseTo(-STEP);
    expect(liftAt(withRamp, [], { x: 555, y: 580 }, 1)).toBeCloseTo(-STEP / 2);
    expect(liftAt(SUNK, [], { x: 600, y: 580 }, 0)).toBe(-STEP);
  });
});

describe("trackAlt (#3020)", () => {
  /** An event of `type`, with Alt as given, as a key or pointer event carries it. */
  const event = (type: string, altKey: boolean): Event =>
    Object.assign(new Event(type), { altKey });

  it("follows Alt's own key events, with no pointer event between", () => {
    const target = new EventTarget();
    const alt = trackAlt(target);
    expect(alt.held()).toBe(false);
    target.dispatchEvent(event("keydown", true));
    expect(alt.held()).toBe(true);
    target.dispatchEvent(event("keyup", false));
    expect(alt.held()).toBe(false);
  });

  it("is not held after the window loses focus", () => {
    const target = new EventTarget();
    const alt = trackAlt(target);
    target.dispatchEvent(event("keydown", true));
    target.dispatchEvent(new Event("blur"));
    expect(alt.held()).toBe(false);
  });

  it("follows a pointer event, for Alt pressed outside the page", () => {
    const target = new EventTarget();
    const alt = trackAlt(target);
    target.dispatchEvent(event("pointermove", true));
    expect(alt.held()).toBe(true);
    target.dispatchEvent(event("pointerdown", false));
    expect(alt.held()).toBe(false);
  });

  it("follows nothing once disposed", () => {
    const target = new EventTarget();
    const alt = trackAlt(target);
    alt.dispose();
    target.dispatchEvent(event("keydown", true));
    expect(alt.held()).toBe(false);
  });
});

describe("drop-offs (#3069)", () => {
  const lip = { layer: 1, from: { x: 100, y: 200 }, to: { x: 200, y: 200 } };
  const cliff: MapStructure = { ...BRIDGE, dropOffs: [lip] };

  it("breaks the lip into notches either side of the edge, its ends on it", () => {
    const points = brokenLip(lip.from, lip.to);
    expect(points).toHaveLength(11);
    expect(points[0]).toEqual(lip.from);
    expect(points.at(-1)).toEqual(lip.to);
    expect(points.every((point) => Math.abs(point.y - 200) <= 3)).toBe(true);
    expect(new Set(points.map((point) => point.y)).size).toBe(3);
  });

  it("knows the ground just past a drop-off on its layer, and nowhere else", () => {
    expect(besideDropOff(cliff, { x: 150, y: 216 }, 1)).toBe(true);
    expect(besideDropOff(cliff, { x: 150, y: 216 }, 2)).toBe(false);
    expect(besideDropOff(cliff, { x: 150, y: 300 }, 1)).toBe(false);
    expect(besideDropOff(BRIDGE, { x: 150, y: 216 }, 1)).toBe(false);
  });
});

describe("a lift (#3079)", () => {
  const lift = {
    from: 0,
    to: 1,
    area: { kind: "rect", x: 680, y: 300, width: 120, height: 100 },
    uphill: "e",
    look: "lift",
    lift: { kind: "lever" },
  } as const;
  const structure: MapStructure = { ...FLAT_STRUCTURE, layerCount: 2, transitions: [lift] };

  it("draws a body on it at its platform's height, wherever it stands on it", () => {
    const halfway = [{ phase: "rising", progress: 0.5 }] as const;
    expect(liftAt(structure, halfway, { x: 690, y: 350 }, 0)).toBeCloseTo(ELEVATION_STEP / 2);
    expect(liftAt(structure, halfway, { x: 790, y: 350 }, 0)).toBeCloseTo(ELEVATION_STEP / 2);
    expect(liftAt(structure, [{ phase: "high", progress: 1 }], { x: 690, y: 350 }, 1)).toBe(
      ELEVATION_STEP,
    );
  });

  it("hides nothing: its platform moves", () => {
    expect(occludersOf([], structure)).toEqual([]);
  });
});

describe("the deck a body stands under (#3078)", () => {
  it("is the deck over a point under it, and none beside it or on it", () => {
    expect(overhangAt(BRIDGE, { x: 200, y: 150 }, 0)).toBe(BRIDGE.decks[0]);
    expect(overhangAt(BRIDGE, { x: 200, y: 250 }, 0)).toBeUndefined();
    expect(overhangAt(BRIDGE, { x: 200, y: 150 }, 1)).toBeUndefined();
  });

  it("is one deck under two stacked, so a body is shaded once", () => {
    const tower = { layer: 2, footprint: bridge, look: "tower", switched: null } as const;
    const stacked: MapStructure = { ...BRIDGE, layerCount: 3, decks: [...BRIDGE.decks, tower] };
    expect(overhangAt(stacked, { x: 200, y: 150 }, 0)).toBe(BRIDGE.decks[0]);
    expect(overhangAt(stacked, { x: 200, y: 150 }, 1)).toBe(tower);
  });

  it("is none on a map without decks", () => {
    expect(overhangAt(FLAT_STRUCTURE, { x: 200, y: 150 }, 0)).toBeUndefined();
  });
});

describe("the side of a raised column (#3157)", () => {
  it("is each south-facing edge swept from its foot up to its top (#3162)", () => {
    expect(sweptEdges(bridge, 0, 30)).toEqual([
      [
        { x: 300, y: 200 },
        { x: 100, y: 200 },
        { x: 100, y: 170 },
        { x: 300, y: 170 },
      ],
    ]);
  });

  it("starts a column raised off the ground at its low end", () => {
    const [first] = sweptEdges(bridge, 10, 30);
    expect(first?.map(({ y }) => y)).toEqual([190, 190, 170, 170]);
  });

  it("with the top, covers all the whole column covers, and no more (#3162)", () => {
    // An L with a notch in its south side and a slanted edge: every kind of corner.
    const shape = {
      kind: "polygon" as const,
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 60 },
        { x: 60, y: 60 },
        { x: 40, y: 100 },
        { x: 0, y: 100 },
      ],
    };
    const inside = (outline: readonly Vec2[], { x, y }: Vec2): boolean => {
      let hit = false;
      outline.forEach((a, k) => {
        const b = outline[(k + 1) % outline.length] ?? a;
        if (a.y > y !== b.y > y && x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)) {
          hit = !hit;
        }
      });
      return hit;
    };
    const lifted = (by: number) => shape.points.map(({ x, y }) => ({ x, y: y - by }));
    const [low, high] = [8, 40];
    const drawn = [lifted(high), ...sweptEdges(shape, low, high)];
    for (let y = -50; y <= 110; y += 1.5) {
      for (let x = -5; x <= 125; x += 1.5) {
        const point = { x, y };
        // The column: the shape at some lift between its foot and its top.
        let column = false;
        for (let lift = low; lift <= high && !column; lift += 0.25) {
          column = inside(lifted(lift), point);
        }
        expect(drawn.some((piece) => inside(piece, point)), `${String(x)},${String(y)}`).toBe(column);
      }
    }
  });
});
