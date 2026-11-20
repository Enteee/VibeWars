import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { MapStructure } from "./arena-snapshot.js";
import {
  EVERYWHERE,
  clipToBox,
  coverPieces,
  liftedCovers,
  opaqueDeckCovers,
  outlineArea,
  wallPieces,
} from "./cover-pieces.js";
import { deckCovers } from "./layer-surfaces.js";
import { ELEVATION_STEP } from "./render-order.js";

describe("clipToBox (#3350)", () => {
  const BOX = { left: 0, top: 0, right: 100, bottom: 100 };
  const square = (left: number, top: number, size: number) => [
    { x: left, y: top },
    { x: left + size, y: top },
    { x: left + size, y: top + size },
    { x: left, y: top + size },
  ];

  it("keeps an outline inside the box whole", () => {
    expect(clipToBox(square(10, 10, 50), BOX)).toEqual(square(10, 10, 50));
  });

  it("is nothing of an outline outside the box", () => {
    expect(clipToBox(square(200, 10, 50), BOX)).toEqual([]);
  });

  it("cuts an outline that crosses the box at its side", () => {
    expect(outlineArea(clipToBox(square(50, 50, 100), BOX))).toBe(2500);
  });

  it("clips a concave outline to what of it is inside", () => {
    // A U: two prongs joined at the bottom, cut by the box through both.
    const u = [
      { x: 20, y: 50 },
      { x: 40, y: 50 },
      { x: 40, y: 150 },
      { x: 60, y: 150 },
      { x: 60, y: 50 },
      { x: 80, y: 50 },
      { x: 80, y: 200 },
      { x: 20, y: 200 },
    ];
    expect(outlineArea(clipToBox(u, BOX))).toBe(2000);
  });
});

describe("coverPieces (#3352)", () => {
  // A deck with a notch out of its south edge, the way Sandstone Steps' terraces have them.
  const DECK = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 400 },
    { x: 400, y: 400 },
    { x: 400, y: 300 },
    { x: 300, y: 300 },
    { x: 300, y: 400 },
    { x: 0, y: 400 },
  ];
  const WITHIN = { left: -1000, top: -1000, right: 2000, bottom: 2000 };
  const COVERS = [
    { tunnel: 0, box: { left: 100, top: 200, right: 200, bottom: 700 } },
    { tunnel: 1, box: { left: 0, top: 100, right: 900, bottom: 160 } },
  ];
  const area = (pieces: ReturnType<typeof coverPieces>, tunnel: number | undefined) =>
    pieces
      .filter((piece) => piece.tunnel === tunnel)
      .reduce((sum, { outline }) => sum + outlineArea(outline), 0);

  it("is the outline whole, in the whole of `within`, when no cover meets it", () => {
    const pieces = coverPieces(DECK, WITHIN, [
      { tunnel: 0, box: { left: 700, top: 0, right: 800, bottom: 400 } },
    ]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ tunnel: undefined, box: WITHIN, outline: DECK });
    expect(pieces[0]?.shore).toHaveLength(DECK.length);
  });

  it("cuts a deck over two tunnels into pieces whose areas sum to the whole", () => {
    const pieces = coverPieces(DECK, WITHIN, COVERS);
    expect(area(pieces, 0)).toBeCloseTo(100 * 200);
    expect(area(pieces, 1)).toBeCloseTo(600 * 60);
    expect(area(pieces, 0) + area(pieces, 1) + area(pieces, undefined)).toBeCloseTo(
      outlineArea(DECK),
    );
  });

  it("tiles `within` with the pieces' boxes, none overlapping", () => {
    const pieces = coverPieces(DECK, WITHIN, COVERS);
    const boxArea = ({ left, top, right, bottom }: (typeof pieces)[number]["box"]) =>
      (right - left) * (bottom - top);
    expect(pieces.reduce((sum, { box }) => sum + boxArea(box), 0)).toBe(boxArea(WITHIN));
  });

  it("strokes only the deck's own edge, never a cut one", () => {
    for (const piece of coverPieces(DECK, WITHIN, COVERS)) {
      for (const [a, b] of piece.shore) {
        // A corner the clip doubled is an edge of no length, which strokes nothing.
        const cutX = a.x === b.x && a.y !== b.y && [100, 200].includes(a.x);
        const cutY = a.y === b.y && a.x !== b.x && [100, 160, 200].includes(a.y);
        expect(cutX || cutY).toBe(false);
      }
    }
  });
});

describe("liftedCovers (#3352)", () => {
  // A layer's step, as `elevationOf` draws it, and a tunnel 80 deep whose
  // cover box reaches the step south of it where a body in it draws.
  const STEP = 56;
  const TUNNEL = { left: 0, top: 100, right: 400, bottom: 180 };
  const COVER = { tunnel: 0, box: { ...TUNNEL, bottom: TUNNEL.bottom + STEP } };
  const DECK = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 500 },
    { x: 0, y: 500 },
  ];
  const WITHIN = { left: -1000, top: -1000, right: 2000, bottom: 2000 };
  const at = (pieces: ReturnType<typeof coverPieces>, x: number, y: number) =>
    pieces.find(({ box }) => x > box.left && x < box.right && y > box.top && y < box.bottom);

  for (const layers of [1, 2]) {
    it(`fades the deck rows ${String(layers)} layer(s) up that draw over a body in the tunnel`, () => {
      const lift = layers * STEP;
      const pieces = coverPieces(DECK, WITHIN, liftedCovers([COVER], lift));
      // A body across the tunnel draws a step down; the deck row drawn over it is `lift` south.
      for (let row = TUNNEL.top + 1; row < TUNNEL.bottom; row += 10) {
        expect(at(pieces, 200, row + STEP + lift)?.tunnel).toBe(0);
      }
      // Straight over the tunnel fades too, and past the drawn body nothing does.
      expect(at(pieces, 200, TUNNEL.top + 1)?.tunnel).toBe(0);
      expect(at(pieces, 200, TUNNEL.bottom + STEP + lift + 1)?.tunnel).toBeUndefined();
    });
  }
});

describe("wallPieces (#3418)", () => {
  // A wall a layer's step up and as tall, over a tunnel whose cover box
  // reaches a step south of it, where a body in it draws.
  const STEP = 56;
  const BASE = STEP;
  const TOP = 2 * STEP;
  const TUNNEL = { left: 1000, top: 400, right: 1400, bottom: 480 };
  const COVER = { tunnel: 0, box: { ...TUNNEL, bottom: TUNNEL.bottom + STEP } };
  const wall = (left: number, right: number, top = 420, bottom = 460) => [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  // What the wall's art covers as drawn, its lifts taken off.
  const drawn = (outline: ReturnType<typeof wall>) => {
    const [north, south] = [outline[0]?.y ?? 0, outline[2]?.y ?? 0];
    return wall(outline[0]?.x ?? 0, outline[1]?.x ?? 0, north - TOP, south - BASE);
  };
  const share = (
    outline: ReturnType<typeof wall>,
    pieces: ReturnType<typeof wallPieces>,
    tunnel: number | undefined,
  ) =>
    pieces
      .filter((piece) => piece.tunnel === tunnel)
      .reduce((sum, { box }) => sum + outlineArea(clipToBox(drawn(outline), box)), 0);

  it("is one piece, the whole plane, for a wall over no cover", () => {
    expect(wallPieces(wall(0, 400), BASE, TOP, [COVER])).toEqual([
      { tunnel: undefined, box: EVERYWHERE },
    ]);
  });

  it("puts a wall wholly over the cover all in its tunnel's pieces", () => {
    const outline = wall(1100, 1300);
    const pieces = wallPieces(outline, BASE, TOP, [COVER]);
    expect(share(outline, pieces, 0)).toBeCloseTo(outlineArea(drawn(outline)));
    expect(share(outline, pieces, undefined)).toBe(0);
  });

  for (const [crossing, left, right] of [
    ["one edge", 800, 1200],
    ["two edges", 800, 1600],
  ] as const) {
    it(`splits a wall crossing ${crossing} of the cover into pieces whose areas sum to the whole`, () => {
      const outline = wall(left, right);
      const pieces = wallPieces(outline, BASE, TOP, [COVER]);
      const over = share(outline, pieces, 0);
      expect(over).toBeCloseTo(
        outlineArea(clipToBox(drawn(outline), { ...COVER.box, top: COVER.box.top - TOP })),
      );
      expect(over + share(outline, pieces, undefined)).toBeCloseTo(outlineArea(drawn(outline)));
    });
  }

  it("gives each part of a wall over two tunnels to the cover it lies over", () => {
    const other = { tunnel: 1, box: { ...COVER.box, left: 1600, right: 2000 } };
    const outline = wall(1200, 1800);
    const pieces = wallPieces(outline, BASE, TOP, [COVER, other]);
    expect(share(outline, pieces, 0)).toBeCloseTo(200 * (460 - BASE - (420 - TOP)));
    expect(share(outline, pieces, 1)).toBeCloseTo(200 * (460 - BASE - (420 - TOP)));
  });

  it("fades the wall's top drawn over a body in the tunnel, and its face", () => {
    const pieces = wallPieces(wall(800, 1600), BASE, TOP, [COVER]);
    const at = (x: number, y: number) =>
      pieces.find(({ box }) => x > box.left && x < box.right && y > box.top && y < box.bottom);
    expect(at(1200, 420 - TOP + 1)?.tunnel).toBe(0);
    expect(at(1200, 460 - BASE - 1)?.tunnel).toBe(0);
    expect(at(900, 420 - TOP + 1)?.tunnel).toBeUndefined();
  });
});

describe("opaqueDeckCovers (#3686)", () => {
  /** A deck a step over the ground, 600 wide, from (200, 200); the ground over a pit. */
  const DECK = {
    layer: 2,
    footprint: { kind: "rect", x: 200, y: 200, width: 600, height: 200 },
    look: "platform",
    switched: null,
  } as const;
  const STRUCTURE: MapStructure = {
    layerCount: 3,
    biome: "hall",
    ascentAct: null,
    bounds: { kind: "rect" },
    ground: 1,
    pits: [],
    tunnels: [],
    dropOffs: [],
    downDecks: [],
    overhangs: [],
    decks: [DECK],
    transitions: [],
    water: [],
    zones: [],
  };
  // The ground, drawn under every deck.
  const DEPTH = 0;
  const hidden = (structure: MapStructure, point: Vec2): boolean =>
    opaqueDeckCovers(structure, [], DEPTH).some((outline) => pointInPolygon(point, outline));
  // Under the deck's top, drawn a step up.
  const under = (x: number): Vec2 => ({ x, y: 300 - ELEVATION_STEP });

  it("hides what a deck that is up hides", () => {
    expect(opaqueDeckCovers(STRUCTURE, [], DEPTH)).toEqual(deckCovers(STRUCTURE, [], DEPTH));
    expect(hidden(STRUCTURE, under(500))).toBe(true);
  });

  it("hides nothing under an arch, whose top fades over a body under it", () => {
    const arch = { ...STRUCTURE, decks: [{ ...DECK, look: "arch" } as const] };
    expect(opaqueDeckCovers(arch, [], DEPTH)).toEqual([]);
  });

  it("hides nothing under a deck gone down", () => {
    const down: MapStructure = {
      ...STRUCTURE,
      decks: [
        {
          ...DECK,
          switched: {
            at: 0,
            up: false,
            whenDown: "fall",
            hinge: null,
            afterCrossings: null,
            cracks: 0,
          },
        },
      ],
    };
    expect(opaqueDeckCovers(down, [], DEPTH)).toEqual([]);
  });

  it("hides nothing where the deck is cut away with a tunnel's cover, the rest still", () => {
    const tunnel = { footprint: { kind: "rect", x: 450, y: 0, width: 100, height: 600 } } as const;
    const tunnelled = { ...STRUCTURE, tunnels: [tunnel] };
    expect(hidden(tunnelled, under(500))).toBe(false);
    // Up to as far east and west as the cover reaches, and no further.
    expect(hidden(tunnelled, under(440))).toBe(true);
    expect(hidden(tunnelled, under(560))).toBe(true);
  });
});
