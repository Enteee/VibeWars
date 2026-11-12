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
const body = (x, y, c, r = 16) =>
  `<ellipse cx="${x}" cy="${y + r * 0.9}" rx="${r}" ry="${r * 0.4}" fill="#080b10" opacity=".5"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#fff" stroke-width="2.5"/>`;
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
const cursor = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M${x},${y} l0,26 l8,-7 l7,14 l5,-3 l-7,-13 l11,-1 Z" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
const effect = (x, y, c, f, t) =>
  `<rect x="${x}" y="${y}" width="40" height="40" rx="6" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${x + 20}" y="${y + 27}" class="t" text-anchor="middle" style="font-size:18px">${t}</text><rect x="${x}" y="${y + 44}" width="40" height="6" fill="#0b0f14"/><rect x="${x}" y="${y + 44}" width="${40 * f}" height="6" fill="#fff"/>`;

/** @type {[string, string, string, string][]} id, title, caption, svg */
const shots = [];
/** @type {(id: string, ttl: string, caption: string, svg: string) => void} */
const add = (id, ttl, caption, svg) => void shots.push([id, ttl, caption, svg]);

/* The tutorial world: a misty canyon with lava (operator brief on #3188). */
const ROCK = "#3a2f2a",
  LAVA = "#ff6a1f";
const canyon = () =>
  `<rect width="${W}" height="${H}" fill="#2a2320"/><rect width="${W}" height="${H}" filter="url(#grain)" fill="#fff" opacity=".12"/>` +
  `<path d="M0,0 H${W} V70 C760,110 640,60 500,95 C360,130 220,70 0,100 Z" fill="${ROCK}"/>` +
  `<path d="M0,${H} V440 C200,400 330,470 500,430 C650,400 780,460 ${W},420 V${H} Z" fill="${ROCK}"/>` +
  `<path d="M-10,330 C150,290 260,380 420,350 C600,320 760,400 980,360" stroke="#7a2a0e" stroke-width="40" fill="none"/><path d="M-10,330 C150,290 260,380 420,350 C600,320 760,400 980,360" stroke="${LAVA}" stroke-width="26" fill="none"/><path d="M-10,330 C150,290 260,380 420,350 C600,320 760,400 980,360" stroke="#ffd23d" stroke-width="8" fill="none" opacity=".7"/>` +
  `<ellipse cx="300" cy="250" rx="420" ry="90" fill="#cfd8e0" opacity=".1"/><ellipse cx="700" cy="440" rx="380" ry="70" fill="#cfd8e0" opacity=".12"/>`;
const boulder = (x, y, r = 26) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a7d72" stroke="${INK}" stroke-width="3"/><path d="M${x - r * 0.5},${y - r * 0.2} l${r * 0.4},${r * 0.5} M${x + r * 0.2},${y - r * 0.5} l${r * 0.3},${r * 0.3}" stroke="${INK}" stroke-width="2" opacity=".6"/>`;
const shadowRing = (x, y, r = 34) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.45}" fill="${FOE}" opacity=".35" stroke="${FOE}" stroke-width="3" stroke-dasharray="6 4"/>`;
const wall = (x, y, w, h, cracked = false) => {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#7d6a5c" stroke="${INK}" stroke-width="3"/>`;
  for (let r = 0; r < h / 24; r++)
    s += `<path d="M${x},${y + 24 * r} h${w}" stroke="${INK}" stroke-width="2" opacity=".6"/>`;
  return (
    s +
    (cracked
      ? `<path d="M${x + w / 2},${y} l-10,${h / 3} l14,${h / 3} l-8,${h / 3}" stroke="${INK}" stroke-width="4" fill="none"/>`
      : "")
  );
};
const rat = (x, y) =>
  `<ellipse cx="${x}" cy="${y + 10}" rx="14" ry="5" fill="#080b10" opacity=".5"/><ellipse cx="${x}" cy="${y}" rx="15" ry="9" fill="#9a8a7a" stroke="${INK}" stroke-width="2"/><circle cx="${x + 13}" cy="${y - 2}" r="6" fill="#9a8a7a" stroke="${INK}" stroke-width="2"/><circle cx="${x + 11}" cy="${y - 9}" r="3" fill="#d49a9a"/><path d="M${x - 15},${y} q-12,-6 -20,4" stroke="#d49a9a" stroke-width="3" fill="none"/>`;
const teleporter = (x, y) =>
  `<ellipse cx="${x}" cy="${y}" rx="52" ry="24" fill="#6a3fe8" opacity=".35"/><ellipse cx="${x}" cy="${y}" rx="40" ry="18" fill="none" stroke="#c9a8ff" stroke-width="4"/><ellipse cx="${x}" cy="${y}" rx="24" ry="10" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/><path d="M${x},${y - 14} v-70" stroke="#c9a8ff" stroke-width="10" opacity=".35"/>`;
const tutor = (x, y) => body(x, y, "#a0d8ff", 15);
const hit = (x, y, t) =>
  `<text x="${x}" y="${y}" class="t" text-anchor="middle" style="font-size:16px">${t}</text>`;
const tag = (x, y, t, anchor = "middle") =>
  `<text x="${x}" y="${y}" class="n" text-anchor="${anchor}">${t}</text>`;
const arrow = (x1, y1, x2, y2) =>
  `<path d="M${x1},${y1} L${x2},${y2}" stroke="${GLOW}" stroke-width="3" stroke-dasharray="4 8" fill="none" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="6" fill="${GLOW}"/>`;
const party = (hp) =>
  `<rect x="24" y="60" width="170" height="52" rx="8" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="2"/><text x="34" y="82" class="n">Tutor</text>` +
  bar(34, 90, 140, hp, "#c9423a");

// A. The battlefield
add(
  "1-walk",
  "1 Walk to the tutor",
  "The tutor comes to you. Walk to the mark.",
  scene() +
    marker(560, 330, 1) +
    tutor(600, 300) +
    body(240, 300, FRIEND) +
    cursor(560, 330) +
    key(402, 424, "W", 30) +
    key(436, 424, "A", 30) +
    key(470, 424, "S", 30) +
    key(504, 424, "D", 30) +
    say("“This war never ends. Walk with me; I have an idea.”") +
    skip,
);

add(
  "2-look",
  "2 Look north",
  "Zoom out, right-drag north: find the teleporter.",
  scene() +
    `<rect x="300" y="0" width="360" height="70" fill="#6a3fe8" opacity=".12"/>` +
    teleporter(480, 56) +
    arrow(480, 140, 480, 96) +
    body(480, 330, FRIEND) +
    tutor(540, 340) +
    `<rect x="190" y="140" width="580" height="360" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="10 8" opacity=".6"/>` +
    tag(480, 128, "outside your view") +
    `<rect x="840" y="400" width="40" height="64" rx="18" fill="#dfe7f1" stroke="${INK}" stroke-width="2"/><path d="M860,400 v28 M840,428 h40" stroke="${INK}" stroke-width="2"/><rect x="860" y="400" width="20" height="28" fill="${GLOW}"/>` +
    tag(832, 448, "right-drag", "end") +
    say("“Maybe if we used this teleporter, we'd find a way around the battlefield.”") +
    skip,
);

add(
  "3-teleport",
  "3 Step in",
  "Walk into the teleporter. Whoosh: the canyon.",
  scene() +
    teleporter(480, 200) +
    body(480, 210, FRIEND, 12) +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#glow)" opacity=".15"/>` +
    tutor(560, 250) +
    marker(480, 200, 1) +
    `<path d="M600,220 C680,180 760,160 840,150" stroke="#cfd8e0" stroke-width="30" opacity=".25" fill="none"/>` +
    say("“Together. Hold your breath.”") +
    skip,
);

// B. The canyon
add(
  "4-boulders",
  "4 Dodge the boulders",
  "Red rings mark where rocks land. Step out of them.",
  canyon() +
    shadowRing(420, 300) +
    boulder(420, 200) +
    shadowRing(620, 400, 30) +
    boulder(620, 330, 24) +
    body(400, 320, FRIEND) +
    tutor(470, 380) +
    arrow(416, 326, 330, 400) +
    key(402, 440, "W", 30) +
    key(436, 440, "A", 30) +
    key(470, 440, "S", 30) +
    key(504, 440, "D", 30) +
    say("“Rocks! Move, move, move!”") +
    skip,
);

add(
  "5-wall",
  "5 Break the wall",
  "Target the cracked wall and attack it.",
  canyon() +
    wall(560, 150, 70, 200, true) +
    body(330, 290, FRIEND) +
    tutor(390, 330) +
    `<path d="M346,290 C440,250 500,240 556,256" stroke="#ff8a3d" stroke-width="5" fill="none" stroke-dasharray="2 8" stroke-linecap="round"/>` +
    `<rect x="520" y="110" width="150" height="34" rx="8" fill="#0b0f14" opacity=".85" stroke="#7a8697" stroke-width="2"/><text x="530" y="132" class="n">Wall  100%</text>` +
    pulse(514, 104, 162, 46) +
    key(402, 440, "Space", 64) +
    say("“That wall's in our way. Hit it until it falls.”") +
    skip,
);

add(
  "6-heal",
  "6 Heal the tutor",
  "A rock hits the tutor. Heal them.",
  canyon() +
    boulder(470, 280, 18) +
    tutor(440, 310) +
    hit(440, 270, "−60%") +
    body(330, 320, FRIEND) +
    party(0.35) +
    pulse(18, 54, 182, 64) +
    skillBar(250, H - 130, 0, false).replace(/fill="#b5532a"/, 'fill="#76c96f"') +
    pulse(244, H - 136, 64, 64) +
    key(262, H - 168, "2") +
    tag(330, H - 144, "heal", "start") +
    say("“Ow! The rock got me. A little help?”") +
    skip,
);

add(
  "7-ground",
  "7 Cross the bad ground",
  "Lava glows, mud slows. Find the safe way across.",
  canyon() +
    `<ellipse cx="480" cy="360" rx="70" ry="28" fill="#5a4a2a" opacity=".8" stroke="#8a7a4a" stroke-width="2"/>` +
    tag(480, 400, "mud: Crippled") +
    body(260, 300, FRIEND) +
    tutor(310, 340) +
    marker(700, 300, 1) +
    `<path d="M276,300 C380,260 600,250 684,296" stroke="#fff" stroke-width="2" stroke-dasharray="3 9" fill="none"/>` +
    `<rect x="${W - 130}" y="120" width="104" height="70" rx="8" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="2"/>` +
    effect(W - 120, 130, "#6a5a2a", 0.6, "C") +
    tag(W - 16, 108, "effects monitor", "end") +
    say("“Mind the mud. It slows you down, but it wears off.”") +
    skip,
);

add(
  "8-rats",
  "8 Rats!",
  "Different skills for different rats.",
  canyon() +
    rat(560, 260) +
    rat(640, 330) +
    rat(500, 340) +
    body(340, 300, FRIEND) +
    tutor(400, 340) +
    `<circle cx="560" cy="256" r="26" fill="none" stroke="${GLOW}" stroke-width="3"/>` +
    hudBlock() +
    skillBar(250, H - 130, 0.4, true) +
    key(262, H - 168, "1") +
    key(320, H - 168, "2") +
    key(378, H - 168, "3") +
    say("“Rats! Try a different skill on each.”") +
    skip,
);

add(
  "9-climb",
  "9 Climb a layer",
  "Up the ledge, or Alt + click to drop below.",
  canyon() +
    `<rect x="560" y="236" width="190" height="110" fill="${DECK_F}" stroke="${INK}" stroke-width="2"/><rect x="560" y="196" width="190" height="110" fill="${DECK}" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="655" cy="254" rx="30" ry="14" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="655" cy="346" rx="30" ry="14" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/>` +
    body(655, 238, FRIEND) +
    tutor(600, 250) +
    cursor(655, 346) +
    key(386, 424, "Alt", 46) +
    tag(440, 445, "+ click", "start") +
    tag(770, 392, "dashed: the ground below", "end") +
    tag(770, 184, "solid: the ledge", "end") +
    say("“Up we go. Wait, what's down there?”") +
    skip,
);

add(
  "10-ramp",
  "10 Up the ramp",
  "Walk up the ramp to reach the high ground.",
  canyon() +
    `<polygon points="520,330 600,350 600,372 520,352" fill="${DECK_F}" stroke="${INK}" stroke-width="2"/><rect x="600" y="226" width="200" height="126" fill="${DECK_F}" stroke="${INK}" stroke-width="2"/><rect x="600" y="186" width="200" height="126" fill="${DECK}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M400,300 L600,250 L600,310 L400,340 Z" fill="#7d8ea4" stroke="${INK}" stroke-width="2"/>` +
    body(430, 320, FRIEND) +
    tutor(470, 340) +
    arrow(446, 316, 600, 270) +
    marker(700, 250, 1) +
    say("“A ramp! Walk up it, it's easy.”") +
    skip,
);

add(
  "11-tunnel",
  "11 Sneak through the tunnel",
  "Stay low and quiet through the tunnel.",
  canyon() +
    `<path d="M520,180 h200 v200 h-200 Z" fill="${ROCK}" stroke="${INK}" stroke-width="3"/><path d="M550,380 v-120 a70,70 0 0 1 140,0 v120 Z" fill="#0b0f14" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="620" cy="320" r="12" fill="#e8c27a" opacity=".8"/>` +
    body(400, 330, FRIEND) +
    tutor(450, 360) +
    arrow(416, 330, 560, 330) +
    `<circle cx="620" cy="230" r="10" fill="${FOE}" opacity=".7"/><path d="M620,220 l30,-30 M620,220 l-30,-30" stroke="${FOE}" stroke-width="3" opacity=".5"/>` +
    tag(660, 210, "sleeping guard") +
    say("“Shh. Don't wake them.”") +
    skip,
);

add(
  "12-call",
  "12 Call a target",
  "Wheel-click a foe to call it.",
  canyon() +
    rat(620, 280) +
    rat(700, 330) +
    body(320, 320, FRIEND) +
    tutor(380, 350) +
    `<circle cx="620" cy="280" r="34" fill="none" stroke="${GLOW}" stroke-width="4"/><path d="M620,236 v-24 m-8,8 l8,-8 l8,8" stroke="${GLOW}" stroke-width="3" fill="none"/>` +
    party(1) +
    key(24, 424, "T") +
    tag(62, 445, "targets the called foe", "start") +
    say("“That one. Call it.”") +
    skip,
);

add(
  "13-junction",
  "13 Ping the way",
  "A Y-junction: wheel-click the ground to ping.",
  canyon() +
    `<path d="M300,330 L520,330 L700,200 M520,330 L700,440" stroke="#4a3d36" stroke-width="70" fill="none" stroke-linejoin="round"/>` +
    `<path d="M300,330 L520,330 L700,200 M520,330 L700,440" stroke="#6a5a4e" stroke-width="3" fill="none" stroke-dasharray="6 8"/>` +
    `<circle cx="700" cy="200" r="16" fill="none" stroke="${GLOW}" stroke-width="4"/><circle cx="700" cy="200" r="30" fill="none" stroke="${GLOW}" stroke-width="2" opacity=".5"/>` +
    tag(700, 170, "ping the way") +
    tag(780, 440, "dead end?") +
    body(380, 330, FRIEND) +
    tutor(430, 350) +
    cursor(700, 200) +
    `<circle cx="${W - 90}" cy="${H - 150}" r="60" fill="#0b0f14" opacity=".8" stroke="#7a8697" stroke-width="3"/><circle cx="${W - 70}" cy="${H - 175}" r="8" fill="none" stroke="${GLOW}" stroke-width="3"/>` +
    say("“Left or right? You call it. Ping our way.”") +
    skip,
);

add(
  "14-front",
  "14 Back to the front",
  "The canyon opens behind the lines. Follow the tutor.",
  scene() +
    body(480, 290, FRIEND) +
    tutor(550, 280) +
    `<path d="M570,280 L760,230" stroke="#fff" stroke-width="3" stroke-dasharray="4 8" fill="none"/>` +
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
    say("“Now we have the high ground. Follow me.”") +
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
    "64",
    `PNG8:${join(out, `${id}.png`)}`,
  ]);
}
