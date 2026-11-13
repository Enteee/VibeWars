/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Layout study for Ember Pits (#3225, part of #3071). Top-down plan, map units / 3.5 = px.
// Regenerate: node scripts/assets/3071-ember-pits-study.mjs docs/art
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
const K = 1 / 3.5;
const W = 800,
  H = 560,
  OY = 30;
/** @type {(p: [number, number][]) => string} */
const pts = (p) => p.map(([x, y]) => `${(x * K).toFixed(1)},${(y * K + OY).toFixed(1)}`).join(" ");
/** @type {(x: number, y: number, w: number, h: number, a: string) => string} */
const rect = (x, y, w, h, a) =>
  `<rect x="${x * K}" y="${y * K + OY}" width="${w * K}" height="${h * K}" ${a}/>`;
/** @type {(x: number, y: number, t: string, a?: string) => string} */
const tx = (x, y, t, a = "") =>
  `<text x="${x * K}" y="${y * K + OY}" class="n" text-anchor="middle" ${a}>${t}</text>`;

// outline: a rect with the four corners cut, plus a bite out of the north-east
/** @type {[number, number][]} */
const outline = [
  [200, 0],
  [1500, 0],
  [1700, 160],
  [2500, 160],
  [2800, 420],
  [2800, 1500],
  [2600, 1800],
  [1300, 1800],
  [1100, 1640],
  [300, 1640],
  [0, 1380],
  [0, 360],
];
/** @type {(p: [number, number][]) => string} */
const lava = (p) =>
  `<polygon points="${pts(p)}" fill="#ff8a3d" stroke="#ffd23d" stroke-width="2"/><polygon points="${pts(p)}" fill="#c0391b" opacity=".45"/>`;
/** @type {(x: number, y: number, w: number, h: number) => string} */
const bridge = (x, y, w, h) => rect(x, y, w, h, 'fill="#8d8a84" stroke="#e6e1d6" stroke-width="2"');

let s = `<rect width="${W}" height="${H}" fill="#0e1116"/>`;
s += `<polygon points="${pts(outline)}" fill="#3a3430" stroke="#a89f94" stroke-width="3"/>`;
// cooling crust: scorched ground in the middle belt
s += `<polygon points="${pts([
  [1050, 300],
  [1750, 300],
  [1900, 900],
  [1750, 1500],
  [1050, 1500],
  [900, 900],
])}" fill="#2a2522" stroke="#5a4f48" stroke-dasharray="6 4"/>`;
// west lava channel A (winds), three bridges
/** @type {[number, number][]} */
const chA = [
  [1000, 0],
  [1160, 0],
  [1140, 500],
  [1240, 800],
  [1150, 1200],
  [1260, 1640],
  [1100, 1640],
  [1020, 1250],
  [1060, 850],
  [940, 520],
];
// east lava channel B, two bridges and an under-pass
/** @type {[number, number][]} */
const chB = [
  [1640, 160],
  [1800, 160],
  [1700, 560],
  [1780, 900],
  [1720, 1300],
  [1840, 1800],
  [1680, 1800],
  [1560, 1330],
  [1620, 920],
  [1540, 560],
];
s += lava(chA) + lava(chB);
// bridges
s += bridge(900, 350, 380, 90) + bridge(900, 780, 400, 140) + bridge(900, 1380, 380, 90); // west: N, mid (wide), S
s += bridge(1500, 820, 400, 140); // east: mid (wide)
s += bridge(1500, 380, 330, 90); // east: north
// lever-run bridge closes the south-east crossing
s += rect(
  1500,
  1370,
  360,
  90,
  'fill="none" stroke="#e6e1d6" stroke-width="2" stroke-dasharray="5 4"',
);
// basalt column (layer 1) in the centre with a lift on its south face
s += `<polygon points="${pts([
  [1280, 640],
  [1520, 640],
  [1580, 780],
  [1520, 1000],
  [1280, 1000],
  [1220, 800],
])}" fill="#6b625a" stroke="#e6e1d6" stroke-width="3"/>`;
s += `<polygon points="${pts([
  [1280, 1000],
  [1520, 1000],
  [1500, 1080],
  [1300, 1080],
])}" fill="#4b443e" stroke="#e6e1d6" stroke-width="2"/>`;
s += rect(1370, 1010, 60, 50, 'fill="#9fdcff" stroke="#fff" stroke-width="2"');
// drop-off on the north edge of the column
s += `<path d="M${1300 * K},${640 * K + OY} L${1500 * K},${640 * K + OY}" stroke="#ffd23d" stroke-width="4" stroke-dasharray="4 4"/>`;
// under-pass (layer -1) beneath channel B, south
s += rect(
  1480,
  1560,
  440,
  70,
  'fill="#1a1613" stroke="#9fdcff" stroke-width="2" stroke-dasharray="3 3"',
);
// steam vents (violet-free: pale)
for (const [x, y] of [
  [640, 380],
  [660, 1300],
  [2060, 420],
  [2140, 1260],
  [1400, 420],
])
  s += `<circle cx="${x * K}" cy="${y * K + OY}" r="9" fill="none" stroke="#dfe7f1" stroke-width="2" stroke-dasharray="3 3"/><circle cx="${x * K}" cy="${y * K + OY}" r="3" fill="#dfe7f1"/>`;
// lever (west of channel A, far from east spawn) and glow lights
s += `<rect x="${620 * K - 6}" y="${830 * K + OY - 6}" width="12" height="12" fill="#ffd23d" stroke="#fff"/>`;
for (const [x, y] of [
  [1100, 220],
  [1200, 800],
  [1150, 1500],
  [1700, 300],
  [1700, 900],
  [1750, 1600],
])
  s += `<circle cx="${x * K}" cy="${y * K + OY}" r="26" fill="#ffd23d" opacity=".18"/>`;
// spawns
s += rect(120, 640, 220, 460, 'fill="#59c2ff" opacity=".35" stroke="#59c2ff" stroke-width="2"');
s += rect(2540, 700, 220, 460, 'fill="#ff7b72" opacity=".35" stroke="#ff7b72" stroke-width="2"');
// routes: two lava-free per spawn
s += `<g fill="none" stroke-width="3" stroke-dasharray="8 5" opacity=".9"><path stroke="#59c2ff" d="M${340 * K},${800 * K + OY} L${1100 * K},${850 * K + OY} L${1400 * K},${900 * K + OY}"/><path stroke="#59c2ff" d="M${340 * K},${700 * K + OY} L${1100 * K},${400 * K + OY} L${1650 * K},${425 * K + OY} L${2000 * K},${600 * K + OY}"/><path stroke="#ff7b72" d="M${2540 * K},${900 * K + OY} L${1700 * K},${890 * K + OY} L${1400 * K},${900 * K + OY}"/><path stroke="#ff7b72" d="M${2540 * K},${1050 * K + OY} L${1900 * K},${1595 * K + OY} L${1480 * K},${1595 * K + OY} L${1200 * K},${1425 * K + OY} L${1000 * K},${1100 * K + OY}"/></g>`;
// labels
s += tx(220, 600, "WEST SPAWN", 'fill="#59c2ff"') + tx(2650, 660, "EAST SPAWN", 'fill="#ff7b72"');
s +=
  tx(1400, 590, "basalt column (layer 1)") +
  tx(1400, 1130, "lift: lever") +
  tx(1700, 1720, "under-pass (layer −1)");
s += tx(1400, 260, "cooling crust (scorched)") + tx(1090, 300, "lava A") + tx(1720, 260, "lava B");
s += tx(640, 780, "lever") + tx(640, 330, "steam vent") + tx(1040, 1330, "S bridge");
s += tx(1680, 1510, "lever bridge (closable)");
const legend = `<text x="12" y="20" class="h">Ember Pits: layout study (#3225)</text><text x="12" y="${H - 10}" class="s">blue/red dashes: two lava-free routes per spawn · orange: lava (molten) · pale rings: steam vents · glow discs: local lights · 1 px = 3.5 units</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><style>.n{font:11px 'DejaVu Sans',sans-serif;fill:#f2f5fa;paint-order:stroke;stroke:#0b0f14;stroke-width:3px}.h{font:bold 14px 'DejaVu Sans',sans-serif;fill:#fff}.s{font:10px 'DejaVu Sans',sans-serif;fill:#9fb0c6}</style></defs>${s}${legend}</svg>`;
const p = join(out, "3071-ember-pits.svg");
const png = join(out, "3071-ember-pits.png");
writeFileSync(p, svg);
execFileSync("inkscape", [p, "-w", String(W), "-o", png], { stdio: "ignore" });
rmSync(p);
execFileSync("magick", [png, "-colors", "64", `PNG8:${png}`]);
