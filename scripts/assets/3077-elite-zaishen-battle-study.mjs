// Study for #3432 (part of #3077): The Elite Zaishen Battle, a ceremonial arena with tiered stands, plinths and a sunken floor, annihilation 8v8.
// Usage: node scripts/assets/3077-elite-zaishen-battle-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3077-study-lib.mjs";

const MW = 5400,
  MH = 2400;
/** @typedef {[number, number]} Pt */
/** The south half, for the second team: point mirror about the centre. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0], MH - p[1]]);
/** @type {(r: Pt[]) => Pt[]} */
const mirPoly = (r) => r.map((p) => /** @type {Pt} */ (m(p)));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));

// Biome `hall` (the Hall of Heroes' tones): a built arena of blue-grey stone.
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

// A walled (rectangular) outline with cut corners.
/** @type {Pt[]} */
const outline = [
  [260, 150],
  [5140, 150],
  [5200, 210],
  [5200, 2190],
  [5140, 2250],
  [260, 2250],
  [200, 2190],
  [200, 210],
];

/** @type {(id: string, layer: number, poly: Pt[], look?: "stone", label?: string) => { id: string; layer: number; poly: Pt[]; look?: "stone"; label?: string }} */
const sh = (id, layer, poly, look, label) => ({ id, layer, poly, look, label });
/** The north half of the shapes; the south half is turned. */
const northShapes = [
  sh("north tier 1", 1, rect(800, 460, 3800, 240), "stone"),
  sh("north tier 2", 2, rect(1100, 220, 3200, 240), "stone"),
  sh("plinth W", 1, rect(1300, 1000, 220, 220), "stone"),
  sh("plinth N", 1, rect(2250, 820, 220, 200), "stone"),
];
const shapes = [
  ...northShapes.map((s) => ({
    ...s,
    id: s.id,
  })),
  ...northShapes.map((s) => ({
    ...s,
    id: s.id
      .replace("north", "south")
      .replace("plinth W", "plinth E")
      .replace("plinth N", "plinth S"),
    poly: mirPoly(s.poly),
  })),
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const northStairs = [
  { id: "stair-t1-w", r: rect(1000, 700, 140, 100), from: 0 },
  { id: "stair-t1-m", r: rect(2100, 700, 140, 100), from: 0 },
  { id: "stair-t1-e", r: rect(4260, 700, 140, 100), from: 0 },
  { id: "stair-t2-m", r: rect(2500, 400, 140, 100), from: 1, north: true },
  { id: "stair-t2-w", r: rect(1300, 400, 140, 100), from: 1, north: true },
];
const stairs = [
  ...northStairs,
  ...northStairs.map((s) => ({
    ...s,
    id: `${s.id}-S`,
    r: mirPoly(s.r),
    north: s.north === undefined ? undefined : !s.north,
  })),
];

const approach = {
  floor: /** @type {(Pt | string)[]} */ ([
    "C1",
    [900, 1450],
    [1500, 1550],
    [2000, 950],
    [2300, 1150],
    "M",
  ]),
  undercroft: /** @type {(Pt | string)[]} */ ([
    "C1",
    [1600, 820],
    [1600, 580],
    [2200, 580],
    [2200, 760],
    "M",
  ]),
  stand: /** @type {(Pt | string)[]} */ ([
    "C1",
    [1000, 820],
    [1060, 600],
    [2100, 560],
    [2170, 760],
    "M",
  ]),
};
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ...Object.entries(approach),
    ["high ground (north tier 2)", ["C1", [1000, 820], [1060, 600], [1370, 440], [1500, 300]]],
  ]),
};
const toSpawn1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["floor", ["C2", [4400, 1400], [3700, 1000], "M", [1700, 1400], [1000, 1000], "S1"]],
  [
    "undercroft",
    [
      ...mir(approach.undercroft).slice(0, -1),
      "M",
      [2200, 760],
      [2200, 580],
      [1600, 580],
      [1600, 820],
      "S1",
    ],
  ],
]);

runStudy({
  id: "elite-zaishen-battle",
  name: "The Elite Zaishen Battle",
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
        [1600, 720],
        [1600, 580],
        [2200, 580],
        [2200, 720],
      ],
      w: 120,
      label: "undercroft (tunnel)",
    },
    {
      id: "undercroft-s",
      path: mirPoly([
        [1600, 720],
        [1600, 580],
        [2200, 580],
        [2200, 720],
      ]),
      w: 120,
      label: "undercroft (tunnel)",
    },
  ],
  zones: [
    { kind: "spring", cx: 2700, cy: 1000, rx: 160, ry: 60, fill: "#4a7a8a", edge: "#244050" },
    { kind: "spring", cx: 2700, cy: 1400, rx: 160, ry: 60, fill: "#4a7a8a", edge: "#244050" },
    { kind: "mire", cx: 800, cy: 1500, rx: 150, ry: 54, fill: "#4a3f36", edge: "#2a221c" },
    { kind: "mire", cx: 4600, cy: 900, rx: 150, ry: 54, fill: "#4a3f36", edge: "#2a221c" },
  ],
  breakables: [
    { r: rect(2000, 1500, 24, 200), label: "statue screen (breakable)" },
    { r: rect(3376, 700, 24, 200), label: "statue screen (breakable)" },
  ],
  gates: [
    { p: [1600, 740], label: "undercroft portcullis" },
    { p: [3800, 1660], label: "undercroft portcullis" },
  ],
  levers: [
    { p: [2000, 560], layer: 1, label: "lever → south portcullis" },
    { p: [3400, 1840], layer: 1, label: "lever → north portcullis" },
  ],
  lights: [
    { p: [1600, 760], r: 150 },
    { p: [2200, 760], r: 150 },
    { p: [3000, 1640], r: 150 },
    { p: [3800, 1640], r: 150 },
    { p: [2700, 1200], r: 280, col: "#ffd890" },
    { p: [1000, 760], r: 160 },
    { p: [4400, 1640], r: 160 },
    { p: [1400, 1100], r: 150 },
    { p: [4000, 1300], r: 150 },
    { p: [2360, 920], r: 150 },
    { p: [3040, 1480], r: 150 },
    { p: [2000, 520], r: 140 },
    { p: [3400, 1880], r: 140 },
    { p: [1500, 330], r: 150 },
    { p: [3900, 2070], r: 150 },
    { p: [600, 1200], r: 220 },
    { p: [4800, 1200], r: 220 },
  ],
  atmo: [
    {
      label: "dust haze (the sand)",
      cx: 2700,
      cy: 1200,
      rx: 380,
      ry: 120,
      col: "#e8d8b0",
      op: 0.18,
    },
  ],
  overhangs: [
    { r: rect(1000, 1700, 300, 80), label: "box awning" },
    { r: rect(4100, 620, 300, 80), label: "box awning" },
  ],
  drops: [
    { at: [900, 700], e: 1 },
    { at: [4500, 1700], e: 1 },
    { at: [3000, 700], e: 1 },
    { at: [2400, 1700], e: 1 },
  ],
  props: [
    ...[
      [2000, 1000],
      [1000, 1400],
      [1700, 1250],
    ].flatMap((p) => [
      { kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (p), r: 30 },
      { kind: /** @type {"pillar"} */ ("pillar"), p: /** @type {Pt} */ (m(p)), r: 30 },
    ]),
    ...[
      [600, 700],
      [3000, 1000],
    ].flatMap((p) => [
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 40 },
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (m(p)), r: 40 },
    ]),
  ],
  spawns: { t1: seats(220, 1050, 120, 110, 8, 1), t2: seats(5180, 1020, 120, 110, 8, -1) },
  targets: { t1: [280, 1215], t2: [5120, 1185] },
  targetName: "enemy spawn",
  extras: [{ kind: "start-line", p: [2700, 1200] }],
  centre: [2700, 1200],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: {
    t1: toSpawn1,
    t2: toSpawn1.map(([n, r]) => [
      n,
      r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : p === "M" ? "M" : m(p))),
    ]),
  },
  shrineCentre: {
    t1: ["S1", [1000, 1000], [1700, 1400], [2300, 1100], "M"],
    t2: [
      "S2",
      ...[
        [1000, 1000],
        [1700, 1400],
        [2300, 1100],
      ].map(m),
      "M",
    ],
  },
  layerTitles: {
    0: "L0 sunken floor, undercrofts",
    1: "L1 tier 1 stands, plinths",
    2: "L2 tier 2 stands",
  },
  planNote:
    "plan 5400×2400. Dashed: spawn to the start line (floor, undercroft, over the stand) and to the high ground; dotted gold: spawn to spawn.",
});
