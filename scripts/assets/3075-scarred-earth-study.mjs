/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3430 (part of #3075): Scarred Earth, a cratered battlefield, capture points 4v4 / 8v8.
// Usage: node scripts/assets/3075-scarred-earth-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5400,
  MH = 2800,
  AX = 2700; // the great siege tower stands on this line; the other four hulks are mirrored pairs
/** @typedef {[number, number]} Pt */
/** The map is mirrored in x (west team, east team); north and south differ. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string"
    ? ({ C1: "C2", C2: "C1", P1: "P2", P2: "P1", P4: "P5", P5: "P4" }[p] ?? p)
    : [MW - p[0], p[1]];
/** @type {(r: (Pt | string)[]) => (Pt | string)[]} */
const mxr = (r) => r.map(mx);
/** @type {(poly: Pt[]) => Pt[]} */
const xPoly = (poly) => /** @type {Pt[]} */ (poly.map((p) => mx(p)));

// Volcanic (visual-style §1): ground #2b2421, rock #4a4340, earth #4a3426, ash scrub #5a5444.
// The scorched field is the volcanic earth and ash; the craters are dark, so no new row is needed.
const pal = {
  out: "#211b19",
  ground: "#2b2421",
  deck: "#7a716a",
  deckL2: "#928880",
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
  deep: "#120e0c",
  shore: "#6a5a48",
  shallow: "#4a4036",
};

/** @type {Pt[]} */
const outline = [
  [220, 1000],
  [540, 480],
  [1300, 200],
  [2300, 150],
  [3100, 150],
  [4100, 200],
  [4860, 480],
  [5180, 1000],
  [5200, 1800],
  [4860, 2320],
  [4100, 2600],
  [3100, 2650],
  [2300, 2650],
  [1300, 2600],
  [540, 2320],
  [200, 1800],
];

/** @type {(cx: number, cy: number, a: number, b: number, n?: number) => Pt[]} */
const ellipse = (cx, cy, a, b, n = 12) =>
  /** @type {Pt[]} */ (
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2,
        r = 1 + 0.07 * Math.cos(2 * t);
      return [Math.round(cx + a * r * Math.cos(t)), Math.round(cy + b * r * Math.sin(t))];
    })
  );

// The five points. P3 is the centre, on the great siege tower's deck (L2). P1/P2 (north) and P4/P5
// (south) are two mirrored pairs, one hulk nearer each base: P1 and P4 are team 1's, P2 and P5
// team 2's, each on a tower hulk's base (L1). Hull: base half width / height; top: the upper deck.
const HX = 1750;
const hulls = [
  { id: "NW hulk", cx: HX, cy: 640, a: 330, b: 140 },
  { id: "NE hulk", cx: MW - HX, cy: 640, a: 330, b: 140 },
  { id: "great siege tower", cx: AX, cy: 1400, a: 480, b: 190, top: { a: 250, b: 100 } },
  { id: "SW hulk", cx: HX, cy: 2160, a: 380, b: 150 },
  { id: "SE hulk", cx: MW - HX, cy: 2160, a: 380, b: 150 },
];
const TY = [1020, 1780]; // trench rows
const NL = 330, // north outer lane (north of the north hulks)
  SL = 2470, // south outer lane
  NI = 900, // north inner lane (between the north hulks and the north trench)
  SI = 1900; // south inner lane

const shapes = [
  ...hulls.flatMap((h) => [
    {
      id: h.id,
      layer: 1,
      look: /** @type {"mound"} */ ("mound"),
      poly: ellipse(h.cx, h.cy, h.a, h.b),
    },
    ...(h.top
      ? [{ id: `${h.id} deck`, layer: 2, poly: ellipse(h.cx, h.cy, h.top.a, h.top.b) }]
      : []),
  ]),
];

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [];
hulls.forEach((h) => {
  const id = h.id.replace(/ /g, "-");
  stairs.push({ id: `${id}-w`, r: rect(h.cx - h.a - 90, h.cy - 110, 140, 100), from: 0 });
  stairs.push({ id: `${id}-e`, r: rect(h.cx + h.a - 50, h.cy - 110, 140, 100), from: 0 });
  stairs.push({
    id: `${id}-n`,
    r: rect(h.cx - 70, h.cy - h.b - 100, 140, 100),
    from: 0,
    north: true,
  });
  stairs.push({ id: `${id}-s`, r: rect(h.cx - 70, h.cy + h.b, 140, 100), from: 0 });
  if (h.top) {
    stairs.push({ id: `${id}-top-w`, r: rect(h.cx - h.top.a - 50, h.cy - 40, 100, 80), from: 1 });
    stairs.push({ id: `${id}-top-e`, r: rect(h.cx + h.top.a - 50, h.cy - 40, 100, 80), from: 1 });
  }
});

const M = "M";
const pointOf = (/** @type {number} */ i) => `P${i + 1}`;
/** Spawn to hulk i (not the centre), two ways: the outer lane to its outer face, the inner lane to its inner face. */
const toPoint = (/** @type {number} */ i) => {
  const h = /** @type {{cx:number;cy:number;a:number;b:number}} */ (hulls[i]);
  const north = h.cy < 1400;
  const far = h.cx > AX;
  const outerLane = north ? NL : SL;
  const innerLane = north ? NI : SI;
  /** @type {(Pt | string)[]} */
  const outer = [
    "C1",
    [560, north ? 560 : 2240],
    [1100, outerLane],
    [h.cx, outerLane],
    [h.cx, north ? h.cy - h.b - 50 : h.cy + h.b + 50],
    pointOf(i),
  ];
  /** @type {(Pt | string)[]} */
  const inner = [
    "C1",
    [1300, innerLane],
    [h.cx, innerLane],
    [h.cx, north ? h.cy + h.b + 50 : h.cy - h.b - 50],
    pointOf(i),
  ];
  return /** @type {[string, (Pt | string)[]][]} */ ([
    ["outer lane", outer],
    ["inner lane", inner],
  ]).map(([n, r]) => [far ? `${n} (far)` : n, r]);
};

const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["west approach", ["C1", [1500, 1400], [AX - 650, 1400], M]],
  ["north lane", ["C1", [1300, NI], [AX - 500, NI], [AX - 500, 1340], M]],
  ["south lane", ["C1", [1300, SI], [AX - 500, SI], [AX - 500, 1340], M]],
]);

/** The craters (pits), west half; the east is the x mirror. */
const craters = [
  { cx: 820, cy: 640, a: 150, b: 90 },
  { cx: 1300, cy: 2240, a: 170, b: 100 },
  { cx: 2300, cy: 560, a: 170, b: 90 },
  { cx: 2400, cy: 2240, a: 160, b: 90 },
  { cx: 900, cy: 1950, a: 140, b: 80 },
];

runStudy({
  id: "scarred-earth",
  name: "Scarred Earth",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: TY.map((y, i) => ({
    id: i === 0 ? "trench-n" : "trench-s",
    path: /** @type {Pt[]} */ ([
      [1500, y],
      [3900, y],
    ]),
    w: 110,
    label: i === 0 ? "north trench" : "south trench",
  })),
  water: craters.flatMap(({ cx, cy, a, b }) => {
    const poly = ellipse(cx, cy, a, b, 10);
    return [
      { poly, deep: true, label: "crater", at: /** @type {Pt} */ ([cx - 50, cy + b + 50]) },
      {
        poly: xPoly(poly),
        deep: true,
        label: "crater",
        at: /** @type {Pt} */ ([MW - cx - 50, cy + b + 50]),
      },
    ];
  }),
  zones: [
    { kind: "mire", cx: 1320, cy: 1620, rx: 150, ry: 60, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: MW - 1320, cy: 1620, rx: 150, ry: 60, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "spring", cx: 1000, cy: 1250, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 1000, cy: 1250, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
  ],
  breakables: [
    { r: rect(950, 880, 24, 150), label: "wrecked palisade (breakable)" },
    { r: rect(MW - 974, 880, 24, 150), label: "wrecked palisade (breakable)" },
  ],
  gates: [
    { p: [1500, TY[0] ?? 0], label: "trench gate NW" },
    { p: [3900, TY[0] ?? 0], label: "trench gate NE" },
    { p: [1500, TY[1] ?? 0], label: "trench gate SW" },
    { p: [3900, TY[1] ?? 0], label: "trench gate SE" },
  ],
  levers: [
    { p: [HX - 200, 640], layer: 1, label: "lever → north gates" },
    { p: [MW - HX + 200, 2160], layer: 1, label: "lever → south gates" },
  ],
  lights: [
    ...hulls.map((h) => ({ p: /** @type {Pt} */ ([h.cx, h.cy]), r: 220 })),
    { p: [1500, TY[0] ?? 0], r: 150 },
    { p: [3900, TY[0] ?? 0], r: 150 },
    { p: [1500, TY[1] ?? 0], r: 150 },
    { p: [3900, TY[1] ?? 0], r: 150 },
    { p: [700, 1000], r: 180 },
    { p: [MW - 700, 1000], r: 180 },
    { p: [HX - 200, 640], r: 130 },
    { p: [MW - HX + 200, 2160], r: 130 },
  ],
  atmo: [
    { label: "smoke bank", cx: 1200, cy: 1700, rx: 260, ry: 100, col: "#c8c0b8", op: 0.2 },
    { label: "smoke bank", cx: MW - 1200, cy: 1700, rx: 260, ry: 100, col: "#c8c0b8", op: 0.2 },
    { label: "smoke bank", cx: AX, cy: 2550, rx: 300, ry: 100, col: "#c8c0b8", op: 0.18 },
  ],
  overhangs: [{ r: rect(900, 1500, 220, 70), label: "toppled beam" }],
  drops: [
    { at: [AX - 250, 1230], e: 1 },
    { at: [AX + 250, 1230], e: 1 },
    { at: [HX - 430, 640], e: 1 },
    { at: [MW - HX + 430, 640], e: 1 },
  ],
  props: [
    ...[
      [700, 1600],
      [1500, 250],
      [4300, 700],
      [3800, 1500],
      [4400, 2300],
      [AX - 500, 2500],
      [AX + 400, 250],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 38 })),
    ...[
      [800, 1300],
      [4500, 1300],
      [3000, 900],
      [2300, 1900],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 38 })),
  ],
  spawns: { t1: seats(480, 1240, 120, 110, 8, 1), t2: seats(4920, 1240, 120, 110, 8, -1) },
  shrines: { t1: [700, 1000], t2: [MW - 700, 1000] },
  objectives: hulls.map((h, i) => ({
    id: pointOf(i),
    kind: /** @type {"capture-point"} */ ("capture-point"),
    p: /** @type {Pt} */ ([h.cx, h.cy]),
    layer: i === 2 ? 2 : 1,
    label: `capture-point ${i + 1}`,
  })),
  centre: [AX, 1400],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: [
    ...[
      [0, "own hulk, north"],
      [3, "own hulk, south"],
      [1, "far hulk, north"],
      [4, "far hulk, south"],
    ].map(([i, what]) => ({
      obj: pointOf(/** @type {number} */ (i)),
      what: `spawn to the ${what}`,
      t1: toPoint(/** @type {number} */ (i)),
      t2: toPoint(/** @type {number} */ (i)).map(([n, r]) => [n, mxr(r)]),
    })),
  ],
  layerTitles: {
    0: "L0 field, craters, trenches",
    1: "L1 tower hulks",
    2: "L2 hulk decks",
  },
  planNote:
    "plan 5400×2800. Dashed: spawn to the great siege tower (west approach, north lane, south lane). The centre point and two mirrored pairs.",
});
