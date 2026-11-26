/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3068: switched structures. Drawbridge (down, up), cuttable rope
// bridge (whole, cut), collapsing floor (whole, cracked, broken, fallen),
// portcullis (shut, open) and the secret door (shut, open).
// Usage: node scripts/assets/switched-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const CW = 200,
  CH = 170,
  COLS = 4,
  GROUND = "#26303f",
  INK = "#0b0f14",
  WATER = "#18304a";

/** @type {(seed: number) => () => number} */
const rng = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

const WOOD = "#a07a48",
  WOOD_DARK = "#5a4126",
  WOOD_LINE = "#3a2816",
  ROPE = "#d8b078";

/** @type {(x: number, y: number, w: number, h: number, fill?: string) => string} Planks across a deck, art only. */
const planks = (x, y, w, h, fill = WOOD) => {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${INK}" stroke-width="2"/>`;
  for (let r = y + 7; r < y + h; r += 7)
    s += `<path d="M${x},${r} H${x + w}" stroke="${WOOD_LINE}" stroke-width="1.3"/>`;
  return s;
};

const shadow = (
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ w,
  /** @type {number} */ h,
) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#080b10" opacity=".55"/>`;

const channel = `<rect x="0" y="62" width="${CW}" height="62" fill="${WATER}"/><rect x="0" y="62" width="${CW}" height="62" filter="url(#grain)" fill="#2f6a8c" opacity=".2"/><path d="M0,62 H${CW} M0,124 H${CW}" stroke="#8fb8d6" stroke-width="3"/>`;

/** @type {{title: string, body: string}[]} */
const cells = [];
/** @type {(title: string, body: string) => number} */
const cell = (title, body) => cells.push({ title, body });

// ---- drawbridge: hinge on the south bank. Down it spans the water; up it stands as a slab.
const chains = (
  /** @type {number} */ x1,
  /** @type {number} */ x2,
  /** @type {number} */ y1,
  /** @type {number} */ y2,
) =>
  `<path d="M${x1},${y1} L${x1 - 8},${y2} M${x2},${y1} L${x2 + 8},${y2}" stroke="#7a8aa4" stroke-width="2.5" stroke-dasharray="3 2"/>`;
cell(
  "drawbridge: down (a deck)",
  `${channel}${shadow(78, 70, 44, 62)}${planks(70, 56, 44, 76)}<path d="M68,56 V132 M116,56 V132" stroke="#d8b078" stroke-width="2.5"/><rect x="64" y="124" width="56" height="12" fill="#5f6f86" stroke="${INK}" stroke-width="2"/><circle cx="76" cy="130" r="3" fill="#7a8aa4"/><circle cx="108" cy="130" r="3" fill="#7a8aa4"/>${chains(74, 110, 52, 36)}<rect x="60" y="30" width="64" height="14" fill="#5f6f86" stroke="${INK}" stroke-width="2"/>`,
);
cell(
  "drawbridge: up (stands at its hinge)",
  `${channel}<rect x="64" y="124" width="56" height="12" fill="#5f6f86" stroke="${INK}" stroke-width="2"/>${shadow(96, 104, 28, 20)}<path d="M70,124 V98 H114 V124Z" fill="#5a3a1c" stroke="${INK}" stroke-width="2"/><path d="M70,98 H114" stroke="#c28a4a" stroke-width="3"/><path d="M82,98 V124 M92,98 V124 M102,98 V124" stroke="#3a2210" stroke-width="2"/><path d="M70,108 H114 M70,118 H114" stroke="#2a2a30" stroke-width="4"/>${chains(74, 110, 98, 36)}<rect x="60" y="30" width="64" height="14" fill="#5f6f86" stroke="${INK}" stroke-width="2"/><text x="124" y="84" font-family="DejaVu Sans,sans-serif" font-size="10" fill="#b8c4d6">open water</text>`,
);

// ---- rope bridge: one lane of planks between two anchor posts
const anchor = (/** @type {number} */ x, /** @type {number} */ y) =>
  `<rect x="${x}" y="${y}" width="16" height="14" fill="#5f6f86" stroke="${INK}" stroke-width="2"/><rect x="${x + 5}" y="${y - 6}" width="6" height="8" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="1.5"/>`;
cell(
  "rope bridge: whole",
  `${channel}${shadow(80, 70, 36, 60)}${planks(72, 58, 36, 72)}<path d="M70,50 V136 M110,50 V136" stroke="${ROPE}" stroke-width="2.5" stroke-dasharray="6 3"/>${anchor(72, 40)}${anchor(72, 134)}`,
);
{
  const R = rng(4);
  /** @type {(dir: number, y0: number) => string} A half hanging from its anchor: planks swing down along the bank. */
  const half = (dir, y0) => {
    let s = `<path d="M72,${y0} q${-6 * dir},${10 * dir} ${-2 * dir},${20 * dir}" fill="none" stroke="${ROPE}" stroke-width="2.5"/><path d="M108,${y0} q${6 * dir},${10 * dir} ${2 * dir},${20 * dir}" fill="none" stroke="${ROPE}" stroke-width="2.5"/>`;
    for (let i = 0; i < 2; i++) {
      const yy = y0 + dir * (8 + i * 8);
      const wob = (R() - 0.5) * 6;
      s += `<rect x="${74 + wob + i * 0.8}" y="${yy - (dir < 0 ? 5 : 0)}" width="${32 - i * 1.5}" height="5" fill="${WOOD}" stroke="${INK}" stroke-width="1.3" transform="rotate(${(R() - 0.5) * 16} 90 ${yy})"/>`;
    }
    return s;
  };
  cell(
    "rope bridge: cut (two halves hang)",
    `${channel}${half(1, 56)}${half(-1, 130)}${anchor(72, 40)}${anchor(72, 134)}<text x="122" y="94" font-family="DejaVu Sans,sans-serif" font-size="10" fill="#b8c4d6">open water</text>`,
  );
}

// ---- collapsing floor: a ruin deck; cracks grow with each crossing
/** @type {(stage: number) => string} */
const floor = (stage) => {
  const R = rng(17);
  let s = `${shadow(46, 56, 112, 78)}<rect x="40" y="40" width="112" height="78" fill="#a0b2c7" stroke="${INK}" stroke-width="2"/><rect x="40" y="118" width="112" height="18" fill="#5f6f86" stroke="${INK}" stroke-width="2"/><rect x="41" y="115" width="110" height="3" fill="#e4edf7"/>`;
  for (let c = 40; c < 152; c += 28)
    s += `<path d="M${c},40 V118" stroke="#8fa4bd" stroke-width="1"/>`;
  for (let c = 40; c < 118; c += 26)
    s += `<path d="M40,${c} H152" stroke="#8fa4bd" stroke-width="1"/>`;
  const crack = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ n) => {
    let d = `M${x},${y}`;
    for (let i = 0; i < n; i++) d += ` l${(R() - 0.4) * 16},${6 + R() * 8}`;
    return `<path d="${d}" fill="none" stroke="#1c2330" stroke-width="2.2" stroke-linejoin="round"/>`;
  };
  if (stage >= 1) s += crack(80, 40, 6) + crack(120, 66, 4);
  if (stage >= 2) {
    s += crack(60, 60, 6) + crack(100, 84, 5) + crack(140, 44, 5);
    s += `<polygon points="96,84 118,80 122,98 102,104" fill="#10151c" stroke="${INK}" stroke-width="1.5"/><polygon points="52,96 70,92 72,108 56,112" fill="#10151c" stroke="${INK}" stroke-width="1.5"/>`;
    s += `<path d="M96,84 L118,80" stroke="#e4edf7" stroke-width="1.5"/>`;
  }
  return s;
};
cell("collapsing floor: whole", floor(0));
cell("after 1 crossing: cracks", floor(1));
cell("after 2: wide cracks, chips", floor(2));
/** @type {[number, number, number][]} */
const rubbleAt = [
  [60, 100, 14],
  [100, 114, 10],
  [128, 96, 12],
  [84, 80, 8],
];
cell(
  "fallen: a gap, rubble below",
  `<rect x="30" y="30" width="140" height="110" fill="#10151c"/><rect x="30" y="30" width="140" height="28" fill="#0a0d12"/><path d="M30,140 H170" stroke="#a9bbd0" stroke-width="3"/><path d="M30,30 H170 V140 H30Z" fill="none" stroke="${INK}" stroke-width="2"/>${rubbleAt
    .map(
      ([x, y, r]) =>
        `<polygon points="${x - r},${y} ${x - r * 0.3},${y - r * 0.8} ${x + r * 0.7},${y - r * 0.4} ${x + r},${y + r * 0.4} ${x - r * 0.4},${y + r * 0.7}" fill="#6f8099" stroke="${INK}" stroke-width="1.3"/>`,
    )
    .join(
      "",
    )}<polygon points="30,30 40,30 40,54 30,46" fill="#a0b2c7"/><polygon points="170,30 160,30 160,50 170,44" fill="#a0b2c7"/>`,
);

// ---- gates: portcullis and the secret door, in the rock wall
const wall = (/** @type {number} */ x, /** @type {number} */ w) =>
  `<rect x="${x + 6}" y="50" width="${w}" height="90" fill="#080b10" opacity=".5"/><rect x="${x}" y="44" width="${w}" height="94" fill="#3a4658" stroke="#3b4759" stroke-width="2"/><rect x="${x}" y="44" width="${w}" height="22" fill="#4b5a70" stroke="${INK}" stroke-width="2"/><rect x="${x + 1}" y="64" width="${w - 2}" height="3" fill="#a9bbd0"/>`;
/** @type {(x: number, y: number, w: number, h: number, up: number) => string} An iron grid, raised by `up` px. */
const grid = (x, y, w, h, up) => {
  let s = `<g transform="translate(0 ${-up})">`;
  for (let c = x + 4; c < x + w; c += 10)
    s += `<path d="M${c},${y} V${y + h}" stroke="${INK}" stroke-width="5"/><path d="M${c},${y} V${y + h}" stroke="#7a8aa4" stroke-width="2.5"/>`;
  for (const r of [y + 8, y + h * 0.45, y + h - 6])
    s += `<path d="M${x},${r} H${x + w}" stroke="${INK}" stroke-width="5"/><path d="M${x},${r} H${x + w}" stroke="#5f6f86" stroke-width="2.5"/>`;
  for (let c = x + 4; c < x + w; c += 10)
    s += `<polygon points="${c - 3},${y + h} ${c + 3},${y + h} ${c},${y + h + 7}" fill="#9fb0c8" stroke="${INK}" stroke-width="1"/>`;
  return s + `</g>`;
};
const arch = (/** @type {boolean} */ dark) =>
  `${wall(30, 140)}<rect x="68" y="76" width="64" height="62" fill="${dark ? "#05070a" : "#0c1018"}" stroke="${INK}" stroke-width="2"/><path d="M64,138 V74 H136 V138" fill="none" stroke="#8fa4bd" stroke-width="3"/>`;
cell("portcullis: shut", arch(false) + grid(70, 78, 60, 56, 0));
cell(
  "portcullis: open (raised)",
  arch(true) +
    `<rect x="64" y="66" width="72" height="12" fill="#3a4658"/>` +
    grid(70, 78, 60, 56, 46).replace("<g ", `<g clip-path="url(#up)" `),
);
cell(
  "secret door: shut = the rock wall",
  `${wall(30, 140)}<text x="40" y="164" font-family="DejaVu Sans,sans-serif" font-size="10" fill="#b8c4d6">no seam, no tell</text>`,
);
cell(
  "secret door: open (a dark opening)",
  `${wall(30, 140)}<rect x="78" y="76" width="44" height="62" fill="#05070a" stroke="${INK}" stroke-width="2"/><path d="M78,76 H122" stroke="#a9bbd0" stroke-width="2"/><path d="M122,76 V138" stroke="#2c3748" stroke-width="3"/>`,
);

const rows = Math.ceil(cells.length / COLS);
const TW = COLS * CW,
  TH = rows * CH;
let body = "";
cells.forEach((c, i) => {
  const x = (i % COLS) * CW,
    y = Math.floor(i / COLS) * CH;
  body += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden"><rect width="${CW}" height="${CH}" fill="${GROUND}" stroke="#141a24"/>${c.body}<text x="5" y="14" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${c.title}</text></svg></g>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="6"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter><clipPath id="up"><rect x="68" y="76" width="64" height="62"/></clipPath></defs>${body}</svg>`;
const svgPath = join(out, "switched.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3068-switched.png")], {
  stdio: "ignore",
});
