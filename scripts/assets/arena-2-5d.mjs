// #2811 mockups: five 2.5D art directions for one multi-layer arena.
// Study, not decided. Usage: node scripts/assets/arena-2-5d.mjs <outDir>
// Writes <outDir>/2811-option-{a..e}.png and 2811-deuteranopia.png.
// One scene description (world units, layer 0 ground / layer 1 deck) is drawn
// by five styles; only projection, materials and character drawing differ.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXTRA } from "./arena-2-5d-styles.mjs";

const outDir = process.argv[2] ?? "docs/art";
mkdirSync(outDir, { recursive: true });
const tmp = join(process.env.TMPDIR ?? "/tmp", "arena-2811");
mkdirSync(tmp, { recursive: true });

const W = 960;
const H = 560;
const DECK = 2.4; // layer 1 height, world units
/** @typedef {[number, number]} Pt */
/** @typedef {[string, number, number, number]} Char  team, x, y, layer */
/** @typedef {{name:string,iso:boolean,sx:number,sy:number,hz:number,bg:[string,string],floor:string,deck:string,wall:string,ramp:string,pillar:string,friend:string,foe:string,slab:number,edge:string,label?:string,hooks?:Hooks,polyFx?:(fill:string,extra:string)=>{fill:string,extra:string},voxel?:boolean,wrap?:string,pixel?:number,post?:string[],tone?:{from:string,to:string}}} Style */
/**
 * What a style's hooks may use. All coordinates are world units unless named px.
 * @typedef {{S:Style,out:string[],defs:string[],u:number,W:number,H:number,DECK:number,BRIDGE:{x0:number,y0:number,x1:number,y1:number},RAMP:{x0:number,y0:number,x1:number,y1:number},
 *   Q:(x:number,y:number,z?:number)=>Pt,f:(n:number)=>string,pts:(a:Pt[])=>string,poly:(a:Pt[],fill:string,extra?:string)=>void,
 *   box:(x0:number,y0:number,x1:number,y1:number,z0:number,z1:number,c:string,o?:{sw?:number,front?:string,side?:string,top?:string})=>void,
 *   blocks:(x0:number,y1:number,x1:number,z0:number,z1:number,rows:number,line:string,w?:number)=>void,
 *   ellipse:(cx:number,cy:number,rx:number,ry:number,fill:string,extra?:string)=>void,
 *   glyph:(t:string,X:number,Y:number,r:number,col?:string)=>void,
 *   mix:(a:string,b:string,t:number)=>string,shade:(c:string,t:number)=>string,lift:(c:string,t:number)=>string,rampZ:(x:number)=>number}} Ctx */
/**
 * @typedef {{bgAdd?:(c:Ctx)=>void,floorAdd?:(c:Ctx)=>void,shadow?:(c:Ctx)=>void,wallAdd?:(c:Ctx,w:number[])=>void,
 *   pillar?:(c:Ctx,x:number,y:number)=>void,deckAdd?:(c:Ctx)=>void,over?:(c:Ctx)=>void,
 *   char?:(c:Ctx,ch:Char,X:number,Y:number,col:string,under:boolean)=>void}} Hooks */
/** @type {(n: number) => string} */
const f = (n) => String(Math.round(n * 10) / 10);

// ---- the scene (world units; one unit is about one character height) ----
const BRIDGE = { x0: 6.5, y0: 3.5, x1: 13.5, y1: 8.5 };
const RAMP = { x0: 3.5, y0: 5, x1: 6.5, y1: 7 };
/** @type {Pt[]} */
const PILLARS = [
  [6.7, 3.7],
  [13, 3.7],
  [6.7, 8],
  [13, 8],
];
/** @type {[number, number, number, number, number][]} */
const WALLS = [
  [15, 2, 18, 2.8, 1.6],
  [15, 2, 15.8, 5, 1.6],
  [2, 8.6, 3, 11, 1.6],
  [9, 0.2, 11, 0.9, 1.1],
];
// [team, x, y, layer]; a ramp character's height follows the ramp.
/** @type {Char[]} */
const CHARS = [
  ["b", 8.4, 5.1, 1],
  ["r", 10.5, 7.2, 1], // above ...
  ["b", 12.3, 7.4, 1],
  ["b", 10.5, 7.2, 0], // ... and directly below the same spot
  ["r", 9, 8.35, 0], // directly under the deck's front edge
  ["b", 5, 6, 0.5], // halfway up the ramp
  ["r", 12, 4.4, 0],
  ["b", 3, 2.6, 0],
  ["r", 16.4, 6.4, 0],
  ["r", 14.5, 9.8, 0],
  ["b", 12.5, 10.2, 0],
];
/** @type {(x: number) => number} */
const rampZ = (x) => ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * DECK;
/** @type {(c: Char) => number} */
const charZ = (c) => (c[3] === 0.5 ? rampZ(c[1]) : c[3] * DECK);

// ---- styles ----
/** @type {(a: string, b: string, t: number) => string} */
const mix = (a, b, t) => {
  /** @type {(h: string) => number[]} */
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};
/** @type {(c: string, t: number) => string} */
const shade = (c, t) => mix(c, "#000000", t);
/** @type {(c: string, t: number) => string} */
const lift = (c, t) => mix(c, "#ffffff", t);

/** @type {Record<string, Style>} */
const BASE = {
  a: {
    name: "A · Sunken courtyard",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#2a2823", "#14130f"],
    floor: "#6d6757",
    deck: "#8a8068",
    wall: "#7a7466",
    ramp: "#847a63",
    pillar: "#7a7262",
    friend: "#4f9fd6",
    foe: "#d65a4f",
    slab: 0.5,
    edge: "#1d1b16",
  },
  b: {
    name: "B · Tabletop diorama",
    iso: true,
    sx: 23,
    sy: 11.5,
    hz: 26,
    bg: ["#cfe3ef", "#9fbfd2"],
    floor: "#8fc46a",
    deck: "#d9a964",
    wall: "#b9a58a",
    ramp: "#cf9d5c",
    pillar: "#a9733f",
    friend: "#2f8fe8",
    foe: "#ee5148",
    slab: 0.45,
    edge: "#3a2a1c",
  },
  c: {
    name: "C · Torchlit ruin",
    iso: false,
    sx: 40,
    sy: 26,
    hz: 46,
    bg: ["#12151b", "#06070a"],
    floor: "#262a31",
    deck: "#4a4036",
    wall: "#353a44",
    ramp: "#443b32",
    pillar: "#3d3329",
    friend: "#4ab3ff",
    foe: "#ff6a5e",
    slab: 0.45,
    edge: "#030406",
  },
  d: {
    name: "D · Graphic layers",
    iso: false,
    sx: 40,
    sy: 30,
    hz: 34,
    bg: ["#10151c", "#10151c"],
    floor: "#26303f",
    deck: "#8fa4bd",
    wall: "#4b5a70",
    ramp: "#a9bbd0",
    pillar: "#62748c",
    friend: "#59c2ff",
    foe: "#ff7b72",
    slab: 0.5,
    edge: "#10151c",
  },
  e: {
    name: "E · Bastion",
    iso: false,
    sx: 40,
    sy: 29,
    hz: 50,
    bg: ["#3a2f2c", "#1b1514"],
    floor: "#7c6f66",
    deck: "#a3917c",
    wall: "#8d7a6c",
    ramp: "#98836d",
    pillar: "#907e6c",
    friend: "#3f86c9",
    foe: "#c9473f",
    slab: 1.0,
    edge: "#1f1614",
  },
};

/** @type {Record<string, Style>} */
const ALL = { ...BASE, ...EXTRA };

/**
 * Build an SVG for one style.
 * @param {string} id
 */
function scene(id) {
  const S = ALL[id];
  /** @type {string[]} */
  const out = [];
  /** @type {(x: number, y: number, z?: number) => Pt} */
  const P = (x, y, z = 0) => {
    const X = S.iso ? (x + y) * S.sx : x * S.sx;
    const Y = S.iso ? (y - x) * S.sy : y * S.sy;
    return [X, Y - z * S.hz];
  };
  // centre the floor in the canvas
  const corners = [P(0, 0), P(20, 0), P(0, 12), P(20, 12), P(0, 0, 3.4)];
  const minX = Math.min(...corners.map((p) => p[0]));
  const maxX = Math.max(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1]));
  const maxY = Math.max(...corners.map((p) => p[1]));
  const ox = (W - (maxX - minX)) / 2 - minX;
  const oy = (H - (maxY - minY)) / 2 - minY + (id === "b" ? -14 : 8);
  /** @type {(x: number, y: number, z?: number) => Pt} */
  const Q = (x, y, z = 0) => {
    const [X, Y] = P(x, y, z);
    return [X + ox, Y + oy];
  };
  /** @type {(arr: Pt[]) => string} */
  const pts = (arr) => arr.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
  /** @type {(arr: Pt[], fill: string, extra?: string) => void} */
  const poly = (arr, fill, extra = "") => {
    const fx = S.polyFx ? S.polyFx(fill, extra) : { fill, extra };
    out.push(`<polygon points="${pts(arr)}" fill="${fx.fill}" ${fx.extra}/>`);
  };
  /** @type {string[]} */
  const defs = [];

  // box faces: top, front (y=y1), right (x=x1; zero width in oblique views)
  /** @type {(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: string, o?: {sw?: number, front?: string, side?: string, top?: string}) => void} */
  const box = (x0, y0, x1, y1, z0, z1, c, o = {}) => {
    if (S.voxel && x1 - x0 > 1.05) {
      // voxel look: one cube per world unit, back to front
      const nx = Math.round(x1 - x0);
      const ny = Math.max(1, Math.round(y1 - y0));
      /** @type {[number, number][]} */
      const cells = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([i, j]);
      cells.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
      for (const [i, j] of cells) {
        const k = ((i * 7 + j * 13) % 5) * 0.018;
        const cx0 = x0 + ((x1 - x0) * i) / nx;
        const cy0 = y0 + ((y1 - y0) * j) / ny;
        box(cx0, cy0, cx0 + (x1 - x0) / nx, cy0 + (y1 - y0) / ny, z0, z1, mix(c, "#ffffff", k), {
          ...o,
          top: o.top && mix(o.top, "#ffffff", k),
          sw: 0,
        });
      }
      return;
    }
    const st = `stroke="${S.edge}" stroke-width="${f(o.sw ?? 1)}" stroke-linejoin="round"`;
    poly(
      [Q(x0, y1, z0), Q(x1, y1, z0), Q(x1, y1, z1), Q(x0, y1, z1)],
      o.front ?? shade(c, 0.32),
      st,
    );
    if (S.iso)
      poly(
        [Q(x0, y0, z0), Q(x0, y1, z0), Q(x0, y1, z1), Q(x0, y0, z1)],
        o.side ?? shade(c, 0.5),
        st,
      );
    poly([Q(x0, y0, z1), Q(x1, y0, z1), Q(x1, y1, z1), Q(x0, y1, z1)], o.top ?? c, st);
  };
  /** @type {(x0: number, y1: number, x1: number, z0: number, z1: number, rows: number, line: string, w?: number) => void} */
  const blocks = (x0, y1, x1, z0, z1, rows, line, w = 0.5) => {
    // horizontal course lines plus staggered joints on a front face
    for (let r = 1; r < rows; r++) {
      const z = z0 + ((z1 - z0) * r) / rows;
      out.push(
        `<polyline points="${pts([Q(x0, y1, z), Q(x1, y1, z)])}" stroke="${line}" stroke-width="${f(w)}" fill="none" opacity=".55"/>`,
      );
    }
    const dx = ((z1 - z0) / rows) * 1.4;
    for (let r = 0; r < rows; r++) {
      const za = z0 + ((z1 - z0) * r) / rows;
      const zb = z0 + ((z1 - z0) * (r + 1)) / rows;
      for (let x = x0 + (r % 2 ? dx / 2 : dx); x < x1 - 0.1; x += dx)
        out.push(
          `<polyline points="${pts([Q(x, y1, za), Q(x, y1, zb)])}" stroke="${line}" stroke-width="${f(w)}" fill="none" opacity=".55"/>`,
        );
    }
  };
  /** @type {(cx: number, cy: number, rx: number, ry: number, fill: string, extra?: string) => void} */
  const ellipse = (cx, cy, rx, ry, fill, extra = "") =>
    out.push(
      `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`,
    );

  const u = S.iso ? S.hz * 0.95 : S.hz * 0.85; // one character height in px
  /** @type {(t: string) => string} */
  const teamCol = (t) => (t === "b" ? S.friend : S.foe);
  /** @type {(t: string, X: number, Y: number, r: number, col?: string) => void} */
  const glyph = (t, X, Y, r, col = "#fff") => {
    // team shape over the head: ring = friend, triangle = foe (shape first)
    if (t === "b")
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(r)}" fill="none" stroke="${col}" stroke-width="${f(r * 0.45)}"/>`,
      );
    else
      out.push(
        `<polygon points="${f(X)},${f(Y - r * 1.1)} ${f(X + r * 1.1)},${f(Y + r * 0.8)} ${f(X - r * 1.1)},${f(Y + r * 0.8)}" fill="${col}"/>`,
      );
  };

  /** @type {Ctx} */
  const ctx = {
    S,
    out,
    defs,
    u,
    W,
    H,
    DECK,
    BRIDGE,
    RAMP,
    Q,
    f,
    pts,
    poly,
    box,
    blocks,
    ellipse,
    glyph,
    mix,
    shade,
    lift,
    rampZ,
  };

  // ---------- characters ----------
  /** @type {(c: Char) => void} */
  const char = (c) => {
    const [t, x, y] = c;
    const z = charZ(c);
    const [X, Y] = Q(x, y, z);
    const col = teamCol(t);
    const under =
      c[3] === 0 &&
      x > BRIDGE.x0 - 0.3 &&
      x < BRIDGE.x1 + 0.3 &&
      y > BRIDGE.y0 - 0.3 &&
      y < BRIDGE.y1 + 0.3;
    out.push("<!--c0-->");
    if (S.hooks?.char) {
      S.hooks.char(ctx, c, X, Y, col, under);
    } else if (id === "a") {
      ellipse(X, Y + 1, u * 0.34, u * 0.13, "#000", 'opacity=".4"');
      out.push(
        `<rect x="${f(X - u * 0.22)}" y="${f(Y - u * 0.62)}" width="${f(u * 0.44)}" height="${f(u * 0.62)}" rx="${f(u * 0.16)}" fill="${col}" stroke="${S.edge}" stroke-width="1.2"/>`,
      );
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y - u * 0.74)}" r="${f(u * 0.15)}" fill="#e2c39b" stroke="${S.edge}" stroke-width="1.2"/>`,
      );
      out.push(
        `<line x1="${f(X + u * 0.3)}" y1="${f(Y - u * 0.15)}" x2="${f(X + u * 0.42)}" y2="${f(Y - u * 0.85)}" stroke="#d9d3c0" stroke-width="2"/>`,
      );
      glyph(t, X, Y - u * 1.02, u * 0.09, "#f4efe0");
      if (under)
        ellipse(
          X,
          Y,
          u * 0.46,
          u * 0.2,
          "none",
          'stroke="#f4efe0" stroke-width="1.6" stroke-dasharray="3 2"',
        );
    } else if (id === "b") {
      ellipse(X, Y + 2, u * 0.42, u * 0.17, "#000", 'opacity=".25"');
      ellipse(X, Y, u * 0.4, u * 0.16, shade(col, 0.35), `stroke="${S.edge}" stroke-width="2"`);
      out.push(
        `<polygon points="${f(X - u * 0.3)},${f(Y)} ${f(X + u * 0.3)},${f(Y)} ${f(X)},${f(Y - u * 0.72)}" fill="${col}" stroke="${S.edge}" stroke-width="2" stroke-linejoin="round"/>`,
      );
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y - u * 0.82)}" r="${f(u * 0.2)}" fill="${lift(col, 0.45)}" stroke="${S.edge}" stroke-width="2"/>`,
      );
      glyph(t, X, Y - u * 1.28, u * 0.12, "#fff");
    } else if (id === "c") {
      ellipse(X, Y + 1, u * 0.3, u * 0.1, "#000", 'opacity=".7"');
      const dark = shade(col, 0.72);
      out.push(
        `<path d="M${f(X - u * 0.24)},${f(Y)} L${f(X - u * 0.16)},${f(Y - u * 0.62)} L${f(X)},${f(Y - u * 0.9)} L${f(X + u * 0.16)},${f(Y - u * 0.62)} L${f(X + u * 0.24)},${f(Y)} Z" fill="${dark}" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`,
      );
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y - u * 0.62)}" r="${f(u * 0.07)}" fill="${lift(col, 0.55)}"/>`,
      );
      glyph(t, X, Y - u * 1.1, u * 0.09, lift(col, 0.35));
    } else if (id === "d") {
      ellipse(X + u * 0.18, Y + u * 0.06, u * 0.36, u * 0.17, "#000", 'opacity=".35"');
      out.push(`<circle cx="${f(X)}" cy="${f(Y - u * 0.4)}" r="${f(u * 0.34)}" fill="${col}"/>`);
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y - u * 0.4)}" r="${f(u * 0.34)}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>`,
      );
      glyph(t, X, Y - u * 0.4, u * 0.14, "#fff");
    } else {
      ellipse(X, Y + 1, u * 0.34, u * 0.12, "#000", 'opacity=".4"');
      out.push(
        `<line x1="${f(X + u * 0.28)}" y1="${f(Y)}" x2="${f(X + u * 0.28)}" y2="${f(Y - u * 1.05)}" stroke="#d8cdb8" stroke-width="2"/>`,
      );
      out.push(
        `<path d="M${f(X - u * 0.24)},${f(Y - u * 0.66)} h${f(u * 0.48)} v${f(u * 0.34)} q0,${f(u * 0.3)} ${f(-u * 0.24)},${f(u * 0.34)} q${f(-u * 0.24)},${f(-u * 0.04)} ${f(-u * 0.24)},${f(-u * 0.34)} Z" fill="${col}" stroke="${S.edge}" stroke-width="1.6"/>`,
      );
      out.push(
        `<line x1="${f(X)}" y1="${f(Y - u * 0.62)}" x2="${f(X)}" y2="${f(Y - u * 0.1)}" stroke="#f1e2b6" stroke-width="2"/>`,
      );
      out.push(
        `<circle cx="${f(X)}" cy="${f(Y - u * 0.78)}" r="${f(u * 0.15)}" fill="#b9b2a6" stroke="${S.edge}" stroke-width="1.4"/>`,
      );
      glyph(t, X, Y - u * 1.1, u * 0.09, "#f1e2b6");
    }
    out.push("<!--c1-->");
  };

  // ---------- backdrop ----------
  defs.push(
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.bg[0]}"/><stop offset="1" stop-color="${S.bg[1]}"/></linearGradient>`,
  );
  defs.push(
    `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(id === "c" ? 9 : 6)}"/></filter>`,
  );
  defs.push(
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .35 0"/><feComposite in2="SourceAlpha" operator="in"/></filter>`,
  );
  out.push(`<rect width="${f(W)}" height="${f(H)}" fill="url(#bg)"/>`);
  S.hooks?.bgAdd?.(ctx);

  // ---------- floor ----------
  const fl = [Q(0, 0, 0), Q(20, 0, 0), Q(20, 12, 0), Q(0, 12, 0)];
  if (id === "b") {
    // floating slab with an earth side
    poly(
      [Q(0, 12, 0), Q(20, 12, 0), Q(20, 12, -1.3), Q(0, 12, -1.3)],
      "#7a5436",
      `stroke="${S.edge}" stroke-width="2"`,
    );
    poly(
      [Q(0, 0, 0), Q(0, 12, 0), Q(0, 12, -1.3), Q(0, 0, -1.3)],
      "#5c3f28",
      `stroke="${S.edge}" stroke-width="2"`,
    );
    ellipse(...Q(10, 12, -2.4), 270, 22, "#000", 'opacity=".18" filter="url(#soft)"');
  }
  poly(fl, S.floor, `stroke="${S.edge}" stroke-width="${f(id === "b" ? 2 : 1)}"`);
  S.hooks?.floorAdd?.(ctx);
  if (id === "a" || id === "e") {
    // flagstone courses
    for (let y = 1; y < 12; y += 1.5)
      out.push(
        `<polyline points="${pts([Q(0, y, 0), Q(20, y, 0)])}" stroke="#000" stroke-width=".8" opacity=".3" fill="none"/>`,
      );
    for (let y = 0, r = 0; y < 12; y += 1.5, r++)
      for (let x = r % 2 ? 1.2 : 0; x < 20; x += 2.4)
        out.push(
          `<polyline points="${pts([Q(x, y, 0), Q(x, Math.min(12, y + 1.5), 0)])}" stroke="#000" stroke-width=".8" opacity=".3" fill="none"/>`,
        );
    out.push(`<polygon points="${pts(fl)}" fill="#000" filter="url(#grain)" opacity=".5"/>`);
  } else if (id === "b") {
    for (let i = 0; i < 40; i++) {
      const x = (i * 7.31) % 19.5,
        y = (i * 3.77) % 11.5;
      ellipse(...Q(x + 0.3, y + 0.3, 0), 5, 2.4, lift(S.floor, 0.18), 'opacity=".7"');
    }
  } else if (id === "c") {
    out.push(`<polygon points="${pts(fl)}" fill="#000" filter="url(#grain)" opacity=".7"/>`);
    // torchlight pools
    /** @type {[number, number, number][]} */
    const pools = [
      [8, 9.5, 190],
      [14.2, 6, 150],
      [4, 3.4, 150],
    ];
    for (const [x, y, r] of pools) {
      const [X, Y] = Q(x, y, 0);
      defs.push(
        `<radialGradient id="t${f(x)}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb55a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb55a" stop-opacity="0"/></radialGradient>`,
      );
      ellipse(X, Y, r, r * 0.5, `url(#t${f(x)})`);
    }
  } else if (id === "d") {
    for (let x = 0; x <= 20; x += 2)
      out.push(
        `<polyline points="${pts([Q(x, 0, 0), Q(x, 12, 0)])}" stroke="#34415a" stroke-width="1" fill="none"/>`,
      );
    for (let y = 0; y <= 12; y += 2)
      out.push(
        `<polyline points="${pts([Q(0, y, 0), Q(20, y, 0)])}" stroke="#34415a" stroke-width="1" fill="none"/>`,
      );
  }

  // ---------- shadow cast by the deck onto the ground (the layer cue) ----------
  const sh =
    id === "d"
      ? [
          Q(BRIDGE.x0 + 1.3, BRIDGE.y0 + 1.3, 0),
          Q(BRIDGE.x1 + 1.3, BRIDGE.y0 + 1.3, 0),
          Q(BRIDGE.x1 + 1.3, BRIDGE.y1 + 1.3, 0),
          Q(BRIDGE.x0 + 1.3, BRIDGE.y1 + 1.3, 0),
        ]
      : [
          Q(BRIDGE.x0, BRIDGE.y0, 0),
          Q(BRIDGE.x1, BRIDGE.y0, 0),
          Q(BRIDGE.x1, BRIDGE.y1, 0),
          Q(BRIDGE.x0, BRIDGE.y1, 0),
        ];
  if (S.hooks?.shadow) S.hooks.shadow(ctx);
  else if (id === "d") poly(sh, "#080b10", 'opacity=".55"');
  else
    out.push(
      `<g filter="url(#soft)"><polygon points="${pts(sh)}" fill="#000" opacity="${f(id === "c" ? 0.8 : id === "b" ? 0.3 : 0.5)}"/></g>`,
    );
  if (id === "d") {
    // lower layer is tinted a step darker and cooler under the deck
    poly(
      [
        Q(BRIDGE.x0, BRIDGE.y0, 0),
        Q(BRIDGE.x1, BRIDGE.y0, 0),
        Q(BRIDGE.x1, BRIDGE.y1, 0),
        Q(BRIDGE.x0, BRIDGE.y1, 0),
      ],
      "#0d131c",
      'opacity=".55"',
    );
  }

  // ---------- group 1: ground level (sorted back to front) ----------
  /** @type {(x: number, y: number) => number} */
  const depth = (x, y) => (S.iso ? y - x : y);
  /** @type {[number, () => void][]} */
  const items = [];
  items.push([
    depth(RAMP.x0, RAMP.y0) - 0.01,
    () => {
      const st = `stroke="${S.edge}" stroke-width="1" stroke-linejoin="round"`;
      poly(
        [Q(RAMP.x0, RAMP.y1, 0), Q(RAMP.x1, RAMP.y1, 0), Q(RAMP.x1, RAMP.y1, DECK)],
        shade(S.ramp, 0.35),
        st,
      );
      poly(
        [
          Q(RAMP.x0, RAMP.y0, 0),
          Q(RAMP.x0, RAMP.y1, 0),
          Q(RAMP.x1, RAMP.y1, DECK),
          Q(RAMP.x1, RAMP.y0, DECK),
        ],
        S.ramp,
        st,
      );
      for (let i = 1; i < 7; i++) {
        const x = RAMP.x0 + ((RAMP.x1 - RAMP.x0) * i) / 7;
        out.push(
          `<polyline points="${pts([Q(x, RAMP.y0, rampZ(x)), Q(x, RAMP.y1, rampZ(x))])}" stroke="${shade(S.ramp, 0.5)}" stroke-width="1.6" fill="none"/>`,
        );
      }
    },
  ]);
  for (const w of WALLS) {
    items.push([
      depth(w[0], w[3]),
      () => {
        const [x0, y0, x1, y1, h] = w;
        const tall = id === "e" ? h + 0.8 : h;
        box(x0, y0, x1, y1, 0, tall, S.wall, { top: lift(S.wall, 0.12) });
        if (id === "a" || id === "e" || id === "c")
          blocks(x0, y1, x1, 0, tall, id === "e" ? 4 : 3, S.edge);
        if (id === "b") blocks(x0, y1, x1, 0, tall, 2, S.edge, 1);
        if (id === "e") {
          // merlons along the front edge
          for (let x = x0 + 0.05; x + 0.35 < x1; x += 0.7)
            box(x, y1 - 0.25, x + 0.35, y1, tall, tall + 0.35, S.wall, { sw: 0.8 });
        }
        if (id === "d")
          out.push(
            `<polyline points="${pts([Q(x0, y1, tall), Q(x1, y1, tall)])}" stroke="#a9bbd0" stroke-width="2" fill="none"/>`,
          );
        S.hooks?.wallAdd?.(ctx, w);
      },
    ]);
  }
  for (const [px, py] of PILLARS) {
    items.push([
      depth(px, py + 0.6),
      () => {
        if (S.hooks?.pillar) {
          S.hooks.pillar(ctx, px, py);
          return;
        }
        box(px, py, px + 0.6, py + 0.6, 0, DECK - S.slab, S.pillar, {
          front: shade(S.pillar, 0.3),
        });
        if (id === "b")
          box(px - 0.1, py - 0.1, px + 0.7, py + 0.7, 0, 0.18, shade(S.pillar, 0.2), { sw: 1 });
        if (id === "e")
          box(px - 0.12, py - 0.12, px + 0.72, py + 0.72, 0, 0.3, S.pillar, { sw: 1 });
        if (id === "a" || id === "c")
          blocks(px, py + 0.6, px + 0.6, 0, DECK - S.slab, 5, S.edge, 0.6);
      },
    ]);
  }
  for (const c of CHARS)
    if (c[3] !== 1)
      items.push([
        depth(c[1], c[2]) + 0.02,
        () => {
          char(c);
        },
      ]);
  for (const it of items.sort((a, b) => a[0] - b[0])) it[1]();

  // ---------- group 2: the deck ----------
  const { x0, y0, x1, y1 } = BRIDGE;
  const zt = DECK;
  const zb = DECK - S.slab;
  box(x0, y0, x1, y1, zb, zt, S.deck, {
    top: id === "d" ? lift(S.deck, 0.15) : S.deck,
    front: id === "d" ? shade(S.deck, 0.4) : shade(S.deck, 0.34),
  });
  S.hooks?.deckAdd?.(ctx);
  if (id === "a") {
    blocks(x0, y1, x1, zb, zt, 2, S.edge, 0.8);
    out.push(
      `<polygon points="${pts([Q(x0, y0, zt), Q(x1, y0, zt), Q(x1, y1, zt), Q(x0, y1, zt)])}" fill="#000" filter="url(#grain)" opacity=".5"/>`,
    );
  } else if (id === "b") {
    for (let x = x0 + 0.7; x < x1; x += 0.7)
      out.push(
        `<polyline points="${pts([Q(x, y0, zt), Q(x, y1, zt)])}" stroke="${shade(S.deck, 0.4)}" stroke-width="1.4" fill="none"/>`,
      );
  } else if (id === "c") {
    for (let y = y0 + 0.9; y < y1; y += 0.9)
      out.push(
        `<polyline points="${pts([Q(x0, y, zt), Q(x1, y, zt)])}" stroke="#000" stroke-width="1.6" opacity=".6" fill="none"/>`,
      );
    out.push(
      `<polygon points="${pts([Q(x0, y0, zt), Q(x1, y0, zt), Q(x1, y1, zt), Q(x0, y1, zt)])}" fill="#000" filter="url(#grain)" opacity=".6"/>`,
    );
  } else if (id === "d") {
    out.push(
      `<polyline points="${pts([Q(x0, y1, zt), Q(x1, y1, zt)])}" stroke="#fff" stroke-width="3" fill="none"/>`,
    );
    for (let x = x0 + 1; x < x1; x += 1)
      out.push(
        `<polyline points="${pts([Q(x, y0 + 0.1, zt), Q(x, y1 - 0.1, zt)])}" stroke="${shade(S.deck, 0.15)}" stroke-width="1" fill="none"/>`,
      );
  } else if (id === "e") {
    // arcade: arches cut into the front face, parapet posts on top
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * (i + 0.5)) / n;
      const aw = ((x1 - x0) / n) * 0.34;
      const [lx, ly] = Q(ax - aw, y1, zb);
      const [rx] = Q(ax + aw, y1, zb);
      const [, ty] = Q(ax, y1, zb + 0.55);
      out.push(
        `<path d="M${f(lx)},${f(ly)} L${f(lx)},${f(ty + (rx - lx) / 2)} A${f((rx - lx) / 2)},${f((rx - lx) / 2)} 0 0 1 ${f(rx)},${f(ty + (rx - lx) / 2)} L${f(rx)},${f(ly)} Z" fill="#17100e" opacity=".92"/>`,
      );
    }
    blocks(x0, y1, x1, zb, zt, 2, S.edge, 0.8);
    for (let x = x0 + 0.1; x + 0.4 < x1; x += 0.9)
      box(x, y1 - 0.3, x + 0.4, y1, zt, zt + 0.4, S.deck, { sw: 0.9 });
  }
  // posts and rope along the deck's open edges (diorama), low parapet (A)
  if (id === "b") {
    for (const [px, py] of [
      [x0, y1],
      [x0 + 2.3, y1],
      [x0 + 4.6, y1],
      [x1, y1],
    ]) {
      const [a, b] = Q(px, py, zt);
      out.push(
        `<line x1="${f(a)}" y1="${f(b)}" x2="${f(a)}" y2="${f(b - 15)}" stroke="${S.edge}" stroke-width="4"/><line x1="${f(a)}" y1="${f(b)}" x2="${f(a)}" y2="${f(b - 15)}" stroke="#c28b4b" stroke-width="2"/>`,
      );
    }
    out.push(
      `<polyline points="${pts([Q(x0, y1, zt + 0.6), Q(x1, y1, zt + 0.6)])}" stroke="#f3e2b5" stroke-width="2.2" fill="none"/>`,
    );
  }
  if (id === "c") {
    // torches on the deck edge, with a lit halo that picks out the upper layer
    for (const tx of [x0 + 0.3, x1 - 0.3]) {
      const [a, b] = Q(tx, y1, zt);
      defs.push(
        `<radialGradient id="h${f(Math.round(tx))}"><stop offset="0" stop-color="#ffc16a" stop-opacity=".6"/><stop offset="1" stop-color="#ffc16a" stop-opacity="0"/></radialGradient>`,
      );
      ellipse(a, b - 22, 64, 48, `url(#h${f(Math.round(tx))})`);
      out.push(
        `<line x1="${f(a)}" y1="${f(b)}" x2="${f(a)}" y2="${f(b - 22)}" stroke="#2a1f16" stroke-width="3"/><circle cx="${f(a)}" cy="${f(b - 25)}" r="4.5" fill="#ffb347"/>`,
      );
    }
  }

  // ---------- group 3: characters on the upper layer ----------
  for (const c of CHARS.filter((c) => c[3] === 1).sort(
    (a, b) => depth(a[1], a[2]) - depth(b[1], b[2]),
  ))
    char(c);

  // ---------- atmosphere over everything ----------
  if (id === "c") {
    defs.push(
      `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa0b8" stop-opacity=".0"/><stop offset=".55" stop-color="#8aa0b8" stop-opacity=".12"/><stop offset="1" stop-color="#8aa0b8" stop-opacity=".0"/></linearGradient>`,
    );
    out.push(`<rect y="${f(H * 0.45)}" width="${f(W)}" height="${f(H * 0.4)}" fill="url(#fog)"/>`);
    defs.push(
      `<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>`,
    );
    out.push(`<rect width="${f(W)}" height="${f(H)}" fill="url(#vig)"/>`);
  }
  if (id === "a") {
    defs.push(
      `<radialGradient id="vig" cx=".5" cy=".5" r=".8"><stop offset=".6" stop-color="#1a1408" stop-opacity="0"/><stop offset="1" stop-color="#1a1408" stop-opacity=".55"/></radialGradient>`,
    );
    out.push(`<rect width="${f(W)}" height="${f(H)}" fill="url(#vig)"/>`);
  }
  S.hooks?.over?.(ctx);
  out.push(
    `<text x="16" y="${f(H - 14)}" font-family="sans-serif" font-size="15" font-weight="700" fill="${S.label ?? (id === "b" ? "#26333d" : "#d7dee8")}" opacity=".85">${S.name}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}"><defs>${defs.join("")}</defs>${S.wrap ? `<g filter="url(#${S.wrap})">` : ""}${out.join("")}${S.wrap ? "</g>" : ""}</svg>`;
}

/** @type {(svg: string) => string} */
const stripChars = (svg) => svg.replace(/<!--c0-->[\s\S]*?<!--c1-->/g, "");
/** @type {(svg: string) => string} */
const onlyChars = (svg) =>
  svg.slice(0, svg.indexOf("</defs>") + 7) +
  [...svg.matchAll(/<!--c0-->[\s\S]*?<!--c1-->/g)].map((m) => m[0]).join("") +
  "</svg>";
/** @type {(svg: string, png: string, w: number) => void} */
const raster = (svg, png, w) => {
  execFileSync("inkscape", [svg, "-o", png, "-w", String(w)], { stdio: "ignore" });
};

/** @type {string[]} */
const pngs = [];
for (const id of Object.keys(ALL)) {
  const S = ALL[id];
  const svg = join(tmp, `${id}.svg`);
  const png = join(outDir, `2811-option-${id}.png`);
  const text = scene(id);
  writeFileSync(svg, text);
  if (S.post) {
    // environment gets a raster treatment; characters are composited crisp on top
    const env = join(tmp, `${id}-env.svg`);
    const ch = join(tmp, `${id}-chars.svg`);
    writeFileSync(env, stripChars(text));
    writeFileSync(ch, onlyChars(text));
    raster(env, png, 1200);
    execFileSync("magick", [png, ...S.post, png]);
    raster(ch, join(tmp, `${id}-chars.png`), 1200);
    execFileSync("magick", [
      png,
      join(tmp, `${id}-chars.png`),
      "-composite",
      "-colors",
      "48",
      "-strip",
      `PNG8:${png}`,
    ]);
  } else if (S.pixel) {
    raster(svg, png, S.pixel);
    execFileSync("magick", [
      png,
      "-colors",
      "28",
      "+dither",
      "-filter",
      "point",
      "-resize",
      "1200x",
      "-strip",
      `PNG8:${png}`,
    ]);
  } else {
    raster(svg, png, 1200);
    execFileSync("magick", [png, "-colors", "160", "-strip", `PNG8:${png}`]);
  }
  pngs.push(png);
}
// deuteranopia simulation (Machado 2009, severity 1.0), five per row
const sim = pngs.map((p, i) => {
  const o = join(tmp, `deut-${f(i)}.png`);
  execFileSync("magick", [
    p,
    "-resize",
    "384x",
    "-color-matrix",
    "0.367322 0.860646 -0.227968  0.280085 0.672501 0.047413  -0.011820 0.042940 0.968881",
    o,
  ]);
  return o;
});
/** @type {string[]} */
const rows = [];
for (let i = 0; i < sim.length; i += 5) {
  const row = join(tmp, `row-${f(i)}.png`);
  execFileSync("magick", [...sim.slice(i, i + 5), "+append", row]);
  rows.push(row);
}
execFileSync("magick", [
  ...rows,
  "-append",
  "-colors",
  "128",
  "-strip",
  `PNG8:${join(outDir, "2811-deuteranopia.png")}`,
]);
