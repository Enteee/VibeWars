// Draws a study of a guild cape on the top-down body (#1410, #481). It is a
// design reference for that decision, not a game asset. Decided: variant B (#1410).
//
//   node scripts/assets/cape-study.mjs
//
// Writes docs/art/cape-study.svg. Three variants, each shown on
//   1. a standing body at the arena's Default zoom, both teams' colours, facing
//      right and facing up, sword and shield on (the marks the cape must not hide);
//   2. the menu character figure, at its true size and at 3x;
//   3. the cape designer: two colours from a fixed palette of eight, and one
//      emblem from a fixed set of eight.
// Weapon marks come from apps/web/src/render/weapon-mark-geometry.ts, so the
// study draws the very shapes the arena draws. Body, edge, rim and off-hand
// mirror scripts/assets/profession-body-study.mjs.
//
// Also writes docs/art/cape-mockup.png (needs inkscape): per variant one 4v4
// arena frame at 2x Default zoom, with the menu figure inset, to read on a phone.
//
//   A: a crescent behind the body, opposite its facing, outside the rim.
//   B: a short pennant trailing behind, with a swallowtail hem.
//   C: a ring segment laid on the rim at the back, inside the disc.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "cape-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  friend: "#59c2ff",
  foe: "#ff7b72",
  edge: "#0b0f14",
};

/** Body radius in world units; also the collision radius. */
const R = 14;
/** The arena's Default zoom: 1080 px canvas over a 1100 unit view. */
const ZOOM = 1080 / 1100;

/**
 * The cape palette: eight colours that stay apart from both team colours
 * (cyan-blue, coral) and from each other under the common colour-vision
 * deficiencies, so a cape never reads as a team.
 */
/** @type {[string, string][]} */
const PALETTE = [
  ["gold", "#e6c04a"],
  ["violet", "#a078e0"],
  ["white", "#f2f2f2"],
  ["black", "#23272e"],
  ["lime", "#9bd445"],
  ["orange", "#f0963c"],
  ["teal", "#2fb8a0"],
  ["pink", "#e86fb4"],
];
const hue = (/** @type {string} */ name) => PALETTE.find(([n]) => n === name)?.[1] ?? C.ink;

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);
const deg = (/** @type {number} */ d) => (d * Math.PI) / 180;
/** @param {number} x @param {number} y @param {number} a @param {number} d @returns {[number, number]} */
const polar = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];
/** @param {[number, number][]} p */
const pts = (p) => p.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");

// ---------------------------------------------------------------------------
// Emblems: eight simple geometric shapes in a 10 unit box centred on 0,0,
// pointing up. Drawn here, not GW1's.

const EMBLEMS = /** @type {const} */ ({
  disc: '<circle r="4"/>',
  bar: '<rect x="-1.6" y="-4.6" width="3.2" height="9.2"/>',
  chevron: '<polygon points="-4.6,2.4 0,-3 4.6,2.4 4.6,4.6 0,-0.6 -4.6,4.6"/>',
  diamond: '<polygon points="0,-4.8 4,0 0,4.8 -4,0"/>',
  triangle: '<polygon points="0,-4.6 4.6,3.6 -4.6,3.6"/>',
  cross:
    '<polygon points="-1.6,-4.6 1.6,-4.6 1.6,-1.6 4.6,-1.6 4.6,1.6 1.6,1.6 1.6,4.6 -1.6,4.6 -1.6,1.6 -4.6,1.6 -4.6,-1.6 -1.6,-1.6"/>',
  ring: '<circle r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>',
  split: '<path d="M0-4.6A4.6 4.6 0 0 1 0 4.6Z"/>',
});

/**
 * One emblem at (x, y), `size` units across, turned by `rot` radians.
 * @param {keyof typeof EMBLEMS} id @param {number} x @param {number} y
 * @param {number} size @param {string} colour @param {number} [rot]
 */
const emblem = (id, x, y, size, colour, rot = 0) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f((rot * 180) / Math.PI)}) scale(${f(size / 10)})" fill="${colour}" style="color:${colour}">${EMBLEMS[id]}</g>`;

// ---------------------------------------------------------------------------
// The body, as the arena draws it.

/** @typedef {{ main: string, trim: string, emblem: keyof typeof EMBLEMS }} Cape */
/** @typedef {"A" | "B" | "C"} Variant */

const SHIELD_FROM = deg(45);
const SHIELD_TO = deg(105);
const SHIELD_AT = R + 3.5;

/** The shield arc on the off-hand side, as the arena draws it. @param {number} a */
function shield(a) {
  const [x1, y1] = polar(0, 0, a - SHIELD_FROM, SHIELD_AT);
  const [x2, y2] = polar(0, 0, a - SHIELD_TO, SHIELD_AT);
  const d = `M${f(x1)} ${f(y1)}A${f(SHIELD_AT)} ${f(SHIELD_AT)} 0 0 0 ${f(x2)} ${f(y2)}`;
  /** @type {[string, number][]} */
  const rings = [
    [C.edge, 5],
    [C.ink, 3],
  ];
  return rings
    .map(([c, w]) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${String(w)}"/>`)
    .join("");
}

/** The sword mark: 4 px `edge` casing under a 2 px `ink` core. @param {number} a */
function sword(a) {
  const g = WEAPON_MARK_GEOMETRY.sword;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  /** @param {readonly { x: number, y: number }[]} line @returns {[number, number][]} */
  const place = (line) => line.map((q) => [q.x * cos - q.y * sin, q.x * sin + q.y * cos]);
  let out = "";
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ])) {
    const s = `stroke="${colour}" stroke-linecap="butt" stroke-linejoin="miter"`;
    for (const l of g.strokes)
      out += `<polyline points="${pts(place(l))}" fill="none" ${s} stroke-width="${String(w)}"/>`;
    for (const l of g.fills)
      out += `<polygon points="${pts(place(l))}" fill="${colour}" ${s} stroke-width="${String(w - 2)}"/>`;
  }
  return out;
}

/**
 * The cape drawn UNDER the disc (A and B): the body covers its root.
 * @param {Variant} v @param {Cape} cape @param {number} a facing
 * @param {number} emblemSize
 */
function capeUnder(v, cape, a, emblemSize) {
  const back = a + Math.PI;
  if (v === "A") {
    // A crescent: outer arc R+7 swept +-62 deg round the back, inner arc R+1.
    const span = deg(62);
    const [ox1, oy1] = polar(0, 0, back - span, R + 7);
    const [ox2, oy2] = polar(0, 0, back + span, R + 7);
    const [ix1, iy1] = polar(0, 0, back + span * 0.8, R + 1);
    const [ix2, iy2] = polar(0, 0, back - span * 0.8, R + 1);
    const d =
      `M${f(ox1)} ${f(oy1)}A${f(R + 7)} ${f(R + 7)} 0 0 1 ${f(ox2)} ${f(oy2)}` +
      `L${f(ix1)} ${f(iy1)}A${f(R + 1)} ${f(R + 1)} 0 0 0 ${f(ix2)} ${f(iy2)}Z`;
    const [ex, ey] = polar(0, 0, back, R + 4.2);
    return (
      `<path d="${d}" fill="${cape.main}" stroke="${C.edge}" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M${f(ox1)} ${f(oy1)}A${f(R + 7)} ${f(R + 7)} 0 0 1 ${f(ox2)} ${f(oy2)}" fill="none" stroke="${cape.trim}" stroke-width="1.2"/>` +
      (emblemSize > 0 ? emblem(cape.emblem, ex, ey, emblemSize, cape.trim, back + Math.PI / 2) : "")
    );
  }
  // B: a tab 17 long from the rim, 13 wide at the root, 9 at the hem, with a notch.
  const root = (/** @type {number} */ s) => {
    const [bx, by] = polar(0, 0, back, R - 2);
    const [px, py] = polar(bx, by, back + Math.PI / 2, s);
    return [px, py];
  };
  const hem = (/** @type {number} */ s) => {
    const [bx, by] = polar(0, 0, back, R + 17);
    const [px, py] = polar(bx, by, back + Math.PI / 2, s);
    return [px, py];
  };
  const [nx, ny] = polar(0, 0, back, R + 12.5);
  /** @type {[number, number][]} */
  const tab = [
    /** @type {[number, number]} */ (root(-6.5)),
    /** @type {[number, number]} */ (hem(-4.5)),
    [nx, ny],
    /** @type {[number, number]} */ (hem(4.5)),
    /** @type {[number, number]} */ (root(6.5)),
  ];
  const [ex, ey] = polar(0, 0, back, R + 5.5);
  const [h1x, h1y] = hem(-4.5);
  const [h2x, h2y] = hem(4.5);
  return (
    `<polygon points="${pts(tab)}" fill="${cape.main}" stroke="${C.edge}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polyline points="${pts([
      [h1x, h1y],
      [nx, ny],
      [h2x, h2y],
    ])}" fill="none" stroke="${cape.trim}" stroke-width="1.4" stroke-linejoin="round"/>` +
    (emblemSize > 0 ? emblem(cape.emblem, ex, ey, emblemSize, cape.trim, back + Math.PI / 2) : "")
  );
}

/**
 * The cape drawn OVER the disc (C): a ring segment inside the rim, behind.
 * @param {Cape} cape @param {number} a
 */
function capeOver(cape, a) {
  const back = a + Math.PI;
  const span = deg(64);
  const r = R - 3.6;
  const [x1, y1] = polar(0, 0, back - span, r);
  const [x2, y2] = polar(0, 0, back + span, r);
  const d = `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 0 1 ${f(x2)} ${f(y2)}`;
  return (
    `<path d="${d}" fill="none" stroke="${C.edge}" stroke-width="6.4" stroke-linecap="butt"/>` +
    `<path d="${d}" fill="none" stroke="${cape.main}" stroke-width="4.4" stroke-linecap="butt"/>` +
    `<path d="${d}" fill="none" stroke="${cape.trim}" stroke-width="1" stroke-linecap="butt" transform="rotate(0)"/>`
  );
}

/**
 * A body at (x, y), scaled, facing `a`, in team colour `team`.
 * @param {number} x @param {number} y @param {number} scale
 * @param {Variant | undefined} v @param {Cape | undefined} cape
 * @param {number} a @param {string} team @param {boolean} [self]
 * @param {number} [emblemSize]
 */
function body(x, y, scale, v, cape, a, team, self = false, emblemSize = 0) {
  const under =
    v !== undefined && cape !== undefined && v !== "C" ? capeUnder(v, cape, a, emblemSize) : "";
  const over = v === "C" && cape !== undefined ? capeOver(cape, a) : "";
  return (
    `<g transform="translate(${f(x)} ${f(y)}) scale(${f(scale)})">` +
    under +
    `<circle r="${String(R)}" fill="${team}"/>` +
    `<circle r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>` +
    (self ? `<circle r="${String(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>` : "") +
    over +
    shield(a) +
    sword(a) +
    `</g>`
  );
}

/** @param {number} x @param {number} y @param {string} s @param {{ size?: number, fill?: string, anchor?: string, bold?: boolean }} [o] */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${String(o.size ?? 13)}" fill="${o.fill ?? C.ink}"${o.bold === true ? ' font-weight="700"' : ""}${o.anchor === undefined ? "" : ` text-anchor="${o.anchor}"`}>${s}</text>`;

// ---------------------------------------------------------------------------
// The sheet.

/** @type {Record<Variant, { name: string, emblemArena: number, emblemMenu: number, sample: Cape }>} */
const VARIANTS = {
  A: {
    name: "A  Crescent behind",
    emblemArena: 0,
    emblemMenu: 5,
    sample: { main: hue("gold"), trim: hue("black"), emblem: "chevron" },
  },
  B: {
    name: "B  Trailing tab",
    emblemArena: 5,
    emblemMenu: 6,
    sample: { main: hue("violet"), trim: hue("white"), emblem: "diamond" },
  },
  C: {
    name: "C  Ring segment on the rim",
    emblemArena: 0,
    emblemMenu: 0,
    sample: { main: hue("lime"), trim: hue("black"), emblem: "ring" },
  },
};

const PAD = 24;
const COL = 700;
const W = PAD * 2 + 3 * COL;
const H = 1150;
/** @type {string[]} */
const parts = [`<rect width="${String(W)}" height="${String(H)}" fill="${C.bg}"/>`];

parts.push(
  text(PAD, 40, "Guild cape study (#1410): three variants, A / B / C", { size: 20, bold: true }),
);
parts.push(
  text(
    PAD,
    62,
    "Body 14 units at Default zoom (0.98 px/unit), sword and shield on, team colour kept: cyan = ally / you, coral = enemy.",
    { fill: C.inkDim },
  ),
);

/** @type {Variant[]} */
const ORDER = ["A", "B", "C"];
ORDER.forEach((v, i) => {
  const x0 = PAD + i * COL;
  const spec = VARIANTS[v];
  parts.push(
    `<rect x="${String(x0)}" y="84" width="${String(COL - 16)}" height="${String(H - 104)}" rx="6" fill="${C.panel}" stroke="${C.line}"/>`,
  );
  parts.push(text(x0 + 16, 112, spec.name, { size: 16, bold: true }));

  // 1. Arena scale: true size, then 4x so the shapes can be read.
  parts.push(text(x0 + 16, 146, "1  Arena, Default zoom (true size, then 3x)", { fill: C.inkDim }));
  /** @type {[number, string, string][]} */
  const rows = [
    [0, C.friend, "ally, right"],
    [-Math.PI / 2, C.friend, "ally, up"],
    [0, C.foe, "enemy, right"],
    [-Math.PI / 2, C.foe, "enemy, up"],
  ];
  rows.forEach(([a, team, label], k) => {
    const cx = x0 + 70 + k * 160;
    parts.push(body(cx, 190, ZOOM, v, spec.sample, a, team, false, spec.emblemArena));
    parts.push(body(cx, 300, 3 * ZOOM, v, spec.sample, a, team, false, spec.emblemArena));
    parts.push(text(cx, 405, label, { size: 10, fill: C.inkDim, anchor: "middle" }));
  });
  // The bare body beside, for comparison.
  parts.push(text(x0 + 16, 440, "none (today), you, right", { size: 10, fill: C.inkDim }));
  parts.push(body(x0 + 52, 480, ZOOM, undefined, undefined, 0, C.friend, true));
  parts.push(body(x0 + 52 + 82, 480, ZOOM, v, spec.sample, 0, C.friend, true, spec.emblemArena));
  parts.push(text(x0 + 52 + 82 + 28, 484, "← you, with the cape", { size: 10, fill: C.inkDim }));

  // A small clump: the cape in a fight, three each side.
  /** @type {[number, number, string][]} */
  const clump = [
    [330, 0, C.friend],
    [360, 40, C.friend],
    [330, 80, C.friend],
    [405, 10, C.foe],
    [425, 55, C.foe],
    [395, 90, C.foe],
  ];
  clump.forEach(([cx, cy, team], k) => {
    const a = team === C.friend ? 0 : Math.PI;
    parts.push(
      body(
        x0 + 420 + cx - 330,
        470 + cy - 30,
        1.8,
        v,
        VARIANTS[ORDER[(k + i) % 3] ?? "A"].sample,
        a,
        team,
        false,
        0,
      ),
    );
  });

  parts.push(`<g transform="translate(0 90)">`);
  // 2. The menu figure: 48 px box, body 14, at true size and 3x.
  parts.push(text(x0 + 16, 540, "2  Menu figure (true size, then 3x)", { fill: C.inkDim }));
  parts.push(
    `<rect x="${String(x0 + 16)}" y="556" width="48" height="48" fill="${C.bg}" stroke="${C.line}"/>`,
  );
  parts.push(body(x0 + 40, 580, 1, v, spec.sample, 0, C.friend, true, spec.emblemMenu));
  parts.push(
    `<rect x="${String(x0 + 90)}" y="556" width="144" height="144" fill="${C.bg}" stroke="${C.line}"/>`,
  );
  parts.push(body(x0 + 162, 628, 3, v, spec.sample, 0, C.friend, true, spec.emblemMenu));

  // 3. The designer.
  parts.push(text(x0 + 16, 740, "3  Designer: 2 colours of 8, 1 emblem of 8", { fill: C.inkDim }));
  PALETTE.forEach(([name, colour], k) => {
    const sx = x0 + 16 + k * 30;
    parts.push(
      `<rect x="${String(sx)}" y="754" width="24" height="24" rx="3" fill="${colour}" stroke="${k === 0 ? C.ink : C.edge}" stroke-width="${k === 0 ? "2" : "1"}"><title>${name}</title></rect>`,
    );
    parts.push(
      `<rect x="${String(sx)}" y="784" width="24" height="24" rx="3" fill="${colour}" stroke="${k === 3 ? C.ink : C.edge}" stroke-width="${k === 3 ? "2" : "1"}"/>`,
    );
  });
  parts.push(text(x0 + 16 + 8 * 30 + 6, 770, "main", { size: 11, fill: C.inkDim }));
  parts.push(text(x0 + 16 + 8 * 30 + 6, 800, "trim", { size: 11, fill: C.inkDim }));
  /** @type {(keyof typeof EMBLEMS)[]} */
  const ids = ["disc", "bar", "chevron", "diamond", "triangle", "cross", "ring", "split"];
  ids.forEach((id, k) => {
    const sx = x0 + 16 + k * 30;
    parts.push(
      `<rect x="${String(sx)}" y="820" width="24" height="24" rx="3" fill="${C.bg}" stroke="${id === spec.sample.emblem ? C.ink : C.line}" stroke-width="${id === spec.sample.emblem ? "2" : "1"}"/>`,
    );
    parts.push(emblem(id, sx + 12, 832, 16, C.ink));
  });
  parts.push(text(x0 + 16 + 8 * 30 + 6, 836, "emblem", { size: 11, fill: C.inkDim }));
  // The result, at 5x, with emblem visible, in three colourways.
  [
    spec.sample,
    { main: hue("white"), trim: hue("teal"), emblem: "cross" },
    { main: hue("orange"), trim: hue("black"), emblem: "split" },
  ].forEach((cape, k) => {
    const cx = x0 + 90 + k * 150;
    parts.push(
      `<rect x="${String(cx - 60)}" y="866" width="120" height="130" fill="${C.bg}" stroke="${C.line}"/>`,
    );
    parts.push(
      body(
        cx,
        930,
        3.2,
        v,
        /** @type {Cape} */ (cape),
        0,
        C.friend,
        true,
        spec.emblemMenu === 0 ? 0 : spec.emblemMenu,
      ),
    );
  });
  parts.push(`</g>`);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${String(H)}" width="${String(W)}" height="${String(H)}" font-family="monospace">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`cape study: ${outFile} (${String(svg.length)} bytes)`);

// ---------------------------------------------------------------------------
// The mockup: one arena-like 4v4 frame per variant, stacked, to read on a phone.

const FRAME_W = 1000;
const FRAME_H = 560;
const SCALE = 2 * ZOOM;
const CAPES = /** @type {Cape[]} */ ([
  { main: hue("gold"), trim: hue("black"), emblem: "chevron" },
  { main: hue("violet"), trim: hue("white"), emblem: "diamond" },
  { main: hue("lime"), trim: hue("black"), emblem: "ring" },
  { main: hue("white"), trim: hue("teal"), emblem: "cross" },
  { main: hue("orange"), trim: hue("black"), emblem: "split" },
]);
/** Body positions in world units from the frame centre, and which cape (or none) each wears. @type {[number, number, number, number, number][]} */
const FIGHT = [
  // x, y, facing (deg), team (0 ally, 1 enemy), cape index (-1 none)
  [-70, -40, 20, 0, 0],
  [-110, 30, -15, 0, 0],
  [-30, 70, 40, 0, 1],
  [-160, -90, 0, 0, -1],
  [40, -30, 195, 1, 2],
  [75, 40, 160, 1, 3],
  [10, 90, 215, 1, 2],
  [130, -70, 180, 1, -1],
];
/** @type {string[]} */
const sheet = [
  `<rect width="${String(FRAME_W + 40)}" height="${String(3 * (FRAME_H + 70) + 20)}" fill="${C.bg}"/>`,
];
ORDER.forEach((v, i) => {
  const y0 = 20 + i * (FRAME_H + 70);
  sheet.push(
    text(20, y0 + 22, VARIANTS[v].name + " (4v4 mid-fight, 2x Default zoom)", {
      size: 22,
      bold: true,
    }),
  );
  sheet.push(
    `<svg x="20" y="${String(y0 + 36)}" width="${String(FRAME_W)}" height="${String(FRAME_H)}" viewBox="0 0 ${String(FRAME_W)} ${String(FRAME_H)}">`,
  );
  sheet.push(
    `<rect width="${String(FRAME_W)}" height="${String(FRAME_H)}" fill="#12171e" stroke="${C.line}"/>`,
  );
  for (let g = 0; g < FRAME_W; g += 64)
    sheet.push(
      `<line x1="${String(g)}" y1="0" x2="${String(g)}" y2="${String(FRAME_H)}" stroke="#1a212c"/>`,
    );
  for (let g = 0; g < FRAME_H; g += 64)
    sheet.push(
      `<line x1="0" y1="${String(g)}" x2="${String(FRAME_W)}" y2="${String(g)}" stroke="#1a212c"/>`,
    );
  FIGHT.forEach(([x, y, face, team, ci], k) => {
    const cape = ci < 0 ? undefined : CAPES[(ci + i) % CAPES.length];
    sheet.push(
      body(
        FRAME_W / 2 + x * SCALE,
        FRAME_H / 2 + y * SCALE,
        SCALE,
        cape === undefined ? undefined : v,
        cape,
        deg(face),
        team === 0 ? C.friend : C.foe,
        k === 0,
        VARIANTS[v].emblemArena,
      ),
    );
  });
  // The menu figure, inset bottom right, at 3x.
  sheet.push(
    `<rect x="${String(FRAME_W - 150)}" y="${String(FRAME_H - 150)}" width="140" height="140" fill="${C.bg}" stroke="${C.line}"/>`,
  );
  sheet.push(
    body(
      FRAME_W - 80,
      FRAME_H - 80,
      3,
      v,
      VARIANTS[v].sample,
      0,
      C.friend,
      true,
      VARIANTS[v].emblemMenu,
    ),
  );
  sheet.push(text(FRAME_W - 144, FRAME_H - 158, "menu figure, 3x", { size: 14, fill: C.inkDim }));
  sheet.push("</svg>");
});
const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(FRAME_W + 40)}" height="${String(3 * (FRAME_H + 70) + 20)}" font-family="monospace">${sheet.join("")}</svg>\n`;
const tmp = join(mkdtempSync(join(tmpdir(), "cape-")), "cape-mockup.svg");
writeFileSync(tmp, mockSvg);
const png = join(root, "docs", "art", "cape-mockup.png");
spawnSync("inkscape", [tmp, "-o", png], { stdio: "ignore" });
console.log(`cape mockup: ${png}`);
