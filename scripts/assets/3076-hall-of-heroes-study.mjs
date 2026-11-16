/* eslint-disable @typescript-eslint/restrict-template-expressions -- ids are built from numbers. */
// Study for #3431 (part of #3076): Hall of Heroes, a hero's hall for three teams of eight. One
// layout serves the three files: capture points, king of the hill and relic run.
// Usage: node scripts/assets/3076-hall-of-heroes-study.mjs <out-dir>   (needs inkscape)
import { rect, runStudy } from "./3076-study-lib.mjs";

const MW = 5200,
  MH = 4400,
  AX = 2600, // team 3 and the dais stand on this line; teams 1 and 2 mirror about it
  CY = 1900;
/** @typedef {[number, number]} Pt */
/** @typedef {Pt | string} Wp */
/** Team 1 (north-west) and team 2 (north-east) mirror in x; team 3 (south) is its own mirror. */
/** @type {(p: Wp) => Wp} */
const mx = (p) =>
  typeof p === "string"
    ? ({
        C1: "C2",
        C2: "C1",
        S1: "S2",
        S2: "S1",
        P1: "P2",
        P2: "P1",
        PW: "PE",
        PE: "PW",
        PWS: "PES",
        PES: "PWS",
        DW: "DE",
        DE: "DW",
        GNW: "GNE",
        GNE: "GNW",
        GSWE: "GSEW",
        GSEW: "GSWE",
      }[p] ?? p)
    : [MW - p[0], p[1]];
/** @type {(r: Wp[]) => Wp[]} */
const mxr = (r) => r.map(mx);
/** @type {(poly: Pt[]) => Pt[]} */
const xPoly = (poly) => /** @type {Pt[]} */ (poly.map((p) => mx(p)));
/** @type {(routes: [string, Wp[]][]) => [string, Wp[]][]} */
const mxRoutes = (routes) => routes.map(([n, r]) => [n, mxr(r)]);

// Hall (visual-style §1): ground #26303f, deck #4b5a70, stone and steel, no plants.
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

/** The hall: a wide north end with the two north apses, narrowing to the south apse. */
/** @type {Pt[]} */
const outline = [
  [160, 300],
  [700, 160],
  [AX, 120],
  [MW - 700, 160],
  [MW - 160, 300],
  [MW - 120, 1800],
  [MW - 300, 2700],
  [MW - 1000, 3400],
  [MW - 1900, 3900],
  [MW - 2000, 4360],
  [2000, 4360],
  [1900, 3900],
  [1000, 3400],
  [300, 2700],
  [120, 1800],
];

/** @type {(cx: number, cy: number, a: number, b: number, n?: number) => Pt[]} */
const ellipse = (cx, cy, a, b, n = 12) =>
  /** @type {Pt[]} */ (
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return [Math.round(cx + a * Math.cos(t)), Math.round(cy + b * Math.sin(t))];
    })
  );
/** An axis-aligned octagon: half-size h, corners cut by c. */
/** @type {(cx: number, cy: number, h: number, c: number) => Pt[]} */
const octagon = (cx, cy, h, c) => [
  [cx - h + c, cy - h],
  [cx + h - c, cy - h],
  [cx + h, cy - h + c],
  [cx + h, cy + h - c],
  [cx + h - c, cy + h],
  [cx - h + c, cy + h],
  [cx - h, cy + h - c],
  [cx - h, cy - h + c],
];

// Spawns: team 1 north-west, team 2 north-east, team 3 south, each ~2150 from the dais.
/** @type {Pt[]} */
const t1 = Array.from({ length: 8 }, (_, i) => [
  640 + (i % 2) * 120,
  720 + Math.floor(i / 2) * 120,
]);
/** @type {Pt[]} */
const t3 = Array.from({ length: 8 }, (_, i) => [
  2420 + (i % 4) * 120,
  3890 + Math.floor(i / 4) * 120,
]);
const spawns = [t1, xPoly(t1), t3];
/** Each team's base: its resurrection-shrine, ghost-spawn and relic-spawn, behind its spawn. */
/** @type {Pt[]} */
const bases = [
  [420, 700],
  [MW - 420, 700],
  [AX, 4190],
];

// The capture points: P4 the centre, on the dais (L2); P1..P3 one home point per team, on the
// floor in its hero ring, 45 % of the way from its spawn to the dais.
/** @type {Pt[]} */
const homes = [
  [1560, 1360],
  [MW - 1560, 1360],
  [AX, 2980],
];

// The plinth (L1) and the dais on it (L2), stairs on the four faces of each.
const PH = 520,
  DH = 240;
const shapes = [
  {
    id: "plinth",
    layer: 1,
    look: /** @type {"stone"} */ ("stone"),
    poly: octagon(AX, CY, PH, 200),
  },
  { id: "dais", layer: 2, poly: octagon(AX, CY, DH, 80) },
];
// Galleries (L1): north between teams 1 and 2, south-west between 1 and 3, south-east between 2 and 3.
const gN = rect(1900, 420, 1400, 240);
const gSW = rect(1000, 2800, 900, 240);
shapes.push(
  { id: "north gallery", layer: 1, look: "stone", poly: gN },
  { id: "south-west gallery", layer: 1, look: "stone", poly: gSW },
  { id: "south-east gallery", layer: 1, look: "stone", poly: xPoly(gSW) },
);

/** @type {{ id: string; r: Pt[]; from: number; north?: boolean }[]} */
const stairs = [
  // Two stairs on the west face: the upper one faces team 1, the lower one teams 1 and 3; the east face mirrors.
  { id: "plinth-wn", r: rect(AX - PH - 140, CY - 300, 140, 160), from: 0 },
  { id: "plinth-ws", r: rect(AX - PH - 140, CY + 140, 140, 160), from: 0 },
  { id: "plinth-en", r: rect(AX + PH, CY - 300, 140, 160), from: 0 },
  { id: "plinth-es", r: rect(AX + PH, CY + 140, 140, 160), from: 0 },
  { id: "plinth-n", r: rect(AX - 80, CY - PH - 140, 160, 140), from: 0, north: true },
  { id: "plinth-s", r: rect(AX - 80, CY + PH, 160, 140), from: 0 },
  { id: "dais-w", r: rect(AX - DH - 100, CY - 60, 100, 120), from: 1 },
  { id: "dais-e", r: rect(AX + DH, CY - 60, 100, 120), from: 1 },
  { id: "dais-n", r: rect(AX - 60, CY - DH - 100, 120, 100), from: 1, north: true },
  { id: "dais-s", r: rect(AX - 60, CY + DH, 120, 100), from: 1 },
  { id: "gal-n-w", r: rect(1760, 480, 140, 120), from: 0 },
  { id: "gal-n-e", r: rect(3300, 480, 140, 120), from: 0 },
  { id: "gal-sw-w", r: rect(860, 2860, 140, 120), from: 0 },
  { id: "gal-sw-e", r: rect(1900, 2860, 140, 120), from: 0 },
  { id: "gal-se-w", r: rect(MW - 2040, 2860, 140, 120), from: 0 },
  { id: "gal-se-e", r: rect(MW - 1000, 2860, 140, 120), from: 0 },
];

// Waypoints: the foot of each plinth stair (L0) and of each dais stair (on the plinth, L1).
/** @type {Record<string, Pt>} */
const named = {
  PW: [AX - PH - 160, CY - 220],
  PE: [AX + PH + 160, CY - 220],
  PWS: [AX - PH - 160, CY + 220],
  PES: [AX + PH + 160, CY + 220],
  PN: [AX, CY - PH - 160],
  PS: [AX, CY + PH + 160],
  DW: [AX - DH - 120, CY],
  DE: [AX + DH + 120, CY],
  DN: [AX, CY - DH - 120],
  DS: [AX, CY + DH + 120],
  GNW: [1740, 540], // foot of the north gallery's west stair
  GNE: [3460, 540],
  GSWE: [2060, 2920], // foot of the south-west gallery's east stair
  GSEW: [MW - 2060, 2920],
};

// Team 1's routes to the dais top; team 2's are their mirror. Team 3's are its own.
/** @type {[string, Wp[]][]} */
const toCentre1 = [
  ["nave (own stair)", ["C1", [1300, 1700], "PW", "DW", "M"]],
  ["flank (shared stair)", ["C1", [1500, 1000], [2300, 1160], "PN", "DN", "M"]],
  ["gallery, drop off", ["C1", "GNW", [2300, 540], [2300, 700], [2420, 1180], "PN", "DN", "M"]],
];
/** @type {[string, Wp[]][]} */
const toCentre3 = [
  ["nave (own stair)", ["C3", [2400, 3500], [2340, 2700], "PS", "DS", "M"]],
  ["flank (shared stair)", ["C3", [2250, 3400], [2000, 2560], "PWS", [2240, 2120], "DW", "M"]],
  [
    "gallery, drop off",
    ["C3", [2200, 3300], "GSWE", [1850, 2920], [1850, 2760], "PWS", [2240, 2120], "DW", "M"],
  ],
];

/** The south-west crypt runs from team 1's flank to team 3's; the south-east one mirrors it. */
/** @type {Pt[]} */
const cryptSW = [
  [560, 1500],
  [560, 2420],
  [1300, 2420],
];

/** @type {(k: number) => [string, Wp[]][]} */
const ownHome = (k) => [["own home point", [`C${k + 1}`, `P${k + 1}`]]];

runStudy({
  id: "hall-of-heroes",
  name: "Hall of Heroes",
  MW,
  MH,
  pal,
  outline,
  shapes,
  stairs,
  tunnels: [
    {
      id: "crypt-n",
      path: [
        [1500, 860],
        [MW - 1500, 860],
      ],
      w: 120,
      label: "north crypt",
    },
    { id: "crypt-sw", path: cryptSW, w: 120, label: "south-west crypt" },
    { id: "crypt-se", path: xPoly(cryptSW), w: 120, label: "south-east crypt" },
  ],
  water: [
    {
      poly: ellipse(1150, 1900, 170, 70, 10),
      deep: false,
      label: "reflecting pool",
      at: [1000, 2020],
    },
    {
      poly: xPoly(ellipse(1150, 1900, 170, 70, 10)),
      deep: false,
      label: "reflecting pool",
      at: [MW - 1300, 2020],
    },
  ],
  zones: [
    { kind: "spring", cx: AX, cy: 260, rx: 150, ry: 60, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: 1300, cy: 3300, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "spring", cx: MW - 1300, cy: 3300, rx: 140, ry: 58, fill: "#2f5a63", edge: "#9fdcff" },
    { kind: "mire", cx: AX, cy: 1000, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
    { kind: "mire", cx: 1650, cy: 2450, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
    { kind: "mire", cx: MW - 1650, cy: 2450, rx: 150, ry: 60, fill: "#33392f", edge: "#1a1e16" },
  ],
  breakables: [
    { r: rect(1440, 1520, 240, 24), label: "toppled hero (breakable)" },
    { r: rect(MW - 1680, 1520, 240, 24), label: "toppled hero (breakable)" },
    { r: rect(AX - 120, 2800, 240, 24), label: "toppled hero (breakable)" },
  ],
  gates: [
    { p: [AX, 860], label: "crypt gate N" },
    { p: [560, 2000], label: "crypt gate SW" },
    { p: [MW - 560, 2000], label: "crypt gate SE" },
  ],
  levers: [
    { p: [AX, CY - PH + 70], layer: 1, label: "lever → gate N" },
    { p: [AX - PH + 90, CY + 330], layer: 1, label: "lever → gate SW" },
    { p: [AX + PH - 90, CY + 330], layer: 1, label: "lever → gate SE" },
  ],
  lights: [
    { p: [AX, CY], r: 300, col: "#fff1d6" },
    ...homes.map((p) => ({ p, r: 240, col: "#fff1d6" })),
    ...bases.map((p) => ({ p, r: 190 })),
    { p: [1500, 860], r: 150 },
    { p: [MW - 1500, 860], r: 150 },
    { p: [560, 1500], r: 150 },
    { p: [1300, 2420], r: 150 },
    { p: [MW - 560, 1500], r: 150 },
    { p: [MW - 1300, 2420], r: 150 },
  ],
  atmo: [
    { label: "dust in the light", cx: AX, cy: 1300, rx: 320, ry: 110, col: "#fff1d6", op: 0.14 },
    { label: "dust in the light", cx: 1900, cy: 2300, rx: 260, ry: 100, col: "#fff1d6", op: 0.12 },
    {
      label: "dust in the light",
      cx: MW - 1900,
      cy: 2300,
      rx: 260,
      ry: 100,
      col: "#fff1d6",
      op: 0.12,
    },
  ],
  overhangs: [
    { r: rect(AX - 120, 150, 240, 70), label: "hanging banner" },
    { r: rect(380, 2500, 240, 70), label: "hanging banner" },
    { r: rect(MW - 620, 2500, 240, 70), label: "hanging banner" },
  ],
  drops: [
    { at: [2300, 680], e: 1 },
    { at: [1850, 2800], e: 1 },
    { at: [MW - 1850, 2800], e: 1 },
    { at: [AX - DH, CY + 180], e: 2 },
  ],
  props: homes.flatMap(([x, y]) =>
    /** @type {Pt[]} */ ([
      [x - 220, y - 160],
      [x + 220, y - 160],
      [x - 220, y + 160],
      [x + 220, y + 160],
    ]).map((p) => ({ kind: /** @type {"pillar"} */ ("pillar"), p, r: 26 })),
  ),
  spawns,
  shrines: bases,
  ghosts: bases.map(
    ([x, y]) =>
      /** @type {Pt} */ (x === AX ? [x - 220, y - 20] : [x + (x < AX ? 150 : -150), y + 120]),
  ),
  objectives: [
    ...homes.map((p, k) => ({
      id: `P${k + 1}`,
      kind: /** @type {"capture-point"} */ ("capture-point"),
      p,
      label: `P${k + 1} (home ${k + 1})`,
    })),
    { id: "P4", kind: "capture-point", p: [AX, CY], layer: 2, label: "P4 = altar" },
    { id: "A", kind: "altar", p: [AX, CY], layer: 2, label: " " },
    ...bases.map(([x, y], k) => ({
      id: `R${k + 1}`,
      kind: /** @type {"relic-spawn"} */ ("relic-spawn"),
      p: /** @type {Pt} */ ([x + (x < AX ? 200 : x > AX ? -200 : 220), y + (x === AX ? -40 : 60)]),
      label: `relic ${k + 1}`,
    })),
  ],
  named,
  centre: [AX, CY],
  routes: [toCentre1, mxRoutes(toCentre1), toCentre3],
  objWalks: [
    { obj: "capture", what: "spawn to own home point", teams: [0, 1, 2].map(ownHome) },
    {
      obj: "capture",
      what: "spawn to the next team's home point (1→2, 2→3, 3→1)",
      teams: [
        [["north floor", ["C1", [1500, 1000], [2300, 1160], [2900, 1160], "P2"]]],
        [["east floor", mxr(["C1", [1750, 2250], "P3"])]],
        [["west floor", ["C3", [2000, 2560], [1700, 1900], "P1"]]],
      ],
    },
    {
      obj: "capture",
      what: "spawn to the previous team's home point (1→3, 2→1, 3→2)",
      teams: [
        [["west floor", ["C1", [1750, 2250], "P3"]]],
        [["north floor", mxr(["C1", [1500, 1000], [2300, 1160], [2900, 1160], "P2"])]],
        [["east floor", mxr(["C3", [2000, 2560], [1700, 1900], "P1"])]],
      ],
    },
    {
      obj: "king / relic",
      what: "base (ghost-spawn, relic-spawn) to the altar",
      teams: [
        [["nave", ["S1", "C1", [1300, 1700], "PW", "DW", "M"]]],
        [["nave", mxr(["S1", "C1", [1300, 1700], "PW", "DW", "M"])]],
        [["nave", ["S3", "C3", [2400, 3500], [2340, 2700], "PS", "DS", "M"]]],
      ],
    },
    {
      obj: "high ground",
      what: "spawn to the nearest gallery",
      teams: [
        [["gallery", ["C1", "GNW"]]],
        [["gallery", ["C2", "GNE"]]],
        [["gallery", ["C3", "GSWE"]]],
      ],
    },
  ],
  layerTitles: {
    0: "L0 — the floor, three crypts",
    1: "L1 — the plinth and three galleries (70 up)",
    2: "L2 — the dais (140 up)",
  },
  planNote: "Hall of Heroes, 5200×4400 — one layout for capture, king and relic",
});
