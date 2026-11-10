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
<path d="M40,150 L60,70 L150,50 L250,62 L320,90 L330,150Z" fill="#4b5a70" stroke="#0b0f14" stroke-width="2"/>
<g clip-path="url(#c)"><rect width="${String(W)}" height="${String(H)}" filter="url(#n)" opacity="0.5"/></g>
<path d="M40,150 H330 V178 H40Z" fill="#2d3642" stroke="#3b4759" stroke-width="2"/>
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

// ---- the scene sheets: 2.5D as it should look, lit, with height, walls and materials ----
const SW = 720;
const SH = 440;
/** @param {string} defs @param {string} bodySvg */
const sheet = (defs, bodySvg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(SW)}" height="${String(SH)}" viewBox="0 0 ${String(SW)} ${String(SH)}"><defs>${defs}</defs>${bodySvg}</svg>\n`;
const label = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ s) =>
  `<text x="${String(x)}" y="${String(y)}" font-family="DejaVu Sans, sans-serif" font-size="12" fill="#d7dee8">${s}</text>`;
const grid = () => {
  let g = `<rect width="${String(SW)}" height="${String(SH)}" fill="#26303f"/>`;
  for (let x = 0; x <= SW; x += 80)
    g += `<rect x="${String(x)}" width="1" height="${String(SH)}" fill="#34415a"/>`;
  for (let y = 0; y <= SH; y += 80)
    g += `<rect y="${String(y)}" width="${String(SW)}" height="1" fill="#34415a"/>`;
  return g;
};
const stone = noise("s", 0.06, 5, "0 0 0 0 0.6  0 0 0 0 0.65  0 0 0 0 0.72  0 0 0 0.9 -0.3");
const plank = noise("w", 0.02, 2, "0 0 0 0 0.35  0 0 0 0 0.24  0 0 0 0 0.12  0 0 0 1.3 -0.3");

// A deck, a ramp, a wall and a pit under one dusk sun: height read by lip, face and shadow.
files["lit-scene.svg"] = sheet(
  `${stone}
<radialGradient id="t"><stop offset="0" stop-color="#ffb060" stop-opacity="0.7"/><stop offset="0.5" stop-color="#ffb060" stop-opacity="0.25"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
<radialGradient id="f"><stop offset="0" stop-color="#ff8a2a" stop-opacity="0.65"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
<linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="#a9bbd0"/><stop offset="1" stop-color="#8fa4bd"/></linearGradient>`,
  `${grid()}
<!-- the pit: a darker floor, the far wall darker still, a lip on the near rim -->
<rect x="440" y="250" width="220" height="130" fill="#10151c"/>
<rect x="440" y="250" width="220" height="30" fill="#0c1016"/>
<rect x="440" y="378" width="220" height="3" fill="#a9bbd0"/>
<!-- the deck's shadow on the ground, hard, south-east -->
<rect x="150" y="90" width="260" height="140" fill="#080b10" fill-opacity="0.55" transform="translate(30,30)"/>
<rect x="60" y="150" width="90" height="70" fill="#080b10" fill-opacity="0.2"/>
<!-- the ramp, panel lines and chevrons -->
<path d="M70,125 L150,100 V210 L70,185Z" fill="url(#r)" stroke="#3b4759" stroke-width="2"/>
<g stroke="#8fa4bd" stroke-width="2"><path d="M94,118V196M118,110V204"/></g>
<g fill="none" stroke="#4b5a70" stroke-width="2.5"><path d="M86,160 l12,-8 v0 M110,162 l12,-8"/></g>
<!-- the deck: lit top, white lip, a shaded face -->
<rect x="150" y="100" width="260" height="110" fill="#a0b2c7"/>
<g stroke="#8fa4bd" stroke-width="1.5"><path d="M150,128H410M150,156H410M150,184H410"/></g>
<rect x="150" y="210" width="260" height="22" fill="#6f8099"/>
<rect x="150" y="207" width="260" height="3.5" fill="#fff"/>
<rect x="150" y="100" width="260" height="110" fill="none" stroke="#3b4759" stroke-width="2"/>
<!-- a wall on the deck: lit edge, shaded face -->
<rect x="250" y="130" width="120" height="30" fill="#4b5a70" stroke="#0b0f14" stroke-width="2"/>
<rect x="250" y="160" width="120" height="14" fill="#2d3642" stroke="#0b0f14" stroke-width="2"/>
<path d="M250,130 H370" stroke="#a9bbd0" stroke-width="3"/>
<rect x="258" y="174" width="120" height="10" fill="#080b10" fill-opacity="0.45"/>
<!-- a rock outcrop on the ground, with shadow -->
<path d="M470,60 L520,40 L590,52 L610,95 L560,120 L490,110Z" fill="#000" fill-opacity="0.35" transform="translate(16,18)"/>
<path d="M470,60 L520,40 L590,52 L610,95 L560,120 L490,110Z" fill="#3b4759" stroke="#0b0f14" stroke-width="2"/>
<path d="M470,60 L520,40 L590,52" fill="none" stroke="#a9bbd0" stroke-width="3" stroke-linejoin="round"/>
<!-- a torch pool and a fire pool, additive over everything below -->
<circle cx="170" cy="92" r="150" fill="url(#t)" style="mix-blend-mode:screen"/>
<circle cx="560" cy="300" r="170" fill="url(#f)" style="mix-blend-mode:screen"/>
<rect x="164" y="84" width="9" height="22" rx="2" fill="#4b3a2a" stroke="#0b0f14" stroke-width="1.5"/>
<ellipse cx="168" cy="80" rx="7" ry="11" fill="#ffd27a" stroke="#0b0f14" stroke-width="1.2"/>
<ellipse cx="560" cy="320" rx="18" ry="22" fill="#ffd27a" stroke="#0b0f14" stroke-width="2"/>
<!-- bodies: on the deck, at the pit edge, in the shadow -->
<g><circle cx="330" cy="200" r="15" fill="#59c2ff" stroke="#fff" stroke-width="2"/><circle cx="330" cy="200" r="5" fill="none" stroke="#fff" stroke-width="2"/>
<circle cx="520" cy="330" r="15" fill="none" stroke="#ff7b72" stroke-width="2" stroke-dasharray="4 3"/><circle cx="470" cy="230" r="15" fill="#ff7b72" stroke="#fff" stroke-width="2"/></g>
${label(14, 24, "dusk, one sun from the north-west: every shadow falls south-east")}
${label(250, 252, "deck: lightest plane, white lip")}
${label(444, 400, "pit: darker floor, lip on its rim")}
${label(444, 24, "rock: lit edge, dark face")}
${label(444, 424, "fire: warm pool on every layer")}`,
);

// Three heights side by side, from a pit to a deck: the same four cues each time.
files["height-steps.svg"] = sheet(
  "",
  `${grid()}
<g stroke="#0b0f14" stroke-width="2">
<rect x="40" y="80" width="170" height="180" fill="#10151c"/><rect x="40" y="80" width="170" height="36" fill="#0c1016"/>
<rect x="40" y="258" width="170" height="3.5" fill="#a9bbd0" stroke="none"/>
<rect x="275" y="140" width="170" height="130" fill="#26303f" stroke="#34415a"/>
<rect x="490" y="60" width="170" height="130" fill="#080b10" fill-opacity="0.55" stroke="none" transform="translate(26,26)"/>
<rect x="490" y="60" width="170" height="130" fill="#a0b2c7"/><rect x="490" y="190" width="170" height="26" fill="#6f8099"/></g>
<rect x="490" y="187" width="170" height="4" fill="#fff"/>
<g stroke="#8fa4bd" stroke-width="1.5"><path d="M490,92H660M490,124H660M490,156H660"/></g>
<g fill="#59c2ff" stroke="#fff" stroke-width="2"><circle cx="125" cy="190" r="15"/><circle cx="360" cy="200" r="15"/><circle cx="595" cy="140" r="15"/></g>
${label(40, 300, "pit  (-1 step)")}${label(40, 322, "floor 45% darker, far wall darker")}${label(40, 342, "lip on the near rim, no shadow out")}
${label(275, 300, "ground  (0)")}${label(275, 322, "the base tone, the grid")}
${label(490, 300, "deck  (+1 step = 56 units)")}${label(490, 322, "lightest top, planks, white lip,")}${label(490, 342, "shaded face, hard shadow to the SE")}
${label(14, 24, "one step is 56 units; no in-between height except on a ramp")}`,
);

// Walls: a straight wall, a rock outcrop, a door wall; each a lit top edge over a darker face.
files["walls.svg"] = sheet(
  `${stone}${plank}<clipPath id="c1"><rect x="40" y="110" width="200" height="50"/></clipPath><clipPath id="c2"><path d="M300,170 L320,110 L390,95 L450,108 L470,150 L450,175Z"/></clipPath><clipPath id="c3"><rect x="520" y="110" width="160" height="50"/></clipPath>`,
  `${grid()}
<!-- stone wall: blocks -->
<rect x="40" y="110" width="200" height="50" fill="#4b5a70"/><g clip-path="url(#c1)"><rect width="${String(SW)}" height="${String(SH)}" filter="url(#s)" opacity="0.45"/></g>
<g stroke="#34415a" stroke-width="2"><path d="M40,135H240M90,110V135M170,110V135M65,135V160M140,135V160M215,135V160"/></g>
<rect x="40" y="160" width="200" height="22" fill="#2d3642"/><path d="M40,110H240" stroke="#a9bbd0" stroke-width="3"/>
<rect x="40" y="110" width="200" height="72" fill="none" stroke="#0b0f14" stroke-width="2"/>
<rect x="52" y="182" width="200" height="14" fill="#080b10" fill-opacity="0.5"/>
<!-- rock outcrop -->
<path d="M300,170 L320,110 L390,95 L450,108 L470,150 L450,175Z" fill="#000" fill-opacity="0.35" transform="translate(14,20)"/>
<path d="M300,170 L320,110 L390,95 L450,108 L470,150 L450,175Z" fill="#4b5a70"/><g clip-path="url(#c2)"><rect width="${String(SW)}" height="${String(SH)}" filter="url(#s)" opacity="0.6"/></g>
<path d="M300,170 L320,110 L390,95 L450,108" fill="none" stroke="#a9bbd0" stroke-width="3" stroke-linejoin="round"/>
<path d="M300,170 L320,110 L390,95 L450,108 L470,150 L450,175Z" fill="none" stroke="#0b0f14" stroke-width="2"/>
<path d="M360,120 L372,150 L364,168" fill="none" stroke="#10151c" stroke-width="2.5" stroke-linecap="round"/>
<!-- wooden palisade with a door -->
<rect x="520" y="110" width="160" height="50" fill="#6b4a26"/><g clip-path="url(#c3)"><rect width="${String(SW)}" height="${String(SH)}" filter="url(#w)" opacity="0.7"/></g>
<g stroke="#3a2a14" stroke-width="2"><path d="M552,110V160M584,110V160M616,110V160M648,110V160"/></g>
<rect x="520" y="160" width="160" height="22" fill="#3d2a14"/><path d="M520,110H680" stroke="#c9a46a" stroke-width="3"/>
<rect x="520" y="110" width="160" height="72" fill="none" stroke="#0b0f14" stroke-width="2"/>
<rect x="584" y="120" width="32" height="62" rx="3" fill="#c98a3a" stroke="#0b0f14" stroke-width="2.5"/>
<g fill="#59c2ff" stroke="#fff" stroke-width="2"><circle cx="170" cy="310" r="15"/></g>
${label(40, 240, "stone: blocks")}${label(300, 240, "rock: irregular, cracked")}${label(520, 240, "wood: planks, a door")}
${label(14, 24, "every wall: lit top edge, darker face, outline, a shadow to the SE")}`,
);

// Materials: one swatch each, so a map author picks from a shared set.
{
  /** @type {[string, string, string, string][]} */
  const mats = [
    ["rock", "#4b5a70", "s", "lit grey-blue, cracked"],
    ["moss", "#3f5a35", "s", "matte, never signal green"],
    ["earth", "#5a4630", "w", "dry, warm brown"],
    ["wood", "#6b4a26", "w", "planks, long grain"],
    ["metal", "#62748c", "s", "cold, thin lit edge"],
    ["sand", "#8a7a5a", "s", "pale, fine grain"],
  ];
  let m = "";
  mats.forEach(([name, col, fl, note], i) => {
    const x = 30 + (i % 3) * 230;
    const y = 50 + Math.floor(i / 3) * 190;
    m += `<rect x="${String(x)}" y="${String(y)}" width="200" height="130" rx="4" fill="${col}"/><rect x="${String(x)}" y="${String(y)}" width="200" height="130" rx="4" filter="url(#${fl})" opacity="0.55"/>`;
    m += `<path d="M${String(x)},${String(y)}H${String(x + 200)}" stroke="#fff" stroke-opacity="0.45" stroke-width="3"/><rect x="${String(x)}" y="${String(y)}" width="200" height="130" rx="4" fill="none" stroke="#0b0f14" stroke-width="2"/>`;
    m += label(x, y + 152, name);
    m += `<text x="${String(x)}" y="${String(y + 170)}" font-family="DejaVu Sans, sans-serif" font-size="11" fill="#7d8899">${note} · ${col}</text>`;
  });
  files["materials.svg"] = sheet(
    `${stone}${plank}`,
    `${grid()}${m}${label(14, 24, "materials: a base tone, noise at about one feature per body, a lit top edge, an outline")}`,
  );
}

for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
