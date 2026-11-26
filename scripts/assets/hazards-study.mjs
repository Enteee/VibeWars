/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3053: timed hazards (vent, gas spout, rockfall, rolling rocks) by
// phase, and the interactables (lever, door, pressure plate) by state.
// Usage: node scripts/assets/hazards-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const CW = 250,
  CH = 150,
  COLS = 3,
  FLOOR = "#2c3442";

/** @type {(seed: number) => () => number} */
const rng = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

// A faceted rock: lit NW facets, mid body, dark SE facets, a cast shadow, a lit rim.
/** @type {(cx: number, cy: number, r: number, seed: number, rot?: number) => string} */
function rock(cx, cy, r, seed, rot = 0) {
  const R = rng(seed);
  const n = 8;
  /** @type {[number, number][]} */
  const pts = [];
  for (let j = 0; j < n; j++) {
    const a = rot + (j / n) * Math.PI * 2;
    const rr = r * (0.78 + R() * 0.3);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]);
  }
  const inner = pts.map(([px, py]) => [
    cx + (px - cx) * 0.5 - r * 0.12,
    cy + (py - cy) * 0.5 - r * 0.2,
  ]);
  /** @type {(v: number) => string} */
  const f1 = (v) => v.toFixed(1);
  /** @type {(q: number) => string} */
  const P = (q) => pts[q % n].map(f1).join(",");
  const I = (q) => inner[q % n].map(f1).join(",");
  let facets = "";
  for (let j = 0; j < n; j++) {
    const mid = rot + ((j + 0.5) / n) * Math.PI * 2;
    const lit = -(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2; // 1 = faces NW
    const tone = lit > 0.45 ? "#8f887b" : lit > 0 ? "#6f695f" : lit > -0.5 ? "#4d4943" : "#34312c";
    facets += `<path d="M${P(j)} L${P(j + 1)} L${I(j + 1)} L${I(j)}Z" fill="${tone}" stroke="#23211d" stroke-width="1" stroke-linejoin="round"/>`;
  }
  // the top plane: lit, split in two by a ridge so it is not a flat disc
  const top = inner.map((v) => v.map(f1).join(",")).join(" ");
  facets += `<polygon points="${top}" fill="#b4ad9f" stroke="#23211d" stroke-width="1"/><path d="M${I(0)} L${I(2)} L${I(4)} L${I(5)}Z" fill="#9a9285" opacity=".8"/><path d="M${I(3)} L${I(5)} L${I(7)}" fill="none" stroke="#23211d" stroke-width="1"/>`;
  const crack = `<path d="M${f1(cx + r * 0.1)},${f1(cy - r * 0.1)} l${f1(r * 0.25)},${f1(r * 0.3)} l${f1(-r * 0.12)},${f1(r * 0.25)} l${f1(r * 0.1)},${f1(r * 0.15)}" fill="none" stroke="#1c1a17" stroke-width="1.3"/>`;
  const shadow = `<ellipse cx="${(cx + r * 0.35).toFixed(1)}" cy="${(cy + r * 0.75).toFixed(1)}" rx="${(r * 1.05).toFixed(1)}" ry="${(r * 0.38).toFixed(1)}" fill="#000" opacity=".4"/>`;
  const rim = `<path d="M${P(4)} L${P(5)} L${P(6)} L${P(7)}" fill="none" stroke="#e6dfd0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`;
  return `${shadow}<g>${facets}${crack}</g>${rim}`;
}

/** @type {(x: number, y: number, h: number, w: number) => string} A flame tongue. */
const flame = (x, y, h, w) =>
  `<path d="M${x - w},${y} C${x - w * 1.2},${y - h * 0.4} ${x - w * 0.3},${y - h * 0.6} ${x},${y - h} C${x + w * 0.3},${y - h * 0.6} ${x + w * 1.2},${y - h * 0.4} ${x + w},${y}Z"/>`;

/** @type {{title: string, light: null, body: string}[]} */
const cells = [];
/** @type {(title: string, light: null, body: string) => number} */
const cell = (title, light, body) => cells.push({ title, light, body });
const glow = (x, y, r, col, op) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}" filter="url(#blur)"/>`;
const ring = (x, y, rx, ry, col, w, op = 1) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}"/>`;
/** @type {(x: number, y: number, n: number, seed: number, col?: string) => string} */
const sparks = (x, y, n, seed, col = "#ffd23d") => {
  const R = rng(seed);
  let s = "";
  for (let j = 0; j < n; j++)
    s += `<rect x="${(x + (R() - 0.5) * 50).toFixed(0)}" y="${(y - R() * 60).toFixed(0)}" width="2" height="2" fill="${col}"/>`;
  return s;
};

// ---- fire vent: cracked stone collar over a dark hole
const ventBase = (heat) => `
  <ellipse cx="125" cy="108" rx="40" ry="17" fill="#000" opacity=".35" transform="translate(5 4)"/>
  <ellipse cx="125" cy="104" rx="38" ry="16" fill="#5e584f" stroke="#2a2723" stroke-width="1.5"/>
  <path d="M90,100 A38,16 0 0 1 125,88" fill="none" stroke="#a69f92" stroke-width="3"/>
  <ellipse cx="125" cy="104" rx="26" ry="10" fill="#14100e"/>
  <ellipse cx="125" cy="104" rx="26" ry="10" fill="#ff4a12" opacity="${heat}"/>
  <path d="M96,96 l6,5 M150,98 l-7,5 M110,117 l3,-6 M140,116 l-3,-6" stroke="#2a2723" stroke-width="1.2"/>`;
cell(
  "fire vent: idle (smoulder)",
  null,
  ventBase(0.25) +
    `<ellipse cx="125" cy="100" rx="8" ry="3" fill="#ff8a3d" opacity=".5"/>` +
    `<path d="M120,92 q-6,-14 2,-24 M130,92 q6,-12 -1,-22" stroke="#9a8f86" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>`,
);
cell(
  "fire vent: telegraph (glow, sparks)",
  null,
  glow(125, 104, 46, "#ff7a30", 0.5) +
    ventBase(0.8) +
    `<g fill="#ff5a1f" opacity=".85">${flame(125, 100, 26, 9)}</g><g fill="#ffd23d">${flame(125, 100, 14, 5)}</g>` +
    sparks(125, 80, 9, 3) +
    ring(125, 104, 56, 24, "#ffb03d", 3, 0.9),
);
cell(
  "fire vent: active (column of flame)",
  null,
  glow(125, 70, 80, "#ff7a30", 0.55) +
    ventBase(1) +
    `<g fill="#ff3a0a" opacity=".9">${flame(125, 100, 96, 22)}</g><g fill="#ff9a20">${flame(125, 100, 78, 15)}</g><g fill="#ffe27a">${flame(125, 100, 52, 8)}</g><g fill="#ff5a1f" opacity=".8">${flame(100, 98, 40, 7)}${flame(150, 98, 44, 7)}</g>` +
    sparks(125, 40, 16, 8) +
    ring(125, 104, 56, 24, "#ffb03d", 3),
);

// ---- gas spout: mossy fissure
const gasBase = `
  <ellipse cx="125" cy="108" rx="40" ry="12" fill="#000" opacity=".3" transform="translate(4 3)"/>
  <path d="M82,108 Q95,92 125,96 Q158,92 170,108 Q150,118 125,116 Q100,118 82,108Z" fill="#5e584f" stroke="#2a2723" stroke-width="1.5"/>
  <path d="M82,108 Q95,92 125,96" fill="none" stroke="#a69f92" stroke-width="2.5"/>
  <path d="M104,106 Q125,99 148,106 Q125,112 104,106Z" fill="#101a0a"/>
  <path d="M88,105 q4,-6 10,-3 M150,98 q8,0 12,5 M110,114 q6,2 12,0" stroke="#5a8a2a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const puff = (x, y, r, col, op) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}"/>`;
cell("gas spout: idle (moss, fissure)", null, gasBase);
cell(
  "gas spout: telegraph (hissing wisps)",
  null,
  gasBase +
    `<path d="M115,100 q-8,-14 2,-26 q8,-10 -2,-22 M135,100 q10,-12 0,-24 q-6,-8 3,-20" stroke="#c8f05a" stroke-width="3" fill="none" opacity=".75" stroke-linecap="round"/>` +
    ring(125, 106, 54, 20, "#e6ff6a", 3, 0.9),
);
cell(
  "gas spout: active (green-yellow burst)",
  null,
  gasBase +
    puff(125, 98, 20, "#9ad62a", 0.7) +
    puff(106, 84, 20, "#a8d84a", 0.6) +
    puff(144, 84, 20, "#b8e04a", 0.55) +
    puff(125, 72, 22, "#c8f05a", 0.5) +
    puff(112, 60, 14, "#d8f58a", 0.4) +
    puff(140, 60, 14, "#d8f58a", 0.4) +
    `<g fill="#e6ff6a" opacity=".8"><circle cx="110" cy="64" r="3"/><circle cx="140" cy="86" r="2.5"/><circle cx="128" cy="40" r="2.5"/></g>` +
    ring(125, 106, 56, 22, "#e6ff6a", 3),
);

// ---- rockfall: scattered stones + dust shadow
const stones = `${rock(86, 112, 11, 41)}${rock(160, 116, 14, 42)}${rock(130, 128, 9, 43)}${rock(108, 96, 8, 44)}${rock(180, 98, 8, 45)}`;
cell(
  "rockfall: idle (stones, dust)",
  null,
  `<ellipse cx="128" cy="108" rx="70" ry="28" fill="#8a8378" opacity=".18"/>` + stones,
);
cell(
  "rockfall: telegraph (shadow darkens)",
  null,
  `<ellipse cx="128" cy="108" rx="70" ry="28" fill="#000" opacity=".5"/><ellipse cx="128" cy="108" rx="48" ry="19" fill="#000" opacity=".25"/>` +
    ring(128, 108, 70, 28, "#d8d0c0", 3, 0.9) +
    stones +
    `<g fill="#8a8378" opacity=".8"><rect x="112" y="40" width="3" height="3"/><rect x="146" y="30" width="3" height="3"/></g>`,
);
cell(
  "rockfall: active (rocks land, dust)",
  null,
  `<ellipse cx="128" cy="108" rx="70" ry="28" fill="#8a8378" opacity=".3"/>` +
    stones +
    `<g opacity=".85">${rock(108, 106, 24, 51)}${rock(152, 98, 19, 52)}${rock(128, 126, 15, 53)}${rock(172, 116, 12, 54)}</g>` +
    puff(96, 106, 14, "#c9c0b0", 0.5) +
    puff(164, 104, 15, "#c9c0b0", 0.45) +
    puff(128, 92, 18, "#d8d0c0", 0.4) +
    puff(126, 122, 13, "#c9c0b0", 0.45) +
    ring(128, 108, 70, 28, "#d8d0c0", 3),
);

// ---- rolling rocks: a boulder rotating, dust trail, faint danger edge
const trail = (x) =>
  `<g fill="#c9c0b0">${[0, 1, 2, 3].map((q) => `<circle cx="${x - 30 - q * 22}" cy="${112 - q * 3}" r="${6 + q * 3}" opacity="${0.5 - q * 0.11}"/>`).join("")}</g>`;
[0, 1, 2].forEach((q) => {
  const x = 70 + q * 50;
  cell(
    ["rolling rocks: rot 0", "rolling rocks: rot 40", "rolling rocks: rot 80"][q],
    null,
    `<g transform="translate(${q === 0 ? 0 : 0} 0)"><path d="M20,84 L230,84 L230,142 L20,142Z" fill="none" stroke="#d8d0c0" stroke-width="2" opacity=".35" stroke-dasharray="6 5"/></g>` +
      trail(x) +
      rock(x, 108, 36, 61, (q * 40 * Math.PI) / 180),
  );
});

// ---- lever
const leverBase = `
  <ellipse cx="125" cy="116" rx="34" ry="12" fill="#000" opacity=".35" transform="translate(5 3)"/>
  <path d="M92,108 L92,118 Q125,132 158,118 L158,108 Q125,96 92,108Z" fill="#5e584f" stroke="#2a2723" stroke-width="1.5"/>
  <ellipse cx="125" cy="108" rx="33" ry="11" fill="#827b70" stroke="#2a2723" stroke-width="1.5"/>
  <path d="M93,106 Q108,98 125,97" fill="none" stroke="#c4bdb0" stroke-width="2"/>
  <circle cx="125" cy="106" r="6" fill="#3a3834" stroke="#14120f" stroke-width="1.5"/>`;
/** @type {(dx: number, up: boolean) => string} */
const lever = (dx, up) =>
  `<path d="M125,106 L${125 + dx},${up ? 58 : 100}" stroke="#14120f" stroke-width="9" stroke-linecap="round"/><path d="M125,106 L${125 + dx},${up ? 58 : 100}" stroke="#8a5a2a" stroke-width="6" stroke-linecap="round"/><path d="M124,105 L${124 + dx},${up ? 60 : 99}" stroke="#c28a4a" stroke-width="1.6" stroke-linecap="round"/><circle cx="${125 + dx}" cy="${up ? 56 : 100}" r="8" fill="#${up ? "e8c27a" : "6a6560"}" stroke="#14120f" stroke-width="2"/>`;
cell("lever: up (on)", null, glow(125, 66, 38, "#e8c27a", 0.25) + leverBase + lever(-20, true));
cell("lever: down (off)", null, leverBase + lever(26, false));
// ---- door
const door = (open) => `
  <ellipse cx="125" cy="128" rx="60" ry="9" fill="#000" opacity=".35"/>
  <path d="M72,128 L72,50 L178,50 L178,128Z" fill="#3b4759" stroke="#1d242f" stroke-width="2"/>
  <path d="M72,50 L178,50" stroke="#7a8aa4" stroke-width="3"/>
  ${
    open
      ? `<rect x="82" y="58" width="86" height="70" fill="#0c1018"/><path d="M82,58 L82,128 L96,122 L96,62Z" fill="#6a4020" stroke="#14100a" stroke-width="1.5"/><path d="M168,58 L168,128 L154,122 L154,62Z" fill="#6a4020" stroke="#14100a" stroke-width="1.5"/><path d="M82,58 L96,62" stroke="#c28a4a" stroke-width="2"/>`
      : `<path d="M82,58 L168,58 L168,128 L82,128Z" fill="#7a4e26" stroke="#14100a" stroke-width="2"/><path d="M82,58 L168,58" stroke="#c28a4a" stroke-width="3"/><path d="M104,58 L104,128 M125,58 L125,128 M146,58 L146,128" stroke="#4a2c12" stroke-width="2"/><path d="M82,76 L168,76 M82,108 L168,108" stroke="#2a2a30" stroke-width="5"/><circle cx="136" cy="94" r="4" fill="#d8c070" stroke="#14100a"/>`
  }`;
cell("door / gate: closed (wood and iron)", null, door(false));
cell("door / gate: open (swung aside)", null, door(true));
// ---- pressure plate
const plate = (down) => `
  <ellipse cx="125" cy="112" rx="40" ry="15" fill="#000" opacity=".35" transform="translate(4 3)"/>
  ${down ? "" : `<path d="M86,106 L86,114 Q125,132 164,114 L164,106Z" fill="#4a463f" stroke="#2a2723" stroke-width="1.5"/>`}
  <ellipse cx="125" cy="${down ? 110 : 104}" rx="38" ry="14" fill="${down ? "#5e584f" : "#827b70"}" stroke="#2a2723" stroke-width="1.5"/>
  <path d="M90,${down ? 108 : 102} Q105,${down ? 99 : 93} 125,${down ? 97 : 91}" fill="none" stroke="#c4bdb0" stroke-width="2"/>
  <ellipse cx="125" cy="${down ? 110 : 104}" rx="16" ry="6" fill="none" stroke="${down ? "#e8c27a" : "#6a6560"}" stroke-width="2.5"/>`;
cell("pressure plate: up", null, plate(false));
cell("pressure plate: held (sunk)", null, plate(true));

const rows = Math.ceil(cells.length / COLS);
const TW = COLS * CW,
  TH = rows * CH;
let body = "";
cells.forEach((c, i) => {
  const x = (i % COLS) * CW,
    y = Math.floor(i / COLS) * CH;
  body += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden"><rect width="${CW}" height="${CH}" fill="${FLOOR}" stroke="#141a24"/>${c.body}<text x="5" y="14" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${c.title}</text></svg></g>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>${body}</svg>`;
const svgPath = join(out, "3053-hazards.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3053-hazards.png")], {
  stdio: "ignore",
});
