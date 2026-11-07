// #2662 round 4: a signet beside the player name, shown when targeted, in the
// party window, or while SHIFT is held. Study, not decided.
// Usage: node scripts/assets/identity-signets.mjs <outDir>
// Writes <outDir>/2662-signet-{a,b,c}.png.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "docs/art";
mkdirSync(outDir, { recursive: true });
const tmp = join(process.env.TMPDIR ?? "/tmp", "signets-2662");
mkdirSync(tmp, { recursive: true });

const EDGE = "#0b0f14";
const INK = "#d7dee8";
const DIM = "#7d8899";
const TEAM = { blue: "#59c2ff", red: "#ff7b72" };
const R = 14;
// Dark and light tinctures: a signet is always dark ground, light charge, so it
// reads by lightness alone (heraldry's rule of tincture).
const DARK = ["#1b2a4a", "#5a1f2e", "#1f4a38", "#4a3a6a"];
const LIGHT = ["#f2d64b", "#ffffff", "#7fe3ff", "#ff9f43"];

/** @type {(seed: number) => number} */
const bytesOf = (seed) => {
  let x = (seed * 2654435761) >>> 0 || 1;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};
/** @type {(word: number) => (n: number) => number} */
const reader = (word) => {
  let at = 0;
  return (n) => {
    const v = (word >>> at) & ((1 << n) - 1);
    at += n;
    return v;
  };
};
/** @type {(n: number) => string} */
const f2 = (n) => n.toFixed(2);
/** @type {(r: number, a: number) => string} */
const pt = (r, a) => `${f2(r * Math.cos(a))} ${f2(r * Math.sin(a))}`;
/** @type {(list: string[], i: number) => string} */
const pick = (list, i) => list[i] ?? INK;

/** A signet in a 24 x 24 box centred on 0,0. @typedef {{ name: string, bits: string, draw: (word: number) => string }} Signet */
/** @type {Signet[]} */
const SIGNETS = [
  {
    name: "A. Seal block",
    bits: "mirrored 5x5 (15) + ground 2 + ink 2 = 19 bits",
    draw: (word) => {
      const b = reader(word);
      const cells = Array.from({ length: 15 }, () => b(1));
      const ground = pick(DARK, b(2));
      const ink = pick(LIGHT, b(2));
      let out = `<rect x="-11.5" y="-11.5" width="23" height="23" rx="3" fill="${ground}" stroke="${ink}" stroke-width="1.2"/>`;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (!cells[row * 3 + col]) continue;
          for (const cc of col === 2 ? [2] : [col, 4 - col]) {
            out += `<rect x="${f2((cc - 2.5) * 3.6)}" y="${f2((row - 2.5) * 3.6)}" width="3.6" height="3.6" fill="${ink}"/>`;
          }
        }
      }
      return out;
    },
  },
  {
    name: "B. Rosette",
    bits: "sides 3 + turn 3 + hollow 1 + hub 1 + notches 2 + ground 2 + ink 2 = 14 bits",
    draw: (word) => {
      const b = reader(word);
      const sides = 3 + b(3);
      const turn = (b(3) / 8) * ((Math.PI * 2) / sides);
      const hollow = b(1) === 1;
      const hub = b(1) === 1;
      const notches = [0, 4, 8, 12][b(2)] ?? 0;
      const ground = pick(DARK, b(2));
      const ink = pick(LIGHT, b(2));
      const poly = Array.from({ length: sides }, (_, i) =>
        pt(8, turn - Math.PI / 2 + (i / sides) * Math.PI * 2),
      ).join(" L");
      let out = `<circle r="11.4" fill="${ground}" stroke="${ink}" stroke-width="1.2"/>`;
      for (let i = 0; i < notches; i++) {
        const a = (i / notches) * Math.PI * 2;
        out += `<path d="M${pt(9.6, a)} L${pt(11.4, a)}" stroke="${ink}" stroke-width="1.4"/>`;
      }
      out += `<path d="M${poly}z" fill="${hollow ? "none" : ink}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
      if (hub) out += `<circle r="2.2" fill="${hollow ? ink : ground}"/>`;
      return out;
    },
  },
  {
    name: "C. Shield",
    bits: "shape 2 + division 3 + ground 2 + ink 2 + charge 3 + charge colour 1 = 13 bits",
    draw: (word) => {
      const b = reader(word);
      const shape = b(2);
      const division = b(3);
      const ground = pick(DARK, b(2));
      const ink = pick(LIGHT, b(2));
      const charge = b(3);
      const chargeColour = b(1) === 1 ? "#ffffff" : "#f2d64b";
      const outline =
        [
          "M-10 -11 H10 V3 Q10 9 0 12 Q-10 9 -10 3z",
          "M-10 -11 H10 V0 L0 12 L-10 0z",
          "M-10 -9 Q0 -13 10 -9 V4 Q10 9 0 12 Q-10 9 -10 4z",
          "M-10 -11 H10 V6 L0 12 L-10 6z",
        ][shape] ?? "";
      const id = `sh${String(word)}`;
      const div =
        [
          "",
          `<rect x="0" y="-12" width="12" height="26" fill="${ink}"/>`,
          `<rect x="-12" y="-1" width="24" height="14" fill="${ink}"/>`,
          `<path d="M-12 -12 L12 -12 L12 -4 L-12 8z" fill="${ink}"/>`,
          `<path d="M-12 -12 L0 -2 L12 -12 V-5 L0 5 L-12 -5z" fill="${ink}"/>`,
          `<path d="M-2.2 -12 H2.2 V-2.2 H12 V2.2 H2.2 V14 H-2.2 V2.2 H-12 V-2.2 H-2.2z" fill="${ink}"/>`,
          `<path d="M-12 -9 L-9 -12 L12 9 L9 12z M12 -9 L9 -12 L-12 9 L-9 12z" fill="${ink}"/>`,
          `<rect x="-12" y="-12" width="12" height="12" fill="${ink}"/><rect x="0" y="0" width="12" height="14" fill="${ink}"/>`,
        ][division] ?? "";
      const mark =
        [
          "",
          `<circle cy="-1" r="2.6" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8"/>`,
          `<path d="M0 -6 L1.8 -1.6 L6 -1.4 L2.6 1.4 L3.8 6 L0 3.4 L-3.8 6 L-2.6 1.4 L-6 -1.4 L-1.8 -1.6z" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8" stroke-linejoin="round"/>`,
          `<circle cy="-1" r="3.6" fill="none" stroke="${EDGE}" stroke-width="3"/><circle cy="-1" r="3.6" fill="none" stroke="${chargeColour}" stroke-width="1.6"/>`,
          `<rect x="-5" y="-2.2" width="10" height="3.6" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8"/>`,
          `<path d="M0 -6 L5 3 L-5 3z" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8" stroke-linejoin="round"/>`,
          `<path d="M0 -6 L4.4 -1 L0 4 L-4.4 -1z" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8" stroke-linejoin="round"/>`,
          `<path d="M3.4 -5 A6 6 0 1 0 3.4 4 A4.4 4.4 0 1 1 3.4 -5z" fill="${chargeColour}" stroke="${EDGE}" stroke-width="0.8"/>`,
        ][charge] ?? "";
      return `<clipPath id="${id}"><path d="${outline}"/></clipPath><path d="${outline}" fill="${ground}"/><g clip-path="url(#${id})">${div}</g><path d="${outline}" fill="none" stroke="${EDGE}" stroke-width="2.4"/><path d="${outline}" fill="none" stroke="${ink}" stroke-width="1"/>${mark}`;
    },
  },
];

const NAMES = [
  ["Ente [VIBE]", 11],
  ["Brynn", 12],
  ["AshenWolf", 13],
  ["Cael", 14],
  ["Dova", 15],
  ["Holt", 16],
  ["Fenn", 17],
  ["Gwyn", 18],
];
/** @type {(x: number, y: number, s: number, inner: string) => string} */
const at = (x, y, s, inner) =>
  `<g transform="translate(${String(x)} ${String(y)}) scale(${String(s)})">${inner}</g>`;
/** @type {(x: number, y: number, t: string, size?: number, fill?: string, extra?: string) => string} */
const text = (x, y, t, size = 11, fill = INK, extra = "") =>
  `<text x="${String(x)}" y="${String(y)}" font-size="${String(size)}" fill="${fill}" font-family="DejaVu Sans Mono, monospace"${extra}>${t}</text>`;
/** @type {(x: number, y: number, ww: number, h: number) => string} */
const floor = (x, y, ww, h) => {
  let g = `<rect x="${String(x)}" y="${String(y)}" width="${String(ww)}" height="${String(h)}" fill="#0e1116" stroke="#2b3440"/>`;
  for (let gx = x; gx <= x + ww; gx += 40)
    g += `<path d="M${String(gx)} ${String(y)}V${String(y + h)}" stroke="#1a212c"/>`;
  for (let gy = y; gy <= y + h; gy += 40)
    g += `<path d="M${String(x)} ${String(gy)}H${String(x + ww)}" stroke="#1a212c"/>`;
  return g;
};
/** The name plate as the arena draws it: [signet] name over a bar over the body (world units). */
/** @type {(signet: Signet, key: number, name: string, team: "blue" | "red", targeted: boolean, withSignet: boolean) => string} */
const plate = (signet, key, name, team, targeted, withSignet) => {
  const textW = name.length * 6.6;
  const sig = withSignet ? 11 : 0;
  const total = textW + (withSignet ? sig + 3 : 0);
  const x0 = -total / 2;
  const top = -R - 12;
  let out = `<circle r="${String(R - 0.75)}" fill="${TEAM[team]}" stroke="${EDGE}" stroke-width="1.5"/>`;
  if (targeted)
    out += `<circle r="${String(R + 5)}" fill="none" stroke="#ffd866" stroke-width="2"/>`;
  out += `<rect x="-17" y="${String(top)}" width="34" height="4" fill="#202836" stroke="${EDGE}" stroke-width="0.6"/><rect x="-17" y="${String(top)}" width="${String(26)}" height="4" fill="#3fb950"/>`;
  if (withSignet) out += at(x0 + sig / 2, top - 9, sig / 24, signet.draw(key));
  out += text(
    x0 + (withSignet ? sig + 3 : 0),
    top - 5,
    name.replace("[", "&#91;"),
    11,
    INK,
    ` stroke="${EDGE}" stroke-width="2.4" paint-order="stroke"`,
  );
  return out;
};

/** @type {(args: string[]) => void} */
const magick = (args) => execFileSync("magick", args, { stdio: "inherit" });
const DEUT = "0.367322 0.860646 -0.227968 0.280085 0.672501 0.047413 -0.011820 0.042940 0.968881";
const PROT = "0.152286 1.052583 -0.204868 0.114503 0.786281 0.099216 -0.003882 -0.048116 1.051998";

SIGNETS.forEach((signet, si) => {
  const id = "abc".charAt(si);
  const W = 1180;
  let s = text(20, 26, `${signet.name}  —  ${signet.bits}`, 16);
  // 1. Targeted: one body, plate with signet, at 3x, and 1:1 beside it.
  s += text(20, 52, "targeted (2.2x, then 1:1)", 11, DIM);
  s += floor(20, 58, 250, 190);
  s += at(125, 170, 2.2, plate(signet, bytesOf(7), "Ente [VIBE]", "red", true, true));
  s += at(215, 215, 1, plate(signet, bytesOf(7), "Ente [VIBE]", "red", true, true));
  // 2. Team overview: party dock rows.
  s += text(290, 52, "team overview (party window)", 11, DIM);
  s += `<rect x="290" y="58" width="250" height="190" rx="4" fill="#161b22" stroke="#2b3440"/>`;
  NAMES.slice(0, 5).forEach(([n], i) => {
    const y = 72 + i * 34;
    if (i === 2)
      s += `<rect x="296" y="${String(y - 6)}" width="238" height="32" fill="none" stroke="#ffd866"/>`;
    s += at(316, y + 8, 16 / 24, signet.draw(bytesOf(7 + i)));
    s += text(332, y + 12, String(n).replace("[", "&#91;"), 12);
    s += `<rect x="332" y="${String(y + 17)}" width="190" height="5" fill="#202836"/><rect x="332" y="${String(y + 17)}" width="${String(190 - i * 24)}" height="5" fill="#3fb950"/>`;
  });
  // 3. SHIFT held: a clump with every plate and its signet, at 1.6x.
  s += text(560, 52, "SHIFT held: every name shows its signet (1.6x)", 11, DIM);
  s += floor(560, 58, 600, 190);
  const spots = [
    [110, 175, "blue", 0],
    [250, 200, "blue", 1],
    [360, 165, "blue", 2],
    [470, 195, "red", 3],
    [150, 120, "red", 4],
    [540, 140, "red", 5],
  ];
  spots.forEach(([x, y, team, k]) => {
    const nm = NAMES[Number(k)] ?? ["?", 0];
    s += at(
      560 + Number(x),
      Number(y),
      1.6,
      plate(
        signet,
        bytesOf(7 + Number(k)),
        String(nm[0]),
        team === "red" ? "red" : "blue",
        false,
        true,
      ),
    );
  });
  // 4. Sizes and colour-blind: eight different keys at 12 and 24 px.
  s += text(
    20,
    276,
    "eight keys at 12 px, 24 px, then deuteranopia and protanopia (same row)",
    11,
    DIM,
  );
  const stripSvg = (() => {
    let g = "";
    for (let i = 0; i < 8; i++) {
      g += at(26 + i * 44, 22, 24 / 24, signet.draw(bytesOf(30 + i)));
      g += at(26 + i * 44, 52, 12 / 24, signet.draw(bytesOf(30 + i)));
    }
    return g;
  })();
  const strip = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="70"><rect width="380" height="70" fill="#161b22"/>${stripSvg}</svg>`;
  writeFileSync(join(tmp, `${id}-strip.svg`), strip);
  execFileSync("inkscape", [join(tmp, `${id}-strip.svg`), "-o", join(tmp, `${id}-strip.png`)], {
    stdio: "ignore",
  });
  magick([join(tmp, `${id}-strip.png`), "-color-matrix", DEUT, join(tmp, `${id}-sd.png`)]);
  magick([join(tmp, `${id}-strip.png`), "-color-matrix", PROT, join(tmp, `${id}-sp.png`)]);
  magick([
    join(tmp, `${id}-strip.png`),
    join(tmp, `${id}-sd.png`),
    join(tmp, `${id}-sp.png`),
    "+append",
    join(tmp, `${id}-strips.png`),
  ]);

  const main = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="280"><rect width="${String(W)}" height="280" fill="#0e1116"/>${s}</svg>`;
  writeFileSync(join(tmp, `${id}-main.svg`), main);
  execFileSync("inkscape", [join(tmp, `${id}-main.svg`), "-o", join(tmp, `${id}-main.png`)], {
    stdio: "ignore",
  });
  magick([
    join(tmp, `${id}-main.png`),
    "(",
    join(tmp, `${id}-strips.png`),
    "-background",
    "#0e1116",
    "-gravity",
    "west",
    "-extent",
    `${String(W)}x70`,
    ")",
    "-append",
    "-strip",
    "-colors",
    "128",
    join(outDir, `2662-signet-${id}.png`),
  ]);
});
console.log("wrote 3 signet sheets");
