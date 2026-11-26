// Study for #3432 (part of #3077): Guild Hall Isle, an island guild hall with piers, a beach, rooftops and a gatehouse, guild battle 8v8.
// Usage: node scripts/assets/3077-guild-hall-isle-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3077-study-lib.mjs";

const MW = 6000,
  MH = 2600;
/** @typedef {[number, number]} Pt */
/** The east half, for the second team: point mirror about the centre. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0], MH - p[1]]);
/** @type {(r: Pt[]) => Pt[]} */
const mirPoly = (r) => r.map((p) => /** @type {Pt} */ (m(p)));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));

// Proposed biome `coast` (visual-style §1 row): ground #7d7358 (wet sand), rock #5b6770 (a grey sea
// rock), plant #6d6a3e (a dry olive, hue ~55 deg). The sea outside is the shared water look in a
// deeper teal. No tone is near the friend blue, the foe red or the nature green.
const pal = {
  out: "#1b4259",
  ground: "#7d7358",
  deck: "#a09a86",
  deckL2: "#b8b29c",
  face: "#5b6770",
  faceE: "#46525a",
  mound: "#6a6a52",
  roof: "#8a5a3e",
  roofFace: "#5a3a28",
  plant: "#6d6a3e",
  plantLit: "#8a8650",
  speck1: "#8a8064",
  speck2: "#6a6048",
  outside: "#245a78",
};

/** @type {Pt[]} */
const west = [
  [3000, 150],
  [2400, 120],
  [1500, 160],
  [800, 330],
  [300, 700],
  [170, 1200],
  [170, 1400],
  [300, 1900],
  [800, 2270],
  [1500, 2440],
  [2400, 2480],
  [3000, 2450],
];
/** @type {Pt[]} */
const outline = [...west, ...west.map((p) => /** @type {Pt} */ (m(p)))];

/** @type {(id: string, layer: number, poly: Pt[], look?: "bridge" | "stone" | "wood", label?: string) => { id: string; layer: number; poly: Pt[]; look?: "bridge" | "stone" | "wood"; label?: string }} */
const sh = (id, layer, poly, look, label) => ({ id, layer, poly, look, label });
/** The west half of the shapes; the east half is turned. */
const westShapes = [
  sh("west hall", 1, rect(900, 900, 900, 800), "stone"),
  sh("hall roof", 2, rect(1050, 1050, 400, 500), "stone"),
  sh("west rampart", 1, rect(2400, 700, 300, 1200), "stone"),
  sh("north-west pier", 1, rect(1900, 560, 900, 120), "wood"),
  sh("south-west pier", 1, rect(1900, 1920, 900, 120), "wood"),
];
const shapes = [
  ...westShapes,
  ...westShapes.map((s) => ({
    ...s,
    id: s.id.replace("west", "east").replace("hall roof", "hall roof (E)"),
    poly: mirPoly(s.poly),
  })),
  sh("flag dais", 1, rect(2850, 1150, 300, 300), "stone"),
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const westStairs = [
  { id: "stair-hall-e", r: rect(1800, 1240, 140, 100), from: 0 },
  { id: "stair-hall-s", r: rect(1200, 1700, 140, 100), from: 0, north: true },
  { id: "stair-roof", r: rect(1450, 1250, 100, 100), from: 1 },
  { id: "stair-ramp-w", r: rect(2300, 1080, 100, 120), from: 0 },
  { id: "stair-ramp-e", r: rect(2700, 980, 100, 130), from: 0 },
  { id: "stair-pier-nw", r: rect(1780, 560, 120, 100), from: 0 },
  { id: "stair-pier-sw", r: rect(1780, 1920, 120, 100), from: 0 },
  { id: "stair-hall-n", r: rect(1200, 760, 140, 140), from: 0 },
  { id: "stair-pier-ne", r: rect(2800, 560, 120, 100), from: 0 },
  { id: "stair-pier-se", r: rect(2800, 1920, 120, 100), from: 0 },
  { id: "stair-dais-w", r: rect(2730, 1240, 120, 80), from: 0 },
  { id: "stair-dais-n", r: rect(2940, 1040, 120, 110), from: 0 },
];
const stairs = [
  ...westStairs,
  ...westStairs.map((s) => ({
    ...s,
    id: `${s.id}-E`,
    r: mirPoly(s.r),
    north: s.north === undefined ? undefined : !s.north,
  })),
];

// Approaches to the flag stand (the centre) for team 1; team 2 turns them.
const approach = {
  gatehouse: /** @type {(Pt | string)[]} */ ([
    "C1",
    [800, 820],
    [1900, 820],
    [2100, 1000],
    [2300, 1300],
    [2550, 1370],
    [2700, 1300],
    [2790, 1280],
    "M",
  ]),
  rampart: /** @type {(Pt | string)[]} */ ([
    "C1",
    [800, 820],
    [1900, 820],
    [2100, 1000],
    [2330, 1140],
    [2550, 1040],
    [2780, 1040],
    [2790, 1280],
    "M",
  ]),
  pier: /** @type {(Pt | string)[]} */ ([
    "C1",
    [800, 850],
    [1840, 620],
    [2850, 620],
    [3000, 1040],
    "M",
  ]),
};
const routes = { t1: /** @type {[string, (Pt | string)[]][]} */ (Object.entries(approach)) };
const toLord1 = /** @type {[string, (Pt | string)[]][]} */ ([
  [
    "gatehouse",
    [
      ...mir(approach.gatehouse).slice(0, -1),
      "M",
      [2790, 1300],
      [2700, 1300],
      [2400, 1300],
      [2200, 1300],
      [1850, 1300],
      "S1",
    ],
  ],
  [
    "over the rampart",
    [
      ...mir(approach.gatehouse).slice(0, -1),
      "M",
      [2790, 1280],
      [2780, 1040],
      [2550, 1040],
      [2330, 1140],
      [2200, 1140],
      [1850, 1300],
      "S1",
    ],
  ],
  [
    "north pier",
    [
      ...mir(approach.gatehouse).slice(0, -1),
      "M",
      [3000, 1040],
      [2850, 620],
      [1840, 620],
      [1270, 780],
      [1270, 1000],
      "S1",
    ],
  ],
]);

runStudy({
  id: "guild-hall-isle",
  name: "Guild Hall Isle",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "gate-w",
      path: [
        [2400, 1300],
        [2550, 1370],
        [2700, 1300],
      ],
      w: 120,
      label: "gatehouse (tunnel)",
    },
    {
      id: "gate-e",
      path: mirPoly([
        [2400, 1300],
        [2550, 1370],
        [2700, 1300],
      ]),
      w: 120,
      label: "gatehouse (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [2800, 150],
        [3200, 150],
        [3200, 500],
        [2800, 500],
      ],
      deep: false,
      label: "north inlet (shallow)",
      at: [2820, 250],
    },
    {
      poly: [
        [2800, 2100],
        [3200, 2100],
        [3200, 2450],
        [2800, 2450],
      ],
      deep: false,
      label: "south inlet (shallow)",
      at: [2820, 2350],
    },
  ],
  zones: [
    { kind: "mire", cx: 1200, cy: 500, rx: 170, ry: 66, fill: "#5a4e38", edge: "#3a3024" },
    { kind: "mire", cx: 4800, cy: 2100, rx: 170, ry: 66, fill: "#5a4e38", edge: "#3a3024" },
    { kind: "spring", cx: 2150, cy: 1000, rx: 130, ry: 54, fill: "#4a7a8a", edge: "#244050" },
    { kind: "spring", cx: 3850, cy: 1600, rx: 130, ry: 54, fill: "#4a7a8a", edge: "#244050" },
  ],
  breakables: [
    { r: rect(1500, 1700, 24, 220), label: "driftwood barricade (breakable)" },
    { r: rect(4476, 680, 24, 220), label: "driftwood barricade (breakable)" },
  ],
  gates: [
    { p: [2390, 1300], label: "gatehouse door" },
    { p: [3610, 1300], label: "gatehouse door" },
  ],
  levers: [
    { p: [2550, 1500], layer: 1, label: "lever → east door" },
    { p: [3450, 1100], layer: 1, label: "lever → west door" },
  ],
  lights: [
    { p: [2400, 1250], r: 160 },
    { p: [2700, 1250], r: 160 },
    { p: [3600, 1350], r: 160 },
    { p: [3300, 1350], r: 160 },
    { p: [3000, 1300], r: 260, col: "#ffd890" },
    { p: [1350, 1300], r: 240 },
    { p: [4650, 1300], r: 240 },
    { p: [2100, 370], r: 150 },
    { p: [3900, 2230], r: 150 },
    { p: [1100, 2230], r: 150 },
    { p: [4900, 370], r: 150 },
    { p: [650, 800], r: 200 },
    { p: [5350, 1800], r: 200 },
    { p: [1800, 1500], r: 160 },
    { p: [4200, 1100], r: 160 },
  ],
  atmo: [
    { label: "sea mist (inlet)", cx: 3000, cy: 350, rx: 300, ry: 100, col: "#c8d4e4", op: 0.2 },
    { label: "sea mist (inlet)", cx: 3000, cy: 2250, rx: 300, ry: 100, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [
    { r: rect(1000, 780, 300, 80), label: "hall eaves" },
    { r: rect(4700, 1740, 300, 80), label: "hall eaves" },
  ],
  drops: [
    { at: [1400, 1700], e: 1 },
    { at: [4600, 900], e: 1 },
    { at: [2550, 1900], e: 1 },
    { at: [3450, 700], e: 1 },
  ],
  props: [
    ...[
      [600, 1000],
      [700, 1700],
      [1500, 600],
      [2000, 1900],
      [1100, 2100],
      [2300, 800],
      [2300, 1750],
    ].flatMap((p) => [
      { kind: /** @type {"tree"} */ ("tree"), p: /** @type {Pt} */ (p), r: 55 },
      { kind: /** @type {"tree"} */ ("tree"), p: /** @type {Pt} */ (m(p)), r: 55 },
    ]),
    ...[
      [500, 400],
      [1600, 2250],
      [2000, 1200],
      [900, 1950],
    ].flatMap((p) => [
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 44 },
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (m(p)), r: 44 },
    ]),
    ...[
      [960, 960],
      [960, 1640],
      [1740, 960],
      [1740, 1640],
    ].flatMap((p) => [
      { kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (p), r: 24, layer: 1 },
      { kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (m(p)), r: 24, layer: 1 },
    ]),
  ],
  spawns: { t1: seats(300, 1160, 120, 110, 8, 1), t2: seats(5700, 1050, 120, 110, 8, -1) },
  shrines: { t1: [650, 800], t2: [5350, 1800] },
  targets: { t1: [1350, 1300], t2: [4650, 1300] },
  targetName: "guild lord",
  extras: [
    { kind: "guild-lord", p: [1350, 1300], layer: 1 },
    { kind: "guild-lord", p: [4650, 1300], layer: 1 },
    ...[
      [1200, 1200],
      [1200, 1400],
      [1500, 1200],
      [1500, 1400],
    ].flatMap((p) => [
      { kind: /** @type {"guard"} */ ("guard"), p: /** @type {Pt} */ (p), layer: 1 },
      { kind: /** @type {"guard"} */ ("guard"), p: /** @type {Pt} */ (m(p)), layer: 1 },
    ]),
    ...[
      [2330, 1160],
      [2330, 1230],
      [2330, 1370],
      [2330, 1440],
    ].flatMap((p) => [
      { kind: /** @type {"guard"} */ ("guard"), p: /** @type {Pt} */ (p) },
      { kind: /** @type {"guard"} */ ("guard"), p: /** @type {Pt} */ (m(p)) },
    ]),
    { kind: "flag-stand", p: [3000, 1300], layer: 1 },
    { kind: "flag-spawn", p: [1100, 2050] },
    { kind: "flag-spawn", p: [4900, 550] },
  ],
  centre: [3000, 1300],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: {
    t1: toLord1,
    t2: toLord1.map(([n, r]) => [
      n,
      r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : p === "M" ? "M" : m(p))),
    ]),
  },
  shrineCentre: {
    t1: [
      "S1",
      [1000, 820],
      [1900, 820],
      [2100, 1000],
      [2300, 1300],
      [2700, 1300],
      [2790, 1280],
      "M",
    ],
    t2: [
      "S2",
      ...[
        [1000, 820],
        [1900, 820],
        [2100, 1000],
        [2300, 1300],
        [2700, 1300],
        [2790, 1280],
      ].map(m),
      "M",
    ],
  },
  layerTitles: {
    0: "L0 beach, courtyards, gatehouse tunnels",
    1: "L1 halls, ramparts, piers, flag dais",
    2: "L2 hall roofs",
  },
  planNote:
    "plan 6000×2600. Dashed: spawn to the flag stand (gatehouse, rampart, pier); dotted gold: shrine to the flag stand. Gold figures are the guild lords with 8 guards each.",
});
