/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3392 (part of #3073): Sunken Bastion, a half-flooded fortress, 2v2.
// One world drawing in map units (2700x1900). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team's two bodies standing in it.
// Usage: node scripts/assets/3073-sunken-bastion-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 2700,
  MH = 1900,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Hall biome (visual-style §1): ground #26303f, rock #4b5a70, dressed stone.
const C = {
  out: "#1c2431",
  ground: "#26303f",
  deck: "#8c9bb0",
  deckL2: "#a6b4c8",
  face: "#4f5d72",
  faceE: "#38445a",
  lip: "#c9d6e6",
  roof: "#5d4a63",
  roofFace: "#3a2d40",
  tunnel: "#0c1018",
  seam: "#6b7a90",
  water: "#8fb8d6",
  waterDeep: "#0a1320",
  foul: "#4a5a2a",
  silt: "#5a4a3a",
  wood: "#8a6a3e",
  woodFace: "#4f3b22",
  wall: "#8a7d6a",
  wallFace: "#574d40",
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
  [200, 420],
  [560, 230],
  [1100, 150],
  [1700, 160],
  [2200, 240],
  [2520, 460],
  [2560, 950],
  [2480, 1420],
  [2150, 1700],
  [1600, 1780],
  [1000, 1760],
  [500, 1660],
  [180, 1350],
  [140, 850],
];
// the moat: a water band through the middle of the fortress, wider in the south
/** @type {Pt[]} */
const MOAT = [
  [1160, 150],
  [1500, 150],
  [1540, 700],
  [1560, 1100],
  [1580, 1780],
  [1130, 1760],
  [1150, 1150],
  [1120, 680],
];
// L1: the wall-walk ring: a long north walk across the moat and a west and east bank walk
/** @type {Pt[]} */
const WALK_N = [
  [620, 330],
  [1100, 360],
  [1600, 350],
  [2100, 340],
  [2110, 470],
  [1600, 480],
  [1100, 490],
  [640, 460],
];
/** @type {Pt[]} */
const WALK_SW = [
  [520, 1380],
  [980, 1400],
  [1010, 1520],
  [560, 1530],
];
/** @type {Pt[]} */
const WALK_SE = [
  [1700, 1400],
  [2160, 1380],
  [2180, 1500],
  [1720, 1530],
];
// L2: the gatehouse (west) and the keep (east), at the ends of the north walk
/** @type {Pt[]} */
const L2W = [
  [420, 280],
  [740, 240],
  [780, 520],
  [450, 560],
];
/** @type {Pt[]} */
const L2E = [
  [1980, 250],
  [2330, 300],
  [2340, 570],
  [1990, 580],
];
const DRAWBRIDGE = rect(1120, 860, 460, 90); // L0 level, lever-driven
const PIERS = [rect(1260, 520, 80, 80), rect(1330, 1130, 90, 70), rect(1380, 1480, 80, 70)]; // duckboard piers in the moat, no crossing
const TUNNEL_W = 110;
// the flooded cellar under the moat: straight, a mouth on each bank
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [820, 1280],
  [1860, 1280],
];
const STAIRS = [
  { id: "stair-nw", r: rect(560, 470, 130, 90), from: 0 },
  { id: "stair-ne", r: rect(2060, 470, 130, 90), from: 0 },
  { id: "stair-sw", r: rect(780, 1530, 130, 90), from: 0 },
  { id: "stair-se", r: rect(1760, 1530, 130, 90), from: 0 },
  { id: "tower-w", r: rect(640, 540, 110, 80), from: 1 },
  { id: "tower-e", r: rect(2000, 540, 110, 80), from: 1 },
];
/** @type {{ at: Pt; e: number }[]} */
const DROPS = [
  { at: [900, 495], e: 1 },
  { at: [1900, 495], e: 1 },
  { at: [800, 1540], e: 1 },
  { at: [2000, 1540], e: 1 },
];
const LEVERS = [
  { p: /** @type {Pt} */ ([1010, 800]), team: 1 },
  { p: /** @type {Pt} */ ([1690, 1010]), team: 2 },
];
const OVERHANGS = [rect(780, 880, 220, 70), rect(1700, 1100, 260, 70)];
const BREAKABLE = rect(1300, 1060, 150, 24); // a sluice wall in the moat, east of the bridge's south
const FOUL = { cx: 880, cy: 1160, rx: 110, ry: 55 };
const SILT = { cx: 1860, cy: 760, rx: 120, ry: 60 };
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS = {
  t1: [
    [420, 1000],
    [470, 1140],
  ],
  t2: [
    [2300, 950],
    [2250, 810],
  ],
};
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [820, 1280], col: C.torch, r: 150 },
  { p: [1860, 1280], col: C.torch, r: 150 },
  { p: [625, 520], col: C.torch, r: 150 },
  { p: [2125, 520], col: C.torch, r: 150 },
  { p: [845, 1590], col: C.torch, r: 150 },
  { p: [1825, 1590], col: C.torch, r: 150 },
  { p: [1010, 800], col: C.torch, r: 140 },
  { p: [1690, 1010], col: C.torch, r: 140 },
  { p: [1350, 910], col: C.torch, r: 170 },
];
const cen = (/** @type {Pt[]} */ a) =>
  /** @type {Pt} */ ([
    a.reduce((s, p) => s + p[0], 0) / a.length,
    a.reduce((s, p) => s + p[1], 0) / a.length,
  ]);
const C1 = cen(SPAWNS.t1),
  C2 = cen(SPAWNS.t2);
// routes from the team's centre to the drawbridge (1350,905): the walk is the polyline at base speed
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    ["drawbridge", [C1, [1130, 905], [1350, 905]]],
    ["wall-walk", [C1, [620, 560], [650, 420], [1350, 420], [1350, 905]]],
    ["cellar", [C1, [820, 1280], [1350, 1280], [1350, 905]]],
  ],
  t2: [
    ["drawbridge", [C2, [1570, 905], [1350, 905]]],
    ["wall-walk", [C2, [2120, 560], [2100, 420], [1350, 420], [1350, 905]]],
    ["cellar", [C2, [1860, 1280], [1350, 1280], [1350, 905]]],
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
    s += `<ellipse cx="${((i * 421) % 3100) - 200}" cy="${((i * 317 + i * i * 11) % 2300) - 200}" rx="${44 + (i % 4) * 12}" ry="${28 + (i % 4) * 8}" fill="#4b5a70" stroke="${INK}" stroke-width="3" opacity=".9"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#flag)" opacity=".6"/>`;
  // the moat: deep water, a lighter shallow rim, ripples
  s += `<polygon points="${pts(MOAT)}" fill="${C.waterDeep}" stroke="#c4dcee" stroke-width="10" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(MOAT)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  for (let k = 0; k < 14; k++)
    s += `<ellipse cx="${1180 + ((k * 97) % 360)}" cy="${240 + k * 110}" rx="46" ry="9" fill="#e6f4ff" opacity=".28"/>`;
  // L0 zones
  s += ell(FOUL.cx, FOUL.cy, FOUL.rx, FOUL.ry, C.foul, "#323d1c");
  s += ell(SILT.cx, SILT.cy, SILT.rx, SILT.ry, C.silt, "#3f3326");
  // the drowned courtyard: shallow water on both banks
  s += `<ellipse cx="600" cy="800" rx="170" ry="60" fill="${C.water}" opacity=".3"/><ellipse cx="2000" cy="1200" rx="190" ry="65" fill="${C.water}" opacity=".3"/>`;
  // cellar floor and cover seam on the ground, grating slots every 120
  for (let i = 1; i < TUNNEL_PATH.length; i++) {
    const a = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
      b = /** @type {Pt} */ (TUNNEL_PATH[i]);
    s += `<polygon points="${pts(rect(Math.min(a[0], b[0]) - TUNNEL_W / 2, a[1] - TUNNEL_W / 2, Math.abs(b[0] - a[0]) + TUNNEL_W, TUNNEL_W))}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5" opacity=".95"/>`;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k * 120 < d; k++)
      s += `<rect x="${a[0] + k * 120 - 6}" y="${a[1] - 36}" width="12" height="72" fill="${C.seam}" opacity=".7"/>`;
  }
  // the drawbridge (L0, lowered): planks over the moat
  s += slab(DRAWBRIDGE, 0, 16, C.wood, C.woodFace, C.woodFace);
  for (let x = 1136; x < 1580; x += 26)
    s += `<path d="M${x},860 v90" stroke="#3a2a16" stroke-width="3"/>`;
  for (const p of PIERS) s += slab(p, 0, 22, C.wood, C.woodFace, C.woodFace);
  // sluice wall in the moat (breakable)
  s += slab(BREAKABLE, 0, 60, C.wall, C.wallFace, C.wallFace);
  // L1 wall-walks and the stairs up to them and to the towers
  for (const w of [WALK_N, WALK_SW, WALK_SE]) s += slab(w, STEP, STEP, C.deck, C.face, C.faceE);
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
  // wall-walk overhangs (thin cloth-and-timber canopies over the banks)
  for (const o of OVERHANGS) s += slab(o, 80, 12, C.roof, C.roofFace, C.roofFace);
  // L2 gatehouse and keep
  s += slab(L2W, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  s += slab(L2E, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  s += slab(rect(2060, 330, 180, 160), 2 * STEP + 70, 60, C.roof, C.roofFace, C.roofFace);
  // levers
  for (const l of LEVERS) {
    const lv = lift(l.p, 0);
    s += `<circle cx="${lv[0]}" cy="${lv[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  }
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".18"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // the sun: a dusk wash from the north-west
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 34) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 34px 'DejaVu Sans',sans-serif;fill:#fff3e0;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 54px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="flag" width="240" height="240" patternUnits="userSpaceOnUse"><rect width="240" height="240" fill="none" stroke="#35425a" stroke-width="3"/><rect x="120" width="120" height="120" fill="#2c3748" opacity=".6"/><rect y="120" width="120" height="120" fill="#2c3748" opacity=".6"/></pattern>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb87a" stop-opacity=".3"/><stop offset=".5" stop-color="#ffb87a" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".3"/></linearGradient>
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
    tag("L1 north wall-walk", [1550, 330 - STEP]) +
    tag("L1 bank walk", [540, 1370 - STEP], 30) +
    tag("L1 bank walk", [1720, 1390 - STEP], 30) +
    tag("L2 gatehouse", [420, 240 - 2 * STEP], 30) +
    tag("L2 keep", [2080, 220 - 2 * STEP], 30);
  a +=
    tag("moat (deep)", [1250, 1650]) +
    tag("shallow pool", [600, 880], 26) +
    tag("shallow pool", [2000, 1290], 26) +
    tag("drawbridge (lever)", [1050, 850], 30) +
    tag("flooded cellar (tunnel)", [1050, 1240], 30);
  for (const l of LEVERS) a += tag("lever", [l.p[0] - 50, l.p[1] - 30], 28);
  a +=
    tag("sluice wall", [1250, 1040], 28) +
    tag("foul water", [FOUL.cx - 80, FOUL.cy + 100], 28) +
    tag("silt", [SILT.cx - 20, SILT.cy + 100], 28);
  for (const d of DROPS) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 70], 30);
  a +=
    tag("sun (NW), dusk", [150, 120], 40) +
    `<path d="M140,160 l90,70 m-20,-4 l20,4 l-6,-20" stroke="#ffb87a" stroke-width="8" fill="none"/>`;
  a += tag(
    "plan 2700×1900. Dashed: routes from each team's centre (drawbridge, wall-walk, cellar).",
    [20, MH - 20],
    32,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3073-sunken-bastion-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [0, "L0 courtyard floor, moat, cellar", [["ground", OUTLINE]]],
    [
      1,
      "L1 wall-walks",
      [
        ["north walk", WALK_N],
        ["west bank walk", WALK_SW],
        ["east bank walk", WALK_SE],
        ...STAIRS.slice(0, 4).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [
      2,
      "L2 gatehouse and keep",
      [
        ["gatehouse", L2W],
        ["keep", L2E],
        ...STAIRS.slice(4).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
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
      a += `<polygon points="${pts(MOAT)}" fill="${C.waterDeep}" stroke="${INK}" stroke-width="6"/>${tag("moat", [1250, 1000], 40)}`;
      a += `<polygon points="${pts(DRAWBRIDGE)}" fill="${C.wood}" stroke="${INK}" stroke-width="5"/>`;
      const [p, q] = /** @type {[Pt, Pt]} */ (TUNNEL_PATH);
      a += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${C.tunnel}" stroke-width="${TUNNEL_W}" stroke-linecap="square"/>`;
      a += tag("flooded cellar (tunnel, L0 beneath the moat)", [900, 1250], 30);
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3073-sunken-bastion-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const [x, y] = cen(SPAWNS[k]);
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, k === "t1" ? C.friend : C.foe, 0)).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3073-sunken-bastion-spawn-team${k === "t1" ? 1 : 2}`,
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
