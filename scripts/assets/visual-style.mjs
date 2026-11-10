// #3051: the worked examples of docs/art/visual-style.md, one SVG each.
// Usage: node scripts/assets/visual-style.mjs [outDir]
// Every panel is 360 x 220 px at 2 px per world unit, with a body (30 units
// across, 60 px) standing in it so the scale is never a guess. Colours are the
// ones the page and the renderer recipes name.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "docs/art/visual-style";
mkdirSync(outDir, { recursive: true });

const W = 360;
const H = 220;

/** @param {string} defs @param {string} body */
const svg = (defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(H)}" viewBox="0 0 ${String(W)} ${String(H)}"><defs>${defs}</defs>${body}</svg>\n`;

/** The dusk floor: `floor` with a grid line every 50 units. */
const floor = () => {
  let g = `<rect width="${String(W)}" height="${String(H)}" fill="#26303f"/>`;
  for (let x = 0; x <= W; x += 100)
    g += `<rect x="${String(x)}" width="1" height="${String(H)}" fill="#34415a"/>`;
  for (let y = 0; y <= H; y += 100)
    g += `<rect y="${String(y)}" width="${String(W)}" height="1" fill="#34415a"/>`;
  return g;
};

/** A body 30 units across: the friend disc and its ring, with its 35 % shadow. */
const body = (/** @type {number} */ x, /** @type {number} */ y) =>
  `<ellipse cx="${String(x + 5)}" cy="${String(y + 6)}" rx="30" ry="30" fill="#000" fill-opacity="0.35"/><circle cx="${String(x)}" cy="${String(y)}" r="30" fill="#59c2ff" stroke="#fff" stroke-width="2.5"/><circle cx="${String(x)}" cy="${String(y)}" r="10" fill="none" stroke="#fff" stroke-width="2.5"/>`;

/** Fractal noise, so no fill is flat. */
const noise = (
  /** @type {string} */ id,
  /** @type {number} */ freq,
  /** @type {number} */ seed,
  /** @type {string} */ matrix,
) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${String(freq)}" numOctaves="3" seed="${String(seed)}"/><feColorMatrix values="${matrix}"/></filter>`;

/** @type {Record<string, string>} */
const files = {};

// ---- lava: a hot core, a bright rim, a crust of dark rock, and its own light ----
files["lava.svg"] = svg(
  `${noise("n", 0.035, 3, "0 0 0 0 1  0 0 0 0 0.55  0 0 0 0 0.1  0 0 0 1.6 -0.45")}
<radialGradient id="g"><stop offset="0" stop-color="#ffd23d"/><stop offset="0.45" stop-color="#ff5a1f"/><stop offset="1" stop-color="#b8401a"/></radialGradient>
<radialGradient id="l"><stop offset="0" stop-color="#ff8a2a" stop-opacity="0.55"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
<clipPath id="c"><path id="p" d="M60,70 Q120,40 190,60 T300,90 Q320,150 250,170 Q170,190 110,165 Q40,140 60,70Z"/></clipPath>`,
  `${floor()}<ellipse cx="180" cy="115" rx="190" ry="130" fill="url(#l)"/>
<path d="M60,70 Q120,40 190,60 T300,90 Q320,150 250,170 Q170,190 110,165 Q40,140 60,70Z" fill="url(#g)"/>
<g clip-path="url(#c)"><rect width="${String(W)}" height="${String(H)}" filter="url(#n)" opacity="0.8"/>
<path d="M90,110 Q130,95 150,125 M200,80 Q230,100 215,135 M240,150 Q270,130 285,105" fill="none" stroke="#3a1a10" stroke-width="5" stroke-linecap="round" opacity="0.85"/></g>
<path d="M60,70 Q120,40 190,60 T300,90 Q320,150 250,170 Q170,190 110,165 Q40,140 60,70Z" fill="none" stroke="#ffd23d" stroke-width="3"/>
${body(310, 178)}`,
);

// ---- water, deep and shallow side by side: dark and still against clear and rippled ----
files["water.svg"] = svg(
  `<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1320"/><stop offset="1" stop-color="#16263a"/></linearGradient>`,
  `${floor()}
<path d="M20,40 H165 V190 H20Z" fill="url(#d)" stroke="#c4dcee" stroke-width="4" stroke-linejoin="round"/>
<g stroke="#4e6c8a" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"><path d="M40,80h32M100,110h32M50,140h32M110,165h32"/></g>
<path d="M195,40 H340 V190 H195Z" fill="#8fb8d6" fill-opacity="0.3" stroke="#8fb8d6" stroke-width="2" stroke-linejoin="round"/>
<g stroke="#bfe2f5" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"><path d="M215,70h32M290,95h32M225,125h32M285,160h32"/></g>
${body(268, 118)}
<g font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d7dee8"><text x="30" y="30">deep: dark, hard shore</text><text x="200" y="30">shallow: clear, floor shows</text></g>`,
);

// ---- toxic fog: soft overlapping puffs, never a hard fill, but a hard edge ring ----
files["toxic-fog.svg"] = svg(
  `<radialGradient id="f"><stop offset="0" stop-color="#7fbf2a" stop-opacity="0.55"/><stop offset="1" stop-color="#7fbf2a" stop-opacity="0"/></radialGradient>`,
  `${floor()}
<rect x="40" y="40" width="280" height="140" rx="12" fill="#7fbf2a" fill-opacity="0.18" stroke="#c8f05a" stroke-width="3" stroke-dasharray="10 6"/>
<g fill="url(#f)"><circle cx="100" cy="90" r="60"/><circle cx="175" cy="130" r="70"/><circle cx="250" cy="85" r="60"/><circle cx="150" cy="75" r="45"/><circle cx="270" cy="140" r="50"/></g>
${body(170, 112)}`,
);

// ---- mire: dull mud, a lumpy rim, a few slow bubbles ----
files["mire.svg"] = svg(
  `${noise("n", 0.05, 8, "0 0 0 0 0.25  0 0 0 0 0.16  0 0 0 0 0.07  0 0 0 1.4 -0.35")}
<clipPath id="c"><path d="M50,80 Q80,40 150,55 T280,60 Q330,100 300,150 Q250,190 170,180 Q80,185 55,140 Q35,110 50,80Z"/></clipPath>`,
  `${floor()}<path d="M50,80 Q80,40 150,55 T280,60 Q330,100 300,150 Q250,190 170,180 Q80,185 55,140 Q35,110 50,80Z" fill="#6b4a26" fill-opacity="0.85"/>
<g clip-path="url(#c)"><rect width="${String(W)}" height="${String(H)}" filter="url(#n)" opacity="0.7"/>
<g fill="none" stroke="#9c7a46" stroke-width="2.5"><circle cx="110" cy="100" r="9"/><circle cx="235" cy="130" r="12"/><circle cx="270" cy="85" r="7"/></g></g>
<path d="M50,80 Q80,40 150,55 T280,60 Q330,100 300,150 Q250,190 170,180 Q80,185 55,140 Q35,110 50,80Z" fill="none" stroke="#9c7a46" stroke-width="3"/>
${body(180, 120)}`,
);

// ---- torch light: a warm pool that fades to the ambient, and a stand that holds it ----
files["torch-light.svg"] = svg(
  `<radialGradient id="t"><stop offset="0" stop-color="#ffb060" stop-opacity="0.75"/><stop offset="0.5" stop-color="#ffb060" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
<radialGradient id="e"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ff8a2a"/></radialGradient>`,
  `${floor()}<rect width="${String(W)}" height="${String(H)}" fill="#0b1018" fill-opacity="0.35"/>
<circle cx="120" cy="110" r="150" fill="url(#t)" style="mix-blend-mode:screen"/>
<rect x="114" y="96" width="12" height="40" rx="2" fill="#4b3a2a" stroke="#0b0f14" stroke-width="2"/>
<ellipse cx="120" cy="90" rx="9" ry="14" fill="url(#e)" stroke="#0b0f14" stroke-width="1.5"/>
${body(235, 125)}
<g font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d7dee8"><text x="170" y="40">radius 150, intensity 0.6</text></g>`,
);

// ---- rock wall: a lit top edge, a shaded face, noise and a few cracks ----
files["rock-wall.svg"] = svg(
  `${noise("n", 0.06, 5, "0 0 0 0 0.6  0 0 0 0 0.65  0 0 0 0 0.72  0 0 0 0.9 -0.3")}
<clipPath id="c"><path d="M40,150 L60,70 L150,50 L250,62 L320,90 L330,150Z"/></clipPath>`,
  `${floor()}<path d="M60,70 L150,50 L250,62 L320,90 L360,128 L330,150 L40,150Z" fill="#000" fill-opacity="0.35" transform="translate(14,22)"/>
<path d="M40,150 L60,70 L150,50 L250,62 L320,90 L330,150Z" fill="#2d3748" stroke="#0b0f14" stroke-width="2"/>
<g clip-path="url(#c)"><rect width="${String(W)}" height="${String(H)}" filter="url(#n)" opacity="0.5"/></g>
<path d="M40,150 H330 V178 H40Z" fill="#1a212c" stroke="#0b0f14" stroke-width="2"/>
<path d="M60,70 L150,50 L250,62 L320,90" fill="none" stroke="#a9bbd0" stroke-width="4" stroke-linejoin="round"/>
<path d="M110,90 L128,118 L120,140 M220,86 L205,112 M270,100 L286,128" fill="none" stroke="#10151c" stroke-width="2.5" stroke-linecap="round"/>
${body(85, 186)}`,
);

// ---- door: shut it is a bar across the way; open it is two stubs and a clear gap ----
files["door.svg"] = svg(
  "",
  `${floor()}
<rect x="40" y="40" width="130" height="140" fill="#10151c" fill-opacity="0.4"/>
<rect x="85" y="40" width="40" height="140" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="93" y="62" width="24" height="96" rx="3" fill="#c98a3a" stroke="#0b0f14" stroke-width="2.5"/>
<path d="M97,110 h16" stroke="#0b0f14" stroke-width="3"/>
<rect x="190" y="40" width="130" height="140" fill="#10151c" fill-opacity="0.4"/>
<rect x="235" y="40" width="40" height="52" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="235" y="128" width="40" height="52" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="243" y="92" width="24" height="36" fill="#c98a3a" fill-opacity="0.18" stroke="#c98a3a" stroke-width="2" stroke-dasharray="5 4"/>
${body(255, 110)}
<g font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d7dee8"><text x="60" y="30">shut: solid, amber</text><text x="210" y="30">open: a gap, ghost</text></g>`,
);

// ---- lever: up and down differ by shape (handle leans), not by colour alone ----
files["lever.svg"] = svg(
  "",
  `${floor()}
<g stroke="#0b0f14" stroke-width="2.5">
<rect x="70" y="120" width="60" height="26" rx="4" fill="#4b5a70"/>
<path d="M100,124 L84,76" stroke="#e8c27a" stroke-width="9" stroke-linecap="round" fill="none"/>
<circle cx="84" cy="74" r="9" fill="#e8c27a"/>
<rect x="230" y="120" width="60" height="26" rx="4" fill="#4b5a70"/>
<path d="M260,124 L304,108" stroke="#e8c27a" stroke-width="9" stroke-linecap="round" fill="none"/>
<circle cx="306" cy="107" r="9" fill="#e8c27a"/></g>
<circle cx="100" cy="133" r="4" fill="#fff" fill-opacity="0.35"/><circle cx="260" cy="133" r="4" fill="#fff" fill-opacity="0.9"/>
${body(190, 170)}
<g font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d7dee8"><text x="62" y="40">up: handle stands</text><text x="215" y="40">down: handle lies</text></g>`,
);

for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
