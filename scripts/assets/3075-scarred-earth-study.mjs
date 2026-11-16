/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3430 (part of #3075): Scarred Earth, a cratered battlefield, capture points 4v4 / 8v8.
// Usage: node scripts/assets/3075-scarred-earth-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy, seats } from "./3075-study-lib.mjs";

const MW = 5400,
  MH = 2800,
  AX = 2700; // the five points stand on this line: equidistant from both teams
/** @typedef {[number, number]} Pt */
/** The map is mirrored in x (west team, east team); north and south differ. */
/** @type {(p: Pt | string) => Pt | string} */
const mx = (p) =>
  typeof p === "string" ? (p === "C1" ? "C2" : p === "C2" ? "C1" : p) : [MW - p[0], p[1]];
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

// The five points, north to south. P2, P3, P4 stand on wrecked siege towers; P1 and P5 on open ground
// between craters. Hull: base half width / height; top: the hull's upper deck.
const pts5 = [420, 910, 1400, 1890, 2380];
const hulls = [
  { i: 1, id: "tower hulk N", a: 330, b: 140, top: { a: 140, b: 60 }, pointOnTop: false },
  { i: 2, id: "great siege tower", a: 480, b: 190, top: { a: 250, b: 100 }, pointOnTop: true },
  { i: 3, id: "tower hulk S", a: 330, b: 140, top: { a: 140, b: 60 }, pointOnTop: false },
];

const shapes = [
  ...hulls.flatMap((h) => {
    const cy = /** @type {number} */ (pts5[h.i]);
    return [
      {
        id: h.id,
        layer: 1,
        look: /** @type {"mound"} */ ("mound"),
        poly: ellipse(AX, cy, h.a, h.b),
      },
      { id: `${h.id} deck`, layer: 2, poly: ellipse(AX, cy, h.top.a, h.top.b) },
    ];
  }),
  {
    id: "west spoil bank",
    layer: 1,
    look: /** @type {"mound"} */ ("mound"),
    poly: /** @type {Pt[]} */ ([
      [1500, 1050],
      [1950, 1000],
      [2050, 1150],
      [1950, 1250],
      [1500, 1280],
      [1380, 1160],
    ]),
  },
];
shapes.push({
  id: "east spoil bank",
  layer: 1,
  look: "mound",
  poly: xPoly(/** @type {Pt[]} */ (shapes[shapes.length - 1]?.poly)),
});

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [];
hulls.forEach((h) => {
  const cy = /** @type {number} */ (pts5[h.i]);
  stairs.push({ id: `${h.id}-w`, r: rect(AX - h.a - 90, cy - 110, 140, 100), from: 0 });
  stairs.push({ id: `${h.id}-e`, r: rect(AX + h.a - 50, cy - 110, 140, 100), from: 0 });
  stairs.push({
    id: `${h.id}-n`,
    r: rect(AX - 70, cy - h.b - 100, 140, 100),
    from: 0,
    north: true,
  });
  stairs.push({ id: `${h.id}-s`, r: rect(AX - 70, cy + h.b, 140, 100), from: 0 });
  stairs.push({ id: `${h.id}-top-w`, r: rect(AX - h.top.a - 50, cy - 40, 100, 80), from: 1 });
  stairs.push({ id: `${h.id}-top-e`, r: rect(AX + h.top.a - 50, cy - 40, 100, 80), from: 1 });
});
stairs.push({ id: "bank-w", r: rect(1620, 1280, 140, 100), from: 0 });
stairs.push({ id: "bank-e", r: rect(MW - 1760, 1280, 140, 100), from: 0 });

const M = "M";
const lane = (/** @type {number} */ i) => Math.round(((pts5[i] ?? 0) + (pts5[i + 1] ?? 0)) / 2);
const pointOf = (/** @type {number} */ i) => `P${i + 1}`;
/** Spawn to point i: across the field to the west side of its hill, or from the lane beside it. */
const toPoint = (/** @type {number} */ i, /** @type {string | Pt} */ from = "C1") => {
  const y = /** @type {number} */ (pts5[i]);
  const isHull = i >= 1 && i <= 3;
  const a = isHull ? /** @type {{a:number}} */ (hulls[i - 1]).a : 0;
  const ln = i === 4 ? lane(3) : i === 0 ? lane(0) : i === 3 ? lane(3) : lane(i - 1);
  const stairY =
    i === 0
      ? y + 140
      : i === 4
        ? y - 140
        : isHull && ln > y
          ? y + /** @type {{b:number}} */ (hulls[i - 1]).b + 50
          : y - /** @type {{b:number}} */ (hulls[i - 1]).b - 50;
  /** @type {[string, (Pt | string)[]][]} */
  const out = [
    ["west approach", [from, [1500, 1400], [AX - a - 80, y - 60], pointOf(i)]],
    ["lane approach", [from, [1500, ln], [AX, ln], [AX, stairY], pointOf(i)]],
  ];
  return out;
};

const toCentre = /** @type {[string, (Pt | string)[]][]} */ ([
  ["west approach", ["C1", [1500, 1400], [AX - 560, 1340], M]],
  ["north lane", ["C1", [1400, lane(1)], [AX, lane(1)], [AX, 1210], M]],
  ["south lane", ["C1", [1400, lane(2)], [AX, lane(2)], [AX, 1590], M]],
]);

// 4v4: its camps are the forward blocks, so the fight is the middle band (x 1200..4200).
const fwd1 = /** @type {Pt} */ ([1240, 1400]);

/** The craters (pits), west half; the east is the x mirror. */
const craters = [
  { cx: 1000, cy: 700, a: 170, b: 100 },
  { cx: 1500, cy: 2050, a: 200, b: 120 },
  { cx: 3300, cy: 330, a: 170, b: 90 },
  { cx: 2100, cy: 2400, a: 190, b: 100 },
  { cx: 900, cy: 1900, a: 150, b: 90 },
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
  tunnels: [
    {
      id: "trench-n",
      path: [
        [1400, 665],
        [4000, 665],
      ],
      w: 110,
      label: "north trench",
    },
    {
      id: "trench-s",
      path: [
        [1400, 2135],
        [4000, 2135],
      ],
      w: 110,
      label: "south trench",
    },
  ],
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
    { kind: "mire", cx: 1100, cy: 1150, rx: 150, ry: 60, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "mire", cx: MW - 1100, cy: 1150, rx: 150, ry: 60, fill: "#3a3326", edge: "#1e1a12" },
    { kind: "spring", cx: 1200, cy: 2400, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 1200, cy: 2400, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
  ],
  breakables: [{ r: rect(1700, 1660, 24, 170), label: "wrecked palisade (breakable)" }],
  gates: [
    { p: [1400, 665], label: "trench gate NW" },
    { p: [4000, 665], label: "trench gate NE" },
    { p: [1400, 2135], label: "trench gate SW" },
    { p: [4000, 2135], label: "trench gate SE" },
  ],
  levers: [
    { p: [AX - 200, 910], layer: 1, label: "lever → north gates" },
    { p: [AX + 200, 1890], layer: 1, label: "lever → south gates" },
  ],
  lights: [
    ...pts5.map((y) => ({ p: /** @type {Pt} */ ([AX, y]), r: 220 })),
    { p: [1400, 665], r: 150 },
    { p: [4000, 665], r: 150 },
    { p: [1400, 2135], r: 150 },
    { p: [4000, 2135], r: 150 },
    { p: [700, 1000], r: 180 },
    { p: [MW - 700, 1000], r: 180 },
    { p: [AX - 200, 910], r: 130 },
    { p: [AX + 200, 1890], r: 130 },
  ],
  atmo: [
    { label: "smoke bank", cx: 1500, cy: 800, rx: 300, ry: 120, col: "#c8c0b8", op: 0.2 },
    { label: "smoke bank", cx: 3900, cy: 2000, rx: 300, ry: 120, col: "#c8c0b8", op: 0.2 },
    { label: "smoke bank", cx: AX, cy: 2550, rx: 300, ry: 100, col: "#c8c0b8", op: 0.18 },
  ],
  overhangs: [{ r: rect(1200, 1450, 220, 70), label: "toppled beam" }],
  drops: [
    { at: [AX, 1180], e: 1 },
    { at: [AX, 1620], e: 1 },
    { at: [AX - 430, 1000], e: 1 },
    { at: [AX + 430, 1800], e: 1 },
  ],
  props: [
    ...[
      [900, 1500],
      [1300, 800],
      [1600, 2300],
      [4100, 700],
      [3800, 1600],
      [4400, 2300],
      [AX - 500, 200],
      [AX + 400, 2600],
    ].map((p) => ({ kind: /** @type {"stone"} */ ("stone"), p: /** @type {Pt} */ (p), r: 38 })),
    ...[
      [800, 1300],
      [1000, 2200],
      [4500, 1300],
      [4400, 600],
    ].map((p) => ({ kind: /** @type {"bush"} */ ("bush"), p: /** @type {Pt} */ (p), r: 38 })),
  ],
  spawns: { t1: seats(480, 1240, 120, 110, 8, 1), t2: seats(4920, 1240, 120, 110, 8, -1) },
  shrines: { t1: [700, 1000], t2: [MW - 700, 1000] },
  objectives: pts5.map((y, i) => ({
    id: pointOf(i),
    kind: /** @type {"capture-point"} */ ("capture-point"),
    p: /** @type {Pt} */ ([AX, y]),
    layer: i === 2 ? 2 : i === 1 || i === 3 ? 1 : 0,
    label: `capture-point ${i + 1}`,
  })),
  centre: [AX, 1400],
  routes: { t1: toCentre, t2: toCentre.map(([n, r]) => [n, mxr(r)]) },
  objWalks: [
    ...pts5.map((_, i) => ({
      obj: pointOf(i),
      what: "8v8 spawn to point",
      t1: toPoint(i),
      t2: toPoint(i).map(([n, r]) => [n, mxr(r)]),
    })),
    ...pts5.map((_, i) => ({
      obj: pointOf(i),
      what: "4v4 camp to point",
      t1: toPoint(i, fwd1),
      t2: toPoint(i, fwd1).map(([n, r]) => [n, mxr(r)]),
    })),
  ],
  layerTitles: {
    0: "L0 field, craters, trenches",
    1: "L1 tower hulks, spoil banks",
    2: "L2 hulk decks",
  },
  planNote:
    "plan 5400×2800. Dashed: spawn to the great siege tower (west approach, north lane, south lane). Five points on the centre line.",
});
