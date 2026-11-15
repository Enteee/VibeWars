/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3392 (part of #3073): Shiverpeak Pass, a snowy mountain pass with a chasm, 4v4.
// One world drawing in map units (3400x2300). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team of four standing in it.
// Usage: node scripts/assets/3073-shiverpeak-pass-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 3400,
  MH = 2300,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Snow biome (visual-style §1, #3286): ground #7d8a8e, rock #4d4a4a, decks #9ea4ab.
const C = {
  out: "#5a6064",
  ground: "#7d8a8e",
  deck: "#9ea4ab",
  deckL2: "#b4b9be",
  face: "#5d6268",
  faceE: "#474b50",
  lip: "#e2e6ea",
  roof: "#6a6a58",
  roofFace: "#44443a",
  tunnel: "#101419",
  seam: "#6c747a",
  chasm: "#0e1218",
  chasmEdge: "#2a323a",
  slush: "#6a6a58",
  scree: "#5c5856",
  wood: "#8a6a3e",
  woodFace: "#4f3b22",
  ice: "#a9bcc4",
  iceFace: "#6f8590",
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
  [240, 700],
  [700, 380],
  [1300, 260],
  [2000, 240],
  [2700, 330],
  [3150, 650],
  [3250, 1150],
  [3200, 1700],
  [2800, 2050],
  [2100, 2150],
  [1400, 2120],
  [700, 2000],
  [300, 1600],
  [160, 1150],
];
// the chasm: a drop-off band, open at its south end (the long way round)
/** @type {Pt[]} */
const CHASM = [
  [1560, 240],
  [1900, 240],
  [1940, 700],
  [1840, 1200],
  [1700, 1560],
  [1560, 1250],
  [1600, 700],
];
// L1: a cliff ledge on each side of the chasm, in the north
/** @type {Pt[]} */
const LEDGE_W = [
  [380, 760],
  [800, 620],
  [1300, 640],
  [1520, 720],
  [1540, 980],
  [1000, 1040],
  [520, 1000],
];
/** @type {Pt[]} */
const LEDGE_E = [
  [1940, 720],
  [2300, 600],
  [2850, 680],
  [3000, 900],
  [2900, 1050],
  [2300, 1020],
  [1940, 960],
];
// L2: a peak ledge above each cliff ledge, different outlines
/** @type {Pt[]} */
const L2W = [
  [600, 340],
  [1000, 300],
  [1180, 560],
  [780, 600],
];
/** @type {Pt[]} */
const L2E = [
  [2300, 290],
  [2780, 330],
  [2900, 560],
  [2400, 600],
];
const BRIDGE = rect(1520, 800, 420, 80); // the rope bridge at L1 height, lever-driven
const TUNNEL_W = 110;
// the cave through the ridge under the chasm: a mouth on each side's floor
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [1150, 1330],
  [2250, 1330],
];
const STAIRS = [
  { id: "stair-w", r: rect(760, 1040, 130, 90), from: 0 },
  { id: "stair-e", r: rect(2420, 1030, 130, 90), from: 0 },
  { id: "peak-stair-w", r: rect(880, 590, 120, 80), from: 1 },
  { id: "peak-stair-e", r: rect(2480, 580, 120, 80), from: 1 },
];
/** @type {{ at: Pt; e: number }[]} */
const DROPS = [
  { at: [1200, 1000], e: 1 },
  { at: [2750, 1000], e: 1 },
  { at: [560, 680], e: 2 },
  { at: [2950, 600], e: 2 },
];
const LEVERS = [
  { p: /** @type {Pt} */ ([1380, 860]), team: 1 },
  { p: /** @type {Pt} */ ([2080, 840]), team: 2 },
];
const OVERHANGS = [rect(1250, 1560, 220, 70)];
const BREAKABLE = rect(1688, 1700, 24, 220); // an ice wall in the south pass
const MIRE = { cx: 900, cy: 1680, rx: 120, ry: 60 };
const ROCKFALL = { cx: 2560, cy: 1720, rx: 130, ry: 62 };
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS = {
  t1: [
    [440, 1280],
    [500, 1420],
    [600, 1230],
    [660, 1370],
  ],
  t2: [
    [2980, 1330],
    [2920, 1480],
    [2800, 1270],
    [2760, 1420],
  ],
};
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [1150, 1330], col: C.torch, r: 150 },
  { p: [2250, 1330], col: C.torch, r: 150 },
  { p: [825, 1100], col: C.torch, r: 150 },
  { p: [2485, 1090], col: C.torch, r: 150 },
  { p: [1380, 860], col: C.torch, r: 140 },
  { p: [2080, 840], col: C.torch, r: 140 },
  { p: [1000, 560], col: C.torch, r: 150 },
  { p: [2620, 550], col: C.torch, r: 150 },
  { p: [520, 1330], col: C.torch, r: 200 },
  { p: [2860, 1380], col: C.torch, r: 200 },
];
const cen = (/** @type {Pt[]} */ a) =>
  /** @type {Pt} */ ([
    a.reduce((s, p) => s + p[0], 0) / a.length,
    a.reduce((s, p) => s + p[1], 0) / a.length,
  ]);
const C1 = cen(SPAWNS.t1),
  C2 = cen(SPAWNS.t2);
// routes from each team's centre to the chasm's middle landing (1700,1000): walk is the polyline at base speed
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    ["rope bridge", [C1, [825, 1130], [830, 1000], [1380, 880], [1700, 840]]],
    ["cave", [C1, [1150, 1330], [1700, 1330], [1700, 1000]]],
    ["south pass", [C1, [1000, 1700], [1700, 1700], [1700, 1000]]],
  ],
  t2: [
    ["rope bridge", [C2, [2485, 1120], [2480, 1000], [2080, 880], [1700, 840]]],
    ["cave", [C2, [2250, 1330], [1700, 1330], [1700, 1000]]],
    ["south pass", [C2, [2400, 1700], [1700, 1700], [1700, 1000]]],
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
    s += `<ellipse cx="${((i * 421) % 3100) - 200}" cy="${((i * 317 + i * i * 11) % 2300) - 200}" rx="${44 + (i % 4) * 12}" ry="${28 + (i % 4) * 8}" fill="#4d4a4a" stroke="${INK}" stroke-width="3" opacity=".9"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#flag)" opacity=".5"/>`;
  // the chasm: a dark drop with a lit lip, snow-dusted
  s += `<polygon points="${pts(CHASM)}" fill="${C.chasm}" stroke="${C.chasmEdge}" stroke-width="14" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(CHASM)}" fill="none" stroke="#e2e6ea" stroke-width="4" stroke-linejoin="round" opacity=".6" transform="translate(-6,-6)"/>`;
  // L0 zones
  s += ell(MIRE.cx, MIRE.cy, MIRE.rx, MIRE.ry, C.slush, "#4a4a3a");
  s += ell(ROCKFALL.cx, ROCKFALL.cy, ROCKFALL.rx, ROCKFALL.ry, C.scree, "#3a3838");
  // wind drifts on the floor
  s += `<ellipse cx="700" cy="1500" rx="200" ry="50" fill="#e6eaee" opacity=".3"/><ellipse cx="2700" cy="1500" rx="220" ry="55" fill="#e6eaee" opacity=".3"/>`;
  // cave floor and cover seam on the ground, grating slots every 120
  for (let i = 1; i < TUNNEL_PATH.length; i++) {
    const a = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
      b = /** @type {Pt} */ (TUNNEL_PATH[i]);
    s += `<polygon points="${pts(rect(Math.min(a[0], b[0]) - TUNNEL_W / 2, a[1] - TUNNEL_W / 2, Math.abs(b[0] - a[0]) + TUNNEL_W, TUNNEL_W))}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5" opacity=".95"/>`;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k * 120 < d; k++)
      s += `<rect x="${a[0] + k * 120 - 6}" y="${a[1] - 36}" width="12" height="72" fill="${C.seam}" opacity=".7"/>`;
  }
  // the rope bridge (L1 height): planks, two rope rails
  s += slab(BRIDGE, STEP, 10, C.wood, C.woodFace, C.woodFace);
  for (let x = 1530; x < 1940; x += 24)
    s += `<path d="M${x},${800 - STEP} v80" stroke="#3a2a16" stroke-width="3"/>`;
  s += `<path d="M1520,${800 - STEP - 14} H1940 M1520,${880 - STEP + 14} H1940" stroke="#d8c8a0" stroke-width="5"/>`;
  // breakable ice wall in the south pass
  s += slab(BREAKABLE, 0, 70, C.ice, C.iceFace, C.iceFace);
  // L1 wall-walks and the stairs up to them and to the towers
  for (const w of [LEDGE_W, LEDGE_E]) s += slab(w, STEP, STEP, C.deck, C.face, C.faceE);
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
  // a cliff overhang over the south lane
  for (const o of OVERHANGS) s += slab(o, 80, 12, C.roof, C.roofFace, C.roofFace);
  // L2 peak ledges
  s += slab(L2W, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  s += slab(L2E, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  // levers
  for (const l of LEVERS) {
    const lv = lift(l.p, STEP);
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
    tag("L1 west cliff ledge", [520, 700 - STEP], 30) +
    tag("L1 east cliff ledge", [2350, 600 - STEP], 30) +
    tag("L2 west peak", [640, 320 - 2 * STEP], 30) +
    tag("L2 east peak", [2360, 280 - 2 * STEP], 30);
  a +=
    tag("chasm", [1660, 480]) +
    tag("rope bridge (lever)", [1480, 780 - STEP], 28) +
    tag("cave through the ridge (tunnel)", [1250, 1300], 30);
  for (const l of LEVERS) a += tag("lever", [l.p[0] - 50, l.p[1] - STEP - 24], 28);
  a +=
    tag("ice wall", [1560, 1690], 28) +
    tag("drift (mire)", [MIRE.cx - 80, MIRE.cy + 100], 28) +
    tag("scree (rockfall)", [ROCKFALL.cx - 100, ROCKFALL.cy + 100], 28) +
    tag("south pass (the long way)", [1250, 2030], 30);
  for (const d of DROPS) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 70], 30);
  a +=
    tag("sun (NW), day", [150, 120], 40) +
    `<path d="M140,160 l90,70 m-20,-4 l20,4 l-6,-20" stroke="#fff1d6" stroke-width="8" fill="none"/>`;
  a += tag(
    "plan 3400×2300. Dashed: routes from each team's centre (rope bridge, cave, south pass).",
    [20, MH - 20],
    32,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3073-shiverpeak-pass-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [0, "L0 pass floor, chasm, cave", [["ground", OUTLINE]]],
    [
      1,
      "L1 cliff ledges",
      [
        ["west ledge", LEDGE_W],
        ["east ledge", LEDGE_E],
        ["bridge", BRIDGE],
        ...STAIRS.slice(0, 2).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [
      2,
      "L2 peak ledges",
      [
        ["west peak", L2W],
        ["east peak", L2E],
        ...STAIRS.slice(2).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
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
      a += `<polygon points="${pts(CHASM)}" fill="${C.chasm}" stroke="${INK}" stroke-width="6"/>${tag("chasm", [1660, 1000], 40)}`;
      const [p, q] = /** @type {[Pt, Pt]} */ (TUNNEL_PATH);
      a += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${C.tunnel}" stroke-width="${TUNNEL_W}" stroke-linecap="square"/>`;
      a += tag("cave (tunnel, L0 beneath the chasm)", [1000, 1300], 30);
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3073-shiverpeak-pass-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const [x, y] = cen(SPAWNS[k]);
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, k === "t1" ? C.friend : C.foe, 0)).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3073-shiverpeak-pass-spawn-team${k === "t1" ? 1 : 2}`,
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
