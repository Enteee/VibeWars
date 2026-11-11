/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Studies for #3030 (portals), #3031 (energy barrier, destructible wall) and
// #3032 (fog, plumes, weather). Writes 3030-portals.png, 3031-barriers.png and
// 3032-atmosphere.png. Usage: node scripts/assets/world-elements-study.mjs <out-dir>
// (needs inkscape).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "world-study-"));

const CW = 250,
  CH = 150,
  COLS = 3,
  FLOOR = "#2c3442";

/** @type {(seed: number) => () => number} */
const rng = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};
/** @type {(x: number, y: number, r: number, col: string, op: number) => string} */
const glow = (x, y, r, col, op) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}" filter="url(#blur)"/>`;
/** @type {(x: number, y: number, r: number, col: string, op: number) => string} */
const puff = (x, y, r, col, op) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}"/>`;
/** @type {(x: number, y: number, rx: number, ry: number, col: string, w: number, op?: number) => string} */
const ring = (x, y, rx, ry, col, w, op = 1) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}"/>`;

// ---------- #3030 portals
const AQUA = "#5fe0d0";
/** @type {(on: boolean) => string} */
const portal = (on) => {
  const stone = (/** @type {number} */ i) => {
    const a = (i / 10) * Math.PI * 2;
    const x = 125 + Math.cos(a) * 46,
      y = 100 + Math.sin(a) * 19;
    return `<ellipse cx="${x + 2}" cy="${y + 5}" rx="8" ry="3" fill="#000" opacity=".35"/><path d="M${x - 6},${y + 3} L${x - 5},${y - 8} L${x + 5},${y - 8} L${x + 6},${y + 3}Z" fill="${i % 2 ? "#6f695f" : "#827b70"}" stroke="#23211d" stroke-width="1"/><path d="M${x - 5},${y - 8} L${x + 5},${y - 8}" stroke="#c4bdb0" stroke-width="1.5"/>${on ? `<rect x="${x - 1.5}" y="${y - 5}" width="3" height="4" fill="${AQUA}"/>` : ""}`;
  };
  const stones = Array.from({ length: 10 }, (_, i) => i)
    .sort((a, b) => Math.sin((a / 10) * 6.28) - Math.sin((b / 10) * 6.28))
    .map(stone)
    .join("");
  const dish = on
    ? `<ellipse cx="125" cy="100" rx="40" ry="16" fill="#0a2a30"/><ellipse cx="125" cy="100" rx="36" ry="14" fill="${AQUA}" opacity=".55"/>${ring(125, 100, 30, 11, "#eafffb", 2, 0.9)}${ring(125, 100, 20, 7, AQUA, 2.5)}${ring(125, 100, 10, 3.5, "#fff", 2)}<path d="M125,100 m-34,0 a34,13 0 0 1 34,-13 M125,100 m34,0 a34,13 0 0 1 -34,13" fill="none" stroke="#eafffb" stroke-width="2.5" stroke-linecap="round" opacity=".8"/><circle cx="125" cy="100" r="3" fill="#fff"/>`
    : `<ellipse cx="125" cy="100" rx="40" ry="16" fill="#12161d"/><ellipse cx="125" cy="100" rx="30" ry="11" fill="none" stroke="#3a4350" stroke-width="2" stroke-dasharray="5 4"/>`;
  const rise = on
    ? `<path d="M100,96 q-8,-22 2,-40 M125,92 q6,-30 0,-52 M150,96 q8,-20 -2,-38" stroke="${AQUA}" stroke-width="2.5" fill="none" opacity=".55" stroke-linecap="round"/>${glow(125, 90, 54, AQUA, 0.45)}`
    : "";
  return `${on ? glow(125, 100, 70, AQUA, 0.35) : ""}${dish}${rise}${stones}`;
};
const portals = [
  ["portal: on (swirl, rune stones, cool light)", portal(true)],
  ["portal: off (dim, stones dark)", portal(false)],
  [
    "portal: arrival burst (5 s cooldown ring)",
    glow(125, 90, 60, "#eafffb", 0.55) +
      portal(true) +
      ring(125, 100, 58, 23, "#eafffb", 3, 0.9) +
      ring(125, 100, 72, 29, AQUA, 2, 0.4),
  ],
];

// ---------- #3031 barriers
/** @type {(x: number) => string} */
const post = (x) =>
  `<ellipse cx="${x + 3}" cy="124" rx="11" ry="4" fill="#000" opacity=".4"/><path d="M${x - 8},122 L${x - 8},48 L${x + 8},48 L${x + 8},122Z" fill="#4b5a70" stroke="#1d242f" stroke-width="1.5"/><path d="M${x - 8},48 L${x + 8},48" stroke="#a9bbd0" stroke-width="2.5"/><path d="M${x + 2},48 L${x + 8},48 L${x + 8},122 L${x + 2},122Z" fill="#33404f"/><circle cx="${x}" cy="60" r="4" fill="${AQUA}" stroke="#12161d"/>`;
const barrierClosed = `${glow(125, 90, 60, AQUA, 0.35)}${post(60)}${post(190)}<path d="M68,56 L182,56 L182,122 L68,122Z" fill="${AQUA}" opacity=".28"/><g stroke="#eafffb" stroke-width="1.2" opacity=".65">${Array.from({ length: 8 }, (_, i) => `<path d="M68,${64 + i * 8} q14,-4 28,0 t28,0 t28,0 t28,0"/>`).join("")}</g><path d="M68,56 L182,56" stroke="#eafffb" stroke-width="3"/><path d="M68,122 L182,122" stroke="${AQUA}" stroke-width="3"/><path d="M90,56 L90,122 M125,56 L125,122 M160,56 L160,122" stroke="#eafffb" stroke-width="1" opacity=".25"/>`;
const barrierOpen = `${post(60)}${post(190)}<path d="M68,56 L182,56 L182,122 L68,122Z" fill="none" stroke="${AQUA}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".4"/>`;
const barrierBlockedLos = `${barrierClosed}<g opacity=".9"><circle cx="125" cy="84" r="9" fill="#e04a4a" stroke="#fff" stroke-width="2"/><ellipse cx="125" cy="108" rx="12" ry="4" fill="#000" opacity=".4"/></g>${ring(125, 108, 14, 5, "#fff", 1.5)}`;

/** @type {(cx: number, cy: number, w: number, hp: number) => string} hp 0..1 */
const bar = (cx, cy, w, hp) =>
  `<rect x="${cx - w / 2}" y="${cy}" width="${w}" height="7" fill="#12161d" stroke="#000"/><rect x="${cx - w / 2 + 1}" y="${cy + 1}" width="${(w - 2) * hp}" height="5" fill="#59c26a"/>`;
// A wall block: stone face, lit top, cracks by damage
/** @type {(dmg: number) => string} */
const wall = (dmg) => {
  const R = rng(5);
  let cracks = "";
  for (let i = 0; i < dmg * 4; i++) {
    let x = 70 + R() * 110,
      y = 62 + R() * 40;
    cracks += `<path d="M${x.toFixed(0)},${y.toFixed(0)} l${(R() * 12 - 6).toFixed(0)},${(8 + R() * 8).toFixed(0)} l${(R() * 12 - 6).toFixed(0)},${(6 + R() * 8).toFixed(0)}" fill="none" stroke="#14120f" stroke-width="1.6"/>`;
  }
  return `<ellipse cx="130" cy="124" rx="68" ry="8" fill="#000" opacity=".4"/><path d="M62,122 L62,58 L188,58 L188,122Z" fill="#6f695f" stroke="#23211d" stroke-width="2"/><path d="M62,58 L72,46 L178,46 L188,58Z" fill="#a69f92" stroke="#23211d" stroke-width="1.5"/><path d="M62,58 L188,58" stroke="#e6dfd0" stroke-width="2"/><path d="M62,84 L188,84 M105,58 L105,84 M150,84 L150,122 M90,84 L90,122" stroke="#4d4943" stroke-width="1.5"/>${cracks}`;
};
const rubble = `<ellipse cx="125" cy="118" rx="70" ry="10" fill="#000" opacity=".35"/>${[
  [80, 114, 11],
  [110, 118, 14],
  [145, 114, 12],
  [170, 118, 9],
  [125, 106, 9],
  [95, 104, 7],
]
  .map(
    ([x = 0, y = 0, r = 0], i) =>
      `<path d="M${x - r},${y} L${x - r * 0.7},${y - r * 0.8} L${x + r * 0.3},${y - r} L${x + r},${y - r * 0.2} L${x + r * 0.8},${y}Z" fill="${i % 2 ? "#827b70" : "#6f695f"}" stroke="#23211d"/><path d="M${x - r * 0.7},${y - r * 0.8} L${x + r * 0.3},${y - r}" stroke="#e6dfd0" stroke-width="1.4"/>`,
  )
  .join(
    "",
  )}${puff(90, 96, 18, "#c9c0b0", 0.5)}${puff(130, 84, 22, "#d8d0c0", 0.4)}${puff(165, 98, 16, "#c9c0b0", 0.45)}`;
const barriers = [
  ["energy barrier: closed (shimmering curtain)", barrierClosed],
  ["energy barrier: open (posts, faint ghost)", barrierOpen],
  ["closed barrier: sight passes, bodies do not", barrierBlockedLos],
  ["destructible wall: whole (full bar on hover)", wall(0) + bar(125, 30, 60, 1)],
  ["destructible wall: damaged (cracks)", wall(2) + bar(125, 30, 60, 0.45)],
  ["destructible wall: crumbled (rubble, dust)", rubble],
];

// ---------- #3032 atmosphere
const fogBank = `${puff(80, 100, 34, "#c8d4e4", 0.22)}${puff(120, 92, 40, "#d0dbe8", 0.26)}${puff(165, 100, 36, "#c8d4e4", 0.22)}${puff(140, 112, 30, "#d8e2ee", 0.2)}${puff(95, 115, 28, "#d8e2ee", 0.18)}<g opacity=".9">${[
  [70, 124],
  [180, 124],
]
  .map(
    ([x = 0, y = 0]) =>
      `<ellipse cx="${x}" cy="${y}" rx="18" ry="5" fill="#000" opacity=".3"/><rect x="${x - 8}" y="${y - 30}" width="16" height="30" fill="#4b5a70" stroke="#1d242f"/>`,
  )
  .join("")}</g>${puff(125, 106, 44, "#d0dbe8", 0.22)}`;
const smoke = `<ellipse cx="125" cy="122" rx="30" ry="8" fill="#000" opacity=".35"/><path d="M105,122 L108,100 L142,100 L145,122Z" fill="#5e584f" stroke="#23211d"/><path d="M108,100 L142,100" stroke="#a69f92" stroke-width="2.5"/><ellipse cx="125" cy="100" rx="17" ry="5" fill="#14100e"/>${[
  [125, 90, 10, "#5a5650", 0.7],
  [132, 74, 14, "#6a665f", 0.6],
  [122, 56, 18, "#7a766f", 0.5],
  [134, 36, 22, "#8a867f", 0.4],
  [120, 18, 24, "#9a968f", 0.28],
]
  .map(([x, y, r, c, o]) => puff(Number(x), Number(y), Number(r), String(c), Number(o)))
  .join("")}`;
const steam = `<ellipse cx="125" cy="122" rx="30" ry="8" fill="#000" opacity=".35"/><path d="M100,122 L104,104 L146,104 L150,122Z" fill="#6a7a8a" stroke="#1d242f"/><path d="M104,104 L146,104" stroke="#c9d6e2" stroke-width="2.5"/><ellipse cx="125" cy="104" rx="20" ry="5" fill="#2a3440"/>${[
  [120, 92, 9, 0.8],
  [132, 76, 13, 0.7],
  [118, 58, 17, 0.55],
  [132, 40, 21, 0.4],
  [120, 22, 24, 0.26],
]
  .map(([x = 0, y = 0, r = 0, o = 0]) => puff(x, y, r, "#f2f8ff", o))
  .join("")}`;
/** @type {(n: number, seed: number, snow: boolean) => string} */
const weather = (n, seed, snow) => {
  const R = rng(seed);
  let s = `<rect width="${CW}" height="${CH}" fill="#0a1220" opacity="${snow ? 0.1 : 0.3}"/>`;
  for (let i = 0; i < n; i++) {
    const x = R() * CW,
      y = R() * CH;
    s += snow
      ? `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 + R() * 1.4).toFixed(1)}" fill="#fff" opacity=".85"/>`
      : `<path d="M${x.toFixed(0)},${y.toFixed(0)} l-3,10" stroke="#bcd4f0" stroke-width="1.1" opacity=".6"/>`;
  }
  if (!snow)
    for (let i = 0; i < n / 6; i++)
      s += `<ellipse cx="${(R() * CW).toFixed(0)}" cy="${(70 + R() * 70).toFixed(0)}" rx="5" ry="1.8" fill="none" stroke="#bcd4f0" stroke-width=".8" opacity=".6"/>`;
  return s;
};
const body2 = `<ellipse cx="125" cy="120" rx="12" ry="4" fill="#000" opacity=".4"/><circle cx="125" cy="102" r="12" fill="#59c2ff" stroke="#fff" stroke-width="2"/>`;
const atmosphere = [
  ["fog bank: drifts over ground, under bodies", fogBank],
  ["plume: smoke (grey, rises, thins)", smoke],
  ["plume: steam (white, rises, fades)", steam],
  ["weather: rain 0.5 (streaks, ripples)", weather(70, 4, false) + body2],
  ["weather: rain 1.0", weather(160, 4, false) + body2],
  ["weather: snow 0.6 (flakes, no ground tint)", weather(60, 9, true) + body2],
];

/** @type {(name: string, cells: string[][]) => void} */
function sheet(name, cells) {
  const rows = Math.ceil(cells.length / COLS);
  const TW = COLS * CW,
    TH = rows * CH;
  let body = "";
  cells.forEach(([title, svg], i) => {
    const x = (i % COLS) * CW,
      y = Math.floor(i / COLS) * CH;
    body += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden"><rect width="${CW}" height="${CH}" fill="${FLOOR}" stroke="#141a24"/>${svg}<text x="5" y="14" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${title}</text></svg></g>`;
  });
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>${body}</svg>`;
  const svgPath = join(tmp, `${name}.svg`);
  writeFileSync(svgPath, doc);
  execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, `${name}.png`)], {
    stdio: "ignore",
  });
}
sheet("3030-portals", portals);
sheet("3031-barriers", barriers);
sheet("3032-atmosphere", atmosphere);
