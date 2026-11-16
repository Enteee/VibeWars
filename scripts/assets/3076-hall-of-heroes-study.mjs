/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids and SVG strings are built from numbers. */
// Study for #3431 (part of #3076): Hall of Heroes, one layout for capture points, king of the hill and relic run, 8v8, three teams.
// Usage: node scripts/assets/3076-hall-of-heroes-study.mjs <out-dir>   (needs inkscape)
import { runStudy, seats } from "./3076-study-lib.mjs";

const MW = 5000,
  MH = 4400;
/** @typedef {[number, number]} Pt */
const CX = 2500,
  CY = 2200;
/** The point at `deg` (0 = east, -90 = north) and radius `r` from the hall's centre, `t` to the side (clockwise). @type {(deg: number, r: number, t?: number) => Pt} */
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
/** A route as a team makes it: waypoints turned, "C1" becomes that team's centre. @type {(r: (Pt | string)[], k: number) => (Pt | string)[]} */
const rr = (r, k) =>
  r.map((p) => (typeof p === "string" ? (p === "C1" ? `C${k + 1}` : p) : rot(p, k)));
/** @type {(rs: [string, (Pt | string)[]][]) => { t1: [string, (Pt | string)[]][]; t2: [string, (Pt | string)[]][]; t3: [string, (Pt | string)[]][] }} */
const teams = (rs) => ({
  t1: rs,
  t2: rs.map(([n, r]) => [n, rr(r, 1)]),
  t3: rs.map(([n, r]) => [n, rr(r, 2)]),
});

// Hall (visual-style §1): ground #26303f, rock #4b5a70, stone and steel, no plants. Not a new row.
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

const GAL = -30; // the gallery between team 1 and team 2 (the others are its turns)
const MOUTH = -45; // the crypt mouth beside it
const outline = Array.from({ length: 12 }, (_, i) => loc(15 + i * 30, 2200));

const galleryRoute = (/** @type {number} */ g) => ["C1", loc(g, 1700), loc(g, 330), "M"];
const R1 = /** @type {Pt} */ ([2800, 740]);
const relicVia = (/** @type {number} */ g) => [R1, loc(g, 1700), loc(g, 330), "M"];
const crypt = (/** @type {Pt | string} */ from) => [
  from,
  loc(MOUTH, 1800),
  loc(MOUTH, 560),
  loc(GAL, 330),
  "M",
];
const L = GAL + 240; // the left-hand gallery of team 1 (-150)

/** @type {import("./3076-study-lib.mjs").Spec} */
const spec = {
  id: "hall-of-heroes",
  name: "Hall of Heroes",
  MW,
  MH,
  pal,
  outline,
  shapes: [
    { id: "plinth", layer: 1, poly: disc(0, 720), label: "plinth" },
    { id: "dais", layer: 2, poly: disc(0, 330), label: "dais" },
    ...[0, 1, 2].map((k) => ({
      id: `gallery ${k + 1}`,
      layer: 1,
      poly: [
        loc(GAL + 120 * k, 600, -180),
        loc(GAL + 120 * k, 1500, -180),
        loc(GAL + 120 * k, 1500, 180),
        loc(GAL + 120 * k, 600, 180),
      ],
    })),
  ],
  stairs: [
    ...[0, 1, 2].map((k) => ({
      id: `g${k + 1}`,
      from: 0,
      r: [
        loc(GAL + 120 * k, 1640, -120),
        loc(GAL + 120 * k, 1640, 120),
        loc(GAL + 120 * k, 1500, 120),
        loc(GAL + 120 * k, 1500, -120),
      ],
    })),
    ...[0, 1, 2].map((k) => ({
      id: `c${k + 1}`,
      from: 0,
      r: [
        loc(MOUTH + 120 * k, 470, -55),
        loc(MOUTH + 120 * k, 470, 55),
        loc(MOUTH + 120 * k, 640, 55),
        loc(MOUTH + 120 * k, 640, -55),
      ],
    })),
    ...[0, 1, 2, 3, 4, 5].map((k) => ({
      id: `d${k + 1}`,
      from: 1,
      r: [
        loc(-90 + 60 * k, 500, -110),
        loc(-90 + 60 * k, 500, 110),
        loc(-90 + 60 * k, 330, 110),
        loc(-90 + 60 * k, 330, -110),
      ],
    })),
  ],
  tunnels: [0, 1, 2].map((k) => ({
    id: `crypt ${k + 1}`,
    path: [loc(MOUTH + 120 * k, 1860), loc(MOUTH + 120 * k, 520)],
    w: 110,
    label: "crypt (tunnel)",
  })),
  water: [0, 1, 2].map((k) => ({
    poly: Array.from({ length: 8 }, (_, i) => {
      const [x, y] = loc(-72 + 120 * k, 1980);
      return /** @type {Pt} */ ([
        Math.round(x + 170 * Math.cos((i * Math.PI) / 4)),
        Math.round(y + 80 * Math.sin((i * Math.PI) / 4)),
      ]);
    }),
    deep: false,
    label: "shallow pool",
    at: loc(-72 + 120 * k, 2100, -100),
  })),
  zones: [0, 1, 2].flatMap((k) => [
    {
      kind: "spring",
      cx: loc(-112 + 120 * k, 1900)[0],
      cy: loc(-112 + 120 * k, 1900)[1],
      rx: 150,
      ry: 62,
      fill: "#2f5a63",
      edge: "#9fdcff",
    },
    {
      kind: "mire",
      cx: loc(-140 + 120 * k, 1950)[0],
      cy: loc(-140 + 120 * k, 1950)[1],
      rx: 160,
      ry: 66,
      fill: "#3a3326",
      edge: "#1e1a12",
    },
  ]),
  breakables: [0, 1, 2].map((k) => {
    const [x, y] = rot([2410, 1190], k);
    return {
      r: [
        [x, y],
        [x + 180, y],
        [x + 180, y + 24],
        [x, y + 24],
      ],
      label: "colonnade wall (breakable)",
    };
  }),
  gates: [0, 1, 2].map((k) => ({ p: loc(MOUTH + 120 * k, 1760), label: "crypt door" })),
  levers: [0, 1, 2].map((k) => ({ p: rot([2330, 900], k), layer: 0, label: "lever → all doors" })),
  lights: [
    ...[0, 1, 2].map((k) => ({ p: loc(MOUTH + 120 * k, 1760), r: 150 })),
    ...[0, 1, 2].map((k) => ({ p: loc(GAL + 120 * k, 1150), r: 150 })),
    { p: /** @type {Pt} */ ([CX, CY]), r: 220 },
    ...[0, 1, 2].map((k) => ({ p: rot(R1, k), r: 220 })),
    ...[0, 1, 2].map((k) => ({ p: rot([2330, 900], k), r: 130 })),
  ],
  atmo: [0, 1, 2].map((k) => ({
    label: "dust bank",
    cx: loc(-118 + 120 * k, 1400)[0],
    cy: loc(-118 + 120 * k, 1400)[1],
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
      label: "fallen lintel",
    },
  ],
  drops: [
    ...[0, 1, 2].map((k) => ({ at: loc(-90 + 120 * k, 760), e: 1 })),
    ...[0, 1, 2].map((k) => ({ at: loc(GAL + 120 * k, 1000, 215), e: 1 })),
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
        [2000, 560],
        [3000, 1000],
        [1700, 1250],
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
  shrines: { t1: [2200, 740], t2: rot([2200, 740], 1), t3: rot([2200, 740], 2) },
  ghosts: { t1: [2160, 420], t2: rot([2160, 420], 1), t3: rot([2160, 420], 2) },
  objectives: [
    { id: "altar", kind: "altar", p: [CX, CY], layer: 2, label: "altar / capture-point 4" },
    ...[0, 1, 2].map((k) => ({
      id: `G${k + 1}`,
      kind: /** @type {"capture-point"} */ ("capture-point"),
      p: loc(GAL + 120 * k, 1150),
      layer: 1,
      label: `capture-point ${k + 1}`,
    })),
    ...[0, 1, 2].map((k) => ({
      id: `R${k + 1}`,
      kind: /** @type {"relic-spawn"} */ ("relic-spawn"),
      p: rot(R1, k),
      label: `relic-spawn ${k + 1}`,
    })),
  ],
  centre: [CX, CY],
  routes: teams([
    ["gallery east", galleryRoute(GAL)],
    ["gallery west", galleryRoute(L)],
    ["crypt", crypt("C1")],
  ]),
  objWalks: [
    {
      obj: "altar",
      what: "relic carry",
      ...teams([
        ["gallery east", relicVia(GAL)],
        ["gallery west", relicVia(L)],
        ["crypt", crypt(R1)],
      ]),
    },
    {
      obj: "gallery",
      what: "high ground (east gallery mid)",
      ...teams([
        ["east", ["C1", loc(GAL, 1700), loc(GAL, 1100)]],
        ["west", ["C1", loc(L, 1700), loc(L, 1100)]],
      ]),
    },
    {
      obj: "gallery",
      what: "capture-points east/west",
      ...teams([
        ["east", ["C1", loc(GAL, 1700), loc(GAL, 1150)]],
        ["west", ["C1", loc(L, 1700), loc(L, 1150)]],
      ]),
    },
  ],
  layerTitles: { 0: "L0 floor, crypt tunnels", 1: "L1 plinth and galleries", 2: "L2 dais" },
  planNote:
    "plan 5000×4400. Dashed: spawn to altar (east gallery, west gallery, crypt). Three teams, the layout turned 120°.",
};
runStudy(spec);

// Check: no zone, pool or wall within 100 u of any route, and no zone near a spawn or objective.
{
  /** @type {(p: Pt, a: Pt, b: Pt) => number} */
  const dseg = (p, a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const c1 = /** @type {Pt} */ ([2500, 465]);
  const pts = (/** @type {(Pt | string)[]} */ r) =>
    r.map((p) => (typeof p === "string" ? (p === "C1" ? c1 : /** @type {Pt} */ ([CX, CY])) : p));
  let worst = 1e9;
  for (const k of [0, 1, 2])
    for (const [, r] of [...spec.routes.t1, ...spec.objWalks[0].t1].map(([n, q]) => [n, rr(q, k)]))
      for (const z of spec.zones ?? []) {
        const p = pts(/** @type {(Pt | string)[]} */ (r));
        for (let i = 1; i < p.length; i++)
          worst = Math.min(worst, dseg([z.cx, z.cy], p[i - 1], p[i]) - z.rx);
      }
  console.log("zone edge to nearest route (u, >0 is clear):", Math.round(worst));
}
