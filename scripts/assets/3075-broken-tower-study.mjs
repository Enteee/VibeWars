// Study for #3430 (part of #3075): Broken Tower, a fallen tower on a hill, relic run 8v8 (4v4 uses the middle).
// Usage: node scripts/assets/3075-broken-tower-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5400,
  MH = 2800;
/** @typedef {[number, number]} Pt */
/** The far side of the hill, for the second team's half (point mirror, then a nudge). */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0] + 24, MH - p[1] - 16]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) =>
  r.map((p) =>
    p === "C1" ? "C2" : p === "C2" ? "C1" : p === "R1" ? "R2" : p === "R2" ? "R1" : m(p),
  );
/** @type {(poly: Pt[]) => Pt[]} */
const mirPoly = (poly) => /** @type {Pt[]} */ (poly.map(m));

// Heights (visual-style §1): ground #26303f, rock #4b5a70, decks #a0b2c7. The rubble is the rock
// weathered warm (earth speck), so the hill is no new row. Friend blue and foe red stay on bodies.
const pal = {
  out: "#1e2733",
  ground: "#26303f",
  deck: "#a0b2c7",
  deckL2: "#b4c3d4",
  deckL3: "#c8d4e0",
  face: "#4b5a70",
  faceE: "#38455a",
  mound: "#6b6f6c",
  roof: "#6a7482",
  roofFace: "#434b58",
  plant: "#4f5e3c",
  plantLit: "#6a7a50",
  speck1: "#2e3a4c",
  speck2: "#4a3a2a",
  outside: "#2a3445",
};

/** @type {Pt[]} */
const outline = [
  [200, 1000],
  [520, 520],
  [1250, 220],
  [2200, 160],
  [3150, 200],
  [4000, 160],
  [4750, 380],
  [5180, 880],
  [5220, 1500],
  [4900, 2160],
  [4200, 2560],
  [3200, 2620],
  [2200, 2600],
  [1300, 2500],
  [620, 2240],
  [260, 1700],
];

// Quarter pieces on the west half; the east is the point mirror, nudged.
/** @type {{ id: string; layer: number; look?: "mound" | "wood"; poly: Pt[] }[]} */
const west = [
  {
    id: "west rubble terrace",
    layer: 1,
    look: "mound",
    poly: [
      [1480, 900],
      [1900, 760],
      [2200, 900],
      [2160, 1300],
      [1760, 1360],
      [1500, 1200],
    ],
  },
  {
    id: "north spill",
    layer: 1,
    look: "mound",
    poly: [
      [2300, 460],
      [2820, 400],
      [3000, 620],
      [2760, 800],
      [2360, 760],
    ],
  },
  {
    id: "south ledge",
    layer: 1,
    poly: [
      [1500, 1960],
      [1960, 1900],
      [2200, 2060],
      [2000, 2260],
      [1560, 2200],
    ],
  },
];
const east = west.map((s) => ({
  ...s,
  id: s.id.replace("west", "east").replace("north", "south").replace("south ledge", "north ledge"),
  poly: mirPoly(s.poly),
}));
// The east terrace is 6 % smaller: pull its inner corners in.
const eastTerrace = /** @type {Pt[]} */ ([
  [3900, 1880],
  [3500, 2000],
  [3260, 1860],
  [3300, 1480],
  [3680, 1440],
  [3920, 1600],
]);
if (east[0]) east[0].poly = eastTerrace;

/** @type {{ id: string; layer: number; look?: "mound" | "wood"; poly: Pt[] }[]} */
const centre = [
  {
    id: "hill terrace",
    layer: 1,
    look: "mound",
    poly: [
      [2020, 1400],
      [2200, 1020],
      [2700, 920],
      [3200, 1020],
      [3400, 1400],
      [3230, 1800],
      [2700, 1900],
      [2180, 1800],
    ],
  },
  {
    id: "tower base",
    layer: 2,
    poly: [
      [2340, 1210],
      [2700, 1110],
      [3070, 1210],
      [3110, 1450],
      [2900, 1660],
      [2500, 1660],
      [2310, 1450],
    ],
  },
  {
    id: "stump top",
    layer: 3,
    poly: [
      [2560, 1290],
      [2800, 1260],
      [2900, 1400],
      [2800, 1540],
      [2560, 1520],
      [2500, 1400],
    ],
  },
];
const shapes = [...west, ...east, ...centre];

const stairs = [
  { id: "hill-sw", r: rect(2260, 1810, 140, 100), from: 0 },
  { id: "hill-se", r: rect(3010, 1800, 140, 100), from: 0 },
  { id: "hill-nw", r: rect(2300, 900, 140, 100), from: 0, north: true },
  { id: "hill-ne", r: rect(2990, 900, 140, 100), from: 0, north: true },
  { id: "cellar-up", r: rect(2630, 1580, 140, 100), from: 0 },
  { id: "base-s", r: rect(2620, 1660, 140, 100), from: 1 },
  { id: "base-n", r: rect(2640, 1050, 140, 100), from: 1, north: true },
  { id: "top-s", r: rect(2630, 1540, 120, 80), from: 2 },
  { id: "top-n", r: rect(2630, 1210, 120, 80), from: 2, north: true },
  { id: "west-terrace", r: rect(1800, 1360, 140, 100), from: 0 },
  { id: "east-terrace", r: rect(3450, 1480, 140, 100), from: 0, north: true },
  { id: "ledge-w", r: rect(1760, 2200, 140, 100), from: 0, north: true },
  { id: "ledge-e", r: rect(3500, 440, 140, 100), from: 0 },
];

// Routes to the altar (the summit). "south" = the hill's south stairs, "north", "cellar" through the tunnel.
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    [
      "south stair",
      ["C1", [1500, 1500], [2000, 1850], [2330, 1900], [2700, 1760], [2700, 1600], "M"],
    ],
    [
      "north stair",
      ["C1", [1100, 1100], [1700, 820], [2370, 880], [2700, 1000], [2710, 1160], "M"],
    ],
    ["cellar", ["C1", [1250, 1260], [1530, 1390], [2300, 1650], [2700, 1650], [2700, 1560], "M"]],
  ]),
};

// Relic carry: each team's relic spawn to the altar.
const relicWalk = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["south stair", ["R1", [1700, 1900], [2330, 1900], [2700, 1760], [2700, 1600], "M"]],
    ["terrace", ["R1", [1800, 1500], [1870, 1420], [2100, 1250], [2300, 1100], [2710, 1100], "M"]],
    ["cellar", ["R1", [1530, 1390], [2300, 1650], [2700, 1650], [2700, 1560], "M"]],
  ]),
};
// High ground overlooking the altar: the base's rim on each side (the lip of "tower base").
const high = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["west base lip", ["C1", [1500, 1500], [2000, 1700], [2330, 1900], [2420, 1700], [2400, 1480]]],
    ["north base lip", ["C1", [1100, 1100], [1700, 820], [2370, 880], [2500, 1130]]],
  ]),
};

// The cellar is one tunnel, equal in length from both mouths, so team 2 walks its own mouth.
/** @type {(Pt | string)[]} */
const cellarE = ["C2", [4150, 1260], [3824, 1366], [3100, 1650], [2700, 1650], [2700, 1560], "M"];
/** @type {(Pt | string)[]} */
const relicCellarE = ["R2", [3824, 1366], [3100, 1650], [2700, 1650], [2700, 1560], "M"];

runStudy({
  id: "broken-tower",
  name: "Broken Tower",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "cellar",
      path: [
        [1530, 1390],
        [2300, 1650],
        [3100, 1650],
        [3824, 1366],
      ],
      w: 110,
      label: "cellar (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [3300, 2250],
        [3800, 2200],
        [4000, 2330],
        [3700, 2420],
        [3350, 2400],
      ],
      deep: false,
      label: "meltwater pool",
      at: [3300, 2480],
    },
    {
      poly: [
        [1400, 380],
        [1900, 340],
        [2050, 440],
        [1750, 520],
        [1450, 490],
      ],
      deep: false,
      label: "meltwater pool",
      at: [1400, 580],
    },
  ],
  zones: [
    ...[
      { kind: "spring", cx: 1100, cy: 700, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
      { kind: "mire", cx: 1100, cy: 2300, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    ].flatMap((z) => {
      const [cx, cy] = /** @type {Pt} */ (m([z.cx, z.cy]));
      return [z, { ...z, cx, cy }];
    }),
  ],
  breakables: [
    { r: rect(1930, 1580, 24, 180), label: "rubble wall (breakable)" },
    { r: rect(3470, 1024, 24, 180), label: "rubble wall (breakable)" },
  ],
  gates: [
    { p: [1530, 1390], label: "cellar door W" },
    { p: [3824, 1366], label: "cellar door E" },
  ],
  levers: [
    { p: [2250, 1380], layer: 1, label: "lever → both doors" },
    { p: [3150, 1420], layer: 1, label: "lever → both doors" },
  ],
  lights: [
    { p: [1530, 1390], r: 150 },
    { p: [3824, 1366], r: 150 },
    { p: [2330, 1900], r: 150 },
    { p: [3080, 1900], r: 150 },
    { p: [2370, 880], r: 150 },
    { p: [3060, 880], r: 150 },
    { p: [2700, 1400], r: 220 },
    { p: [1000, 1850], r: 220 },
    { p: [4424, 934], r: 220 },
    { p: [2250, 1380], r: 130 },
    { p: [3150, 1420], r: 130 },
    { p: [1000, 1300], r: 180 },
    { p: [4400, 1500], r: 180 },
  ],
  atmo: [
    { label: "dust bank", cx: 1500, cy: 800, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust bank", cx: 3900, cy: 2000, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust bank", cx: 2700, cy: 2300, rx: 280, ry: 100, col: "#c8d4e4", op: 0.18 },
  ],
  overhangs: [{ r: rect(1500, 2020, 220, 70), label: "fallen beam" }],
  drops: [
    { at: [1700, 790], e: 1 },
    { at: [3700, 2020], e: 1 },
    { at: [2550, 440], e: 1 },
    { at: [2850, 2380], e: 1 },
  ],
  props: [
    ...[0, 1, 2, 3, 4, 5].map((i) => ({
      kind: /** @type {"pillar"} */ ("pillar"),
      p: /** @type {Pt} */ ([
        2700 + Math.cos((i * Math.PI) / 3) * 320,
        1400 + Math.sin((i * Math.PI) / 3) * 200,
      ]),
      r: 26,
      layer: 2,
    })),
    ...[
      [800, 1600],
      [1400, 600],
      [4500, 1200],
      [4000, 2300],
      [3100, 2300],
      [2300, 2380],
      [3000, 560],
      [800, 700],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 36 })),
    ...[
      [1000, 900],
      [4500, 1900],
      [2000, 560],
      [3150, 2120],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 38 })),
  ],
  spawns: { t1: seats(480, 1260, 120, 110, 8, 1), t2: seats(4944, 1194, 120, 110, 8, -1) },
  objectives: [
    { id: "R1", kind: "relic-spawn", p: [1000, 1850], label: "relic-spawn 1" },
    {
      id: "R2",
      kind: "relic-spawn",
      p: /** @type {Pt} */ (m([1000, 1850])),
      label: "relic-spawn 2",
    },
    { id: "altar", kind: "altar", p: [2700, 1400], layer: 3, label: "altar" },
  ],
  centre: [2700, 1400],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, n === "cellar" ? cellarE : mir(r)]) },
  objWalks: [
    {
      obj: "altar",
      what: "relic carry",
      t1: relicWalk.t1,
      t2: relicWalk.t1.map(([n, r]) => [n, n === "cellar" ? relicCellarE : mir(r)]),
    },
    { obj: "altar", what: "high ground", t1: high.t1, t2: high.t1.map(([n, r]) => [n, mir(r)]) },
  ],
  layerTitles: {
    0: "L0 hill foot, cellar tunnel",
    1: "L1 rubble terraces",
    2: "L2 tower base",
    3: "L3 stump top",
  },
  planNote:
    "plan 5400×2800. Dashed: spawn to altar (south stair, north stair, cellar); relic spawns are near each team.",
});
