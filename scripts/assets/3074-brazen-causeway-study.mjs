// Study for #3426 (part of #3074): Brazen Causeway, a raised bronze-age causeway over marsh, priest annihilation 8v8.
// Usage: node scripts/assets/3074-brazen-causeway-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3074-study-lib.mjs";

const MW = 5600,
  MH = 2800;
/** @typedef {[number, number]} Pt */
/** The far end, for the second team: point mirror, then a nudge. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0] + 24, MH - p[1] - 16]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mirS = (r) => r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : m(p)));

// The proposed `marsh` row, as in the Blackwater Ford study: ground #2a3430, rock #54594f, reed
// #5c5a3a, silt #4a4034. The causeway is dressed stone with bronze gates (brass stays as it is).
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
  [2800, 120],
  [2000, 160],
  [1000, 280],
  [400, 650],
  [180, 1200],
  [200, 1900],
  [560, 2400],
  [1400, 2640],
  [2200, 2680],
  [2800, 2680],
];
/** @type {Pt[]} */
const outline = [...west, ...west.map((p) => /** @type {Pt} */ (m(p)))];

const shapes = [
  {
    id: "causeway",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [1400, 1220],
      [1900, 1160],
      [2800, 1180],
      [3700, 1160],
      [4200, 1220],
      [4200, 1580],
      [3700, 1640],
      [2800, 1620],
      [1900, 1640],
      [1400, 1580],
    ]),
  },
  {
    id: "west jetty",
    layer: 1,
    look: /** @type {"wood"} */ ("wood"),
    poly: /** @type {Pt[]} */ ([
      [1000, 2000],
      [1300, 1960],
      [1400, 2200],
      [1050, 2240],
    ]),
  },
  {
    id: "east jetty",
    layer: 1,
    look: /** @type {"wood"} */ ("wood"),
    poly: /** @type {Pt[]} */ ([
      [4624, 784],
      [4324, 824],
      [4224, 584],
      [4574, 544],
    ]),
  },
  {
    id: "west gatehouse",
    layer: 2,
    poly: /** @type {Pt[]} */ ([
      [1980, 1170],
      [2300, 1170],
      [2300, 1330],
      [1980, 1330],
    ]),
  },
  {
    id: "east gatehouse",
    layer: 2,
    poly: /** @type {Pt[]} */ ([
      [3324, 1474],
      [3644, 1474],
      [3644, 1634],
      [3324, 1634],
    ]),
  },
];

const stairs = [
  { id: "stair-w-s", r: rect(1500, 1640, 140, 100), from: 0 },
  { id: "stair-w-n", r: rect(1650, 1060, 140, 100), from: 0, north: true },
  { id: "stair-c-n", r: rect(2740, 1080, 140, 100), from: 0, north: true },
  { id: "stair-c-s", r: rect(2900, 1640, 140, 100), from: 0 },
  { id: "stair-e-n", r: rect(4000, 1060, 140, 100), from: 0, north: true },
  { id: "stair-e-s", r: rect(3950, 1640, 140, 100), from: 0 },
  { id: "stair-wj", r: rect(1150, 2240, 140, 100), from: 0 },
  { id: "stair-ej", r: rect(4350, 444, 140, 100), from: 0, north: true },
  { id: "tower-w", r: rect(2100, 1330, 140, 100), from: 1 },
  { id: "tower-e", r: rect(3400, 1374, 140, 100), from: 1, north: true },
];

const C1 = "C1",
  S1 = "S1",
  M = "M";
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["causeway", [C1, [1570, 1710], [1570, 1500], [1900, 1400], M]],
    ["north marsh", [C1, [1200, 1100], [1900, 900], [2810, 1100], M]],
    ["south marsh", [C1, [1500, 2000], [2300, 1980], [2900, 1760], [2970, 1690], M]],
  ]),
};
const toShrine1 = /** @type {[string, (Pt | string)[]][]} */ ([
  [
    "causeway",
    [
      "C2",
      [4070, 1110],
      [3900, 1300],
      [3724, 1384],
      M,
      [1900, 1400],
      [1570, 1500],
      [1570, 1710],
      [1100, 1500],
      S1,
    ],
  ],
  ["north marsh", ["C2", [4000, 820], [2800, 860], [1500, 880], S1]],
  ["south marsh", ["C2", [4000, 1900], [2800, 2000], [1300, 1900], [900, 1400], S1]],
]);

runStudy({
  id: "brazen-causeway",
  name: "Brazen Causeway",
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
        [2400, 1040],
        [2400, 1760],
      ],
      w: 110,
      label: "west culvert (tunnel)",
    },
    {
      id: "culvert-e",
      path: [
        [3200, 1000],
        [3200, 1800],
      ],
      w: 110,
      label: "east culvert (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [2400, 250],
        [3000, 230],
        [3250, 400],
        [2900, 500],
        [2450, 470],
      ],
      deep: true,
      label: "black pool",
      at: [2450, 560],
    },
    {
      poly: [
        [2500, 2340],
        [3000, 2320],
        [3250, 2480],
        [2900, 2560],
        [2450, 2540],
      ],
      deep: true,
      label: "black pool",
      at: [2500, 2620],
    },
    {
      poly: [
        [1150, 2350],
        [1650, 2330],
        [1750, 2480],
        [1300, 2540],
      ],
      deep: false,
      label: "reed pool",
      at: [1150, 2600],
    },
    {
      poly: [
        [4400, 270],
        [4900, 250],
        [4650, 410],
        [4250, 400],
      ],
      deep: false,
      label: "reed pool",
      at: [4400, 220],
    },
  ],
  zones: [
    { kind: "mire", cx: 2200, cy: 880, rx: 190, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3500, cy: 900, rx: 190, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 2200, cy: 1960, rx: 190, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3500, cy: 1920, rx: 190, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [{ r: rect(1750, 2000, 24, 220), label: "rotten palisade (breakable)" }],
  gates: [
    { p: [1900, 1400], label: "west bronze gate" },
    { p: [3724, 1384], label: "east bronze gate" },
  ],
  levers: [
    { p: [2150, 1230], layer: 2, label: "lever → east gate" },
    { p: [3480, 1570], layer: 2, label: "lever → west gate" },
  ],
  lights: [
    { p: [1900, 1330], r: 150 },
    { p: [3724, 1460], r: 150 },
    { p: [2400, 1040], r: 150 },
    { p: [2400, 1760], r: 150 },
    { p: [3200, 1000], r: 150 },
    { p: [3200, 1800], r: 150 },
    { p: [1570, 1700], r: 150 },
    { p: [4100, 1140], r: 150 },
    { p: [800, 1100], r: 220 },
    { p: [4824, 1684], r: 220 },
    { p: [2800, 1400], r: 220 },
    { p: [2150, 1230], r: 140 },
    { p: [3480, 1570], r: 140 },
  ],
  atmo: [
    { label: "mist (reed bank)", cx: 1800, cy: 2350, rx: 300, ry: 110, col: "#c8d4e4", op: 0.22 },
    { label: "mist (reed bank)", cx: 3900, cy: 450, rx: 300, ry: 110, col: "#c8d4e4", op: 0.22 },
    { label: "mist (marsh)", cx: 2800, cy: 780, rx: 260, ry: 90, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [{ r: rect(900, 1480, 220, 70), label: "reed lean-to" }],
  drops: [
    { at: [2500, 1180], e: 1 },
    { at: [3100, 1620], e: 1 },
    { at: [1700, 1170], e: 1 },
    { at: [2200, 1600], e: 1 },
  ],
  props: [
    ...[2000, 2400, 3200, 3600].map((x, i) => ({
      kind: /** @type {"pillar"} */ ("pillar"),
      p: /** @type {Pt} */ ([x, i % 2 ? 1620 : 1190]),
      r: 24,
      layer: 1,
    })),
    ...[
      [1100, 600],
      [1300, 1900],
      [700, 2200],
      [1800, 1000],
      [2800, 2200],
      [3700, 600],
      [4200, 2000],
      [4600, 1500],
      [3900, 2250],
      [2700, 600],
    ].map((p) => ({ kind: /** @type {"reed"} */ ("reed"), p: /** @type {Pt} */ (p), r: 40 })),
    ...[
      [1200, 1350],
      [4300, 1400],
      [900, 2450],
      [4700, 400],
    ].map((p) => ({ kind: /** @type {"tree"} */ ("tree"), p: /** @type {Pt} */ (p), r: 60 })),
  ],
  spawns: { t1: seats(440, 1600, 120, 110, 8, 1), t2: seats(5184, 854, 120, 110, 8, -1) },
  shrines: { t1: [800, 1100], t2: [4824, 1684] },
  ghosts: { t1: [600, 900], t2: [5024, 1884] },
  extras: [
    { kind: "storm-beacon", p: [2800, 1400], layer: 1 },
    { kind: "flag-spawn", p: [1100, 1800] },
    { kind: "flag-spawn", p: [4524, 984] },
  ],
  centre: [2800, 1400],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: { t1: toShrine1, t2: toShrine1.map(([n, r]) => [n, mirS(r)]) },
  shrineCentre: {
    t1: [S1, [1300, 1050], [1700, 1120], [1900, 1400], M],
    t2: [
      "S2",
      ...[
        [1300, 1050],
        [1700, 1120],
        [1900, 1400],
      ].map(m),
      M,
    ],
  },
  layerTitles: { 0: "L0 marsh, culverts", 1: "L1 causeway, jetties", 2: "L2 gatehouses" },
  planNote:
    "plan 5600×2800. Dashed: spawn to centre (causeway, north marsh, south marsh); dotted gold: shrine to centre.",
});
