/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/restrict-plus-operands -- an SVG generator: numbers go into strings everywhere. */
// Illustrations for the tutorial playbook (#3188): one mock-up per station, 960x540.
// Usage: node scripts/assets/tutorial-playbook.mjs <out-dir>   (needs inkscape and imagemagick)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/tutorial/img";
mkdirSync(out, { recursive: true });
const W = 960,
  H = 540,
  INK = "#0b0f14",
  FRIEND = "#59c2ff",
  FOE = "#ff7b72",
  GLOW = "#ffd23d",
  DECK = "#a0b2c7",
  DECK_F = "#4b5a70";

const DEFS = `<defs><style>.n{font:15px 'DejaVu Sans',sans-serif;fill:#f2f5fa;paint-order:stroke;stroke:${INK};stroke-width:4px}.t{font:bold 20px 'DejaVu Sans',sans-serif;fill:#fff;paint-order:stroke;stroke:${INK};stroke-width:5px}.k{font:bold 14px 'DejaVu Sans',sans-serif;fill:#14202e}</style>
<radialGradient id="dome"><stop offset="0" stop-color="#9fdcff" stop-opacity=".05"/><stop offset=".8" stop-color="#9fdcff" stop-opacity=".12"/><stop offset="1" stop-color="#9fdcff" stop-opacity=".45"/></radialGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${GLOW}" stop-opacity=".7"/><stop offset="1" stop-color="${GLOW}" stop-opacity="0"/></radialGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.5"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>`;

/** the background fight rages outside the bubble */
const scene = () => {
  let s = `<rect width="${W}" height="${H}" fill="#1c2430"/><rect width="${W}" height="${H}" filter="url(#grain)" fill="#fff" opacity=".1"/>`;
  for (const [x, y, c] of [
    [70, 80, FRIEND],
    [130, 440, FRIEND],
    [880, 90, FOE],
    [840, 450, FOE],
    [900, 270, FOE],
    [50, 260, FRIEND],
  ])
    s += `<circle cx="${x}" cy="${y}" r="13" fill="${c}" opacity=".5" stroke="${INK}" stroke-width="2"/>`;
  s += `<path d="M60,120 L150,150 M860,380 L800,350 M100,400 L170,370" stroke="#ff8a3d" stroke-width="3" opacity=".4"/>`;
  return s;
};
const bubble = (cx = 480, cy = 290, rx = 330, ry = 190) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#dome)" stroke="#9fdcff" stroke-width="3"/><ellipse cx="${cx}" cy="${cy + 4}" rx="${rx - 6}" ry="${ry - 6}" fill="#26303f" opacity=".55"/>`;
const body = (x, y, c, r = 16) =>
  `<ellipse cx="${x}" cy="${y + r * 0.9}" rx="${r}" ry="${r * 0.4}" fill="#080b10" opacity=".5"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#fff" stroke-width="2.5"/>`;
const dummy = (x, y) =>
  `<ellipse cx="${x}" cy="${y + 26}" rx="20" ry="8" fill="#080b10" opacity=".5"/><rect x="${x - 4}" y="${y - 4}" width="8" height="30" fill="#7a5a3a" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y - 14}" r="17" fill="#c9a36a" stroke="${INK}" stroke-width="2.5"/><path d="M${x - 12},${y - 14} h24" stroke="${FOE}" stroke-width="3"/>`;
const marker = (x, y, n) =>
  `<circle cx="${x}" cy="${y}" r="38" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${GLOW}" stroke-width="3" stroke-dasharray="6 4"/><text x="${x - 5}" y="${y + 6}" class="t" style="font-size:16px">${n}</text>`;
const say = (t) =>
  `<rect x="40" y="${H - 70}" width="${W - 80}" height="46" rx="10" fill="#0b0f14" opacity=".82" stroke="#9fdcff" stroke-width="2"/><text x="60" y="${H - 40}" class="n" style="font-size:18px;stroke:none">${t}</text>`;
const title = (n, t) => `<text x="24" y="38" class="t">${n}  ${t}</text>`;
const key = (x, y, t, w = 34) =>
  `<rect x="${x}" y="${y}" width="${w}" height="30" rx="6" fill="#dfe7f1" stroke="${INK}" stroke-width="2"/><text x="${x + w / 2}" y="${y + 21}" class="k" text-anchor="middle">${t}</text>`;
const skip = `<rect x="${W - 156}" y="14" width="140" height="30" rx="8" fill="#0b0f14" opacity=".75" stroke="#7a8697" stroke-width="2"/><text x="${W - 144}" y="35" class="n" style="font-size:14px;stroke:none">Skip tutorial</text>`;
const bar = (x, y, w, f, c, label) =>
  `<rect x="${x}" y="${y}" width="${w}" height="16" rx="4" fill="#0b0f14" stroke="#7a8697" stroke-width="2"/><rect x="${x + 2}" y="${y + 2}" width="${(w - 4) * f}" height="12" rx="3" fill="${c}"/>` +
  (label ? `<text x="${x + w + 8}" y="${y + 13}" class="n">${label}</text>` : "");
const pulse = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${GLOW}" stroke-width="4"/><rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="12" fill="none" stroke="${GLOW}" stroke-width="2" opacity=".5"/>`;
const slot = (x, y, i, c = "#3a4a63", wipe = 0) =>
  `<rect x="${x}" y="${y}" width="52" height="52" rx="6" fill="${c}" stroke="#a0b2c7" stroke-width="2"/><text x="${x + 4}" y="${y + 14}" class="n" style="font-size:11px">${i}</text>` +
  (wipe
    ? `<rect x="${x}" y="${y}" width="52" height="${52 * wipe}" rx="6" fill="#000" opacity=".55"/>`
    : "");
const skillBar = (x, y, wipe = 0, hl = false) => {
  let s = "";
  for (let i = 0; i < 8; i++)
    s += slot(x + i * 58, y, i + 1, i === 0 ? "#b5532a" : "#3a4a63", i === 0 ? wipe : 0);
  return s + (hl ? pulse(x - 6, y - 6, 8 * 58 + 6, 64) : "");
};
const hudBlock = (hl) =>
  bar(24, H - 120, 220, 0.8, "#c9423a", "health 80%") +
  bar(24, H - 98, 220, 0.6, "#3f6fe8", "energy") +
  (hl ?? "");
const callout = (x, y, tx, ty, t) =>
  `<path d="M${x},${y} L${tx},${ty}" stroke="${GLOW}" stroke-width="2"/><circle cx="${tx}" cy="${ty}" r="5" fill="${GLOW}"/><text x="${x - 4}" y="${y - 6}" class="n" text-anchor="end">${t}</text>`;
const cursor = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M${x},${y} l0,26 l8,-7 l7,14 l5,-3 l-7,-13 l11,-1 Z" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
const effect = (x, y, c, f, t) =>
  `<rect x="${x}" y="${y}" width="40" height="40" rx="6" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${x + 20}" y="${y + 27}" class="t" text-anchor="middle" style="font-size:18px">${t}</text><rect x="${x}" y="${y + 44}" width="40" height="6" fill="#0b0f14"/><rect x="${x}" y="${y + 44}" width="${40 * f}" height="6" fill="#fff"/>`;

/** @type {[string, string, string, string][]} id, title, caption, svg */
const shots = [];
/** @type {(id: string, ttl: string, caption: string, svg: string) => void} */
const add = (id, ttl, caption, svg) => void shots.push([id, ttl, caption, svg]);

add(
  "1-walk",
  "1 Walk",
  "Walk to the glowing marks, in order.",
  scene() +
    bubble() +
    marker(300, 340, 1) +
    marker(520, 250, 2) +
    marker(690, 350, 3) +
    body(190, 290, FRIEND) +
    cursor(300, 340) +
    `<path d="M206,294 C240,320 270,330 290,336" stroke="#fff" stroke-width="2" stroke-dasharray="3 5" fill="none"/>` +
    `<ellipse cx="760" cy="200" rx="22" ry="14" fill="none"/>` +
    key(402, 424, "W", 30) +
    key(436, 424, "A", 30) +
    key(470, 424, "S", 30) +
    key(504, 424, "D", 30) +
    say("“There you are. First, show me you can stand… then walk.”") +
    skip,
);

add(
  "2-layers",
  "2 Up and down",
  "Up the ramp, then Alt + click under the platform.",
  scene() +
    bubble() +
    `<polygon points="560,330 640,350 640,372 560,352" fill="${DECK_F}" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="560" y="236" width="170" height="116" fill="${DECK_F}" stroke="${INK}" stroke-width="2"/><rect x="560" y="196" width="170" height="116" fill="${DECK}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M440,300 L560,250 L560,310 L440,340 Z" fill="#7d8ea4" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="645" cy="254" rx="30" ry="14" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="645" cy="346" rx="30" ry="14" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/>` +
    `<path d="M645,300 v20 m-5,-6 l5,6 l5,-6" stroke="#fff" stroke-width="2.5" fill="none"/>` +
    body(645, 238, FRIEND) +
    cursor(645, 346) +
    key(386, 424, "Alt", 46) +
    `<text x="440" y="445" class="n">+ click</text>` +
    `<text x="660" y="392" class="n">dashed ring: the ground below</text><text x="660" y="180" class="n">solid ring: the platform</text>` +
    say("“Up there. Now drop down, right beneath it.”") +
    skip,
);

add(
  "3-look",
  "3 Look around",
  "Wheel to zoom, right-drag to look around.",
  scene() +
    bubble() +
    body(480, 290, FRIEND) +
    `<rect x="300" y="170" width="360" height="240" rx="6" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="8 6"/><rect x="200" y="110" width="560" height="360" rx="6" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>` +
    `<path d="M765,110 l30,0 m-8,-8 l8,8 l-8,8" stroke="${GLOW}" stroke-width="3" fill="none"/>` +
    `<rect x="840" y="400" width="40" height="64" rx="18" fill="#dfe7f1" stroke="${INK}" stroke-width="2"/><path d="M860,400 v28 M840,428 h40" stroke="${INK}" stroke-width="2"/><rect x="860" y="400" width="20" height="28" rx="0" fill="${GLOW}" opacity=".9"/><text x="824" y="490" class="n">right-drag</text>` +
    `<path d="M830,416 l-22,-12 m0,10 l0,-10 l10,0" stroke="${GLOW}" stroke-width="2.5" fill="none"/><text x="780" y="400" class="n">wheel</text>` +
    say("“Zoom out. See the line? Now look around.”") +
    skip,
);

add(
  "4-target",
  "4 Target and attack",
  "Right click the dummy, right click again to attack.",
  scene() +
    bubble() +
    body(340, 300, FRIEND) +
    dummy(600, 290) +
    `<circle cx="600" cy="300" r="34" fill="none" stroke="#ffffff" stroke-width="3"/>` +
    cursor(600, 280) +
    `<rect x="300" y="46" width="360" height="52" rx="8" fill="#0b0f14" opacity=".85" stroke="#7a8697" stroke-width="2"/><text x="316" y="68" class="n">Training Dummy</text>` +
    bar(316, 74, 220, 1, "#c9423a", "100%") +
    pulse(294, 40, 372, 64) +
    key(60, 424, "Tab", 46) +
    key(112, 424, "C") +
    key(150, 424, "Space", 60) +
    say("“Call it out, and hit it.”") +
    skip,
);

add(
  "5-bars",
  "5 Your bars (taught in play)",
  "No station of its own: pointed at when they move.",
  scene() +
    bubble() +
    body(480, 290, FRIEND) +
    hudBlock() +
    `<g>${[0, 1, 2].map((i) => `<path d="M${180 + i * 16},${H - 150} l6,12 l6,-12" fill="none" stroke="${FOE}" stroke-width="4"/>`).join("")}</g>` +
    callout(120, H - 170, 120, H - 114, "health") +
    callout(300, H - 60, 120, H - 92, "energy") +
    callout(330, H - 160, 192, H - 142, "pips: you are bleeding") +
    pulse(18, H - 128, 232, 56) +
    say("“Ouch. See the arrows? That's you bleeding.”") +
    skip,
);

add(
  "6-skill",
  "6 Use a skill",
  "Press 1: it costs energy, takes a moment, then recharges.",
  scene() +
    bubble() +
    body(330, 300, FRIEND) +
    dummy(620, 290) +
    `<path d="M346,296 C440,250 540,250 598,284" stroke="#ff8a3d" stroke-width="5" fill="none" stroke-dasharray="2 8" stroke-linecap="round"/><circle cx="598" cy="284" r="9" fill="#ffd23d"/>` +
    hudBlock() +
    skillBar(250, H - 130, 0.55, true) +
    key(262, 424, "1") +
    callout(500, 360, 280, H - 120, "recharge wipe") +
    `<text x="600" y="420" class="n">energy drops</text>` +
    say("“Again, once it's ready.”") +
    skip,
);

add(
  "7-heal",
  "7 Damage and healing",
  "Health is down; watch it come back.",
  scene() +
    bubble() +
    body(330, 300, FRIEND) +
    dummy(620, 290) +
    `<circle cx="330" cy="300" r="30" fill="none" stroke="${FOE}" stroke-width="3" opacity=".6"/>` +
    bar(24, H - 120, 220, 0.55, "#c9423a", "health 55%") +
    bar(24, H - 98, 220, 0.7, "#3f6fe8", "energy") +
    `<g>${[0, 1, 2].map((i) => `<path d="M${260 + i * 16},${H - 112} l6,-12 l6,12" fill="none" stroke="#76c96f" stroke-width="4"/>`).join("")}</g>` +
    `<text x="322" y="${H - 108}" class="n">up-pips: healing</text>` +
    pulse(18, H - 128, 232, 56) +
    say("“That's a lot of red. Heal up. Or just breathe: five seconds.”") +
    skip,
);

add(
  "8-conditions",
  "8 Conditions",
  "Walk to the mark while Crippled.",
  scene() +
    bubble() +
    body(300, 320, FRIEND) +
    dummy(620, 260) +
    marker(700, 380, 1) +
    `<rect x="${W - 130}" y="120" width="104" height="120" rx="8" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="2"/>` +
    effect(W - 120, 130, "#8e2f2f", 0.7, "B") +
    effect(W - 70, 130, "#6a5a2a", 0.4, "C") +
    `<text x="${W - 200}" y="116" class="n">effects monitor</text><text x="${W - 250}" y="270" class="n">Crippled: slower</text>` +
    pulse(W - 136, 112, 116, 134) +
    `<path d="M316,324 C400,330 500,350 540,366" stroke="#fff" stroke-width="2" stroke-dasharray="3 9" fill="none"/>` +
    say("“Slow, isn't it? It wears off. Walk it off.”") +
    skip,
);

add(
  "9-calls",
  "9 Calling targets and pings",
  "Wheel-click the foe; click the compass to ping.",
  scene() +
    bubble() +
    body(300, 320, FRIEND) +
    body(380, 250, "#a0d8ff", 14) +
    dummy(620, 280) +
    `<circle cx="620" cy="290" r="38" fill="none" stroke="${GLOW}" stroke-width="4"/><path d="M620,238 v-26 m-8,8 l8,-8 l8,8" stroke="${GLOW}" stroke-width="3" fill="none"/>` +
    `<circle cx="${W - 90}" cy="${H - 120}" r="70" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="3"/><circle cx="${W - 90}" cy="${H - 120}" r="4" fill="${FRIEND}"/><circle cx="${W - 60}" cy="${H - 150}" r="8" fill="none" stroke="${GLOW}" stroke-width="3"/><path d="M${W - 90},${H - 120} L${W - 60},${H - 150}" stroke="${GLOW}" stroke-width="2"/>` +
    `<text x="${W - 150}" y="${H - 200}" class="n">compass: click to ping</text>` +
    pulse(W - 166, H - 196, 152, 152) +
    `<rect x="24" y="130" width="170" height="64" rx="8" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="2"/><text x="34" y="152" class="n">Guide</text>` +
    bar(34, 160, 140, 1, "#c9423a") +
    key(24, 424, "T") +
    `<text x="62" y="445" class="n">targets the called foe</text>` +
    say("“That one. Call it.”") +
    skip,
);

add(
  "10-resurrect",
  "10 Down, not out",
  "Click the guide in the party window, then Resurrect.",
  scene() +
    bubble() +
    body(330, 320, FRIEND) +
    `<ellipse cx="560" cy="330" rx="30" ry="12" fill="#a0d8ff" opacity=".5"/><path d="M536,330 h48" stroke="#a0d8ff" stroke-width="10" stroke-linecap="round"/><circle cx="526" cy="330" r="12" fill="#6a8aa0" stroke="#fff" stroke-width="2"/>` +
    `<text x="500" y="298" class="t" style="font-size:16px">“Help me up!”</text>` +
    `<rect x="24" y="130" width="170" height="64" rx="8" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="2"/><text x="34" y="152" class="n">Guide (down)</text>` +
    bar(34, 160, 140, 0, "#c9423a") +
    pulse(18, 124, 182, 76) +
    skillBar(250, H - 130, 0, false).replace(/fill="#b5532a"/, 'fill="#e8c27a"') +
    pulse(244, H - 136, 64, 64) +
    `<text x="250" y="${H - 138}" class="n">Resurrect (tutorial only)</text>` +
    bar(24, H - 120, 220, 0.8, "#c9423a", "") +
    `<text x="24" y="${H - 128}" class="n">morale −1%</text>` +
    say("“Every fall costs us. Don't fall.”") +
    skip,
);

add(
  "11-front",
  "11 To the front",
  "The bubble opens; you join the fight.",
  scene() +
    `<ellipse cx="480" cy="290" rx="330" ry="190" fill="none" stroke="#9fdcff" stroke-width="3" stroke-dasharray="14 12" opacity=".7"/>` +
    body(480, 290, FRIEND) +
    body(560, 280, "#a0d8ff", 15) +
    `<path d="M580,280 L760,230" stroke="#fff" stroke-width="3" stroke-dasharray="4 8" fill="none"/>` +
    `<path d="M760,230 l-14,2 m6,-10 l8,8 l-10,8" stroke="#fff" stroke-width="3" fill="none"/>` +
    [
      [800, 200],
      [840, 300],
      [790, 370],
    ]
      .map(([x, y]) => body(x, y, FOE))
      .join("") +
    [
      [690, 150],
      [700, 410],
    ]
      .map(([x, y]) => body(x, y, FRIEND, 14))
      .join("") +
    say("“You're ready. Follow me.”") +
    skip,
);

for (const [id, ttl, , svg] of shots) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}${svg}${title("", ttl)}</svg>`;
  const p = join(out, `${id}.svg`);
  writeFileSync(p, doc);
  execFileSync("inkscape", [p, "-w", String(W), "-o", join(out, `${id}.png`)], { stdio: "ignore" });
  rmSync(p);
  execFileSync("magick", [
    join(out, `${id}.png`),
    "-colors",
    "96",
    `PNG8:${join(out, `${id}.png`)}`,
  ]);
}
