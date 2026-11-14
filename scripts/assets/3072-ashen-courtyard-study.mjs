/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3276 (part of #3072): Ashen Courtyard, a burned castle courtyard, 4v4.
// One world drawing in map units (3200x2400). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the team standing in it.
// Usage: node scripts/assets/3072-ashen-courtyard-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 3200,
  MH = 2400,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  INK = "#0b0f14",
  SPEED = 180, // maxSpeedUnitsPerSecond in game-core's ruleset
  STEP = 70; // drawn height of one layer step
// Hall biome (visual-style §1): ground #26303f, rock #4b5a70. Burn is zones and light, not a new row.
const C = {
  out: "#252b34",
  ground: "#26303f",
  flag: "#2f3a4c", // flagstones
  rock: "#4b5a70",
  wall: "#6b7a90", // wall-walk top
  face: "#394659",
  faceE: "#2b3547",
  lip: "#a9bbd0",
  tower: "#8394ab",
  towerFace: "#46556b",
  char: "#1b1a1a", // burned ground
  ash: "#4a4a4c",
  timber: "#7a5a3c",
  timberFace: "#4a3624",
  pit: "#171c26",
  pitFace: "#2d3748",
  water: "#34495a",
  tunnel: "#10131a",
  seam: "#7a8798",
  gate: "#a8b4c4",
  fire: "#ff9040",
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
// A walled box, chamfered at the corners, with a barbican yard bulging out south of the gatehouse.
/** @type {Pt[]} */
const OUTLINE = [
  [270, 200],
  [2930, 200],
  [3080, 350],
  [3080, 2050],
  [2930, 2200],
  [1900, 2200],
  [1900, 2380],
  [1300, 2380],
  [1300, 2200],
  [270, 2200],
  [120, 2050],
  [120, 350],
];
// L2 wall-walk: four strips; a collapse in the east north strip, the gatehouse breaks the south one
const WALKS = [
  { id: "north walk", r: rect(420, 220, 2360, 190) },
  { id: "south walk W", r: rect(420, 1990, 960, 190) },
  { id: "south walk E", r: rect(1820, 1990, 960, 190) },
  { id: "west walk", r: rect(140, 420, 190, 1560) },
  { id: "east walk", r: rect(2870, 420, 190, 1560) },
];
// L3: four corner towers and the gatehouse block over the south wall
const TOWERS = [
  { id: "tower NW", r: rect(140, 220, 280, 200) },
  { id: "tower NE", r: rect(2780, 220, 280, 200) },
  { id: "tower SW", r: rect(140, 1980, 280, 200) },
  { id: "tower SE", r: rect(2780, 1980, 280, 200) },
  { id: "gatehouse", r: rect(1380, 1960, 440, 240) },
];
// the sunken well court (L0, a pit under the ground) with a ramp down from each side
const PIT = rect(1300, 1000, 600, 400);
const WELL = { cx: 1600, cy: 1200, rx: 120, ry: 60 };
const RAMPS = [
  { id: "pit-ramp-w", r: rect(1140, 1120, 160, 160), from: -1, dir: "e" },
  { id: "pit-ramp-e", r: rect(1900, 1120, 160, 160), from: -1, dir: "w" },
];
// stairs from the courtyard up to the wall-walks (L1→L2), and from the walks up the towers (L2→L3)
const STAIRS = [
  { id: "stair-N1", r: rect(900, 410, 140, 110), from: 0, dir: "n" },
  { id: "stair-N2", r: rect(1530, 410, 140, 110), from: 0, dir: "n" },
  { id: "stair-N3", r: rect(2200, 410, 140, 110), from: 0, dir: "n" },
  { id: "stair-W", r: rect(330, 1000, 110, 140), from: 0, dir: "w" },
  { id: "stair-E", r: rect(2760, 1000, 110, 140), from: 0, dir: "e" },
  { id: "stair-S1", r: rect(900, 1880, 140, 110), from: 0, dir: "s" },
  { id: "stair-S2", r: rect(2200, 1880, 140, 110), from: 0, dir: "s" },
];
// the gatehouse passage: a tunnel on the ground layer under the gatehouse, to the barbican
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [1600, 1960],
  [1600, 2300],
];
const TUNNEL_W = 200;
const GATE = rect(1500, 2150, 200, 30); // portcullis, worked by the lever on the west wall-walk
/** @type {Pt} */
const LEVER = [235, 1200];
/** @type {Pt} */
const LEVER2 = [2965, 1200]; // the same portcullis, worked from the east wall-walk too
// fallen-timber walls: breakable, a team's yard has two exits north and south
const BARRICADES = [rect(1000, 1000, 26, 400), rect(2174, 1000, 26, 400)];
// lean-to overhangs of charred rafters along the north wall (different on each side)
const OVERHANGS = [rect(1000, 440, 420, 120), rect(1760, 440, 320, 120)];
/** @type {{ cx: number; cy: number; rx: number; ry: number }[]} */
const CHAR = [
  { cx: 700, cy: 700, rx: 160, ry: 70 },
  { cx: 2400, cy: 1600, rx: 140, ry: 60 },
  { cx: 1100, cy: 1650, rx: 120, ry: 50 },
  { cx: 2100, cy: 750, rx: 120, ry: 50 },
];
// `vent` zones (ZONE_KINDS); the smoke over them is atmosphere
const SMOKE = [
  { cx: 760, cy: 1560, rx: 140, ry: 60 },
  { cx: 2440, cy: 820, rx: 140, ry: 60 },
];
/** @type {{ t1: Pt[]; t2: Pt[] }} */
const SPAWNS = {
  t1: [
    [470, 1000],
    [470, 1400],
    [640, 1100],
    [640, 1300],
  ],
  t2: [
    [2730, 1000],
    [2730, 1400],
    [2560, 1100],
    [2560, 1300],
  ],
};
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [1600, 1960], col: C.torch, r: 150 },
  { p: [1600, 2300], col: C.torch, r: 150 },
  { p: [1600, 1200], col: C.torch, r: 150 },
  { p: [900, 520], col: C.torch, r: 150 },
  { p: [2300, 520], col: C.torch, r: 150 },
  { p: [900, 1870], col: C.torch, r: 150 },
  { p: [2300, 1870], col: C.torch, r: 150 },
  { p: [700, 700], col: C.fire, r: 200 },
  { p: [2400, 1600], col: C.fire, r: 200 },
  { p: [235, 1200], col: C.torch, r: 150 },
];
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    [
      "round the timber wall",
      [
        [600, 1200],
        [1000, 960],
        [1100, 1000],
        [1140, 1200],
        [1300, 1200],
        [1600, 1200],
      ],
    ],
    [
      "wall-walk",
      [
        [600, 1200],
        [900, 560],
        [970, 380],
        [1600, 320],
        [1600, 520],
        [1600, 1000],
        [1600, 1200],
      ],
    ],
  ],
  t2: [
    [
      "round the timber wall",
      [
        [2600, 1200],
        [2200, 960],
        [2100, 1000],
        [2060, 1200],
        [1900, 1200],
        [1600, 1200],
      ],
    ],
    [
      "wall-walk",
      [
        [2600, 1200],
        [2270, 560],
        [2270, 380],
        [1600, 320],
        [1600, 520],
        [1600, 1000],
        [1600, 1200],
      ],
    ],
  ],
};
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
/** @type {(p: Pt, e: number) => Pt} */
const lift = ([x, y], e) => [x, y - e];

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
    const ry = horiz ? y : st.dir === "s" ? y + h * (1 - k) : y + h * (1 - k);
    s += horiz
      ? `<rect x="${rx}" y="${ry - e}" width="${w * k}" height="${h}" fill="${i % 2 ? C.wall : C.lip}" stroke="${INK}" stroke-width="2"/>`
      : `<rect x="${rx}" y="${ry - e}" width="${w}" height="${h / 5}" fill="${i % 2 ? C.wall : C.lip}" stroke="${INK}" stroke-width="2"/>`;
  }
  return s;
};

/** Plain 2.5D world, no annotations. */
const world = () => {
  let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
  // rubble outside the wall, then the courtyard flags
  for (const [x, y, r] of [
    [60, 120, 70],
    ...Array.from(
      { length: 90 },
      (_, i) =>
        /** @type {[number, number, number]} */ ([
          ((i * 421) % 3600) - 200,
          ((i * 317 + i * i * 11) % 2800) - 200,
          40 + (i % 4) * 12,
        ]),
    ),
    [3120, 160, 60],
    [90, 2300, 80],
    [3140, 2260, 70],
    [700, 2330, 50],
    [2500, 2320, 60],
  ])
    s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="${C.rock}" opacity=".6"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#flags)" opacity=".7"/>`;
  // burn: char and smoke patches
  for (const z of CHAR)
    s += `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="${C.char}" opacity=".9"/><ellipse cx="${z.cx - 20}" cy="${z.cy - 8}" rx="${z.rx * 0.5}" ry="${z.ry * 0.4}" fill="${C.ash}" opacity=".5"/>`;
  for (const z of SMOKE)
    s += `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="#8a8e96" opacity=".35" stroke="#5d626b" stroke-width="3" stroke-dasharray="10 8"/>`;
  // the gatehouse passage: tunnel floor with the cover seam and slots, then the portcullis
  {
    const r = rect(
      TUNNEL_PATH[0][0] - TUNNEL_W / 2,
      TUNNEL_PATH[0][1],
      TUNNEL_W,
      TUNNEL_PATH[1][1] - TUNNEL_PATH[0][1],
    );
    s += `<polygon points="${pts(r)}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5"/>`;
    for (let y = TUNNEL_PATH[0][1] + 120; y < TUNNEL_PATH[1][1]; y += 120)
      s += `<rect x="${TUNNEL_PATH[0][0] - 70}" y="${y - 6}" width="140" height="12" fill="${C.seam}" opacity=".7"/>`;
    s += `<polygon points="${pts(GATE)}" fill="${C.gate}" stroke="${INK}" stroke-width="4"/>`;
    for (let x = 1520; x < 1700; x += 30)
      s += `<path d="M${x},2150 v30" stroke="${INK}" stroke-width="3"/>`;
  }
  // the sunken well court: a recess with its north face showing and the well in it
  s += `<polygon points="${pts(PIT)}" fill="${C.pit}" stroke="${INK}" stroke-width="6"/>`;
  s += `<rect x="${PIT[0][0]}" y="${PIT[0][1]}" width="600" height="${STEP}" fill="${C.pitFace}" stroke="${INK}" stroke-width="3"/>`;
  s += `<rect x="${PIT[0][0]}" y="${PIT[0][1]}" width="${STEP * 0.6}" height="400" fill="${C.faceE}" opacity=".7"/>`;
  s += `<ellipse cx="${WELL.cx}" cy="${WELL.cy}" rx="${WELL.rx}" ry="${WELL.ry}" fill="${C.water}" stroke="${INK}" stroke-width="5"/>`;
  for (const rp of RAMPS) {
    const x = rp.r[0][0],
      y = rp.r[0][1];
    for (let i = 0; i < 5; i++)
      s += `<rect x="${rp.dir === "e" ? x + i * 32 : x + 128 - i * 32}" y="${y}" width="32" height="160" fill="${i % 2 ? C.wall : C.lip}" opacity=".85" stroke="${INK}" stroke-width="2"/>`;
  }
  // breakable fallen-timber walls and the rafter overhangs
  for (const b of BARRICADES) s += slab(b, 0, 80, C.timber, C.timberFace, C.timberFace);
  for (const o of OVERHANGS) s += slab(o, 90, 12, C.timber, C.timberFace, C.timberFace);
  // wall-walks (L2), stairs up to them, then towers and gatehouse (L3)
  for (const w of WALKS) s += slab(w.r, STEP, STEP, C.wall, C.face, C.faceE);
  for (const st of STAIRS) s += steps(st);
  for (const t of TOWERS) s += slab(t.r, 2 * STEP, STEP, C.tower, C.towerFace, C.towerFace);
  // crenel marks on the walk edges (a broken parapet), and the lever
  for (let x = 460; x < 2760; x += 130)
    s += `<rect x="${x}" y="${220 - STEP - 14}" width="60" height="16" fill="${C.lip}" opacity=".5"/>`;
  s += `<circle cx="${LEVER[0]}" cy="${LEVER[1] - STEP}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  s += `<circle cx="${LEVER2[0]}" cy="${LEVER2[1] - STEP}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  // lights
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".16"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // smoke haze, low and pale, under bodies; then the day wash
  for (const [x, y, rx] of [
    [1000, 1000, 340],
    [2200, 1500, 340],
    [1600, 1650, 300],
  ])
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.3}" fill="#a8acb4" opacity=".14"/>`;
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 36) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 36px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 60px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="flags" width="200" height="200" patternUnits="userSpaceOnUse"><rect width="200" height="200" fill="none" stroke="${C.flag}" stroke-width="4"/><rect x="100" y="0" width="1" height="200" fill="${C.flag}" opacity=".6"/></pattern>
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
/** @type {(p: Pt, col: string) => string} */
const bodyAt = (p, col) =>
  `<ellipse cx="${p[0] + 10}" cy="${p[1] + 26}" rx="30" ry="12" fill="#080b10" opacity=".35"/><circle cx="${p[0]}" cy="${p[1]}" r="30" fill="${col}" stroke="#eaf4ff" stroke-width="5"/>`;
const teamCol = { t1: C.friend, t2: C.foe };

// ---- the plan --------------------------------------------------------------------
{
  let a = world();
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    ROUTES[k].forEach(([, r], i) => {
      a += `<polyline points="${pts(r.map((p) => (i ? lift(p, p[1] < 600 || p[1] > 1800 ? STEP : 0) : p)))}" fill="none" stroke="${teamCol[k]}" stroke-width="8" stroke-dasharray="${i ? "8 14" : "28 16"}" opacity=".9"/>`;
    });
    for (const p of SPAWNS[k]) a += bodyAt(p, teamCol[k]);
  }
  a += tag("T1", [400, 940], 48) + tag("T2", [2700, 940], 48);
  a +=
    tag("L2 wall-walks", [1000, 350 - STEP]) +
    tag("L3 gatehouse", [1400, 2010 - 2 * STEP]) +
    tag("L3 tower", [150, 210 - 2 * STEP], 30) +
    tag("L3 tower", [2800, 210 - 2 * STEP], 30);
  a +=
    tag("sunken well court (L0)", [1330, 1100]) +
    tag("pit ramp", [1060, 1110], 30) +
    tag("pit ramp", [1990, 1110], 30);
  a +=
    tag("gatehouse passage", [1640, 2090], 32) +
    tag("portcullis", [1720, 2180], 30) +
    tag("lever", [260, 1160 - STEP], 32) +
    tag("lever", [2800, 1160 - STEP], 32) +
    tag("barbican", [1360, 2350], 30);
  a +=
    tag("timber wall", [880, 960], 30) +
    tag("timber wall", [2210, 960], 30) +
    tag("rafters", [1040, 560 - 90], 30) +
    tag("rafters", [1800, 560 - 90], 30);
  a +=
    tag("char", [560, 800], 30) +
    tag("char", [2300, 1710], 30) +
    tag("vent (zone)", [700, 1640], 30) +
    tag("vent (zone)", [2380, 900], 30);
  a +=
    tag("sun (NW), day + smoke", [250, 100], 44) +
    `<path d="M240,130 l100,80" stroke="#fff1d6" stroke-width="9" fill="none"/>`;
  a += tag(
    "plan 3200×2400. Dashed: routes to the well court (across the court, wall-walk).",
    [20, MH - 20],
    34,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3072-ashen-courtyard-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [
      0,
      "L0 sunken well court, gatehouse passage",
      [["well court", PIT], ...RAMPS.map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r]))],
    ],
    [1, "L1 courtyard ground, barbican", [["courtyard", OUTLINE]]],
    [
      2,
      "L2 wall-walks and their stairs",
      [
        ...WALKS.map((w) => /** @type {[string, Pt[]]} */ ([w.id, w.r])),
        ...STAIRS.map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [3, "L3 towers and gatehouse", TOWERS.map((t) => /** @type {[string, Pt[]]} */ ([t.id, t.r]))],
  ];
  for (const [n, title, shapes] of L) {
    let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(OUTLINE)}" fill="#1c222c" stroke="#3d4a5e" stroke-width="6"/>`;
    for (const [id, p] of shapes) {
      a += `<polygon points="${pts(p)}" fill="${n === 0 ? C.pit : n === 1 ? C.ground : n === 2 ? C.wall : C.tower}" stroke="${INK}" stroke-width="6" opacity=".95"/>`;
      if (n !== 1) {
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length;
        const cy = p.reduce((s, q) => s + q[1], 0) / p.length;
        a += tag(id, [cx - 90, cy], 30);
      }
    }
    if (n === 0 || n === 1)
      a +=
        `<polygon points="${pts(rect(TUNNEL_PATH[0][0] - 100, TUNNEL_PATH[0][1], TUNNEL_W, 340))}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5"/>` +
        tag("gatehouse passage", [1330, 2120], 30);
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3072-ashen-courtyard-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the team) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const x = SPAWNS[k].reduce((s, p) => s + p[0], 0) / 4,
    y = SPAWNS[k].reduce((s, p) => s + p[1], 0) / 4;
  const a = world() + SPAWNS[k].map((p) => bodyAt(p, teamCol[k])).join("");
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3072-ashen-courtyard-spawn-team${k === "t1" ? 1 : 2}`,
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
console.log("L2 area", Math.round(hi(WALKS)), "L3 area", Math.round(hi(TOWERS)));
for (const k of /** @type {const} */ (["t1", "t2"]))
  for (const [n, r] of ROUTES[k])
    console.log(k, n, Math.round(len(r)), "u", (len(r) / SPEED).toFixed(1), "s");
