/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- an SVG generator: numbers go into strings everywhere. */
// Study for #3071: Crossroads, Long Hall and Ember Pits as 2.5D plans.
// One plan per map at <= 800 px wide; the layout is new and asymmetric, the PNG is a guide.
// Usage: node scripts/assets/small-arenas-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });
const INK = "#0b0f14";

const STYLE = `<style>.n{font:10px 'DejaVu Sans',sans-serif;fill:#f2e9de;paint-order:stroke;stroke:${INK};stroke-width:3px}.t{font:bold 13px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:${INK};stroke-width:3px}</style>`;
const DEFS = `<defs>${STYLE}
<radialGradient id="warm"><stop offset="0" stop-color="#ffb060" stop-opacity=".6"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
<radialGradient id="lava"><stop offset="0" stop-color="#ff7a2a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
<clipPath id="emberClip"><path d="M16,50 L180,16 L400,40 L620,10 L780,44 L790,260 L772,490 L560,506 L330,490 L110,508 L12,440 L26,240 Z"/></clipPath>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>`;

/** a raised block seen from the south: face below the top, SE cast shadow (sun NW) */
const box = (x, y, w, d, h, top, face, lip = "#fff", sh = 1) =>
  (sh
    ? `<polygon points="${x + h * 0.8},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6 + d} ${x + h * 0.8 + w},${y + h * 0.6} ${x + w},${y + h * 0.6} ${x + w},${y + d} ${x},${y + d}" fill="#080b10" opacity=".45"/>`
    : "") +
  `<rect x="${x}" y="${y - h + d}" width="${w}" height="${h}" fill="${face}" stroke="${INK}" stroke-width="2"/>` +
  `<rect x="${x}" y="${y - h}" width="${w}" height="${d}" fill="${top}" stroke="${INK}" stroke-width="2"/>` +
  `<rect x="${x + 1}" y="${y - h + d - 3}" width="${w - 2}" height="3" fill="${lip}" opacity=".7"/>`;
const lab = (x, y, t) => `<text x="${x}" y="${y}" class="n">${t}</text>`;
const spawn = (x, y, c, l) =>
  `<circle cx="${x}" cy="${y}" r="22" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="5 4"/>` +
  [-9, 9]
    .map(
      (k) => `<circle cx="${x}" cy="${y + k}" r="7" fill="${c}" stroke="#fff" stroke-width="2"/>`,
    )
    .join("") +
  `<text x="${x - 4}" y="${y - 28}" class="t">${l}</text>`;
const light = (x, y, r, g = "warm") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/><circle cx="${x}" cy="${y}" r="3.5" fill="#ffb060" stroke="${INK}" stroke-width="1.5"/>`;
const lever = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="6" fill="#e8c27a" stroke="${INK}" stroke-width="2"/>`;
const arrow = (x, y) =>
  `<path d="M${x},${y} v18 m-5,-6 l5,6 l5,-6" stroke="#fff" stroke-width="2" fill="none"/>`;
const swatches = (y, list) =>
  list
    .map(
      ([n, c], i) =>
        `<rect x="${12 + i * 98}" y="${y}" width="88" height="20" fill="${c}" stroke="${INK}" stroke-width="2"/><text x="${14 + i * 98}" y="${y + 32}" class="n">${n}</text>`,
    )
    .join("");
const sunMark = `<path d="M30,34 l40,30 m-8,-2 l8,2 l-2,-9" stroke="#fff1d6" stroke-width="2.5" fill="none"/><text x="34" y="28" class="n">sun (NW)</text>`;

/** @type {(name: string, w: number, h: number, body: string) => void} */
const render = (name, w, h, body) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${DEFS}${body}</svg>`;
  const p = join(out, `${name}.svg`);
  writeFileSync(p, svg);
  execFileSync("inkscape", [p, "-w", String(w), "-o", join(out, `${name}.png`)], {
    stdio: "ignore",
  });
  rmSync(p);
};

// ---------------- Crossroads: 2600x2600 at 0.308 -> 800x800 + palette -----
{
  const GR = "#2f3a28",
    ROAD = "#8c7b64",
    SQ = "#a89880",
    ROOF = "#8e4a3a",
    ROOF_F = "#55302a",
    PLANK = "#a07a48",
    WATER = "#3a6a86";
  let s = `<rect width="800" height="860" fill="#1b1d17"/>`;
  // ragged town edge, fields outside
  s += `<path d="M30,60 L210,22 L420,48 L610,16 L772,70 L790,300 L768,520 L784,740 L560,782 L350,760 L120,786 L22,700 L40,420 Z" fill="${GR}" stroke="${INK}" stroke-width="3"/>`;
  s += `<path d="M30,60 L210,22 L420,48 L610,16 L772,70 L790,300 L768,520 L784,740 L560,782 L350,760 L120,786 L22,700 L40,420 Z" filter="url(#grain)" fill="#fff" opacity=".1"/>`;
  // two roads cross off-axis, bent
  s += `<path d="M30,330 C200,360 300,420 420,400 S650,300 790,330" stroke="${ROAD}" stroke-width="64" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M300,30 C330,200 400,300 410,420 S470,640 440,790" stroke="${ROAD}" stroke-width="58" fill="none" stroke-linecap="round"/>`;
  // fountain square, irregular
  s += `<path d="M330,330 L430,310 L500,360 L490,450 L400,480 L325,430 Z" fill="${SQ}" stroke="${INK}" stroke-width="3"/>`;
  s += `<circle cx="412" cy="394" r="26" fill="${WATER}" stroke="${INK}" stroke-width="3"/><circle cx="412" cy="394" r="9" fill="#bfe0f0" stroke="${INK}" stroke-width="2"/>`;
  s += lab(372, 506, "fountain square (L0, water)");
  // cellar passage under the square: dashed tunnel between two stairwells
  s += `<path d="M215,300 C300,330 330,470 560,520" stroke="#0a0806" stroke-width="22" fill="none" stroke-linecap="round" opacity=".85"/><path d="M215,300 C300,330 330,470 560,520" stroke="#3a2e24" stroke-width="2" fill="none" stroke-dasharray="3 5"/>`;
  s += lab(220, 280, "cellar hatch") + lab(520, 548, "cellar exit (tunnel under square)");
  s += light(560, 520, 50);
  // houses (L1 rooftops) in clusters, not on a grid
  const houses = [
    [70, 140, 90, 64],
    [180, 120, 70, 80],
    [200, 232, 82, 54],
    [90, 450, 100, 70],
    [210, 520, 70, 90],
    [540, 110, 96, 70],
    [660, 150, 80, 60],
    [560, 240, 70, 52],
    [600, 560, 90, 70],
    [690, 440, 64, 80],
    [500, 640, 80, 56],
    [120, 640, 90, 60],
  ];
  for (const [x, y, w, d] of houses) s += box(x, y + 20, w, d, 24, ROOF, ROOF_F, "#d8957d");
  // plank bridges between rooftops (L1)
  for (const [x, y, w, h] of [
    [160, 160, 22, 12],
    [250, 150, 20, 90],
    [636, 150, 26, 12],
    [610, 262, 12, 40],
    [190, 560, 26, 12],
  ]) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PLANK}" stroke="${INK}" stroke-width="2"/>`;
  }
  s += lab(132, 112, "plank bridges (L1)") + lab(540, 98, "rooftops (L1)");
  // gatehouse on the east road with a walkable roof (L2) and a portcullis lever
  s += box(700, 330, 74, 70, 56, "#a0b2c7", "#5f6f86", "#e4edf7");
  s += `<rect x="716" y="${330 - 56 + 70 - 24}" width="42" height="24" fill="#12161c"/>`;
  s += `<path d="M718,${330 - 56 + 70 - 24} v24 M730,${330 - 56 + 70 - 24} v24 M742,${330 - 56 + 70 - 24} v24 M754,${330 - 56 + 70 - 24} v24" stroke="#7a8697" stroke-width="2"/>`;
  s +=
    lab(600, 288, "gatehouse: walkable roof (L2)") +
    lever(676, 352) +
    lab(646, 366, "lever: portcullis");
  s += `<path d="M720,${330 - 56} L690,300" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  // low stair from rooftop to gatehouse roof and a drop-off from a roof edge into the alley
  s +=
    box(660, 405, 36, 18, 28, "#b5a98f", "#6a604f", "#ece2c8") +
    box(640, 410, 22, 18, 14, "#b5a98f", "#6a604f", "#ece2c8");
  s +=
    `<path d="M120,660 l10,-6 l8,5 l10,-4" stroke="${INK}" stroke-width="3" fill="none"/>` +
    arrow(138, 672) +
    lab(100, 706, "drop-off");
  // market stalls, lanterns (local lights)
  for (const [x, y] of [
    [352, 354],
    [450, 436],
    [300, 380],
  ]) {
    s += `<rect x="${x}" y="${y}" width="22" height="12" fill="#c97b3a" stroke="${INK}" stroke-width="2"/>`;
  }
  for (const [x, y] of [
    [330, 320],
    [505, 395],
    [418, 290],
    [210, 400],
    [420, 640],
    [620, 330],
  ])
    s += light(x, y, 36);
  // sun wash
  s += `<rect width="800" height="800" fill="#fff1d6" opacity=".05"/>` + sunMark;
  s += spawn(90, 330, "#59c2ff", "A") + spawn(700, 700, "#ff7b72", "B");
  s += lab(
    12,
    826,
    "plan, 2600x2600 at 0.308. A sits on the rooftop side (bridges, stairs); B near the gatehouse and the cellar exit.",
  );
  s += lab(
    12,
    842,
    "Layers: L0 streets and square, L1 rooftops and plank bridges, L2 gatehouse roof. Tunnel: cellar. Lights: lanterns, torch.",
  );
  s += swatches(802, []).replace("", "");
  render("3071-crossroads", 800, 860, s);
}

// ---------------- Long Hall: 3200x1100 at 0.25 -> 800x275 (x2 vertical) ----
{
  const FLOOR = "#7d7468",
    WALKT = "#a89c8a",
    WALKF = "#4d453c",
    CRYPT = "#1c1a20",
    DUST = "#fff1d6";
  const H = 420;
  let s = `<rect width="800" height="${H}" fill="#14110e"/>`;
  // hall shell: ragged ruined walls (outline not a rectangle)
  const shell =
    "M14,60 L120,40 L300,52 L470,34 L650,48 L786,40 L790,220 L774,380 L610,368 L420,386 L240,372 L60,386 L10,300 Z";
  s += `<path d="${shell}" fill="${FLOOR}" stroke="${INK}" stroke-width="3"/><path d="${shell}" filter="url(#grain)" fill="#fff" opacity=".12"/>`;
  // collapsing floor into the crypt (pit), with broken edge
  s += `<path d="M330,170 L400,150 L480,168 L500,240 L450,290 L370,284 L320,230 Z" fill="${CRYPT}" stroke="${INK}" stroke-width="3"/>`;
  s += `<path d="M330,170 L400,150 L480,168" stroke="#c4b8a4" stroke-width="2.5" fill="none"/>`;
  s +=
    lab(344, 232, "collapsing floor → crypt") + lab(344, 246, "(gate in crypt, opened by lever)");
  s += `<rect x="470" y="262" width="22" height="30" fill="#2a2630" stroke="${INK}" stroke-width="2"/><path d="M475,262 v30 M481,262 v30 M487,262 v30" stroke="#7a8697" stroke-width="2"/>`;
  // north wall-walk (long, whole west to middle) and south wall-walk (short, east), unequal on purpose
  s += box(60, 62, 360, 28, 30, WALKT, WALKF, "#d8ccb8");
  s += box(500, 330, 270, 28, 30, WALKT, WALKF, "#d8ccb8");
  s += lab(200, 30, "north wall-walk (L1), long") + lab(530, 322, "south wall-walk (L1), shorter");
  // lever at the east end of the north walk
  s += lever(410, 82) + lab(380, 106, "lever");
  // balcony at the east end (L1) and broken stair at the west end
  s += box(716, 140, 70, 110, 36, WALKT, WALKF, "#d8ccb8");
  s += lab(640, 128, "balcony (L1), east");
  for (let i = 0; i < 5; i++)
    s += box(30 + i * 16, 214 + i * 8, 18, 20, 6 + i * 6, WALKT, WALKF, "#d8ccb8", 0);
  s +=
    `<path d="M120,222 l8,-7 l8,6" stroke="${INK}" stroke-width="3" fill="none"/>` +
    lab(30, 280, "broken stair (L0→L1), gap at the top");
  // columns and fallen blocks
  for (const [x, y] of [
    [190, 160],
    [250, 250],
    [600, 160],
    [650, 260],
    [540, 120],
  ])
    s += box(x, y, 14, 14, 36, "#a0b2c7", "#5f6f86", "#e4edf7");
  for (const [x, y] of [
    [180, 300],
    [620, 90],
  ])
    s += `<path d="M${x},${y} l14,-8 l18,6 l-4,12 l-22,2 Z" fill="#7d8ea4" stroke="${INK}" stroke-width="1.5"/>`;
  // dusty shafts of light from roof holes, slanting SE
  for (const x of [160, 330, 560, 700]) {
    s += `<polygon points="${x},60 ${x + 34},60 ${x + 120},300 ${x + 70},300" fill="${DUST}" opacity=".13"/>`;
  }
  // braziers (local lights)
  for (const [x, y] of [
    [120, 120],
    [270, 170],
    [560, 220],
    [700, 100],
    [440, 340],
  ])
    s += light(x, y, 44);
  s += lab(100, 140, "braziers");
  s +=
    spawn(60, 140, "#59c2ff", "A") +
    spawn(740, 300, "#ff7b72", "B") +
    sunMark.replace("sun (NW)", "light from the roof (NW)");
  s += lab(
    12,
    404,
    "plan, 3200x1100 at 0.25. A starts by the walk and lever (long cover, far from crypt); B by the balcony (near high ground, farther lever).",
  );
  render("3071-long-hall", 800, H, s);
}

// ---------------- Ember Pits: 2800x1800 at 0.286 -> 800x514 + key ----------
{
  const ROCK = "#463d3a",
    BAS = "#2a2628",
    BAS_T = "#5a5256",
    CRUST = "#2e2420",
    LAV = "#e0561f",
    LAV_H = "#ffb347";
  const H = 580;
  let s = `<rect width="800" height="${H}" fill="#120e0d"/>`;
  const shell =
    "M16,50 L180,16 L400,40 L620,10 L780,44 L790,260 L772,490 L560,506 L330,490 L110,508 L12,440 L26,240 Z";
  s += `<path d="${shell}" fill="${ROCK}" stroke="${INK}" stroke-width="3"/><path d="${shell}" filter="url(#grain)" fill="#fff" opacity=".14"/>`;
  // lava: two channels that braid around an island, glow from below
  const ch1 = "M0,150 C150,130 230,210 330,230 S520,200 640,260 S780,330 800,320";
  const ch2 = "M300,520 C330,420 330,330 330,230";
  const ch3 = "M470,200 C470,330 560,380 640,430 S720,520 740,560";
  s += `<g clip-path="url(#emberClip)">`;
  for (const [d, w] of [
    [ch1, 60],
    [ch2, 44],
    [ch3, 46],
  ]) {
    s += `<path d="${d}" stroke="url(#lava)" stroke-width="${w * 3}" fill="none" stroke-linecap="round" opacity=".5"/>`;
    s += `<path d="${d}" stroke="${INK}" stroke-width="${w + 8}" fill="none" stroke-linecap="round"/>`;
    s += `<path d="${d}" stroke="${LAV}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    s += `<path d="${d}" stroke="${LAV_H}" stroke-width="${w * 0.35}" fill="none" stroke-linecap="round" opacity=".7"/>`;
  }
  s += `</g>`;
  s += lab(24, 130, "lava channel (deadly pit)");
  // cooling crust = scorched ground (zone), small plates beside channels
  for (const [x, y, rx, ry] of [
    [250, 300, 50, 22],
    [420, 290, 40, 18],
    [600, 360, 56, 22],
    [180, 420, 46, 20],
  ]) {
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${CRUST}" stroke="#7a2a12" stroke-width="2.5" stroke-dasharray="6 3"/>`;
  }
  s += lab(520, 344, "cooling crust (scorched ground)");
  // stone bridges over channels (L1: slightly raised, rails dark)
  for (const [x, y, w, h] of [
    [440, 196, 110, 22],
    [300, 328, 56, 18],
    [686, 280, 16, 70],
    [140, 140, 20, 62],
  ]) {
    s += box(x, y + h, w, h, 8, BAS_T, BAS, "#a09296");
  }
  s += lab(440, 180, "stone bridges");
  // basalt column with a lift (L2) in the middle island, hexagonal tops
  for (const [x, y] of [
    [372, 262],
    [396, 252],
    [388, 280],
    [360, 290],
  ])
    s += box(x, y, 24, 18, 16 + (x % 3) * 10, BAS_T, BAS, "#b0a2a6");
  s +=
    box(408, 300, 52, 40, 54, "#7d7075", BAS, "#c4b4b8") +
    lab(364, 232, "basalt column: lift up to L2") +
    lever(484, 330);
  s += `<path d="M426,310 v-22 m-6,6 l6,-6 l6,6" stroke="#fff" stroke-width="2" fill="none"/>`;
  // steam vents: cool pale puffs (a hazard-zone look, desaturated)
  for (const [x, y] of [
    [120, 300],
    [560, 120],
    [700, 440],
    [240, 90],
  ]) {
    s += `<circle cx="${x}" cy="${y}" r="9" fill="#2a2223" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y - 10}" r="14" fill="#d8d0d0" opacity=".28"/><circle cx="${x + 8}" cy="${y - 22}" r="10" fill="#d8d0d0" opacity=".18"/>`;
  }
  s += lab(100, 330, "steam vents");
  // north ledge (L1) west, drop-off into the pits at the east
  s += box(60, 224, 100, 38, 18, "#6a5d58", ROCK, "#9a8a84");
  s +=
    `<path d="M690,100 l10,-6 l8,5 l10,-4" stroke="${INK}" stroke-width="3" fill="none"/>` +
    arrow(708, 110) +
    lab(676, 148, "drop-off");
  // lava glow on the underside of the sky: tinted vignette
  s +=
    `<rect width="800" height="${H - 66}" fill="#ff5a1a" opacity=".05"/>` +
    sunMark.replace("sun (NW)", "light: glow from below, sun NW low");
  s += spawn(70, 300, "#59c2ff", "A") + spawn(740, 190, "#ff7b72", "B");
  s += lab(
    12,
    538,
    "plan, 2800x1800 at 0.286. Kill-count. A west on the crust side (one bridge, near the lift); B north-east (two bridges, steam).",
  );
  s += lab(
    12,
    552,
    "Layers: L0 ground, L1 ledge and bridges, L2 column top. Lava is the pit; crust and steam are zones; the lift is lever-timed.",
  );
  s += swatches(0, []);
  render("3071-ember-pits", 800, H, s);
}
