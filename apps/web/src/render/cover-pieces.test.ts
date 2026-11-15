import { describe, expect, it } from "vitest";

import { clipToBox, coverPieces, liftedCovers, outlineArea } from "./cover-pieces.js";

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
