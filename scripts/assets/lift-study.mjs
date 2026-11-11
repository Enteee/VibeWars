/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3079: lifts. A platform in a frame carries bodies between two
// layers: at rest low, travelling up, at rest high, travelling down, a body
// carried at the platform's height, the timer and lever drives, and the
// closed ends while it travels.
// Usage: node scripts/assets/lift-study.mjs <out-dir>   (needs inkscape)
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
  STONE = "#a0b2c7",
  STONE_FACE = "#5f6f86",
  IRON = "#7a8aa4",
  WOOD = "#a07a48",
  WOOD_DARK = "#5a4126",
  BRASS = "#e8c27a",
  TEXT = 'font-family="DejaVu Sans,sans-serif"';

/** @type {{title: string, body: string}[]} */
const cells = [];
/** @type {(title: string, body: string) => number} */
const cell = (title, body) => cells.push({ title, body });

const LOW = 118, // platform top when resting low (flush with the low floor)
  HIGH = 58; // and when resting high (flush with the upper deck)
const px = 72,
  pw = 56;

/** The two layers and the frame: upper deck left, low floor right, a dark shaft between. */
const frame = `<rect x="14" y="${HIGH}" width="58" height="82" fill="${STONE_FACE}" stroke="${INK}" stroke-width="2"/><rect x="14" y="${HIGH - 6}" width="58" height="8" fill="${STONE}" stroke="${INK}" stroke-width="2"/><rect x="128" y="${LOW}" width="58" height="22" fill="${STONE_FACE}" stroke="${INK}" stroke-width="2"/><rect x="128" y="${LOW - 6}" width="58" height="8" fill="${STONE}" stroke="${INK}" stroke-width="2"/><rect x="72" y="36" width="56" height="106" fill="#080b10" stroke="${INK}" stroke-width="2"/><rect x="68" y="30" width="6" height="112" fill="${IRON}" stroke="${INK}" stroke-width="1.5"/><rect x="126" y="30" width="6" height="112" fill="${IRON}" stroke="${INK}" stroke-width="1.5"/><rect x="66" y="26" width="68" height="8" fill="${IRON}" stroke="${INK}" stroke-width="2"/>`;

/** @type {(top: number) => string} Platform with its top at `top`, hung on two chains. */
const platform = (top) =>
  `<path d="M80,34 L80,${top} M120,34 L120,${top}" stroke="${BRASS}" stroke-width="1.5" stroke-dasharray="3 2"/><rect x="${px}" y="${top}" width="${pw}" height="9" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/><rect x="${px}" y="${top - 5}" width="${pw}" height="6" fill="${WOOD}" stroke="${INK}" stroke-width="1.5"/><path d="M82,${top - 5} V${top + 1} M92,${top - 5} V${top + 1} M102,${top - 5} V${top + 1} M112,${top - 5} V${top + 1}" stroke="#3a2816" stroke-width="1"/>`;

/** @type {(cx: number, cy: number, dir: number) => string} A chevron pair: dir -1 up, 1 down. */
const chevron = (cx, cy, d) => {
  const dir = -d;
  return `<path d="M${cx - 7},${cy + 3 * dir} L${cx},${cy - 3 * dir} L${cx + 7},${cy + 3 * dir} M${cx - 7},${cy + 3 * dir + 8 * dir} L${cx},${cy - 3 * dir + 8 * dir} L${cx + 7},${cy + 3 * dir + 8 * dir}" fill="none" stroke="${BRASS}" stroke-width="2.5" stroke-linejoin="round"/>`;
};

/** @type {(top: number) => string} Closed ends: an iron bar gate across each side while it travels. */
const gates = (top) => {
  let s = "";
  for (const x of [74, 124])
    s += `<path d="M${x},${top - 22} V${top - 5}" stroke="${INK}" stroke-width="5"/><path d="M${x},${top - 22} V${top - 5}" stroke="${IRON}" stroke-width="2.5"/>`;
  return s + `<path d="M74,${top - 22} H126" stroke="${IRON}" stroke-width="2" opacity=".0"/>`;
};

/** @type {(x: number, top: number) => string} A body standing on a surface, with a floor shadow. */
const body = (x, top) =>
  `<ellipse cx="${x}" cy="${LOW + 4}" rx="9" ry="3" fill="#080b10" opacity=".6"/><circle cx="${x}" cy="${top - 12}" r="8" fill="#e06a5a" stroke="${INK}" stroke-width="2"/><rect x="${x - 6}" y="${top - 5}" width="12" height="6" fill="#b04a3c" stroke="${INK}" stroke-width="1.5"/>`;

cell(
  "lift: rests low",
  `${frame}${platform(LOW)}<text x="50" y="164" ${TEXT} font-size="10" fill="#b8c4d6">ends open, step on</text>`,
);
cell(
  "travelling up",
  `${frame}${platform(88)}${gates(88)}${chevron(100, 62, -1)}<text x="50" y="164" ${TEXT} font-size="10" fill="#b8c4d6">ends closed, chevrons</text>`,
);
cell(
  "lift: rests high",
  `${frame}${platform(HIGH)}<text x="50" y="164" ${TEXT} font-size="10" fill="#b8c4d6">ends open, step off</text>`,
);
cell(
  "travelling down",
  `${frame}${platform(88)}${gates(88)}${chevron(100, 56, 1)}<text x="50" y="164" ${TEXT} font-size="10" fill="#b8c4d6">same, chevrons point down</text>`,
);
cell(
  "carried: body at lift height",
  `${frame}${platform(88)}${body(100, 83)}${gates(88)}<text x="40" y="164" ${TEXT} font-size="10" fill="#b8c4d6">body rides the platform</text>`,
);

// timer drive: a strip of rest / travel segments
{
  const seg = [
    [4, "rest"],
    [2, "go"],
    [4, "rest"],
    [2, "go"],
  ];
  let x = 14,
    s = "";
  for (const [secs, name] of seg) {
    const w = Number(secs) * 12;
    const go = name === "go";
    s += `<rect x="${x}" y="${go ? 62 : 76}" width="${w}" height="${go ? 28 : 14}" fill="${go ? BRASS : STONE_FACE}" stroke="${INK}" stroke-width="2"/><text x="${x + 3}" y="${go ? 80 : 87}" ${TEXT} font-size="9" fill="${INK}">${secs}s</text>`;
    x += w;
  }
  s += `<circle cx="100" cy="132" r="18" fill="${STONE}" stroke="${INK}" stroke-width="2"/><path d="M100,132 V120 M100,132 L109,137" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><text x="14" y="164" ${TEXT} font-size="10" fill="#b8c4d6">timer: clock, rest / travel</text>`;
  cell("timer lift", s);
}

// lever drive: post with a handle, flipped
{
  const lever = (/** @type {number} */ x, /** @type {number} */ dir) =>
    `<rect x="${x - 14}" y="96" width="28" height="26" fill="${STONE_FACE}" stroke="${INK}" stroke-width="2"/><path d="M${x},106 L${x + 18 * dir},80" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M${x},106 L${x + 18 * dir},80" stroke="${IRON}" stroke-width="3.5" stroke-linecap="round"/><circle cx="${x + 18 * dir}" cy="80" r="5" fill="${BRASS}" stroke="${INK}" stroke-width="2"/>`;
  cell(
    "lever lift: each flip = other level",
    `${lever(54, -1)}${lever(146, 1)}<path d="M80,100 H120 M112,94 L120,100 L112,106" fill="none" stroke="${BRASS}" stroke-width="2.5"/><text x="30" y="144" ${TEXT} font-size="10" fill="#b8c4d6">left</text><text x="130" y="144" ${TEXT} font-size="10" fill="#b8c4d6">right</text>`,
  );
}

// plan view: resting vs travelling ends
{
  const plan = (/** @type {boolean} */ closed, /** @type {number} */ x) => {
    let s = `<rect x="${x}" y="60" width="64" height="44" fill="#080b10" stroke="${INK}" stroke-width="2"/><rect x="${x + 6}" y="66" width="52" height="32" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>`;
    if (closed)
      for (const ex of [x - 2, x + 62])
        s += `<path d="M${ex},60 V104" stroke="${INK}" stroke-width="6"/><path d="M${ex},60 V104" stroke="${IRON}" stroke-dasharray="5 3" stroke-width="3"/>`;
    return s;
  };
  cell(
    "plan: open / closed ends",
    `${plan(false, 14)}${plan(true, 122)}<text x="14" y="124" ${TEXT} font-size="10" fill="#b8c4d6">rest</text><text x="122" y="124" ${TEXT} font-size="10" fill="#b8c4d6">travel</text>`,
  );
}

const rows = Math.ceil(cells.length / COLS);
const TW = COLS * CW,
  TH = rows * CH;
let b = "";
cells.forEach((c, i) => {
  const x = (i % COLS) * CW,
    y = Math.floor(i / COLS) * CH;
  b += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden"><rect width="${CW}" height="${CH}" fill="${GROUND}" stroke="#141a24"/>${c.body}<text x="5" y="14" ${TEXT} font-size="11" fill="#dfe6f0">${c.title}</text></svg></g>`;
});
const svgPath = join(out, "lift.svg");
writeFileSync(
  svgPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}">${b}</svg>`,
);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3079-lift.png")], {
  stdio: "ignore",
});
