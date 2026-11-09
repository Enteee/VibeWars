// #2960 mockups: five textured 2.5D art directions for one multi-layer arena.
// Study, not decided. Usage: node scripts/assets/arena-2-5d-textured.mjs <outDir>
// Writes <outDir>/2960-option-{a..e}.png, 2960-crop-{a..e}.png,
// 2960-all-options.png and 2960-deuteranopia.png.
// One scene (world units, layer 0 ground / layer 1 deck) is drawn by five
// styles; only projection, materials, lighting and decoration differ.
// Materials are SVG filters (turbulence + diffuse lighting), so surfaces carry
// grain and relief; masonry, planks and cracks are drawn as geometry on top.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "docs/art";
mkdirSync(outDir, { recursive: true });
const tmp = join(process.env.TMPDIR ?? "/tmp", "arena-2960");
mkdirSync(tmp, { recursive: true });

/** @typedef {[number, number]} Pt */
const W = 960;
const H = 560;
const DECK = 2.4; // layer 1 height, world units (ELEVATION_STEP is 28 map units)
const f = (/** @type {number} */ n) => String(Math.round(n * 10) / 10);

// ---- the scene (same numbers as #2811) ----
const BRIDGE = { x0: 6.5, y0: 3.5, x1: 13.5, y1: 8.5 };
const RAMP = { x0: 3.5, y0: 5, x1: 6.5, y1: 7 };
const PILLARS = [
  [6.9, 3.9],
  [13.1, 3.9],
  [6.9, 8.1],
  [13.1, 8.1],
];
/** @type {[number, number, number, number, number][]} [x0, y0, x1, y1, height] */
const WALLS = [
  [15, 2, 18, 2.8, 1.6],
  [15, 2, 15.8, 5, 1.6],
  [2, 8.6, 3.2, 11, 1.6],
  [9, 0.3, 11.2, 1.1, 1.1],
];
/** [team, x, y, layer]; layer 0.5 is on the ramp */
const CHARS = [
  ["b", 8.4, 5.1, 1],
  ["r", 10.5, 7.2, 1],
  ["b", 12.3, 7.4, 1],
  ["b", 10.5, 7.2, 0],
  ["r", 9, 8.2, 0],
  ["b", 5, 6, 0.5],
  ["r", 12, 4.4, 0],
  ["b", 3, 2.6, 0],
  ["r", 16.4, 6.4, 0],
  ["r", 14.5, 9.8, 0],
  ["b", 12.5, 10.2, 0],
];
const rampZ = (/** @type {number} */ x) => ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * DECK;
const charZ = (/** @type {(string|number)[]} */ c) =>
  c[3] === 0.5 ? rampZ(/** @type {number} */ (c[1])) : /** @type {number} */ (c[3]) * DECK;

const mix = (/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) => {
  const p = (/** @type {string} */ h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};
const shade = (/** @type {string} */ c, /** @type {number} */ t) => mix(c, "#000000", t);
const lift = (/** @type {string} */ c, /** @type {number} */ t) => mix(c, "#ffffff", t);

// ---- materials: SVG filters. freq = grain size, relief = light/dark swing ----
/**
 * @param {string} id
 * @param {{freq:number, oct:number, relief:number, seed:number, mottle:number, lx:number, ly:number}} m
 */
const material = (id, m) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${f(m.freq)}" numOctaves="${f(m.oct)}" seed="${f(m.seed)}" result="n"/>
<feDiffuseLighting in="n" surfaceScale="${f(m.relief)}" diffuseConstant="1.15" lighting-color="#fff" result="lit"><feDistantLight azimuth="${f(m.lx)}" elevation="${f(m.ly)}"/></feDiffuseLighting>
<feComposite in="lit" in2="SourceGraphic" operator="in" result="litc"/>
<feBlend in="SourceGraphic" in2="litc" mode="multiply" result="bumped"/>
<feTurbulence type="fractalNoise" baseFrequency="${String(m.freq / 7)}" numOctaves="2" seed="${f(m.seed + 9)}" result="mot"/>
<feColorMatrix in="mot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${f(m.mottle)} ${String(-m.mottle * 0.35)}" result="moa"/>
<feComposite in="moa" in2="SourceGraphic" operator="in" result="moc"/>
<feMerge><feMergeNode in="bumped"/><feMergeNode in="moc"/></feMerge>
</filter>`;

/**
 * @typedef {{name:string,note:string,iso:boolean,sx:number,sy:number,hz:number,bg:[string,string],
 *  floor:string,deck:string,wall:string,ramp:string,pillar:string,edge:string,label:string,
 *  friend:string,foe:string,mat:Record<string,{freq:number,oct:number,relief:number,seed:number,mottle:number,lx:number,ly:number}>,
 *  floorTex:string,deckTex:string,wallTex:string,rampTex:string,pillarTex:string,
 *  floorPat:"flags"|"earth"|"cobble"|"tiles"|"rubble",deckPat:"planks"|"slabs"|"inlay",
 *  light:number,shadowA:number,mood:"day"|"dusk"|"night"|"fair"|"ruin"}} Style
 */
/** @type {Record<string, Style>} */
const STYLES = {
  a: {
    name: "A · Sunlit arena",
    note: "Classic fantasy arena, daylight",
    iso: false,
    sx: 40,
    sy: 30,
    hz: 24,
    bg: ["#2d2a24", "#1c1a16"],
    floor: "#a9966f",
    deck: "#8a6a43",
    wall: "#a8a090",
    ramp: "#9b7f55",
    pillar: "#b3aa98",
    edge: "#2a2216",
    label: "#f0e6d0",
    friend: "#59c2ff",
    foe: "#ff7b72",
    mat: {
      stone: { freq: 0.05, oct: 3, relief: 2.2, seed: 3, mottle: 0.25, lx: 235, ly: 55 },
      wood: { freq: 0.02, oct: 3, relief: 1.6, seed: 5, mottle: 0.2, lx: 235, ly: 60 },
    },
    floorTex: "stone",
    deckTex: "wood",
    wallTex: "stone",
    rampTex: "wood",
    pillarTex: "stone",
    floorPat: "flags",
    deckPat: "planks",
    light: 0,
    shadowA: 0.38,
    mood: "day",
  },
  b: {
    name: "B · Diorama",
    note: "Stylised cut-away diorama",
    iso: true,
    sx: 24,
    sy: 12,
    hz: 22,
    bg: ["#cfe6ee", "#9cc3d2"],
    floor: "#8fbf6a",
    deck: "#d9a35b",
    wall: "#c9c2b4",
    ramp: "#e0b36d",
    pillar: "#d8d0bf",
    edge: "#33432b",
    label: "#26333d",
    friend: "#2f9de8",
    foe: "#f0584e",
    mat: {
      turf: { freq: 0.09, oct: 2, relief: 1.2, seed: 11, mottle: 0.22, lx: 225, ly: 60 },
      wood: { freq: 0.03, oct: 2, relief: 1.2, seed: 7, mottle: 0.12, lx: 225, ly: 60 },
      stone: { freq: 0.06, oct: 2, relief: 1.4, seed: 13, mottle: 0.15, lx: 225, ly: 60 },
    },
    floorTex: "turf",
    deckTex: "wood",
    wallTex: "stone",
    rampTex: "wood",
    pillarTex: "stone",
    floorPat: "earth",
    deckPat: "planks",
    light: 0.1,
    shadowA: 0.24,
    mood: "fair",
  },
  c: {
    name: "C · Torchlit night",
    note: "Dark atmospheric battlefield",
    iso: false,
    sx: 40,
    sy: 30,
    hz: 36,
    bg: ["#0b0e16", "#06080d"],
    floor: "#4b5262",
    deck: "#5c4630",
    wall: "#4a4f5c",
    ramp: "#6a5238",
    pillar: "#565c6c",
    edge: "#05070b",
    label: "#cfd9ea",
    friend: "#59c2ff",
    foe: "#ff7b72",
    mat: {
      stone: { freq: 0.06, oct: 4, relief: 3, seed: 21, mottle: 0.35, lx: 270, ly: 40 },
      wood: { freq: 0.025, oct: 3, relief: 2, seed: 23, mottle: 0.3, lx: 270, ly: 40 },
    },
    floorTex: "stone",
    deckTex: "wood",
    wallTex: "stone",
    rampTex: "wood",
    pillarTex: "stone",
    floorPat: "cobble",
    deckPat: "planks",
    light: -0.2,
    shadowA: 0.55,
    mood: "night",
  },
  d: {
    name: "D · Ornate keep",
    note: "Ornate fortifications, carved marble and iron",
    iso: true,
    sx: 24,
    sy: 12,
    hz: 22,
    bg: ["#1d2230", "#10131c"],
    floor: "#7c8190",
    deck: "#b9b3a4",
    wall: "#9a9faf",
    ramp: "#c4bdae",
    pillar: "#d0cabb",
    edge: "#12151f",
    label: "#e1e6f2",
    friend: "#59c2ff",
    foe: "#ff7b72",
    mat: {
      marble: { freq: 0.035, oct: 4, relief: 1.4, seed: 31, mottle: 0.3, lx: 225, ly: 55 },
      stone: { freq: 0.06, oct: 3, relief: 2, seed: 33, mottle: 0.2, lx: 225, ly: 55 },
    },
    floorTex: "stone",
    deckTex: "marble",
    wallTex: "stone",
    rampTex: "marble",
    pillarTex: "marble",
    floorPat: "tiles",
    deckPat: "inlay",
    light: 0,
    shadowA: 0.4,
    mood: "dusk",
  },
  e: {
    name: "E · Overgrown ruin",
    note: "Weathered ruin reclaimed by nature",
    iso: false,
    sx: 40,
    sy: 30,
    hz: 24,
    bg: ["#243024", "#141c15"],
    floor: "#6d6a4a",
    deck: "#7d7a68",
    wall: "#8a8672",
    ramp: "#6b5a3a",
    pillar: "#8f8b78",
    edge: "#10160f",
    label: "#e0e8d4",
    friend: "#59c2ff",
    foe: "#ff7b72",
    mat: {
      stone: { freq: 0.07, oct: 4, relief: 3.2, seed: 41, mottle: 0.4, lx: 240, ly: 50 },
      earth: { freq: 0.08, oct: 4, relief: 2.4, seed: 43, mottle: 0.35, lx: 240, ly: 50 },
    },
    floorTex: "earth",
    deckTex: "stone",
    wallTex: "stone",
    rampTex: "earth",
    pillarTex: "stone",
    floorPat: "rubble",
    deckPat: "slabs",
    light: -0.05,
    shadowA: 0.4,
    mood: "ruin",
  },
};

// small deterministic random so reruns are byte-identical
const rng = (/** @type {number} */ seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** @param {string} id @param {{labelled?:boolean}} [opt] */
function scene(id, opt = {}) {
  const S = STYLES[id];
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const defs = Object.entries(S.mat).map(([k, m]) => material(`m-${id}-${k}`, m));
  const P = (/** @type {number} */ x, /** @type {number} */ y, z = 0) =>
    /** @type {Pt} */ ([S.iso ? (x + y) * S.sx : x * S.sx, (S.iso ? y - x : y) * S.sy - z * S.hz]);
  const cs = [P(0, 0), P(20, 0), P(0, 12), P(20, 12), P(0, 0, 3.4)];
  const minX = Math.min(...cs.map((p) => p[0]));
  const maxX = Math.max(...cs.map((p) => p[0]));
  const minY = Math.min(...cs.map((p) => p[1]));
  const maxY = Math.max(...cs.map((p) => p[1]));
  const ox = (W - (maxX - minX)) / 2 - minX;
  const oy = (H - (maxY - minY)) / 2 - minY + (S.iso ? 4 : 10);
  const Q = (/** @type {number} */ x, /** @type {number} */ y, z = 0) => {
    const [X, Y] = P(x, y, z);
    return /** @type {Pt} */ ([X + ox, Y + oy]);
  };
  const pts = (/** @type {Pt[]} */ a) => a.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
  const line = (/** @type {Pt[]} */ a, /** @type {string} */ c, w = 1, op = 0.5) =>
    out.push(
      `<polyline points="${pts(a)}" fill="none" stroke="${c}" stroke-width="${f(w)}" opacity="${f(op)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  const poly = (
    /** @type {Pt[]} */ a,
    /** @type {string} */ fill,
    /** @type {string|null} */ tex,
    sw = 1.2,
  ) =>
    out.push(
      `<polygon points="${pts(a)}" fill="${fill}" ${tex ? `filter="url(#m-${id}-${tex})"` : ""} stroke="${S.edge}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`,
    );
  // lighting: the sun comes from the left; right and front faces are darker
  const frontC = (/** @type {string} */ c) => shade(c, 0.3 - S.light);
  const sideC = (/** @type {string} */ c) => shade(c, 0.5 - S.light);
  const topC = (/** @type {string} */ c) => lift(c, 0.04 + S.light * 0.3);

  /** A solid with thickness: top, front (y=y1) and, in iso, left face (x=x0). */
  const box = (
    /** @type {number} */ x0,
    /** @type {number} */ y0,
    /** @type {number} */ x1,
    /** @type {number} */ y1,
    /** @type {number} */ z0,
    /** @type {number} */ z1,
    /** @type {string} */ c,
    /** @type {string} */ tex,
  ) => {
    poly([Q(x0, y1, z0), Q(x1, y1, z0), Q(x1, y1, z1), Q(x0, y1, z1)], frontC(c), tex);
    if (S.iso) poly([Q(x0, y0, z0), Q(x0, y1, z0), Q(x0, y1, z1), Q(x0, y0, z1)], sideC(c), tex);
    poly([Q(x0, y0, z1), Q(x1, y0, z1), Q(x1, y1, z1), Q(x0, y1, z1)], topC(c), tex);
    // top-edge highlight: reads as a chamfer, separates the layers
    line([Q(x0, y1, z1), Q(x1, y1, z1)], lift(c, 0.55), 1.6, 0.8);
  };
  /** masonry courses and staggered joints on a front face (y = y1) */
  const masonry = (
    /** @type {number} */ x0,
    /** @type {number} */ y1,
    /** @type {number} */ x1,
    /** @type {number} */ z0,
    /** @type {number} */ z1,
    /** @type {number} */ rows,
    /** @type {string} */ c,
    seed = 1,
  ) => {
    const r = rng(seed);
    const dx = ((z1 - z0) / rows) * 1.5;
    for (let k = 0; k < rows; k++) {
      const za = z0 + ((z1 - z0) * k) / rows;
      const zb = z0 + ((z1 - z0) * (k + 1)) / rows;
      if (k > 0) line([Q(x0, y1, za), Q(x1, y1, za)], c, 1, 0.7);
      for (
        let x = x0 + (k % 2 ? dx / 2 : dx) + (r() - 0.5) * 0.15;
        x < x1 - 0.1;
        x += dx * (0.8 + r() * 0.4)
      )
        line([Q(x, y1, za), Q(x, y1, zb)], c, 1, 0.7);
    }
  };
  const shadowE = (
    /** @type {number} */ X,
    /** @type {number} */ Y,
    /** @type {number} */ rx,
    /** @type {number} */ ry,
    a = S.shadowA,
  ) =>
    out.push(
      `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(rx)}" ry="${f(ry)}" fill="#000" opacity="${f(a)}"/>`,
    );

  // ---- background ----
  defs.push(
    `<linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.bg[0]}"/><stop offset="1" stop-color="${S.bg[1]}"/></linearGradient>`,
  );
  out.push(`<rect width="${f(W)}" height="${f(H)}" fill="url(#bg-${id})"/>`);

  // ---- ground slab (with a visible earth rim in the diorama) ----
  const floorQuad = [Q(0, 0), Q(20, 0), Q(20, 12), Q(0, 12)];
  if (id === "b") {
    // the world is a cut-away block: soil layers under the turf
    const rim = (/** @type {number} */ z0, /** @type {number} */ z1, /** @type {string} */ c) => {
      poly([Q(0, 12, z0), Q(20, 12, z0), Q(20, 12, z1), Q(0, 12, z1)], c, "stone");
      poly([Q(20, 0, z0), Q(20, 12, z0), Q(20, 12, z1), Q(20, 0, z1)], shade(c, 0.25), "stone");
    };
    rim(-1.4, -0.5, "#7a5636");
    rim(-0.5, 0, "#5a8a3c");
  }
  poly(floorQuad, S.floor, S.floorTex, 1.6);

  // ground detail
  const r = rng(id.charCodeAt(0));
  const tileRow = (
    /** @type {number} */ y,
    /** @type {number} */ x0,
    /** @type {number} */ x1,
    /** @type {string} */ c,
    op = 0.5,
  ) => line([Q(x0, y), Q(x1, y)], c, 1, op);
  if (S.floorPat === "flags" || S.floorPat === "tiles" || S.floorPat === "cobble") {
    const dc = shade(S.floor, 0.5);
    const step = S.floorPat === "tiles" ? 2 : S.floorPat === "cobble" ? 0.8 : 1.5;
    for (let y = step; y < 12; y += step) tileRow(y, 0, 20, dc, 0.55);
    let k = 0;
    for (let y = 0; y < 12; y += step, k++)
      for (
        let x = (k % 2) * step * 0.9;
        x < 20;
        x += step * (1.5 + (S.floorPat === "flags" ? r() : 0))
      )
        line([Q(x, y), Q(x, Math.min(12, y + step))], dc, 1, 0.5);
    if (S.floorPat === "tiles") {
      // marble inlay: a diamond and a ring in the middle of the floor
      const c = lift(S.floor, 0.35);
      line([Q(10, 0.6), Q(17, 6), Q(10, 11.4), Q(3, 6), Q(10, 0.6)], c, 2.2, 0.55);
      line([Q(10, 2.2), Q(15, 6), Q(10, 9.8), Q(5, 6), Q(10, 2.2)], c, 1.2, 0.5);
    }
    // worn patches and chips
    for (let i = 0; i < 26; i++) {
      const [X, Y] = Q(r() * 20, r() * 12);
      out.push(
        `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(4 + r() * 8)}" ry="${f(1.5 + r() * 3)}" fill="${r() > 0.5 ? "#000" : "#fff"}" opacity="${f(0.05 + r() * 0.06)}"/>`,
      );
    }
  } else if (S.floorPat !== "flags" && S.floorPat !== "tiles" && S.floorPat !== "cobble") {
    for (let i = 0; i < (S.floorPat === "rubble" ? 70 : 90); i++) {
      const [X, Y] = Q(r() * 19.5, r() * 11.5);
      if (S.floorPat === "earth") {
        // grass tufts
        out.push(
          `<path d="M${f(X - 3)},${f(Y)} l1.5,-6 l1.5,5 l1.5,-7 l1.5,6 l1.5,-5 l1,7" fill="none" stroke="${r() > 0.5 ? "#4f8a36" : "#a8d880"}" stroke-width="1.3" opacity=".7" stroke-linecap="round"/>`,
        );
      } else if (i % 3) {
        // fallen rubble: small lit stones
        out.push(
          `<polygon points="${f(X - 6)},${f(Y)} ${f(X - 3)},${f(Y - 5)} ${f(X + 4)},${f(Y - 4)} ${f(X + 7)},${f(Y)}" fill="${shade(S.wall, 0.15 + r() * 0.2)}" stroke="${S.edge}" stroke-width=".8" opacity=".85"/>`,
        );
      } else {
        // moss and grass patch
        out.push(
          `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(10 + r() * 14)}" ry="${f(3 + r() * 5)}" fill="${r() > 0.4 ? "#5e8f3a" : "#3f6a2c"}" opacity=".55"/>`,
        );
      }
    }
    if (S.floorPat === "rubble") {
      // a broken paved road crossing the court
      for (let x = 0; x < 20; x += 1.4) {
        const w = 0.55 + r() * 0.3;
        const [X, Y] = Q(x, 6 + (r() - 0.5) * 0.4);
        out.push(
          `<polygon points="${f(X - 14)},${f(Y)} ${f(X - 8)},${f(Y - 8)} ${f(X + 9)},${f(Y - 8)} ${f(X + 15)},${f(Y)} ${f(X + 8)},${f(Y + 7 * w)} ${f(X - 9)},${f(Y + 7 * w)}" fill="${shade(S.deck, 0.1 + r() * 0.2)}" stroke="${S.edge}" stroke-width=".8" opacity=".75"/>`,
        );
      }
    }
  }
  if (S.mood === "night") {
    // torch pools: warm light on the ground around the braziers
    for (const [bx, by] of [
      [2, 1.2],
      [18.2, 10.6],
      [10, 11.2],
    ]) {
      const [X, Y] = Q(bx, by);
      defs.push(
        `<radialGradient id="tp-${f(bx)}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb04a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>`,
      );
      out.push(`<ellipse cx="${f(X)}" cy="${f(Y)}" rx="190" ry="110" fill="url(#tp-${f(bx)})"/>`);
    }
  }

  // ---- drop shadow of the deck on the ground (open space underneath reads dark) ----
  {
    const sh = [
      Q(BRIDGE.x0, BRIDGE.y0),
      Q(BRIDGE.x1, BRIDGE.y0),
      Q(BRIDGE.x1, BRIDGE.y1),
      Q(BRIDGE.x0, BRIDGE.y1),
    ];
    out.push(`<polygon points="${pts(sh)}" fill="#000" opacity="${f(S.shadowA + 0.2)}"/>`);
  }

  // ---- ramp: a real wedge with a sloped top, a side face and cleats showing the climb ----
  const rampTop = [
    Q(RAMP.x0, RAMP.y0, 0),
    Q(RAMP.x1, RAMP.y0, DECK),
    Q(RAMP.x1, RAMP.y1, DECK),
    Q(RAMP.x0, RAMP.y1, 0),
  ];
  // side face (y = y1): a triangle whose hypotenuse is the slope
  poly(
    [Q(RAMP.x0, RAMP.y1, 0), Q(RAMP.x1, RAMP.y1, 0), Q(RAMP.x1, RAMP.y1, DECK)],
    frontC(S.ramp),
    S.rampTex,
  );
  poly(rampTop, lift(S.ramp, 0.12 + S.light * 0.3), S.rampTex);
  // cleats / steps across the slope, brighter on their upper lip: the direction of climb
  for (let i = 1; i < 8; i++) {
    const x = RAMP.x0 + ((RAMP.x1 - RAMP.x0) * i) / 8;
    const z = rampZ(x);
    line([Q(x, RAMP.y0, z), Q(x, RAMP.y1, z)], shade(S.ramp, 0.55), 2.2, 0.8);
    line([Q(x + 0.05, RAMP.y0, z), Q(x + 0.05, RAMP.y1, z)], lift(S.ramp, 0.5), 1.2, 0.8);
  }
  // rails along both sides (posts + a rope or rail) make the edge of the slope obvious
  for (const y of [RAMP.y0, RAMP.y1]) {
    line([Q(RAMP.x0, y, 0.55), Q(RAMP.x1, y, DECK + 0.55)], lift(S.pillar, 0.2), 2.4, 0.95);
    for (const x of [RAMP.x0 + 0.15, (RAMP.x0 + RAMP.x1) / 2, RAMP.x1 - 0.15])
      line([Q(x, y, rampZ(x)), Q(x, y, rampZ(x) + 0.55)], shade(S.pillar, 0.3), 2.6, 0.95);
  }
  // arrow chevrons painted on the slope, pointing uphill
  for (const x of [4.3, 5.2]) {
    const z = rampZ(x);
    line([Q(x, 5.55, z), Q(x + 0.45, 6, rampZ(x + 0.45)), Q(x, 6.45, z)], "#f4ecd2", 2.4, 0.85);
  }

  // ---- walls: height, a lit top, masonry; ruin walls are broken ----
  /** @type {Array<{d:number, run:() => void}>} */
  const queue = [];
  const depth = (/** @type {number} */ x, /** @type {number} */ y) => (S.iso ? x * 0.0 + y - x : y);
  for (const [i, w] of WALLS.entries()) {
    queue.push({
      d: depth(w[2], w[3]),
      run: () => {
        box(w[0], w[1], w[2], w[3], 0, w[4], S.wall, S.wallTex);
        masonry(w[0], w[3], w[2], 0, w[4], 3, shade(S.wall, 0.55), 10 + i);
        if (S.mood === "ruin") {
          // a broken top and moss
          const [X, Y] = Q((w[0] + w[2]) / 2, w[3], w[4]);
          out.push(
            `<polygon points="${f(X - 22)},${f(Y)} ${f(X - 9)},${f(Y - 10)} ${f(X + 2)},${f(Y - 3)} ${f(X + 14)},${f(Y - 9)} ${f(X + 24)},${f(Y)}" fill="${shade(S.wall, 0.1)}" stroke="${S.edge}" stroke-width="1"/>`,
          );
          out.push(
            `<ellipse cx="${f(X)}" cy="${f(Y - 1)}" rx="20" ry="4" fill="#5e8f3a" opacity=".7"/>`,
          );
        }
        if (id === "d") {
          // crenellations on the wall top
          for (let x = w[0] + 0.15; x < w[2] - 0.3; x += 0.7)
            box(x, w[3] - 0.25, x + 0.35, w[3], w[4], w[4] + 0.35, S.wall, S.wallTex);
        }
      },
    });
  }
  // braziers (night), banners (ornate), tree stumps / pillars of rubble (ruin)
  /** @type {Array<[number, number]>} */
  const props =
    id === "c"
      ? [
          [2, 1.2],
          [18.2, 10.6],
          [10, 11.2],
        ]
      : id === "d"
        ? [
            [2, 1.2],
            [18.2, 10.6],
          ]
        : id === "e"
          ? [
              [1.5, 3],
              [18.5, 9.5],
              [17.5, 0.8],
            ]
          : id === "b"
            ? [
                [1.5, 1.2],
                [18.5, 10.6],
              ]
            : [
                [1.5, 1.2],
                [18.5, 10.6],
              ];
  for (const [px, py] of props)
    queue.push({
      d: depth(px, py),
      run: () => {
        const [X, Y] = Q(px, py);
        shadowE(X, Y + 2, 16, 6);
        if (id === "c" || id === "a") {
          // iron brazier on a stone foot
          out.push(
            `<polygon points="${f(X - 9)},${f(Y)} ${f(X + 9)},${f(Y)} ${f(X + 6)},${f(Y - 22)} ${f(X - 6)},${f(Y - 22)}" fill="${shade(S.pillar, 0.35)}" stroke="${S.edge}" stroke-width="1.2"/>`,
          );
          out.push(
            `<ellipse cx="${f(X)}" cy="${f(Y - 24)}" rx="13" ry="5" fill="#2b2622" stroke="${S.edge}" stroke-width="1.2"/>`,
          );
          out.push(
            `<path d="M${f(X - 8)},${f(Y - 25)} Q${f(X - 4)},${f(Y - 44)} ${f(X)},${f(Y - 50)} Q${f(X + 6)},${f(Y - 38)} ${f(X + 8)},${f(Y - 25)} Z" fill="#ff9a2e"/>`,
          );
          out.push(
            `<path d="M${f(X - 4)},${f(Y - 25)} Q${f(X)},${f(Y - 38)} ${f(X + 4)},${f(Y - 25)} Z" fill="#ffe08a"/>`,
          );
        } else if (id === "d") {
          // marble column with a banner
          box(px - 0.35, py - 0.35, px + 0.35, py + 0.35, 0, 3, S.pillar, S.pillarTex);
          out.push(
            `<polygon points="${f(X - 8)},${f(Y - 62)} ${f(X + 8)},${f(Y - 62)} ${f(X + 8)},${f(Y - 36)} ${f(X)},${f(Y - 44)} ${f(X - 8)},${f(Y - 36)}" fill="#7d2b3a" stroke="${S.edge}" stroke-width="1"/>`,
          );
          out.push(`<circle cx="${f(X)}" cy="${f(Y - 54)}" r="3" fill="#e8c860"/>`);
        } else if (id === "e") {
          // a broken column with an old tree growing through it
          box(px - 0.4, py - 0.4, px + 0.4, py + 0.4, 0, 1.4, S.pillar, S.pillarTex);
          out.push(
            `<path d="M${f(X)},${f(Y - 34)} q-4,-30 -14,-48 M${f(X)},${f(Y - 34)} q8,-24 20,-40" stroke="#4a3622" stroke-width="5" fill="none" stroke-linecap="round"/>`,
          );
          for (const [dx, dy, rr] of /** @type {[number, number, number][]} */ ([
            [-14, -86, 16],
            [20, -78, 18],
            [2, -92, 14],
          ]))
            out.push(
              `<circle cx="${f(X + dx)}" cy="${f(Y + dy)}" r="${f(rr)}" fill="#4f8a36" opacity=".92"/>`,
            );
        } else {
          // diorama: a round tree
          out.push(
            `<rect x="${f(X - 3)}" y="${f(Y - 24)}" width="6" height="24" fill="#7a5636" stroke="${S.edge}" stroke-width="1"/>`,
          );
          out.push(
            `<circle cx="${f(X)}" cy="${f(Y - 34)}" r="17" fill="#5aa04a" stroke="${S.edge}" stroke-width="1.4"/>`,
          );
          out.push(`<circle cx="${f(X - 5)}" cy="${f(Y - 39)}" r="8" fill="#7cc263"/>`);
        }
      },
    });

  // pillars: solid, with base and capital; the space under the deck stays open
  /** @param {number} px @param {number} py */
  const drawPillar = (px, py) => {
    const w = id === "d" ? 0.34 : 0.3;
    box(px - w - 0.12, py - w - 0.12, px + w + 0.12, py + w + 0.12, 0, 0.3, S.pillar, S.pillarTex); // plinth
    box(px - w, py - w, px + w, py + w, 0.3, DECK - 0.25, S.pillar, S.pillarTex);
    box(
      px - w - 0.12,
      py - w - 0.12,
      px + w + 0.12,
      py + w + 0.12,
      DECK - 0.25,
      DECK - 0.02,
      S.pillar,
      S.pillarTex,
    ); // capital
    if (id === "e") {
      const [X, Y] = Q(px, py, 1);
      out.push(
        `<path d="M${f(X - 8)},${f(Y + 14)} q6,-14 2,-26 M${f(X + 6)},${f(Y + 20)} q-8,-14 -3,-30" stroke="#4f8a36" stroke-width="3" fill="none"/>`,
      );
    }
  };
  // arches between pillars (ornate / classic): shows structure under the deck
  const drawArch = () => {
    const [xa, xb, y] = [BRIDGE.x0 + 0.5, BRIDGE.x1 - 0.5, BRIDGE.y1 - 0.1];
    const n = 2;
    for (let i = 0; i < n; i++) {
      const a = xa + ((xb - xa) * i) / n + 0.35;
      const b = xa + ((xb - xa) * (i + 1)) / n - 0.35;
      const [X0, Y0] = Q(a, y, 0);
      const [X1] = Q(b, y, 0);
      const [, Yt] = Q(a, y, DECK - 0.3);
      // dark opening with a lit keystone ring
      out.push(
        `<path d="M${f(X0)},${f(Y0)} L${f(X0)},${f(Yt + 14)} Q${f((X0 + X1) / 2)},${f(Yt - 14)} ${f(X1)},${f(Yt + 14)} L${f(X1)},${f(Y0)} Z" fill="#000" opacity="${id === "a" ? ".45" : ".55"}" stroke="${lift(S.pillar, 0.2)}" stroke-width="2.4"/>`,
      );
    }
  };

  // ---- deck ----
  const deckBase = () => {
    const { x0, y0, x1, y1 } = BRIDGE;
    // underside shadow band so the thickness and the open space below read at once
    poly(
      [
        Q(x0, y1, DECK - 0.05),
        Q(x1, y1, DECK - 0.05),
        Q(x1, y1, DECK - 0.5),
        Q(x0, y1, DECK - 0.5),
      ],
      shade(S.deck, 0.5),
      S.deckTex,
    );
    box(x0, y0, x1, y1, DECK - 0.5, DECK, S.deck, S.deckTex);
    // beams under the front lip
    for (let x = x0 + 0.4; x < x1; x += 1.4)
      line([Q(x, y1, DECK - 0.5), Q(x, y1, DECK)], shade(S.deck, 0.65), 2.2, 0.8);
    if (S.deckPat === "planks") {
      // planks run along x: seams plus nail heads
      for (let y = y0 + 0.5; y < y1 - 0.1; y += 0.5)
        line([Q(x0, y, DECK), Q(x1, y, DECK)], shade(S.deck, 0.6), 1.1, 0.7);
      const rr = rng(77);
      for (let y = y0; y < y1 - 0.4; y += 0.5)
        for (let x = x0 + rr() * 2; x < x1 - 0.2; x += 1.8 + rr() * 2)
          line([Q(x, y, DECK), Q(x, y + 0.5, DECK)], shade(S.deck, 0.6), 1, 0.6);
    } else if (S.deckPat === "slabs") {
      for (let y = y0 + 1.4; y < y1; y += 1.4)
        line([Q(x0, y, DECK), Q(x1, y, DECK)], shade(S.deck, 0.6), 1.2, 0.8);
      const rr = rng(78);
      for (let k = 0; k < 4; k++)
        for (let x = x0 + rr() * 1.5; x < x1; x += 1.2 + rr() * 1.4)
          line(
            [Q(x, y0 + k * 1.25, DECK), Q(x, y0 + (k + 1) * 1.25, DECK)],
            shade(S.deck, 0.6),
            1.2,
            0.8,
          );
      // cracks and moss on the surface
      for (let k = 0; k < 7; k++) {
        const cx = x0 + rr() * (x1 - x0);
        const cy = y0 + rr() * (y1 - y0);
        line(
          [Q(cx, cy, DECK), Q(cx + 0.5, cy + 0.25, DECK), Q(cx + 0.8, cy + 0.1, DECK)],
          "#1a1c14",
          1.4,
          0.7,
        );
      }
    } else {
      // marble: slab joints and a gold-trimmed inlay
      for (let x = x0 + 1.75; x < x1; x += 1.75)
        line([Q(x, y0, DECK), Q(x, y1, DECK)], shade(S.deck, 0.4), 1.1, 0.7);
      line(
        [
          Q(x0 + 0.3, y0 + 0.3, DECK),
          Q(x1 - 0.3, y0 + 0.3, DECK),
          Q(x1 - 0.3, y1 - 0.3, DECK),
          Q(x0 + 0.3, y1 - 0.3, DECK),
          Q(x0 + 0.3, y0 + 0.3, DECK),
        ],
        "#c9a23a",
        2,
        0.85,
      );
    }
    // railing along the front lip and back edge; posts every unit
    const rail = (/** @type {number} */ y, /** @type {number} */ h) => {
      line([Q(x0, y, DECK + h), Q(x1, y, DECK + h)], lift(S.pillar, 0.15), 3, 0.95);
      for (let x = x0 + 0.2; x <= x1 + 0.01; x += 1.15)
        line([Q(x, y, DECK), Q(x, y, DECK + h)], shade(S.pillar, 0.25), 3.2, 0.95);
    };
    rail(y0 + 0.05, 0.6);
    // a gap in the front rail where the ramp meets the deck is the only way up
    line([Q(x0, y1 - 0.05, DECK + 0.6), Q(x0 + 0.01, y1 - 0.05, DECK + 0.6)], "none", 0);
    // edge line: a bright lip so a character walking off is clearly leaving the deck
    line([Q(x0, y1, DECK), Q(x1, y1, DECK)], "#fff4cf", 2, 0.5);
  };

  // ---- characters ----
  const teamCol = (/** @type {string} */ t) => (t === "b" ? S.friend : S.foe);
  /**
   * A chunky armoured fighter. Silhouette first: team ring (friend) or triangle
   * (foe) above the head, a team-coloured tabard and base disc.
   * @param {(string|number)[]} c @param {boolean} under
   */
  const drawChar = (c, under) => {
    const t = /** @type {string} */ (c[0]);
    const [X, Y] = Q(/** @type {number} */ (c[1]), /** @type {number} */ (c[2]), charZ(c));
    const u = S.hz * 1.4;
    const col = teamCol(t);
    const skin = id === "b" ? "#f2c9a0" : "#d9ab80";
    const armor =
      id === "c" ? "#59606f" : id === "e" ? "#6f6a58" : id === "d" ? "#aeb5c4" : "#8a8f9c";
    const o = S.edge;
    if (under) {
      // x-ray: the fighter below the deck gets a light halo and a bright base ring
      out.push(
        `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(u * 0.5)}" ry="${f(u * 0.2)}" fill="#fff6d0" opacity=".28"/>`,
      );
      out.push(
        `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(u * 0.5)}" ry="${f(u * 0.2)}" fill="none" stroke="#fff6d0" stroke-width="1.8" stroke-dasharray="4 3"/>`,
      );
    }
    shadowE(X, Y + 1, u * 0.36, u * 0.13, 0.4);
    out.push(
      `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(u * 0.34)}" ry="${f(u * 0.12)}" fill="${shade(col, 0.2)}" stroke="${o}" stroke-width="1.2"/>`,
    );
    const halo = under ? ' stroke-width="3.4"' : "";
    // legs, torso (team tabard over armour), arms, head, helmet
    out.push(
      `<rect x="${f(X - u * 0.15)}" y="${f(Y - u * 0.3)}" width="${f(u * 0.12)}" height="${f(u * 0.3)}" rx="2" fill="${shade(armor, 0.35)}" stroke="${o}" stroke-width="1"/>`,
    );
    out.push(
      `<rect x="${f(X + u * 0.03)}" y="${f(Y - u * 0.3)}" width="${f(u * 0.12)}" height="${f(u * 0.3)}" rx="2" fill="${shade(armor, 0.35)}" stroke="${o}" stroke-width="1"/>`,
    );
    out.push(
      `<rect x="${f(X - u * 0.24)}" y="${f(Y - u * 0.68)}" width="${f(u * 0.48)}" height="${f(u * 0.42)}" rx="${f(u * 0.12)}" fill="${armor}" stroke="${o}" stroke-width="1.2"${halo}/>`,
    );
    out.push(
      `<rect x="${f(X - u * 0.11)}" y="${f(Y - u * 0.66)}" width="${f(u * 0.22)}" height="${f(u * 0.4)}" rx="2" fill="${col}"/>`,
    );
    out.push(
      `<circle cx="${f(X - u * 0.28)}" cy="${f(Y - u * 0.5)}" r="${f(u * 0.09)}" fill="${skin}" stroke="${o}" stroke-width="1"/>`,
    );
    out.push(
      `<circle cx="${f(X)}" cy="${f(Y - u * 0.8)}" r="${f(u * 0.17)}" fill="${skin}" stroke="${o}" stroke-width="1.2"/>`,
    );
    out.push(
      `<path d="M${f(X - u * 0.18)},${f(Y - u * 0.82)} Q${f(X)},${f(Y - u * 1.05)} ${f(X + u * 0.18)},${f(Y - u * 0.82)} Z" fill="${shade(armor, 0.15)}" stroke="${o}" stroke-width="1"/>`,
    );
    // weapon
    out.push(
      `<line x1="${f(X + u * 0.3)}" y1="${f(Y - u * 0.1)}" x2="${f(X + u * 0.4)}" y2="${f(Y - u * 0.95)}" stroke="#e8e2d0" stroke-width="2.4" stroke-linecap="round"/>`,
    );
    // team glyph: ring = friend, triangle = foe (shape first)
    const gy = Y - u * 1.2;
    const gr = u * 0.1;
    if (t === "b")
      out.push(
        `<circle cx="${f(X)}" cy="${f(gy)}" r="${f(gr)}" fill="none" stroke="#fff" stroke-width="${f(gr * 0.5)}"/>`,
      );
    else
      out.push(
        `<polygon points="${f(X)},${f(gy - gr * 1.1)} ${f(X + gr * 1.1)},${f(gy + gr * 0.8)} ${f(X - gr * 1.1)},${f(gy + gr * 0.8)}" fill="#fff"/>`,
      );
  };

  // ---- paint order ----
  // 1 back pillars and walls/props by depth, 2 deck, 3 front pillars, 4 characters
  const backPillars = PILLARS.filter((p) => p[1] < 6);
  const frontPillars = PILLARS.filter((p) => p[1] >= 6);
  for (const p of backPillars)
    queue.push({
      d: depth(p[0], p[1]),
      run: () => {
        drawPillar(p[0], p[1]);
      },
    });
  queue.sort((a, b) => a.d - b.d);
  for (const q of queue.filter((q) => q.d < depth(0, BRIDGE.y1 - 1))) q.run();
  // characters under the deck are drawn after it, so they are drawn in the open below
  const isUnder = (/** @type {(string|number)[]} */ c) =>
    c[3] === 0 &&
    /** @type {number} */ (c[1]) > BRIDGE.x0 - 0.3 &&
    /** @type {number} */ (c[1]) < BRIDGE.x1 + 0.3 &&
    /** @type {number} */ (c[2]) > BRIDGE.y0 - 0.3 &&
    /** @type {number} */ (c[2]) < BRIDGE.y1 + 0.3;
  const sortedChars = [...CHARS].sort(
    (a, b) =>
      depth(/** @type {number} */ (a[1]), /** @type {number} */ (a[2])) -
      depth(/** @type {number} */ (b[1]), /** @type {number} */ (b[2])),
  );
  for (const c of sortedChars.filter(
    (c) =>
      c[3] !== 1 &&
      !isUnder(c) &&
      /** @type {number} */ (c[2]) < BRIDGE.y1 - 0.5 &&
      depth(/** @type {number} */ (c[1]), /** @type {number} */ (c[2])) < depth(0, BRIDGE.y1),
  ))
    drawChar(c, false);
  for (const p of frontPillars) drawPillar(p[0], p[1]);
  deckBase();
  if (id === "a" || id === "d") drawArch();
  for (const c of sortedChars.filter((c) => isUnder(c))) drawChar(c, true);
  for (const c of sortedChars.filter((c) => c[3] === 1 || c[3] === 0.5)) drawChar(c, false);
  for (const q of queue.filter((q) => q.d >= depth(0, BRIDGE.y1 - 1))) q.run();
  for (const c of sortedChars.filter(
    (c) =>
      c[3] === 0 &&
      !isUnder(c) &&
      !(
        depth(/** @type {number} */ (c[1]), /** @type {number} */ (c[2])) < depth(0, BRIDGE.y1) &&
        /** @type {number} */ (c[2]) < BRIDGE.y1 - 0.5
      ),
  ))
    drawChar(c, false);

  // ---- mood over everything ----
  const vig = S.mood === "night" ? 0.8 : S.mood === "ruin" ? 0.5 : S.mood === "fair" ? 0 : 0.4;
  if (vig > 0) {
    defs.push(
      `<radialGradient id="vg-${id}" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${f(vig)}"/></radialGradient>`,
    );
    out.push(`<rect width="${f(W)}" height="${f(H)}" fill="url(#vg-${id})"/>`);
  }
  if (S.mood === "day")
    out.push(`<rect width="${f(W)}" height="${f(H)}" fill="#ffd9a0" opacity=".07"/>`);
  if (opt.labelled !== false)
    out.push(
      `<text x="16" y="${f(H - 14)}" font-family="sans-serif" font-size="15" font-weight="700" fill="${S.label}" opacity=".9">${S.name}</text>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}"><defs>${defs.join("")}</defs>${out.join("")}</svg>`;
}

const raster = (/** @type {string} */ svg, /** @type {string} */ png, /** @type {number} */ w) =>
  execFileSync("inkscape", [svg, "-o", png, "-w", String(w)], { stdio: "ignore" });

/** @type {string[]} */
const pngs = [];
for (const id of Object.keys(STYLES)) {
  const svg = join(tmp, `${id}.svg`);
  const png = join(outDir, `2960-option-${id}.png`);
  writeFileSync(svg, scene(id));
  raster(svg, png, 960);
  pngs.push(png);
  // play-size crop: the deck edge and the ramp at the pixel size bodies have in the
  // running game (a character is about 40 px tall at the default zoom, so 1:1 here
  // is about 1.2x play size), rendered at 1x and cut around the ramp foot
  const cropPng = join(outDir, `2960-crop-${id}.png`);
  raster(svg, join(tmp, `${id}-full.png`), 960);
  const [cx, cy] = [STYLES[id].iso ? 440 : 330, STYLES[id].iso ? 300 : 330];
  execFileSync("magick", [
    join(tmp, `${id}-full.png`),
    "-crop",
    "420x240+" + String(cx - 140) + "+" + String(cy - 130),
    "+repage",
    cropPng,
  ]);
}
// recolour for size: palette-reduce every committed png
for (const p of [...pngs, ...Object.keys(STYLES).map((i) => join(outDir, `2960-crop-${i}.png`))])
  execFileSync("magick", [p, "-colors", "200", "-strip", `PNG8:${p}`]);

// contact sheet: A B C / D E + legend
const sheet = join(outDir, "2960-all-options.png");
execFileSync("magick", [
  "(",
  ...pngs.slice(0, 3).flatMap((p) => ["(", p, "-resize", "640x", ")"]),
  "+append",
  ")",
  "(",
  ...pngs.slice(3).flatMap((p) => ["(", p, "-resize", "640x", ")"]),
  "+append",
  ")",
  "-background",
  "#0e1116",
  "-append",
  "-colors",
  "200",
  "-strip",
  `PNG8:${sheet}`,
]);
// deuteranopia simulation (Machado 2009, severity 1.0)
const sim = pngs.map((p, i) => {
  const o = join(tmp, `deut-${String(i)}.png`);
  execFileSync("magick", [
    p,
    "-resize",
    "480x",
    "-color-matrix",
    "0.367322 0.860646 -0.227968  0.280085 0.672501 0.047413  -0.011820 0.042940 0.968881",
    o,
  ]);
  return o;
});
execFileSync("magick", [
  "(",
  ...sim.slice(0, 3),
  "+append",
  ")",
  "(",
  ...sim.slice(3),
  "+append",
  ")",
  "-background",
  "#0e1116",
  "-append",
  "-colors",
  "160",
  "-strip",
  `PNG8:${join(outDir, "2960-deuteranopia.png")}`,
]);
