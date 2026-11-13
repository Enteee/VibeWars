/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3237 (part of #3187): the tutorial canyon, stations 4-14.
// One world drawing in map units; the plan is the whole of it, every site frame is a
// crop the size of the default camera (1100 tall, 16:9) with the pair standing in it.
// Usage: node scripts/assets/tutorial-canyon-study.mjs <out-dir>   (needs inkscape, magick)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const MW = 7400,
  MH = 4100,
  VH = 1100,
  VW = Math.round((VH * 16) / 9),
  FW = 800,
  FH = Math.round((FW * 9) / 16),
  BAR = 34,
  INK = "#0b0f14";
// Volcanic biome (proposed row): desaturated warm greys, orange only where it is danger.
const C = {
  rock: "#2a2220",
  rockHi: "#6a5c54",
  lip: "#85766b",
  face: "#2f2623",
  faceDeep: "#1f1917",
  floor: "#74655a",
  floorDk: "#3a2f2a",
  ash: "#6d6058",
  crust: "#2a2220",
  mire: "#3f4a33",
  deck: "#8a7d70",
  lavaDeep: "#c0391b",
  lava: "#ff8a3d",
  lavaCore: "#ffd23d",
  friend: "#59c2ff",
  foe: "#ff7b72",
  gold: "#c8a45a",
};

/** @typedef {[number, number]} Pt */
/** deterministic noise */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// The trail: waypoints west to east, then north, then west, then north, then east.
/** @type {Pt[]} */
const TRAIL = [
  [500, 3500],
  [6300, 3500],
  [6300, 2100],
  [700, 2100],
  [700, 700],
  [6900, 700],
];
const HALF = 300; // corridor half width
/** station sites: centre of each */
/** @type {Record<number, Pt>} */
const SITE = {
  4: [1700, 3500],
  5: [3100, 3500],
  6: [4700, 3500],
  7: [6300, 2800],
  8: [4700, 2100],
  9: [3100, 2100],
  10: [1500, 2100],
  11: [1900, 700],
  12: [3700, 700],
  13: [5300, 700],
  14: [6800, 700],
};
const poly = (/** @type {Pt[]} */ a) => a.map(([x, y]) => `${x},${y}`).join(" ");

// ---- ground ---------------------------------------------------------------
const defs = `<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .009" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 -.28"/></filter>
<filter id="speck" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .92  0 0 0 0 .85  0 0 0 .8 -.55"/></filter>
<filter id="b30"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="b60" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
<filter id="b8"><feGaussianBlur stdDeviation="8"/></filter>
<radialGradient id="glow"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".28"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
<radialGradient id="mist"><stop offset="0" stop-color="#cfc6c0" stop-opacity=".30"/><stop offset="1" stop-color="#cfc6c0" stop-opacity="0"/></radialGradient>
<radialGradient id="dusk"><stop offset=".5" stop-color="#7f86a8" stop-opacity="0"/><stop offset="1" stop-color="#2a2038" stop-opacity=".45"/></radialGradient>
</defs>`;

/** Rock mass, corridor lip, cliff face on the north wall, floor. */
function ground() {
  const line = (/** @type {number} */ w, /** @type {string} */ c, dy = 0, extra = "") =>
    `<polyline points="${poly(TRAIL)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="butt" transform="translate(0 ${dy})" ${extra}/>`;
  let s = `<rect width="${MW}" height="${MH}" fill="${C.rock}"/>`;
  s += `<rect width="${MW}" height="${MH}" fill="#000" filter="url(#grain)" opacity=".5"/>`;
  s += line(2 * HALF + 50, C.lip);
  s += line(2 * HALF, C.face);
  s += line(2 * HALF - 70, C.floor, 35);
  // shadow of the north wall falls south-east onto the floor
  s += line(2 * HALF - 70, C.floorDk, 35, 'opacity=".35" stroke-dasharray="0"');
  s += line(2 * HALF - 200, C.floor, 70);
  // rounded blobs at the corners
  for (const [x, y] of TRAIL.slice(1, -1))
    s += `<circle cx="${x}" cy="${y + 35}" r="${HALF - 35}" fill="${C.floor}"/>`;
  // pebbles and cracks on the whole map
  seed = 11;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * MW,
      y = rnd() * MH,
      r = 5 + rnd() * 11;
    s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r}" ry="${(r * 0.7).toFixed(1)}" fill="${rnd() > 0.5 ? C.rockHi : C.faceDeep}" opacity=".5"/>`;
  }
  s += `<rect width="${MW}" height="${MH}" fill="#000" filter="url(#speck)" opacity=".0"/>`;
  return s;
}

// ---- lava, mist, light ----------------------------------------------------
/** A lava stream beside the trail: scenery, in the rock. */
function lava(/** @type {Pt[]} */ a, w = 80) {
  const l = (/** @type {number} */ ww, /** @type {string} */ c, /** @type {string} */ ex = "") =>
    `<polyline points="${poly(a)}" fill="none" stroke="${c}" stroke-width="${ww}" stroke-linejoin="round" stroke-linecap="round" ${ex}/>`;
  return (
    l(w * 4, C.lava, 'opacity=".35" filter="url(#b60)"') +
    l(w + 40, C.faceDeep) +
    l(w, C.lavaDeep) +
    l(w * 0.6, C.lava) +
    l(w * 0.2, C.lavaCore, 'opacity=".9"')
  );
}
const LAVA = [
  // the creek runs along the south rim of row 3, north of row 2's wall, and through row 1's rock
  [
    [0, 2850],
    [1500, 2750],
    [2800, 2850],
    [4200, 2800],
    [5500, 2900],
    [5800, 2750],
  ],
  [
    [800, 1400],
    [2200, 1500],
    [3300, 1380],
    [4800, 1480],
    [6600, 1400],
  ],
  [
    [1000, 3950],
    [2600, 3900],
    [4300, 3980],
    [5900, 3900],
    [7300, 3950],
  ],
  [
    [2400, 100],
    [3800, 220],
    [5200, 120],
    [6800, 220],
  ],
];
const lavaAll = () => LAVA.map((a) => lava(/** @type {Pt[]} */ (a))).join("");
/** fall-off glow of the streams on the floor */
const glows = () =>
  [
    [1500, 2750],
    [4200, 2800],
    [2200, 1500],
    [4800, 1480],
    [2600, 3900],
    [3800, 220],
    [5200, 120],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="420" fill="url(#glow)"/>`)
    .join("");

/** Mist: soft, pale, low. Never over a body, ring or bar: drawn before them. */
function mist() {
  seed = 3;
  let s = "";
  for (const [x, y] of TRAIL.slice(0, -1).flatMap((p, i) => {
    const q = TRAIL[i + 1];
    /** @type {Pt[]} */
    const o = [];
    const n = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 380);
    for (let k = 0; k < n; k++)
      o.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
    return o;
  }))
    s += `<ellipse cx="${(x + (rnd() - 0.5) * 200).toFixed(0)}" cy="${(y + 90 + (rnd() - 0.5) * 120).toFixed(0)}" rx="${(260 + rnd() * 120).toFixed(0)}" ry="${(70 + rnd() * 50).toFixed(0)}" fill="url(#mist)"/>`;
  return s;
}

// ---- things on the ground -------------------------------------------------
const ring = (/** @type {number} */ x, /** @type {number} */ y, r = 110, c = C.lava, dash = "") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="7" ${dash}/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="none" stroke="${c}" stroke-width="5" opacity=".7"/>`;
/** a body: the disc as drawn today (team colour, dark edge, self rim). */
function body(
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {string} */ col,
  self = false,
  r = 14,
) {
  return (
    `<ellipse cx="${x + 6}" cy="${y + 8}" rx="${r}" ry="${r * 0.7}" fill="#000" opacity=".4"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${INK}" stroke-width="3"/>` +
    (self
      ? `<circle cx="${x}" cy="${y}" r="${r - 2}" fill="none" stroke="#d7dee8" stroke-width="2"/>`
      : "")
  );
}
const bar = (/** @type {number} */ x, /** @type {number} */ y, f = 1, c = "#7fd36f") =>
  `<rect x="${x - 22}" y="${y - 34}" width="44" height="7" fill="${INK}"/><rect x="${x - 21}" y="${y - 33}" width="${42 * f}" height="5" fill="${c}"/>`;
/** player (self) and tutor (ally) */
const pair = (/** @type {number} */ x, /** @type {number} */ y, tutorHp = 1) =>
  body(x, y, C.friend, true) +
  body(x + 46, y + 20, C.friend) +
  bar(x, y) +
  bar(x + 46, y + 20, tutorHp);
const rat = (/** @type {number} */ x, /** @type {number} */ y) =>
  body(x, y, C.foe, false, 10) + bar(x, y - 6, 1, "#e05a50");
/** the goal mark (#3221): a gold ring a body wide, a short column of light. */
const goal = (/** @type {number} */ x, /** @type {number} */ y) =>
  `<ellipse cx="${x}" cy="${y}" rx="60" ry="60" fill="${C.gold}" fill-opacity=".18"/><circle cx="${x}" cy="${y}" r="26" fill="none" stroke="${C.gold}" stroke-width="6"/><circle cx="${x}" cy="${y}" r="26" fill="none" stroke="#0b0f14" stroke-width="2" opacity=".5"/><rect x="${x - 7}" y="${y - 130}" width="14" height="130" fill="#f6e3a8" opacity=".35" filter="url(#b8)"/>`;
/** a raised block with a south face, a lit top and a hard SE shadow */
function block(
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ w,
  /** @type {number} */ h,
  /** @type {number} */ face,
  top = C.deck,
  side = C.face,
) {
  return (
    `<rect x="${x + 40}" y="${y + face + 30}" width="${w}" height="${h}" fill="#000" opacity=".4"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h + face}" fill="${side}" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${top}" stroke="${C.lip}" stroke-width="4"/>`
  );
}
const boulder = (/** @type {number} */ x, /** @type {number} */ y, r = 40) =>
  `<ellipse cx="${x + 18}" cy="${y + 22}" rx="${r}" ry="${r * 0.6}" fill="#000" opacity=".45"/><circle cx="${x}" cy="${y}" r="${r}" fill="${C.rockHi}" stroke="${INK}" stroke-width="4"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.5}" fill="${C.lip}" opacity=".6"/>`;
const path = (/** @type {Pt[]} */ a, c = "#f2f5fa") =>
  `<polyline points="${poly(a)}" fill="none" stroke="${c}" stroke-width="7" stroke-dasharray="6 24" stroke-linecap="round" opacity=".85"/>`;
const arrow = (
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ dx,
  /** @type {number} */ dy,
) =>
  `<g stroke="#f2f5fa" stroke-width="8" fill="none" opacity=".8"><line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}"/></g>`;

// ---- site overlays ----------------------------------------------------------
/** @type {Record<number, {slug: string; title: string; reuse: string; reads: string; draw: () => string}>} */
const SITES = {
  4: {
    slug: "boulders",
    title: "4 Boulder run",
    reuse: "rockfall zone, three landings",
    reads: "red rings = where boulders land; the gold mark is past the last one",
    draw: () =>
      [
        [1360, 3430],
        [1700, 3580],
        [2040, 3440],
      ]
        .map(([x, y]) => ring(x, y, 120))
        .join("") +
      [
        [1360, 3190],
        [1700, 3220],
        [2040, 3200],
      ]
        .map(([x, y]) => boulder(x, y, 46))
        .join("") +
      goal(2400, 3500) +
      pair(1130, 3500),
  },
  5: {
    slug: "wall",
    title: "5 Cracked wall",
    reuse: "breakable wall (#3031)",
    reads: "a cracked wall shuts the whole width; the target frame says hit it",
    draw: () => {
      const x = 3070;
      let s = `<rect x="${x + 22}" y="${3200 + 30}" width="80" height="600" fill="#000" opacity=".35"/>`;
      s += `<rect x="${x}" y="3200" width="80" height="640" fill="#6d6058" stroke="${INK}" stroke-width="4"/>`;
      s += `<rect x="${x}" y="3200" width="80" height="60" fill="${C.lip}"/>`;
      s += `<polyline points="${x + 10},3300 ${x + 60},3420 ${x + 20},3500 ${x + 70},3620 ${x + 30},3720" fill="none" stroke="${INK}" stroke-width="6"/>`;
      s += `<rect x="${x - 40}" y="3380" width="160" height="240" fill="none" stroke="#ffd23d" stroke-width="6" stroke-dasharray="26 14"/>`;
      return s + pair(2550, 3500);
    },
  },
  6: {
    slug: "clearing",
    title: "6 Small clearing",
    reuse: "open ground, one rockfall",
    reads: "the tutor stands hurt (bar low) under one red ring: heal, then walk on",
    draw: () =>
      `<ellipse cx="4700" cy="3540" rx="560" ry="330" fill="${C.floor}"/><ellipse cx="4700" cy="3540" rx="520" ry="300" fill="${C.ash}" opacity=".25"/>` +
      ring(4770, 3540, 120) +
      boulder(4770, 3290, 44) +
      pair(4380, 3560, 0.35) +
      goal(5200, 3500),
  },
  7: {
    slug: "bad-ground",
    title: "7 Bad ground",
    reuse: "mire + molten strip",
    reads: "mud mid-trail slows; a lava strip on the west edge hurts; the east edge is clear",
    draw: () => {
      let s = `<ellipse cx="6300" cy="2800" rx="470" ry="520" fill="${C.floor}"/>`;
      s += `<ellipse cx="6290" cy="2800" rx="300" ry="170" fill="${C.mire}" stroke="#2a331f" stroke-width="6"/><ellipse cx="6270" cy="2780" rx="200" ry="90" fill="#4c5a3d" opacity=".6"/>`;
      s += `<polygon points="${poly([
        [5890, 2600],
        [6030, 2580],
        [6070, 2860],
        [5990, 3040],
        [5880, 3010],
      ])}" fill="${C.lavaDeep}" stroke="${C.lava}" stroke-width="8"/><polygon points="${poly([
        [5920, 2640],
        [6000, 2630],
        [6030, 2850],
        [5960, 2980],
      ])}" fill="${C.lava}"/>`;
      s += `<circle cx="5980" cy="2800" r="260" fill="url(#glow)"/>`;
      return (
        s +
        path([
          [6300, 3150],
          [6520, 2950],
          [6540, 2700],
          [6340, 2480],
        ]) +
        pair(6280, 3180) +
        goal(6300, 2300)
      );
    },
  },
  8: {
    slug: "rat-pocket",
    title: "8 Rat pocket",
    reuse: "open ground",
    reads: "a roomy bay, three red rats (foe colour is only for fighters)",
    draw: () =>
      `<ellipse cx="4560" cy="2110" rx="560" ry="330" fill="${C.floor}"/>` +
      rat(4280, 2060) +
      rat(4350, 2190) +
      rat(4200, 2170) +
      pair(5150, 2100),
  },
  9: {
    slug: "ledge",
    title: "9 Ledge (L1)",
    reuse: "static height structure (#3067)",
    reads: "solid ring on the ledge top, dashed ring on the ground under it: Alt+click reaches it",
    draw: () =>
      block(2800, 1690, 620, 180, 90) +
      // ledge steps up to the north wall
      `<rect x="2800" y="1690" width="620" height="180" fill="#9a8c7e" opacity=".25"/>` +
      body(3100, 1770, C.friend, true) + // player on the ledge
      `<circle cx="3100" cy="1770" r="34" fill="none" stroke="#f2f5fa" stroke-width="6"/>` +
      `<circle cx="3100" cy="2010" r="34" fill="none" stroke="#f2f5fa" stroke-width="6" stroke-dasharray="10 8"/>` +
      body(2860, 2130, C.friend) +
      bar(2860, 2130) +
      path([
        [3100, 1790],
        [3100, 2000],
      ]) +
      goal(3500, 2100),
  },
  10: {
    slug: "ramp",
    title: "10 Ramp to the deck (L2)",
    reuse: "ramp / terrace",
    reads: "light steps climb to a deck with a gold mark; the trail runs on below",
    draw: () => {
      let s = block(1250, 1480, 560, 140, 100);
      // ramp: five treads, lighter as they rise
      for (let i = 0; i < 5; i++)
        s += `<rect x="${1880 + i * 0}" y="${1700 - i * 56}" width="150" height="56" fill="${["#6d6058", "#7a6d63", "#887b70", "#968a7e", "#a3978a"][i]}" stroke="${INK}" stroke-width="2"/>`;
      s += `<polygon points="${poly([
        [1810, 1480],
        [1880, 1480],
        [1880, 1700],
        [1810, 1620],
      ])}" fill="${C.face}"/>`;
      return (
        s +
        goal(1530, 1550) +
        path([
          [1500, 2150],
          [1930, 1980],
          [1960, 1700],
          [1900, 1520],
          [1700, 1550],
        ]) +
        pair(1280, 2160)
      );
    },
  },
  11: {
    slug: "tunnel",
    title: "11 Tunnel under rock",
    reuse: "tunnel layer (#3070 cave)",
    reads: "a dark mouth in rock; a dotted path goes in; a guard sleeps on top (zz)",
    draw: () => {
      let s = `<rect x="1580" y="370" width="720" height="660" fill="${C.rock}" stroke="${C.lip}" stroke-width="5"/>`;
      s += `<rect x="1580" y="370" width="720" height="660" fill="#000" filter="url(#grain)" opacity=".4"/>`;
      s += `<rect x="1560" y="960" width="760" height="110" fill="${C.faceDeep}"/>`;
      s += `<path d="M1560,1030 L1560,520 Q1560,420 1660,420 L2200,420 Q2300,420 2300,520 L2300,1030 Z" fill="none"/>`;
      // mouth (west, dark) and the east end
      s += `<rect x="1540" y="460" width="70" height="500" rx="26" fill="#120d0c" stroke="${C.lip}" stroke-width="5"/>`;
      s += `<rect x="2270" y="460" width="70" height="500" rx="26" fill="#120d0c" stroke="${C.lip}" stroke-width="5"/>`;
      s += path([
        [1300, 700],
        [1560, 710],
        [1900, 740],
        [2300, 700],
        [2480, 700],
      ]);
      s += `<circle cx="1960" cy="560" r="14" fill="#8e8a86" stroke="${INK}" stroke-width="3"/><text x="1996" y="540" font-size="30" fill="#f2f5fa" font-family="DejaVu Sans">z z</text>`;
      s += `<ellipse cx="1900" cy="720" rx="300" ry="60" fill="#000" opacity=".25"/>`;
      return (
        s + pair(1260, 720) + `<circle cx="1540" cy="710" r="170" fill="url(#glow)" opacity=".7"/>`
      );
    },
  },
  12: {
    slug: "open-patch",
    title: "12 Open patch",
    reuse: "open ground",
    reads: "wide open floor, two rats ahead; call one",
    draw: () =>
      `<ellipse cx="3700" cy="740" rx="560" ry="320" fill="${C.floor}"/>` +
      rat(4130, 650) +
      rat(4210, 800) +
      pair(3230, 720),
  },
  13: {
    slug: "junction",
    title: "13 Y-junction",
    reuse: "map data",
    reads: "the lit trail runs on east; the south-east arm ends at a tiny parasol and a deck chair",
    draw: () => {
      /** @type {Pt[]} */
      const arm = [
        [5400, 760],
        [5640, 1000],
        [5900, 1400],
      ];
      let s = `<polyline points="${poly(arm)}" fill="none" stroke="${C.lip}" stroke-width="470" stroke-linejoin="round"/>`;
      s += `<polyline points="${poly(arm)}" fill="none" stroke="${C.face}" stroke-width="420" stroke-linejoin="round"/>`;
      s += `<polyline points="${poly(arm)}" fill="none" stroke="${C.floor}" stroke-width="340" stroke-linejoin="round"/>`;
      s += `<ellipse cx="5900" cy="1400" rx="260" ry="150" fill="${C.floor}"/>`;
      // the joke: parasol + deck chair on the dead end
      s += `<path d="M5830,1330 q80,-110 160,0 z" fill="#d9d3c4" stroke="${INK}" stroke-width="4"/><line x1="5910" y1="1330" x2="5910" y2="1430" stroke="${INK}" stroke-width="5"/>`;
      s += `<rect x="5880" y="1410" width="90" height="46" fill="#9a7a62" stroke="${INK}" stroke-width="4"/>`;
      s += `<text x="5960" y="1350" font-size="30" font-family="DejaVu Sans" fill="#f2f5fa">?</text>`;
      s += goal(6050, 700) + arrow(5500, 700, 120, 0);
      return (
        s +
        path([
          [4800, 720],
          [5300, 710],
          [5900, 700],
        ]) +
        pair(4880, 720)
      );
    },
  },
  14: {
    slug: "mouth",
    title: "14 Canyon mouth",
    reuse: "edge / exit; mist gate",
    reads: "the walls part; a bright mist gate; beyond it dark rows of foes (the fight)",
    draw: () => {
      let s = `<ellipse cx="7000" cy="740" rx="360" ry="440" fill="url(#mist)" opacity="1.6"/>`;
      s += `<ellipse cx="7080" cy="700" rx="150" ry="330" fill="#e9e2dc" opacity=".55" filter="url(#b30)"/>`;
      s += `<ellipse cx="7080" cy="700" rx="90" ry="260" fill="#fff" opacity=".6" filter="url(#b30)"/>`;
      for (let i = 0; i < 6; i++) s += body(7230, 440 + i * 90, "#6a4543", false, 12);
      return s + goal(6850, 700) + pair(6480, 720);
    },
  },
};

// ---- assembly ---------------------------------------------------------------
/** @type {(a: string) => string} */
const world = (overlay) =>
  ground() +
  lavaAll() +
  glows() +
  mist() +
  // arrival pad
  `<circle cx="500" cy="3530" r="150" fill="#2a2038" stroke="#a77bff" stroke-width="8" opacity=".9"/><circle cx="500" cy="3530" r="95" fill="none" stroke="#a77bff" stroke-width="6" stroke-dasharray="14 10"/>` +
  overlay;

/** @type {(name: string, svg: string) => void} */
function render(name, svg) {
  const p = join(out, `${name}.svg`);
  const png = join(out, `${name}.png`);
  writeFileSync(p, svg);
  execFileSync("inkscape", [p, "-o", png], { stdio: "ignore" });
  rmSync(p);
  execFileSync("magick", [png, "-colors", "96", `PNG8:${png}`]);
}

const style = `<style>.t{font:bold 14px 'DejaVu Sans',sans-serif;fill:#fff}.s{font:11px 'DejaVu Sans',sans-serif;fill:#c5cfdc}.n{font:12px 'DejaVu Sans',sans-serif;fill:#f2f5fa;paint-order:stroke;stroke:#0b0f14;stroke-width:3px}</style>`;

for (const [n, site] of Object.entries(SITES)) {
  const [sx, sy] = SITE[Number(n)];
  const vx = sx - VW / 2,
    vy = sy - VH / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH + BAR * 2}" viewBox="0 0 ${FW} ${FH + BAR * 2}">${style}
<rect width="${FW}" height="${FH + BAR * 2}" fill="#10141a"/>
<text x="10" y="22" class="t">Tutorial canyon: station ${site.title} (default camera, ${VW}×${VH} units)</text>
<svg x="0" y="${BAR}" width="${FW}" height="${FH}" viewBox="${vx} ${vy} ${VW} ${VH}" overflow="hidden">${defs}${world(site.draw())}<rect x="${vx}" y="${vy}" width="${VW}" height="${VH}" fill="url(#dusk)"/></svg>
<text x="10" y="${FH + BAR + 20}" class="s">reuses: ${site.reuse}</text><text x="10" y="${FH + BAR + 34}" class="s">reads: ${site.reads}</text></svg>`;
  render(`3187-canyon-${n}-${site.slug}`, svg);
}

// plan
{
  const k = FW / MW;
  const PH = Math.round(MH * k);
  let ov = "";
  for (const [n, [x, y]] of Object.entries(SITE)) {
    ov += `<rect x="${x - VW / 2}" y="${y - VH / 2}" width="${VW}" height="${VH}" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="40 30" opacity=".5"/>`;
    ov += `<circle cx="${x}" cy="${y}" r="110" fill="#10141a" stroke="#fff" stroke-width="10"/><text x="${x}" y="${y + 50}" font-size="150" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" fill="#fff">${n}</text>`;
  }
  ov += `<text x="500" y="3800" font-size="110" text-anchor="middle" font-family="DejaVu Sans" fill="#d9c8ff">arrival pad</text>`;
  ov += `<text x="6700" y="520" font-size="110" text-anchor="middle" font-family="DejaVu Sans" fill="#fff">exit →</text>`;
  ov += path(TRAIL, "#f2f5fa")
    .replace('stroke-width="7"', 'stroke-width="24"')
    .replace("6 24", "20 70");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${PH + 52}" viewBox="0 0 ${FW} ${PH + 52}">${style}
<rect width="${FW}" height="${PH + 52}" fill="#10141a"/>
<text x="10" y="20" class="t">Tutorial canyon: plan, ${MW}×${MH} units (1 px = ${Math.round(1 / k)} units), one trail, stations 4–14</text>
<svg x="0" y="28" width="${FW}" height="${PH}" viewBox="0 0 ${MW} ${MH}">${defs}${world(ov)}<rect width="${MW}" height="${MH}" fill="url(#dusk)"/></svg>
<text x="10" y="${PH + 44}" class="s">dashed boxes: the default camera standing at each site · white dots: the trail · violet: arrival pad · orange: lava (scenery)</text></svg>`;
  render("3187-tutorial-canyon-plan", svg);
}
