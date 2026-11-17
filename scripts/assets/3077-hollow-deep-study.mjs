// Study for #3432 (part of #3077): The Hollow Deep, a cavern with a central chasm and rope bridges, annihilation 8v8.
// Usage: node scripts/assets/3077-hollow-deep-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3077-study-lib.mjs";

const MW = 5400,
  MH = 3600,
  CX = 2700,
  CY = 1800;
/** @typedef {[number, number]} Pt */
/** Team 2 is the x-mirror of team 1. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) => (typeof p === "string" ? ({ C1: "C2", C2: "C1" }[p] ?? p) : [MW - p[0], p[1]]);
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(r: Pt[]) => Pt[]} */
const mxRect = (r) => [r[1], r[0], r[3], r[2]].map((p) => [MW - p[0], p[1]]);

/** @type {(cx: number, cy: number, a: number, b: number, n?: number) => Pt[]} */
const ellipse = (cx, cy, a, b, n = 16) =>
  /** @type {Pt[]} */ (
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [Math.round(cx + a * Math.cos(t)), Math.round(cy + b * Math.sin(t))];
    })
  );

// Cavern (proposed, new): ground #1f2829, rock #4a5654, damp earth #3a3a32. Dark, desaturated, no plants.
const pal = {
  out: "#10161a",
  ground: "#1f2829",
  deck: "#4a5654",
  deckL2: "#66726f",
  face: "#2f3b3a",
  faceE: "#232d2d",
  mound: "#3a4543",
  roof: "#33403f",
  roofFace: "#232d2d",
  speck1: "#283334",
  speck2: "#2d3a3b",
  outside: "#161d1e",
  deep: "#080c0e",
  shore: "#8fb8d6",
  shallow: "#6f94b0",
};

/** A lobed cave wall, symmetric in x. */
/** @type {Pt[]} */
const outline = Array.from({ length: 44 }, (_, i) => {
  const t = (i / 44) * Math.PI * 2;
  const r = 1 - 0.07 * Math.cos(2 * t) + 0.04 * Math.cos(6 * t);
  return [Math.round(CX + Math.cos(t) * 2600 * r), Math.round(CY + Math.sin(t) * 1650 * r)];
});

const chasm = ellipse(CX, CY, 760, 1000, 24);
const island = rect(2400, 1500, 600, 600);
const top = rect(2550, 1700, 300, 200);
const daisW = rect(900, 1450, 500, 700);
const bridgeW = rect(1900, 1740, 500, 120);
const bridgeN = rect(2640, 780, 120, 720);
const bridgeS = rect(2640, 2100, 120, 720);
const shapes = [
  { id: "island", layer: 1, poly: island },
  { id: "lookout", layer: 2, poly: top },
  { id: "west dais", layer: 1, poly: daisW },
  { id: "east dais", layer: 1, poly: mxRect(daisW) },
  { id: "west bridge", layer: 1, poly: bridgeW, look: /** @type {const} */ ("bridge") },
  { id: "east bridge", layer: 1, poly: mxRect(bridgeW), look: /** @type {const} */ ("bridge") },
  { id: "north bridge", layer: 1, poly: bridgeN, look: /** @type {const} */ ("bridge") },
  { id: "south bridge", layer: 1, poly: bridgeS, look: /** @type {const} */ ("bridge") },
];

const stairs = [
  { id: "bridge-w", r: rect(1800, 1730, 100, 140), from: 0 },
  { id: "bridge-e", r: mxRect(rect(1800, 1730, 100, 140)), from: 0 },
  { id: "bridge-n", r: rect(2630, 680, 140, 100), from: 0, north: true },
  { id: "bridge-s", r: rect(2630, 2820, 140, 100), from: 0 },
  { id: "dais-w-w", r: rect(800, 1730, 100, 140), from: 0 },
  { id: "dais-e-w", r: mxRect(rect(800, 1730, 100, 140)), from: 0 },
  { id: "dais-w-e", r: rect(1400, 1730, 100, 140), from: 0 },
  { id: "dais-e-e", r: mxRect(rect(1400, 1730, 100, 140)), from: 0 },
  { id: "lookout-w", r: rect(2450, 1730, 100, 140), from: 1 },
  { id: "lookout-e", r: rect(2850, 1730, 100, 140), from: 1 },
];

/** @type {[string, (Pt | string)[]][]} */
const toCentre = [
  ["west bridge", ["C1", [1000, 1800], [1800, 1800], [2400, 1800], [2500, 1800], "M"]],
  [
    "north ledge",
    ["C1", [700, 1100], [1300, 600], [2200, 560], [2700, 640], [2700, 780], [2700, 1400], "M"],
  ],
  [
    "south ledge",
    ["C1", [700, 2500], [1300, 3000], [2200, 3040], [2700, 2960], [2700, 2820], [2700, 2200], "M"],
  ],
  [
    "tunnel",
    ["C1", [1000, 2400], [1500, 2550], [2400, 3050], [2700, 2960], [2700, 2820], [2700, 2200], "M"],
  ],
];

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
      id: "crawl-w",
      path: [
        [1500, 2550],
        [2400, 3050],
      ],
      w: 110,
      label: "crawl (tunnel)",
    },
    {
      id: "crawl-e",
      path: [
        [MW - 1500, 2550],
        [MW - 2400, 3050],
      ],
      w: 110,
      label: "crawl",
    },
  ],
  water: [
    { poly: chasm, deep: true, label: "chasm", at: [CX + 380, CY - 560] },
    { poly: ellipse(1100, 650, 260, 110), deep: false, label: "glow pool", at: [1100, 760] },
    {
      poly: ellipse(MW - 1100, 650, 260, 110),
      deep: false,
      label: "glow pool",
      at: [MW - 1100, 760],
    },
    { poly: ellipse(1700, 3050, 240, 100), deep: false, label: "glow pool", at: [1700, 3160] },
    {
      poly: ellipse(MW - 1700, 3050, 240, 100),
      deep: false,
      label: "glow pool",
      at: [MW - 1700, 3160],
    },
  ],
  zones: [
    { kind: "spring", cx: 520, cy: 1000, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 520, cy: 1000, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 520, cy: 2650, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
    { kind: "mire", cx: MW - 520, cy: 2650, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
  ],
  breakables: [
    { r: rect(1500, 1000, 24, 160), label: "rockfall (breakable)" },
    { r: rect(MW - 1524, 1000, 24, 160), label: "rockfall (breakable)" },
  ],
  gates: [
    { p: [1500, 2550], label: "crawl gate W" },
    { p: [MW - 1500, 2550], label: "crawl gate E" },
  ],
  levers: [
    { p: [1150, 1550], layer: 1, label: "lever → crawl gates" },
    { p: [MW - 1150, 1550], layer: 1, label: "lever → crawl gates" },
  ],
  lights: [
    { p: [1100, 650], r: 260, col: "#d6e6e4" },
    { p: [MW - 1100, 650], r: 260, col: "#d6e6e4" },
    { p: [1700, 3050], r: 240, col: "#d6e6e4" },
    { p: [MW - 1700, 3050], r: 240, col: "#d6e6e4" },
    { p: [CX, CY], r: 300 },
    { p: [2150, 1800], r: 190 },
    { p: [3250, 1800], r: 190 },
    { p: [2700, 1150], r: 190 },
    { p: [2700, 2450], r: 190 },
    { p: [1150, 1800], r: 220 },
    { p: [MW - 1150, 1800], r: 220 },
    { p: [450, 1850], r: 200 },
    { p: [MW - 450, 1850], r: 200 },
    { p: [1500, 2550], r: 150 },
    { p: [MW - 1500, 2550], r: 150 },
    { p: [2700, 560], r: 190 },
  ],
  atmo: [
    {
      label: "mist over the chasm",
      cx: CX,
      cy: CY + 700,
      rx: 320,
      ry: 130,
      col: "#c8d8d8",
      op: 0.16,
    },
    {
      label: "mist over the chasm",
      cx: CX,
      cy: CY - 700,
      rx: 320,
      ry: 130,
      col: "#c8d8d8",
      op: 0.16,
    },
  ],
  overhangs: [
    { r: rect(1700, 520, 400, 110), label: "thin ceiling (fades)" },
    { r: rect(MW - 2100, 520, 400, 110), label: "thin ceiling (fades)" },
  ],
  drops: [
    { at: [1150, 1450], e: 1 },
    { at: [MW - 1150, 1450], e: 1 },
    { at: [CX, 1500], e: 1 },
  ],
  props: [
    ...[
      [1600, 450],
      [3800, 450],
      [900, 3000],
      [4500, 3000],
      [2200, 3250],
      [3200, 3250],
      [500, 1450],
      [4900, 1450],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 44 })),
  ],
  spawns: { t1: seats(380, 1700, 120, 110, 8, 1), t2: seats(MW - 380, 1700, 120, 110, 8, -1) },
  ghosts: { t1: [330, 1450], t2: [MW - 330, 1450] },
  objectives: [],
  centre: [CX, CY],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: [],
  layerTitles: {
    0: "L0 cave floor, crawls",
    1: "L1 daises, island, rope bridges",
    2: "L2 lookout",
  },
  planNote:
    "plan 5400×3600. Dashed: spawn to the island (west bridge, north ledge + bridge, south ledge + bridge, crawl).",
});
