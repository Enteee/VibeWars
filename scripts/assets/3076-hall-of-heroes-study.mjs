// Study for #3431 (part of #3076): Hall of Heroes, a round hall with a dais on a plinth, three galleries and a crypt.
// One layout for the capture, king and relic files, three teams, 8v8.
// Usage: node scripts/assets/3076-hall-of-heroes-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3076-study-lib.mjs";

const MW = 4900,
  MH = 4400;
/** @typedef {[number, number]} Pt */
/** The hall's middle. */
const c = /** @type {Pt} */ ([2450, 2200]);
/** Team 2's half is the x-mirror of team 1's. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) => (typeof p === "string" ? p : [MW - p[0], p[1]]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map((p) => (p === "C1" ? "C2" : p === "R1" ? "R2" : mx(p)));
/** @type {(r: Pt[]) => Pt[]} */
const mxRect = (r) => [r[1], r[0], r[3], r[2]].map((p) => [MW - p[0], p[1]]);

// Heights (visual-style §1, the hall row): floor #26303f, decks #6b7a90, #8896ab.
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
const outline = Array.from({ length: 28 }, (_, i) => [
  Math.round(c[0] + Math.cos((i * 2 * Math.PI) / 28) * 2150),
  Math.round(c[1] + Math.sin((i * 2 * Math.PI) / 28) * 2150),
]);

/** The plinth (L1), a flat octagon, and the dais on it (L2). */
const plinth = /** @type {Pt[]} */ ([
  [2185, 1560],
  [2715, 1560],
  [3090, 1935],
  [3090, 2465],
  [2715, 2840],
  [2185, 2840],
  [1810, 2465],
  [1810, 1935],
]);
const dais = /** @type {Pt[]} */ ([
  [2320, 1880],
  [2580, 1880],
  [2770, 2070],
  [2770, 2330],
  [2580, 2520],
  [2320, 2520],
  [2130, 2330],
  [2130, 2070],
]);
const galN = rect(1950, 850, 1000, 300);
const neckN = rect(2350, 1140, 200, 430);
const galSW = rect(1100, 2300, 710, 300);
const neckSW = rect(1700, 2250, 200, 160);
const shapes = [
  { id: "plinth", layer: 1, poly: plinth },
  { id: "dais", layer: 2, poly: dais },
  { id: "north gallery", layer: 1, poly: galN },
  { id: "north neck", layer: 1, poly: neckN },
  { id: "south-west gallery", layer: 1, poly: galSW },
  { id: "sw neck", layer: 1, poly: neckSW },
  { id: "south-east gallery", layer: 1, poly: mxRect(galSW) },
  { id: "se neck", layer: 1, poly: mxRect(neckSW) },
];

const stairs = [
  { id: "plinth-sw", r: rect(2200, 2750, 140, 100), from: 0 },
  { id: "plinth-se", r: rect(2560, 2750, 140, 100), from: 0 },
  { id: "plinth-nw", r: rect(2200, 1550, 140, 100), from: 0, north: true },
  { id: "plinth-ne", r: rect(2560, 1550, 140, 100), from: 0, north: true },
  { id: "dais-n", r: rect(2380, 1870, 140, 100), from: 1, north: true },
  { id: "dais-s", r: rect(2380, 2430, 140, 100), from: 1 },
  { id: "crypt-up", r: rect(2560, 2600, 140, 100), from: 0 },
  { id: "gal-n-w", r: rect(1960, 840, 140, 100), from: 0, north: true },
  { id: "gal-n-e", r: rect(2800, 840, 140, 100), from: 0, north: true },
  { id: "gal-sw-n", r: rect(1110, 2290, 140, 100), from: 0, north: true },
  { id: "gal-sw-s", r: rect(1640, 2510, 140, 100), from: 0 },
  { id: "gal-se-n", r: mxRect(rect(1110, 2290, 140, 100)), from: 0, north: true },
  { id: "gal-se-s", r: mxRect(rect(1640, 2510, 140, 100)), from: 0 },
];

// Team 1 (north-west) walks; team 2 mirrors them; team 3 (south) has its own.
const t1 = {
  routes: /** @type {[string, (Pt | string)[]][]} */ ([
    [
      "plinth stair",
      [
        "C1",
        [1750, 1450],
        [2180, 1470],
        [2270, 1530],
        [2270, 1650],
        [2450, 1820],
        [2450, 1900],
        "M",
      ],
    ],
    [
      "north gallery",
      [
        "C1",
        [1700, 730],
        [2000, 760],
        [2030, 900],
        [2450, 1050],
        [2450, 1500],
        [2450, 1700],
        [2450, 1820],
        [2450, 1900],
        "M",
      ],
    ],
    [
      "south-west gallery",
      [
        "C1",
        [1250, 1900],
        [1180, 2250],
        [1180, 2400],
        [1850, 2340],
        [2000, 2400],
        [2250, 2650],
        [2450, 2590],
        [2450, 2480],
        "M",
      ],
    ],
    [
      "crypt",
      [
        "C1",
        [1350, 2200],
        [2450, 2200],
        [2630, 2720],
        [2630, 2640],
        [2500, 2560],
        [2450, 2480],
        "M",
      ],
    ],
  ]),
};
const t3 = {
  routes: /** @type {[string, (Pt | string)[]][]} */ ([
    [
      "plinth stair",
      [
        "C3",
        [2300, 3300],
        [2270, 2850],
        [2270, 2770],
        [2330, 2650],
        [2450, 2560],
        [2450, 2480],
        "M",
      ],
    ],
    [
      "south-west gallery",
      [
        "C3",
        [1710, 3250],
        [1710, 2650],
        [1710, 2520],
        [1760, 2420],
        [1850, 2335],
        [2000, 2400],
        [2250, 2650],
        [2450, 2590],
        [2450, 2480],
        "M",
      ],
    ],
    [
      "south-east gallery",
      [
        "C3",
        ...[
          [1710, 3250],
          [1710, 2650],
          [1710, 2520],
          [1760, 2420],
          [1850, 2335],
          [2000, 2400],
          [2250, 2650],
          [2450, 2590],
          [2450, 2480],
        ].map((p) => mx(/** @type {Pt} */ (p))),
        "M",
      ],
    ],
    [
      "crypt",
      [
        "C3",
        [3000, 3153],
        [2450, 2200],
        [2630, 2720],
        [2630, 2640],
        [2500, 2560],
        [2450, 2480],
        "M",
      ],
    ],
  ]),
};

// Relic carry (relic mode): each team's relic spawn to the altar on the dais.
const relicT1 = /** @type {[string, (Pt | string)[]][]} */ ([
  [
    "plinth stair",
    ["R1", [1850, 1530], [2180, 1480], [2270, 1530], [2270, 1650], [2450, 1820], [2450, 1900], "M"],
  ],
  [
    "north gallery",
    [
      "R1",
      [1700, 800],
      [2000, 800],
      [2030, 900],
      [2450, 1050],
      [2450, 1500],
      [2450, 1700],
      [2450, 1820],
      [2450, 1900],
      "M",
    ],
  ],
  [
    "crypt",
    ["R1", [1350, 2200], [2450, 2200], [2630, 2720], [2630, 2640], [2500, 2560], [2450, 2480], "M"],
  ],
]);
const relicT3 = /** @type {[string, (Pt | string)[]][]} */ ([
  [
    "plinth stair",
    ["R3", [2300, 3000], [2270, 2850], [2270, 2770], [2330, 2650], [2450, 2560], [2450, 2480], "M"],
  ],
  [
    "north gallery",
    [
      "R3",
      [1710, 3150],
      [1710, 2650],
      [1710, 2520],
      [1760, 2420],
      [1850, 2335],
      [2000, 2400],
      [2250, 2650],
      [2450, 2590],
      [2450, 2480],
      "M",
    ],
  ],
  [
    "crypt",
    ["R3", [3000, 3153], [2450, 2200], [2630, 2720], [2630, 2640], [2500, 2560], [2450, 2480], "M"],
  ],
]);

runStudy({
  id: "hall-of-heroes",
  name: "Hall of Heroes",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    { id: "crypt-w", path: [[1350, 2200], c], w: 110, label: "crypt (tunnel)" },
    { id: "crypt-ne", path: [[3000, 1247], c], w: 110, label: "crypt" },
    { id: "crypt-s", path: [[3000, 3153], c], w: 110, label: "crypt" },
    { id: "crypt-stem", path: [c, [2630, 2720]], w: 110, label: "crypt stair" },
  ],
  water: [
    {
      poly: [
        [2300, 400],
        [2600, 400],
        [2650, 520],
        [2250, 520],
      ],
      deep: false,
      label: "reflecting pool",
      at: [2250, 600],
    },
    {
      poly: [
        [790, 3000],
        [1090, 3040],
        [1070, 3160],
        [760, 3130],
      ],
      deep: false,
      label: "reflecting pool",
      at: [700, 3230],
    },
    {
      poly: [
        [4110, 3000],
        [3810, 3040],
        [3830, 3160],
        [4140, 3130],
      ],
      deep: false,
      label: "reflecting pool",
      at: [3800, 3230],
    },
  ],
  zones: [
    { kind: "spring", cx: 1474, cy: 990, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: 3426, cy: 990, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: 1890, cy: 3800, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 914, cy: 1960, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3986, cy: 1960, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3010, cy: 3800, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [
    { r: rect(980, 2400, 24, 160), label: "barricade (breakable)" },
    { r: rect(3896, 2400, 24, 160), label: "barricade (breakable)" },
    { r: rect(3150, 3000, 180, 24), label: "barricade (breakable)" },
  ],
  gates: [
    { p: [1350, 2200], label: "crypt door 1" },
    { p: [3000, 1247], label: "crypt door 2" },
    { p: [3000, 3153], label: "crypt door 3" },
  ],
  levers: [
    { p: [2100, 1090], layer: 1, label: "lever → 3 doors" },
    { p: [1320, 2400], layer: 1, label: "lever → 3 doors" },
    { p: [3580, 2400], layer: 1, label: "lever → 3 doors" },
  ],
  lights: [
    { p: [1350, 2200], r: 150 },
    { p: [3000, 1247], r: 150 },
    { p: [3000, 3153], r: 150 },
    { p: [2270, 1500], r: 150 },
    { p: [2630, 1500], r: 150 },
    { p: [2270, 2800], r: 150 },
    { p: [2630, 2800], r: 150 },
    { p: [2450, 2200], r: 220 },
    { p: [1700, 1780], r: 220 },
    { p: [3200, 1780], r: 220 },
    { p: [2450, 3470], r: 220 },
    { p: [2450, 1000], r: 180 },
    { p: [1500, 2450], r: 180 },
    { p: [3400, 2450], r: 180 },
    { p: [908, 1310], r: 130 },
    { p: [3992, 1310], r: 130 },
    { p: [2450, 4130], r: 130 },
  ],
  atmo: [
    { label: "dust in the light", cx: 2450, cy: 700, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust in the light", cx: 900, cy: 3300, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust in the light", cx: 4000, cy: 3300, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [{ r: rect(2200, 760, 220, 70), label: "hanging banner" }],
  drops: [
    { at: [1930, 1000], e: 1 },
    { at: [1090, 2450], e: 1 },
    { at: [3810, 2450], e: 1 },
  ],
  props: [135, 165, 255, 285, 15, 45].map((deg) => ({
    kind: /** @type {"pillar"} */ ("pillar"),
    p: /** @type {Pt} */ ([
      Math.round(c[0] + Math.cos((deg * Math.PI) / 180) * 1500),
      Math.round(c[1] + Math.sin((deg * Math.PI) / 180) * 1500),
    ]),
    r: 26,
  })),
  spawns: {
    t1: seats(1134, 1310, 120, 110, 8, 1),
    t2: seats(3766, 1310, 120, 110, 8, -1),
    t3: seats(2390, 3635, 120, 110, 8, 1),
  },
  shrines: { t1: [908, 1310], t2: [3992, 1310], t3: [2450, 4130] },
  ghosts: { t1: [1100, 1060], t2: [3800, 1060], t3: [2000, 4010] },
  objectives: [
    { id: "altar", kind: "altar", p: c, layer: 2, label: "altar (king, relic) = P1 (capture)" },
    { id: "P2", kind: "capture-point", p: [2450, 1000], layer: 1, label: "P2" },
    { id: "P3", kind: "capture-point", p: [1500, 2450], layer: 1, label: "P3" },
    { id: "P4", kind: "capture-point", p: [3400, 2450], layer: 1, label: "P4" },
    { id: "R1", kind: "relic-spawn", p: [1700, 1780], label: "relic-spawn 1" },
    { id: "R2", kind: "relic-spawn", p: [3200, 1780], label: "relic-spawn 2" },
    { id: "R3", kind: "relic-spawn", p: [2450, 3470], label: "relic-spawn 3" },
  ],
  centre: [2450, 2200],
  routes: { t1: t1.routes, t2: t1.routes.map(([n, r]) => [n, mxr(r)]), t3: t3.routes },
  objWalks: [
    {
      obj: "altar",
      what: "relic carry",
      walks: { t1: relicT1, t2: relicT1.map(([n, r]) => [n, mxr(r)]), t3: relicT3 },
    },
  ],
  layerTitles: {
    0: "L0 hall floor, crypt",
    1: "L1 plinth and galleries",
    2: "L2 dais",
  },
  planNote: "plan 4900×4400. Dashed: spawn to altar, per team (blue T1, red T2, violet T3).",
});
