/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Study for #3052: the nine Wilds ground zones, each painted as its real thing.
// Usage: node scripts/assets/zones-study.mjs <out-dir>   (needs inkscape)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "docs/art";
mkdirSync(out, { recursive: true });

const W = 250,
  H = 190,
  GAP = 8,
  COLS = 3;
const FLOOR = "#2c3442";
// Palette per kind: base, mid, accent, edge, light (colour, radius scale, intensity)
/** @type {Record<string, {base: string, mid: string, acc: string, edge: string, light: [string, number, number] | null}>} */
const P = {
  molten: {
    base: "#2a1410",
    mid: "#7a2a10",
    acc: "#ffb03d",
    edge: "#ffd23d",
    light: ["#ff9040", 1.6, 0.9],
  },
  scorched: {
    base: "#1c1614",
    mid: "#3a2a22",
    acc: "#ff6a2a",
    edge: "#ff8a3d",
    light: ["#ff7a30", 1.2, 0.35],
  },
  "toxic-fog": { base: "#7fbf2a", mid: "#a8d84a", acc: "#e0f58a", edge: "#c8f05a", light: null },
  mire: { base: "#4a3418", mid: "#6b4a26", acc: "#2a1c0c", edge: "#9c7a46", light: null },
  "foul-water": { base: "#2c4430", mid: "#3d5a3a", acc: "#8a9a4a", edge: "#6f8f5a", light: null },
  "tainted-water": {
    base: "#1a1226",
    mid: "#2c1f40",
    acc: "#9a7ad0",
    edge: "#a77bff",
    light: null,
  },
  spring: {
    base: "#2f86d0",
    mid: "#4fb0f0",
    acc: "#e8faff",
    edge: "#9fdcff",
    light: ["#8fd0ff", 1.3, 0.45],
  },
  grove: { base: "#2f8a3c", mid: "#4aa650", acc: "#ffe066", edge: "#76c96f", light: null },
  "draining-spire": {
    base: "#2a2236",
    mid: "#4a3a6a",
    acc: "#c9a8ff",
    edge: "#a77bff",
    light: ["#a77bff", 1.4, 0.7],
  },
};
const kinds = Object.keys(P);

// A blobby polygon: the gameplay truth, hard edge.
const poly = "M30,60 L90,22 L170,18 L226,56 L216,128 L160,170 L80,166 L28,120 Z";

const clip = (i) => `<clipPath id="c${i}"><path d="${poly}"/></clipPath>`;

/**
 * @param {string} k kind
 * @param {number} i tile index
 * @param {{base: string, mid: string, acc: string, edge: string, light: [string, number, number] | null}} p
 */
function texture(k, i, p) {
  /** @type {(s: number, f: string, o: number, cm: string) => string} */
  const noise = (s, f, o, cm) =>
    `<filter id="n${i}${s}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="${o}" seed="${i * 7 + s}"/><feColorMatrix type="matrix" values="${cm}"/></filter>`;
  /** @type {(s: number, op?: number, extra?: string) => string} */
  const rect = (s, op = 1, extra = "") =>
    `<rect width="${W}" height="${H}" filter="url(#n${i}${s})" opacity="${op}" ${extra}/>`;
  /** @type {(n: number, r: number, col: string, seed: number, op?: number) => string} */
  const dots = (n, r, col, seed, op = 1) => {
    let s = "",
      x = seed;
    for (let j = 0; j < n; j++) {
      x = (x * 9301 + 49297) % 233280;
      const a = x / 233280;
      x = (x * 9301 + 49297) % 233280;
      const b = x / 233280;
      s += `<circle cx="${(20 + a * 210).toFixed(0)}" cy="${(15 + b * 160).toFixed(0)}" r="${(r * (0.5 + a)).toFixed(1)}" fill="${col}" opacity="${op}"/>`;
    }
    return s;
  };
  let defs = "",
    body = "";
  switch (k) {
    case "molten": {
      // lava cracks: random-walk polylines, a blurred glow under a thin hot core
      defs = `<filter id="b${i}"><feGaussianBlur stdDeviation="3"/></filter>`;
      let r = 3,
        d = "";
      const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      for (let j = 0; j < 9; j++) {
        let x = 30 + rnd() * 190,
          y = 25 + rnd() * 140;
        d += `M${x.toFixed(0)},${y.toFixed(0)}`;
        let ang = rnd() * 6.28;
        for (let q = 0; q < 6; q++) {
          ang += (rnd() - 0.5) * 1.6;
          x += Math.cos(ang) * 22;
          y += Math.sin(ang) * 16;
          d += ` L${x.toFixed(0)},${y.toFixed(0)}`;
        }
      }
      body = `<rect width="${W}" height="${H}" fill="${p.base}"/><rect width="${W}" height="${H}" fill="${p.mid}" opacity=".3"/>
      <path d="${d}" fill="none" stroke="#ff5a1f" stroke-width="9" stroke-linejoin="round" filter="url(#b${i})" opacity=".9"/>
      <path d="${d}" fill="none" stroke="${p.acc}" stroke-width="3" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#fff3b0" stroke-width="1" stroke-linejoin="round"/>`;
      break;
    }
    case "scorched":
      defs = noise(0, "0.05", 3, "0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 1.4 -0.2");
      body = `<rect width="${W}" height="${H}" fill="${p.base}"/><rect width="${W}" height="${H}" fill="${p.mid}" opacity=".5"/>${rect(0, 0.8)}
      ${dots(26, 2.2, p.acc, 5, 0.9)}${dots(14, 1.2, "#ffd23d", 11, 1)}`;
      break;
    case "toxic-fog":
      defs =
        noise(0, "0.012 0.016", 4, "0 0 0 0 0.8  0 0 0 0 0.95  0 0 0 0 0.4  0 0 0 2.6 -0.9") +
        noise(1, "0.03", 3, "0 0 0 0 0.5  0 0 0 0 0.75  0 0 0 0 0.15  0 0 0 2 -0.7");
      body = `<rect width="${W}" height="${H}" fill="${p.base}" opacity=".35"/>${rect(1, 0.6)}${rect(0, 0.85)}`;
      break;
    case "mire":
      defs = noise(0, "0.03 0.04", 4, "0 0 0 0 0.16  0 0 0 0 0.11  0 0 0 0 0.05  0 0 0 2.2 -0.85");
      body = `<rect width="${W}" height="${H}" fill="${p.mid}"/>${rect(0, 0.9)}
      ${[
        [70, 100, 16],
        [150, 70, 12],
        [170, 125, 18],
        [110, 138, 9],
      ]
        .map(
          ([x, y, r]) =>
            `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.45}" fill="#1e1408" opacity=".7"/><ellipse cx="${x - r * 0.2}" cy="${y - r * 0.12}" rx="${r * 0.5}" ry="${r * 0.15}" fill="#c9a870" opacity=".35"/>`,
        )
        .join("")}
      ${[
        [100, 80, 5],
        [140, 110, 4],
        [190, 90, 3],
        [75, 128, 4],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a6a3a" stroke="#c9a870" stroke-width="1"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.3}" fill="#f0dcb0" opacity=".8"/>`,
        )
        .join("")}`;
      break;
    case "foul-water":
      defs = noise(0, "0.02 0.05", 3, "0 0 0 0 0.6  0 0 0 0 0.7  0 0 0 0 0.3  0 0 0 1.6 -0.6");
      body = `<rect width="${W}" height="${H}" fill="${p.base}"/><rect width="${W}" height="${H}" fill="${p.mid}" opacity=".6"/>${rect(0, 0.5)}${ripples("#b8c878", 0.35)}
      ${dots(30, 2.4, p.acc, 3, 0.75)}`;
      break;
    case "tainted-water":
      defs =
        noise(0, "0.015 0.04", 3, "0 0 0 0 0.6  0 0 0 0 0.3  0 0 0 0 0.9  0 0 0 1.5 -0.75") +
        noise(1, "0.01 0.03", 2, "0 0 0 0 0.2  0 0 0 0 0.9  0 0 0 0 0.8  0 0 0 1.2 -0.7");
      body = `<rect width="${W}" height="${H}" fill="${p.base}"/><rect width="${W}" height="${H}" fill="${p.mid}" opacity=".5"/>${rect(0, 0.6)}${rect(1, 0.3)}${ripples("#b09ae0", 0.3)}`;
      break;
    case "spring":
      defs = noise(0, "0.02 0.05", 3, "0 0 0 0 0.85  0 0 0 0 0.97  0 0 0 0 1  0 0 0 1.6 -0.65");
      body = `<rect width="${W}" height="${H}" fill="${p.base}" opacity=".8"/><rect width="${W}" height="${H}" fill="${p.mid}" opacity=".4"/>${rect(0, 0.5)}${ripples("#e8faff", 0.5)}
      ${[
        [80, 70],
        [150, 60],
        [170, 110],
        [110, 120],
        [60, 110],
      ]
        .map(
          ([x = 0, y = 0]) =>
            `<path d="M${x - 5},${y} L${x},${y - 5} L${x + 5},${y} L${x},${y + 5}Z" fill="#fff" opacity=".9"/>`,
        )
        .join("")}`;
      break;
    case "grove":
      defs = noise(0, "0.06", 3, "0 0 0 0 0.45  0 0 0 0 0.8  0 0 0 0 0.3  0 0 0 1.5 -0.55");
      body = `<rect width="${W}" height="${H}" fill="${p.base}"/>${rect(0, 0.8)}
      ${tufts()}${dots(10, 2.4, "#ffe066", 9, 1)}${dots(8, 2.2, "#ff9fc8", 21, 1)}${dots(6, 2, "#fff", 33, 1)}`;
      break;
    case "draining-spire":
      defs = noise(0, "0.03", 3, "0 0 0 0 0.6  0 0 0 0 0.45  0 0 0 0 0.9  0 0 0 1.5 -0.65");
      body = `<rect width="${W}" height="${H}" fill="${p.base}" opacity=".7"/>${rect(0, 0.5)}
      <circle cx="125" cy="95" r="62" fill="none" stroke="${p.acc}" stroke-width="3" opacity=".4"/>
      <circle cx="125" cy="95" r="38" fill="none" stroke="${p.acc}" stroke-width="2" opacity=".3"/>
      <ellipse cx="136" cy="108" rx="26" ry="8" fill="#000" opacity=".4"/>
      <path d="M115,108 L119,52 L125,40 L131,52 L135,108Z" fill="#4a4656" stroke="#24222c" stroke-width="2"/>
      <path d="M125,40 L131,52 L135,108 L127,108Z" fill="#37333f"/>
      <rect x="122" y="62" width="6" height="3" fill="#c9a8ff"/><rect x="122" y="76" width="6" height="3" fill="#c9a8ff"/><rect x="122" y="90" width="6" height="3" fill="#c9a8ff"/>`;
      break;
  }
  return { defs, body };
}
/** @param {string} col @param {number} op */
function ripples(col, op) {
  let s = "";
  for (let j = 0; j < 7; j++) {
    const y = 38 + j * 19;
    s += `<path d="M20,${y} q30,-6 60,0 t60,0 t60,0 t40,0" fill="none" stroke="${col}" stroke-width="1.2" opacity="${op}"/>`;
  }
  return s;
}
function tufts() {
  let s = "",
    x = 7;
  for (let j = 0; j < 34; j++) {
    x = (x * 9301 + 49297) % 233280;
    const a = x / 233280;
    x = (x * 9301 + 49297) % 233280;
    const b = x / 233280;
    const cx = 25 + a * 200,
      cy = 25 + b * 140;
    s += `<path d="M${cx - 4},${cy} L${cx - 2},${cy - 7} L${cx},${cy} L${cx + 2},${cy - 9} L${cx + 4},${cy}Z" fill="${j % 2 ? "#6fcf6a" : "#8fe084"}"/>`;
  }
  return s;
}

let tiles = "",
  defsAll = "";
kinds.forEach((k, i) => {
  const p = P[k];
  const { defs, body } = texture(k, i, p);
  defsAll += clip(i) + defs;
  const x = GAP + (i % COLS) * (W + GAP),
    y = GAP + Math.floor(i / COLS) * (H + GAP + 18);
  const L = p.light;
  const glow = L
    ? `<radialGradient id="g${i}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${L[0]}" stop-opacity="${L[2] * 0.6}"/><stop offset="1" stop-color="${L[0]}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g${i})"/>`
    : "";
  // lip: lighter rim on the NW edge, darker on the SE, to sit the zone in the ground
  tiles += `<g transform="translate(${x},${y})">
  <rect width="${W}" height="${H}" fill="${FLOOR}"/>
  ${glow}
  <g clip-path="url(#c${i})">${body}</g>
  <path d="${poly}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5" transform="translate(1.5,2)"/>
  <path d="${poly}" fill="none" stroke="${p.edge}" stroke-width="2"/>
  <text x="4" y="${H + 13}" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#dfe6f0">${k}${L ? `  (light ${L[0]})` : ""}</text></g>`;
});
const rows = Math.ceil(kinds.length / COLS);
const TW = GAP + COLS * (W + GAP),
  TH = GAP + rows * (H + GAP + 18);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs>${defsAll}</defs><rect width="${TW}" height="${TH}" fill="#141a24"/>${tiles}</svg>`;
const svgPath = join(out, "3052-zones.svg");
writeFileSync(svgPath, svg);
execFileSync("inkscape", [svgPath, "-w", "800", "-o", join(out, "3052-zones.png")]);
