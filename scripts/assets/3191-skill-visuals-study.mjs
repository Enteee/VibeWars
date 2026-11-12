/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3191: how ten skills, one per skill type, look in play. Boards, not assets.
// Usage: node scripts/assets/3191-skill-visuals-study.mjs <out-dir>   (needs inkscape and imagemagick)
// Writes <out-dir>/3191-<slug>.png per skill and 3191-team-fight.png.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const INK = "#0b0f14",
  FRIEND = "#59c2ff",
  FOE = "#ff7b72",
  FLOOR = "#26303f",
  WARM = "#ff8a3d",
  GOLD = "#ffd23d",
  VIOLET = "#a77bff",
  BRASS = "#e8c27a",
  HELP = "#9fdcff",
  NATURE = "#76c96f",
  STEEL = "#dfe7f1";
const TW = 300,
  TH = 200;

const DEFS = `<defs><style>.n{font:12px 'DejaVu Sans',sans-serif;fill:#f2f5fa;paint-order:stroke;stroke:${INK};stroke-width:3px}.h{font:bold 17px 'DejaVu Sans',sans-serif;fill:#fff}.s{font:12px 'DejaVu Sans',sans-serif;fill:#9fb0c6}</style>
<radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;

/** @type {(x: number, y: number, r: number, c: string, o?: number) => string} */
const glow = (x, y, r, c, o = 0.6) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}" style="mix-blend-mode:screen"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${c}" opacity="${Math.min(1, o + 0.3)}"/>`;
/** @type {(x: number, y: number, rx: number, c: string, w?: number, dash?: string, o?: number, fill?: string) => string} */
const ring = (x, y, rx, c, w = 2, dash = "", o = 1, fill = "none") =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.5}" fill="${fill}" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} opacity="${o}"/>`;
/** a body as drawn today: shadow, cape, disc, weapon mark. */
/** @type {(x: number, y: number, c?: string, o?: {scale?: number, cape?: string, weapon?: number, lift?: number}) => string} */
const body = (x, y, c = FRIEND, o = {}) => {
  const s = o.scale ?? 1;
  const r = 15 * s;
  const lift = o.lift ?? 0;
  return (
    `<ellipse cx="${x}" cy="${y + r * 0.9}" rx="${r}" ry="${r * 0.4}" fill="#080b10" opacity=".55"/>` +
    `<path d="M${x - r * 0.6},${y - lift} l${-r * 0.9},${r * 1.4} l${r * 1.3},${-r * 0.2} Z" fill="${o.cape ?? "#3a4a63"}" stroke="${INK}" stroke-width="1.5"/>` +
    `<circle cx="${x}" cy="${y - lift}" r="${r}" fill="${c}" stroke="#fff" stroke-width="2.5"/>` +
    `<path d="M${x + r * 0.5},${y - lift - r * 0.2} l${r * 1.2},${-r * 0.6 + (o.weapon ?? 0) * r}" stroke="#d9dde3" stroke-width="3" stroke-linecap="round"/>`
  );
};
/** @type {(x: number, y: number, f: number) => string} */
const castbar = (x, y, f) =>
  `<rect x="${x - 18}" y="${y + 22}" width="36" height="5" rx="2" fill="${INK}" stroke="#7a8697"/><rect x="${x - 17}" y="${y + 23}" width="${34 * f}" height="3" fill="${GOLD}"/>`;
/** @type {(x: number, y: number, hp: number, c?: string) => string} */
const hpbar = (x, y, hp, c = "#c9423a") =>
  `<rect x="${x - 18}" y="${y - 30}" width="36" height="5" rx="2" fill="${INK}" stroke="#7a8697"/><rect x="${x - 17}" y="${y - 29}" width="${34 * hp}" height="3" fill="${c}"/>`;
/** @type {(x: number, y: number, t: string, a?: string) => string} */
const tx = (x, y, t, a = "middle") =>
  `<text x="${x}" y="${y}" class="n" text-anchor="${a}">${t}</text>`;
/** a burst of shards at an impact */
/** @type {(x: number, y: number, r: number, c: string, n?: number) => string} */
const burst = (x, y, r, c, n = 8) => {
  let s = `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="${c}" opacity=".35"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="3"/>`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s += `<path d="M${x + Math.cos(a) * r * 0.8},${y + Math.sin(a) * r * 0.8 * 0.7} L${x + Math.cos(a) * r * 1.5},${y + Math.sin(a) * r * 1.5 * 0.7}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return s;
};
/** a hex halo: a broken violet hexagon floating over a head */
/** @type {(x: number, y: number, o?: number, broken?: number) => string} */
const hexHalo = (x, y, o = 1, broken = 2) => {
  let s = "";
  for (let i = 0; i < 6; i++) {
    if (i < broken) continue;
    const a0 = (i / 6) * Math.PI * 2,
      a1 = ((i + 1) / 6) * Math.PI * 2;
    s += `<path d="M${x + Math.cos(a0) * 16},${y + Math.sin(a0) * 8} L${x + Math.cos(a1) * 16},${y + Math.sin(a1) * 8}" stroke="${VIOLET}" stroke-width="3" stroke-linecap="round" opacity="${o}"/>`;
  }
  return s;
};

/** @typedef {{ label: string, svg: string, inset?: [number, number, number?] }} Tile */
/** @typedef {{ slug: string, name: string, id: string, type: string, line: string, cast: Tile[], fx: Tile[] }} Skill */

const CX = 90,
  CY = 118,
  FX = 215;

/** @type {Skill[]} */
const skills = [
  {
    slug: "glowstone",
    name: "Glowstone",
    id: "elementalist.glowstone",
    type: "spell, projectile",
    line: "A gold-white orb: warm is damage. Bright core, short trail, ground shadow so its height reads.",
    cast: [
      {
        label: "start",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.8 }) +
          glow(CX + 22, CY - 14, 7, GOLD, 0.4) +
          castbar(CX, CY, 0.1),
      },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.8 }) +
          glow(CX + 22, CY - 16, 12, GOLD, 0.55) +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          glow(CX + 28, CY - 12, 16, "#fff", 0.6) +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      {
        label: "flight",
        svg:
          body(CX, CY) +
          body(FX, CY, FOE) +
          hpbar(FX, CY, 0.8) +
          `<ellipse cx="150" cy="${CY + 20}" rx="7" ry="3" fill="#080b10" opacity=".5"/>` +
          [0.15, 0.3, 0.5]
            .map(
              (o, i) =>
                `<circle cx="${128 - i * 12}" cy="${CY - 12 + i * 2}" r="${5 - i}" fill="${WARM}" opacity="${0.6 - o * 0.6 + 0.1}"/>`,
            )
            .join("") +
          glow(150, CY - 14, 12, GOLD, 0.55),
      },
      {
        label: "impact (game size)",
        svg:
          body(CX, CY) +
          burst(FX, CY - 4, 22, WARM) +
          body(FX, CY, FOE) +
          hpbar(FX, CY, 0.55) +
          tx(FX + 4, CY - 38, "−45", "middle"),
      },
      {
        label: "impact, 3× inset",
        svg: burst(FX, CY - 4, 22, WARM) + body(FX, CY, FOE) + tx(FX + 4, CY - 38, "−45"),
        inset: [FX, CY - 4],
      },
    ],
  },
  {
    slug: "chaos-storm",
    name: "Chaos Storm",
    id: "mesmer.chaos-storm",
    type: "spell, ground area",
    line: "Violet is magic; the dashed edge is harmful ground. The edge jumps wide when it lands, thins before it ends.",
    cast: [
      {
        label: "start",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.8 }) +
          ring(CX + 24, CY - 14, 8, VIOLET, 2, "", 0.7) +
          castbar(CX, CY, 0.1),
      },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.8 }) +
          ring(CX + 24, CY - 14, 15, VIOLET, 2, "", 0.8) +
          ring(CX + 24, CY - 14, 8, "#fff", 1.5, "", 0.6) +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          `<path d="M${CX + 30},${CY - 14} L${FX},${CY + 4}" stroke="${VIOLET}" stroke-width="2" stroke-dasharray="3 6"/>` +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      {
        label: "lands: edge 2.5× wide",
        svg:
          body(CX - 40, CY) +
          body(FX, CY, FOE) +
          ring(FX, CY + 4, 62, VIOLET, 6, "10 6", 1, "rgba(167,123,255,.35)"),
      },
      {
        label: "lasting: swirls, 1.6 s breath",
        svg:
          body(CX - 40, CY) +
          body(FX, CY, FOE) +
          ring(FX, CY + 4, 62, VIOLET, 2, "10 6", 1, "rgba(167,123,255,.18)") +
          [0, 1, 2]
            .map(
              (i) =>
                `<path d="M${FX - 30 + i * 28},${CY - 6 + (i % 2) * 14} q10,-12 20,0" stroke="${VIOLET}" stroke-width="2" fill="none" opacity=".7"/>`,
            )
            .join(""),
        inset: [FX - 20, CY + 4],
      },
      {
        label: "ends: edge thins, dashes break",
        svg:
          body(CX - 40, CY) +
          body(FX, CY, FOE) +
          ring(FX, CY + 4, 62, VIOLET, 1, "4 14", 0.7, "rgba(167,123,255,.06)"),
      },
    ],
  },
  {
    slug: "well-of-darkness",
    name: "Well of Darkness",
    id: "necromancer.well-of-darkness",
    type: "well",
    line: "A lasting pool: dark violet fill under a dashed edge, a slow wisp rising. Foes inside show a small curse mark.",
    cast: [
      {
        label: "start",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.5 }) +
          ring(CX + 30, CY + 10, 8, VIOLET, 2, "3 3", 0.6) +
          castbar(CX, CY, 0.1),
      },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.5 }) +
          ring(CX + 30, CY + 10, 18, VIOLET, 2, "5 4", 0.8, "rgba(60,30,100,.5)") +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          ring(CX + 34, CY + 12, 26, VIOLET, 5, "8 5", 1, "rgba(60,30,100,.6)") +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      {
        label: "well (game size)",
        svg:
          body(CX - 40, CY) +
          ring(FX, CY + 6, 60, VIOLET, 2, "8 5", 1, "rgba(60,30,100,.55)") +
          body(FX, CY, FOE) +
          `<path d="M${FX - 8},${CY - 26} l8,-6 l8,6" stroke="${VIOLET}" stroke-width="2" fill="none"/>` +
          [0, 1]
            .map(
              (i) =>
                `<path d="M${FX - 30 + i * 50},${CY + 30} q-6,-14 2,-26" stroke="#7a5ad0" stroke-width="3" fill="none" opacity=".6"/>`,
            )
            .join(""),
      },
      {
        label: "3× inset: curse mark",
        svg:
          body(FX, CY, FOE) +
          `<path d="M${FX - 8},${CY - 26} l8,-6 l8,6" stroke="${VIOLET}" stroke-width="2" fill="none"/>` +
          ring(FX, CY + 6, 60, VIOLET, 2, "8 5", 1, "rgba(60,30,100,.55)"),
        inset: [FX, CY - 8],
      },
      {
        label: "ends: pool shrinks, wisps stop",
        svg:
          body(CX - 40, CY) +
          ring(FX, CY + 6, 26, VIOLET, 1, "4 10", 0.7, "rgba(60,30,100,.2)") +
          body(FX, CY, FOE),
      },
    ],
  },
  {
    slug: "favorable-winds",
    name: "Favorable Winds",
    id: "ranger.favorable-winds",
    type: "nature ritual (spirit)",
    line: "A spirit is a small pale-green wisp on the ground with its own health bar; calm green solid ring is its range.",
    cast: [
      {
        label: "start",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.6 }) +
          castbar(CX, CY, 0.1) +
          `<path d="M${CX + 24},${CY + 14} q4,-8 8,0" stroke="${NATURE}" stroke-width="2" fill="none"/>`,
      },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.6 }) +
          castbar(CX, CY, 0.55) +
          `<path d="M${CX + 24},${CY + 18} q6,-16 12,0 q-6,-6 -12,0" stroke="${NATURE}" stroke-width="2.5" fill="rgba(118,201,111,.4)"/>`,
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          castbar(CX, CY, 1) +
          glow(CX + 34, CY + 16, 14, NATURE, 0.5),
      },
    ],
    fx: [
      {
        label: "spirit and range",
        svg:
          ring(150, CY + 6, 90, NATURE, 2, "", 0.9, "rgba(118,201,111,.12)") +
          `<ellipse cx="150" cy="${CY + 20}" rx="10" ry="4" fill="#080b10" opacity=".5"/><path d="M142,${CY + 18} q8,-30 16,0 q-8,-8 -16,0" fill="#c8f0b0" stroke="${INK}" stroke-width="1.5"/><circle cx="150" cy="${CY - 6}" r="3" fill="#fff"/>` +
          hpbar(150, CY + 10, 1, NATURE) +
          body(110, CY - 6) +
          body(200, CY + 4) +
          `<path d="M96,${CY - 30} h20 M184,${CY - 20} h20" stroke="${NATURE}" stroke-width="2" stroke-dasharray="6 4"/>`,
      },
      {
        label: "3× inset: spirit",
        svg:
          `<ellipse cx="150" cy="${CY + 20}" rx="10" ry="4" fill="#080b10" opacity=".5"/><path d="M142,${CY + 18} q8,-30 16,0 q-8,-8 -16,0" fill="#c8f0b0" stroke="${INK}" stroke-width="1.5"/><circle cx="150" cy="${CY - 6}" r="3" fill="#fff"/>` +
          hpbar(150, CY + 10, 1, NATURE),
        inset: [150, CY + 6],
      },
      {
        label: "ends: spirit dies, ring fades",
        svg:
          ring(150, CY + 6, 90, NATURE, 1, "3 12", 0.4) +
          `<path d="M142,${CY + 18} q8,-16 16,0" fill="rgba(200,240,176,.4)"/>` +
          body(110, CY - 6) +
          body(200, CY + 4),
      },
    ],
  },
  {
    slug: "wail-of-doom",
    name: "Wail of Doom",
    id: "necromancer.wail-of-doom",
    type: "hex",
    line: "A hex is a broken violet hexagon over the head, same for both teams. Foe-side adds nothing hidden.",
    cast: [
      { label: "start", svg: body(CX, CY, FRIEND, { weapon: -0.6 }) + castbar(CX, CY, 0.1) },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.6 }) +
          ring(CX + 18, CY - 8, 14, VIOLET, 2, "", 0.7) +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          ring(CX + 30, CY - 6, 24, VIOLET, 2, "", 0.7) +
          ring(CX + 48, CY - 4, 34, VIOLET, 2, "", 0.4) +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      {
        label: "your view of the hexed foe",
        svg: body(CX, CY) + body(FX, CY, FOE) + hpbar(FX, CY, 0.9) + hexHalo(FX, CY - 44),
      },
      {
        label: "3× inset: the halo",
        svg: body(FX, CY, FOE) + hexHalo(FX, CY - 44),
        inset: [FX, CY - 34],
      },
      {
        label: "same halo for the hexed foe's team",
        svg: body(CX, CY, FOE) + body(FX, CY, FRIEND) + hpbar(FX, CY, 0.9) + hexHalo(FX, CY - 44),
      },
    ],
  },
  {
    slug: "healers-covenant",
    name: "Healer's Covenant",
    id: "monk.healers-covenant",
    type: "enchantment (self, maintained)",
    line: "Enchantment = a solid brass ring at the feet and slow motes. A maintained one shows the ring only while energy is held.",
    cast: [
      { label: "start", svg: body(CX, CY, FRIEND, { weapon: -0.5 }) + castbar(CX, CY, 0.1) },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.5 }) +
          ring(CX, CY + 14, 14, BRASS, 2, "", 0.6) +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          body(CX, CY, FRIEND, { weapon: 0.2 }) +
          ring(CX, CY + 14, 30, BRASS, 5, "", 1) +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      {
        label: "lasting look",
        svg:
          body(150, CY) +
          ring(150, CY + 14, 26, BRASS, 3, "", 1, "rgba(232,194,122,.14)") +
          [0, 1, 2]
            .map(
              (i) =>
                `<circle cx="${150 + Math.cos(i * 2.1) * 26}" cy="${CY + 14 + Math.sin(i * 2.1) * 13}" r="2.5" fill="${BRASS}"/>`,
            )
            .join(""),
      },
      {
        label: "3× inset",
        svg:
          body(150, CY) +
          ring(150, CY + 14, 26, BRASS, 3, "", 1, "rgba(232,194,122,.14)") +
          [0, 1, 2]
            .map(
              (i) =>
                `<circle cx="${150 + Math.cos(i * 2.1) * 26}" cy="${CY + 14 + Math.sin(i * 2.1) * 13}" r="2.5" fill="${BRASS}"/>`,
            )
            .join(""),
        inset: [150, CY + 8],
      },
      {
        label: "ends: ring flickers, breaks",
        svg:
          body(150, CY) +
          ring(150, CY + 14, 26, BRASS, 2, "4 12", 0.5) +
          [0, 1, 2]
            .map(
              (i) =>
                `<circle cx="${140 + i * 10}" cy="${CY + 38 + i * 3}" r="1.8" fill="${BRASS}" opacity=".7"/>`,
            )
            .join(""),
      },
    ],
  },
  {
    slug: "soldiers-speed",
    name: "Soldier's Speed",
    id: "warrior.soldiers-speed",
    type: "stance",
    line: "A stance is a flat steel-white band under the feet with speed streaks behind, no ring, no motes.",
    cast: [
      { label: "start", svg: body(CX, CY, FRIEND, { weapon: 0.3 }) },
      {
        label: "mid",
        svg: body(CX, CY, FRIEND, { weapon: 0.3 }) + ring(CX, CY + 14, 18, STEEL, 2, "", 0.4),
      },
      {
        label: "release",
        svg: body(CX, CY, FRIEND, { weapon: 0.3 }) + ring(CX, CY + 14, 24, STEEL, 4, "", 0.8),
      },
    ],
    fx: [
      {
        label: "moving in the stance",
        svg:
          [0, 1, 2]
            .map(
              (i) =>
                `<path d="M${90 - i * 6},${CY - 6 + i * 9} h-${40 - i * 8}" stroke="${STEEL}" stroke-width="2" opacity="${0.7 - i * 0.2}"/>`,
            )
            .join("") +
          body(160, CY) +
          `<ellipse cx="160" cy="${CY + 16}" rx="24" ry="7" fill="none" stroke="${STEEL}" stroke-width="3"/>`,
      },
      {
        label: "3× inset",
        svg:
          [0, 1, 2]
            .map(
              (i) =>
                `<path d="M${130 - i * 6},${CY - 6 + i * 9} h-${40 - i * 8}" stroke="${STEEL}" stroke-width="2" opacity="${0.7 - i * 0.2}"/>`,
            )
            .join("") +
          body(160, CY) +
          `<ellipse cx="160" cy="${CY + 16}" rx="24" ry="7" fill="none" stroke="${STEEL}" stroke-width="3"/>`,
        inset: [150, CY],
      },
      {
        label: "ends: band fades at once",
        svg:
          body(160, CY) +
          `<ellipse cx="160" cy="${CY + 16}" rx="24" ry="7" fill="none" stroke="${STEEL}" stroke-width="1" opacity=".3" stroke-dasharray="3 6"/>`,
      },
    ],
  },
  {
    slug: "avatar-of-grenth",
    name: "Avatar of Grenth",
    id: "dervish.avatar-of-grenth",
    type: "form",
    line: "A form changes the body itself: 1.35× disc, ash cape with spikes, a cold white aura. Foe-side the outline stays foe red.",
    cast: [
      { label: "start", svg: body(CX, CY, FRIEND, { weapon: -0.4 }) + castbar(CX, CY, 0.1) },
      {
        label: "mid",
        svg:
          `<rect x="${CX - 14}" y="${CY - 90}" width="28" height="104" fill="${HELP}" opacity=".25"/>` +
          body(CX, CY, FRIEND, { weapon: -0.4 }) +
          castbar(CX, CY, 0.55),
      },
      {
        label: "release",
        svg:
          glow(CX, CY, 46, "#d8e4ff", 0.5) +
          body(CX, CY, FRIEND, { scale: 1.2, cape: "#cfd8e8" }) +
          castbar(CX, CY, 1),
      },
    ],
    fx: [
      { label: "before", svg: body(150, CY) },
      {
        label: "in the form",
        svg:
          glow(150, CY, 48, "#d8e4ff", 0.35) +
          `<path d="M130,${CY - 6} l-8,-14 l10,4 M170,${CY - 6} l8,-14 l-10,4" stroke="#cfd8e8" stroke-width="3" fill="none"/>` +
          body(150, CY, FRIEND, { scale: 1.35, cape: "#cfd8e8" }) +
          `<circle cx="150" cy="${CY}" r="28" fill="none" stroke="#d8e4ff" stroke-width="2" opacity=".8"/>`,
        inset: [150, CY, 2],
      },
      {
        label: "ends: aura drops, cape reverts",
        svg:
          body(150, CY) +
          `<circle cx="150" cy="${CY}" r="26" fill="none" stroke="#d8e4ff" stroke-width="1" stroke-dasharray="3 8" opacity=".4"/>`,
      },
    ],
  },
  {
    slug: "none-shall-pass",
    name: "None Shall Pass",
    id: "warrior.none-shall-pass",
    type: "shout",
    line: "A shout is instant: no cast bar, one cool ring leaves the caster in 0.3 s and each ally gets a chevron.",
    cast: [
      {
        label: "instant: no cast",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.6 }) +
          `<text x="150" y="40" class="n" text-anchor="middle">no cast bar, no frames</text>`,
      },
    ],
    fx: [
      {
        label: "t+0.0 s",
        svg:
          body(150, CY, FRIEND, { weapon: -0.6 }) +
          ring(150, CY + 14, 22, HELP, 4) +
          body(70, CY + 20) +
          body(235, CY - 14),
      },
      {
        label: "t+0.3 s: ring reaches allies",
        svg:
          body(150, CY, FRIEND, { weapon: -0.6 }) +
          ring(150, CY + 14, 92, HELP, 3, "", 0.8) +
          body(70, CY + 20) +
          body(235, CY - 14),
      },
      {
        label: "lasting chevron (3× inset)",
        svg:
          body(150, CY) +
          `<path d="M138,${CY - 36} l12,-10 l12,10 M138,${CY - 28} l12,-10 l12,10" stroke="${HELP}" stroke-width="3" fill="none"/>`,
        inset: [150, CY - 20],
      },
    ],
  },
  {
    slug: "mighty-blow",
    name: "Mighty Blow",
    id: "warrior.mighty-blow",
    type: "attack skill",
    line: "A plain swing is a thin white arc. A skill adds a thick warm arc, a spark on the weapon mark, a brief impact star and a nudge line.",
    cast: [
      { label: "start", svg: body(CX, CY, FRIEND, { weapon: -1 }) + body(FX, CY, FOE) },
      {
        label: "mid",
        svg:
          body(CX, CY, FRIEND, { weapon: -0.2 }) +
          `<path d="M${CX + 10},${CY - 40} q50,10 56,50" stroke="${WARM}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>` +
          body(FX, CY, FOE),
      },
      {
        label: "release",
        svg:
          body(CX + 30, CY, FRIEND, { weapon: 0.4 }) +
          body(FX, CY, FOE) +
          burst(FX - 10, CY - 6, 16, GOLD, 6),
      },
    ],
    fx: [
      {
        label: "a plain swing",
        svg:
          body(CX + 30, CY) +
          `<path d="M${CX + 40},${CY - 34} q40,6 46,40" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>` +
          body(FX, CY, FOE),
      },
      {
        label: "Mighty Blow",
        svg:
          body(CX + 30, CY) +
          `<path d="M${CX + 40},${CY - 36} q44,6 50,44" stroke="${WARM}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>` +
          body(FX + 8, CY, FOE) +
          burst(FX - 4, CY - 6, 16, GOLD, 6) +
          `<path d="M${FX + 20},${CY + 10} h22" stroke="#fff" stroke-width="2" stroke-dasharray="3 4"/>`,
      },
      {
        label: "3× inset: impact",
        svg:
          body(FX + 8, CY, FOE) +
          burst(FX - 4, CY - 6, 16, GOLD, 6) +
          `<path d="M${FX + 20},${CY + 10} h22" stroke="#fff" stroke-width="2" stroke-dasharray="3 4"/>`,
        inset: [FX, CY - 4],
      },
    ],
  },
];

/** @type {(t: Tile, x: number, y: number) => string} */
const tile = (t, x, y) => {
  const id = `c${x}_${y}`;
  let inner = t.svg;
  if (t.inset) {
    const [fx, fy, k = 3] = t.inset;
    inner = `<g transform="translate(150,100) scale(${k}) translate(${-fx},${-fy})">${t.svg}</g>`;
  }
  return (
    `<clipPath id="${id}"><rect width="${TW}" height="${TH}"/></clipPath>` +
    `<g transform="translate(${x},${y})"><rect width="${TW}" height="${TH}" rx="8" fill="${FLOOR}" stroke="#3a4a63" stroke-width="2"/><g clip-path="url(#${id})">${inner}</g>` +
    `<text x="10" y="${TH - 8}" class="n">${t.label}</text></g>`
  );
};

/** @type {(slug: string, svg: string, w: number, h: number) => void} */
const render = (slug, svg, w, h) => {
  const p = join(out, `3191-${slug}.svg`);
  const png = join(out, `3191-${slug}.png`);
  writeFileSync(
    p,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${DEFS}<rect width="${w}" height="${h}" fill="#0e1116"/>${svg.replace(/fill="rgba\((\d+),(\d+),(\d+),([\d.]+)\)"/g, 'fill="rgb($1,$2,$3)" fill-opacity="$4"')}</svg>`,
  );
  execFileSync("inkscape", [p, "-w", String(w), "-o", png], { stdio: "ignore" });
  rmSync(p);
  execFileSync("magick", [png, "-colors", "64", `PNG8:${png}`]);
};

for (const s of skills) {
  const W = 3 * TW + 4 * 12,
    H = 2 * TH + 3 * 12 + 56;
  let g = `<text x="12" y="26" class="h">${s.name}</text><text x="${W - 12}" y="26" class="s" text-anchor="end">${s.type} · ${s.id}</text><text x="12" y="46" class="s">${s.line}</text>`;
  s.cast.forEach((t, i) => (g += tile(t, 12 + i * (TW + 12), 56)));
  s.fx.forEach((t, i) => (g += tile(t, 12 + i * (TW + 12), 56 + TH + 12)));
  render(s.slug, g, W, H);
}

// Team fight check: 4 v 4, three effects at once, who is who, who is hexed.
{
  const W = 960,
    H = 440;
  const g =
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="8" fill="${FLOOR}"/>` +
    ring(430, 300, 90, VIOLET, 2, "8 5", 1, "rgba(60,30,100,.5)") +
    // friends
    body(250, 170) +
    ring(250, 184, 26, BRASS, 3, "", 1, "rgba(232,194,122,.14)") +
    body(200, 290) +
    `<ellipse cx="200" cy="306" rx="24" ry="7" fill="none" stroke="${STEEL}" stroke-width="3"/>` +
    `<path d="M170,284 h-30 M172,294 h-24" stroke="${STEEL}" stroke-width="2" opacity=".6"/>` +
    body(300, 360) +
    body(330, 230) +
    // foes: one hexed, one in a form, two in the well
    body(640, 180, FOE) +
    hexHalo(640, 136) +
    glow(700, 300, 48, "#d8e4ff", 0.3) +
    body(700, 300, FOE, { scale: 1.35, cape: "#cfd8e8" }) +
    body(410, 280, FOE) +
    body(470, 330, FOE) +
    `<path d="M402,246 l8,-6 l8,6" stroke="${VIOLET}" stroke-width="2" fill="none"/>` +
    tx(250, 130, "Healer's Covenant (brass ring)") +
    tx(200, 340, "Soldier's Speed (steel band)") +
    tx(640, 110, "Wail of Doom: hexed") +
    tx(430, 220, "Well of Darkness (dashed pool)") +
    tx(700, 370, "Avatar of Grenth: 1.35× form") +
    tx(
      480,
      420,
      "friend blue and foe red stay on the body discs only; every effect is violet, brass, steel or cool white.",
    );
  render("team-fight", g, W, H);
}
