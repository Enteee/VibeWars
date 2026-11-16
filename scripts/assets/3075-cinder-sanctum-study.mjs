// Study for #3430 (part of #3075): Cinder Sanctum, a temple on a volcano flank, relic run 8v8.
// Usage: node scripts/assets/3075-cinder-sanctum-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5600,
  MH = 2800;
/** @typedef {[number, number]} Pt */
/** The main structure is four-fold symmetric (x mirror, y mirror, so point mirror too); props and zones are not. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string" ? (p === "C1" ? "C2" : p === "C2" ? "C1" : p) : [5624 - p[0], p[1]];
/** @type {(p: Pt | string) => Pt | string} */
const pm = (p) =>
  typeof p === "string"
    ? ({ C1: "C2", C2: "C1", R1: "R2", R2: "R1", G1: "G2", G2: "G1" }[p] ?? p)
    : [5624 - p[0], 2800 - p[1]];
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const pmr = (r) => r.map(pm);
/** @type {(poly: Pt[]) => Pt[]} */
const yPoly = (poly) => /** @type {Pt[]} */ (poly.map(([x, y]) => [x, 2800 - y]));
/** @type {(poly: Pt[]) => Pt[]} */
const xPoly = (poly) => /** @type {Pt[]} */ (poly.map((p) => mx(p)));

// Volcanic (visual-style §1): ground #2b2421, rock #4a4340, earth #4a3426, ash scrub #5a5444.
// Lava is the `molten` zone look (visual-style §7): crust #b8401a, rim #ffd23d, never a signal hue.
const pal = {
  out: "#211b19",
  ground: "#2b2421",
  deck: "#7a716a",
  deckL2: "#8f857c",
  deckL3: "#a69b90",
  face: "#4a4340",
  faceE: "#38312e",
  mound: "#5a4a3c",
  roof: "#6a625c",
  roofFace: "#443d38",
  plant: "#5a5444",
  plantLit: "#6e6a58",
  speck1: "#352d29",
  speck2: "#4a3426",
  outside: "#2f2724",
};

/** @type {Pt[]} */
const outline = [
  [200, 1000],
  [560, 500],
  [1300, 200],
  [2300, 140],
  [3300, 140],
  [4300, 200],
  [5060, 500],
  [5420, 1000],
  [5440, 1800],
  [5060, 2300],
  [4300, 2600],
  [3300, 2660],
  [2300, 2660],
  [1300, 2600],
  [560, 2300],
  [180, 1800],
];

// West half, north: bridges over the lava river (x 1500..1800) at y 900, 1400, 1900.
/** @type {(y: number) => Pt[]} */
const bridge = (y) => [
  [1380, y - 45],
  [2000, y - 45],
  [2000, y + 45],
  [1380, y + 45],
];
const nBridgeW = bridge(900),
  sBridgeW = yPoly(nBridgeW);
/** @type {Pt[]} */
const causeW = [
  [1380, 1355],
  [2224, 1355],
  [2224, 1445],
  [1380, 1445],
];
/** @type {{ id: string; layer: number; look?: "mound" | "wood"; poly: Pt[] }[]} */
const shapes = [
  { id: "north bridge W", layer: 1, look: "wood", poly: nBridgeW },
  { id: "south bridge W", layer: 1, look: "wood", poly: sBridgeW },
  { id: "causeway W", layer: 1, look: "wood", poly: causeW },
  { id: "north bridge E", layer: 1, look: "wood", poly: xPoly(nBridgeW) },
  { id: "south bridge E", layer: 1, look: "wood", poly: xPoly(sBridgeW) },
  { id: "causeway E", layer: 1, look: "wood", poly: xPoly(causeW) },
  {
    id: "forecourt",
    layer: 1,
    look: "mound",
    poly: [
      [2224, 1150],
      [2500, 1050],
      [3124, 1050],
      [3400, 1150],
      [3424, 1650],
      [3124, 1750],
      [2500, 1750],
      [2200, 1650],
    ],
  },
  {
    id: "nave",
    layer: 2,
    poly: [
      [2462, 1150],
      [3162, 1150],
      [3162, 1650],
      [2462, 1650],
    ],
  },
  {
    id: "inner sanctum",
    layer: 3,
    poly: [
      [2662, 1280],
      [2962, 1280],
      [2962, 1520],
      [2662, 1520],
    ],
  },
  {
    id: "north dais",
    layer: 1,
    poly: [
      [2512, 400],
      [3112, 400],
      [3180, 540],
      [2444, 540],
    ],
  },
  {
    id: "south dais",
    layer: 1,
    poly: yPoly([
      [2512, 400],
      [3112, 400],
      [3180, 540],
      [2444, 540],
    ]),
  },
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [
  // bridge ends, west river: bank (1300) and the middle land (2000)
  { id: "nbw-out", r: rect(1240, 850, 140, 100), from: 0 },
  { id: "nbw-in", r: rect(2000, 850, 140, 100), from: 0 },
  { id: "sbw-out", r: rect(1240, 1850, 140, 100), from: 0, north: true },
  { id: "sbw-in", r: rect(2000, 1850, 140, 100), from: 0, north: true },
  { id: "cw-out", r: rect(1240, 1350, 140, 100), from: 0 },
  // east river, the mirror
  { id: "nbe-out", r: rect(4244, 850, 140, 100), from: 0 },
  { id: "nbe-in", r: rect(3484, 850, 140, 100), from: 0 },
  { id: "sbe-out", r: rect(4244, 1850, 140, 100), from: 0, north: true },
  { id: "sbe-in", r: rect(3484, 1850, 140, 100), from: 0, north: true },
  { id: "ce-out", r: rect(4244, 1350, 140, 100), from: 0 },
  // forecourt, two stairs a face
  { id: "fore-nw", r: rect(2430, 950, 140, 100), from: 0, north: true },
  { id: "fore-ne", r: rect(3054, 950, 140, 100), from: 0, north: true },
  { id: "fore-sw", r: rect(2430, 1750, 140, 100), from: 0 },
  { id: "fore-se", r: rect(3054, 1750, 140, 100), from: 0 },
  // nave and sanctum
  { id: "nave-n", r: rect(2742, 1050, 140, 100), from: 1, north: true },
  { id: "nave-s", r: rect(2742, 1650, 140, 100), from: 1 },
  { id: "top-n", r: rect(2752, 1200, 120, 80), from: 2, north: true },
  { id: "top-s", r: rect(2752, 1520, 120, 80), from: 2 },
  // daises
  { id: "dais-nw", r: rect(2500, 540, 140, 100), from: 0 },
  { id: "dais-ne", r: rect(2984, 540, 140, 100), from: 0 },
  { id: "dais-sw", r: rect(2500, 2160, 140, 100), from: 0, north: true },
  { id: "dais-se", r: rect(2984, 2160, 140, 100), from: 0, north: true },
];

const M = "M";
const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["causeway", ["C1", [1300, 1400], [2300, 1400], M]],
  ["north bridge", ["C1", [1300, 900], [2000, 900], [2500, 880], [2500, 1000], [2700, 1150], M]],
  ["south bridge", ["C1", [1300, 1900], [2000, 1900], [2500, 1920], [2500, 1800], [2700, 1650], M]],
]);
const toRelic1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["north bridge", ["C1", [1300, 900], [2000, 900], [2500, 800], "R1"]],
  ["forecourt, north stair", ["C1", [1300, 1400], [2300, 1400], [2500, 1000], [2600, 860], "R1"]],
  ["passage (doors open)", ["C1", [1300, 1900], [2000, 1900], [2812, 1940], [2812, 860], "R1"]],
]);
const toDais = /** @type {[string, (Pt | string)[]][]} */ ([
  ["north dais", ["C1", [1300, 900], [2000, 900], [2400, 700], [2570, 590], [2700, 470]]],
  ["forecourt north rim", ["C1", [1300, 1400], [2300, 1400], [2500, 1100], [2700, 1070]]],
]);
// Carry: team 1 takes relic 2 (south) to ghost-spawn 1 (north-west); team 2 takes relic 1 to ghost-spawn 2.
const carry = /** @type {[string, (Pt | string)[]][]} */ ([
  [
    "south bridge",
    ["R2", [2500, 2000], [2000, 1900], [1300, 1900], [1100, 1300], [900, 1000], "G1"],
  ],
  ["causeway", ["R2", [2812, 1800], [2300, 1400], [1300, 1400], [1000, 1100], "G1"]],
  ["north bridge", ["R2", [2500, 1800], [2500, 1000], [2000, 900], [1300, 900], "G1"]],
  [
    "passage (doors open)",
    ["R2", [2812, 1940], [2812, 860], [2400, 880], [2000, 900], [1300, 900], "G1"],
  ],
]);

/** @type {{ kind: string; cx: number; cy: number; rx: number; ry: number; fill: string; edge: string }[]} */
const lava = [];
for (let i = 0; i < 11; i++) {
  const cx = 1650 + Math.round(60 * Math.sin(i * 1.3)),
    cy = 440 + i * 192;
  if (Math.abs(cy - 900) < 70 || Math.abs(cy - 1400) < 70 || Math.abs(cy - 1900) < 70) continue;
  for (const x of [cx, 5624 - cx])
    lava.push({ kind: "molten", cx: x, cy, rx: 170, ry: 120, fill: "#b8401a", edge: "#ffd23d" });
}
// The rivers stop short of the bridges so each bridge spans a lava gap drawn as lava under it.
for (const y of [900, 1400, 1900])
  for (const x of [1650, 5624 - 1650])
    lava.push({ kind: "molten", cx: x, cy: y, rx: 170, ry: 80, fill: "#b8401a", edge: "#ffd23d" });

runStudy({
  id: "cinder-sanctum",
  name: "Cinder Sanctum",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  lifts: [
    { id: "lift-w", r: [[2060, 1600]] },
    { id: "lift-e", r: [[3444, 1600]] },
  ].map(({ id, r }) => ({ id, r: /** @type {Pt[]} */ (r) })),
  tunnels: [
    {
      id: "hidden-passage",
      path: [
        [2812, 860],
        [2812, 1940],
      ],
      w: 110,
      label: "hidden passage (tunnel)",
    },
  ],
  zones: [
    ...lava,
    { kind: "spring", cx: 900, cy: 2350, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 4700, cy: 480, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [{ r: rect(2380, 2000, 200, 24), label: "ash wall (breakable)" }],
  gates: [
    { p: [2812, 860], label: "passage door N" },
    { p: [2812, 1940], label: "passage door S" },
  ],
  levers: [
    { p: [2300, 1250], layer: 1, label: "lever → both doors" },
    { p: [3324, 1550], layer: 1, label: "lever → both doors" },
  ],
  lights: [
    { p: [2812, 860], r: 150 },
    { p: [2812, 1940], r: 150 },
    { p: [2812, 1400], r: 220, col: "#ffb060" },
    { p: [2812, 720], r: 220 },
    { p: [2812, 2080], r: 220 },
    { p: [700, 860], r: 180 },
    { p: [4924, 1940], r: 180 },
    { p: [700, 1940], r: 180 },
    { p: [4924, 860], r: 180 },
    { p: [1650, 1400], r: 260, col: "#ff9040" },
    { p: [3974, 1400], r: 260, col: "#ff9040" },
    { p: [1650, 700], r: 220, col: "#ff9040" },
    { p: [3974, 2100], r: 220, col: "#ff9040" },
    { p: [2300, 1250], r: 130 },
    { p: [3324, 1550], r: 130 },
  ],
  atmo: [
    { label: "ash drift", cx: 1000, cy: 700, rx: 300, ry: 120, col: "#c8c0b8", op: 0.2 },
    { label: "ash drift", cx: 4600, cy: 2100, rx: 300, ry: 120, col: "#c8c0b8", op: 0.2 },
    { label: "ash drift", cx: 2800, cy: 2450, rx: 300, ry: 100, col: "#c8c0b8", op: 0.18 },
  ],
  overhangs: [{ r: rect(1200, 2050, 220, 70), label: "fallen lintel" }],
  drops: [
    { at: [2812, 400], e: 1 },
    { at: [2812, 2400], e: 1 },
    { at: [3300, 1700], e: 1 },
    { at: [2300, 1100], e: 1 },
  ],
  props: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      kind: /** @type {"pillar"} */ ("pillar"),
      p: /** @type {Pt} */ ([2250 + (i % 4) * 365 + (i > 3 ? 20 : 0), i > 3 ? 1700 : 1100]),
      r: 26,
      layer: 1,
    })),
    ...[
      [800, 1600],
      [1000, 500],
      [4700, 1200],
      [4300, 2300],
      [2000, 2300],
      [3700, 600],
      [800, 1100],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 36 })),
    ...[
      [1000, 2200],
      [4600, 700],
      [2400, 560],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 38 })),
  ],
  spawns: { t1: seats(480, 1260, 120, 110, 8, 1), t2: seats(5144, 1260, 120, 110, 8, -1) },
  shrines: { t1: [700, 1940], t2: [4924, 860] },
  ghosts: { t1: [700, 860], t2: [4924, 1940] },
  objectives: [
    { id: "R1", kind: "relic-spawn", p: [2812, 720], label: "relic-spawn 1" },
    { id: "R2", kind: "relic-spawn", p: [2812, 2080], label: "relic-spawn 2" },
  ],
  named: { G1: [700, 860], G2: [4924, 1940] },
  centre: [2812, 1400],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: [
    {
      obj: "relic 1",
      what: "spawn to relic",
      t1: toRelic1,
      t2: toRelic1.map(([n, r]) => [n, mxr(r)]),
    },
    { obj: "relic 1", what: "high ground", t1: toDais, t2: toDais.map(([n, r]) => [n, mxr(r)]) },
    {
      obj: "carry",
      what: "T1 R2→G1 / T2 R1→G2",
      t1: carry,
      t2: carry.map(([n, r]) => [n, pmr(r)]),
    },
  ],
  layerTitles: {
    0: "L0 flank, lava, passage",
    1: "L1 bridges, forecourt, daises",
    2: "L2 nave",
    3: "L3 inner sanctum",
  },
  planNote:
    "plan 5600×2800. Dashed: spawn to the sanctum (causeway, north bridge, south bridge). Relics mid-field; carry to the far ghost-spawn.",
});
