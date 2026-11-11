/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3070: the Canyon pilot. A plan view (800x514 = the 2800x1800 map
// at 0.286) and a cross-section strip with the palette.
// Usage: node scripts/assets/canyon-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const W = 800,
  PH = 514,
  TH = 720,
  INK = "#0b0f14";
// Desaturated sandstone: rust-brown, never danger orange (#ff8a3d).
const RIM = "#9a7a62", // top, lightest plane
  LIP = "#c9ad94",
  FACE = "#5e4538",
  FACE_DEEP = "#3d2c26",
  SAND = "#6d5a47", // dry river bed, lowest layer
  SCORCH = "#2e2823",
  MIRE = "#3f4a33",
  STONE = "#a0b2c7",
  STONE_FACE = "#5f6f86";

/** @type {(x: number) => number} */
const cy = (x) => 257 + 70 * Math.sin(x / 120 + 0.6) + 25 * Math.sin(x / 47);
/** @type {(x: number) => number} */
const hw = (x) => 62 - 26 * Math.exp(-(((x - 400) / 55) ** 2)) - 8 * Math.sin(x / 90); // narrowest at x=400
/** @type {number[]} */
const xs = [];
for (let x = 0; x <= W; x += 8) xs.push(x);
/** @typedef {[number, number]} Pt */
/** @type {Pt[]} */
const top = xs.map((x) => /** @type {Pt} */ ([x, cy(x) - hw(x)]));
/** @type {Pt[]} */
const bot = xs.map((x) => /** @type {Pt} */ ([x, cy(x) + hw(x)]));
/** @type {(a: Pt[]) => string} */
const pts = (a) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
/** @type {(a: Pt[], dy?: number) => string} */
const edge = (a, dy = 0) =>
  a.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${(y + dy).toFixed(1)}`).join(" ");

let s = "";
// outside land: natural scrub, outline is not a rectangle
s += `<rect width="${W}" height="${PH}" fill="#1b1814"/>`;
s += `<path d="M18,20 L190,8 L420,24 L640,6 L784,30 L792,230 L780,500 L560,508 L300,496 L90,508 L10,470 L22,260 Z" fill="${RIM}" stroke="${INK}" stroke-width="3"/>`;
s += `<path d="M18,20 L190,8 L420,24 L640,6 L784,30 L792,230 L780,500 L560,508 L300,496 L90,508 L10,470 L22,260 Z" filter="url(#grain)" fill="#fff" opacity=".12"/>`;
// bed with cliff faces: north cliff face is visible (south-facing), drawn as a darker band
s += `<polygon points="${pts(top)} ${pts([...bot].reverse())}" fill="${SAND}" stroke="${INK}" stroke-width="3"/>`;
s += `<path d="${edge(top)} L800,${(top[top.length - 1]?.[1] ?? 0) + 18} ${edge([...top].reverse(), 18).replace("M", "L")} Z" fill="${FACE}" stroke="${INK}" stroke-width="2"/>`;
s += `<path d="${edge(top, 18)}" stroke="${FACE_DEEP}" stroke-width="6" fill="none" opacity=".6"/>`;
s += `<path d="${edge(top)}" stroke="${LIP}" stroke-width="2.5" fill="none"/>`;
s += `<path d="${edge(bot)}" stroke="${INK}" stroke-width="4" fill="none"/>`;
// hard SE shadow of the south rim is not seen (it falls away); the north cliff shades the bed
s += `<polygon points="${pts(top.map(([x, y]) => [x, y + 18]))} ${pts(top.map(([x, y]) => [x + 22, y + 52]).reverse())}" fill="#080b10" opacity=".28"/>`;
// scorched ground in the sun (west half of bed) and mire seep (east)
for (const [x, r] of [
  [110, 40],
  [190, 30],
  [255, 24],
])
  s += `<ellipse cx="${x}" cy="${cy(x) + 12}" rx="${r}" ry="${r * 0.4}" fill="${SCORCH}" opacity=".75"/>`;
s += `<ellipse cx="610" cy="${cy(610) + 6}" rx="62" ry="22" fill="${MIRE}" stroke="#2d3825" stroke-width="2"/>`;
s += `<ellipse cx="600" cy="${cy(610)}" rx="26" ry="8" fill="#56653f" opacity=".7"/>`;
s += `<text x="578" y="${cy(610) + 40}" class="n">mire (slow)</text>`;

// ---- structures --------------------------------------------------------
/** @type {(x: number, y: number, w: number, d: number, h: number, top: string, face: string, lip?: string) => string} */
const box = (x, y, w, d, h, top, face, lip = LIP) =>
  `<polygon points="${x + h * 0.8},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6} ${x + w},${y + h * 0.6} ${x + w},${y + d} ${x},${y + d}" fill="#080b10" opacity=".5"/>` +
  `<rect x="${x}" y="${y - h + d}" width="${w}" height="${h}" fill="${face}" stroke="${INK}" stroke-width="2"/>` +
  `<rect x="${x}" y="${y - h}" width="${w}" height="${d}" fill="${top}" stroke="${INK}" stroke-width="2"/>` +
  `<rect x="${x + 1}" y="${y - h + d - 3}" width="${w - 2}" height="3" fill="${lip}"/>`;

// stone arch over the river bed (x=250)
{
  const x = 232,
    y = cy(250) - 60;
  s += box(x, y, 12, 120, 20, "#6b7a90", "#3a4658", "#a9bbd0");
  s += box(x + 52, y, 12, 120, 20, "#6b7a90", "#3a4658", "#a9bbd0");
  s += box(x - 6, y + 50, 76, 20, 26, "#6b7a90", "#3a4658", "#a9bbd0");
  s += `<rect x="${x + 12}" y="${y + 70 - 26 + 20}" width="40" height="${26 - 20 + 0}" fill="#12161c" opacity=".0"/>`;
  s += `<text x="${x - 14}" y="${y - 10}" class="n">arch (walk over, pass under)</text>`;
}
// rope bridge at the narrowest point x=400, with a lever
{
  const x = 400,
    y0 = cy(x) - hw(x) - 4,
    y1 = cy(x) + hw(x) + 4;
  s += `<rect x="${x - 10}" y="${y0}" width="20" height="${y1 - y0}" fill="#a07a48" stroke="${INK}" stroke-width="2"/>`;
  for (let yy = y0 + 6; yy < y1; yy += 8)
    s += `<path d="M${x - 10},${yy} H${x + 10}" stroke="#5a4126" stroke-width="1.5"/>`;
  s += `<path d="M${x - 10},${y0} V${y1} M${x + 10},${y0} V${y1}" stroke="#d8b078" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  s += `<circle cx="${x + 24}" cy="${y0 - 14}" r="6" fill="#e8c27a" stroke="${INK}" stroke-width="2"/>`;
  s += `<text x="${x + 32}" y="${y0 - 10}" class="n">rope bridge + lever</text>`;
}
// ruined watchtower, north rim (x=560)
{
  const x = 520,
    y = 70;
  s += box(x, y, 64, 52, 46, "#a0b2c7", "#5f6f86", "#e4edf7");
  s += `<rect x="${x + 36}" y="${y - 46 + 4}" width="20" height="18" fill="#12161c"/><rect x="${x + 6}" y="${y - 46}" width="14" height="6" fill="#12161c"/>`;
  s += `<path d="M${x + 70},${y + 70} l8,-6 l10,4 l-4,8 Z M${x + 92},${y + 78} l7,-4 l5,6 Z" fill="#7d8ea4" stroke="${INK}" stroke-width="1.5"/>`;
  s += `<text x="${x - 4}" y="${y - 54}" class="n">ruined watchtower (L2)</text>`;
}
// terraced cliff path, south rim (x=90..300): three steps down to the bed
for (let i = 0; i < 3; i++) {
  const x = 560 + i * 50,
    y = 396 + i * 12,
    h = 26 - i * 8;
  s += box(x, y, 72, 22, h, "#b5a98f", "#6a604f", "#ece2c8");
}
s += `<text x="556" y="372" class="n">terraced path (L2→L1)</text>`;
// ledges cut into the north cliff face (x=130, x=300)
for (const x of [120, 300]) {
  const y = cy(x) - hw(x) + 4;
  s += box(x, y + 22, 54, 14, 14, "#8a7a68", "#4a3a30", "#c9ad94");
}
s += `<text x="112" y="${cy(120) - hw(120) - 10}" class="n">ledges (L1)</text>`;
// drop-off: broken ledge lip with an arrow into the bed (x=330)
{
  const x = 318,
    y = cy(x) + hw(x) - 8;
  s += `<path d="M${x},${y} l10,-6 l8,5 l10,-4 l8,6" stroke="${INK}" stroke-width="3" fill="none"/>`;
  s += `<path d="M${x + 18},${y + 8} v18 m-5,-6 l5,6 l5,-6" stroke="#fff" stroke-width="2" fill="none"/>`;
  s += `<text x="${x - 8}" y="${y + 40}" class="n">drop-off</text>`;
}
// cave under the south rim, two mouths (x=700, x=470), torches
{
  const m1 = /** @type {Pt} */ ([700, cy(700) + hw(700)]),
    m2 = /** @type {Pt} */ ([470, cy(470) + hw(470)]);
  s += `<path d="M${m2[0]},${m2[1] + 18} Q585,${m2[1] + 90} ${m1[0]},${m1[1] + 18}" stroke="#16110e" stroke-width="30" fill="none" stroke-linecap="round" opacity=".92"/>`;
  s += `<path d="M${m2[0]},${m2[1] + 18} Q585,${m2[1] + 90} ${m1[0]},${m1[1] + 18}" stroke="#2a211b" stroke-width="2" fill="none" stroke-dasharray="3 5"/>`;
  for (const [mx, my] of [m1, m2]) {
    s += `<ellipse cx="${mx}" cy="${my + 4}" rx="22" ry="10" fill="#0a0806" stroke="${INK}" stroke-width="3"/>`;
    s += `<circle cx="${mx + 28}" cy="${my + 18}" r="55" fill="url(#torch)"/><circle cx="${mx + 28}" cy="${my + 18}" r="4" fill="#ffb060" stroke="${INK}" stroke-width="1.5"/>`;
  }
  s += `<text x="520" y="${m2[1] + 112}" class="n">cave: two mouths, torches (tunnel)</text>`;
}
// low sun: a long warm wash from the north-west and sun arrow
s += `<rect width="${W}" height="${PH}" fill="url(#sun)" opacity=".5"/>`;
s += `<path d="M30,30 l40,30 m-8,-2 l8,2 l-2,-9" stroke="#fff1d6" stroke-width="2.5" fill="none"/><text x="36" y="26" class="n">sun (NW)</text>`;

// spawns: team marks (signals only)
for (const [x, c, l] of [
  [48, "#59c2ff", "A"],
  [752, "#ff7b72", "B"],
]) {
  s += `<circle cx="${x}" cy="${cy(x)}" r="22" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="5 4"/>`;
  for (const k of [-9, 9])
    s += `<circle cx="${x}" cy="${cy(x) + k}" r="7" fill="${c}" stroke="#fff" stroke-width="2"/>`;
  s += `<text x="${x - 4}" y="${cy(x) - 28}" class="t">${l}</text>`;
}
// routes
s += `<path d="M70,${cy(70)} C200,${cy(70) - 30} 300,${cy(300) + 30} 400,${cy(400)}" stroke="#fff" stroke-width="1.5" fill="none" stroke-dasharray="2 5" opacity=".7"/>`;
s += `<text x="12" y="${PH - 12}" class="n">plan, 2800×1800 at 0.286. Dotted: a route; layers: L0 bed, L1 ledges and terraces, L2 rims and tower.</text>`;

// ---- cross-section strip -------------------------------------------------
let c = `<rect y="${PH}" width="${W}" height="${TH - PH}" fill="#14110e"/>`;
const sy = PH + 24;
c += `<text x="12" y="${sy - 8}" class="t">cross-section at the arch</text>`;
const blk = (x, y, w, h, top, face) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${face}" stroke="${INK}" stroke-width="2"/><rect x="${x}" y="${y}" width="${w}" height="8" fill="${top}" stroke="${INK}" stroke-width="2"/>`;
c += `<rect x="10" y="${sy + 100}" width="780" height="50" fill="${SAND}" stroke="${INK}" stroke-width="2"/>`;
c +=
  blk(10, sy + 20, 240, 80, RIM, FACE) +
  blk(560, sy + 20, 230, 80, RIM, FACE) +
  blk(430, sy + 60, 60, 40, "#8a7a68", FACE_DEEP);
c += `<rect x="252" y="${sy + 56}" width="78" height="14" fill="#6b7a90" stroke="${INK}" stroke-width="2"/><rect x="252" y="${sy + 70}" width="10" height="30" fill="#3a4658"/><rect x="320" y="${sy + 70}" width="10" height="30" fill="#3a4658"/>`;
c += `<text x="100" y="${sy + 14}" class="n">L2 rim</text><text x="440" y="${sy + 54}" class="n">L1 ledge</text><text x="258" y="${sy + 50}" class="n">arch (L1)</text><text x="520" y="${sy + 124}" class="n">L0 bed: walk under the arch</text>`;
// palette
const sw = [
  ["rim", RIM],
  ["lip", LIP],
  ["cliff face", FACE],
  ["bed", SAND],
  ["scorch", SCORCH],
  ["mire", MIRE],
  ["ruin stone", STONE],
  ["ruin face", STONE_FACE],
];
sw.forEach(([n, col], i) => {
  const x = 12 + i * 98;
  c += `<rect x="${x}" y="${PH + 170}" width="88" height="22" fill="${col}" stroke="${INK}" stroke-width="2"/><text x="${x + 2}" y="${PH + 198}" class="n">${n}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TH}" viewBox="0 0 ${W} ${TH}"><defs>
<style>.n{font:10px 'DejaVu Sans',sans-serif;fill:#f2e9de;paint-order:stroke;stroke:#0b0f14;stroke-width:3px}.t{font:bold 13px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:#0b0f14;stroke-width:3px}</style>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<radialGradient id="torch"><stop offset="0" stop-color="#ff9040" stop-opacity=".55"/><stop offset="1" stop-color="#ff9040" stop-opacity="0"/></radialGradient>
<linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1d6" stop-opacity=".35"/><stop offset=".5" stop-color="#fff1d6" stop-opacity="0"/><stop offset="1" stop-color="#080b10" stop-opacity=".35"/></linearGradient>
</defs>${s}${c}</svg>`;
const svgPath = join(out, "canyon.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3070-canyon.png")], {
  stdio: "ignore",
});
