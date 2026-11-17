// Study for #3432 (part of #3077): Guild Hall Isle, an island with two guild halls, guild battle 8v8.
// Usage: node scripts/assets/3077-guild-hall-isle-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3077-study-lib.mjs";

const MW = 5200,
  MH = 3400,
  CX = 2600,
  CY = 1700;
/** @typedef {[number, number]} Pt */
/** Team 2 is the x-mirror of team 1. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string" ? ({ C1: "C2", C2: "C1", L1: "L2", L2: "L1" }[p] ?? p) : [MW - p[0], p[1]];
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(r: Pt[]) => Pt[]} */
const mxRect = (r) => [r[1], r[0], r[3], r[2]].map((p) => [MW - p[0], p[1]]);
/** @type {(p: Pt) => Pt} */
const mp = (p) => [MW - p[0], p[1]];

/** @type {(cx: number, cy: number, a: number, b: number, n?: number) => Pt[]} */
const ellipse = (cx, cy, a, b, n = 16) =>
  /** @type {Pt[]} */ (
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [Math.round(cx + a * Math.cos(t)), Math.round(cy + b * Math.sin(t))];
    })
  );

// Coast (proposed, new): ground #3b3a33 (wet sand), rock #5d6064, earth #4a4a3a, sea #1f3038.
const pal = {
  out: "#14191c",
  ground: "#3b3a33",
  deck: "#7a7468",
  deckL2: "#9a9486",
  face: "#4e4a40",
  faceE: "#3a372f",
  mound: "#5d6064",
  roof: "#5a5648",
  roofFace: "#3a372f",
  speck1: "#434237",
  speck2: "#4a4a3a",
  outside: "#1f3038",
  deep: "#14232b",
  shore: "#8fb8d6",
  shallow: "#6f94b0",
};

/** The island shore, symmetric in x. */
/** @type {Pt[]} */
const outline = Array.from({ length: 44 }, (_, i) => {
  const t = (i / 44) * Math.PI * 2;
  const r = 1 - 0.05 * Math.cos(2 * t) + 0.035 * Math.cos(6 * t);
  return [Math.round(CX + Math.cos(t) * 2600 * r), Math.round(CY + Math.sin(t) * 1550 * r)];
});

const hall = rect(1000, 1200, 900, 1000);
const gatehouse = rect(1900, 1620, 300, 160);
const tower = rect(1050, 1250, 260, 260);
const mound = rect(2450, 1500, 300, 400);
const pierN = rect(1900, 850, 1400, 160);
const pierS = rect(1900, 2390, 1400, 160);
const shapes = [
  { id: "west hall", layer: 1, poly: hall },
  { id: "east hall", layer: 1, poly: mxRect(hall) },
  { id: "west gatehouse", layer: 1, poly: gatehouse },
  { id: "east gatehouse", layer: 1, poly: mxRect(gatehouse) },
  { id: "west tower roof", layer: 2, poly: tower },
  { id: "east tower roof", layer: 2, poly: mxRect(tower) },
  { id: "flag mound", layer: 1, poly: mound },
  { id: "north pier", layer: 1, poly: pierN, look: /** @type {const} */ ("wood") },
  { id: "south pier", layer: 1, poly: pierS, look: /** @type {const} */ ("wood") },
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [];
for (const [id, r, from, north] of /** @type {[string, Pt[], number, boolean?][]} */ ([
  ["gatehouse", rect(2200, 1610, 90, 180), 0],
  ["hall-n", rect(1730, 1100, 140, 100), 0, true],
  ["hall-s", rect(1730, 2200, 140, 100), 0],
  ["tower", rect(1310, 1330, 100, 140), 1],
  ["mound-w", rect(2350, 1630, 100, 140), 0],
  ["pier-n-w", rect(1800, 840, 100, 180), 0],
  ["pier-s-w", rect(1800, 2380, 100, 180), 0],
  ["cellar", rect(1630, 2100, 140, 100), 0],
]))
  stairs.push({ id: `${id}-w`, r, from, north }, { id: `${id}-e`, r: mxRect(r), from, north });
stairs.push({ id: "pier-n-e", r: mxRect(rect(1800, 840, 100, 180)), from: 0 });
stairs.push({ id: "pier-s-e", r: mxRect(rect(1800, 2380, 100, 180)), from: 0 });

const lord1 = /** @type {Pt} */ ([1700, 1700]);
const guards1 = /** @type {Pt[]} */ ([
  [1400, 1500],
  [1650, 1450],
  [1400, 1900],
  [1650, 1950],
  [1500, 1700],
  [1250, 1700],
  [1850, 1550],
  [1850, 1850],
]);

/** Team 1's walks to team 2's lord (L2); team 2's are the mirror. */
/** @type {[string, (Pt | string)[]][]} */
const toLord = [
  [
    "gatehouse",
    [
      "C1",
      [800, 1000],
      [1700, 950],
      [2200, 1250],
      [2960, 1250],
      [2960, 1700],
      [3150, 1700],
      [3500, 1700],
      "L2",
    ],
  ],
  [
    "north pier",
    [
      "C1",
      [800, 1000],
      [1700, 900],
      [1850, 930],
      [3350, 930],
      [3400, 1000],
      [3400, 1000],
      [3400, 1150],
      [3400, 1250],
      "L2",
    ],
  ],
  [
    "south pier",
    [
      "C1",
      [800, 2400],
      [1700, 2470],
      [1850, 2470],
      [3350, 2470],
      [3400, 2400],
      [3400, 2400],
      [3400, 2250],
      [3400, 2150],
      "L2",
    ],
  ],
  ["cellar", ["C1", [800, 2400], [1700, 2750], [3200, 2750], [3500, 2150], [3500, 2050], "L2"]],
];
/** Spawn to the flag stand F at the centre. */
/** @type {[string, (Pt | string)[]][]} */
const toFlag = [
  ["north beach", ["C1", [800, 1000], [1700, 950], [2200, 1300], [2350, 1700], "F"]],
  ["south beach", ["C1", [800, 2400], [1700, 2450], [2200, 2100], [2350, 1700], "F"]],
];

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
      id: "cellar-w",
      path: [
        [2000, 2750],
        [1700, 2150],
      ],
      w: 110,
      label: "cellar (tunnel)",
    },
    {
      id: "cellar-e",
      path: [
        [MW - 2000, 2750],
        [MW - 1700, 2150],
      ],
      w: 110,
      label: "cellar",
    },
  ],
  water: [
    { poly: ellipse(2600, 930, 760, 150, 20), deep: false, label: "shallows", at: [2600, 1060] },
    { poly: ellipse(2600, 2470, 760, 150, 20), deep: false, label: "shallows", at: [2600, 2600] },
  ],
  zones: [
    { kind: "spring", cx: 700, cy: 700, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 700, cy: 2700, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: MW - 700, cy: 700, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
    { kind: "mire", cx: 700, cy: 2700, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
  ],
  breakables: [
    { r: rect(2050, 1020, 24, 160), label: "crate barricade (breakable)" },
    { r: rect(MW - 2074, 2220, 24, 160), label: "crate barricade (breakable)" },
  ],
  gates: [
    { p: [2000, 2750], label: "cellar gate W" },
    { p: [MW - 2000, 2750], label: "cellar gate E" },
  ],
  levers: [
    { p: [1700, 2000], layer: 1, label: "lever → cellar gates" },
    { p: [MW - 1700, 2000], layer: 1, label: "lever → cellar gates" },
  ],
  lights: [
    { p: lord1, r: 260 },
    { p: mp(lord1), r: 260 },
    { p: [CX, CY], r: 260 },
    { p: [2050, 1700], r: 190 },
    { p: [MW - 2050, 1700], r: 190 },
    { p: [500, 1200], r: 190 },
    { p: [MW - 500, 1200], r: 190 },
    { p: [560, 1665], r: 180 },
    { p: [MW - 560, 1665], r: 180 },
    { p: [2000, 2750], r: 150 },
    { p: [MW - 2000, 2750], r: 150 },
    { p: [2600, 930], r: 200 },
    { p: [2600, 2470], r: 200 },
    { p: [1700, 2000], r: 130 },
    { p: [MW - 1700, 2000], r: 130 },
  ],
  atmo: [
    { label: "sea haze", cx: 900, cy: 3000, rx: 340, ry: 120, col: "#dfe8ee", op: 0.14 },
    { label: "sea haze", cx: MW - 900, cy: 400, rx: 340, ry: 120, col: "#dfe8ee", op: 0.14 },
  ],
  overhangs: [
    { r: rect(1400, 1300, 220, 80), label: "hall eave" },
    { r: rect(MW - 1620, 1300, 220, 80), label: "hall eave" },
  ],
  drops: [
    { at: [1000, 1700], e: 1 },
    { at: [MW - 1000, 1700], e: 1 },
    { at: [2600, 1500], e: 1 },
  ],
  props: [
    ...[
      [700, 1300],
      [700, 2150],
      [MW - 700, 1300],
      [MW - 700, 2150],
      [2600, 1100],
      [2600, 2300],
      [3000, 3050],
      [2200, 380],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 44 })),
  ],
  spawns: { t1: seats(500, 1450, 120, 110, 8, 1), t2: seats(MW - 500, 1450, 120, 110, 8, -1) },
  shrines: { t1: [500, 1200], t2: [MW - 500, 1200] },
  objectives: [{ id: "F", kind: "capture-point", p: [CX, CY], layer: 1, label: "flag-stand" }],
  extras: [
    { kind: "guild-lord", p: lord1, layer: 1 },
    { kind: "guild-lord", p: mp(lord1), layer: 1 },
    { kind: "flag-spawn", p: [1500, 880] },
    { kind: "flag-spawn", p: [MW - 1500, 880] },
    ...guards1.flatMap((g) => [
      { kind: "guard", p: g, layer: 1 },
      { kind: "guard", p: mp(g), layer: 1 },
    ]),
  ],
  named: { L1: lord1, L2: mp(lord1) },
  centre: [CX, CY],
  routes: {
    t1: [
      [
        "west gatehouse (own)",
        ["C1", [800, 1000], [1700, 950], [2200, 1250], [2200, 1700], [2400, 1700], "M"],
      ],
    ],
    t2: [
      [
        "east gatehouse (own)",
        [
          "C2",
          [MW - 800, 1000],
          [MW - 1700, 950],
          [MW - 2200, 1250],
          [MW - 2200, 1700],
          [MW - 2400, 1700],
          "M",
        ],
      ],
    ],
  },
  objWalks: [
    {
      obj: "L2",
      what: "walk to the enemy guild lord",
      t1: toLord,
      t2: toLord.map(([n, r]) => [n, mxr(r)]),
    },
    {
      obj: "F",
      what: "walk to the flag stand",
      t1: toFlag,
      t2: toFlag.map(([n, r]) => [n, mxr(r)]),
    },
  ],
  layerTitles: {
    0: "L0 beach, cellars",
    1: "L1 halls, gatehouses, piers, mound",
    2: "L2 tower roofs",
  },
  planNote:
    "plan 5200×3400, the sea outside. Dashed: spawn to the enemy lord (gatehouse, north pier, south pier, cellar).",
});
