/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// The shared drawing for the #3075 objective-map studies (Broken Tower, Cinder Sanctum, Mosslit Cairns, Scarred Earth,
// The Warden's Gallery). A map's script holds its data (outline, shapes, routes,
// objectives); this file draws the plan, one sheet per layer and a frame at each spawn, and
// prints the numbers the .md quotes. Needs inkscape.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @typedef {[number, number]} Pt */
/** @typedef {Pt | string} Wp  a point, "C1"/"C2" (a team's centre), "S1"/"S2" (a shrine), "M" (the centre) or an objective id */

const INK = "#0b0f14";
const SPEED = 180; // maxSpeedUnitsPerSecond in game-core's ruleset
export const STEP = 70; // drawn height of one layer step
const VH = 1100;
const VW = Math.round((VH * 16) / 9);

/** The colours every study shares: signals, brass, torch. A map's `pal` adds its biome. */
const BASE = {
  lip: "#e8e2d2",
  tunnel: "#101419",
  seam: "#6c747a",
  wood: "#8a6a3e",
  woodFace: "#4f3b22",
  torch: "#ffb060",
  friend: "#59c2ff",
  foe: "#ff7b72",
  brass: "#e8c27a",
  deep: "#0a1320",
  shore: "#c4dcee",
  shallow: "#8fb8d6",
  shrine: "#efe6c8",
  ghost: "#d8dde6",
  fog: "#c8d4e4",
};

/** @type {(a: Pt[]) => string} */
export const pts = (a) => a.map(([x, y]) => `${x},${y}`).join(" ");
/** @type {(a: Pt[]) => number} */
export const area = (a) =>
  Math.abs(
    a.reduce((s, [x, y], i) => {
      const [x2, y2] = /** @type {Pt} */ (a[(i + 1) % a.length]);
      return s + x * y2 - x2 * y;
    }, 0),
  ) / 2;
/** @type {(x: number, y: number, w: number, h: number) => Pt[]} */
export const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
/** @type {(a: Pt[]) => Pt} */
export const cen = (a) => [
  a.reduce((s, p) => s + p[0], 0) / a.length,
  a.reduce((s, p) => s + p[1], 0) / a.length,
];
/** @type {(r: Pt[]) => number} */
export const len = (r) =>
  r.reduce((s, [x, y], i) => (i ? s + Math.hypot(x - r[i - 1][0], y - r[i - 1][1]) : 0), 0);
/** @type {(x: number, y: number, w: number, h: number, n: number, side: 1 | -1) => Pt[]} */
export const seats = (x, y, w, h, n, side) => {
  /** @type {Pt[]} */
  const a = [];
  for (let i = 0; i < n; i++) a.push([x + (i % 2) * w * side, y + Math.floor(i / 2) * h]);
  return a;
};

/**
 * @typedef {object} Spec
 * @property {string} id map id, e.g. "barrow-field"
 * @property {string} name title for the plan caption
 * @property {number} MW
 * @property {number} MH
 * @property {Record<string, string>} pal biome colours: out ground deck face faceE speck1 speck2 outside, and deckL2/deckL3
 * @property {Pt[]} outline
 * @property {{ id: string; layer: number; poly: Pt[]; look?: "bridge" | "mound" | "stone" | "wood"; label?: string }[]} shapes
 * @property {{ id: string; r: Pt[]; from: number; north?: boolean }[]} stairs
 * @property {{ id: string; r: Pt[] }[]} [lifts]
 * @property {{ id: string; path: Pt[]; w: number; label: string }[]} [tunnels]
 * @property {{ poly: Pt[]; deep: boolean; label?: string; at?: Pt }[]} [water]
 * @property {{ kind: string; cx: number; cy: number; rx: number; ry: number; fill: string; edge: string }[]} [zones]
 * @property {{ r: Pt[]; label: string; layer?: number }[]} [breakables]
 * @property {{ p: Pt; label: string }[]} [gates]
 * @property {{ p: Pt; layer: number; label: string }[]} [levers]
 * @property {{ p: Pt; r: number; col?: string }[]} lights
 * @property {{ label: string; cx: number; cy: number; rx: number; ry: number; col: string; op: number }[]} [atmo]
 * @property {{ r: Pt[]; label?: string }[]} [overhangs]
 * @property {{ at: Pt; e: number }[]} [drops]
 * @property {{ kind: "stone" | "pillar" | "tree" | "reed" | "bush"; p: Pt; r: number; layer?: number }[]} [props]
 * @property {{ t1: Pt[]; t2: Pt[] }} spawns
 * @property {{ t1: Pt; t2: Pt }} [shrines] resurrection-shrine per team, where the map has them
 * @property {{ t1: Pt; t2: Pt }} [ghosts]
 * @property {{ id: string; kind: "altar" | "relic-spawn" | "capture-point"; p: Pt; layer?: number; label?: string }[]} objectives
 * @property {{ obj: string; what: string; t1: [string, Wp[]][]; t2: [string, Wp[]][] }[]} objWalks per objective: a walk each team makes, team 1's and team 2's routes in the same order
 * @property {Record<string, Pt>} [named] extra waypoints, by id (objective ids work too)
 * @property {{ kind: string; p: Pt; layer?: number }[]} [extras] storm-beacon, flag-spawn
 * @property {Pt} centre
 * @property {{ t1: [string, Wp[]][]; t2: [string, Wp[]][] }} routes spawn centre to the map centre
 * @property {{ t1: [string, Wp[]][]; t2: [string, Wp[]][] }} [toShrine] t1: routes of team 2 to team 1's shrine, t2: of team 1 to team 2's
 * @property {{ t1: Wp[]; t2: Wp[] }} [shrineCentre] each shrine to the centre
 * @property {(ctx: { tag: (l: string, p: Pt, s?: number) => string }) => string} [decorate] extra plan marks
 * @property {Record<number, string>} layerTitles layer sheet titles
 * @property {string} planNote caption on the plan
 */

/** @param {Spec} S */
export function runStudy(S) {
  const out = process.argv[2] ?? "docs/art";
  mkdirSync(out, { recursive: true });
  const { MW, MH } = S;
  /** @type {Record<string, string | undefined>} */
  const P = S.pal;
  const C = /** @type {Record<string, string>} */ ({ ...BASE, ...P });
  /** @type {(w: Wp) => Pt} */
  const at = (w) =>
    typeof w !== "string"
      ? w
      : w === "C1"
        ? cen(S.spawns.t1)
        : w === "C2"
          ? cen(S.spawns.t2)
          : w === "S1"
            ? /** @type {Pt} */ (S.shrines?.t1)
            : w === "S2"
              ? /** @type {Pt} */ (S.shrines?.t2)
              : w === "M"
                ? S.centre
                : (S.objectives.find((o) => o.id === w)?.p ?? S.named?.[w] ?? S.centre);
  /** @type {(r: Wp[]) => Pt[]} */
  const path = (r) => r.map(at);

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
  /** @type {(label: string, p: Pt, size?: number) => string} */
  const tag = (label, p, size = 30) =>
    `<text x="${p[0]}" y="${p[1]}" class="n" style="font-size:${size}px">${label}</text>`;

  const layerTop = (/** @type {number} */ n) => C[`deckL${n}`] ?? C.deck;

  /** A 2.5D prop: a shadow, a short body and a lit top. */
  /** @type {(k: string, p: Pt, r: number, e: number) => string} */
  const prop = (k, p, r, e) => {
    const [x, y] = lift(p, e);
    if (k === "reed")
      return `<path d="M${x - r},${y} l-6,-${r} M${x - r / 2},${y} l2,-${r * 1.3} M${x},${y} l6,-${r} M${x + r / 2},${y} l-2,-${r * 1.2} M${x + r},${y} l8,-${r * 0.8}" stroke="${C.plant ?? "#4f5e3c"}" stroke-width="4" fill="none"/>`;
    if (k === "tree" || k === "bush") {
      const col = C.plant ?? "#4f5e3c";
      const h = k === "tree" ? r * 1.1 : r * 0.4;
      return `<ellipse cx="${x + r * 0.5}" cy="${y + r * 0.4}" rx="${r}" ry="${r * 0.4}" fill="#080b10" opacity=".3"/><rect x="${x - 6}" y="${y - h}" width="12" height="${h}" fill="${C.woodFace}" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y - h - r * 0.4}" r="${r}" fill="${col}" stroke="${INK}" stroke-width="3"/><circle cx="${x - r * 0.3}" cy="${y - h - r * 0.7}" r="${r * 0.55}" fill="${C.plantLit ?? col}" opacity=".7"/>`;
    }
    const h = k === "pillar" ? r * 2.2 : r * 1.3;
    return `<ellipse cx="${x + r * 0.6}" cy="${y + r * 0.35}" rx="${r}" ry="${r * 0.4}" fill="#080b10" opacity=".3"/><rect x="${x - r * 0.8}" y="${y - h}" width="${r * 1.6}" height="${h}" fill="${C.faceE}" stroke="${INK}" stroke-width="3"/><ellipse cx="${x}" cy="${y - h}" rx="${r * 0.8}" ry="${r * 0.4}" fill="${C.deck}" stroke="${INK}" stroke-width="3"/>`;
  };

  const world = () => {
    let s = `<rect x="-1200" y="-1200" width="${MW + 2400}" height="${MH + 2400}" fill="${C.out}"/>`;
    for (let i = 0; i < 190; i++)
      s += `<ellipse cx="${((i * 421) % (MW + 800)) - 400}" cy="${((i * 317 + i * i * 11) % (MH + 800)) - 400}" rx="${44 + (i % 4) * 12}" ry="${28 + (i % 4) * 8}" fill="${C.outside}" stroke="${INK}" stroke-width="3" opacity=".9"/>`;
    s += `<polygon points="${pts(S.outline)}" fill="${C.ground}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
    s += `<polygon points="${pts(S.outline)}" fill="url(#speck)" opacity=".5"/>`;
    for (const w of S.water ?? []) {
      s += w.deep
        ? `<polygon points="${pts(w.poly)}" fill="${C.deep}" stroke="${C.shore}" stroke-width="10" stroke-linejoin="round"/><polygon points="${pts(w.poly)}" fill="none" stroke="${INK}" stroke-width="3"/>`
        : `<polygon points="${pts(w.poly)}" fill="${C.shallow}" opacity=".3" stroke="${C.shore}" stroke-width="4" stroke-linejoin="round"/>`;
    }
    for (const z of S.zones ?? [])
      s += `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="${z.fill}" stroke="${z.edge}" stroke-width="5"/>`;
    for (const t of S.tunnels ?? []) {
      for (let i = 1; i < t.path.length; i++) {
        const a = /** @type {Pt} */ (t.path[i - 1]),
          b = /** @type {Pt} */ (t.path[i]);
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${C.seam}" stroke-width="${t.w + 10}" stroke-linecap="square"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${C.tunnel}" stroke-width="${t.w}" stroke-linecap="square" opacity=".95"/>`;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = (b[0] - a[0]) / d,
          ny = (b[1] - a[1]) / d;
        for (let k = 1; k * 120 < d; k++)
          s += `<line x1="${a[0] + nx * k * 120 + ny * 36}" y1="${a[1] + ny * k * 120 - nx * 36}" x2="${a[0] + nx * k * 120 - ny * 36}" y2="${a[1] + ny * k * 120 + nx * 36}" stroke="${C.seam}" stroke-width="10" opacity=".7"/>`;
      }
    }
    for (const p of (S.props ?? []).filter((q) => !q.layer)) s += prop(p.kind, p.p, p.r, 0);
    for (const b of (S.breakables ?? []).filter((q) => !q.layer))
      s += slab(b.r, 0, 60, C.deck, C.face, C.faceE);
    const maxL = Math.max(...S.shapes.map((x) => x.layer));
    for (let n = 1; n <= maxL; n++) {
      for (const sh of S.shapes.filter((x) => x.layer === n)) {
        const look = sh.look;
        s +=
          look === "bridge" || look === "wood"
            ? slab(sh.poly, n * STEP, 22, C.wood, C.woodFace, C.woodFace)
            : look === "mound"
              ? slab(sh.poly, n * STEP, STEP, C.mound ?? C.deck, C.face, C.faceE)
              : slab(sh.poly, n * STEP, STEP, layerTop(n), C.face, C.faceE);
      }
      for (const st of S.stairs.filter((q) => q.from === n - 1)) {
        const e0 = st.from * STEP;
        const x = st.r[0][0],
          y = st.r[0][1],
          w = st.r[1][0] - x,
          h = st.r[2][1] - y;
        for (let i = 0; i < 5; i++) {
          const yy = st.north ? y + (i * h) / 5 : y + h - ((i + 1) * h) / 5,
            ee = e0 + ((i + 1) * STEP) / 5;
          s += `<rect x="${x}" y="${yy - ee}" width="${w}" height="${h / 5}" fill="${i % 2 ? C.deck : C.lip}" stroke="${INK}" stroke-width="2"/>`;
        }
      }
      for (const p of (S.props ?? []).filter((q) => q.layer === n))
        s += prop(p.kind, p.p, p.r, n * STEP);
      for (const b of (S.breakables ?? []).filter((q) => q.layer === n))
        s += slab(b.r, n * STEP, 60, C.deck, C.face, C.faceE);
    }
    for (const l of S.lifts ?? []) {
      const [x, y] = /** @type {Pt} */ (l.r[0]);
      s += `<rect x="${x}" y="${y}" width="120" height="120" fill="#222" stroke="${C.brass}" stroke-width="6"/><path d="M${x + 30},${y + 80} l30,-40 l30,40 M${x + 30},${y + 50} l30,-40 l30,40" stroke="${C.brass}" stroke-width="7" fill="none"/>`;
    }
    for (const g of S.gates ?? [])
      s += `<rect x="${g.p[0] - 12}" y="${g.p[1] - 60}" width="24" height="120" fill="${C.wood}" stroke="${INK}" stroke-width="4"/>`;
    for (const o of S.overhangs ?? []) s += slab(o.r, 80, 12, C.roof, C.roofFace, C.roofFace);
    for (const l of S.levers ?? []) {
      const lv = lift(l.p, l.layer * STEP);
      s += `<circle cx="${lv[0]}" cy="${lv[1]}" r="16" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
    }
    for (const o of S.objectives) {
      const [x, y] = lift(o.p, (o.layer ?? 0) * STEP);
      if (o.kind === "altar")
        s += `<ellipse cx="${x + 10}" cy="${y + 24}" rx="80" ry="28" fill="#080b10" opacity=".35"/><ellipse cx="${x}" cy="${y}" rx="70" ry="28" fill="${C.faceE}" stroke="${INK}" stroke-width="5"/><rect x="${x - 44}" y="${y - 70}" width="88" height="70" fill="${C.face}" stroke="${INK}" stroke-width="5"/><ellipse cx="${x}" cy="${y - 70}" rx="44" ry="18" fill="${C.brass}" stroke="${INK}" stroke-width="5"/><circle cx="${x}" cy="${y - 92}" r="16" fill="#fff4cf" stroke="${INK}" stroke-width="3"/>`;
      else if (o.kind === "relic-spawn")
        s += `<ellipse cx="${x}" cy="${y}" rx="64" ry="26" fill="none" stroke="${C.brass}" stroke-width="6" stroke-dasharray="10 8"/><polygon points="${x},${y - 56} ${x + 20},${y - 30} ${x},${y - 6} ${x - 20},${y - 30}" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
      else
        s += `<ellipse cx="${x}" cy="${y}" rx="76" ry="30" fill="#e8e2d2" opacity=".25" stroke="${C.brass}" stroke-width="6"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 100}" stroke="${INK}" stroke-width="7"/><polygon points="${x},${y - 100} ${x + 50},${y - 82} ${x},${y - 64}" fill="${C.brass}" stroke="${INK}" stroke-width="4"/>`;
    }
    for (const side of /** @type {const} */ (["t1", "t2"])) {
      if (!S.shrines) break;
      const [x, y] = S.shrines[side];
      s += `<ellipse cx="${x + 8}" cy="${y + 20}" rx="70" ry="24" fill="#080b10" opacity=".35"/><ellipse cx="${x}" cy="${y}" rx="64" ry="26" fill="${C.shrine}" stroke="${C.brass}" stroke-width="7"/><rect x="${x - 22}" y="${y - 58}" width="44" height="58" fill="${C.shrine}" stroke="${INK}" stroke-width="4"/><ellipse cx="${x}" cy="${y - 58}" rx="22" ry="9" fill="#fff8e0" stroke="${INK}" stroke-width="4"/>`;
      const [gx, gy] = S.ghosts?.[side] ?? [-999, -999];
      s += `<circle cx="${gx}" cy="${gy}" r="34" fill="none" stroke="${C.ghost}" stroke-width="6" stroke-dasharray="6 8"/><circle cx="${gx}" cy="${gy}" r="10" fill="${C.ghost}" opacity=".8"/>`;
    }
    for (const e of S.extras ?? []) {
      const [x, y] = lift(e.p, (e.layer ?? 0) * STEP);
      s +=
        e.kind === "storm-beacon"
          ? `<rect x="${x - 16}" y="${y - 90}" width="32" height="90" fill="${C.faceE}" stroke="${INK}" stroke-width="4"/><circle cx="${x}" cy="${y - 100}" r="22" fill="${C.torch}" stroke="${INK}" stroke-width="4"/>`
          : `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 100}" stroke="${INK}" stroke-width="8"/><polygon points="${x},${y - 100} ${x + 56},${y - 82} ${x},${y - 62}" fill="${C.shrine}" stroke="${INK}" stroke-width="4"/>`;
    }
    for (const l of S.lights)
      s += `<circle cx="${l.p[0]}" cy="${l.p[1]}" r="${l.r}" fill="${l.col ?? C.torch}" opacity=".18"/><circle cx="${l.p[0]}" cy="${l.p[1]}" r="9" fill="${l.col ?? C.torch}" stroke="${INK}" stroke-width="3"/>`;
    for (const a of S.atmo ?? [])
      for (let k = 0; k < 7; k++)
        s += `<ellipse cx="${a.cx + ((k * 61) % a.rx) - a.rx / 3}" cy="${a.cy + ((k * 37) % a.ry) - a.ry / 3}" rx="${a.rx * 0.55}" ry="${a.ry * 0.55}" fill="${a.col}" opacity="${a.op / 2}"/>`;
    s += `<rect width="${MW}" height="${MH}" fill="url(#sun)" opacity=".5"/>`;
    return s;
  };

  const defs = `<defs>
<style>.n{font:bold 34px 'DejaVu Sans',sans-serif;fill:#fff3e0;paint-order:stroke;stroke:#0b0f14;stroke-width:8px}.t{font:bold 54px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:10px}</style>
<pattern id="speck" width="400" height="400" patternUnits="userSpaceOnUse"><ellipse cx="90" cy="100" rx="70" ry="22" fill="${C.speck1}" opacity=".5"/><ellipse cx="290" cy="250" rx="90" ry="26" fill="${C.speck2}" opacity=".35"/><ellipse cx="160" cy="340" rx="50" ry="16" fill="${C.speck1}" opacity=".5"/></pattern>
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
  /** @type {(p: Pt, col: string, e: number) => string} */
  const bodyAt = (p, col, e) => {
    const [x, y] = lift(p, e);
    return `<ellipse cx="${x + 10}" cy="${y + 26}" rx="30" ry="12" fill="#080b10" opacity=".35"/><circle cx="${x}" cy="${y}" r="30" fill="${col}" stroke="#eaf4ff" stroke-width="5"/>`;
  };
  const name = `3075-${S.id}`;

  // ---- the plan
  {
    let a = world();
    const col = { t1: C.friend, t2: C.foe };
    for (const k of /** @type {const} */ (["t1", "t2"])) {
      S.routes[k].forEach(([, r], i) => {
        a += `<polyline points="${pts(path(r))}" fill="none" stroke="${col[k]}" stroke-width="7" stroke-dasharray="${i === 2 ? "8 14" : "26 16"}" opacity=".85"/>`;
      });
      for (const p of S.spawns[k]) a += bodyAt(p, col[k], 0);
      if (S.shrineCentre)
        a += `<polyline points="${pts(path(S.shrineCentre[k]))}" fill="none" stroke="${C.brass}" stroke-width="6" stroke-dasharray="3 12" opacity=".9"/>`;
    }
    a +=
      tag("T1", [S.spawns.t1[0][0] - 20, S.spawns.t1[0][1] - 50], 44) +
      tag("T2", [S.spawns.t2[0][0] - 40, S.spawns.t2[0][1] - 50], 44);
    for (const o of S.objectives)
      a += tag(o.label ?? o.id, [o.p[0] - 60, o.p[1] + 64 - (o.layer ?? 0) * STEP], 28);
    for (const k of /** @type {const} */ (["t1", "t2"])) {
      if (!S.shrines) break;
      const sh = S.shrines[k];
      a += tag(`shrine ${k === "t1" ? "1" : "2"}`, [sh[0] - 60, sh[1] + 62], 28);
      const g = S.ghosts?.[k];
      if (g) a += tag("ghost-spawn", [g[0] - 70, g[1] + 62], 24);
    }
    for (const e of S.extras ?? [])
      a += tag(e.kind, [e.p[0] - 60, e.p[1] + 50 - (e.layer ?? 0) * STEP], 24);
    for (const sh of S.shapes)
      a += tag(sh.label ?? sh.id, [cen(sh.poly)[0] - 80, cen(sh.poly)[1] - sh.layer * STEP], 26);
    for (const t of S.tunnels ?? [])
      a += tag(t.label, [(t.path[0]?.[0] ?? 0) + 40, (t.path[0]?.[1] ?? 0) - 50], 26);
    for (const l of S.levers ?? [])
      a += tag(l.label, [l.p[0] - 80, l.p[1] - l.layer * STEP - 28], 24);
    for (const g of S.gates ?? []) a += tag(g.label, [g.p[0] - 30, g.p[1] + 90], 24);
    for (const b of S.breakables ?? [])
      a += tag(b.label, [b.r[0][0] - 20, b.r[2][1] + 40 - (b.layer ?? 0) * STEP], 24);
    for (const w of S.water ?? []) if (w.label && w.at) a += tag(w.label, w.at, 26);
    for (const z of S.zones ?? []) a += tag(z.kind, [z.cx - 50, z.cy + z.ry + 40], 26);
    for (const o of S.atmo ?? []) a += tag(o.label, [o.cx - o.rx / 2, o.cy + o.ry + 30], 24);
    for (const o of S.overhangs ?? [])
      if (o.label) a += tag(o.label, [o.r[0][0], o.r[0][1] - 100], 24);
    for (const l of S.lifts ?? []) a += tag("timer lift", [l.r[0][0] - 20, l.r[0][1] - 20], 24);
    for (const d of S.drops ?? []) a += tag("drop", [d.at[0] - 30, d.at[1] - d.e * STEP + 60], 26);
    a += S.decorate ? S.decorate({ tag }) : "";
    a += tag(S.planNote, [20, MH - 20], 30);
    render(svgOf(0, 0, MW, MH, 800, a), `${name}-plan`, 800);
  }

  // ---- layer sheets
  {
    const maxL = Math.max(...S.shapes.map((x) => x.layer));
    for (let n = 0; n <= maxL; n++) {
      let a = `<rect width="${MW}" height="${MH}" fill="${C.out}"/><polygon points="${pts(S.outline)}" fill="#161d28" stroke="#35425a" stroke-width="6"/>`;
      if (n === 0) {
        a += `<polygon points="${pts(S.outline)}" fill="${C.ground}" stroke="${INK}" stroke-width="6" opacity=".92"/>`;
        for (const w of S.water ?? [])
          a += `<polygon points="${pts(w.poly)}" fill="${w.deep ? C.deep : C.shallow}" opacity="${w.deep ? 1 : 0.4}"/>`;
        for (const t of S.tunnels ?? []) {
          a += `<polyline points="${pts(t.path)}" fill="none" stroke="${C.tunnel}" stroke-width="${t.w}" stroke-linecap="square"/>`;
          a += tag(t.label, [(t.path[0]?.[0] ?? 0) + 40, (t.path[0]?.[1] ?? 0) - 50], 28);
        }
      } else {
        for (const sh of S.shapes.filter((x) => x.layer === n)) {
          a += `<polygon points="${pts(sh.poly)}" fill="${layerTop(n)}" stroke="${INK}" stroke-width="6" opacity=".92"/>`;
          const c = cen(sh.poly);
          a += tag(sh.label ?? sh.id, [c[0] - 90, c[1]], 28);
        }
        for (const st of S.stairs.filter((x) => x.from === n - 1 || x.from === n))
          a += `<polygon points="${pts(st.r)}" fill="${C.lip}" stroke="${INK}" stroke-width="5" opacity="${st.from === n ? 0.5 : 0.95}"/>${tag(st.id, [st.r[0][0] - 20, st.r[0][1] - 14], 24)}`;
      }
      a += `<text x="40" y="${MH - 40}" class="t">${S.layerTitles[n] ?? `L${n}`}</text>`;
      render(svgOf(0, 0, MW, MH, 800, a), `${name}-layer-${n}`, 800);
    }
  }

  // ---- spawn frames (the default camera, 1956x1100, centred on the team)
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    const [x, y] = cen(S.spawns[k]);
    const a =
      world() + S.spawns[k].map((p) => bodyAt(p, k === "t1" ? C.friend : C.foe, 0)).join("");
    render(
      svgOf(x - VW / 2, y - VH / 2, VW, VH, 800, a),
      `${name}-spawn-team${k === "t1" ? 1 : 2}`,
      800,
    );
  }

  // ---- the numbers the .md quotes
  const walk = (/** @type {Wp[]} */ r) => len(path(r)) / SPEED;
  console.log(
    "bounds M u²",
    ((MW * MH) / 1e6).toFixed(2),
    "short",
    Math.min(MW, MH),
    "long",
    Math.max(MW, MH),
    "ground fill %",
    Math.round((area(S.outline) / (MW * MH)) * 100),
  );
  for (const n of new Set(S.shapes.map((x) => x.layer)))
    console.log(
      `L${n} area k u²`,
      S.shapes
        .filter((x) => x.layer === n)
        .map((x) => Math.round(area(x.poly) / 1000))
        .join(" / "),
    );
  for (const k of /** @type {const} */ (["t1", "t2"])) {
    for (const [n, r] of S.routes[k])
      console.log(k, "centre:", n, Math.round(len(path(r))), "u", walk(r).toFixed(1), "s");
    for (const [n, r] of S.toShrine?.[k] ?? [])
      console.log(
        k === "t1" ? "T2 to shrine 1:" : "T1 to shrine 2:",
        n,
        Math.round(len(path(r))),
        "u",
        walk(r).toFixed(1),
        "s",
      );
    if (S.shrineCentre)
      console.log(
        "shrine",
        k === "t1" ? 1 : 2,
        "to centre",
        Math.round(len(path(S.shrineCentre[k]))),
        "u",
        walk(S.shrineCentre[k]).toFixed(1),
        "s",
      );
  }
  for (const w of S.objWalks) {
    w.t1.forEach(([n, r1], i) => {
      const r2 = /** @type {[string, Wp[]]} */ (w.t2[i]);
      const a = walk(r1),
        b = walk(r2[1]);
      console.log(
        w.obj,
        w.what,
        n,
        a.toFixed(1),
        "/",
        b.toFixed(1),
        "s",
        Math.round((Math.abs(a - b) / Math.max(a, b)) * 100),
        "%",
      );
    });
  }
  console.log(
    "seats",
    S.spawns.t1.length,
    S.spawns.t2.length,
    "shapes",
    S.shapes.length,
    "stairs",
    S.stairs.length,
  );
}
