/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3066: the four kinds of natural land outside a ground outline
// (cliff, rock, forest, deep water) and the edge each one makes.
// Usage: node scripts/assets/outside-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const CW = 400,
  CH = 250,
  GROUND = "#26303f";

/** @type {(seed: number) => () => number} */
const rng = (seed) => {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
};

// The shared test outline: ground in the south-east, a bay cut into the edge
// so a concave corner shows. Outside is everything north-west of it.
const EDGE = [
  [0, 150],
  [90, 126],
  [150, 142],
  [190, 100],
  [250, 90],
  [320, 114],
  [400, 92],
];
const edgePts = EDGE.map((p) => p.join(",")).join(" L");
const outsidePath = `M0,0 L400,0 L${EDGE.at(-1).join(",")} L${[...EDGE]
  .reverse()
  .map((p) => p.join(","))
  .join(" L")}Z`;
const edgeLine = `M${edgePts}`;
const groundPath = `M${edgePts} L400,250 L0,250Z`;

/** @type {(id: string, body: string) => string} */
const clipped = (id, body) =>
  `<clipPath id="${id}"><path d="${outsidePath}"/></clipPath><g clip-path="url(#${id})">${body}</g>`;

/** @type {(col: string, op: number) => string} */
const grain = (col, op) =>
  `<rect width="${CW}" height="${CH}" filter="url(#grain)" fill="${col}" opacity="${op}"/>`;
/** @type {(x: number, y: number) => string} */
const body = (x, y) =>
  `<ellipse cx="${x + 4}" cy="${y + 7}" rx="13" ry="5" fill="#000" opacity=".35"/><circle cx="${x}" cy="${y}" r="14" fill="#59c2ff" stroke="#fff" stroke-width="2"/>`;

/** @type {(x: number, y: number, r: number, seed: number) => string} A chiselled boulder, as hazards-study. */
function rock(x, y, r, seed) {
  const R = rng(seed);
  const n = 8;
  const pts = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    const rr = r * (0.8 + R() * 0.3);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]);
  }
  const f = (/** @type {number[]} */ p) => p.map((v) => v.toFixed(1)).join(",");
  const inner = pts.map(([px, py]) => [
    x + (px - x) * 0.5 - r * 0.12,
    y + (py - y) * 0.5 - r * 0.2,
  ]);
  let s = `<ellipse cx="${x + r * 0.35}" cy="${y + r * 0.8}" rx="${r}" ry="${r * 0.35}" fill="#000" opacity=".4"/>`;
  for (let j = 0; j < n; j++) {
    const mid = ((j + 0.5) / n) * Math.PI * 2;
    const lit = -(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2;
    const tone = lit > 0.45 ? "#8f887b" : lit > 0 ? "#6f695f" : lit > -0.5 ? "#4d4943" : "#34312c";
    const a = inner[j],
      b = inner[(j + 1) % n];
    s += `<path d="M${f(pts[j])} L${f(pts[(j + 1) % n])} L${f(b)} L${f(a)}Z" fill="${tone}" stroke="#23211d" stroke-width="1" stroke-linejoin="round"/>`;
  }
  s += `<polygon points="${inner.map(f).join(" ")}" fill="#b4ad9f" stroke="#23211d" stroke-width="1"/>`;
  return (
    s +
    `<path d="M${f(pts[5])} L${f(pts[6])} L${f(pts[7])}" fill="none" stroke="#e6dfd0" stroke-width="1.4" opacity=".8"/>`
  );
}

// ---- cliff: a lip on the ground side, strata falling away, haze at the bottom
const cliff = () => {
  const R = rng(11);
  let strata = "";
  for (let i = 0; i < 26; i++) {
    const y = R() * CH;
    const x = R() * CW;
    strata += `<path d="M${x},${y} l${40 + R() * 70},${R() * 6 - 3}" stroke="${R() > 0.5 ? "#1a202a" : "#3d4a5e"}" stroke-width="${1 + R() * 2}" opacity=".7"/>`;
  }
  return (
    clipped(
      "c-cliff",
      `<rect width="${CW}" height="${CH}" fill="#2d3748"/>
       <rect width="${CW}" height="${CH}" fill="url(#drop)"/>${grain("#5a6a82", 0.18)}${strata}
       <path d="${edgeLine}" fill="none" stroke="#0b0f14" stroke-width="10" opacity=".55" transform="translate(0,-5)"/>`,
    ) +
    `<path d="${edgeLine}" fill="none" stroke="#0b0f14" stroke-width="5" stroke-linejoin="round"/>
     <path d="${edgeLine}" fill="none" stroke="#a9bbd0" stroke-width="2.5" stroke-linejoin="round" transform="translate(0,3)"/>`
  );
};

// ---- rock: massed chiselled boulders, lit tops, a dark crevice line at the edge
const rockOutside = () => {
  const R = rng(5);
  let s = `<rect width="${CW}" height="${CH}" fill="#3f3c37"/>${grain("#7a7468", 0.2)}`;
  for (let i = 0; i < 60; i++) {
    const x = R() * CW,
      y = R() * 160;
    if (y > 125 + (x / CW) * 10) continue;
    s += rock(x, y, 16 + R() * 14, 20 + i);
  }
  return (
    clipped("c-rock", s) +
    `<path d="${edgeLine}" fill="none" stroke="#14120f" stroke-width="5" stroke-linejoin="round"/>
     <path d="${edgeLine}" fill="none" stroke="#b4ad9f" stroke-width="1.5" transform="translate(0,3)" opacity=".8"/>`
  );
};

// ---- forest: overlapping canopies, lit on the NW, trunk shadows on the ground side
const forest = () => {
  const R = rng(7);
  let s = `<rect width="${CW}" height="${CH}" fill="#1c2a1f"/>${grain("#35552f", 0.2)}`;
  /** @type {[number, number, number][]} */
  const trees = [];
  for (let i = 0; i < 90; i++) trees.push([R() * CW, R() * 160, 17 + R() * 11]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of trees) {
    s += `<ellipse cx="${x + 7}" cy="${y + 10}" rx="${r}" ry="${r * 0.6}" fill="#000" opacity=".35"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="#2c4a2e" stroke="#122015" stroke-width="1.5"/>
      <circle cx="${x - r * 0.25}" cy="${y - r * 0.3}" r="${r * 0.62}" fill="#3f6a3d"/>
      <circle cx="${x - r * 0.38}" cy="${y - r * 0.42}" r="${r * 0.28}" fill="#5f8c55"/>`;
  }
  return (
    clipped("c-forest", s) +
    `<path d="${edgeLine}" fill="none" stroke="#0e1810" stroke-width="3" opacity=".55" transform="translate(4,6)"/>`
  );
};

// ---- deep water: dark and still, a pale shore line, slow ripples. Never friend blue.
const deepWater = () => {
  const R = rng(3);
  let ripples = "";
  for (let i = 0; i < 22; i++) {
    const x = R() * CW,
      y = R() * 140;
    ripples += `<path d="M${x},${y} q10,-3 20,0 t20,0" fill="none" stroke="#5f86a0" stroke-width="1.2" opacity=".5"/>`;
  }
  return (
    clipped(
      "c-water",
      `<rect width="${CW}" height="${CH}" fill="#18304a"/>${grain("#2f6a8c", 0.18)}${ripples}
       <path d="${edgeLine}" fill="none" stroke="#2f6a8c" stroke-width="16" opacity=".5"/>`,
    ) +
    `<path d="${edgeLine}" fill="none" stroke="#8fb8d6" stroke-width="3" stroke-linejoin="round" opacity=".9"/>`
  );
};

const kinds = [
  ["cliff", "lip + falling strata, hazy below; sight passes", cliff],
  ["rock", "massed boulders, lit tops; blocks sight", rockOutside],
  ["forest", "dense canopy, trunk shadow; blocks sight", forest],
  ["deep-water", "dark still water, pale shore; sight passes", deepWater],
];
let cells = "";
kinds.forEach(([name, note, draw], i) => {
  const x = (i % 2) * CW,
    y = Math.floor(i / 2) * CH;
  cells += `<g transform="translate(${x},${y})"><svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" overflow="hidden">
    <rect width="${CW}" height="${CH}" fill="${GROUND}"/>
    <path d="${groundPath}" fill="${GROUND}"/>
    ${[60, 120, 180, 240, 300, 360].map((g) => `<path d="M${g},0 V${CH}" stroke="#34415a" stroke-width="1"/>`).join("")}
    ${[60, 120, 180, 240].map((g) => `<path d="M0,${g} H${CW}" stroke="#34415a" stroke-width="1"/>`).join("")}
    ${draw()}${body(250, 170)}${body(120, 190)}
    <text x="8" y="${CH - 24}" font-family="DejaVu Sans,sans-serif" font-size="13" font-weight="bold" fill="#dfe6f0">outside: "${name}"</text>
    <text x="8" y="${CH - 8}" font-family="DejaVu Sans,sans-serif" font-size="10.5" fill="#b8c4d6">${note}</text>
    <rect width="${CW}" height="${CH}" fill="none" stroke="#141a24"/></svg></g>`;
});
const W = CW * 2,
  H = CH * 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<linearGradient id="drop" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3b4960"/><stop offset=".5" stop-color="#232c3b"/><stop offset="1" stop-color="#0b0f14"/></linearGradient>
</defs>${cells}</svg>`;
const svgPath = join(out, "outside.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3066-outside.png")], {
  stdio: "ignore",
});
