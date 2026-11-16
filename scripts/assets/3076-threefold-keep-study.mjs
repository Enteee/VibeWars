// Study for #3431 (part of #3076): Threefold Keep, a keep with three approaches, king of the hill, three teams.
// Usage: node scripts/assets/3076-threefold-keep-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3076-study-lib.mjs";

const MW = 5200,
  MH = 4400;
/** @typedef {[number, number]} Pt */
/** The keep's middle, the hill. */
const c = /** @type {Pt} */ ([2600, 2400]);
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) => (typeof p === "string" ? p : [MW - p[0], p[1]]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map((p) => (p === "C1" ? "C2" : mx(p)));
/** @type {(r: Pt[]) => Pt[]} */
const mxRect = (r) => [r[1], r[0], r[3], r[2]].map((p) => [MW - p[0], p[1]]);

// Heights (visual-style §1, the hall row).
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
const outline = Array.from({ length: 32 }, (_, i) => [
  Math.round(2600 + Math.cos((i * 2 * Math.PI) / 32) * 2500),
  Math.round(2200 + Math.sin((i * 2 * Math.PI) / 32) * 2100),
]);

const court = rect(2000, 1800, 1200, 1200);
const tower = rect(2300, 2100, 600, 600);
const walkW = rect(1100, 2800, 1000, 200);
const walkN = rect(2020, 1000, 200, 900);
const shapes = [
  { id: "courtyard", layer: 1, poly: court },
  { id: "tower", layer: 2, poly: tower },
  { id: "south-west wall-walk", layer: 1, poly: walkW },
  { id: "south-east wall-walk", layer: 1, poly: mxRect(walkW) },
  { id: "north wall-walk", layer: 1, poly: walkN },
];

const stairs = [
  { id: "gate-n", r: rect(2530, 1700, 140, 100), from: 0, north: true },
  { id: "gate-s", r: rect(2530, 3000, 140, 100), from: 0 },
  { id: "gate-w", r: rect(1900, 2330, 100, 140), from: 0 },
  { id: "gate-e", r: rect(3200, 2330, 100, 140), from: 0 },
  { id: "tower-n", r: rect(2530, 2000, 140, 100), from: 1, north: true },
  { id: "tower-s", r: rect(2530, 2700, 140, 100), from: 1 },
  { id: "tower-w", r: rect(2200, 2330, 100, 140), from: 1 },
  { id: "tower-e", r: rect(2900, 2330, 100, 140), from: 1 },
  { id: "walk-sw", r: rect(1100, 2800, 140, 100), from: 0 },
  { id: "walk-se", r: mxRect(rect(1100, 2800, 140, 100)), from: 0 },
  { id: "walk-n", r: rect(2020, 1000, 200, 100), from: 0, north: true },
  { id: "crypt-up", r: rect(2380, 2740, 140, 100), from: 0 },
  { id: "crypt-up-n", r: rect(2030, 2500, 140, 100), from: 0 },
];

/** @type {[string, (Pt | string)[]][]} */
const t1Routes = [
  [
    "wall-walk",
    ["C1", [1170, 3000], [1200, 2900], [2000, 2900], [2600, 2850], [2600, 2760], [2600, 2650], "M"],
  ],
  ["west gate", ["C1", [1500, 2550], [1950, 2400], [2100, 2400], [2250, 2400], [2320, 2400], "M"]],
  [
    "postern",
    [
      "C1",
      [1450, 2700],
      [1500, 2600],
      [2450, 2600],
      [2450, 2800],
      [2450, 2740],
      [2600, 2760],
      [2600, 2650],
      "M",
    ],
  ],
];
/** @type {[string, (Pt | string)[]][]} */
const t3Routes = [
  ["wall-walk", ["C3", [2120, 1060], [2120, 1850], [2600, 1950], [2600, 2050], [2600, 2150], "M"]],
  ["north gate", ["C3", [2600, 1650], [2600, 1850], [2600, 2050], [2600, 2150], "M"]],
  [
    "postern",
    [
      "C3",
      [2350, 1450],
      [2350, 1950],
      [2100, 1950],
      [2100, 2500],
      [2100, 2420],
      [2250, 2400],
      [2320, 2400],
      "M",
    ],
  ],
];

runStudy({
  id: "threefold-keep",
  name: "Threefold Keep",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "postern-w",
      path: [
        [1450, 2700],
        [1500, 2600],
        [2450, 2600],
        [2450, 2800],
      ],
      w: 110,
      label: "postern (tunnel)",
    },
    {
      id: "postern-e",
      path: [
        [3750, 2700],
        [3700, 2600],
        [2750, 2600],
        [2750, 2800],
      ],
      w: 110,
      label: "postern",
    },
    {
      id: "postern-n",
      path: [
        [2350, 1450],
        [2350, 1950],
        [2100, 1950],
        [2100, 2500],
      ],
      w: 110,
      label: "postern",
    },
  ],
  water: [
    {
      poly: [
        [600, 1100],
        [1100, 1000],
        [1400, 1250],
        [1000, 1450],
        [650, 1350],
      ],
      deep: false,
      label: "moat pool",
      at: [900, 1200],
    },
    {
      poly: [
        [4600, 1100],
        [4100, 1000],
        [3800, 1250],
        [4200, 1450],
        [4550, 1350],
      ],
      deep: false,
      label: "moat pool",
      at: [4300, 1200],
    },
  ],
  zones: [
    { kind: "spring", cx: 1500, cy: 1700, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: 3700, cy: 1700, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 2600, cy: 3700, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: 3000, cy: 800, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [
    { r: rect(1480, 2020, 24, 160), label: "barricade (breakable)" },
    { r: rect(3696, 2020, 24, 160), label: "barricade (breakable)" },
    { r: rect(2800, 1180, 180, 24), label: "barricade (breakable)" },
  ],
  gates: [
    { p: [2600, 1800], label: "gate N" },
    { p: [2600, 3000], label: "gate S" },
    { p: [2000, 2400], label: "gate W" },
    { p: [3200, 2400], label: "gate E" },
  ],
  levers: [
    { p: [2120, 1400], layer: 1, label: "lever → 4 gates" },
    { p: [1700, 2900], layer: 1, label: "lever → 4 gates" },
    { p: [3500, 2900], layer: 1, label: "lever → 4 gates" },
  ],
  lights: [
    { p: [2600, 1800], r: 150 },
    { p: [2600, 3000], r: 150 },
    { p: [2000, 2400], r: 150 },
    { p: [3200, 2400], r: 150 },
    { p: [2600, 2400], r: 240 },
    { p: [2120, 1400], r: 120 },
    { p: [1700, 2900], r: 120 },
    { p: [3500, 2900], r: 120 },
    { p: [1450, 2700], r: 130 },
    { p: [3750, 2700], r: 130 },
    { p: [2350, 1450], r: 130 },
    { p: [1060, 3110], r: 140 },
    { p: [4140, 3110], r: 140 },
    { p: [2600, 540], r: 140 },
  ],
  atmo: [
    { label: "dust in the light", cx: 2600, cy: 1350, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust in the light", cx: 1500, cy: 3700, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
    { label: "dust in the light", cx: 3700, cy: 3700, rx: 300, ry: 120, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [{ r: rect(2400, 1000, 220, 70), label: "hanging banner" }],
  drops: [
    { at: [2020, 1500], e: 1 },
    { at: [1800, 2900], e: 1 },
    { at: [3400, 2900], e: 1 },
  ],
  props: [20, 160, 200, 340, 100, 80].map((deg) => ({
    kind: /** @type {"pillar"} */ ("pillar"),
    p: /** @type {Pt} */ ([
      Math.round(c[0] + Math.cos((deg * Math.PI) / 180) * 1500),
      Math.round(c[1] + Math.sin((deg * Math.PI) / 180) * 1050),
    ]),
    r: 26,
  })),
  spawns: {
    t1: seats(1000, 3000, 120, 110, 8, 1),
    t2: seats(4200, 3000, 120, 110, 8, -1),
    t3: seats(2540, 520, 120, 110, 8, 1),
  },
  ghosts: { t1: [860, 3100], t2: [4340, 3100], t3: [2600, 380] },
  objectives: [{ id: "altar", kind: "altar", p: c, layer: 2, label: "altar (hill)" }],
  centre: c,
  routes: { t1: t1Routes, t2: t1Routes.map(([n, r]) => [n, mxr(r)]), t3: t3Routes },
  objWalks: [],
  layerTitles: {
    0: "L0 keep floor, posterns",
    1: "L1 courtyard and wall-walks",
    2: "L2 tower, the hill",
  },
  planNote: "plan 5200×4400. Dashed: spawn to the hill, per team (blue T1, red T2, violet T3).",
});
