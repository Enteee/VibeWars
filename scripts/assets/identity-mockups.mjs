// #2662 mockups: five ways 32 derived bits can mark a player's character.
// Study, not decided. Usage: node scripts/assets/identity-mockups.mjs <outDir>
// Writes <outDir>/2662-option-{a..e}.png (normal, deuteranopia and protanopia strips).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "docs/art";
mkdirSync(outDir, { recursive: true });
const tmp = join(process.env.TMPDIR ?? "/tmp", "identity-2662");
mkdirSync(tmp, { recursive: true });

const R = 14;
const EDGE = "#0b0f14";
const INK = "#d7dee8";
const TEAM = { blue: "#59c2ff", red: "#ff7b72" };
// Accent palette: no blue, no red/salmon; told apart by hue AND lightness.
const ACCENT = [
  "#f2d64b", // yellow
  "#ffffff", // white
  "#b58cff", // violet
  "#3ddc97", // mint
  "#ff9f43", // orange
  "#9aa9bd", // slate
  "#e84fd0", // magenta
  "#7fe3ff", // ice (cyan, light)
];

/** @type {(i: number) => string} */
const accent = (i) => ACCENT[i] ?? INK;
/** @type {(seed: number) => number} 32-bit xorshift, so "the key's bytes" are fixed per player. */
const bytesOf = (seed) => {
  let x = (seed * 2654435761) >>> 0 || 1;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};
/** @type {(word: number) => (n: number) => number} Reads n bits at a time. */
const reader = (word) => {
  let at = 0;
  return (n) => {
    const v = (word >>> at) & ((1 << n) - 1);
    at += n;
    return v;
  };
};
/** @type {(s: string) => string} */
const profGlyph = (p) =>
  readFileSync(`apps/web/public/icons/profession/${p}.svg`, "utf8")
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/fill="#[0-9a-f]{6}"/gi, `fill="${EDGE}"`);
/** @type {(n: number) => string} */
const f2 = (n) => n.toFixed(2);
/** @type {(r: number, a: number) => string} */
const pt = (r, a) => `${f2(r * Math.cos(a))} ${f2(r * Math.sin(a))}`;

/**
 * @typedef {{ prof: string, team: "blue" | "red", word: number, facing: number }} Player
 * @typedef {{ name: string, bits: string, body: (p: Player) => string, dot: (p: Player) => string, under?: (p: Player) => string }} Option
 */

/** The weapon mark, as the game draws it: edge casing under an ink core. */
/** @type {(f: number) => string} */
const weapon = (f) =>
  `<path d="M${pt(R * 0.6, f)} L${pt(R + 9, f)}" stroke="${EDGE}" stroke-width="4" stroke-linecap="round"/><path d="M${pt(R * 0.6, f)} L${pt(R + 9, f)}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
/** The bare body: team disc, edge, profession glyph at 13 px, 0.6 alpha. */
/** @type {(p: Player) => string} */
const bare = (p) =>
  `<circle r="${String(R - 0.75)}" fill="${TEAM[p.team]}" stroke="${EDGE}" stroke-width="1.5"/><g transform="translate(-6.5 -6.5) scale(${f2(13 / 24)})" opacity="0.6">${profGlyph(p.prof)}</g>`;
/** @type {(p: Player, inner?: string) => string} */
const compassBase = (p, inner = "") =>
  `<circle r="4" fill="${TEAM[p.team]}" stroke="${EDGE}" stroke-width="1"/>${inner}`;

/** The ring between the profession glyph and the body edge: the only room inside the circle. */
const BAND_IN = 8.6;
const BAND_OUT = 11.4;
const BAND_MID = (BAND_IN + BAND_OUT) / 2;
/** A body whose glyph sits on a flat team disc, with `ring` marks in the band round it. */
/** @type {(p: Player, ring: string) => string} */
const innerBody = (p, ring) =>
  `<circle r="${String(R - 0.75)}" fill="${TEAM[p.team]}" stroke="${EDGE}" stroke-width="1.5"/>${ring}<g transform="translate(-6.5 -6.5) scale(${f2(13 / 24)})" opacity="0.6">${profGlyph(p.prof)}</g>${weapon(p.facing)}`;

/** @type {Option[]} */
const OPTIONS = [
  {
    name: "A. Pip ring",
    bits: "12 pips on/off + 3 accent = 15 bits",
    body: (p) => {
      const b = reader(p.word);
      const pips = Array.from({ length: 12 }, () => b(1));
      const c = accent(b(3));
      const dots = pips
        .map((on, i) => {
          const a = (i / 12) * Math.PI * 2;
          return on
            ? `<circle cx="${f2((R + 3.4) * Math.cos(a))}" cy="${f2((R + 3.4) * Math.sin(a))}" r="1.5" fill="${c}" stroke="${EDGE}" stroke-width="0.8"/>`
            : "";
        })
        .join("");
      return dots + bare(p) + weapon(p.facing);
    },
    dot: (p) => {
      const b = reader(p.word);
      for (let i = 0; i < 12; i++) b(1);
      return compassBase(
        p,
        `<circle r="5.4" fill="none" stroke="${accent(b(3))}" stroke-width="1.2" stroke-dasharray="1.6 1.4"/>`,
      );
    },
  },
  {
    name: "B. Sigil plate",
    bits: "5x5 mirrored grid (15) + 3 accent = 18 bits",
    body: (p) => bare(p) + weapon(p.facing),
    under: (p) => {
      const b = reader(p.word);
      const cells = Array.from({ length: 15 }, () => b(1));
      const c = accent(b(3));
      const s = 1.9;
      let out = `<rect x="${f2(-2.5 * s - 0.8)}" y="${f2(R + 3 - 0.8)}" width="${f2(5 * s + 1.6)}" height="${f2(5 * s + 1.6)}" fill="${EDGE}" rx="1"/>`;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (!cells[row * 3 + col]) continue;
          for (const cc of col === 2 ? [2] : [col, 4 - col]) {
            out += `<rect x="${f2((cc - 2.5) * s)}" y="${f2(R + 3 + row * s)}" width="${String(s)}" height="${String(s)}" fill="${c}"/>`;
          }
        }
      }
      return out;
    },
    dot: (p) => {
      const b = reader(p.word);
      for (let i = 0; i < 15; i++) b(1);
      return compassBase(p, `<circle r="1.5" fill="${accent(b(3))}"/>`);
    },
  },
  {
    name: "C. Pauldrons and crest",
    bits: "3 shapes x 3 bits + 3 accent = 12 bits",
    body: (p) => {
      const b = reader(p.word);
      const shapes = [b(3), b(3), b(3)];
      const c = accent(b(3));
      const at = [p.facing - Math.PI / 2, p.facing + Math.PI / 2, p.facing + Math.PI];
      const mark = shapes.map((s, i) => shapeAt(s, at[i], c)).join("");
      return mark + bare(p) + weapon(p.facing);
    },
    dot: (p) => {
      const b = reader(p.word);
      b(9);
      return compassBase(p, `<path d="M-4 0 L4 0" stroke="${accent(b(3))}" stroke-width="1.2"/>`);
    },
  },
  {
    name: "D. Ground aura",
    bits: "16 dash segments + 3 accent = 19 bits",
    body: (p) => {
      const b = reader(p.word);
      const segs = Array.from({ length: 16 }, () => b(1));
      const c = accent(b(3));
      const ring = segs
        .map((on, i) => {
          if (!on) return "";
          const a0 = (i / 16) * Math.PI * 2 + 0.05;
          const a1 = ((i + 1) / 16) * Math.PI * 2 - 0.05;
          const rr = R + 4.5;
          const d = `M${pt(rr, a0)} A${String(rr)} ${String(rr)} 0 0 1 ${pt(rr, a1)}`;
          return `<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="3.6" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="butt"/>`;
        })
        .join("");
      return ring + bare(p) + weapon(p.facing);
    },
    dot: (p) => {
      const b = reader(p.word);
      for (let i = 0; i < 16; i++) b(1);
      return compassBase(
        p,
        `<circle r="5.4" fill="none" stroke="${accent(b(3))}" stroke-width="1.2"/>`,
      );
    },
  },
  {
    name: "E. Inlay",
    bits: "plate shape 2 + 3 accent + 8 inner ticks = 13 bits",
    body: (p) => {
      const b = reader(p.word);
      const shape = b(2);
      const c = accent(b(3));
      const ticks = Array.from({ length: 8 }, () => b(1));
      const inner = R - 3.6;
      const tk = ticks
        .map((on, i) => {
          if (!on) return "";
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          return `<circle cx="${f2(inner * Math.cos(a))}" cy="${f2(inner * Math.sin(a))}" r="1.1" fill="${c}" stroke="${EDGE}" stroke-width="0.5"/>`;
        })
        .join("");
      const k = 6.2;
      const plates = [
        `<circle r="${String(k)}"/>`,
        `<rect x="${String(-k + 0.6)}" y="${String(-k + 0.6)}" width="${f2(2 * k - 1.2)}" height="${f2(2 * k - 1.2)}"/>`,
        `<path d="M0 ${String(-k - 0.6)} L${String(k + 0.6)} 0 L0 ${String(k + 0.6)} L${String(-k - 0.6)} 0z"/>`,
        `<path d="M${pt(k + 0.4, -Math.PI / 2)} L${pt(k + 0.4, Math.PI / 6)} L${pt(k + 0.4, (5 * Math.PI) / 6)}z"/>`,
      ];
      return (
        `<circle r="${String(R - 0.75)}" fill="${TEAM[p.team]}" stroke="${EDGE}" stroke-width="1.5"/>` +
        `<g fill="${c}" stroke="${EDGE}" stroke-width="0.8">${plates[shape] ?? ""}</g>` +
        tk +
        `<g transform="translate(-6.5 -6.5) scale(${f2(13 / 24)})" opacity="0.8">${profGlyph(p.prof)}</g>` +
        weapon(p.facing)
      );
    },
    dot: (p) => {
      const b = reader(p.word);
      b(2);
      return compassBase(p, `<circle r="2" fill="${accent(b(3))}"/>`);
    },
  },
  {
    name: "F. Segmented band",
    bits: "8 arcs x 2 bits (off, dark, white, yellow) = 16 bits",
    body: (p) => {
      const b = reader(p.word);
      const states = [null, "#0b0f14", "#ffffff", "#f2d64b"];
      const arcs = Array.from({ length: 8 }, (_, i) => {
        const fill = states[b(2)];
        if (fill === null || fill === undefined) return "";
        const a0 = (i / 8) * Math.PI * 2 + 0.06;
        const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06;
        const d = `M${pt(BAND_IN, a0)} L${pt(BAND_OUT, a0)} A${String(BAND_OUT)} ${String(BAND_OUT)} 0 0 1 ${pt(BAND_OUT, a1)} L${pt(BAND_IN, a1)} A${String(BAND_IN)} ${String(BAND_IN)} 0 0 0 ${pt(BAND_IN, a0)}z`;
        return `<path d="${d}" fill="${fill}" stroke="${EDGE}" stroke-width="0.6"/>`;
      }).join("");
      return innerBody(p, arcs);
    },
    dot: (p) => compassBase(p, `<circle r="1.6" fill="${accent(reader(p.word)(3))}"/>`),
  },
  {
    name: "G. Satellites",
    bits: "3 dots x (4 clock slots + 2 colours) = 18 bits",
    body: (p) => {
      const b = reader(p.word);
      const cols = ["#ffffff", "#f2d64b", "#b58cff", EDGE];
      const dots = [0, 1, 2]
        .map(() => {
          const a = (b(4) / 16) * Math.PI * 2;
          const c = cols[b(2)] ?? INK;
          return `<circle cx="${f2(BAND_MID * Math.cos(a))}" cy="${f2(BAND_MID * Math.sin(a))}" r="2.1" fill="${c}" stroke="${c === EDGE ? INK : EDGE}" stroke-width="0.7"/>`;
        })
        .join("");
      return innerBody(p, dots);
    },
    dot: (p) => compassBase(p, `<circle r="1.6" fill="${accent(reader(p.word)(3))}"/>`),
  },
  {
    name: "H. Hatched rim",
    bits: "angle 3 + spacing 2 + accent 3 = 8 bits",
    body: (p) => {
      const b = reader(p.word);
      const ang = (b(3) / 8) * 180;
      const gap = [2.2, 2.8, 3.4, 4.2][b(2)] ?? 3;
      const c = accent(b(3));
      const n = Math.ceil(30 / gap);
      const lines = Array.from(
        { length: 2 * n + 1 },
        (_, i) => `<path d="M${f2((i - n) * gap)} -20 V20" stroke="${c}" stroke-width="1.1"/>`,
      ).join("");
      const clip = `<clipPath id="rim${String(p.word)}"><path clip-rule="evenodd" d="M${String(-BAND_OUT)} 0 a${String(BAND_OUT)} ${String(BAND_OUT)} 0 1 0 ${String(2 * BAND_OUT)} 0 a${String(BAND_OUT)} ${String(BAND_OUT)} 0 1 0 ${String(-2 * BAND_OUT)} 0z M${String(-BAND_IN)} 0 a${String(BAND_IN)} ${String(BAND_IN)} 0 1 0 ${String(2 * BAND_IN)} 0 a${String(BAND_IN)} ${String(BAND_IN)} 0 1 0 ${String(-2 * BAND_IN)} 0z"/></clipPath>`;
      return innerBody(
        p,
        `${clip}<g clip-path="url(#rim${String(p.word)})"><g transform="rotate(${f2(ang)})">${lines}</g></g>`,
      );
    },
    dot: (p) => compassBase(p, `<circle r="1.6" fill="${accent(reader(p.word)(8) & 7)}"/>`),
  },
];

/** A pauldron or crest shape at angle a, 3 bits: none, dot, spike, square, bar, diamond, ring, twin. */
/** @type {(s: number, a: number, c: string) => string} */
function shapeAt(s, a, c) {
  const x = (R + 1.5) * Math.cos(a);
  const y = (R + 1.5) * Math.sin(a);
  const deg = (a * 180) / Math.PI;
  /** @type {(inner: string) => string} */
  const g = (inner) =>
    `<g transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(deg)})" fill="${c}" stroke="${EDGE}" stroke-width="1.1" stroke-linejoin="round">${inner}</g>`;
  switch (s) {
    case 1:
      return g(`<circle r="2.6"/>`);
    case 2:
      return g(`<path d="M-1 -2.6 L4 0 L-1 2.6z"/>`);
    case 3:
      return g(`<rect x="-2.2" y="-2.2" width="4.4" height="4.4"/>`);
    case 4:
      return g(`<rect x="-1.2" y="-4" width="2.4" height="8"/>`);
    case 5:
      return g(`<path d="M0 -3.2 L3.2 0 L0 3.2 L-3.2 0z"/>`);
    case 6:
      return g(
        `<circle r="2.8" fill="none" stroke-width="0"/><circle r="2.6" fill="none" stroke="${EDGE}" stroke-width="3.4"/><circle r="2.6" fill="none" stroke="${c}" stroke-width="1.6"/>`,
      );
    case 7:
      return g(`<circle cx="0" cy="-2.4" r="1.7"/><circle cx="0" cy="2.4" r="1.7"/>`);
    default:
      return "";
  }
}

// Eight players: four per team; the same profession pair twice on blue and on red.
/** @type {Player[]} */
const PLAYERS = [
  ["warrior", "blue", 0.2],
  ["warrior", "blue", -0.4],
  ["monk", "blue", 0.9],
  ["ranger", "blue", -0.9],
  ["warrior", "red", Math.PI - 0.3],
  ["warrior", "red", Math.PI + 0.5],
  ["necromancer", "red", Math.PI - 1],
  ["monk", "red", Math.PI + 1],
].map(([prof, team, facing], i) => ({
  prof: String(prof),
  team: /** @type {"blue" | "red"} */ (team),
  facing: Number(facing),
  word: bytesOf(i + 7),
}));
/** The hard case, spelled out for the notes: players 0 and 1 are both warriors on blue. */
const SOLO = {
  prof: "ranger",
  team: /** @type {const} */ ("blue"),
  facing: 2.4,
  word: bytesOf(41),
};
const SOLO_RED = {
  prof: "monk",
  team: /** @type {const} */ ("red"),
  facing: 0.7,
  word: bytesOf(43),
};

/** @type {(inner: string, w: number, h: number, bg?: string) => string} */
const svg = (inner, w, h, bg = "#0e1116") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" font-family="DejaVu Sans, sans-serif"><rect width="${String(w)}" height="${String(h)}" fill="${bg}"/>${inner}</svg>`;
/** @type {(x: number, y: number, s: number, inner: string) => string} */
const at = (x, y, s, inner) =>
  `<g transform="translate(${String(x)} ${String(y)}) scale(${String(s)})">${inner}</g>`;
/** @type {(x: number, y: number, t: string, size?: number, fill?: string) => string} */
const text = (x, y, t, size = 14, fill = INK) =>
  `<text x="${String(x)}" y="${String(y)}" font-size="${String(size)}" fill="${fill}">${t}</text>`;
/** @type {(x: number, y: number, w: number, h: number) => string} */
const floor = (x, y, w, h) => {
  let g = `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}" fill="#0e1116" stroke="#2b3440"/>`;
  for (let gx = x; gx <= x + w; gx += 40)
    g += `<path d="M${String(gx)} ${String(y)}V${String(y + h)}" stroke="#1a212c"/>`;
  for (let gy = y; gy <= y + h; gy += 40)
    g += `<path d="M${String(x)} ${String(gy)}H${String(x + w)}" stroke="#1a212c"/>`;
  return g;
};
/** @type {(args: string[]) => void} */
const magick = (args) => {
  execFileSync("magick", args, { stdio: "inherit" });
};
/** @type {(svgPath: string, pngPath: string) => void} */
const raster = (svgPath, pngPath) => {
  execFileSync("inkscape", [svgPath, "-o", pngPath], { stdio: "ignore" });
};

// Machado 2009, severity 1.0.
const DEUT = "0.367322 0.860646 -0.227968 0.280085 0.672501 0.047413 -0.011820 0.042940 0.968881";
const PROT = "0.152286 1.052583 -0.204868 0.114503 0.786281 0.099216 -0.003882 -0.048116 1.051998";
/** @type {(m: string) => string} */
const matrix = (m) => m;

const letters = "abcdefgh";
const notes = [];
OPTIONS.forEach((o, oi) => {
  const id = letters.charAt(oi);
  const W = 1260;
  const withUnder = (/** @type {Player} */ p) => o.body(p) + (o.under?.(p) ?? "");
  let body = text(20, 28, `${o.name}  —  ${o.bits}`, 18);
  // Arena body at 5x, both teams, then the same at 1:1 (normal zoom).
  body += text(20, 56, "arena body 4.2x (self-blue, foe-red)", 11, "#7d8899");
  body += floor(20, 64, 300, 205);
  body += at(85, 140, 4.2, withUnder(SOLO));
  body += at(255, 140, 4.2, withUnder(SOLO_RED));
  body += text(340, 56, "1:1 normal zoom", 11, "#7d8899");
  body += floor(340, 64, 120, 80);
  body += at(380, 104, 1, withUnder(SOLO));
  body += at(430, 104, 1, withUnder(SOLO_RED));
  body += text(340, 166, "compass dot 5x", 11, "#7d8899");
  body += floor(340, 172, 120, 62);
  body += at(375, 203, 5, o.dot(SOLO));
  body += at(430, 203, 5, o.dot(SOLO_RED));
  // Character card figure at Team Builder size (3x), as the card draws it: panel, body, name.
  body += text(490, 56, "card figure 3.5x", 11, "#7d8899");
  body += `<rect x="490" y="64" width="230" height="205" rx="6" fill="#161b22" stroke="#2b3440"/>`;
  body += at(555, 140, 3.5, withUnder({ ...SOLO, facing: 0.5 }));
  body += at(
    655,
    140,
    3.5,
    withUnder({ ...SOLO, prof: "warrior", word: bytesOf(77), team: "blue", facing: 0.5 }),
  );
  // 8 players at 1:1 then 3x
  body += text(
    740,
    56,
    "8 players, 4 per team (blue: two warriors; red: two warriors)",
    11,
    "#7d8899",
  );
  body += floor(740, 64, 420, 205);
  PLAYERS.forEach((p, i) => {
    const x = 740 + 52 + (i % 4) * 100;
    const y = 64 + 44 + Math.floor(i / 4) * 100;
    body += at(x, y, 2.4, withUnder(p));
  });
  const full = svg(body, W, 285);
  const sPath = join(tmp, `2662-option-${id}-main.svg`);
  writeFileSync(sPath, full);
  raster(sPath, join(tmp, `${id}-main.png`));
  // Strip of the 8 players alone at 1:1 and 2.4x, through both colour-blind sims.
  const crop = ["-crop", "420x205+740+64", "+repage"];
  magick([join(tmp, `${id}-main.png`), ...crop, join(tmp, `${id}-n.png`)]);
  magick([join(tmp, `${id}-n.png`), "-color-matrix", matrix(DEUT), join(tmp, `${id}-d.png`)]);
  magick([join(tmp, `${id}-n.png`), "-color-matrix", matrix(PROT), join(tmp, `${id}-p.png`)]);
  magick([
    join(tmp, `${id}-n.png`),
    join(tmp, `${id}-d.png`),
    join(tmp, `${id}-p.png`),
    "+append",
    join(tmp, `${id}-cvd.png`),
  ]);
  magick([
    join(tmp, `${id}-main.png`),
    "(",
    join(tmp, `${id}-cvd.png`),
    "-background",
    "#0e1116",
    "-gravity",
    "west",
    "-extent",
    `${String(W)}x205`,
    ")",
    "-append",
    "-strip",
    "-colors",
    "128",
    join(outDir, `2662-option-${id}.png`),
  ]);
  notes.push(o.name);
});
console.log(`wrote ${String(notes.length)} options to ${outDir}`);
