/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids and SVG strings are built from numbers. */
// Study for #3431 (part of #3076): Threefold Keep, king of the hill, 4v4 / 8v8, three teams.
// Usage: node scripts/assets/3076-threefold-keep-study.mjs <out-dir>   (needs inkscape)
import { runStudy, seats } from "./3076-study-lib.mjs";

const MW = 5000,
  MH = 4400;
/** @typedef {[number, number]} Pt */
const CX = 2500,
  CY = 2200;
/** The point at `deg` (0 = east, -90 = north) and radius `r` from the keep's centre, `t` to the side (clockwise). @type {(deg: number, r: number, t?: number) => Pt} */
const loc = (deg, r, t = 0) => {
  const a = (deg * Math.PI) / 180;
  return [
    Math.round(CX + r * Math.cos(a) - t * Math.sin(a)),
    Math.round(CY + r * Math.sin(a) + t * Math.cos(a)),
  ];
};
/** Turn a point by 120° × k about the centre: team 1 north, team 2 south-east, team 3 south-west. @type {(p: Pt, k: number) => Pt} */
const rot = (p, k) => {
  const a = (k * 2 * Math.PI) / 3,
    dx = p[0] - CX,
    dy = p[1] - CY;
  return [
    Math.round(CX + dx * Math.cos(a) - dy * Math.sin(a)),
    Math.round(CY + dx * Math.sin(a) + dy * Math.cos(a)),
  ];
};
/** @type {(deg: number, r: number) => Pt[]} */
const disc = (deg, r) => Array.from({ length: 16 }, (_, i) => loc(deg + i * 22.5, r));
/** A quad along a radius at `deg`: low end `r0`, high end `r1`, half-width `hw`. @type {(deg: number, r0: number, r1: number, hw: number) => Pt[]} */
const strip = (deg, r0, r1, hw) => [
  loc(deg, r0, -hw),
  loc(deg, r0, hw),
  loc(deg, r1, hw),
  loc(deg, r1, -hw),
];
/** @type {(r: (Pt | string)[], k: number) => (Pt | string)[]} */
const rr = (r, k) =>
  r.map((p) => (typeof p === "string" ? (p === "C1" ? `C${k + 1}` : p) : rot(p, k)));
/** @type {(rs: [string, (Pt | string)[]][]) => { t1: [string, (Pt | string)[]][]; t2: [string, (Pt | string)[]][]; t3: [string, (Pt | string)[]][] }} */
const teams = (rs) => ({
  t1: rs,
  t2: rs.map(([n, r]) => [n, rr(r, 1)]),
  t3: rs.map(([n, r]) => [n, rr(r, 2)]),
});

// Heights (visual-style §1): ground #26303f, rock #4b5a70, decks #a0b2c7. Not a new row.
const pal = {
  out: "#1e2733",
  ground: "#26303f",
  deck: "#a0b2c7",
  deckL2: "#b4c3d4",
  deckL3: "#c8d4e0",
  face: "#4b5a70",
  faceE: "#38455a",
  mound: "#6b6f6c",
  roof: "#6a7482",
  roofFace: "#434b58",
  speck1: "#2e3a4c",
  speck2: "#4a3a2a",
  outside: "#2a3445",
  deep: "#0a1320",
  shore: "#c4dcee",
  shallow: "#8fb8d6",
};

const outline = Array.from({ length: 12 }, (_, i) => loc(15 + i * 30, 2200));
const RING_IN = 1020,
  RING_OUT = 1180;
/** The wall-walk arc over team k's gate, from one causeway to the next. @type {(k: number) => Pt[]} */
const arc = (k) => {
  const a0 = -150 + 120 * k;
  const o = Array.from({ length: 9 }, (_, i) => loc(a0 + i * 15, RING_OUT));
  const n = Array.from({ length: 9 }, (_, i) => loc(a0 + 120 - i * 15, RING_IN));
  return [...o, ...n];
};
const R1 = /** @type {Pt} */ ([2820, 700]); // relic-less mode: the ghost-spawn and the lever stand in the court
const LEVER = /** @type {Pt} */ ([2250, 880]);
const GATE_AT = 1100;

const gateRoute = (/** @type {Pt | string} */ from) => [
  from,
  loc(-90, 1320),
  loc(-90, 950),
  loc(-45, 960),
  loc(-45, 800),
  loc(-30, 520),
  loc(-30, 340),
  "M",
];
const ringEast = (/** @type {Pt | string} */ from) => [
  from,
  loc(-64, 1320),
  loc(-64, 1100),
  loc(-45, 1100),
  loc(-30, 1100),
  loc(-30, 340),
  "M",
];
const ringWest = (/** @type {Pt | string} */ from) => [
  from,
  loc(-116, 1320),
  loc(-116, 1100),
  loc(-135, 1100),
  loc(-150, 1100),
  loc(-150, 340),
  "M",
];
const under = (/** @type {Pt | string} */ from) => [
  from,
  loc(-30, 1250),
  [CX, CY],
  loc(0, 560),
  loc(0, 340),
  "M",
];

/** @type {import("./3076-study-lib.mjs").Spec} */
const spec = {
  id: "threefold-keep",
  name: "Threefold Keep",
  MW,
  MH,
  pal,
  outline,
  shapes: [
    { id: "hill", layer: 1, poly: disc(0, 800), label: "hill" },
    { id: "tower", layer: 2, poly: disc(0, 340), label: "tower" },
    ...[0, 1, 2].map((k) => ({
      id: `wall-walk ${k + 1}`,
      layer: 1,
      poly: arc(k),
      look: /** @type {"stone"} */ ("stone"),
      label: "wall-walk",
    })),
    ...[0, 1, 2].map((k) => ({
      id: `causeway ${k + 1}`,
      layer: 1,
      poly: strip(-30 + 120 * k, 780, 1030, 130),
      label: "causeway",
    })),
  ],
  stairs: [
    ...[0, 1, 2].flatMap((k) =>
      [-26, 26].map((d) => ({
        id: `w${k}${d}`,
        from: 0,
        r: strip(-90 + 120 * k + d, 1320, 1180, 100),
      })),
    ),
    ...[0, 1, 2].flatMap((k) =>
      [-15, 15].map((d) => ({
        id: `h${k}${d}`,
        from: 0,
        r: strip(-30 + 120 * k + d, 960, 800, 100),
      })),
    ),
    ...[0, 1, 2, 3, 4, 5].map((k) => ({
      id: `t${k + 1}`,
      from: 1,
      r: strip(-90 + 60 * k, 520, 340, 110),
    })),
    { id: "u", from: 0, r: strip(0, 480, 620, 70) },
  ],
  tunnels: [
    ...[0, 1, 2].map((k) => ({
      id: `gate ${k + 1}`,
      path: [loc(-90 + 120 * k, 1320), loc(-90 + 120 * k, 900)],
      w: 200,
      label: "gate passage",
    })),
    ...[0, 1, 2].map((k) => ({
      id: `undercroft ${k + 1}`,
      path: [loc(-30 + 120 * k, 1250), [CX, CY]],
      w: 110,
      label: "undercroft (tunnel)",
    })),
    { id: "undercroft exit", path: [[CX, CY], loc(0, 540)], w: 110, label: "" },
  ],
  water: [0, 1, 2].map((k) => ({
    poly: Array.from({ length: 8 }, (_, i) => {
      const [x, y] = loc(-118 + 120 * k, 1950);
      return /** @type {Pt} */ ([
        Math.round(x + 170 * Math.cos((i * Math.PI) / 4)),
        Math.round(y + 80 * Math.sin((i * Math.PI) / 4)),
      ]);
    }),
    deep: false,
    label: "moat pool",
    at: loc(-118 + 120 * k, 2060, -80),
  })),
  zones: [0, 1, 2].flatMap((k) => [
    {
      kind: "spring",
      cx: loc(-125 + 120 * k, 1900)[0],
      cy: loc(-125 + 120 * k, 1900)[1],
      rx: 150,
      ry: 62,
      fill: "#2f5a63",
      edge: "#9fdcff",
    },
    {
      kind: "mire",
      cx: loc(-35 + 120 * k, 1900)[0],
      cy: loc(-35 + 120 * k, 1900)[1],
      rx: 160,
      ry: 66,
      fill: "#3a3326",
      edge: "#1e1a12",
    },
  ]),
  breakables: [0, 1, 2].map((k) => {
    const [x, y] = rot([3100, 560], k);
    return {
      r: [
        [x, y],
        [x + 180, y],
        [x + 180, y + 24],
        [x, y + 24],
      ],
      label: "palisade (breakable)",
    };
  }),
  gates: [
    ...[0, 1, 2].map((k) => {
      const c = loc(-90 + 120 * k, GATE_AT);
      return {
        p: c,
        label: "gate",
        poly: [
          loc(-90 + 120 * k, 1140, -100),
          loc(-90 + 120 * k, 1140, 100),
          loc(-90 + 120 * k, 1060, 100),
          loc(-90 + 120 * k, 1060, -100),
        ],
      };
    }),
    { p: loc(0, 400), label: "keep gate" },
  ],
  levers: [0, 1, 2].map((k) => ({ p: rot(LEVER, k), layer: 0, label: "lever → all gates" })),
  lights: [
    ...[0, 1, 2].map((k) => ({ p: loc(-90 + 120 * k, 1300), r: 150 })),
    ...[0, 1, 2].map((k) => ({ p: loc(-30 + 120 * k, 1250), r: 150 })),
    { p: /** @type {Pt} */ ([CX, CY]), r: 220 },
    ...[0, 1, 2].map((k) => ({ p: rot(LEVER, k), r: 130 })),
    ...[0, 1, 2].map((k) => ({ p: rot(R1, k), r: 180 })),
  ],
  atmo: [0, 1, 2].map((k) => ({
    label: "dust bank",
    cx: loc(-150 + 120 * k, 1750)[0],
    cy: loc(-150 + 120 * k, 1750)[1],
    rx: 300,
    ry: 120,
    col: "#c8d4e4",
    op: 0.2,
  })),
  overhangs: [
    {
      r: [
        [1050, 830],
        [1270, 830],
        [1270, 900],
        [1050, 900],
      ],
      label: "fallen beam",
    },
  ],
  drops: [
    ...[0, 1, 2].map((k) => ({ at: loc(-30 + 120 * k, 1000, 175), e: 1 })),
    ...[0, 1, 2].map((k) => ({ at: loc(-90 + 120 * k, 1200), e: 1 })),
  ],
  props: [
    ...[0, 1, 2, 3, 4, 5].map((i) => ({
      kind: /** @type {"pillar"} */ ("pillar"),
      p: loc(-60 + i * 60, 270),
      r: 24,
      layer: 2,
    })),
    ...[0, 1, 2].flatMap((k) =>
      [
        [2000, 520],
        [3050, 1000],
        [1750, 1280],
      ].map((p) => ({
        kind: /** @type {"stone"} */ ("stone"),
        p: rot(/** @type {Pt} */ (p), k),
        r: 36,
      })),
    ),
  ],
  spawns: (() => {
    const t1 = seats(2440, 300, 120, 110, 8, 1);
    return { t1, t2: t1.map((p) => rot(p, 1)), t3: t1.map((p) => rot(p, 2)) };
  })(),
  ghosts: { t1: [2820, 700], t2: rot([2820, 700], 1), t3: rot([2820, 700], 2) },
  objectives: [{ id: "altar", kind: "altar", p: [CX, CY], layer: 2, label: "altar" }],
  centre: [CX, CY],
  routes: teams([
    ["gate (open)", gateRoute("C1")],
    ["wall-walk east", ringEast("C1")],
    ["wall-walk west", ringWest("C1")],
    ["undercroft (gates + keep gate open)", under("C1")],
  ]),
  objWalks: [
    {
      obj: "tower",
      what: "high ground (tower base rim, via the east wall-walk)",
      ...teams([
        ["east", ringEast("C1").slice(0, -2)],
        ["west", ringWest("C1").slice(0, -2)],
      ]),
    },
  ],
  layerTitles: { 0: "L0 court, ward, tunnels", 1: "L1 wall-walks, causeways, hill", 2: "L2 tower" },
  planNote:
    "plan 5000×4400. Dashed: spawn to altar (gate, two wall-walks, undercroft). Three teams, the layout turned 120°.",
};
runStudy(spec);
