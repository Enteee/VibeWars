/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3067: every deck and transition look in one lit scene.
// Usage: node scripts/assets/structures-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const W = 800,
  H = 580,
  GROUND = "#26303f",
  INK = "#0b0f14";

/** @type {(seed: number) => () => number} */
const rng = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

// Materials: top (lightest), face (the top shaded ~40 %), lip (bright edge).
const STONE = { top: "#a0b2c7", face: "#5f6f86", lip: "#e4edf7", line: "#4a586c" };
const EARTH = { top: "#6f6248", face: "#43392a", lip: "#a8987a", line: "#2f2820" };
const MOSS = { top: "#4f6a40", face: "#3a2f22", lip: "#8fb27a", line: "#2a2219" };
const WOOD = { top: "#a07a48", face: "#5a4126", lip: "#d8b078", line: "#3a2816" };

/** @type {(x: number, y: number, w: number, d: number, h: number, m: typeof STONE, bricks?: boolean) => string} */
function box(x, y, w, d, h, m, bricks = false) {
  const top = y - h;
  let s = `<polygon points="${x + h * 0.8},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6} ${x + w},${y + h * 0.6 - 0}  ${x + w},${y + d} ${x},${y + d}" fill="#080b10" opacity=".55"/>`;
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

/** @type {(x: number, y: number, w: number, top: number) => string} Merlons along a rim, art only. */
const merlons = (x, y, w, top) => {
  let s = "";
  for (let c = 2; c + 8 <= w; c += 14)
    s += `<rect x="${x + c}" y="${y - 6}" width="8" height="6" fill="${top}" stroke="${INK}" stroke-width="1.5"/>`;
  return s;
};

/** @type {(x: number, y: number, w: number, h: number) => string} Ladder against a face: rails, rungs. */
const ladder = (x, y, w, h) => {
  let s = `<path d="M${x},${y} V${y + h} M${x + w},${y} V${y + h}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M${x},${y} V${y + h} M${x + w},${y} V${y + h}" stroke="#a07a48" stroke-width="2.5" stroke-linecap="round"/>`;
  for (let r = 5; r < h; r += 7)
    s += `<path d="M${x},${y + r} H${x + w}" stroke="${INK}" stroke-width="4"/><path d="M${x},${y + r} H${x + w}" stroke="#d8b078" stroke-width="1.8"/>`;
  return s;
};

/** @type {(x: number, y: number, w: number, h: number, n: number, m: typeof STONE) => string} Stairs seen from the south: treads as bands, stringers on both sides. */
const stairs = (x, y, w, h, n, m) => {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${m.face}" stroke="${INK}" stroke-width="2"/>`;
  const bh = h / n;
  for (let i = 0; i < n; i++)
    s += `<rect x="${x + 1}" y="${y + i * bh}" width="${w - 2}" height="${bh * 0.55}" fill="${m.top}"/><rect x="${x + 1}" y="${y + i * bh + bh * 0.55}" width="${w - 2}" height="${bh * 0.45}" fill="${m.face}"/>`;
  s += `<path d="M${x},${y} V${y + h} M${x + w},${y} V${y + h}" stroke="${INK}" stroke-width="3"/><path d="M${x + 1.5},${y} V${y + h} " stroke="${m.lip}" stroke-width="1.5"/>`;
  return s;
};

/** @type {(x: number, y: number, w: number, h: number, m: typeof STONE) => string} A ramp: one lit slope, light at the foot's far end. */
const ramp = (x, y, w, h, m) =>
  `<defs><linearGradient id="rp${x}${y}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.top}"/><stop offset="1" stop-color="${m.face}"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#rp${x}${y})" stroke="${INK}" stroke-width="2"/><path d="M${x + 2},${y + 2} H${x + w - 2}" stroke="${m.lip}" stroke-width="2"/>`;

const label = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ t) =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${t}</text>`;

let g = "";
for (let i = 0; i <= W; i += 80) g += `<path d="M${i},0 V${H}" stroke="#34415a" stroke-width="1"/>`;
for (let i = 0; i <= H; i += 80) g += `<path d="M0,${i} H${W}" stroke="#34415a" stroke-width="1"/>`;

// ---- row 1: platform, tower, wall-walk
g += `<g transform="translate(0,48)">`;
g += box(24, 90, 130, 64, 28, STONE);
g += label(24, 24, "platform (stone)");
// tower
g += box(210, 66, 74, 50, 74, STONE, true);
g += merlons(210, -8 + 66, 74, STONE.top);
g += ladder(238, 66 - 74 + 50 + 6, 16, 62);
g += label(196, 24, "tower: masonry, ladder");
// wall-walk: a thick wall, parapet merlons on both rims, a stair at each end
g += box(366, 94, 300, 30, 44, STONE, true);
g += merlons(366, 94 - 44, 300, STONE.top);
g += merlons(366, 94 - 44 + 30, 300, STONE.top);
for (let i = 0; i < 5; i++) g += box(334 + i * 6, 94, 6, 30, (i + 1) * 8, STONE);
for (let i = 0; i < 5; i++) g += box(666 + (4 - i) * 6, 94, 6, 30, (i + 1) * 8, STONE);
g += label(334, 24, "wall-walk: parapet both rims, stair at each end");
g += `<circle cx="470" cy="${94 - 44 + 12}" r="12" fill="#59c2ff" stroke="#fff" stroke-width="2"/>`;

g += `</g>`;
// ---- row 2 left: terrace, three levels with rough steps
g += box(70, 238, 100, 26, 42, MOSS);
g += box(44, 264, 152, 30, 28, MOSS);
g += box(18, 294, 204, 36, 14, MOSS);
/** @type {[number, number, number][]} */
const flights = [
  [100, 238 - 42 + 26, 4],
  [116, 264 - 28 + 30, 3],
];
for (const [sx, sy, n] of flights) {
  const R = rng(sx);
  for (let i = 0; i < n; i++)
    g += `<path d="M${sx + R() * 4},${sy + i * 7 + 2} l${14 + R() * 6},${R() * 2 - 1} l${R() * 4},5 l${-16},1Z" fill="${EARTH.top}" stroke="${INK}" stroke-width="1"/>`;
}
g += label(18, 214, "terrace: stepped ground, rough steps");

// ---- row 2 right: a stream and three bridges
g += `<rect x="250" y="250" width="540" height="64" fill="#18304a"/><path d="M250,250 H790" stroke="#8fb8d6" stroke-width="3"/><path d="M250,314 H790" stroke="#8fb8d6" stroke-width="3"/>`;
g += `<rect x="250" y="250" width="540" height="64" filter="url(#grain)" fill="#2f6a8c" opacity=".2"/>`;
// stone: deck on two piers, a parapet
g += `<rect x="296" y="266" width="12" height="38" fill="#4a586c" stroke="${INK}" stroke-width="2"/><rect x="342" y="266" width="12" height="38" fill="#4a586c" stroke="${INK}" stroke-width="2"/>`;
g += box(290, 236, 70, 80, 14, STONE, true);
g += `<path d="M293,238 V314 M357,238 V314" stroke="${STONE.lip}" stroke-width="3"/>`;
g += label(262, 340, "bridge-stone");
// plank: posts, rope rails, one lane
g += `<rect x="460" y="262" width="5" height="30" fill="#3a2816"/><rect x="494" y="262" width="5" height="30" fill="#3a2816"/>`;
g += `<rect x="460" y="238" width="40" height="76" fill="${WOOD.top}" stroke="${INK}" stroke-width="2"/>`;
for (let r = 242; r < 312; r += 7)
  g += `<path d="M460,${r} H500" stroke="${WOOD.line}" stroke-width="1.3"/>`;
g += `<path d="M458,238 V314 M502,238 V314" stroke="#d8b078" stroke-width="2" stroke-dasharray="6 3"/>`;
g += `<rect x="466" y="314" width="28" height="3" fill="${WOOD.face}"/>`;
g += label(436, 340, "bridge-plank (one lane)");
// log: a fallen trunk with bark, a stub, root flare
g += `<ellipse cx="660" cy="288" rx="22" ry="40" fill="#080b10" opacity=".5" transform="translate(12,10)"/>`;
g += `<rect x="638" y="240" width="42" height="76" rx="18" fill="#6b4a28" stroke="${INK}" stroke-width="2"/>`;
for (const dx of [-10, -2, 8])
  g += `<path d="M${660 + dx},244 V312" stroke="#3a2816" stroke-width="1.5"/>`;
g += `<rect x="644" y="244" width="12" height="68" rx="6" fill="#a07a48" opacity=".55"/><ellipse cx="659" cy="316" rx="20" ry="5" fill="#d8b078" stroke="${INK}" stroke-width="1.5"/>`;
g += label(620, 340, "bridge-log (fallen tree)");

// ---- row 3: transitions, each against a deck face
const tile = (
  /** @type {number} */ i,
  /** @type {string} */ name,
  /** @type {(x: number, y: number) => string} */ fn,
) => {
  const x = 12 + i * 156,
    y = 380;
  return `<g>${box(x, y + 20, 140, 26, 56, STONE, true)}${fn(x, y)}${label(x, y + 108, name)}</g>`;
};
g += tile(0, "ramp", (x, y) => ramp(x + 50, y + 8, 40, 70, STONE));
g += tile(1, "stairs", (x, y) => stairs(x + 48, y + 8, 44, 70, 7, STONE));
g += tile(
  2,
  "stairs-landing (wide)",
  (x, y) =>
    stairs(x + 30, y + 8, 80, 28, 3, STONE) +
    stairs(x + 30, y + 50, 80, 28, 3, STONE) +
    `<rect x="${x + 26}" y="${y + 36}" width="88" height="14" fill="${STONE.top}" stroke="${INK}" stroke-width="2"/><rect x="${x + 27}" y="${y + 36}" width="86" height="3" fill="${STONE.lip}"/>`,
);
g += tile(3, "ladder (single file)", (x, y) => ladder(x + 62, y + 8, 16, 70));
g += tile(4, "rough-steps (rock, earth)", (x, y) => {
  const R = rng(9);
  let s = "";
  for (let i = 0; i < 8; i++)
    s += `<path d="M${x + 50 + R() * 6},${y + 10 + i * 9} l${26 + R() * 8},${R() * 3 - 1.5} l${R() * 5},7 l${-30},1Z" fill="${i % 2 ? EARTH.top : "#857756"}" stroke="${INK}" stroke-width="1.2"/>`;
  return s;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs><rect width="${W}" height="${H}" fill="${GROUND}"/>${g}</svg>`;
const svgPath = join(out, "structures.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3067-structures.png")], {
  stdio: "ignore",
});
