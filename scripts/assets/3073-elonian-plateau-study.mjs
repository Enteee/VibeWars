/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3392 (part of #3073): Elonian Plateau, a desert plateau of mesas, 8v8.
// One world drawing in map units (4600x2800). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team of eight standing in it.
// Usage: node scripts/assets/3073-elonian-plateau-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 4600,
  MH = 2800,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Desert biome (visual-style §1): ground #3b3226, rock #6e6252, stone decks #c2b296.
const C = {
  out: "#3a3226",
  ground: "#3b3226",
  deck: "#c2b296",
  deckL2: "#d3c5a8",
  face: "#7b6d57",
  faceE: "#5c5040",
  lip: "#ece0c4",
  roof: "#a98a63",
  roofFace: "#6d5638",
  tunnel: "#17120e",
  seam: "#8a7a62",
  scorch: "#2a231d",
  scree: "#6e6252",
  stone: "#b9a888",
  lift: "#e8c27a",
  storm: "#d9b27a",
  torch: "#ffb060",
  friend: "#59c2ff",
  foe: "#ff7b72",
  brass: "#e8c27a",
};

/** @typedef {[number, number]} Pt */
/** @type {(a: Pt[]) => string} */
const pts = (a) => a.map(([x, y]) => `${x},${y}`).join(" ");
/** @type {(a: Pt[]) => number} */
const area = (a) =>
  Math.abs(
    a.reduce((s, [x, y], i) => {
      const [x2, y2] = /** @type {Pt} */ (a[(i + 1) % a.length]);
      return s + x * y2 - x2 * y;
    }, 0),
  ) / 2;
/** @type {(x: number, y: number, w: number, h: number) => Pt[]} */
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

// ---- the place ---------------------------------------------------------------
/** @type {Pt[]} */
const OUTLINE = [
  [260, 900],
  [700, 420],
  [1400, 260],
  [2200, 200],
  [3000, 240],
  [3700, 420],
  [4200, 900],
  [4350, 1500],
  [4200, 2100],
  [3700, 2560],
  [2900, 2640],
  [2000, 2600],
  [1200, 2560],
  [600, 2300],
  [240, 1700],
];
// L1: four mesas on the dry canyon's floor; the floor between them is the wash
/** @type {Pt[]} */
const M1 = [
  [620, 560],
  [1300, 440],
  [1700, 540],
  [1760, 1000],
  [1300, 1120],
  [760, 1000],
];
/** @type {Pt[]} */
const M4 = [
  [2300, 440],
  [3000, 400],
  [3300, 620],
  [3200, 980],
  [2700, 1000],
  [2350, 840],
];
/** @type {Pt[]} */
const M3 = [
  [1950, 1200],
  [2650, 1160],
  [2750, 1480],
  [2000, 1520],
];
/** @type {Pt[]} */
const M2 = [
  [2800, 1700],
  [3300, 1620],
  [3900, 1760],
  [3960, 2200],
  [3400, 2300],
  [2900, 2160],
];
const MESAS = [M1, M4, M3, M2];
// L2: a tall top on the north-west mesa and on the south-east mesa
/** @type {Pt[]} */
const L2W = [
  [900, 640],
  [1350, 580],
  [1550, 740],
  [1400, 920],
  [950, 880],
];
/** @type {Pt[]} */
const L2E = [
  [3250, 1860],
  [3700, 1850],
  [3800, 2100],
  [3400, 2200],
  [3150, 2050],
];
const ARCH = rect(1760, 640, 540, 90); // a natural arch over the gap, at L1 height
const TUNNEL_W = 110;
// the passage through the rock under the centre fin: a mouth on each side
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [1850, 1360],
  [2850, 1360],
];
const GATE = /** @type {Pt} */ ([2350, 1360]);
// timer lifts (#3079): bots ride timer lifts, so every mesa has one and there is no lever lift
const LIFTS = [
  { id: "lift-w", r: rect(1100, 1120, 120, 120), to: 1 },
  { id: "lift-n", r: rect(2850, 1000, 120, 120), to: 1 },
  { id: "lift-e", r: rect(3150, 1600, 120, 120), to: 1 },
];
const STAIRS = [
  { id: "stair-c", r: rect(2200, 1520, 140, 100), from: 0 },
  { id: "top-stair-w", r: rect(1000, 880, 120, 80), from: 1 },
  { id: "top-stair-e", r: rect(3300, 2120, 120, 80), from: 1 },
];
/** @type {{ at: Pt; e: number }[]} */
const DROPS = [
  { at: [900, 1020], e: 1 },
  { at: [3300, 2300], e: 1 },
  { at: [2400, 1540], e: 1 },
  { at: [1500, 900], e: 2 },
];
const LEVER = /** @type {Pt} */ ([2300, 1250]);
const BREAKABLE = rect(2288, 1840, 24, 260); // a sandstone wall across the wash's south neck
const SCORCH = { cx: 1000, cy: 1950, rx: 150, ry: 65 };
const ROCKFALL = { cx: 3600, cy: 1100, rx: 150, ry: 65 };
const STORM = rect(2500, 2260, 1300, 300); // the sandstorm's band (atmosphere, timer #3032)
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS = { t1: [], t2: [] };
for (let i = 0; i < 8; i++) {
  SPAWNS.t1.push([420 + (i % 2) * 120, 1500 + Math.floor(i / 2) * 110]);
  SPAWNS.t2.push([4120 - (i % 2) * 120, 1200 + Math.floor(i / 2) * 110]);
}
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [1850, 1360], col: C.torch, r: 150 },
  { p: [2850, 1360], col: C.torch, r: 150 },
  { p: [2270, 1620], col: C.torch, r: 150 },
  { p: [1160, 1260], col: C.torch, r: 150 },
  { p: [2910, 1140], col: C.torch, r: 150 },
  { p: [3210, 1740], col: C.torch, r: 150 },
  { p: [1060, 960], col: C.torch, r: 150 },
  { p: [3360, 2200], col: C.torch, r: 150 },
  { p: [2300, 1250], col: C.torch, r: 140 },
  { p: [1000, 1950], col: "#ff9040", r: 200 },
];
const cen = (/** @type {Pt[]} */ a) =>
  /** @type {Pt} */ ([
    a.reduce((s, p) => s + p[0], 0) / a.length,
    a.reduce((s, p) => s + p[1], 0) / a.length,
  ]);
const C1 = cen(SPAWNS.t1),
  C2 = cen(SPAWNS.t2);
// routes from each team's centre to the foot of the centre fin (2300,1560): the walk is the polyline at base speed
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    ["wash", [C1, [1400, 1750], [2300, 1750], [2300, 1560]]],
    ["passage", [C1, [1850, 1360], [2300, 1360], [2300, 1560]]],
    [
      "lift and arch",
      [
        C1,
        [1160, 1300],
        [1160, 1000],
        [1900, 700],
        [2500, 800],
        [2910, 1100],
        [2600, 1560],
        [2300, 1560],
      ],
    ],
  ],
  t2: [
    ["wash", [C2, [3300, 1800], [2300, 1800], [2300, 1560]]],
    ["passage", [C2, [2850, 1360], [2300, 1360], [2300, 1560]]],
    [
      "lift and arch",
      [
        C2,
        [2910, 1130],
        [2910, 1100],
        [2500, 800],
        [1900, 700],
        [1500, 1100],
        [2000, 1560],
        [2300, 1560],
      ],
    ],
  ],
};
/** @type {(r: Pt[]) => number} */
const len = (r) =>
  r.reduce((s, [x, y], i) => (i ? s + Math.hypot(x - r[i - 1][0], y - r[i - 1][1]) : 0), 0);

// ---- drawing -------------------------------------------------------------------
/** A slab `elev` above the ground: shadow SE, south and east faces, then the top. */
/** @type {(poly: Pt[], elev: number, h: number, top: string, face: string, faceE: string) => string} */
const slab = (poly, elev, h, top, face, faceE) => {
  /** @type {(p: Pt, d: number) => Pt} */
  const up = ([x, y], d) => [x, y - d];
  let s = `<polygon points="${pts(poly.map(([x, y]) => [x + h * 0.9, y - elev + h * 0.7]))}" fill="#080b10" opacity=".3"/>`;
  poly.forEach((p, i) => {
    const q = /** @type {Pt} */ (poly[(i + 1) % poly.length]);
    const quad = [up(p, elev), up(q, elev), up(q, elev - h), up(p, elev - h)];
    s += `<polygon points="${pts(quad)}" fill="${Math.abs(q[0] - p[0]) < Math.abs(q[1] - p[1]) ? faceE : face}" stroke="${INK}" stroke-width="3"/>`;
  });
  s += `<polygon points="${pts(poly.map((p) => up(p, elev)))}" fill="${top}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(poly.map((p) => up(p, elev)))}" fill="none" stroke="${C.lip}" stroke-width="3" opacity=".7" transform="translate(0,3)"/>`;
  return s;
};
/** @type {(p: Pt, e: number) => Pt} */
const lift = ([x, y], e) => [x, y - e];

/** @type {(cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string) => string} */
const ell = (cx, cy, rx, ry, fill, stroke) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`;

/** Plain 2.5D world, no annotations. */
const world = () => {
  let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
  // outside: `rock` (OUTSIDE_KINDS), tumbled masonry round the fortress
  for (let i = 0; i < 110; i++)
    s += `<ellipse cx="${((i * 421) % 3100) - 200}" cy="${((i * 317 + i * i * 11) % 2300) - 200}" rx="${44 + (i % 4) * 12}" ry="${28 + (i % 4) * 8}" fill="#5a4e3c" stroke="${INK}" stroke-width="3" opacity=".9"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#flag)" opacity=".5"/>`;
  // L0 zones
  s += ell(SCORCH.cx, SCORCH.cy, SCORCH.rx, SCORCH.ry, C.scorch, "#15110d");
  s += ell(ROCKFALL.cx, ROCKFALL.cy, ROCKFALL.rx, ROCKFALL.ry, C.scree, "#3a3226");
  s += `<ellipse cx="900" cy="2200" rx="240" ry="50" fill="#d9c9a8" opacity=".25"/><ellipse cx="3900" cy="1500" rx="240" ry="50" fill="#d9c9a8" opacity=".25"/>`;
  // passage floor and cover seam on the ground, grating slots every 120
  for (let i = 1; i < TUNNEL_PATH.length; i++) {
    const a = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
      b = /** @type {Pt} */ (TUNNEL_PATH[i]);
    s += `<polygon points="${pts(rect(Math.min(a[0], b[0]) - TUNNEL_W / 2, a[1] - TUNNEL_W / 2, Math.abs(b[0] - a[0]) + TUNNEL_W, TUNNEL_W))}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5" opacity=".95"/>`;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k * 120 < d; k++)
      s += `<rect x="${a[0] + k * 120 - 6}" y="${a[1] - 36}" width="12" height="72" fill="${C.seam}" opacity=".7"/>`;
  }
  // the natural arch (L1 height): a stone span
  s += slab(ARCH, STEP, 40, C.stone, C.face, C.faceE);
  // breakable sandstone wall across the wash's south neck
  s += slab(BREAKABLE, 0, 60, C.stone, C.face, C.faceE);
  // L1 wall-walks and the stairs up to them and to the towers
  for (const w of MESAS) s += slab(w, STEP, STEP, C.deck, C.face, C.faceE);
  for (const l of LIFTS) {
    const [x, y] = /** @type {Pt} */ (l.r[0]);
    s += `<rect x="${x}" y="${y}" width="120" height="120" fill="#2a231d" stroke="${C.lift}" stroke-width="6"/><path d="M${x + 30},${y + 80} l30,-40 l30,40 M${x + 30},${y + 50} l30,-40 l30,40" stroke="${C.lift}" stroke-width="7" fill="none"/>`;
  }
  for (const st of STAIRS) {
    const e0 = st.from * STEP;
    const x = st.r[0][0],
      y = st.r[0][1],
      w = st.r[1][0] - x,
      h = st.r[2][1] - y;
    for (let i = 0; i < 5; i++) {
      const yy = y + h - ((i + 1) * h) / 5,
        ee = e0 + ((i + 1) * STEP) / 5;
      s += `<rect x="${x}" y="${yy - ee}" width="${w}" height="${h / 5}" fill="${i % 2 ? C.deck : C.lip}" stroke="${INK}" stroke-width="2"/>`;
    }
  }
  // L2 tops
  s += slab(L2W, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  s += slab(L2E, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  // levers
  for (const l of [{ p: LEVER }]) {
    const lv = lift(l.p, STEP);
    s += `<circle cx="${lv[0]}" cy="${lv[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  }
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".18"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // the sandstorm band, a pale wash over the floor under bodies
  s += `<polygon points="${pts(STORM)}" fill="${C.storm}" opacity=".22"/>`;
  // the sun: a day wash from the north-west
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 34) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 34px 'DejaVu Sans',sans-serif;fill:#fff3e0;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 54px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="flag" width="400" height="400" patternUnits="userSpaceOnUse"><ellipse cx="90" cy="100" rx="70" ry="22" fill="#a9b6ba" opacity=".5"/><ellipse cx="290" cy="250" rx="90" ry="26" fill="#6a6a58" opacity=".35"/><ellipse cx="160" cy="340" rx="50" ry="16" fill="#c4ced1" opacity=".5"/></pattern>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1d6" stop-opacity=".3"/><stop offset=".5" stop-color="#fff1d6" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".3"/></linearGradient>
</defs>`;

/** @type {(vx: number, vy: number, vw: number, vh: number, w: number, inner: string) => string} */
const svgOf = (vx, vy, vw, vh, w, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * vh) / vw)}" viewBox="${vx} ${vy} ${vw} ${vh}">${defs}${inner}</svg>`;

/** @type {(svg: string, name: string, w: number) => void} */
const render = (svg, name, w) => {
  const p = join(out, `${name}.svg`);
  writeFileSync(p, svg);
  execFileSync("inkscape", [p, "-w", String(w), "-o", join(out, `${name}.png`)], {
    stdio: "ignore",
  });
  rmSync(p);
};

/** A body as the arena paints it: team colour disc, pale rim. */
/** @type {(p: Pt, col: string, e: number) => string} */
const bodyAt = (p, col, e) => {
  const [x, y] = lift(p, e);
  return `<ellipse cx="${x + 10}" cy="${y + 26}" rx="30" ry="12" fill="#080b10" opacity=".35"/><circle cx="${x}" cy="${y}" r="30" fill="${col}" stroke="#eaf4ff" stroke-width="5"/>`;
};

// ---- the plan --------------------------------------------------------------------
{
  let a = world();
  const routeCol = { t1: C.friend, t2: C.foe };
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    ROUTES[k].forEach(([, r], i) => {
      a += `<polyline points="${pts(r)}" fill="none" stroke="${routeCol[k]}" stroke-width="7" stroke-dasharray="${i === 2 ? "8 14" : "26 16"}" opacity=".85"/>`;
    });
    for (const p of SPAWNS[k]) a += bodyAt(p, routeCol[k], 0);
  }
  a +=
    tag("T1", [SPAWNS.t1[0][0] - 90, SPAWNS.t1[0][1] - 50], 44) +
    tag("T2", [SPAWNS.t2[0][0] - 30, SPAWNS.t2[0][1] + 80], 44);
  a +=
    tag("L1 west mesa", [760, 520 - STEP], 30) +
    tag("L1 north-east mesa", [2500, 420 - STEP], 30) +
    tag("L1 centre fin", [2100, 1180 - STEP], 30) +
    tag("L1 south-east mesa", [3000, 1700 - STEP], 30) +
    tag("L2 west top", [960, 600 - 2 * STEP], 30) +
    tag("L2 east top", [3260, 1840 - 2 * STEP], 30);
  a +=
    tag("natural arch (L1)", [1790, 620 - STEP], 28) +
    tag("passage under the fin (tunnel)", [2000, 1400], 28) +
    tag("lever → gate", [LEVER[0] - 120, LEVER[1] - STEP - 24], 28) +
    tag("gate", [GATE[0] - 20, GATE[1] + 70], 26);
  for (const l of LIFTS) a += tag("timer lift", [l.r[0][0] - 20, l.r[0][1] - 20], 26);
  a +=
    tag("sandstone wall", [2350, 2020], 26) +
    tag("scorched", [SCORCH.cx - 60, SCORCH.cy + 100], 28) +
    tag("rockfall", [ROCKFALL.cx - 60, ROCKFALL.cy + 100], 28) +
    tag("sandstorm band (atmosphere, timer)", [STORM[0][0], STORM[0][1] + 150], 28);
  for (const d of DROPS) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 70], 30);
  a +=
    tag("sun (NW), day", [150, 120], 40) +
    `<path d="M140,160 l90,70 m-20,-4 l20,4 l-6,-20" stroke="#fff1d6" stroke-width="8" fill="none"/>`;
  a += tag(
    "plan 4600×2800. Dashed: routes from each team's centre (wash, passage, lift and arch).",
    [20, MH - 20],
    32,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3073-elonian-plateau-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [0, "L0 canyon floor, wash, passage", [["ground", OUTLINE]]],
    [
      1,
      "L1 mesas, arch, lifts",
      [
        ["west mesa", M1],
        ["north-east mesa", M4],
        ["centre fin", M3],
        ["south-east mesa", M2],
        ["arch", ARCH],
        ...LIFTS.map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
        ...STAIRS.slice(0, 1).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [
      2,
      "L2 tops",
      [
        ["west top", L2W],
        ["east top", L2E],
        ...STAIRS.slice(1).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
  ];
  for (const [n, title, shapes] of L) {
    let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(OUTLINE)}" fill="#161d28" stroke="#35425a" stroke-width="6"/>`;
    for (const [id, p] of shapes) {
      a += `<polygon points="${pts(p)}" fill="${n === 0 ? C.ground : n === 1 ? C.deck : C.deckL2}" stroke="${INK}" stroke-width="6" opacity=".92"/>`;
      if (n) {
        const c = cen(p);
        a += tag(id, [c[0] - 90, c[1]], 30);
      }
    }
    if (n === 0) {
      const [p, q] = /** @type {[Pt, Pt]} */ (TUNNEL_PATH);
      a += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${C.tunnel}" stroke-width="${TUNNEL_W}" stroke-linecap="square"/>`;
      a += tag("passage (tunnel, L0 beneath the fin)", [1900, 1300], 30);
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3073-elonian-plateau-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const [x, y] = cen(SPAWNS[k]);
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, k === "t1" ? C.friend : C.foe, 0)).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3073-elonian-plateau-spawn-team${k === "t1" ? 1 : 2}`,
    800,
  );
}

// ---- the numbers the doc quotes ---------------------------------------------------------------------
console.log(
  "bounds M u²",
  ((MW * MH) / 1e6).toFixed(2),
  "ground fill %",
  Math.round((area(OUTLINE) / (MW * MH)) * 100),
);
console.log(
  "L2 areas",
  Math.round(area(L2W)),
  Math.round(area(L2E)),
  "ratio",
  (area(L2W) / area(L2E)).toFixed(2),
);
for (const k of /** @type {const} */ (["t1", "t2"]))
  for (const [n, r] of ROUTES[k])
    console.log(k, n, Math.round(len(r)), "u", (len(r) / SPEED).toFixed(1), "s");
