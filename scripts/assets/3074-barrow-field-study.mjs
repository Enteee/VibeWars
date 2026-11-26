// Study for #3426 (part of #3074): Barrow Field, a moor of burial mounds, priest annihilation 8v8.
// Usage: node scripts/assets/3074-barrow-field-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3074-study-lib.mjs";

const MW = 5400,
  MH = 2600;
/** @typedef {[number, number]} Pt */
/** The far side of the field, for the second team's half of the routes (point mirror, then a nudge). */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0] + 24, MH - p[1] - 16]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));

// Wilds (visual-style §1): ground #2a3328, rock #5b5f58, moss #4f5e3c, earth #5a4630. The heather
// is the wilds' earth, the barrows its rock, so the moor is no new row.
const pal = {
  out: "#232a22",
  ground: "#2a3328",
  deck: "#7a7c70",
  deckL2: "#8f9084",
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

/** @type {[number, number][]} */
const outline = [
  [240, 1100],
  [520, 560],
  [1250, 260],
  [2150, 180],
  [3100, 220],
  [3900, 300],
  [4700, 620],
  [5160, 1100],
  [5200, 1500],
  [4880, 2060],
  [4150, 2420],
  [3250, 2400],
  [2300, 2440],
  [1400, 2360],
  [700, 2180],
  [300, 1700],
];

const shapes = [
  {
    id: "west barrow",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [1150, 520],
      [1650, 420],
      [1950, 560],
      [1980, 1000],
      [1500, 1120],
      [1180, 960],
    ]),
  },
  {
    id: "east barrow",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [4300, 2100],
      [3750, 2180],
      [3450, 2040],
      [3380, 1580],
      [3900, 1480],
      [4220, 1640],
    ]),
  },
  {
    id: "north barrow",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [3000, 420],
      [3500, 360],
      [3800, 560],
      [3700, 880],
      [3200, 900],
      [2950, 700],
    ]),
  },
  {
    id: "south barrow",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [2400, 2180],
      [1900, 2240],
      [1600, 2040],
      [1700, 1720],
      [2200, 1700],
      [2450, 1900],
    ]),
  },
  {
    id: "west cairn top",
    layer: 2,
    poly: /** @type {Pt[]} */ ([
      [1400, 640],
      [1750, 600],
      [1850, 760],
      [1600, 900],
      [1400, 820],
    ]),
  },
  {
    id: "east cairn top",
    layer: 2,
    poly: /** @type {Pt[]} */ ([
      [3600, 1700],
      [3950, 1640],
      [4050, 1900],
      [3750, 1960],
      [3600, 1820],
    ]),
  },
];

const stairs = [
  { id: "stair-w", r: rect(1450, 1120, 140, 100), from: 0 },
  { id: "stair-e", r: rect(3800, 1380, 140, 100), from: 0, north: true },
  { id: "stair-n", r: rect(3250, 900, 140, 100), from: 0 },
  { id: "stair-s", r: rect(2150, 1600, 140, 100), from: 0, north: true },
  { id: "top-stair-w", r: rect(1560, 900, 120, 80), from: 1 },
  { id: "top-stair-e", r: rect(3700, 1960, 120, 80), from: 1 },
];

const C1 = "C1",
  S1 = "S1",
  M = "M";
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["moor road", [C1, [1500, 1480], [2250, 1460], M]],
    ["barrow way", [C1, [950, 900], [1000, 760], [2050, 760], [2300, 980], M]],
    [
      "over the barrow",
      [C1, [1520, 1250], [1520, 1100], [1800, 900], [1960, 1000], [2250, 1180], M],
    ],
  ]),
};
const toShrine1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["moor road", ["C2", [3500, 1300], [2300, 1400], [1200, 1300], [900, 1100], S1]],
  ["south moor", ["C2", [3400, 1500], [2500, 1620], [1300, 1500], [800, 1300], S1]],
  ["barrow way", ["C2", [3600, 1000], [2300, 980], [2050, 760], [1000, 760], S1]],
]);

runStudy({
  id: "barrow-field",
  name: "Barrow Field",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "way-w",
      path: [
        [1000, 760],
        [2050, 760],
      ],
      w: 110,
      label: "west barrow way (tunnel)",
    },
    {
      id: "way-e",
      path: [
        [4400, 1840],
        [3350, 1840],
      ],
      w: 110,
      label: "east barrow way (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [2300, 2200],
        [2800, 2160],
        [3050, 2260],
        [2700, 2340],
        [2350, 2320],
      ],
      deep: false,
      label: "bog pool",
      at: [2380, 2380],
    },
    {
      poly: [
        [2500, 300],
        [3000, 280],
        [3100, 360],
        [2700, 420],
        [2450, 380],
      ],
      deep: false,
      label: "bog pool",
      at: [2480, 470],
    },
  ],
  zones: [
    { kind: "mire", cx: 1100, cy: 2000, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "spring", cx: 4300, cy: 560, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
  ],
  breakables: [{ r: rect(1790, 1260, 24, 200), label: "fallen stone (breakable)" }],
  gates: [
    { p: [1500, 760], label: "west gate" },
    { p: [3900, 1840], label: "east gate" },
  ],
  levers: [
    { p: [2050, 1950], layer: 1, label: "lever → west gate" },
    { p: [3350, 650], layer: 1, label: "lever → east gate" },
  ],
  lights: [
    { p: [1000, 760], r: 150 },
    { p: [2050, 760], r: 150 },
    { p: [4400, 1840], r: 150 },
    { p: [3350, 1840], r: 150 },
    { p: [1520, 1180], r: 150 },
    { p: [3870, 1440], r: 150 },
    { p: [3320, 960], r: 150 },
    { p: [2220, 1660], r: 150 },
    { p: [700, 980], r: 220 },
    { p: [4720, 1620], r: 220 },
    { p: [2700, 1300], r: 200 },
    { p: [2050, 1950], r: 140 },
    { p: [3350, 650], r: 140 },
  ],
  atmo: [
    { label: "fog bank (hollow)", cx: 1500, cy: 1650, rx: 300, ry: 120, col: "#c8d4e4", op: 0.24 },
    { label: "fog bank (hollow)", cx: 3900, cy: 1000, rx: 300, ry: 120, col: "#c8d4e4", op: 0.24 },
    { label: "fog bank (hollow)", cx: 2700, cy: 2000, rx: 280, ry: 100, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [{ r: rect(1200, 1240, 220, 70), label: "cairn shelter" }],
  drops: [
    { at: [1500, 540], e: 1 },
    { at: [3900, 2160], e: 1 },
    { at: [3500, 400], e: 1 },
    { at: [2000, 2210], e: 1 },
  ],
  props: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      kind: /** @type {"stone"} */ ("stone"),
      p: /** @type {Pt} */ ([
        2700 + Math.cos((i * Math.PI) / 4) * 330,
        1300 + Math.sin((i * Math.PI) / 4) * 200,
      ]),
      r: 34,
    })),
    ...[
      [800, 1500],
      [1300, 1950],
      [2300, 1050],
      [3100, 1500],
      [4300, 1000],
      [4700, 1900],
      [3000, 800],
      [2000, 2250],
      [900, 600],
    ].map((p) => ({
      kind: /** @type {"bush"} */ ("bush"),
      p: /** @type {Pt} */ (p),
      r: 38,
    })),
  ],
  spawns: { t1: seats(480, 1250, 120, 110, 8, 1), t2: seats(4920, 1020, 120, 110, 8, -1) },
  shrines: { t1: [700, 980], t2: [4720, 1620] },
  ghosts: { t1: [560, 780], t2: [4840, 1820] },
  extras: [
    { kind: "storm-beacon", p: [2700, 1300] },
    { kind: "flag-spawn", p: [900, 1700] },
    { kind: "flag-spawn", p: [4500, 900] },
  ],
  centre: [2700, 1300],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: {
    t1: toShrine1,
    t2: toShrine1.map(([n, r]) => [
      n,
      r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : m(p))),
    ]),
  },
  shrineCentre: { t1: [S1, [1400, 1250], M], t2: ["S2", ...[[1400, 1250], M].map(m)] },
  layerTitles: { 0: "L0 moor floor, barrow ways", 1: "L1 barrows", 2: "L2 cairn tops" },
  planNote:
    "plan 5400×2600. Dashed: spawn to centre (road, barrow way, over the barrow); dotted gold: shrine to centre.",
});
