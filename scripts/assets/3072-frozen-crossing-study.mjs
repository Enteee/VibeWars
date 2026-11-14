/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3276 (part of #3072): Frozen Crossing, a frozen river with two banks, 2v2.
// One world drawing in map units (2600x1940). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team standing in it.
// Usage: node scripts/assets/3072-frozen-crossing-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 2600,
  MH = 1940,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Proposed `snow` biome row: low chroma, neutral-warm snow, grey-teal ice; no tone near a signal hue.
const C = {
  out: "#1b1d20",
  ground: "#5a5f66", // shaded snow, the ground
  groundHi: "#6a7077",
  ice: "#7d8a94", // river ice, a breath cooler than snow
  iceHi: "#9aa6ae",
  water: "#34495a", // open water: dark, desaturated, not the help blue
  deck: "#9ea4ab", // sunlit snow bank, the stone deck of this biome
  deckL2: "#b4b9be",
  face: "#8b9096",
  faceE: "#6c7178",
  lip: "#f1f3f4",
  rock: "#4d4a4a",
  rockFace: "#35332f",
  log: "#8a6a48",
  logFace: "#523e29",
  tunnel: "#14161a",
  seam: "#7a848c",
  mire: "#6a6a58", // thaw slush
  scorch: "#2b2927",
  wall: "#a9bccb", // the breakable ice wall
  wallFace: "#5d7384",
  torch: "#ffb060",
  fire: "#ff9040",
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
/** @type {(a: Pt[]) => Pt[]} */
const mirror = (a) => a.map(([x, y]) => /** @type {Pt} */ ([MW - x, y]));

// ---- the place ---------------------------------------------------------------
/** @type {Pt[]} */
const OUTLINE = [
  [150, 500],
  [420, 230],
  [900, 130],
  [1400, 100],
  [1900, 170],
  [2300, 300],
  [2480, 700],
  [2450, 1200],
  [2380, 1620],
  [2050, 1860],
  [1500, 1890],
  [950, 1840],
  [520, 1780],
  [220, 1500],
  [110, 1000],
];
/** @type {Pt[]} */
const RIVER0 = [
  [1020, 120],
  [1560, 100],
  [1600, 600],
  [1520, 1000],
  [1580, 1400],
  [1540, 1880],
  [1000, 1860],
  [1060, 1400],
  [1000, 1000],
  [1080, 600],
];
// L1: the west bank; the east bank is its mirror, with a different cave and ridge
/** @type {Pt[]} */
const BANK_W0 = [
  [260, 500],
  [1030, 520],
  [1070, 900],
  [1010, 1300],
  [1050, 1700],
  [600, 1720],
  [300, 1450],
  [230, 1000],
];
// the east bank is the west one bent by hand: it bulges toward the river in the middle and steps back at the south
/** @type {Pt[]} */
const BEND = [
  [-40, 10],
  [30, -10],
  [60, 20],
  [-30, 30],
  [50, -20],
  [40, -40],
  [-50, 20],
  [-60, 30],
];
const BANK_E0 = mirror(BANK_W0).map(
  ([x, y], i) => /** @type {Pt} */ ([x + (BEND[i]?.[0] ?? 0), y + (BEND[i]?.[1] ?? 0)]),
);
// L2 ridges: different outlines, areas within 25 %
/** @type {Pt[]} */
const RIDGE_W0 = [
  [300, 560],
  [700, 500],
  [900, 600],
  [880, 900],
  [520, 950],
  [330, 800],
];
/** @type {Pt[]} */
const RIDGE_E0 = [
  [1700, 560],
  [2050, 520],
  [2300, 640],
  [2280, 960],
  [1950, 990],
  [1720, 860],
];
const LOG0 = rect(1030, 560, 570, 80); // log bridge between the banks, at bank height
// open water: north pools beside the central shelf, and the stepping-stone band
/** @type {Pt[][]} */
const POOLS0 = [
  [
    [1060, 660],
    [1180, 650],
    [1170, 860],
    [1070, 880],
  ],
  [
    [1420, 650],
    [1540, 660],
    [1530, 880],
    [1430, 860],
  ],
  // the deep band (1030..1570 x 1160..1360) minus the stone strip and its link north:
  rect(1030, 1160, 220, 70),
  rect(1350, 1160, 220, 70),
  rect(1030, 1320, 540, 40),
];
// stepping stones: 120 wide at a 105 pitch, so they overlap and run edge to edge of the deep band
// (x 1030..1570), plus a link of two more up to the band's north edge at x 1250..1350: no water
// between the strip and either bank or the central shelf
const STONES0 = [
  ...[1090, 1195, 1300, 1405, 1510].map((x) => rect(x - 60, 1230, 120, 90)),
  rect(1250, 1160, 100, 80),
];
const WALL0 = rect(1180, 740, 240, 26); // breakable ice wall across the central shelf strip
/** @type {Pt} */
const LEVER0 = [1300, 880];
/** @type {Pt[]} */
const TUNNEL_PATH0 = [
  [1570, 1500],
  [2000, 1500],
  [2000, 1710],
];
const TUNNEL_W = 110;
const STAIRS0 = [
  { id: "ramp-w", r: rect(960, 950, 110, 110), from: 0, horiz: true },
  { id: "ramp-e", r: rect(MW - 1070, 950, 110, 110), from: 0, horiz: true },
  { id: "stone-ramp-w", r: rect(930, 1235, 110, 90), from: 0, horiz: true },
  { id: "stone-ramp-e", r: rect(MW - 1040, 1235, 110, 90), from: 0, horiz: true },
  { id: "ridge-stair-w", r: rect(620, 930, 120, 90), from: 1, horiz: false },
  { id: "ridge-stair-e", r: rect(1980, 960, 120, 90), from: 1, horiz: false },
];
/** @type {{ at: Pt; e: number }[]} */
const DROPS0 = [
  { at: [330, 850], e: 2 },
  { at: [2290, 880], e: 2 },
  { at: [1040, 1600], e: 1 },
  { at: [1560, 1600], e: 1 },
];
const MIRE0 = { cx: 700, cy: 1810, rx: 100, ry: 38 };
const SCORCH0 = { cx: 1900, cy: 1810, rx: 90, ry: 32 };
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS0 = {
  t1: [
    [470, 1050],
    [540, 1180],
  ],
  t2: [
    [1850, 1250],
    [1780, 1380],
  ],
};
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS0 = [
  { p: [1570, 1500], col: C.torch, r: 150 },
  { p: [2000, 1710], col: C.torch, r: 150 },
  { p: [600, 1115], col: C.torch, r: 150 },
  { p: [1983, 1315], col: C.torch, r: 150 },
  { p: [1300, 880], col: C.torch, r: 150 },
  { p: [1050, 600], col: C.torch, r: 150 },
  { p: [1550, 600], col: C.torch, r: 150 },
];
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES0 = {
  t1: [
    [
      "ice shelf",
      [
        [500, 1380],
        [900, 1100],
        [1010, 1000],
        [1300, 1000],
      ],
    ],
    [
      "stepping stones",
      [
        [500, 1380],
        [1000, 1275],
        [1300, 1275],
        [1300, 1000],
      ],
    ],
    [
      "log bridge",
      [
        [500, 1380],
        [800, 900],
        [1000, 640],
        [1300, 600],
        [1300, 740],
        [1300, 1000],
      ],
    ],
  ],
  t2: [
    [
      "ice shelf",
      [
        [2125, 1425],
        [1700, 1100],
        [1590, 1000],
        [1300, 1000],
      ],
    ],
    [
      "stepping stones",
      [
        [2125, 1425],
        [1600, 1275],
        [1300, 1275],
        [1300, 1000],
      ],
    ],
    [
      "log bridge",
      [
        [2125, 1425],
        [1800, 900],
        [1600, 640],
        [1300, 600],
        [1300, 740],
        [1300, 1000],
      ],
    ],
  ],
};
/** @type {(r: Pt[]) => number} */
const len = (r) =>
  r.reduce((s, [x, y], i) => (i ? s + Math.hypot(x - r[i - 1][0], y - r[i - 1][1]) : 0), 0);

// ---- the river meanders -----------------------------------------------------------
// The plan above was drawn straight; every footprint is then sheared sideways by the same
// S-curve in y, so the river bends west, then east, and each bank is wide where the other is
// narrow. Faces stay vertical (the camera's up is screen-up), so only x moves.
/** @type {(y: number) => number} */
const F = (y) => Math.round(170 * Math.sin(((y - 250) / 1450) * 2 * Math.PI));
/** @type {(p: Pt) => Pt} */
const sp = ([x, y]) => [x + F(y), y];
/** @type {(a: Pt[]) => Pt[]} */
const sh = (a) => a.map(sp);
/** Like sh, but cut into 90 u pieces first so a long edge bends with the river. */
/** @type {(a: Pt[]) => Pt[]} */
const bend = (a) =>
  sh(
    a.flatMap((p, i) => {
      const q = /** @type {Pt} */ (a[(i + 1) % a.length]);
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 90));
      return Array.from(
        { length: n },
        (_, k) =>
          /** @type {Pt} */ ([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]),
      );
    }),
  );
/** @type {(r: Pt[]) => Pt[]} */
const slide = (r) => {
  const d = F((r[0][1] + r[2][1]) / 2);
  return r.map(([x, y]) => /** @type {Pt} */ ([x + d, y]));
};
const RIVER = bend(RIVER0);
const BANK_W = bend(BANK_W0);
const BANK_E = bend(BANK_E0);
const RIDGE_W = bend(RIDGE_W0);
const RIDGE_E = bend(RIDGE_E0);
const LOG = sh(LOG0);
const POOLS = POOLS0.map(sh);
const STONES = STONES0.map(sh);
const WALL = sh(WALL0);
const LEVER = sp(LEVER0);
const TUNNEL_SHIFT = F(1500);
const TUNNEL_PATH = TUNNEL_PATH0.map(([x, y]) => /** @type {Pt} */ ([x + TUNNEL_SHIFT, y]));
const STAIRS = STAIRS0.map((st) => ({ ...st, r: slide(st.r) }));
const DROPS = DROPS0.map((d) => ({ ...d, at: sp(d.at) }));
const MIRE = { ...MIRE0, cx: MIRE0.cx + F(MIRE0.cy) };
const SCORCH = { ...SCORCH0, cx: SCORCH0.cx + F(SCORCH0.cy) };
const SPAWNS = SPAWNS0;
const LIGHTS = LIGHTS0.map((l) => ({ ...l, p: sp(l.p) }));
/** @type {(k: "t1" | "t2") => [string, Pt[]][]} */
const routesOf = (k) => {
  const mid = /** @type {Pt} */ ([
    (SPAWNS[k][0][0] + SPAWNS[k][1][0]) / 2,
    (SPAWNS[k][0][1] + SPAWNS[k][1][1]) / 2,
  ]);
  return ROUTES0[k].map(([n, r]) => /** @type {[string, Pt[]]} */ ([n, [mid, ...sh(r.slice(1))]]));
};
const ROUTES = { t1: routesOf("t1"), t2: routesOf("t2") };

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

/** Plain 2.5D world, no annotations. */
const world = () => {
  let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#drift)" opacity=".6"/>`;
  // the frozen river: ice, with cracks; open water inside it
  s += `<polygon points="${pts(RIVER)}" fill="${C.ice}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  for (const [a = 0, b = 0, c = 0, d = 0] of [
    [1150, 250, 1300, 330],
    [1400, 900, 1350, 1100],
    [1200, 1450, 1450, 1600],
    [1100, 1700, 1380, 1780],
  ])
    s += `<path d="M${a},${b} L${(a + c) / 2 + 20},${(b + d) / 2 - 15} L${c},${d}" stroke="${C.iceHi}" stroke-width="5" fill="none" opacity=".8"/>`;
  for (const p of POOLS)
    s += `<polygon points="${pts(p)}" fill="${C.water}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  // zones: thaw slush (west), hearth char (east)
  s += `<ellipse cx="${MIRE.cx}" cy="${MIRE.cy}" rx="${MIRE.rx}" ry="${MIRE.ry}" fill="${C.mire}" stroke="#4a4a3a" stroke-width="5"/>`;
  s += `<ellipse cx="${SCORCH.cx}" cy="${SCORCH.cy}" rx="${SCORCH.rx}" ry="${SCORCH.ry}" fill="${C.scorch}" opacity=".85"/>`;
  // stepping stones on the water band
  for (const r of STONES) s += slab(r, 0, 22, C.deck, C.face, C.faceE);
  // ice wall across the central strip
  s += slab(WALL, 0, 70, C.wall, C.wallFace, C.wallFace);
  // the cave in the far bank: floor and seam on the ground, grating slots every 120
  for (let i = 1; i < TUNNEL_PATH.length; i++) {
    const a = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
      b = /** @type {Pt} */ (TUNNEL_PATH[i]);
    const vert = a[0] === b[0];
    const r = vert
      ? rect(a[0] - TUNNEL_W / 2, Math.min(a[1], b[1]), TUNNEL_W, Math.abs(b[1] - a[1]))
      : rect(
          Math.min(a[0], b[0]) - TUNNEL_W / 2,
          a[1] - TUNNEL_W / 2,
          Math.abs(b[0] - a[0]) + TUNNEL_W,
          TUNNEL_W,
        );
    s += `<polygon points="${pts(r)}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5"/>`;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k * 120 < d; k++) {
      const x = a[0] + ((b[0] - a[0]) * k * 120) / d,
        y = a[1] + ((b[1] - a[1]) * k * 120) / d;
      s += vert
        ? `<rect x="${x - 36}" y="${y - 6}" width="72" height="12" fill="${C.seam}" opacity=".7"/>`
        : `<rect x="${x - 6}" y="${y - 36}" width="12" height="72" fill="${C.seam}" opacity=".7"/>`;
    }
  }
  // banks (L1), then the ramps to them and to the ridges
  s += slab(BANK_W, STEP, STEP, C.deck, C.face, C.faceE);
  s += slab(BANK_E, STEP, STEP, C.deck, C.face, C.faceE);
  for (const st of STAIRS) {
    const e0 = st.from * STEP;
    const x = st.r[0][0],
      y = st.r[0][1],
      w = st.r[1][0] - x,
      h = st.r[2][1] - y;
    for (let i = 0; i < 5; i++) {
      const ee = e0 + ((i + 1) * STEP) / 5;
      s += st.horiz
        ? `<rect x="${x + (x < MW / 2 ? w - ((i + 1) * w) / 5 : ((i + 1) * w) / 5 - w / 5)}" y="${y - ee}" width="${w / 5}" height="${h}" fill="${i % 2 ? C.deck : C.lip}" stroke="${INK}" stroke-width="2"/>`
        : `<rect x="${x}" y="${y + h - ((i + 1) * h) / 5 - ee}" width="${w}" height="${h / 5}" fill="${i % 2 ? C.deck : C.lip}" stroke="${INK}" stroke-width="2"/>`;
    }
  }
  // ridges (L2): west is bare rock, east carries a snow cap
  s += slab(RIDGE_W, 2 * STEP, STEP, C.rock, C.rockFace, C.rockFace);
  s += slab(RIDGE_E, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  // the log bridge
  s += slab(LOG, STEP, 14, C.log, C.logFace, C.logFace);
  for (let x = 1046; x < 1600; x += 26)
    s += `<path d="M${x},${560 - STEP} v80" stroke="#523e29" stroke-width="3"/>`;
  // lever
  const lv = lift(LEVER, 0);
  s += `<circle cx="${lv[0]}" cy="${lv[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  // lights
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".16"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // snow fog: low pale ellipses under bodies
  for (const [x, y, rx] of [
    [1300, 300, 300],
    [1300, 1000, 260],
    [1300, 1650, 320],
    [700, 1100, 200],
    [1900, 1100, 200],
  ])
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.35}" fill="#e6eaee" opacity=".16"/>`;
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 34) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 34px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 54px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="drift" width="420" height="420" patternUnits="userSpaceOnUse"><ellipse cx="90" cy="100" rx="70" ry="26" fill="${C.groundHi}" opacity=".7"/><ellipse cx="300" cy="260" rx="90" ry="30" fill="${C.groundHi}" opacity=".6"/><circle cx="190" cy="360" r="16" fill="${C.rock}" opacity=".6"/></pattern>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1d6" stop-opacity=".28"/><stop offset=".5" stop-color="#fff1d6" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".3"/></linearGradient>
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
const teamCol = { t1: C.friend, t2: C.foe };

// ---- the plan --------------------------------------------------------------------
{
  let a = world();
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    ROUTES[k].forEach(([, r], i) => {
      a += `<polyline points="${pts(r.map((p, j) => (j === 0 ? p : p)))}" fill="none" stroke="${teamCol[k]}" stroke-width="7" stroke-dasharray="${["26 16", "8 14", "40 10 4 10"][i]}" opacity=".9"/>`;
    });
    for (const p of SPAWNS[k]) a += bodyAt(p, teamCol[k], STEP);
  }
  a += tag("T1", [380, 1010], 44) + tag("T2", [1780, 1210], 44);
  a += tag("L1 west bank", [150, 1480]) + tag("L1 east bank", [2000, 1000]);
  a += tag("L2 bare ridge", [430, 760 - 2 * STEP]) + tag("L2 snow ridge", [1760, 760 - 2 * STEP]);
  a +=
    tag("log bridge", [1130, 540 - STEP]) +
    tag("open water", [1090, 1275]) +
    tag("stepping stones", [1090, 1160]);
  a += tag("ice wall", [1230, 725]) + tag("lever", [1330, 900]) + tag("ice shelf", [1190, 1060]);
  a +=
    tag("cave (tunnel)", [1700, 1470]) +
    tag("thaw slush", [MIRE.cx - 60, MIRE.cy + 70]) +
    tag("hearth char", [SCORCH.cx - 80, SCORCH.cy + 70]);
  for (const d of DROPS) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 60], 30);
  a +=
    tag("sun (NW), day + snow fog", [150, 120], 40) +
    `<path d="M140,160 l90,70 m-20,-4 l20,4 l-6,-20" stroke="#fff1d6" stroke-width="8" fill="none"/>`;
  a += tag(
    "plan 2600×1940. Dashed: routes (ice shelf, stepping stones, log bridge).",
    [20, MH - 20],
    32,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3072-frozen-crossing-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [
      0,
      "L0 river ice, open water, stones, cave floor",
      [
        ["ground", OUTLINE],
        ["ice", RIVER],
      ],
    ],
    [
      1,
      "L1 banks, log bridge, ramps",
      [
        ["west bank", BANK_W],
        ["east bank", BANK_E],
        ["log", LOG],
        ...STAIRS.slice(0, 4).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [
      2,
      "L2 ridges",
      [
        ["bare ridge", RIDGE_W],
        ["snow ridge", RIDGE_E],
        ...STAIRS.slice(4).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
  ];
  for (const [n, title, shapes] of L) {
    let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(OUTLINE)}" fill="#25282c" stroke="#4a4f55" stroke-width="6"/>`;
    for (const [id, p] of shapes) {
      a += `<polygon points="${pts(p)}" fill="${n === 0 ? (id === "ice" ? C.ice : C.ground) : n === 1 ? C.deck : C.deckL2}" stroke="${INK}" stroke-width="6" opacity=".92"/>`;
      if (n) {
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length;
        const cy = p.reduce((s, q) => s + q[1], 0) / p.length;
        a += tag(id, [cx - 80, cy], 30);
      }
    }
    if (n === 0) {
      for (const p of POOLS)
        a += `<polygon points="${pts(p)}" fill="${C.water}" stroke="${INK}" stroke-width="5"/>`;
      for (const r of STONES)
        a += `<polygon points="${pts(r)}" fill="${C.deck}" stroke="${INK}" stroke-width="4"/>`;
      for (let i = 1; i < TUNNEL_PATH.length; i++) {
        const p = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
          q = /** @type {Pt} */ (TUNNEL_PATH[i]);
        a += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${C.tunnel}" stroke-width="${TUNNEL_W}" stroke-linecap="square"/>`;
      }
      a +=
        tag("cave under the east bank", [1640, 1470], 30) +
        tag("open water + stones", [1090, 1275], 30);
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3072-frozen-crossing-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const [x, y] = /** @type {Pt} */ ([
    (SPAWNS[k][0][0] + SPAWNS[k][1][0]) / 2,
    (SPAWNS[k][0][1] + SPAWNS[k][1][1]) / 2 - STEP,
  ]);
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, teamCol[k], STEP)).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3072-frozen-crossing-spawn-team${k === "t1" ? 1 : 2}`,
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
  "ridge areas",
  Math.round(area(RIDGE_W)),
  Math.round(area(RIDGE_E)),
  "ratio",
  (area(RIDGE_W) / area(RIDGE_E)).toFixed(2),
);
for (const k of /** @type {const} */ (["t1", "t2"]))
  for (const [n, r] of ROUTES[k])
    console.log(k, n, Math.round(len(r)), "u", (len(r) / SPEED).toFixed(1), "s");
