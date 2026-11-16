// Study for #3426 (part of #3074): Jungle Ruins, overgrown temple ruins, priest annihilation 2v2 to 8v8.
// Usage: node scripts/assets/3074-jungle-ruins-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3074-study-lib.mjs";

const MW = 5400,
  MH = 2800;
/** @typedef {[number, number]} Pt */
/** The far side, for the second team: point mirror, then a nudge. */
/** @type {(p: Pt | string) => Pt | string} */
const m = (p) => (typeof p === "string" ? p : [MW - p[0] + 24, MH - p[1] - 16]);
/** @type {(p: Pt) => Pt} */
const mp = (p) => /** @type {Pt} */ (m(p));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mir = (r) => r.map((p) => (p === "C1" ? "C2" : p === "S1" ? "S2" : m(p)));
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mirS = (r) => r.map((p) => (p === "C2" ? "C1" : p === "S1" ? "S2" : m(p)));

// Proposed biome `jungle` (visual-style §1 row): ground #232c26 (dark, wet, a breath teal), rock
// #5a5c52 (mossy stone), vine #4a5a35 (olive, low chroma) and clay earth #5a4a30. No tone is near
// the nature green, the friend blue or the foe red; the stone stays grey so a signal is the loudest thing.
const pal = {
  out: "#1e2622",
  ground: "#232c26",
  deck: "#7d7e6e",
  deckL2: "#8f9080",
  deckL3: "#a0a190",
  face: "#4b4e44",
  faceE: "#393c33",
  mound: "#5a5c52",
  roof: "#5d5a3e",
  roofFace: "#3d3b2a",
  plant: "#4a5a35",
  plantLit: "#657a48",
  speck1: "#2f3b31",
  speck2: "#4a3e2a",
  outside: "#27322b",
};

/** A river reach as a quad of the given width round the line a to b. */
/** @type {(a: Pt, b: Pt, w: number) => Pt[]} */
const reach = (a, b, w) => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = (-(b[1] - a[1]) / d) * (w / 2),
    ny = ((b[0] - a[0]) / d) * (w / 2);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
};
/** @type {(c: Pt, r: number, k: number, rot?: number) => Pt[]} */
const ring = (c, r, k, rot = 0) =>
  Array.from({ length: k }, (_, i) => {
    const t = rot + (i * 2 * Math.PI) / k;
    return /** @type {Pt} */ ([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r * 0.78]);
  });

/** @type {Pt[]} */
const west = [
  [2700, 90],
  [1900, 70],
  [1100, 120],
  [450, 500],
  [180, 1100],
  [200, 1800],
  [560, 2350],
  [1300, 2640],
  [2100, 2700],
  [2700, 2700],
];
/** @type {Pt[]} */
const outline = [...west, ...west.map(mp)];
const C = /** @type {Pt} */ ([2700, 1400]);

const shapes = [
  {
    id: "pyramid terrace 1",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: ring(C, 520, 10, 0.3),
  },
  { id: "pyramid terrace 2", layer: 2, poly: ring(C, 350, 8, 0.2) },
  { id: "pyramid summit", layer: 3, poly: ring(C, 170, 8, 0.4) },
  {
    id: "west court",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [1100, 1000],
      [1600, 950],
      [1700, 1250],
      [1150, 1300],
    ]),
  },
  {
    id: "east court",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: /** @type {Pt[]} */ ([
      [4324, 1484],
      [3824, 1534],
      [3674, 1334],
      [4224, 1274],
    ]),
  },
  {
    id: "log bridge (north-west)",
    layer: 1,
    look: /** @type {"wood"} */ ("wood"),
    poly: /** @type {Pt[]} */ ([
      [1372, 453],
      [1585, 130],
      [1628, 147],
      [1415, 470],
    ]),
  },
  {
    id: "log bridge (south-east)",
    layer: 1,
    look: /** @type {"wood"} */ ("wood"),
    poly: /** @type {Pt[]} */ ([
      [4052, 2347],
      [3839, 2670],
      [3796, 2653],
      [4009, 2330],
    ]),
  },
];

const stairs = [
  { id: "stair-s", r: rect(2640, 1880, 140, 100), from: 0 },
  { id: "stair-n", r: rect(2640, 820, 140, 100), from: 0, north: true },
  { id: "t1-stair-s", r: rect(2660, 1730, 120, 80), from: 1 },
  { id: "t1-stair-n", r: rect(2660, 990, 120, 80), from: 1, north: true },
  { id: "top-stair-s", r: rect(2670, 1570, 100, 70), from: 2 },
  { id: "top-stair-n", r: rect(2670, 1160, 100, 70), from: 2, north: true },
  { id: "stair-wc", r: rect(1300, 1300, 140, 100), from: 0 },
  { id: "stair-ec", r: rect(3900, 1384, 140, 100), from: 0, north: true },
  { id: "bridge-nw-a", r: rect(1300, 470, 140, 100), from: 0 },
  { id: "bridge-nw-b", r: rect(1560, 30, 140, 100), from: 0, north: true },
  { id: "bridge-se-a", r: rect(3984, 2230, 140, 100), from: 0, north: true },
  { id: "bridge-se-b", r: rect(3740, 2670, 140, 100), from: 0 },
];

const C1 = "C1",
  S1 = "S1",
  M = "M";
const routes = {
  t1: /** @type {[string, (Pt | string)[]][]} */ ([
    ["south approach", [C1, [1600, 1850], [2700, 1930], [2710, 1770], [2720, 1600], M]],
    ["north ford", [C1, [1500, 1050], [2200, 890], [2710, 790], [2720, 1030], [2720, 1200], M]],
    [
      "log bridge",
      [
        C1,
        [1200, 800],
        [1370, 470],
        [1600, 140],
        [2100, 500],
        [2710, 790],
        [2720, 1030],
        [2720, 1200],
        M,
      ],
    ],
  ]),
};
const toShrine1 = /** @type {[string, (Pt | string)[]][]} */ ([
  ["north ford", ["C2", [3200, 900], [2200, 890], [1300, 950], S1]],
  ["south ford", ["C2", [4000, 1900], [3224, 1894], [2300, 1900], [1300, 1500], S1]],
  ["hidden passage", ["C2", [3700, 1100], [3400, 1050], M, [2000, 1750], [1300, 1300], S1]],
]);

runStudy({
  id: "jungle-ruins",
  name: "Jungle Ruins",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "hidden-passage",
      path: [
        [2000, 1750],
        [2700, 1400],
        [3400, 1050],
      ],
      w: 110,
      label: "hidden passage (tunnel)",
    },
  ],
  water: [
    { poly: reach([1200, 60], [2060, 780], 260), deep: true, label: "river", at: [1150, 330] },
    {
      poly: reach([2060, 780], [2360, 1020], 260),
      deep: false,
      label: "ford (shallow)",
      at: [2350, 760],
    },
    { poly: reach([2360, 1020], [2480, 1120], 260), deep: true },
    {
      poly: reach(mp([1200, 60]), mp([2060, 780]), 260),
      deep: true,
      label: "river",
      at: [4000, 2500],
    },
    {
      poly: reach(mp([2060, 780]), mp([2360, 1020]), 260),
      deep: false,
      label: "ford (shallow)",
      at: [3000, 2000],
    },
    { poly: reach(mp([2360, 1020]), mp([2480, 1120]), 260), deep: true },
  ],
  zones: [
    { kind: "spring", cx: 1000, cy: 2300, rx: 150, ry: 62, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: 4400, cy: 500, rx: 160, ry: 66, fill: "#3a3326", edge: "#1e1a12" },
  ],
  breakables: [{ r: rect(1850, 1500, 24, 200), label: "vine-choked wall (breakable)" }],
  gates: [
    { p: [2250, 1625], label: "hidden door (south-west)" },
    { p: [3174, 1175], label: "hidden door (north-east)" },
  ],
  levers: [
    { p: [1400, 1150], layer: 1, label: "lever → both doors" },
    { p: [4024, 1400], layer: 1, label: "lever → both doors" },
  ],
  lights: [
    { p: [2000, 1750], r: 150 },
    { p: [3400, 1050], r: 150 },
    { p: [2710, 1930], r: 150 },
    { p: [2710, 780], r: 150 },
    { p: [2200, 890], r: 150 },
    { p: [3224, 1894], r: 150 },
    { p: [1400, 1150], r: 140 },
    { p: [4024, 1400], r: 140 },
    { p: [900, 1000], r: 220 },
    { p: [4524, 1784], r: 220 },
    { p: [2700, 1400], r: 220 },
  ],
  atmo: [
    { label: "river mist", cx: 1400, cy: 500, rx: 260, ry: 100, col: "#c8d4e4", op: 0.22 },
    { label: "river mist", cx: 4000, cy: 2300, rx: 260, ry: 100, col: "#c8d4e4", op: 0.22 },
    { label: "mist (ruins)", cx: 2000, cy: 2200, rx: 260, ry: 90, col: "#c8d4e4", op: 0.2 },
  ],
  overhangs: [
    { r: rect(1000, 1560, 260, 80), label: "canopy" },
    { r: rect(4144, 1160, 260, 80), label: "canopy" },
  ],
  drops: [
    { at: [1400, 1300], e: 1 },
    { at: [4000, 1300], e: 1 },
    { at: [2700, 1020], e: 1 },
    { at: [2700, 1800], e: 1 },
  ],
  props: [
    ...[0, 1, 2, 3, 4, 5].flatMap((i) => [
      {
        kind: /** @type {"pillar"} */ ("pillar"),
        p: /** @type {Pt} */ ([1750 + i * 90, 1420 + (i % 2) * 110]),
        r: 26,
      },
      {
        kind: /** @type {"pillar"} */ ("pillar"),
        p: /** @type {Pt} */ (mp([1750 + i * 90, 1420 + (i % 2) * 110])),
        r: 26,
      },
    ]),
    ...[
      [1000, 700],
      [1300, 1900],
      [700, 2150],
      [2000, 2450],
      [3100, 700],
      [4400, 1100],
      [4100, 2000],
      [3300, 2450],
    ].map((p) => ({ kind: /** @type {"tree"} */ ("tree"), p: /** @type {Pt} */ (p), r: 62 })),
    ...[
      [800, 1500],
      [1800, 2200],
      [2300, 500],
      [3200, 2300],
      [4600, 1400],
      [3600, 800],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 40 })),
  ],
  spawns: { t1: seats(700, 1240, 120, 110, 8, 1), t2: seats(4724, 1214, 120, 110, 8, -1) },
  shrines: { t1: [900, 1000], t2: [4524, 1784] },
  ghosts: { t1: [700, 800], t2: [4724, 1984] },
  extras: [
    { kind: "storm-beacon", p: [2700, 1400], layer: 3 },
    { kind: "flag-spawn", p: [1100, 1750] },
    { kind: "flag-spawn", p: [4324, 1034] },
  ],
  centre: [2700, 1400],
  routes: { t1: routes.t1, t2: routes.t1.map(([n, r]) => [n, mir(r)]) },
  toShrine: { t1: toShrine1, t2: toShrine1.map(([n, r]) => [n, mirS(r)]) },
  shrineCentre: {
    t1: [S1, [1500, 1100], [2200, 890], [2710, 790], [2720, 1030], [2720, 1200], M],
    t2: [
      "S2",
      ...[
        [1500, 1100],
        [2200, 890],
        [2710, 790],
        [2720, 1030],
        [2720, 1200],
      ].map(m),
      M,
    ],
  },
  layerTitles: {
    0: "L0 jungle floor, river, passage",
    1: "L1 terrace, courts, log bridges",
    2: "L2 terrace",
    3: "L3 summit",
  },
  planNote:
    "plan 5400×2800. Dashed: spawn to centre (south approach, north ford, log bridge); dotted gold: shrine to centre.",
});
