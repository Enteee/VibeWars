/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3276 (part of #3072): Moss Vale, a green valley, 8v8.
// One world drawing in map units (5000x2600). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team standing in it.
// Usage: node scripts/assets/3072-moss-vale-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 5000,
  MH = 2600,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Wilds biome (visual-style §1): moss ground, stone rock. Water and mist are looks, not new tones.
const C = {
  out: "#101a14",
  ground: "#2c4a34",
  field: "#3a5e3e", // terraced fields
  furrow: "#2f5035",
  rock: "#5a6358",
  top: "#6f8a62", // terrace top
  face: "#3d5240",
  faceE: "#2e4033",
  lip: "#b4cfa2",
  roof: "#8a6a4c",
  roofFace: "#53402e",
  arch: "#7d8a78",
  archFace: "#48524a",
  pool: "#2f6b82",
  race: "#2a5c72",
  fall: "#bfe3ee",
  tunnel: "#0f1613",
  seam: "#8fa38a",
  timber: "#8a6a4c",
  torch: "#ffb060",
  mist: "#dfeee6",
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
/** The valley is mirrored west-east: the same shape for both teams. */
/** @type {(p: Pt) => Pt} */
const mx = ([x, y]) => [MW - x, y];
/** @type {(r: Pt[]) => Pt[]} */
const mrect = (r) => {
  const [a, , c] = /** @type {[Pt, Pt, Pt]} */ ([r[0], r[1], r[2]]);
  return rect(MW - c[0], a[1], c[0] - a[0], c[1] - a[1]);
};

// ---- the place ---------------------------------------------------------------
// A valley, wide in the middle, pinched at the spawn ends, a cliff cut in the north for the
// waterfall and a notch in the south where the race leaves.
/** @type {Pt[]} */
const WEST = [
  [140, 700],
  [420, 380],
  [900, 260],
  [1500, 200],
  [2050, 180],
  [2300, 120],
  [2500, 120],
];
/** @type {Pt[]} */
const SOUTHW = [
  [2500, 2480],
  [2300, 2480],
  [2100, 2440],
  [1500, 2400],
  [900, 2340],
  [420, 2220],
  [140, 1900],
  [60, 1300],
];
const OUTLINE = [
  ...WEST,
  ...WEST.slice(0, -1).reverse().map(mx),
  ...SOUTHW.map(mx).reverse(),
  ...SOUTHW.slice(1),
];
// the waterfall pool and the mill race south of it; the race is water, not walkable
const POOL = { cx: 2500, cy: 520, rx: 380, ry: 190 };
/** @type {Pt[]} */
const RACE = [
  [2400, 640],
  [2600, 640],
  [2600, 2480],
  [2400, 2480],
];
// L3: the cliff-top ledge behind the waterfall; the mill roof is L2
const LEDGES = [
  { id: "falls ledge W", r: rect(1850, 150, 330, 170) },
  { id: "falls ledge E", r: mrect(rect(1850, 150, 330, 170)) },
];
// L2: terraced fields and their upper terraces (L3), arches, the drawbridge, the mill floor
const TERRACES = [
  { id: "field terrace W", r: rect(620, 330, 980, 330), elev: 1 },
  { id: "field terrace E", r: mrect(rect(620, 330, 980, 330)), elev: 1 },
  { id: "upper terrace W", r: rect(1000, 270, 420, 200), elev: 2 },
  { id: "upper terrace E", r: mrect(rect(1000, 270, 420, 200)), elev: 2 },
  { id: "south terrace W", r: rect(700, 1980, 900, 300), elev: 1 },
  { id: "south terrace E", r: mrect(rect(700, 1980, 900, 300)), elev: 1 },
];
const ARCHES = [
  { id: "natural arch W", r: rect(1500, 1000, 560, 160) },
  { id: "natural arch E", r: mrect(rect(1500, 1000, 560, 160)) },
];
const DRAWBRIDGE = rect(2400, 1240, 200, 120); // over the race; lever-driven
const MILL = rect(2380, 1780, 240, 200); // the ruined mill floor, over the race
/** @type {Pt} */
const LEVER = [2290, 1160];
// stairs: field terrace up from the valley, upper terrace up from the field, arch ends
const STAIRS = [
  { id: "stair-F1", r: rect(900, 660, 140, 110), from: 0, dir: "n" },
  { id: "stair-F2", r: rect(1480, 660, 140, 110), from: 0, dir: "n" },
  { id: "stair-U1", r: rect(1100, 470, 140, 100), from: 1, dir: "n" },
  { id: "stair-S1", r: rect(900, 1870, 140, 110), from: 0, dir: "s" },
  { id: "stair-S2", r: rect(1420, 1870, 140, 110), from: 0, dir: "s" },
  { id: "arch-up-W1", r: rect(1380, 1000, 120, 160), from: 0, dir: "e" },
  { id: "arch-up-W2", r: rect(2060, 1000, 120, 160), from: 0, dir: "w" },
  { id: "mill-up-W", r: rect(2240, 1830, 140, 110), from: 0, dir: "e" },
];
const MIRRORED = STAIRS.map((s) => ({
  ...s,
  id: `${s.id}~`,
  r: mrect(s.r),
  dir: s.dir === "e" ? "w" : s.dir === "w" ? "e" : s.dir,
}));
const ALLSTAIRS = [...STAIRS, ...MIRRORED];
// the mill under-pass: a dry service tunnel on the ground layer, crossing beneath the race
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [2200, 1880],
  [2800, 1880],
];
const TUNNEL_W = 160;
// breakable walls: collapsed field walls in the centre-south of each half
const BARRICADES = [rect(1700, 1500, 26, 360), rect(3274, 1500, 26, 360)];
// local overhangs: a leaning mill-race shed on each bank, different widths
const OVERHANGS = [rect(2090, 1420, 220, 110), rect(2700, 1420, 300, 110)];
// mist: zone patches at dawn (slow), along the race and the fields
const MIST = [
  { cx: 1700, cy: 1400, rx: 280, ry: 90 },
  { cx: 3300, cy: 1400, rx: 280, ry: 90 },
  { cx: 2500, cy: 2200, rx: 260, ry: 80 },
];
// bog: a wet-ground zone in each spawn mouth's flank
const BOG = [
  { cx: 900, cy: 1500, rx: 200, ry: 80 },
  { cx: 4100, cy: 1500, rx: 200, ry: 80 },
];
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS = { t1: [], t2: [] };
for (let i = 0; i < 8; i++) {
  /** @type {Pt} */
  const p = [430 + (i % 2) * 190, 1030 + Math.floor(i / 2) * 180];
  SPAWNS.t1.push(p);
  SPAWNS.t2.push(mx(p));
}
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [2500, 1300], col: C.torch, r: 170 },
  { p: [2290, 1160], col: C.torch, r: 140 },
  { p: [2500, 1880], col: C.torch, r: 160 },
  { p: [2200, 1880], col: C.torch, r: 130 },
  { p: [2800, 1880], col: C.torch, r: 130 },
  { p: [1780, 1080], col: C.torch, r: 140 },
  { p: [3220, 1080], col: C.torch, r: 140 },
  { p: [1170, 700], col: C.torch, r: 140 },
  { p: [3830, 700], col: C.torch, r: 140 },
  { p: [700, 1300], col: C.torch, r: 150 },
  { p: [4300, 1300], col: C.torch, r: 150 },
];
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    [
      "valley floor, over the drawbridge",
      [
        [600, 1300],
        [1500, 1300],
        [2400, 1300],
        [2500, 1300],
      ],
    ],
    [
      "mill under-pass",
      [
        [600, 1300],
        [1200, 1700],
        [2200, 1880],
        [2500, 1880],
        [2500, 1500],
        [2500, 1300],
      ],
    ],
    [
      "arch deck",
      [
        [600, 1300],
        [1380, 1080],
        [2180, 1080],
        [2400, 1300],
        [2500, 1300],
      ],
    ],
  ],
  t2: [],
};
ROUTES.t2 = ROUTES.t1.map(([n, r]) => [n, r.map(mx)]);
/** @type {(r: Pt[]) => number} */
const len = (r) =>
  r.reduce(
    (s, [x, y], i) => (i ? s + Math.hypot(x - (r[i - 1]?.[0] ?? 0), y - (r[i - 1]?.[1] ?? 0)) : 0),
    0,
  );

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
  s += `<polygon points="${pts(poly.map((p) => up(p, elev)))}" fill="none" stroke="${C.lip}" stroke-width="3" opacity=".6" transform="translate(0,3)"/>`;
  return s;
};

/** Open steps, five treads, rising toward `dir`; `from` is the layer step it starts on. */
/** @type {(st: { r: Pt[]; from: number; dir: string }) => string} */
const steps = (st) => {
  const [a, , c] = /** @type {[Pt, Pt, Pt]} */ ([st.r[0], st.r[1], st.r[2]]);
  const x = a[0],
    y = a[1],
    w = c[0] - x,
    h = c[1] - y;
  let s = "";
  for (let i = 0; i < 5; i++) {
    const e = (st.from + (i + 1) / 5) * STEP;
    const k = (i + 1) / 5;
    const horiz = st.dir === "e" || st.dir === "w";
    const rx = horiz ? (st.dir === "e" ? x + w * (1 - k) : x) : x;
    const ry = y + h * (1 - k);
    s += horiz
      ? `<rect x="${rx}" y="${y - e}" width="${w * k}" height="${h}" fill="${i % 2 ? C.top : C.lip}" stroke="${INK}" stroke-width="2"/>`
      : `<rect x="${rx}" y="${ry - e}" width="${w}" height="${h / 5}" fill="${i % 2 ? C.top : C.lip}" stroke="${INK}" stroke-width="2"/>`;
  }
  return s;
};

/** Plain 2.5D world, no annotations. */
const world = () => {
  let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
  // rock and scree outside the valley
  for (const [x, y, r] of [
    [80, 160, 90],
    [4920, 160, 90],
    [100, 2480, 90],
    [4900, 2480, 90],
    [1200, 100, 60],
    [3800, 100, 60],
    [1200, 2540, 60],
    [3800, 2540, 60],
  ])
    s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="${C.rock}" opacity=".6"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  // pool, race, waterfall
  s += `<ellipse cx="${POOL.cx}" cy="${POOL.cy}" rx="${POOL.rx}" ry="${POOL.ry}" fill="${C.pool}" stroke="${INK}" stroke-width="6"/>`;
  s += `<polygon points="${pts(RACE)}" fill="${C.race}" stroke="${INK}" stroke-width="5"/>`;
  for (let y = 700; y < 2480; y += 160)
    s += `<path d="M2430,${y} q70,-26 140,0" stroke="${C.fall}" stroke-width="4" fill="none" opacity=".55"/>`;
  s += `<rect x="2380" y="200" width="240" height="${POOL.cy - 190 - 200 + 190}" fill="${C.fall}" opacity=".85" stroke="${INK}" stroke-width="4"/>`;
  for (let x = 2400; x < 2620; x += 40)
    s += `<path d="M${x},210 v300" stroke="#fff" stroke-width="3" opacity=".6"/>`;
  // mist (zone) and bog (zone)
  for (const z of MIST)
    s += `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="${C.mist}" opacity=".3" stroke="#a9c4b4" stroke-width="3" stroke-dasharray="10 8"/>`;
  for (const z of BOG)
    s += `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="#1f3326" opacity=".9"/><ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx * 0.6}" ry="${z.ry * 0.5}" fill="${C.race}" opacity=".6"/>`;
  // the mill under-pass: floor with cover seam and slots, running beneath the race
  {
    const [a, b] = /** @type {[Pt, Pt]} */ ([TUNNEL_PATH[0], TUNNEL_PATH[1]]);
    s += `<polygon points="${pts(rect(a[0], a[1] - TUNNEL_W / 2, b[0] - a[0], TUNNEL_W))}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5"/>`;
    for (let x = a[0] + 100; x < b[0]; x += 100)
      s += `<rect x="${x - 6}" y="${a[1] - 55}" width="12" height="110" fill="${C.seam}" opacity=".7"/>`;
  }
  // breakable walls and the shed overhangs
  for (const b of BARRICADES) s += slab(b, 0, 70, C.timber, C.roofFace, C.roofFace);
  for (const o of OVERHANGS) s += slab(o, 90, 12, C.timber, C.roofFace, C.roofFace);
  // terraces (L2), upper terraces (L3) and their stairs
  for (const t of TERRACES.filter((t) => t.elev === 1)) {
    s += slab(t.r, STEP, STEP, C.field, C.face, C.faceE);
    const [a, , c] = /** @type {[Pt, Pt, Pt]} */ ([t.r[0], t.r[1], t.r[2]]);
    for (let y = a[1] + 40; y < c[1]; y += 50)
      s += `<path d="M${a[0] + 10},${y - STEP} H${c[0] - 10}" stroke="${C.furrow}" stroke-width="5" opacity=".7"/>`;
  }
  for (const st of ALLSTAIRS.filter(
    (q) => q.from === 0 && !q.id.startsWith("arch") && !q.id.startsWith("mill"),
  ))
    s += steps(st);
  for (const t of TERRACES.filter((t) => t.elev === 2))
    s += slab(t.r, 2 * STEP, STEP, C.top, C.face, C.faceE);
  for (const st of ALLSTAIRS.filter((q) => q.from === 1)) s += steps(st);
  // arches: two legs and a deck, the way under stays open
  for (const a of ARCHES) {
    s += slab(a.r, STEP, STEP, C.arch, C.archFace, C.archFace);
    const [p, , q] = /** @type {[Pt, Pt, Pt]} */ ([a.r[0], a.r[1], a.r[2]]);
    s += `<path d="M${p[0] + 30},${q[1] - STEP} q${(q[0] - p[0] - 60) / 2},${-70} ${q[0] - p[0] - 60},0" fill="none" stroke="${INK}" stroke-width="5" opacity=".6"/>`;
  }
  for (const st of ALLSTAIRS.filter((q) => q.id.startsWith("arch") || q.id.startsWith("mill")))
    s += steps(st);
  // drawbridge and the ruined mill
  s += slab(DRAWBRIDGE, 20, 20, C.timber, C.roofFace, C.roofFace);
  s += slab(MILL, STEP, STEP, C.roof, C.roofFace, C.roofFace);
  s += `<circle cx="${LEVER[0]}" cy="${LEVER[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  // waterfall-ledge (L3)
  for (const l of LEDGES) s += slab(l.r, 2 * STEP, STEP, C.top, C.face, C.faceE);
  // lights
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".14"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // dawn mist band, low and pale, under bodies; then the sun wash
  for (const [x, y, rx] of [
    [1100, 1800, 420],
    [3900, 1800, 420],
    [2500, 1050, 320],
  ])
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.28}" fill="${C.mist}" opacity=".14"/>`;
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 36) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 36px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 70px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe6c0" stop-opacity=".3"/><stop offset=".5" stop-color="#ffe6c0" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".3"/></linearGradient>
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
/** @type {(p: Pt, col: string) => string} */
const bodyAt = (p, col) =>
  `<ellipse cx="${p[0] + 10}" cy="${p[1] + 26}" rx="30" ry="12" fill="#080b10" opacity=".35"/><circle cx="${p[0]}" cy="${p[1]}" r="30" fill="${col}" stroke="#eaf4ff" stroke-width="5"/>`;
const teamCol = { t1: C.friend, t2: C.foe };

// ---- the plan --------------------------------------------------------------------
{
  let a = world();
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    ROUTES[k].forEach(([, r], i) => {
      a += `<polyline points="${pts(r)}" fill="none" stroke="${teamCol[k]}" stroke-width="9" stroke-dasharray="${["30 16", "10 14", "2 14"][i]}" opacity=".9"/>`;
    });
    for (const p of SPAWNS[k]) a += bodyAt(p, teamCol[k]);
  }
  a += tag("T1", [330, 960], 54) + tag("T2", [4540, 960], 54);
  a +=
    tag("waterfall", [2270, 330 - 0], 40) +
    tag("pool", [2440, 540], 40) +
    tag("mill race (water)", [2640, 800], 32) +
    tag("drawbridge", [2620, 1230], 32) +
    tag("lever", [2150, 1130], 32) +
    tag("ruined mill", [2650, 1840 - STEP], 32) +
    tag("under-pass", [2560, 1990], 32);
  a +=
    tag("L2 field terrace", [640, 310 - STEP], 32) +
    tag("L3 upper terrace", [1010, 250 - 2 * STEP], 30) +
    tag("L3 falls ledge", [1780, 135 - 2 * STEP], 28) +
    tag("L2 natural arch", [1520, 980 - STEP], 32) +
    tag("L2 south terrace", [720, 1960 - STEP], 32) +
    tag("timber wall", [1580, 1480], 28) +
    tag("shed", [2090, 1400 - 90], 28) +
    tag("mist", [1590, 1400], 28) +
    tag("bog", [840, 1500], 28);
  a +=
    tag("sun (E, low, dawn)", [3700, 1500], 40) +
    `<path d="M4560,1480 l-120,-60" stroke="#ffe6c0" stroke-width="9" fill="none"/>`;
  a += tag(
    "plan 5000×2600, mirrored W–E. Dashed: routes to the drawbridge (floor, under-pass, arch). Left half only labelled.",
    [20, MH - 20],
    34,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3072-moss-vale-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {(r: { id: string; r: Pt[] }) => [string, Pt[]]} */
  const e = (x) => [x.id, x.r];
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [
      0,
      "L0 race bed, pool, mill under-pass",
      [
        ["pool", rect(POOL.cx - POOL.rx, POOL.cy - POOL.ry, POOL.rx * 2, POOL.ry * 2)],
        ["race", RACE],
        ["under-pass", rect(TUNNEL_PATH[0][0], TUNNEL_PATH[0][1] - 80, 600, TUNNEL_W)],
      ],
    ],
    [1, "L1 valley floor", [["valley", OUTLINE]]],
    [
      2,
      "L2 terraces, arches, drawbridge, mill",
      [
        ...TERRACES.filter((t) => t.elev === 1).map(e),
        ...ARCHES.map(e),
        ["drawbridge", DRAWBRIDGE],
        ["mill", MILL],
        ...ALLSTAIRS.map(e),
      ],
    ],
    [
      3,
      "L3 upper terraces, falls ledges",
      [...TERRACES.filter((t) => t.elev === 2).map(e), ...LEDGES.map(e)],
    ],
  ];
  for (const [n, title, shapes] of L) {
    let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(OUTLINE)}" fill="#1a2a20" stroke="#3d5a46" stroke-width="6"/>`;
    for (const [id, p] of shapes) {
      a += `<polygon points="${pts(p)}" fill="${n === 0 ? C.race : n === 1 ? C.ground : n === 2 ? C.top : C.arch}" stroke="${INK}" stroke-width="6" opacity=".95"/>`;
      if (n !== 1 && !id.endsWith("~")) {
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length;
        const cy = p.reduce((s, q) => s + q[1], 0) / p.length;
        a += tag(id, [cx - 90, cy], 28);
      }
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3072-moss-vale-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const x = SPAWNS[k].reduce((s, p) => s + p[0], 0) / 8,
    y = SPAWNS[k].reduce((s, p) => s + p[1], 0) / 8;
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, teamCol[k])).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3072-moss-vale-spawn-team${k === "t1" ? 1 : 2}`,
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
const hi = (/** @type {{ r: Pt[] }[]} */ l) => l.reduce((s, w) => s + area(w.r), 0);
console.log(
  "L2 area",
  Math.round(hi(TERRACES.filter((t) => t.elev === 1))),
  "L3 area",
  Math.round(hi(LEDGES) + hi(TERRACES.filter((t) => t.elev === 2))),
);
for (const k of /** @type {const} */ (["t1", "t2"]))
  for (const [n, r] of ROUTES[k])
    console.log(k, n, Math.round(len(r)), "u", (len(r) / SPEED).toFixed(1), "s");
