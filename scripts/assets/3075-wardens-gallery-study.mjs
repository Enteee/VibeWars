/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3430 (part of #3075): The Warden's Gallery, a long sculpture gallery, capture points 8v8.
// Usage: node scripts/assets/3075-wardens-gallery-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5200,
  MH = 2500,
  AX = 2600, // the seven points stand on this line: equidistant from both teams
  CY = 1250;
/** @typedef {[number, number]} Pt */
/** Mirrored in x (west team, east team) and in y (north hall, south hall). */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string" ? (p === "C1" ? "C2" : p === "C2" ? "C1" : p) : [MW - p[0], p[1]];
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(poly: Pt[]) => Pt[]} */
const xPoly = (poly) => /** @type {Pt[]} */ (poly.map((p) => mx(p)));
/** @type {(poly: Pt[]) => Pt[]} */
const yPoly = (poly) => poly.map(([x, y]) => /** @type {Pt} */ ([x, MH - y]));

// Hall (visual-style §1): ground #26303f, deck #4b5a70, stone and steel, no plants.
const pal = {
  out: "#1a212c",
  ground: "#26303f",
  deck: "#6b7a90",
  deckL2: "#8896ab",
  face: "#3c485a",
  faceE: "#2f3947",
  mound: "#4b5a70",
  roof: "#5b6a80",
  roofFace: "#38445a",
  speck1: "#2e394a",
  speck2: "#34415a",
  outside: "#222b38",
  deep: "#0f1722",
  shore: "#8fb8d6",
  shallow: "#6f94b0",
};

/** @type {Pt[]} */
const outline = [
  [260, 400],
  [420, 190],
  [900, 150],
  [2600, 120],
  [4300, 150],
  [4780, 190],
  [4940, 400],
  [4960, 1250],
  [4940, 2100],
  [4780, 2310],
  [4300, 2350],
  [2600, 2380],
  [900, 2350],
  [420, 2310],
  [260, 2100],
  [240, 1250],
];

/** @type {(cx: number, cy: number, a: number, b: number, n?: number) => Pt[]} */
const ellipse = (cx, cy, a, b, n = 12) =>
  /** @type {Pt[]} */ (
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [Math.round(cx + a * Math.cos(t)), Math.round(cy + b * Math.sin(t))];
    })
  );

// The seven points, north to south, 300 apart. P2 and P6 stand on plinths (L1), P4 on the great
// plinth's top (L2); P1, P3, P5, P7 on open floor in a skylight ring.
const ys = [350, 650, 950, 1250, 1550, 1850, 2150];
const pointOf = (/** @type {number} */ i) => `P${i + 1}`;
const plinthHalf = { w: 240, h: 105 };
const plinths = [1, 5];

/** @type {{ id: string; layer: number; poly: Pt[]; look?: "bridge" | "mound" | "stone" | "wood"; label?: string }[]} */
const shapes = [
  ...plinths.map((i) => ({
    id: `plinth ${i + 1}`,
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: rect(AX - plinthHalf.w, /** @type {number} */ (ys[i]) - plinthHalf.h, 480, 210),
  })),
  {
    id: "great plinth",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: rect(AX - 340, CY - 160, 680, 320),
  },
  { id: "great plinth top", layer: 2, poly: rect(AX - 200, CY - 100, 400, 200) },
];
// Balconies: north-west, then mirrored to the north-east, south-west and south-east.
const balcNW = rect(1250, 190, 900, 220);
for (const poly of [balcNW, xPoly(balcNW), yPoly(balcNW), yPoly(xPoly(balcNW))])
  shapes.push({
    id: `balcony ${shapes.length - 3}`,
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly,
  });

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [];
for (const i of plinths) {
  const y = /** @type {number} */ (ys[i]);
  stairs.push({ id: `plinth${i + 1}-w`, r: rect(AX - 240 - 140, y - 50, 140, 100), from: 0 });
  stairs.push({ id: `plinth${i + 1}-e`, r: rect(AX + 240, y - 50, 140, 100), from: 0 });
  stairs.push({
    id: `plinth${i + 1}-n`,
    r: rect(AX - 70, y - 105 - 100, 140, 100),
    from: 0,
    north: true,
  });
  stairs.push({ id: `plinth${i + 1}-s`, r: rect(AX - 70, y + 105, 140, 100), from: 0 });
}
stairs.push({ id: "great-w", r: rect(AX - 340 - 140, CY - 50, 140, 100), from: 0 });
stairs.push({ id: "great-e", r: rect(AX + 340, CY - 50, 140, 100), from: 0 });
stairs.push({ id: "great-n", r: rect(AX - 70, CY - 160 - 100, 140, 100), from: 0, north: true });
stairs.push({ id: "great-s", r: rect(AX - 70, CY + 160, 140, 100), from: 0 });
stairs.push({ id: "great-top-w", r: rect(AX - 200 - 50, CY - 40, 100, 80), from: 1 });
stairs.push({ id: "great-top-e", r: rect(AX + 200 - 50, CY - 40, 100, 80), from: 1 });
// Balcony stairs: one at each end (spawn side and axis side), on the floor beside the end.
const balcStairs = /** @type {[string, Pt[]][]} */ ([
  ["balc-nw-out", rect(1110, 230, 140, 100)],
  ["balc-nw-in", rect(2150, 230, 140, 100)],
]);
for (const [id, r] of balcStairs) {
  stairs.push({ id, r, from: 0 });
  stairs.push({
    id: id.replace("nw", "ne"),
    r: r.map(([x, y]) => /** @type {Pt} */ ([MW - x, y])),
    from: 0,
  });
  stairs.push({
    id: id.replace("nw", "sw"),
    r: r.map(([x, y]) => /** @type {Pt} */ ([x, MH - y])),
    from: 0,
  });
  stairs.push({
    id: id.replace("nw", "se"),
    r: r.map(([x, y]) => /** @type {Pt} */ ([MW - x, MH - y])),
    from: 0,
  });
}

const M = "M";
/** Spawn to point i, two ways: along the point's own latitude, or down the nave and along the axis. */
const toPoint = (/** @type {number} */ i, /** @type {string | Pt} */ from = "C1") => {
  const y = /** @type {number} */ (ys[i]);
  const onPlinth = i === 1 || i === 5;
  const a = i === 3 ? 340 : onPlinth ? 240 : 0;
  const nave = /** @type {number} */ (ys[i < 3 ? i + 1 : i - 1]);
  return /** @type {[string, (Pt | string)[]][]} */ ([
    ["latitude approach", [from, [900, y], [AX - a - 160, y], pointOf(i)]],
    ["nave approach", [from, [1500, CY], [AX - 520, nave], [AX, nave], pointOf(i)]],
  ]);
};

const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["nave", ["C1", [1500, CY], [AX - 520, CY], M]],
  ["north hall", ["C1", [900, 800], [1800, 800], [AX - 520, 1050], M]],
  ["south hall", ["C1", [900, 1700], [1800, 1700], [AX - 520, 1450], M]],
]);

runStudy({
  id: "wardens-gallery",
  name: "The Warden's Gallery",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "undercroft-n",
      path: [
        [1100, 800],
        [4100, 800],
      ],
      w: 120,
      label: "north undercroft",
    },
    {
      id: "undercroft-s",
      path: [
        [1100, 1700],
        [4100, 1700],
      ],
      w: 120,
      label: "south undercroft",
    },
  ],
  water: [
    {
      poly: ellipse(1750, 1000, 170, 70, 10),
      deep: false,
      label: "reflecting pool",
      at: [1650, 1120],
    },
    {
      poly: xPoly(ellipse(1750, 1000, 170, 70, 10)),
      deep: false,
      label: "reflecting pool",
      at: [3450, 1120],
    },
    {
      poly: ellipse(1750, 1500, 170, 70, 10),
      deep: false,
      label: "reflecting pool",
      at: [1650, 1620],
    },
    {
      poly: xPoly(ellipse(1750, 1500, 170, 70, 10)),
      deep: false,
      label: "reflecting pool",
      at: [3450, 1620],
    },
  ],
  zones: [
    { kind: "spring", cx: 900, cy: 480, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 900, cy: 2020, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: MW - 900, cy: 480, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
    { kind: "mire", cx: 900, cy: 2020, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
  ],
  breakables: [
    { r: rect(1000, 1010, 24, 160), label: "toppled statue barricade (breakable)" },
    { r: rect(MW - 1024, 1330, 24, 160), label: "toppled statue barricade (breakable)" },
  ],
  gates: [
    { p: [1100, 800], label: "undercroft gate NW" },
    { p: [4100, 800], label: "undercroft gate NE" },
    { p: [1100, 1700], label: "undercroft gate SW" },
    { p: [4100, 1700], label: "undercroft gate SE" },
  ],
  levers: [
    { p: [AX - 160, 650], layer: 1, label: "lever → north gates" },
    { p: [AX + 160, 1850], layer: 1, label: "lever → south gates" },
  ],
  lights: [
    ...ys.map((y) => ({ p: /** @type {Pt} */ ([AX, y]), r: 240, col: "#fff1d6" })),
    { p: [1100, 800], r: 150 },
    { p: [4100, 800], r: 150 },
    { p: [1100, 1700], r: 150 },
    { p: [4100, 1700], r: 150 },
    { p: [620, CY], r: 190 },
    { p: [MW - 620, CY], r: 190 },
    { p: [AX - 160, 650], r: 130 },
    { p: [AX + 160, 1850], r: 130 },
  ],
  atmo: [
    { label: "dust in the light", cx: 1700, cy: 600, rx: 300, ry: 110, col: "#fff1d6", op: 0.14 },
    { label: "dust in the light", cx: 3500, cy: 1900, rx: 300, ry: 110, col: "#fff1d6", op: 0.14 },
    { label: "dust in the light", cx: 1500, cy: 1900, rx: 260, ry: 100, col: "#fff1d6", op: 0.12 },
  ],
  overhangs: [{ r: rect(1500, 1220, 240, 70), label: "hanging banner" }],
  drops: [
    { at: [1700, 410], e: 1 },
    { at: [3500, 2090], e: 1 },
    { at: [AX - 340, 1100], e: 1 },
    { at: [AX + 340, 1400], e: 1 },
  ],
  props: [
    ...[
      [1000, 600],
      [1000, 1900],
      [4200, 600],
      [4200, 1900],
      [AX - 700, 450],
      [AX + 700, 2050],
      [AX - 700, 1250],
      [AX + 700, 1250],
    ].map((p) => ({ kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (p), r: 36 })),
    ...[
      [1300, 1250],
      [3900, 1250],
      [AX - 300, 280],
      [AX + 300, 2220],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 38 })),
  ],
  spawns: { t1: seats(300, 1070, 120, 110, 8, 1), t2: seats(MW - 300, 1070, 120, 110, 8, -1) },
  shrines: { t1: [620, CY], t2: [MW - 620, CY] },
  objectives: ys.map((y, i) => ({
    id: pointOf(i),
    kind: /** @type {"capture-point"} */ ("capture-point"),
    p: /** @type {Pt} */ ([AX, y]),
    layer: i === 3 ? 2 : i === 1 || i === 5 ? 1 : 0,
    label: `capture-point ${i + 1}`,
  })),
  centre: [AX, CY],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: ys.map((_, i) => ({
    obj: pointOf(i),
    what: "8v8 spawn to point",
    t1: toPoint(i),
    t2: toPoint(i).map(([n, r]) => [n, mxr(r)]),
  })),
  layerTitles: {
    0: "L0 nave, side halls, undercrofts",
    1: "L1 plinths, balconies, great plinth",
    2: "L2 great plinth top",
  },
  planNote:
    "plan 5200×2500. Dashed: spawn to the great plinth (nave, north hall, south hall). Seven points on the centre line.",
});
