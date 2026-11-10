// #3049 study: layout and lighting plan for Training › Wilds (1200 x 800 world).
// A plan, not final art: where the terrain, water, walls and lights go, so the
// map is built to one picture. Usage: node scripts/assets/wilds-study.mjs [outDir]
// Writes <outDir>/3049-wilds-study.png (792 px wide).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "docs/art";
mkdirSync(outDir, { recursive: true });
const tmp = join(process.env.TMPDIR ?? "/tmp", "wilds-3049");
mkdirSync(tmp, { recursive: true });

/** @param {string | number} v */
const f = (v) => String(v);
const K = 0.66; // world unit -> px
const W = 1200 * K;
const H = 800 * K + 40; // legend strip under the map
/** @type {string[]} */
const o = [];
const p = (/** @type {number[][]} */ a) =>
  a.map(([x, y]) => `${f((x * K).toFixed(1))},${f((y * K).toFixed(1))}`).join(" ");
const poly = (/** @type {number[][]} */ a, /** @type {string} */ attrs) =>
  o.push(`<polygon points="${f(p(a))}" ${f(attrs)}/>`);
const rect = (x = 0, y = 0, w = 0, h = 0, attrs = "") =>
  o.push(
    `<rect x="${f(x * K)}" y="${f(y * K)}" width="${f(w * K)}" height="${f(h * K)}" ${f(attrs)}/>`,
  );
const text = (x = 0, y = 0, s = "", size = 9, fill = "#d7dee8", extra = "") =>
  o.push(
    `<text x="${f(x * K)}" y="${f(y * K)}" font-family="DejaVu Sans, sans-serif" font-size="${f(size)}" fill="${f(fill)}" ${f(extra)}>${f(s)}</text>`,
  );

const defs = [];
const light = (/** @type {string} */ id, /** @type {string} */ col, /** @type {number} */ a) =>
  defs.push(
    `<radialGradient id="${f(id)}"><stop offset="0" stop-color="${f(col)}" stop-opacity="${f(a)}"/><stop offset="1" stop-color="${f(col)}" stop-opacity="0"/></radialGradient>`,
  );
light("fire", "#ff8a2a", 0.75);
light("torch", "#ffc266", 0.6);
light("cold", "#6fa8ff", 0.65);
light("spring", "#7fe0c8", 0.4);

// ---- ground: dusk, three levels shown by tone ----
rect(0, 0, 1200, 800, 'fill="#1b2230"'); // ground, layer 1
// grid
for (let x = 0; x <= 1200; x += 100) rect(x, 0, 0.8, 800, 'fill="#ffffff" fill-opacity="0.05"');
for (let y = 0; y <= 800; y += 100) rect(0, y, 1200, 0.8, 'fill="#ffffff" fill-opacity="0.05"');

// basin: a pit one level below ground (layer 0), ramp-free; walked in by two ramps
const basin = [
  [360, 570],
  [720, 570],
  [760, 640],
  [740, 740],
  [640, 790],
  [400, 790],
  [340, 700],
];
poly(basin, 'fill="#0f141d" stroke="#3b4759" stroke-width="2"');
// stream: spring -> ford -> basin; deep pool at the basin's south edge
const stream = [
  [120, 230],
  [140, 330],
  [150, 430],
  [210, 530],
  [300, 610],
  [400, 660],
];
o.push(
  `<polyline points="${f(p(stream))}" fill="none" stroke="#3f7fa6" stroke-opacity="0.85" stroke-width="${f(16 * K)}" stroke-linecap="round" stroke-linejoin="round"/>`,
);
o.push(
  `<ellipse cx="${f(520 * K)}" cy="${f(745 * K)}" rx="${f(110 * K)}" ry="${f(34 * K)}" fill="#27597a"/>`,
);
text(485, 752, "deep pool", 8, "#bfe2f5");
text(60, 330, "stream (shallow)", 8, "#bfe2f5");

// ridge: a raised deck one level above ground (layer 2), ramps at both ends
const ridge = [
  [520, 110],
  [900, 110],
  [900, 300],
  [520, 300],
];
poly(ridge, 'fill="#3a4658" stroke="#a9b6c9" stroke-width="2"');
poly(
  [
    [430, 160],
    [520, 130],
    [520, 280],
    [430, 250],
  ],
  'fill="#2f3a4b" stroke="#6b7a90" stroke-width="1.5"',
);
poly(
  [
    [900, 130],
    [990, 160],
    [990, 250],
    [900, 280],
  ],
  'fill="#2f3a4b" stroke="#6b7a90" stroke-width="1.5"',
);
for (const [x, y] of [
  [450, 205],
  [470, 205],
  [490, 205],
  [920, 205],
  [940, 205],
  [960, 205],
])
  o.push(
    `<path d="M${f((x - 5) * K)},${f((y - 10) * K)} l${f(5 * K)},${f(10 * K)} l${f(-5 * K)},${f(10 * K)}" fill="none" stroke="#a9b6c9" stroke-width="1.2"/>`,
  );
text(560, 100, "RIDGE · deck, ramps W and E", 8, "#c9d4e3");

// ---- walls: rock outcrops, irregular ----
const rock = 'fill="#2a3242" stroke="#566176" stroke-width="2" stroke-linejoin="round"';
poly(
  [
    [420, 330],
    [500, 320],
    [560, 350],
    [540, 400],
    [470, 410],
    [430, 380],
  ],
  rock,
); // under the ridge ramp
poly(
  [
    [760, 380],
    [840, 350],
    [910, 380],
    [900, 440],
    [820, 460],
    [770, 430],
  ],
  rock,
);
poly(
  [
    [580, 20],
    [680, 12],
    [720, 50],
    [650, 80],
    [590, 70],
  ],
  rock,
);
poly(
  [
    [1060, 120],
    [1150, 150],
    [1170, 230],
    [1110, 260],
    [1050, 200],
  ],
  rock,
);
poly(
  [
    [1010, 560],
    [1110, 540],
    [1160, 620],
    [1100, 690],
    [1030, 650],
  ],
  rock,
);
// side room (ground level) with its door
poly(
  [
    [0, 620],
    [260, 620],
    [260, 800],
    [0, 800],
  ],
  'fill="#171d29"',
);
rect(0, 618, 260, 8, 'fill="#566176"');
rect(244, 626, 14, 54, 'fill="#566176"');
rect(244, 760, 14, 40, 'fill="#566176"');
rect(244, 680, 14, 80, 'fill="#c98a3a"'); // the door
text(20, 740, "side room", 8, "#8e9bb0");

// ---- zones, each in its area; coloured by what the card #3052 will draw ----
const zone = (
  /** @type {number[][]} */ a,
  /** @type {string} */ col,
  /** @type {string} */ label,
  /** @type {number} */ tx,
  /** @type {number} */ ty,
) => {
  poly(
    a,
    `fill="${f(col)}" fill-opacity="0.55" stroke="${f(col)}" stroke-width="1.5" stroke-dasharray="4 3"`,
  );
  text(tx, ty, label, 8, "#ffffff", 'font-weight="bold"');
};
zone(
  [
    [310, 90],
    [420, 90],
    [430, 180],
    [330, 190],
  ],
  "#e0481a",
  "lava",
  345,
  178,
);
zone(
  [
    [460, 90],
    [540, 90],
    [540, 170],
    [460, 170],
  ],
  "#8fbf3a",
  "toxic fog",
  466,
  135,
);
zone(
  [
    [560, 320],
    [640, 320],
    [640, 560],
    [560, 560],
  ],
  "#c4561f",
  "scorched lane",
  566,
  440,
);
zone(
  [
    [420, 610],
    [540, 610],
    [540, 700],
    [420, 700],
  ],
  "#6b5a2a",
  "mire",
  450,
  660,
);
zone(
  [
    [560, 640],
    [680, 640],
    [680, 720],
    [560, 720],
  ],
  "#4f8a3f",
  "foul water",
  575,
  685,
);
zone(
  [
    [380, 700],
    [470, 700],
    [470, 770],
    [380, 770],
  ],
  "#4f9a8a",
  "tainted water",
  382,
  740,
);
zone(
  [
    [80, 150],
    [160, 150],
    [160, 230],
    [80, 230],
  ],
  "#5fd6b0",
  "spring",
  90,
  195,
);
zone(
  [
    [60, 480],
    [140, 480],
    [140, 560],
    [60, 560],
  ],
  "#3f9a4a",
  "grove",
  76,
  525,
);
zone(
  [
    [660, 160],
    [740, 160],
    [740, 240],
    [660, 240],
  ],
  "#7a5fd6",
  "draining spire",
  640,
  205,
);
// hazard row, north-west corner (timed): vent, gas spout, rockfall, rolling rocks
for (const [x, l] of /** @type {[number, string][]} */ ([
  [20, "vent"],
  [120, "gas"],
  [220, "rockfall"],
])) {
  rect(x, 20, 70, 70, 'fill="#d6a23a" fill-opacity="0.35" stroke="#d6a23a" stroke-dasharray="4 3"');
  text(x + 6, 58, l, 8, "#ffffff");
}
o.push(
  `<polygon points="${f(
    p([
      [140, 120],
      [330, 120],
      [330, 150],
      [140, 150],
    ]),
  )}" fill="none" stroke="#d6a23a" stroke-dasharray="4 3"/>`,
);
text(145, 138, "rolling rocks lane", 8, "#d6a23a");
// reserved: portal pair (#3030), barrier gate and breakable wall (#3031)
const reserve = (
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ w,
  /** @type {number} */ h,
  /** @type {string} */ s,
) => {
  rect(x, y, w, h, 'fill="none" stroke="#8e9bb0" stroke-width="1.2" stroke-dasharray="2 3"');
  text(x + 4, y + h / 2 + 3, s, 8, "#8e9bb0");
};
reserve(940, 350, 90, 70, "portal A");
reserve(1000, 440, 150, 90, "barrier + wall");
reserve(740, 520, 100, 70, "portal B");

// ---- lights: glow discs; radius is the light's reach in world units ----
const glow = (
  /** @type {string} */ id,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ r,
  /** @type {string} */ name,
) => {
  o.push(
    `<circle cx="${f(x * K)}" cy="${f(y * K)}" r="${f(r * K)}" fill="url(#${f(id)})" style="mix-blend-mode:screen"/>`,
  );
  o.push(
    `<circle cx="${f(x * K)}" cy="${f(y * K)}" r="3.2" fill="#fff" stroke="#000" stroke-width="1"/>`,
  );
  text(x + 8, y - 6, name, 7, "#fff");
};
glow("fire", 340, 120, 170, "fire-lava-1");
glow("fire", 405, 165, 110, "fire-lava-2");
glow("fire", 235, 425, 150, "fire-camp");
glow("torch", 330, 650, 95, "torch-lever");
glow("torch", 256, 720, 85, "torch-door");
glow("torch", 40, 110, 90, "torch-vents");
glow("torch", 295, 60, 80, "torch-rocks");
glow("cold", 700, 200, 150, "cold-spire");
glow("spring", 120, 190, 120, "spring glow (#3052)");
// sun: low, from the north-west (315 deg, one sun for every map); arrows show shadows falling south-east
text(16, 790, "sun · NW, low, dusk", 8, "#f2d49b");
for (const y of [380, 500]) {
  o.push(
    `<path d="M${f(20 * K)},${f(y * K)} l${f(50 * K)},${f(50 * K)}" stroke="#f2d49b" stroke-width="1.6" stroke-dasharray="5 3" marker-end="url(#ar)"/>`,
  );
}
defs.push(
  '<marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#f2d49b"/></marker>',
);

// ---- play points ----
const pin = (
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {string} */ col,
  /** @type {string} */ s,
) => {
  o.push(
    `<circle cx="${f(x * K)}" cy="${f(y * K)}" r="7" fill="${f(col)}" stroke="#0b0f14" stroke-width="1.5"/>`,
  );
  text(x + 12, y + 4, s, 8, "#fff");
};
pin(200, 400, "#4aa3ff", "your spawn");
pin(1000, 400, "#ff6a5a", "foe spawn");
o.push(
  `<rect x="${f((330 - 6) * K)}" y="${f((640 - 6) * K)}" width="${f(12 * K)}" height="${f(12 * K)}" fill="#c98a3a" stroke="#000"/>`,
);
text(340, 624, "lever", 8, "#e8c27a");
text(262, 700, "door", 8, "#e8c27a");

// ---- legend strip ----
const ly = 800 * K + 6;
o.push(`<rect x="0" y="${f(800 * K)}" width="${f(W)}" height="40" fill="#0e1116"/>`);
const key = [
  ["#3a4658", "ridge (+1)"],
  ["#1b2230", "ground"],
  ["#0f141d", "basin (-1)"],
  ["#3f7fa6", "water"],
  ["#2a3242", "rock wall"],
  ["#d6a23a", "timed hazard"],
];
key.forEach(([c, s], i) => {
  o.push(
    `<rect x="${f(8 + i * 100)}" y="${f(ly + 4)}" width="12" height="12" fill="${f(c)}" stroke="#8e9bb0"/>`,
  );
  o.push(
    `<text x="${f(26 + i * 100)}" y="${f(ly + 14)}" font-family="DejaVu Sans, sans-serif" font-size="9" fill="#d7dee8">${f(s)}</text>`,
  );
});
o.push(
  `<text x="8" y="${f(ly + 30)}" font-family="DejaVu Sans, sans-serif" font-size="8.5" fill="#8e9bb0">9 lights + sun (≤ 16) · dashed grey = room kept for portals and barriers · zone tint stays above water</text>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}"><defs>${f(defs.join(""))}</defs>${f(o.join("\n"))}</svg>`;
const svgPath = join(tmp, "3049.svg");
const png = join(outDir, "3049-wilds-study.png");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-o", png, "-w", String(Math.round(W))], { stdio: "ignore" });
execFileSync("magick", [png, "-colors", "255", "-strip", `PNG8:${f(png)}`]);
