// Draws a study of the primary profession glyph inside the player body
// (#1037). It is a design reference for that decision, not a game asset.
//
//   node scripts/assets/profession-body-study.mjs
//
// Writes docs/art/profession-body-study.svg and prints, per weapon, how close
// the weapon mark (casing included) comes to the body's centre. Reads the
// profession glyphs from apps/web/public/icons/profession/ and the weapon
// marks from apps/web/src/render/weapon-mark-geometry.ts, so the study draws
// the very shapes the arena draws. Body, edge, rim and weapon drawing mirror
// scripts/assets/player-mark.mjs.
//
// Three options, each at the four camera zooms (view height 640 / 860 / 1100
// / 1400 world units on a 1080 px canvas), at true size and at 4x:
//   A: 9 world units, upright, `edge`, under the weapon mark.
//   B: 13 world units, upright, `edge` at 60 %, under the weapon mark.
//   C: a fixed 11 screen px at every zoom, upright, `edge`, under the mark.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconDir = join(root, "apps", "web", "public", "icons", "profession");
const outFile = join(root, "docs", "art", "profession-body-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  friend: "#59c2ff",
  foe: "#ff7b72",
  dead: "#4a5464",
  edge: "#0b0f14",
};

/** Body radius in world units; also the collision radius. */
const R = 14;

/** The camera steps of apps/web/src/render/camera-rig.ts, on a 1080 px tall canvas. */
const ZOOMS = /** @type {const} */ ([
  ["Close", 640],
  ["Near", 860],
  ["Default", 1100],
  ["Wide", 1400],
]).map(([name, height]) => ({ name, zoom: 1080 / height }));
const DEFAULT_ZOOM = 1080 / 1100;

/** @typedef {keyof typeof WEAPON_MARK_GEOMETRY} Family */
/** @typedef {"A" | "B" | "C"} Option */
/** @typedef {"shield" | "focus" | "none"} Offhand */

const PROFESSIONS = /** @type {const} */ ([
  ["warrior", "W"],
  ["ranger", "R"],
  ["monk", "Mo"],
  ["necromancer", "N"],
  ["mesmer", "Me"],
  ["elementalist", "E"],
  ["assassin", "A"],
  ["ritualist", "Rt"],
  ["paragon", "P"],
  ["dervish", "D"],
]);

/** Only one-handed weapons leave the left hand free for a shield or a focus. */
const ONE_HANDED = new Set(["sword", "axe", "spear", "wand"]);

const deg = (/** @type {number} */ d) => (d * Math.PI) / 180;

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------
// The clearance check: how near the centre does each weapon mark come?

/**
 * Distance from the origin to the segment a-b.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
function segDist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

/** @param {readonly { x: number, y: number }[]} poly */
function containsOrigin(poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The nearest the painted mark comes to the centre: distance to each
 * polyline minus its casing half-width (strokes 4 px -> 2, fill outlines
 * 2 px -> 1, strings 3 px -> 1.5). A lower bound: butt caps paint less than
 * the round-capped band this assumes.
 * @param {Family} family
 */
function clearance(family) {
  const g = WEAPON_MARK_GEOMETRY[family];
  let min = Infinity;
  /** @param {readonly { x: number, y: number }[]} line @param {number} half @param {boolean} closed */
  const visit = (line, half, closed) => {
    const n = closed ? line.length : line.length - 1;
    for (let i = 0; i < n; i++) {
      const a = line[i];
      const b = line[(i + 1) % line.length];
      if (a !== undefined && b !== undefined) min = Math.min(min, segDist(a, b) - half);
    }
    if (line.length === 1 && line[0] !== undefined)
      min = Math.min(min, Math.hypot(line[0].x, line[0].y) - half);
  };
  for (const s of g.strokes) visit(s, 2, false);
  for (const p of g.fills) {
    if (containsOrigin(p)) min = Math.min(min, 0);
    visit(p, 1, true);
  }
  for (const s of g.strings) visit(s, 1.5, false);
  return min;
}

const CLAIM = 4.8;
const families = /** @type {Family[]} */ (Object.keys(WEAPON_MARK_GEOMETRY));
console.log(`weapon mark clearance from the centre (casing included), claim: >= ${String(CLAIM)}`);
for (const fam of families) {
  const c = clearance(fam);
  console.log(
    `  ${fam.padEnd(12)} ${c.toFixed(2).padStart(6)}  ${c >= CLAIM - 1e-9 ? "ok" : "BELOW"}`,
  );
}
const worst = Math.min(...families.map(clearance));
console.log(
  `  minimum      ${worst.toFixed(2).padStart(6)}  (A's glyph square: half-side 4.5, half-diagonal ${(4.5 * Math.SQRT2).toFixed(2)})`,
);

// ---------------------------------------------------------------------------
// Drawing.

/** @param {number} x @param {number} y @param {number} a @param {number} d @returns {[number, number]} */
const polar = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];

const OFF_SIDE = -1;
const SHIELD_FROM = deg(45);
const SHIELD_TO = deg(105);
const SHIELD_AT = R + 3.5;
const FOCUS_ANGLE = deg(75);
const FOCUS_AT = R + 3.5;
const FOCUS_R = 1.75;

/** The off-hand mark, as player-mark.mjs draws it. @param {number} a @param {Offhand} offhand */
function offhandMark(a, offhand) {
  if (offhand === "none") return "";
  const side = OFF_SIDE;
  let out = "";
  if (offhand === "shield") {
    const [x1, y1] = polar(0, 0, a + side * SHIELD_FROM, SHIELD_AT);
    const [x2, y2] = polar(0, 0, a + side * SHIELD_TO, SHIELD_AT);
    const d = `M${f(x1)} ${f(y1)}A${f(SHIELD_AT)} ${f(SHIELD_AT)} 0 0 0 ${f(x2)} ${f(y2)}`;
    for (const [colour, w] of /** @type {const} */ ([
      [C.edge, 5],
      [C.ink, 3],
    ]))
      out += `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${String(w)}"/>`;
    return out;
  }
  const [fx, fy] = polar(0, 0, a + side * FOCUS_ANGLE, FOCUS_AT);
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 3],
    [C.ink, 1.5],
  ]))
    out += `<circle cx="${f(fx)}" cy="${f(fy)}" r="${f(FOCUS_R)}" fill="none" stroke="${colour}" stroke-width="${String(w)}"/>`;
  return out;
}

/** @param {[number, number][]} p */
const pts = (p) => p.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");

/**
 * The weapon mark at the origin facing `a`: 4 px `edge` casing under a 2 px
 * `ink` core, as player-mark.mjs draws it.
 * @param {number} a
 * @param {Family} family
 */
function weaponLine(a, family) {
  const g = WEAPON_MARK_GEOMETRY[family];
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  /** @param {readonly { x: number, y: number }[]} line @returns {[number, number][]} */
  const place = (line) => line.map((q) => [q.x * cos - q.y * sin, q.x * sin + q.y * cos]);
  const strokes = g.strokes.map(place);
  const fills = g.fills.map(place);
  const strings = g.strings.map(place);
  let out = "";
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ])) {
    const s = `stroke="${colour}" stroke-linecap="butt" stroke-linejoin="miter"`;
    for (const p of strokes)
      out += `<polyline points="${pts(p)}" fill="none" ${s} stroke-width="${String(w)}"/>`;
    for (const p of fills)
      out += `<polygon points="${pts(p)}" fill="${colour}" ${s} stroke-width="${String(w - 2)}"/>`;
  }
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 3],
    [C.ink, 1],
  ]))
    for (const p of strings)
      out += `<polyline points="${pts(p)}" fill="none" stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="butt" stroke-linejoin="miter"/>`;
  return out;
}

/** The glyphs' inner SVG, read once. */
const GLYPH_SRC = Object.fromEntries(
  PROFESSIONS.map(([name]) => {
    const src = readFileSync(join(iconDir, `${name}.svg`), "utf8");
    return [name, src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")];
  }),
);

/**
 * A glyph `size` world units square, centred on the origin, upright, every
 * fill and stroke in `colour`. Cut-outs are evenodd holes, so the body shows
 * through them.
 * @param {string} name
 * @param {number} size
 * @param {string} colour
 * @param {number} opacity
 */
function glyph(name, size, colour, opacity) {
  const inner = (GLYPH_SRC[name] ?? "").replace(/#[0-9a-f]{6}/g, colour);
  const op = opacity < 1 ? ` opacity="${f(opacity)}"` : "";
  return `<g${op} transform="scale(${f(size / 24)}) translate(-12,-12)">${inner}</g>`;
}

/**
 * The glyph's size and opacity for an option at a camera zoom.
 * @param {Option} option
 * @param {number} zoom
 */
function glyphStyle(option, zoom) {
  if (option === "A") return { size: 9, opacity: 1 };
  if (option === "B") return { size: 13, opacity: 0.6 };
  return { size: 11 / zoom, opacity: 1 };
}

/**
 * One player mark at the origin, in world units.
 * @param {Option} option
 * @param {number} zoom the camera zoom, for option C's fixed screen size
 * @param {{ team: string, prof: string, family: Family, facing: number, self?: boolean, offhand?: Offhand, dead?: boolean }} p
 */
function body(option, zoom, p) {
  const g = glyphStyle(option, zoom);
  if (p.dead === true)
    return (
      `<circle r="${f(R)}" fill="none" stroke="${C.dead}" stroke-width="2"/>` +
      glyph(p.prof, g.size, C.dead, 1)
    );
  let out = `<circle r="${f(R)}" fill="${p.team}"/>`;
  out += `<circle r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  if (p.self === true)
    out += `<circle r="${f(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  out += glyph(p.prof, g.size, C.edge, g.opacity);
  out += offhandMark(p.facing, ONE_HANDED.has(p.family) ? (p.offhand ?? "none") : "none");
  out += weaponLine(p.facing, p.family);
  return out;
}

/**
 * A body drawn at screen (x, y), `scale` px per world unit.
 * @param {number} x @param {number} y @param {number} scale
 * @param {Option} option @param {number} zoom
 * @param {Parameters<typeof body>[2]} p
 */
const at = (x, y, scale, option, zoom, p) =>
  `<g transform="translate(${f(x)},${f(y)}) scale(${f(scale)})">${body(option, zoom, p)}</g>`;

/**
 * @param {number} x @param {number} y @param {string} s
 * @param {{ size?: number, colour?: string, anchor?: string }} [o]
 */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${o.colour ?? C.ink}" font-family="monospace" font-size="${f(o.size ?? 10)}" text-anchor="${o.anchor ?? "start"}">${s}</text>`;

// ---------------------------------------------------------------------------
// The sheet.

/** The ten professions, each with a different weapon and facing. */
const LINEUP = /** @type {const} */ ([
  ["warrior", "hammer", 0],
  ["ranger", "longbow", -30],
  ["monk", "staff", 90],
  ["necromancer", "scythe", 150],
  ["mesmer", "sword", -90],
  ["elementalist", "wand", 45],
  ["assassin", "daggers", 180],
  ["ritualist", "spear", -135],
  ["paragon", "hammer", 120],
  ["dervish", "scythe", -60],
]).map(([prof, family, facing]) => ({
  prof,
  family: /** @type {Family} */ (family),
  facing: deg(facing),
}));

/** The 4v4 clump, in world units around its centre; bodies touch (2R apart). */
const CLUMP = (() => {
  const d = 2 * R;
  const h = d * Math.sin(Math.PI / 3);
  /** @type {{ x: number, y: number, team: string, prof: string, family: Family, facing: number, self?: boolean, offhand?: Offhand }[]} */
  const out = [];
  const friendKit = /** @type {const} */ ([
    ["monk", "shortbow", 10, "none"],
    ["warrior", "axe", -20, "shield"],
    ["elementalist", "flatbow", 30, "none"],
    ["necromancer", "recurve-bow", 0, "none"],
  ]);
  const foeKit = /** @type {const} */ ([
    ["dervish", "hornbow", 170, "none"],
    ["assassin", "unarmed", 200, "none"],
    ["mesmer", "spear", 180, "focus"],
    ["paragon", "staff", 160, "none"],
  ]);
  // Two staggered rows, friends on the left, foes on the right, in contact.
  const slots = [
    [-1.5, 0],
    [-0.5, 0],
    [-1, 1],
    [0, 1],
    [0.5, 0],
    [1.5, 0],
    [1, 1],
    [2, 1],
  ];
  slots.forEach(([sx, sy], i) => {
    const kit = i < 4 ? friendKit[i] : foeKit[i - 4];
    if (kit === undefined || sx === undefined || sy === undefined) return;
    out.push({
      x: sx * d - d / 4,
      y: (sy - 0.5) * h,
      team: i < 4 ? C.friend : C.foe,
      prof: kit[0],
      family: kit[1],
      facing: deg(kit[2]),
      offhand: kit[3],
      self: i === 1,
    });
  });
  return out;
})();

const OPTIONS = /** @type {const} */ ([
  [
    "A",
    "A: 9 u, edge, under weapon",
    "Same world size at every zoom.",
    "Weapons stay outside r 4.8.",
  ],
  [
    "B",
    "B: 13 u, edge 60%, under",
    "Same world size at every zoom.",
    "Hafts cross the glyph's edge.",
  ],
  ["C", "C: fixed 11 px on screen", "World size 11 / zoom:", "bigger vs the body at Wide."],
]);

const PAD = 20;
const CW = 920;
const W = PAD + OPTIONS.length * CW;
const BIG = 4 * DEFAULT_ZOOM;
const BIG_COL = 176;
const BIG_ROW = 196;

// Vertical bands within a column.
const Y_TITLE = 64;
const Y_ZOOM = 150;
const Y_ROW = 280;
const Y_BIG = 460;
const Y_CLUMP = Y_BIG + BIG_ROW + 150;
const H = Y_CLUMP + 160;

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
for (let gx = 0; gx < W; gx += 32)
  parts.push(`<line x1="${f(gx)}" y1="0" x2="${f(gx)}" y2="${f(H)}" stroke="${C.grid}"/>`);
for (let gy = 0; gy < H; gy += 32)
  parts.push(`<line x1="0" y1="${f(gy)}" x2="${f(W)}" y2="${f(gy)}" stroke="${C.grid}"/>`);

parts.push(
  text(
    PAD,
    24,
    "#1037: primary profession glyph inside the body. Upright, under the weapon mark. 1080 px tall canvas; true size = 1 world unit is zoom px.",
    { size: 13 },
  ),
);

OPTIONS.forEach(([option, title, note1, note2], col) => {
  const x0 = PAD + col * CW;
  if (col > 0)
    parts.push(
      `<line x1="${f(x0 - 10)}" y1="40" x2="${f(x0 - 10)}" y2="${f(H - 10)}" stroke="${C.inkDim}"/>`,
    );
  parts.push(
    text(x0, Y_TITLE, title, { size: 15 }),
    text(x0, Y_TITLE + 18, `${note1} ${note2}`, { colour: C.inkDim, size: 11 }),
  );

  // Band 1: three bodies at each camera zoom, true size.
  parts.push(text(x0, Y_ZOOM - 46, "zooms, true size", { colour: C.inkDim }));
  const sample = [LINEUP[0], LINEUP[3], LINEUP[8]];
  let gx = x0;
  for (const { name, zoom } of ZOOMS) {
    const pitch = 46 * zoom;
    parts.push(text(gx, Y_ZOOM + 46, `${name} ${zoom.toFixed(2)}`, { size: 10 }));
    sample.forEach((s, i) => {
      if (s === undefined) return;
      parts.push(
        at(gx + pitch / 2 + i * pitch, Y_ZOOM, zoom, option, zoom, { team: C.friend, ...s }),
      );
    });
    gx += pitch * 3 + 34;
  }

  // Band 2: all ten, Default zoom, true size.
  parts.push(text(x0, Y_ROW - 46, "Default, true size, friend", { colour: C.inkDim }));
  LINEUP.forEach((s, i) => {
    const x = x0 + 30 + i * 60;
    parts.push(at(x, Y_ROW, DEFAULT_ZOOM, option, DEFAULT_ZOOM, { team: C.friend, ...s }));
    const abbr = PROFESSIONS.find(([n]) => n === s.prof)?.[1] ?? "?";
    parts.push(text(x, Y_ROW + 36, abbr, { anchor: "middle", size: 9 }));
    parts.push(
      text(x, Y_ROW + 47, s.family.slice(0, 7), { anchor: "middle", size: 9, colour: C.inkDim }),
    );
  });
  // A corpse beside the row, true size.
  const cx = x0 + 30 + 10 * 60 + 20;
  parts.push(
    at(cx, Y_ROW, DEFAULT_ZOOM, option, DEFAULT_ZOOM, {
      team: C.friend,
      prof: "monk",
      family: "staff",
      facing: 0,
      dead: true,
    }),
  );
  parts.push(text(cx, Y_ROW + 36, "dead Mo", { anchor: "middle", size: 9 }));

  // Band 3: the same at 4x of Default.
  parts.push(text(x0, Y_BIG - 100, "Default, 4×", { colour: C.inkDim }));
  LINEUP.forEach((s, i) => {
    const x = x0 + BIG_COL / 2 + (i % 5) * BIG_COL;
    const y = Y_BIG + Math.floor(i / 5) * BIG_ROW;
    parts.push(at(x, y, BIG, option, DEFAULT_ZOOM, { team: C.friend, ...s }));
    parts.push(text(x, y + 98, `${s.prof} / ${s.family}`, { anchor: "middle", size: 10 }));
  });

  // Band 4: a 4v4 clump at Default, true size, then a corpse at 4x.
  parts.push(
    text(x0, Y_CLUMP - 14, "4v4 clump, Default, true size (you: rim)", { colour: C.inkDim }),
  );
  const clx = x0 + 120;
  const cly = Y_CLUMP + 75;
  for (const b of CLUMP)
    parts.push(
      at(clx + b.x * DEFAULT_ZOOM, cly + b.y * DEFAULT_ZOOM, DEFAULT_ZOOM, option, DEFAULT_ZOOM, b),
    );
  // The same clump at 2x, to see what the eye is missing at 1x.
  parts.push(text(x0 + 300, Y_CLUMP - 14, "same, 2×", { colour: C.inkDim }));
  const c2x = x0 + 300 + 120;
  for (const b of CLUMP)
    parts.push(
      at(
        c2x + b.x * 2 * DEFAULT_ZOOM,
        cly + b.y * 2 * DEFAULT_ZOOM,
        2 * DEFAULT_ZOOM,
        option,
        DEFAULT_ZOOM,
        b,
      ),
    );
  const dx = x0 + 300 + 120 + 270;
  parts.push(text(dx, Y_CLUMP - 14, "dead, 4×", { colour: C.inkDim, anchor: "middle" }));
  parts.push(
    at(dx, cly, BIG, option, DEFAULT_ZOOM, {
      team: C.friend,
      prof: "necromancer",
      family: "staff",
      facing: 0,
      dead: true,
    }),
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes, ${f(W)} x ${f(H)})`);
