/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3078: ledge, ruin, arch, gatehouse roof, rooftop, pier / ship
// deck, plinth, and the overhang shade on bodies beneath a deck.
// Usage: node scripts/assets/structures2-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const CW = 200,
  CH = 250,
  COLS = 4,
  GROUND = "#26303f",
  INK = "#0b0f14";

/** @typedef {{top: string, face: string, lip: string, line: string}} Mat */
/** @type {Mat} */
const STONE = { top: "#a0b2c7", face: "#5f6f86", lip: "#e4edf7", line: "#4a586c" };
/** @type {Mat} */
const ROCK = { top: "#6b7a90", face: "#3a4658", lip: "#a9bbd0", line: "#2c3748" };
/** @type {Mat} */
const PLASTER = { top: "#b5a98f", face: "#6a604f", lip: "#ece2c8", line: "#524a3c" };
/** @type {Mat} */
const WOOD = { top: "#a07a48", face: "#5a4126", lip: "#d8b078", line: "#3a2816" };

/** @type {(x: number, y: number, w: number, d: number, h: number, m: Mat, bricks?: boolean) => string} */
function box(x, y, w, d, h, m, bricks = false) {
  const top = y - h;
  let s = `<polygon points="${x + h * 0.8},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6} ${x + w},${y + h * 0.6} ${x + w},${y + d} ${x},${y + d}" fill="#080b10" opacity=".55"/>`;
  s += `<rect x="${x}" y="${top + d}" width="${w}" height="${h}" fill="${m.face}" stroke="${INK}" stroke-width="2"/>`;
  if (bricks) {
    for (let r = 1; r * 9 < h; r++) {
      const yy = top + d + r * 9;
      s += `<path d="M${x},${yy} H${x + w}" stroke="${m.line}" stroke-width="1"/>`;
      for (let c = (r % 2) * 7; c < w; c += 14)
        s += `<path d="M${x + c},${yy - 9} V${yy}" stroke="${m.line}" stroke-width="1"/>`;
    }
  }
  s += `<rect x="${x}" y="${top}" width="${w}" height="${d}" fill="${m.top}" stroke="${INK}" stroke-width="2"/>`;
  s += `<rect x="${x + 1}" y="${top + d - 3}" width="${w - 2}" height="3" fill="${m.lip}"/>`;
  return s;
}

/** @type {(x: number, y: number, w: number, top: string) => string} Merlons along a rim, art only. */
const merlons = (x, y, w, top) => {
  let s = "";
  for (let c = 2; c + 8 <= w; c += 14)
    s += `<rect x="${x + c}" y="${y - 6}" width="8" height="6" fill="${top}" stroke="${INK}" stroke-width="1.5"/>`;
  return s;
};

/** @type {(x: number, y: number, r?: number, dim?: boolean) => string} A body; dim = under a deck. */
const body = (x, y, r = 12, dim = false) =>
  `<ellipse cx="${x + 4}" cy="${y + 6}" rx="${r}" ry="4" fill="#000" opacity=".35"/><circle cx="${x}" cy="${y}" r="${r}" fill="#59c2ff" stroke="#fff" stroke-width="2"/>${dim ? `<circle cx="${x}" cy="${y}" r="${r + 1}" fill="#080b10" opacity=".4"/>` : ""}`;

const WATER = `<rect width="${CW}" height="${CH}" fill="#18304a"/><rect width="${CW}" height="${CH}" filter="url(#grain)" fill="#2f6a8c" opacity=".2"/>`;

/** @type {{title: string, body: string}[]} */
const cells = [];
/** @type {(title: string, body: string) => number} */
const cell = (title, b) => cells.push({ title, body: b });

// ledge: a deck along a cliff face, one stair
cell(
  "ledge: cliff deck, one stair",
  `<rect x="10" y="30" width="180" height="120" fill="${ROCK.face}" stroke="${INK}" stroke-width="2"/><rect x="10" y="30" width="180" height="28" fill="${ROCK.top}" stroke="${INK}" stroke-width="2"/>${box(24, 130, 120, 38, 30, STONE)}${[0, 1, 2, 3, 4].map((i) => box(150 + i * 5, 130, 5, 38, (i + 1) * 6, STONE)).join("")}${body(80, 118)}`,
);
/** @type {[number, number][]} */
const rubbleAt = [
  [60, 204],
  [110, 210],
  [142, 200],
];
// ruin: a broken platform, gaps, a ragged edge
cell(
  "ruin: gaps, broken wall",
  `${box(26, 120, 140, 70, 34, STONE, true)}<polygon points="92,74 120,70 124,96 98,104" fill="#10151c" stroke="${INK}" stroke-width="1.5"/><path d="M92,74 L120,70" stroke="${STONE.lip}" stroke-width="1.5"/><polygon points="44,100 70,96 74,118 50,122" fill="#10151c" stroke="${INK}" stroke-width="1.5"/><polygon points="138,86 168,86 168,66 150,66" fill="${GROUND}" stroke="${INK}" stroke-width="1.5"/><polygon points="26,180 46,170 58,190 26,190" fill="${GROUND}"/>${rubbleAt
    .map(
      ([x, y]) =>
        `<polygon points="${x - 9},${y} ${x - 3},${y - 8} ${x + 7},${y - 4} ${x + 9},${y + 3} ${x - 4},${y + 6}" fill="#6f8099" stroke="${INK}" stroke-width="1.3"/>`,
    )
    .join("")}`,
);
// arch: rock mass with a walkable top, an opening to pass under
cell(
  "arch: walkable top, pass under",
  `<polygon points="30,206 170,206 176,70 24,70" fill="#080b10" opacity=".5" transform="translate(12,10)"/><path d="M30,206 V86 H170 V206 H138 V160 A38,38 0 0 0 62,160 V206Z" fill="${ROCK.face}" stroke="${INK}" stroke-width="2"/><rect x="30" y="56" width="140" height="30" fill="${ROCK.top}" stroke="${INK}" stroke-width="2"/><rect x="31" y="83" width="138" height="3" fill="${ROCK.lip}"/><path d="M62,206 V160 A38,38 0 0 1 138,160 V206Z" fill="#10151c"/><rect x="62" y="160" width="76" height="46" fill="#10151c" opacity="0"/>${body(100, 190, 12, true)}`,
);
// gatehouse roof: a walkable roof over a passage, with a gate
cell(
  "gatehouse roof + gate",
  `${box(20, 110, 160, 50, 70, STONE, true)}${merlons(20, 40, 160, STONE.top)}<rect x="70" y="120" width="60" height="70" fill="#10151c" stroke="${INK}" stroke-width="2"/><path d="M66,190 V116 H134 V190" fill="none" stroke="#8fa4bd" stroke-width="3"/>${[76, 86, 96, 106, 116, 126].map((c) => `<path d="M${c},122 V160" stroke="#7a8aa4" stroke-width="3"/>`).join("")}${body(100, 215, 12, true)}`,
);
// rooftop: two flat roofs, stairs, a plank bridge
cell(
  "rooftop: stair, plank bridge",
  `${box(14, 100, 74, 44, 60, PLASTER, true)}${box(120, 100, 66, 44, 60, PLASTER, true)}<rect x="88" y="62" width="32" height="14" fill="#a07a48" stroke="${INK}" stroke-width="2"/><path d="M88,66 H120 M88,72 H120" stroke="#3a2816" stroke-width="1.2"/>${[0, 1, 2, 3, 4].map((i) => box(26 + i * 10, 190, 10, 22, (i + 1) * 10, PLASTER)).join("")}<rect x="30" y="112" width="12" height="22" fill="#2a2018" stroke="${INK}" stroke-width="1.5"/>`,
);
// pier + ship deck over water
cell(
  "pier / ship deck over water",
  `${WATER}<rect x="0" y="116" width="${CW}" height="34" fill="${GROUND}" opacity="0"/>${[40, 70, 100].map((x) => `<rect x="${x}" y="150" width="6" height="30" fill="#3a2816" stroke="${INK}" stroke-width="1.2"/>`).join("")}<rect x="14" y="120" width="104" height="34" fill="#a07a48" stroke="${INK}" stroke-width="2"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => `<path d="M${14 + i * 7.4},120 V154" stroke="#3a2816" stroke-width="1.2"/>`).join("")}<path d="M14,120 H118 M14,154 H118" stroke="#d8b078" stroke-width="2"/>${box(116, 190, 78, 54, 26, WOOD)}<path d="M116,190 L124,208 H190 L194,190Z" fill="#5a4126" opacity="0"/><rect x="150" y="104" width="5" height="46" fill="#3a2816" stroke="${INK}" stroke-width="1"/><path d="M155,108 L180,118 L155,130Z" fill="#dfe6f0" stroke="${INK}" stroke-width="1.5"/>`,
);
// plinth: a statue base, one step up, with a capture ring
cell(
  "plinth: capture spot",
  `<ellipse cx="100" cy="150" rx="54" ry="20" fill="none" stroke="#e8c27a" stroke-width="3" opacity=".9"/>${box(64, 150, 72, 40, 28, STONE, true)}${box(78, 148, 44, 26, 52, STONE, true)}<ellipse cx="100" cy="50" rx="10" ry="12" fill="#5f6f86" stroke="${INK}" stroke-width="2"/><path d="M84,62 H116 L120,96 H80Z" fill="#6f8099" stroke="${INK}" stroke-width="2"/><path d="M84,62 L80,96" stroke="#e4edf7" stroke-width="2"/>${body(160, 206)}`,
);
// overhang shade: bodies beneath a deck are drawn darker
cell(
  "overhang shade: under = darker",
  `<rect x="30" y="100" width="12" height="60" fill="#3a4658" stroke="${INK}" stroke-width="2"/><rect x="158" y="100" width="12" height="60" fill="#3a4658" stroke="${INK}" stroke-width="2"/>${body(72, 140, 12, true)}${body(128, 140, 12, true)}${box(24, 60, 152, 40, 6, STONE)}${body(100, 206, 12, false)}<text x="8" y="236" font-family="DejaVu Sans,sans-serif" font-size="9.5" fill="#b8c4d6">same body, in the open</text>`,
);

const rows = Math.ceil(cells.length / COLS);
const TW = COLS * CW,
  TH = rows * CH;
let svgBody = "";
cells.forEach((c, i) => {
  const x = (i % COLS) * CW,
    y = Math.floor(i / COLS) * CH;
  svgBody += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden"><rect width="${CW}" height="${CH}" fill="${GROUND}" stroke="#141a24"/>${c.body}<text x="5" y="14" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${c.title}</text></svg></g>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>${svgBody}</svg>`;
const svgPath = join(out, "structures-2.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3078-structures-2.png")], {
  stdio: "ignore",
});
