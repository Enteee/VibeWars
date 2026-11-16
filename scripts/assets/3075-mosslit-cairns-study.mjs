/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3430 (part of #3075): Mosslit Cairns, glowing cairn hills, capture points 8v8.
// Usage: node scripts/assets/3075-mosslit-cairns-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5400,
  MH = 3000,
  AX = 2700; // the axis the five hills stand on: equidistant from both teams
/** @typedef {[number, number]} Pt */
/** The map is mirrored in x (west team, east team); north and south differ. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string" ? (p === "C1" ? "C2" : p === "C2" ? "C1" : p) : [MW - p[0], p[1]];
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

// The five hills, north to south: centre y, half width, half height. The point stands on each.
const hills = [
  { id: "north cairn", cy: 440, a: 380, b: 130 },
  { id: "moss cairn N", cy: 960, a: 430, b: 150 },
  { id: "great cairn", cy: 1500, a: 520, b: 200 },
  { id: "moss cairn S", cy: 2060, a: 430, b: 150 },
  { id: "south cairn", cy: 2560, a: 380, b: 130 },
];
/** @type {(cy: number, a: number, b: number) => Pt[]} */
const ellipse = (cy, a, b) =>
  /** @type {Pt[]} */ (
    Array.from({ length: 12 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2,
        r = 1 + 0.07 * Math.cos(2 * t);
      return [Math.round(AX + a * r * Math.cos(t)), Math.round(cy + b * r * Math.sin(t))];
    })
  );
const lane = (/** @type {number} */ i) => {
  const h0 = /** @type {{cy:number;b:number}} */ (hills[i]),
    h1 = /** @type {{cy:number;b:number}} */ (hills[i + 1]);
  return Math.round((h0.cy + h0.b + h1.cy - h1.b) / 2);
};

const shapes = [
  ...hills.map((h) => ({
    id: h.id,
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: ellipse(h.cy, h.a, h.b),
  })),
  { id: "cairn top", layer: 2, poly: ellipse(1500, 250, 110) },
  // side banks: the high ground each team holds a lane's length from the hills
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
  stairs.push({ id: `${i + 1}-w`, r: rect(AX - h.a - 90, h.cy - 110, 140, 100), from: 0 });
  stairs.push({ id: `${i + 1}-e`, r: rect(AX + h.a - 50, h.cy - 110, 140, 100), from: 0 });
  if (i > 0)
    stairs.push({
      id: `${i + 1}-n`,
      r: rect(AX - 70, h.cy - h.b - 100, 140, 100),
      from: 0,
      north: true,
    });
  if (i < 4) stairs.push({ id: `${i + 1}-s`, r: rect(AX - 70, h.cy + h.b, 140, 100), from: 0 });
});
stairs.push({ id: "top-w", r: rect(AX - 330, 1480, 120, 80), from: 1 });
stairs.push({ id: "top-e", r: rect(AX + 210, 1480, 120, 80), from: 1 });
stairs.push({ id: "top-n", r: rect(AX - 60, 1380, 120, 80), from: 1, north: true });
stairs.push({ id: "bank-w", r: rect(1620, 1330, 140, 100), from: 0 });
stairs.push({ id: "bank-e", r: rect(MW - 1760, 1330, 140, 100), from: 0 });

const M = "M";
const west = (/** @type {number} */ i) =>
  /** @type {Pt} */ ([
    AX - /** @type {{a:number}} */ (hills[i]).a - 20,
    /** @type {{cy:number}} */ (hills[i]).cy - 60,
  ]);
const pointOf = (/** @type {number} */ i) => `P${i + 1}`;
/** Spawn to point i: up the west stair, or from the lane beside it. */
const toPoint = (/** @type {number} */ i) => {
  const h = /** @type {{cy:number;b:number}} */ (hills[i]);
  const ln = i === 0 ? lane(0) : i === 4 ? lane(3) : i === 1 ? lane(1) : lane(i - 1);
  const stairY = i < 2 ? h.cy + h.b + 50 : h.cy - h.b - 50;
  return /** @type {[string, (Pt | string)[]][]} */ ([
    ["west stair", ["C1", [1500, 1500], west(i), pointOf(i)]],
    ["lane stair", ["C1", [1500, ln], [AX, ln], [AX, stairY], pointOf(i)]],
  ]);
};

const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["west stair", ["C1", [1500, 1500], west(2), M]],
  ["north lane", ["C1", [1400, lane(1)], [AX, lane(1)], [AX, 1280], [AX, 1400], M]],
  ["south lane", ["C1", [1400, lane(2)], [AX, lane(2)], [AX, 1720], [AX, 1600], M]],
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
        [2000, 2150],
        [3400, 2150],
      ],
      w: 110,
      label: "root tunnel",
    },
  ],
  water: [
    {
      poly: [
        [1250, 420],
        [1800, 380],
        [1950, 500],
        [1650, 600],
        [1300, 560],
      ],
      deep: false,
      label: "moss pool",
      at: [1250, 660],
    },
    {
      poly: xPoly([
        [1250, 420],
        [1800, 380],
        [1950, 500],
        [1650, 600],
        [1300, 560],
      ]),
      deep: false,
      label: "moss pool",
      at: [3700, 660],
    },
    {
      poly: [
        [1300, 2420],
        [1750, 2380],
        [1900, 2500],
        [1650, 2620],
        [1300, 2580],
      ],
      deep: true,
      label: "sink pool",
      at: [1250, 2700],
    },
    {
      poly: xPoly([
        [1300, 2420],
        [1750, 2380],
        [1900, 2500],
        [1650, 2620],
        [1300, 2580],
      ]),
      deep: true,
      label: "sink pool",
      at: [3700, 2700],
    },
  ],
  zones: [
    { kind: "spring", cx: 1100, cy: 2100, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 1100, cy: 2100, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 1000, cy: 900, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: MW - 1000, cy: 900, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [{ r: rect(1650, 1780, 24, 160), label: "root wall (breakable)" }],
  gates: [
    { p: [2000, 2150], label: "root gate W" },
    { p: [3400, 2150], label: "root gate E" },
  ],
  levers: [
    { p: [AX - 220, 960], layer: 1, label: "lever → both gates" },
    { p: [AX + 220, 960], layer: 1, label: "lever → both gates" },
  ],
  lights: [
    ...hills.map((h) => ({ p: /** @type {Pt} */ ([AX, h.cy]), r: 220, col: "#a98cff" })),
    { p: [2000, 2150], r: 150 },
    { p: [3400, 2150], r: 150 },
    { p: [700, 1000], r: 180 },
    { p: [MW - 700, 1000], r: 180 },
    { p: [AX - 220, 960], r: 130 },
    { p: [AX + 220, 960], r: 130 },
    { p: [1700, 1200], r: 160, col: "#a98cff" },
    { p: [MW - 1700, 1200], r: 160, col: "#a98cff" },
  ],
  atmo: [
    { label: "mist bank", cx: 1500, cy: 900, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "mist bank", cx: 3900, cy: 2200, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "mist bank", cx: AX, cy: 2800, rx: 300, ry: 100, col: "#c8d4e4", op: 0.18 },
  ],
  overhangs: [{ r: rect(1200, 1720, 220, 70), label: "root arch" }],
  drops: [
    { at: [AX, 310], e: 1 },
    { at: [AX, 2690], e: 1 },
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
  shrines: { t1: [700, 1000], t2: [MW - 700, 1000] },
  objectives: hills.map((h, i) => ({
    id: pointOf(i),
    kind: /** @type {"capture-point"} */ ("capture-point"),
    p: /** @type {Pt} */ ([AX, h.cy]),
    layer: i === 2 ? 2 : 1,
    label: `capture-point ${i + 1}`,
  })),
  centre: [AX, 1500],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: hills.map((_, i) => ({
    obj: pointOf(i),
    what: "spawn to point",
    t1: toPoint(i),
    t2: toPoint(i).map(([n, r]) => [n, mxr(r)]),
  })),
  layerTitles: { 0: "L0 lanes, root tunnel", 1: "L1 cairn hills, banks", 2: "L2 cairn top" },
  planNote:
    "plan 5400×3000. Dashed: spawn to the great cairn (west stair, north lane, south lane). Five points on the centre line.",
});
