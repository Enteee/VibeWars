/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3430 (part of #3075): Mosslit Cairns, glowing cairn hills, capture points 8v8.
// Usage: node scripts/assets/3075-mosslit-cairns-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5400,
  MH = 3000,
  AX = 2700; // the great cairn stands on this axis; the other four hills are mirrored pairs
/** @typedef {[number, number]} Pt */
/** The map is mirrored in x (west team, east team); north and south differ. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string"
    ? ({ C1: "C2", C2: "C1", P1: "P2", P2: "P1", P4: "P5", P5: "P4" }[p] ?? p)
    : [MW - p[0], p[1]];
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(poly: Pt[]) => Pt[]} */
const xPoly = (poly) => /** @type {Pt[]} */ (poly.map((p) => mx(p)));

// Wilds (visual-style §1): ground #2a3328, rock #5b5f58, moss #4f5e3c, earth #5a4630. The glow is
// light only (violet, cold is magic): no tone near a signal hue.
const pal = {
  out: "#232a22",
  ground: "#2a3328",
  deck: "#7a7c70",
  deckL2: "#9a9c8e",
  face: "#4b4e46",
  faceE: "#383b35",
  mound: "#566044",
  roof: "#6a6a58",
  roofFace: "#44443a",
  plant: "#4f5e3c",
  plantLit: "#6a7a50",
  speck1: "#3b4636",
  speck2: "#4a3a2a",
  outside: "#343d31",
};

/** @type {Pt[]} */
const outline = [
  [240, 1100],
  [560, 520],
  [1300, 220],
  [2300, 160],
  [3100, 160],
  [4100, 220],
  [4840, 520],
  [5160, 1100],
  [5200, 1900],
  [4840, 2500],
  [4100, 2780],
  [3100, 2850],
  [2300, 2850],
  [1300, 2780],
  [560, 2500],
  [200, 1900],
];

// The five hills. The great cairn (P3) is the centre point; P1/P2 (north) and P4/P5 (south) are two
// mirrored pairs, each pair one hill nearer each base: P1 and P4 are team 1's, P2 and P5 team 2's.
const HX = 1600; // a west hill's centre x; the east hill is its x mirror
const hills = [
  { id: "NW cairn", cx: HX, cy: 760, a: 400, b: 140 },
  { id: "NE cairn", cx: MW - HX, cy: 760, a: 400, b: 140 },
  { id: "great cairn", cx: AX, cy: 1500, a: 520, b: 200 },
  { id: "SW cairn", cx: HX, cy: 2240, a: 440, b: 150 },
  { id: "SE cairn", cx: MW - HX, cy: 2240, a: 440, b: 150 },
];
/** @type {(h: { cx: number; cy: number; a: number; b: number }) => Pt[]} */
const ellipse = ({ cx, cy, a, b }) =>
  /** @type {Pt[]} */ (
    Array.from({ length: 12 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2,
        r = 1 + 0.07 * Math.cos(2 * t);
      return [Math.round(cx + a * r * Math.cos(t)), Math.round(cy + b * r * Math.sin(t))];
    })
  );
const NL = 1000, // north lane y (south of the north hills)
  SL = 2000; // south lane y (north of the south hills)

const shapes = [
  ...hills.map((h) => ({
    id: h.id,
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: ellipse(h),
  })),
  { id: "cairn top", layer: 2, poly: ellipse({ cx: AX, cy: 1500, a: 250, b: 110 }) },
  // side banks: the high ground each team holds beside the north lane
  {
    id: "west moss bank",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [1500, 1100],
      [1900, 1060],
      [2000, 1180],
      [1900, 1300],
      [1500, 1330],
      [1380, 1200],
    ]),
  },
];
shapes.push({
  id: "east moss bank",
  layer: 1,
  look: "mound",
  poly: xPoly(/** @type {Pt[]} */ (shapes[shapes.length - 1]?.poly)),
});

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [];
hills.forEach((h, i) => {
  const k = i + 1;
  stairs.push({ id: `${k}-w`, r: rect(h.cx - h.a - 90, h.cy - 110, 140, 100), from: 0 });
  stairs.push({ id: `${k}-e`, r: rect(h.cx + h.a - 50, h.cy - 110, 140, 100), from: 0 });
  if (h.cy > 1000)
    stairs.push({
      id: `${k}-n`,
      r: rect(h.cx - 70, h.cy - h.b - 100, 140, 100),
      from: 0,
      north: true,
    });
  if (h.cy < 2000) stairs.push({ id: `${k}-s`, r: rect(h.cx - 70, h.cy + h.b, 140, 100), from: 0 });
});
stairs.push({ id: "top-w", r: rect(AX - 330, 1480, 120, 80), from: 1 });
stairs.push({ id: "top-e", r: rect(AX + 210, 1480, 120, 80), from: 1 });
stairs.push({ id: "top-n", r: rect(AX - 60, 1380, 120, 80), from: 1, north: true });
stairs.push({ id: "bank-w", r: rect(1620, 1330, 140, 100), from: 0 });
stairs.push({ id: "bank-e", r: rect(MW - 1760, 1330, 140, 100), from: 0 });

const M = "M";
const pointOf = (/** @type {number} */ i) => `P${i + 1}`;
const hillW = (/** @type {number} */ i) => {
  const h = /** @type {{cx:number;cy:number;a:number}} */ (hills[i]);
  return /** @type {Pt} */ ([h.cx - h.a - 20, h.cy - 60]);
};
/** Spawn to hill i, two ways: by its outer (west) stair, or from the lane beside it. */
const toPoint = (/** @type {number} */ i) => {
  const h = /** @type {{cx:number;cy:number;b:number}} */ (hills[i]);
  const north = h.cy < 1500;
  const ln = north ? NL : SL;
  const far = h.cx > AX;
  /** @type {(Pt | string)[]} */
  const outer = far
    ? [
        "C1",
        north ? [1100, 500] : [1100, 2600],
        north ? [AX, 500] : [AX, 2600],
        hillW(i),
        pointOf(i),
      ]
    : ["C1", [1100, h.cy - 60], hillW(i), pointOf(i)];
  return /** @type {[string, (Pt | string)[]][]} */ ([
    [far ? "outer rim" : "west stair", outer],
    [
      "lane stair",
      ["C1", [1300, ln], [h.cx, ln], [h.cx, north ? h.cy + h.b + 50 : h.cy - h.b - 50], pointOf(i)],
    ],
  ]);
};

const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["west stair", ["C1", [1500, 1500], [AX - 600, 1540], M]],
  ["north lane", ["C1", [1300, NL], [AX, NL], [AX, 1280], [AX, 1400], M]],
  ["south lane", ["C1", [1300, SL], [AX, SL], [AX, 1720], [AX, 1600], M]],
]);

runStudy({
  id: "mosslit-cairns",
  name: "Mosslit Cairns",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "root-tunnel",
      path: [
        [2250, 2150],
        [3150, 2150],
      ],
      w: 110,
      label: "root tunnel",
    },
  ],
  water: [
    {
      poly: /** @type {Pt[]} */ (
        Array.from({ length: 10 }, (_, i) => [
          Math.round(AX + 260 * Math.cos((i / 10) * Math.PI * 2)),
          Math.round(330 + 70 * Math.sin((i / 10) * Math.PI * 2)),
        ])
      ),
      deep: false,
      label: "moss pool",
      at: [AX - 100, 440],
    },
    {
      poly: /** @type {Pt[]} */ (
        Array.from({ length: 10 }, (_, i) => [
          Math.round(AX + 240 * Math.cos((i / 10) * Math.PI * 2)),
          Math.round(2790 + 55 * Math.sin((i / 10) * Math.PI * 2)),
        ])
      ),
      deep: true,
      label: "sink pool",
      at: [AX - 100, 2720],
    },
  ],
  zones: [
    { kind: "spring", cx: 700, cy: 2650, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 900, cy: 1130, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "spring", cx: MW - 700, cy: 2650, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: MW - 900, cy: 1130, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [
    { r: rect(1650, 1760, 24, 140), label: "root wall (breakable)" },
    { r: rect(MW - 1674, 1760, 24, 140), label: "root wall (breakable)" },
  ],
  gates: [
    { p: [2250, 2150], label: "root gate W" },
    { p: [3150, 2150], label: "root gate E" },
  ],
  levers: [
    { p: [HX - 120, 720], layer: 1, label: "lever → both gates" },
    { p: [MW - HX + 120, 720], layer: 1, label: "lever → both gates" },
  ],
  lights: [
    ...hills.map((h) => ({ p: /** @type {Pt} */ ([h.cx, h.cy]), r: 220, col: "#a98cff" })),
    { p: [2250, 2150], r: 150 },
    { p: [3150, 2150], r: 150 },
    { p: [700, 2300], r: 180 },
    { p: [MW - 700, 2300], r: 180 },
    { p: [HX - 120, 720], r: 130 },
    { p: [MW - HX + 120, 720], r: 130 },
    { p: [1700, 1200], r: 160, col: "#a98cff" },
    { p: [MW - 1700, 1200], r: 160, col: "#a98cff" },
  ],
  atmo: [
    { label: "mist bank", cx: 1500, cy: 1750, rx: 300, ry: 100, col: "#c8d4e4", op: 0.2 },
    { label: "mist bank", cx: MW - 1500, cy: 1750, rx: 300, ry: 100, col: "#c8d4e4", op: 0.2 },
    { label: "mist bank", cx: AX, cy: 2550, rx: 300, ry: 90, col: "#c8d4e4", op: 0.18 },
  ],
  overhangs: [{ r: rect(1200, 1720, 220, 70), label: "root arch" }],
  drops: [
    { at: [HX, 620], e: 1 },
    { at: [MW - HX, 2400], e: 1 },
    { at: [AX - 420, 1700], e: 1 },
    { at: [AX + 420, 1300], e: 1 },
  ],
  props: [
    ...[
      [900, 1700],
      [1300, 700],
      [1500, 2200],
      [4100, 700],
      [3900, 1800],
      [4500, 2300],
      [AX - 120, 200],
      [AX + 140, 2800],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 40 })),
    ...[
      [800, 1300],
      [1000, 2500],
      [4400, 1300],
      [4600, 600],
      [2000, 800],
      [3400, 2400],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 40 })),
  ],
  spawns: { t1: seats(480, 1330, 120, 110, 8, 1), t2: seats(4920, 1330, 120, 110, 8, -1) },
  shrines: { t1: [700, 2300], t2: [MW - 700, 2300] },
  objectives: hills.map((h, i) => ({
    id: pointOf(i),
    kind: /** @type {"capture-point"} */ ("capture-point"),
    p: /** @type {Pt} */ ([h.cx, h.cy]),
    layer: i === 2 ? 2 : 1,
    label: `capture-point ${i + 1}`,
  })),
  centre: [AX, 1500],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: [
    // Parity is per mirrored pair: team 1 to its own home hill, team 2 to its own.
    ...[
      [0, "home hill, north"],
      [3, "home hill, south"],
    ].map(([i, what]) => ({
      obj: pointOf(/** @type {number} */ (i)),
      what: `spawn to own ${what}`,
      t1: toPoint(/** @type {number} */ (i)),
      t2: toPoint(/** @type {number} */ (i)).map(([n, r]) => [n, mxr(r)]),
    })),
    ...[
      [1, "far hill, north"],
      [4, "far hill, south"],
    ].map(([i, what]) => ({
      obj: pointOf(/** @type {number} */ (i)),
      what: `spawn to the ${what}`,
      t1: toPoint(/** @type {number} */ (i)),
      t2: toPoint(/** @type {number} */ (i)).map(([n, r]) => [n, mxr(r)]),
    })),
  ],
  layerTitles: { 0: "L0 lanes, root tunnel", 1: "L1 cairn hills, banks", 2: "L2 cairn top" },
  planNote:
    "plan 5400×3000. Dashed: spawn to the great cairn (west stair, north lane, south lane). The centre point and two mirrored pairs, one hill nearer each base.",
});
