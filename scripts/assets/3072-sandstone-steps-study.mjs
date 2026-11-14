/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3276 (part of #3072): Sandstone Steps, a terraced desert town on a hill, 1v1.
// One world drawing in map units (2600x1940). The plan is all of it with the routes;
// a layer sheet shows one layer's footprints; a spawn frame is a crop the size of the
// default camera (1100 tall, 16:9) with the spawn's body standing in it.
// Usage: node scripts/assets/3072-sandstone-steps-study.mjs <out-dir>   (needs inkscape)
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
// Desert biome (visual-style §1): ground #3b3226, rock #6e6252, stone decks #c2b296.
const C = {
  out: "#3a3226",
  ground: "#3b3226",
  groundHi: "#4a3f30",
  earth: "#6e5a40",
  deck: "#c2b296",
  deckL2: "#d3c5a8",
  face: "#7b6d57",
  faceE: "#5c5040",
  lip: "#ece0c4",
  roof: "#a98a63",
  roofFace: "#6d5638",
  tunnel: "#17120e",
  seam: "#8a7a62",
  mire: "#3f4a33",
  scorch: "#2a231d",
  water: "#3f9fe8",
  wall: "#a8744d",
  wallFace: "#6b4630",
  awning: "#b9a07a",
  awningFace: "#5d4a30",
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

// ---- the place ---------------------------------------------------------------
/** @type {Pt[]} */
const OUTLINE = [
  [180, 420],
  [520, 200],
  [1000, 110],
  [1500, 90],
  [2000, 170],
  [2380, 380],
  [2470, 800],
  [2420, 1250],
  [2330, 1650],
  [2000, 1850],
  [1500, 1900],
  [900, 1860],
  [450, 1800],
  [200, 1500],
  [120, 1000],
];
// L1 mid terrace and plaza
/** @type {Pt[]} */
const L1 = [
  [420, 780],
  [900, 700],
  [1300, 740],
  [1700, 700],
  [2180, 780],
  [2250, 1050],
  [2150, 1260],
  [1750, 1250],
  [1550, 1300],
  [1050, 1300],
  [850, 1250],
  [450, 1230],
  [360, 1000],
];
// L2: west rooftops, east granary terrace (different outlines, areas within 25 %)
/** @type {Pt[]} */
const L2W = [
  [380, 330],
  [700, 280],
  [1000, 330],
  [1050, 620],
  [760, 680],
  [420, 640],
];
/** @type {Pt[]} */
const L2E = [
  [1650, 300],
  [2000, 260],
  [2250, 380],
  [2230, 640],
  [1900, 680],
  [1680, 620],
];
const BRIDGE = rect(1050, 440, 600, 90); // L2 plank bridge over the north, west roof to east terrace
const TUNNEL_W = 110;
// U-shaped under-pass on L0: west mouth, under the plaza, east mouth; a shaft ramp in the middle
/** @type {Pt[]} */
const TUNNEL_PATH = [
  [800, 1255],
  [800, 1020],
  [1800, 1020],
  [1800, 1255],
];
/** @type {Pt} */
const SHAFT = [1300, 900];
/** @type {Pt} */
const GATE = [1300, 1020];
/** @type {Pt} */
const LEVER = [1190, 830];
const STAIRS = [
  { id: "stair-w", r: rect(560, 1230, 140, 100), from: 0 },
  { id: "stair-e", r: rect(1900, 1230, 140, 100), from: 0 },
  { id: "grand-steps", r: rect(1180, 1290, 240, 110), from: 0 },
  { id: "roof-stair-w", r: rect(820, 640, 120, 80), from: 1 },
  { id: "roof-stair-e", r: rect(1700, 640, 120, 80), from: 1 },
];
/** @type {{ at: Pt; e: number }[]} */
const DROPS = [
  { at: [400, 700], e: 2 },
  { at: [2200, 690], e: 2 },
  { at: [500, 1245], e: 1 },
  { at: [2100, 1245], e: 1 },
];
const AWNINGS = [rect(960, 1340, 200, 70), rect(1600, 1420, 260, 70)];
const BREAKABLE = rect(1488, 1640, 24, 180);
const MIRE = { cx: 1000, cy: 1700, rx: 90, ry: 55 };
const SCORCH = { cx: 1600, cy: 1700, rx: 120, ry: 60 };
/** @type {{ t1: Pt; t2: Pt }} */
const SPAWNS = { t1: [520, 1560], t2: [2080, 1560] };
/** @type {{ p: Pt; col: string; r: number }[]} */
const LIGHTS = [
  { p: [800, 1255], col: C.torch, r: 150 },
  { p: [1800, 1255], col: C.torch, r: 150 },
  { p: [1300, 940], col: C.torch, r: 150 },
  { p: [630, 1220], col: C.torch, r: 150 },
  { p: [1970, 1220], col: C.torch, r: 150 },
  { p: [1960, 1480], col: C.fire, r: 200 },
];
// routes: the walk is the polyline length at base speed
/** @type {Record<"t1" | "t2", [string, Pt[]][]>} */
const ROUTES = {
  t1: [
    [
      "stair",
      [
        [520, 1560],
        [630, 1330],
        [640, 1200],
        [900, 1010],
        [1300, 900],
      ],
    ],
    [
      "under-pass",
      [
        [520, 1560],
        [800, 1420],
        [800, 1255],
        [800, 1020],
        [1300, 1020],
        [1300, 900],
      ],
    ],
    [
      "grand steps",
      [
        [520, 1560],
        [1000, 1480],
        [1300, 1400],
        [1300, 1250],
        [1300, 900],
      ],
    ],
  ],
  t2: [
    [
      "stair",
      [
        [2080, 1560],
        [1970, 1330],
        [1960, 1200],
        [1700, 1010],
        [1300, 900],
      ],
    ],
    [
      "under-pass",
      [
        [2080, 1560],
        [1800, 1420],
        [1800, 1255],
        [1800, 1020],
        [1300, 1020],
        [1300, 900],
      ],
    ],
    [
      "grand steps",
      [
        [2080, 1560],
        [1600, 1480],
        [1300, 1400],
        [1300, 1250],
        [1300, 900],
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

/** Plain 2.5D world, no annotations. */
const world = () => {
  let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
  // outside: `rock` (OUTSIDE_KINDS), boulders and scree round the town
  for (let i = 0; i < 110; i++)
    s += `<ellipse cx="${((i * 421) % 3000) - 200}" cy="${((i * 317 + i * i * 11) % 2300) - 200}" rx="${44 + (i % 4) * 12}" ry="${28 + (i % 4) * 8}" fill="#5a4e3c" stroke="${INK}" stroke-width="3" opacity=".9"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(OUTLINE)}" fill="url(#sand)" opacity=".5"/>`;
  // L0 zones
  s += `<ellipse cx="${MIRE.cx}" cy="${MIRE.cy}" rx="${MIRE.rx}" ry="${MIRE.ry}" fill="${C.mire}" stroke="#2d3825" stroke-width="5"/><ellipse cx="${MIRE.cx - 14}" cy="${MIRE.cy - 8}" rx="40" ry="15" fill="#56653f" opacity=".7"/>`;
  s += `<ellipse cx="${SCORCH.cx}" cy="${SCORCH.cy}" rx="${SCORCH.rx}" ry="${SCORCH.ry}" fill="${C.scorch}" opacity=".85"/>`;
  // tunnel floor and cover seam on the ground, grating slots every 120
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
    s += `<polygon points="${pts(r)}" fill="${C.tunnel}" stroke="${C.seam}" stroke-width="5" opacity=".95"/>`;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k * 120 < d; k++) {
      const x = a[0] + ((b[0] - a[0]) * k * 120) / d,
        y = a[1] + ((b[1] - a[1]) * k * 120) / d;
      s += vert
        ? `<rect x="${x - 36}" y="${y - 6}" width="72" height="12" fill="${C.seam}" opacity=".7"/>`
        : `<rect x="${x - 6}" y="${y - 36}" width="12" height="72" fill="${C.seam}" opacity=".7"/>`;
    }
  }
  // breakable mud-brick wall across the south alley
  s += slab(BREAKABLE, 0, 60, C.wall, C.wallFace, C.wallFace);
  // L1 terrace and plaza, then the stairs up to it and to the roofs
  s += slab(L1, STEP, STEP, C.deck, C.face, C.faceE);
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
  // the well: a stone ring, the shaft dark, water at its foot
  s += `<ellipse cx="${SHAFT[0]}" cy="${SHAFT[1] - STEP}" rx="86" ry="52" fill="${C.face}" stroke="${INK}" stroke-width="5"/><ellipse cx="${SHAFT[0]}" cy="${SHAFT[1] - STEP + 6}" rx="62" ry="36" fill="${C.tunnel}"/><ellipse cx="${SHAFT[0]}" cy="${SHAFT[1] - STEP + 14}" rx="44" ry="20" fill="${C.water}" opacity=".6"/>`;
  // awnings over the lanes (overhangs)
  for (const a of AWNINGS) s += slab(a, 80, 12, C.awning, C.awningFace, C.awningFace);
  // L2 rooftops, granary terrace and bridge
  s += slab(L2W, 2 * STEP, STEP, C.roof, C.roofFace, C.roofFace);
  s += slab(L2E, 2 * STEP, STEP, C.deckL2, C.face, C.faceE);
  s += slab(BRIDGE, 2 * STEP, 14, "#a07a48", C.roofFace, C.roofFace);
  for (let x = 1066; x < 1650; x += 28)
    s += `<path d="M${x},${440 - 2 * STEP} v90" stroke="#5a4126" stroke-width="3"/>`;
  // lever
  const lv = lift(LEVER, STEP);
  s += `<circle cx="${lv[0]}" cy="${lv[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
  // lights
  for (const l of LIGHTS)
    s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col}" opacity=".16"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col}" stroke="${INK}" stroke-width="3"/>`;
  // the sun: a day wash from the north-west
  s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
  return s;
};

/** @type {(label: string, p: Pt, size?: number) => string} */
const tag = (label, p, size = 34) =>
  `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

const defs = `<defs>
<style>.n{font:bold 34px 'DejaVu Sans',sans-serif;fill:#fff3e0;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 54px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="sand" width="400" height="400" patternUnits="userSpaceOnUse"><circle cx="80" cy="90" r="46" fill="${C.earth}" opacity=".5"/><circle cx="290" cy="240" r="62" fill="${C.earth}" opacity=".4"/><circle cx="170" cy="340" r="30" fill="#6a6448" opacity=".6"/></pattern>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1d6" stop-opacity=".32"/><stop offset=".5" stop-color="#fff1d6" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".3"/></linearGradient>
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
      a += `<polyline points="${pts(r)}" fill="none" stroke="${routeCol[k]}" stroke-width="7" stroke-dasharray="${i === 1 ? "8 14" : "26 16"}" opacity=".85"/>`;
    });
    a += bodyAt(SPAWNS[k], routeCol[k], 0);
  }
  a += `<polyline points="${pts(TUNNEL_PATH.map(([x, y]) => [x, y - (y < 1250 ? STEP : 0)]))}" fill="none" stroke="${C.seam}" stroke-width="10" stroke-dasharray="2 14" stroke-linecap="round"/>`;
  a +=
    tag("T1", [SPAWNS.t1[0] - 20, SPAWNS.t1[1] - 50], 44) +
    tag("T2", [SPAWNS.t2[0] - 20, SPAWNS.t2[1] - 50], 44);
  a +=
    tag("L1 plaza + terrace", [1380, 800 - STEP]) +
    tag("L2 rooftops", [470, 450 - 2 * STEP]) +
    tag("L2 granary terrace", [1750, 460 - 2 * STEP]);
  a +=
    tag("plank bridge (L2)", [1090, 420 - 2 * STEP]) + tag("well shaft ↔ under-pass", [1020, 990]);
  a +=
    tag("lever", [LEVER[0] - 130, LEVER[1] - STEP + 6]) + tag("gate", [GATE[0] - 30, GATE[1] + 50]);
  a += tag("grand steps", [1160, 1440]) + tag("awning", [960, 1330]) + tag("awning", [1620, 1410]);
  a +=
    tag("mud-brick wall", [1220, 1620]) +
    tag("mire", [MIRE.cx - 40, MIRE.cy + 90]) +
    tag("forge ash", [SCORCH.cx - 60, SCORCH.cy + 100]);
  for (const d of DROPS) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 70], 30);
  a +=
    tag("sun (NW), day", [150, 120], 40) +
    `<path d="M140,160 l90,70 m-20,-4 l20,4 l-6,-20" stroke="#fff1d6" stroke-width="8" fill="none"/>`;
  a += tag(
    "plan 2600×1940. Dashed: routes from each spawn (stair, under-pass, grand steps).",
    [20, MH - 20],
    32,
  );
  render(svgOf(0, 0, MW, MH, 800, a), "3072-sandstone-steps-plan", 800);
}

// ---- layer sheets ---------------------------------------------------------------------
{
  /** @type {[number, string, [string, Pt[]][]][]} */
  const L = [
    [0, "L0 street: the ground, lanes, under-pass and shaft", [["ground", OUTLINE]]],
    [
      1,
      "L1 terrace and plaza",
      [
        ["terrace", L1],
        ...STAIRS.slice(0, 3).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
    [
      2,
      "L2 rooftops, granary, plank bridge",
      [
        ["rooftops", L2W],
        ["granary", L2E],
        ["bridge", BRIDGE],
        ...STAIRS.slice(3).map((s) => /** @type {[string, Pt[]]} */ ([s.id, s.r])),
      ],
    ],
  ];
  for (const [n, title, shapes] of L) {
    let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(OUTLINE)}" fill="#26201a" stroke="#4a3f30" stroke-width="6"/>`;
    for (const [id, p] of shapes) {
      a += `<polygon points="${pts(p)}" fill="${n === 0 ? C.ground : n === 1 ? C.deck : C.deckL2}" stroke="${INK}" stroke-width="6" opacity=".92"/>`;
      if (n) {
        const cx = p.reduce((s, q) => s + q[0], 0) / p.length;
        const cy = p.reduce((s, q) => s + q[1], 0) / p.length;
        a += tag(id, [cx - 90, cy], 30);
      }
    }
    if (n === 0) {
      for (let i = 1; i < TUNNEL_PATH.length; i++) {
        const p = /** @type {Pt} */ (TUNNEL_PATH[i - 1]),
          q = /** @type {Pt} */ (TUNNEL_PATH[i]);
        a += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${C.tunnel}" stroke-width="${TUNNEL_W}" stroke-linecap="square"/>`;
      }
      a += tag("under-pass (tunnel, L0 beneath the plaza)", [880, 1000]);
      a +=
        `<circle cx="${SHAFT[0]}" cy="${SHAFT[1]}" r="60" fill="${C.water}" opacity=".7" stroke="${INK}" stroke-width="5"/>` +
        tag("well shaft", [SHAFT[0] + 70, SHAFT[1]], 30);
    }
    a += `<text x="40" y="${MH - 40}" class="t">${title}</text>`;
    render(svgOf(0, 0, MW, MH, 800, a), `3072-sandstone-steps-layer-${n}`, 800);
  }
}

// ---- spawn frames (default camera: 1956x1100 centred on the spawn) --------------------------------
for (const k of /** @type {const} */ (["t1", "t2"])) {
  const [x, y] = SPAWNS[k];
  const a = world() + bodyAt(SPAWNS[k], k === "t1" ? C.friend : C.foe, 0);
  render(
    svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
    `3072-sandstone-steps-spawn-team${k === "t1" ? 1 : 2}`,
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
