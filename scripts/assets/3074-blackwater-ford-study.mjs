// Study for #3426 (part of #3074): Blackwater Ford, a dark river ford with a mill on piers, priest annihilation 8v8.
// Usage: node scripts/assets/3074-blackwater-ford-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3074-study-lib.mjs";

const MW = 5200,
  MH = 2800;
/** @typedef {[number, number]} Pt */
/** The far bank, for the second team: point mirror, then a nudge. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0] + 24, MH - p[1] - 16]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));

// Proposed biome `marsh` (visual-style §1 row): ground #2a3430 (the wilds' ground, a breath teal),
// rock #54594f, reed #5c5a3a (a dry olive, hue ~55 deg, low chroma) and silt #4a4034. No tone is
// near the friend blue, the foe red or the nature green; the water is the shared deep and shallow look.
const pal = {
  out: "#222a27",
  ground: "#2a3430",
  deck: "#7a7a6c",
  deckL2: "#8d8d7e",
  face: "#4b4d44",
  faceE: "#393b34",
  mound: "#5a5a46",
  roof: "#6a6350",
  roofFace: "#443f33",
  plant: "#5c5a3a",
  plantLit: "#77744a",
  speck1: "#36433d",
  speck2: "#4a4034",
  outside: "#2f3a35",
};

/** @type {Pt[]} */
const west = [
  [2600, 140],
  [1800, 170],
  [1000, 300],
  [420, 640],
  [200, 1200],
  [230, 1900],
  [560, 2400],
  [1300, 2620],
  [2000, 2660],
  [2600, 2660],
];
/** @type {Pt[]} */
const outline = [...west, ...west.map((p) => /** @type {Pt} */ (m(p)))];

const shapes = [
  {
    id: "west approach",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [1500, 1280],
      [2000, 1280],
      [2380, 1330],
      [2380, 1490],
      [2000, 1540],
      [1500, 1540],
    ]),
  },
  {
    id: "east approach",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [2820, 1330],
      [3200, 1290],
      [3760, 1260],
      [3760, 1500],
      [3200, 1560],
      [2820, 1500],
    ]),
  },
  {
    id: "mill deck",
    layer: 1,
    look: /** @type {"wood"} */ ("wood"),
    poly: /** @type {Pt[]} */ ([
      [2380, 1260],
      [2820, 1260],
      [2830, 1560],
      [2370, 1560],
    ]),
  },
  {
    id: "north-west quay",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [1500, 560],
      [1980, 520],
      [2200, 640],
      [2150, 780],
      [1500, 800],
    ]),
  },
  {
    id: "south-east wharf",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [3200, 1960],
      [3750, 1900],
      [3900, 2100],
      [3300, 2200],
    ]),
  },
  {
    id: "mill loft",
    layer: 2,
    poly: /** @type {Pt[]} */ ([
      [2480, 1320],
      [2740, 1320],
      [2740, 1480],
      [2480, 1480],
    ]),
  },
];

const stairs = [
  { id: "stair-wa-s", r: rect(1900, 1540, 140, 100), from: 0 },
  { id: "stair-wa-n", r: rect(1900, 1180, 140, 100), from: 0, north: true },
  { id: "stair-ea-s", r: rect(3000, 1560, 140, 100), from: 0 },
  { id: "stair-ea-n", r: rect(3250, 1160, 140, 100), from: 0, north: true },
  { id: "stair-nwq", r: rect(1700, 800, 140, 100), from: 0 },
  { id: "stair-sew", r: rect(3400, 1800, 140, 100), from: 0, north: true },
  { id: "loft-stair", r: rect(2540, 1480, 120, 80), from: 1 },
];

const C1 = "C1",
  S1 = "S1",
  M = "M";
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["bridge road", [C1, [1400, 1650], [1970, 1620], [2200, 1410], M]],
    ["culvert", [C1, [1600, 1720], [1750, 1650], [1750, 1160], [1970, 1220], [2200, 1410], M]],
    ["south ford", [C1, [1500, 2050], [2600, 1990], [3070, 1700], [3070, 1600], [3000, 1450], M]],
  ]),
};
const toShrine1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["north ford", ["C2", [3600, 870], [2600, 830], [1500, 900], S1]],
  [
    "bridge",
    [
      "C2",
      [3800, 1180],
      [3320, 1200],
      [3000, 1400],
      M,
      [2200, 1410],
      [1970, 1620],
      [1300, 1500],
      S1,
    ],
  ],
  ["south ford", ["C2", [3700, 1700], [3300, 2000], [2600, 1990], [1500, 1900], [1000, 1300], S1]],
]);

runStudy({
  id: "blackwater-ford",
  name: "Blackwater Ford",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "culvert-w",
      path: [
        [1750, 1160],
        [1750, 1650],
      ],
      w: 110,
      label: "west culvert (tunnel)",
    },
    {
      id: "culvert-e",
      path: [
        [3450, 1110],
        [3450, 1700],
      ],
      w: 110,
      label: "east culvert (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [2330, 150],
        [2870, 150],
        [2900, 480],
        [2850, 730],
        [2340, 730],
        [2300, 470],
      ],
      deep: true,
      label: "black water",
      at: [2400, 400],
    },
    {
      poly: [
        [2340, 730],
        [2850, 730],
        [2870, 960],
        [2320, 960],
      ],
      deep: false,
      label: "north ford (shallow)",
      at: [2380, 860],
    },
    {
      poly: [
        [2320, 960],
        [2870, 960],
        [2900, 1400],
        [2870, 1860],
        [2330, 1860],
        [2300, 1400],
      ],
      deep: true,
      label: "mill race",
      at: [2400, 1100],
    },
    {
      poly: [
        [2330, 1860],
        [2870, 1860],
        [2880, 2110],
        [2320, 2110],
      ],
      deep: false,
      label: "south ford (shallow)",
      at: [2380, 2020],
    },
    {
      poly: [
        [2320, 2110],
        [2880, 2110],
        [2900, 2400],
        [2870, 2650],
        [2330, 2650],
        [2300, 2400],
      ],
      deep: true,
      label: "black water",
      at: [2400, 2500],
    },
  ],
  zones: [
    { kind: "mire", cx: 1500, cy: 2250, rx: 170, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3800, cy: 560, rx: 170, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 2000, cy: 940, rx: 150, ry: 60, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [{ r: rect(2050, 2000, 24, 200), label: "silted weir (breakable)" }],
  gates: [
    { p: [1750, 1620], label: "west culvert gate" },
    { p: [3450, 1150], label: "east culvert gate" },
  ],
  levers: [
    { p: [2780, 1300], layer: 1, label: "lever → west gate" },
    { p: [2420, 1500], layer: 1, label: "lever → east gate" },
  ],
  lights: [
    { p: [1750, 1160], r: 150 },
    { p: [1750, 1650], r: 150 },
    { p: [3450, 1110], r: 150 },
    { p: [3450, 1700], r: 150 },
    { p: [1970, 1560], r: 150 },
    { p: [3070, 1580], r: 150 },
    { p: [3320, 1180], r: 150 },
    { p: [1770, 860], r: 150 },
    { p: [3470, 1860], r: 150 },
    { p: [800, 1000], r: 220 },
    { p: [4424, 1784], r: 220 },
    { p: [2600, 1400], r: 220 },
    { p: [2780, 1300], r: 140 },
    { p: [2420, 1500], r: 140 },
  ],
  atmo: [
    { label: "mist (reed bank)", cx: 1700, cy: 2250, rx: 300, ry: 110, col: "#c8d4e4", op: 0.22 },
    { label: "mist (reed bank)", cx: 3500, cy: 560, rx: 300, ry: 110, col: "#c8d4e4", op: 0.22 },
    { label: "mist (over the race)", cx: 2600, cy: 1100, rx: 240, ry: 90, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [{ r: rect(1000, 1520, 220, 70), label: "fisher's lean-to" }],
  drops: [
    { at: [1750, 1290], e: 1 },
    { at: [3300, 1560], e: 1 },
    { at: [1800, 540], e: 1 },
    { at: [3500, 2200], e: 1 },
  ],
  props: [
    ...[
      [1100, 600],
      [1300, 1900],
      [1900, 2400],
      [700, 2050],
      [1700, 1000],
      [2100, 700],
      [3200, 900],
      [3900, 1000],
      [4100, 2250],
      [3500, 2450],
      [3100, 2100],
      [3700, 650],
    ].map((p) => ({ kind: /** @type {"reed"} */ ("reed"), p: /** @type {Pt} */ (p), r: 40 })),
    ...[
      [1200, 1350],
      [4000, 1450],
      [1000, 2400],
      [4200, 400],
    ].map((p) => ({ kind: /** @type {"tree"} */ ("tree"), p: /** @type {Pt} */ (p), r: 60 })),
    ...[
      [2480, 1250],
      [2720, 1570],
    ].map((p) => ({ kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (p), r: 26 })),
  ],
  spawns: { t1: seats(440, 1620, 120, 110, 8, 1), t2: seats(4784, 834, 120, 110, 8, -1) },
  shrines: { t1: [800, 1000], t2: [4424, 1784] },
  ghosts: { t1: [600, 800], t2: [4624, 1984] },
  extras: [
    { kind: "storm-beacon", p: [2600, 1400], layer: 1 },
    { kind: "flag-spawn", p: [1100, 2000] },
    { kind: "flag-spawn", p: [4124, 784] },
  ],
  centre: [2600, 1400],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: {
    t1: toShrine1,
    t2: toShrine1.map(([n, r]) => [
      n,
      r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : p === "M" ? "M" : m(p))),
    ]),
  },
  shrineCentre: {
    t1: [S1, [1500, 1250], [1970, 1220], [2200, 1410], M],
    t2: [
      "S2",
      ...[
        [1500, 1250],
        [1970, 1220],
        [2200, 1410],
      ].map(m),
      M,
    ],
  },
  layerTitles: {
    0: "L0 banks, fords, culverts",
    1: "L1 approaches, mill, quays",
    2: "L2 mill loft",
  },
  planNote:
    "plan 5200×2800. Dashed: spawn to centre (bridge, culvert, south ford); dotted gold: shrine to centre.",
});
