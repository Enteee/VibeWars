// Study for #3432 (part of #3077): The Hollow Deep, a cavern with a chasm, rope bridges and glowing pools, annihilation 8v8.
// Usage: node scripts/assets/3077-hollow-deep-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3077-study-lib.mjs";

const MW = 6200,
  MH = 2400;
/** @typedef {[number, number]} Pt */
/** The east half, for the second team: point mirror. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0], MH - p[1]]);
/** @type {(r: Pt[]) => Pt[]} */
const mirPoly = (r) => r.map((p) => /** @type {Pt} */ (m(p)));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));

// Proposed biome `cavern` (visual-style §1 row): ground #232a33, rock #4a5260 (a cold slate),
// glow #8a6fc9 (a mushroom violet, hue ~260 deg). The friend blue is ~200 deg, the foe red ~5 deg and
// the nature green ~110 deg, so the glow is clear of all three.
const pal = {
  out: "#171c23",
  ground: "#232a33",
  deck: "#6b7280",
  deckL2: "#8a909c",
  face: "#3d4552",
  faceE: "#2e3541",
  mound: "#4a5260",
  roof: "#4a5260",
  roofFace: "#2e3541",
  plant: "#5a4a82",
  plantLit: "#8a6fc9",
  speck1: "#2a323d",
  speck2: "#31293f",
  outside: "#1c222a",
};

/** @type {Pt[]} */
const west = [
  [3000, 120],
  [2400, 100],
  [1600, 120],
  [900, 200],
  [380, 400],
  [180, 800],
  [140, 1200],
  [200, 1700],
  [420, 2050],
  [900, 2250],
  [1600, 2300],
  [2400, 2290],
  [3000, 2280],
];
/** @type {Pt[]} */
const outline = [...west, ...west.map((p) => /** @type {Pt} */ (m(p)))];

/** @type {(id: string, layer: number, poly: Pt[], look?: "bridge" | "stone", label?: string) => { id: string; layer: number; poly: Pt[]; look?: "bridge" | "stone"; label?: string }} */
const sh = (id, layer, poly, look, label) => ({ id, layer, poly, look, label });
const shapes = [
  sh("west mid ledge", 1, rect(1900, 900, 760, 600), "stone"),
  sh("east mid ledge", 1, mirPoly(rect(1900, 900, 760, 600)), "stone"),
  sh("north-west shelf", 1, rect(1540, 460, 920, 340), "stone"),
  sh("south-west shelf", 1, rect(1540, 1600, 920, 340), "stone"),
  sh("north-east shelf", 1, rect(3740, 460, 920, 340), "stone"),
  sh("south-east shelf", 1, rect(3740, 1600, 920, 340), "stone"),
  sh("north rope bridge", 1, rect(2460, 500, 1280, 120), "bridge"),
  sh("south rope bridge", 1, rect(2460, 1780, 1280, 120), "bridge"),
  sh("dais", 1, rect(2950, 1060, 300, 280), "stone"),
  sh("crown", 2, rect(3010, 1110, 180, 180), "stone"),
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [
  { id: "stair-nw", r: rect(1400, 660, 140, 100), from: 0 },
  { id: "stair-sw", r: rect(1400, 1640, 140, 100), from: 0, north: true },
  { id: "stair-ne", r: rect(4660, 660, 140, 100), from: 0 },
  { id: "stair-se", r: rect(4660, 1640, 140, 100), from: 0, north: true },
  { id: "stair-mlw", r: rect(1760, 1000, 140, 100), from: 0 },
  { id: "stair-mle", r: rect(4300, 1300, 140, 100), from: 0 },
  { id: "stair-ns", r: rect(2480, 720, 140, 110), from: 0 },
  { id: "stair-ss", r: rect(2480, 1570, 140, 110), from: 0, north: true },
  { id: "dais-w", r: rect(2800, 1180, 150, 80), from: 0 },
  { id: "crown-stair", r: rect(3040, 1290, 120, 80), from: 1 },
];

const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["undercroft", ["C1", [1900, 1200], [2300, 1330], [2700, 1200], "M"]],
    ["over the ledge", ["C1", [1700, 1050], [2000, 1000], [2650, 1000], [2800, 1000], "M"]],
    ["north shelf", ["C1", [1470, 710], [2540, 780], [2700, 950], "M"]],
    ["south shelf", ["C1", [1470, 1690], [2540, 1620], [2700, 1450], "M"]],
  ]),
};
const toGhost1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["north bridge", ["C2", [5500, 1100], [4500, 500], [3100, 560], [2300, 560], [800, 420], "S1"]],
  ["middle", ["C2", [4300, 1200], "M", [1900, 1200], [900, 900], "S1"]],
  [
    "south bridge",
    ["C2", [5500, 1300], [4500, 1900], [3100, 1840], [2300, 1840], [1000, 1400], [800, 700], "S1"],
  ],
]);

runStudy({
  id: "hollow-deep",
  name: "The Hollow Deep",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "undercroft-w",
      path: [
        [1900, 1200],
        [2700, 1200],
      ],
      w: 120,
      label: "undercroft (tunnel)",
    },
    {
      id: "undercroft-e",
      path: mirPoly([
        [1900, 1200],
        [2700, 1200],
      ]),
      w: 120,
      label: "undercroft (tunnel)",
    },
  ],
  water: [
    {
      poly: [
        [2700, 130],
        [3500, 130],
        [3500, 850],
        [2700, 850],
      ],
      deep: true,
      label: "north chasm",
      at: [2900, 400],
    },
    {
      poly: [
        [2700, 1550],
        [3500, 1550],
        [3500, 2270],
        [2700, 2270],
      ],
      deep: true,
      label: "south chasm",
      at: [2900, 2050],
    },
    {
      poly: [
        [700, 1500],
        [1100, 1460],
        [1200, 1700],
        [800, 1760],
      ],
      deep: false,
      label: "glow pool",
      at: [720, 1640],
    },
    {
      poly: mirPoly([
        [700, 1500],
        [1100, 1460],
        [1200, 1700],
        [800, 1760],
      ]),
      deep: false,
      label: "glow pool",
      at: [4960, 640],
    },
  ],
  zones: [
    { kind: "spring", cx: 1100, cy: 800, rx: 150, ry: 60, fill: "#4a3f78", edge: "#241d3e" },
    { kind: "spring", cx: 5100, cy: 1600, rx: 150, ry: 60, fill: "#4a3f78", edge: "#241d3e" },
    { kind: "mire", cx: 3100, cy: 760, rx: 150, ry: 50, fill: "#2d2a38", edge: "#15131c" },
    { kind: "mire", cx: 3100, cy: 1640, rx: 150, ry: 50, fill: "#2d2a38", edge: "#15131c" },
  ],
  breakables: [
    { r: rect(780, 560, 24, 240), label: "stalagmite wall (breakable)" },
    { r: rect(5396, 1600, 24, 240), label: "stalagmite wall (breakable)" },
  ],
  gates: [
    { p: [1920, 1200], label: "undercroft gate" },
    { p: [4280, 1200], label: "undercroft gate" },
  ],
  levers: [
    { p: [2300, 450], layer: 1, label: "lever → west gate" },
    { p: [3900, 1950], layer: 1, label: "lever → east gate" },
  ],
  lights: [
    { p: [1100, 800], r: 220, col: "#8a6fc9" },
    { p: [5100, 1600], r: 220, col: "#8a6fc9" },
    { p: [950, 1630], r: 200, col: "#8a6fc9" },
    { p: [5250, 770], r: 200, col: "#8a6fc9" },
    { p: [1900, 1200], r: 150 },
    { p: [2700, 1200], r: 150 },
    { p: [3500, 1200], r: 150 },
    { p: [4300, 1200], r: 150 },
    { p: [3100, 1200], r: 260, col: "#8a6fc9" },
    { p: [3100, 560], r: 160 },
    { p: [3100, 1840], r: 160 },
    { p: [2000, 530], r: 150 },
    { p: [4200, 1870], r: 150 },
    { p: [600, 1200], r: 220 },
    { p: [5600, 1200], r: 220 },
    { p: [2300, 450], r: 140 },
    { p: [3900, 1950], r: 140 },
  ],
  atmo: [
    {
      label: "mist (over the chasm)",
      cx: 3100,
      cy: 500,
      rx: 300,
      ry: 110,
      col: "#c8d4e4",
      op: 0.2,
    },
    {
      label: "mist (over the chasm)",
      cx: 3100,
      cy: 1900,
      rx: 300,
      ry: 110,
      col: "#c8d4e4",
      op: 0.2,
    },
  ],
  overhangs: [
    { r: rect(1000, 1060, 260, 80), label: "ceiling lip" },
    { r: rect(4940, 1260, 260, 80), label: "ceiling lip" },
  ],
  drops: [
    { at: [1900, 700], e: 1 },
    { at: [1900, 1700], e: 1 },
    { at: [4300, 700], e: 1 },
    { at: [4300, 1700], e: 1 },
  ],
  props: [
    ...[
      [900, 500],
      [1300, 1100],
      [700, 1900],
      [1500, 1400],
      [2400, 950],
      [3100, 950],
      [3100, 1450],
    ].flatMap((p) => [
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 44 },
      { kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (m(p)), r: 44 },
    ]),
    ...[
      [1000, 1600],
      [1200, 560],
      [2600, 1200],
    ].flatMap((p) => [
      { kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 40 },
      { kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (m(p)), r: 40 },
    ]),
  ],
  spawns: { t1: seats(300, 1050, 120, 110, 8, 1), t2: seats(5900, 1050, 120, 110, 8, -1) },
  targets: { t1: [520, 420], t2: [5680, 1980] },
  targetName: "ghost-spawn",
  ghosts: { t1: [520, 420], t2: [5680, 1980] },
  centre: [3100, 1200],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: {
    t1: toGhost1,
    t2: toGhost1.map(([n, r]) => [
      n,
      r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : p === "M" ? "M" : m(p))),
    ]),
  },
  shrineCentre: {
    t1: ["S1", [1200, 900], [1900, 1200], [2700, 1200], "M"],
    t2: [
      "S2",
      ...[
        [1200, 900],
        [1900, 1200],
        [2700, 1200],
      ].map(m),
      "M",
    ],
  },
  layerTitles: {
    0: "L0 cave floor, undercroft, chamber",
    1: "L1 shelves, ledges, rope bridges, dais",
    2: "L2 crown",
  },
  planNote:
    "plan 6200×2400. Dashed: spawn to centre (undercroft, ledge, north and south shelf); dotted gold: ghost-spawn to centre.",
});
