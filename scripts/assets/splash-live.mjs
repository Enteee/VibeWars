// #2880 follow-up: the picked splash (A, two-tone wordmark) over a game that
// plays itself on a random map, newcomers joining from the side as others
// fall. Mockup: a hero frame on the usual 1920x1080 + phone sheet, and a
// four-frame storyboard. Study, not built. Run: node scripts/assets/splash-live.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../docs/art");
const C = {
  bg: "#0e1116",
  floor: "#1a212c",
  grid: "#232c3a",
  wall: "#2c3748",
  wallStroke: "#3b4759",
  friend: "#59c2ff",
  foe: "#ff7b72",
  dead: "#4a5464",
  ink: "#d7dee8",
  dim: "#7d8899",
  line: "#2b3440",
};
const SANS = "DejaVu Sans, sans-serif";
/** @type {(n: number) => string} */
const r1 = (n) => String(Math.round(n * 10) / 10);
/** Tagged template: numbers print rounded to a tenth. @type {(strs: TemplateStringsArray, ...v: (string | number)[]) => string} */
const q = (strs, ...v) =>
  strs.reduce(
    (a, x, i) =>
      a +
      x +
      String(i >= v.length ? "" : typeof v[i] === "number" ? Math.round(v[i] * 10) / 10 : v[i]),
    "",
  );
/** Seeded rng, so the "random map" is the same every run. @type {(seed: number) => () => number} */
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/**
 * One scene in a w x h box: cell grid, a few wall blocks, discs. `phase` 0..3
 * moves the fight on: 0 clash, 1 first hits, 2 two fall (hollow corpses), 3
 * newcomers arrive from the sides with motion streaks.
 * @type {(w: number, h: number, phase: number, seed: number) => string}
 */
function scene(w, h, phase, seed) {
  const rnd = rng(seed),
    u = Math.round(Math.min(w, h) / 12),
    cols = Math.ceil(w / u),
    rows = Math.ceil(h / u);
  /** @type {string[]} */
  const o = [q`<rect width="${w}" height="${h}" fill="${C.floor}"/>`];
  for (let x = 0; x <= cols; x++)
    o.push(
      q`<line x1="${x * u}" y1="0" x2="${x * u}" y2="${h}" stroke="${C.grid}" stroke-width="2"/>`,
    );
  for (let y = 0; y <= rows; y++)
    o.push(
      q`<line x1="0" y1="${y * u}" x2="${w}" y2="${y * u}" stroke="${C.grid}" stroke-width="2"/>`,
    );
  for (let i = 0; i < 7; i++) {
    const bw = (1 + Math.floor(rnd() * 3)) * u,
      bh = (1 + Math.floor(rnd() * 2)) * u;
    const bx = Math.floor(rnd() * (cols - 3)) * u + u,
      by = Math.floor(rnd() * (rows - 3)) * u + u;
    o.push(
      q`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${C.wall}" stroke="${C.wallStroke}" stroke-width="3"/>`,
    );
  }
  const rad = u * 0.62;
  /** @type {(x: number, y: number, team: "f" | "e", dead: boolean) => void} */
  const disc = (x, y, team, dead) => {
    const col = team === "f" ? C.friend : C.foe;
    if (dead) {
      o.push(
        q`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rad)}" fill="none" stroke="${C.dead}" stroke-width="3"/>`,
      );
      return;
    }
    o.push(
      q`<circle cx="${r1(x + rad * 0.3)}" cy="${r1(y + rad * 0.3)}" r="${r1(rad)}" fill="#000" opacity=".35"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rad)}" fill="${col}"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rad * 0.8)}" fill="none" stroke="#fff" stroke-width="${r1(rad * 0.08)}"/>`,
    );
    o.push(
      team === "f"
        ? q`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rad * 0.28)}" fill="none" stroke="#fff" stroke-width="${r1(rad * 0.1)}"/>`
        : q`<polygon fill="#fff" points="${r1(x)},${r1(y - rad * 0.36)} ${r1(x + rad * 0.34)},${r1(y + rad * 0.26)} ${r1(x - rad * 0.34)},${r1(y + rad * 0.26)}"/>`,
    );
  };
  // Eight duels in the bands above and below the wordmark: each pair starts a
  // gap apart and closes as the phase grows; the first three pairs lose one side.
  const n = 8;
  /** @type {{ x: number, y: number, team: "f" | "e", fall: boolean }[]} */
  const ds = [];
  for (let i = 0; i < n; i++) {
    const mx = w * (0.1 + 0.8 * ((i * 0.37 + rnd() * 0.15) % 1)),
      my = i % 2 ? h * (0.1 + 0.18 * rnd()) : h * (0.7 + 0.12 * rnd()),
      gap = rad * (3.4 - 0.7 * phase);
    ds.push({ x: mx - gap / 2, y: my, team: "f", fall: i % 3 === 0 });
    ds.push({ x: mx + gap / 2, y: my + rad * 0.4, team: "e", fall: i % 3 === 1 });
  }
  for (const d of ds) {
    const dead = phase >= 2 && d.fall;
    if (phase >= 1 && !dead) {
      // a hit: a short line toward the middle
      const dx = d.team === "f" ? 1 : -1;
      o.push(
        q`<line x1="${r1(d.x + dx * rad)}" y1="${r1(d.y)}" x2="${r1(d.x + dx * rad * 2)}" y2="${r1(d.y - rad * 0.4)}" stroke="#ffd866" stroke-width="4" stroke-linecap="round"/>`,
      );
    }
    disc(d.x, d.y, d.team, dead);
  }
  if (phase === 3) {
    // joiners: streaks from the side edges
    for (let i = 0; i < 3; i++) {
      for (const team of /** @type {const} */ (["f", "e"])) {
        const y = h * (0.2 + 0.3 * i + 0.08 * rnd()),
          x = team === "f" ? u * (0.9 + i * 0.5) : w - u * (0.9 + i * 0.5);
        const dx = team === "f" ? -1 : 1;
        o.push(
          q`<line x1="${r1(x + dx * u * 1.6)}" y1="${r1(y)}" x2="${r1(x + dx * rad)}" y2="${r1(y)}" stroke="${team === "f" ? C.friend : C.foe}" stroke-width="5" opacity=".5" stroke-linecap="round"/>`,
        );
        disc(x, y, team, false);
      }
    }
  }
  return o.join("");
}

/** The picked wordmark over a scene, with a scrim so it reads on any map. @type {(w: number, h: number, phase: number, seed: number) => string} */
function splash(w, h, phase, seed) {
  const land = w > h,
    size = land ? 270 : Math.floor((w * 0.9) / (8 * 0.7 + 7 * 0.02)),
    cy = land ? h * 0.52 : h * 0.45;
  const tr = size * 0.02,
    cx = w / 2;
  const word = (/** @type {string} */ a, /** @type {string} */ b, /** @type {string} */ extra) =>
    q`<text x="${cx}" y="${r1(cy)}" font-size="${size}" font-weight="bold" font-family="${SANS}" text-anchor="middle" letter-spacing="${r1(tr)}" ${extra}><tspan fill="${a}">Vibe</tspan><tspan fill="${b}">Wars</tspan></text>`;
  const lw = land ? 1100 : w * 0.8,
    ry = cy + size * 0.14,
    rh = size * 0.03;
  const pf = land ? 28 : 15;
  return [
    scene(w, h, phase, seed),
    q`<rect width="${w}" height="${h}" fill="#0a0d12" opacity=".28"/>`,
    q`<rect y="${r1(cy - size * 0.95)}" width="${w}" height="${r1(size * 1.55)}" fill="#0a0d12" opacity=".35"/>`,
    q`<g opacity=".4" transform="translate(${r1(size * 0.04)},${r1(size * 0.04)})">${word("#000", "#000", "")}</g>`,
    word(C.friend, C.foe, ""),
    q`<rect x="${cx - lw / 2}" y="${r1(ry)}" width="${lw / 2}" height="${r1(rh)}" fill="${C.friend}"/><rect x="${cx}" y="${r1(ry)}" width="${lw / 2}" height="${r1(rh)}" fill="${C.foe}"/>`,
    q`<text x="${cx}" y="${r1(h * (land ? 0.88 : 0.86))}" font-size="${pf}" fill="${C.ink}" text-anchor="middle" font-family="${SANS}" letter-spacing="${r1(pf * 0.3)}">PRESS ANY KEY TO BEGIN</text>`,
  ].join("");
}

/** @type {(file: string, svg: string, png: string, colors: number) => void} */
const render = (file, svg, png, colors) => {
  writeFileSync(file, svg);
  execFileSync("inkscape", [file, "-o", q`${file}.png`], { stdio: "ignore" });
  execFileSync("magick", [q`${file}.png`, "-colors", String(colors), "-strip", png]);
};

const tmp = mkdtempSync(join(tmpdir(), "splash-live-"));
try {
  const seed = 7,
    W = 1920 + 60 + 390;
  render(
    join(tmp, "hero.svg"),
    q`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="1080" viewBox="0 0 ${W} 1080"><rect width="${W}" height="1080" fill="#05070a"/>
<svg x="0" width="1920" height="1080" viewBox="0 0 1920 1080">${splash(1920, 1080, 2, seed)}</svg>
<svg x="1980" y="118" width="390" height="844" viewBox="0 0 390 844">${splash(390, 844, 2, seed)}</svg>
<rect x="1978" y="116" width="394" height="848" fill="none" stroke="${C.line}" stroke-width="4"/></svg>`,
    join(out, "2880-splash-live.png"),
    96,
  );
  // storyboard: the same map, four moments, 960x540 each
  const cells = [0, 1, 2, 3].map(
    (p) =>
      q`<svg x="${(p % 2) * 970}" y="${Math.floor(p / 2) * 550}" width="960" height="540" viewBox="0 0 1920 1080">${splash(1920, 1080, p, seed)}</svg>`,
  );
  render(
    join(tmp, "story.svg"),
    q`<svg xmlns="http://www.w3.org/2000/svg" width="1930" height="1090" viewBox="0 0 1930 1090"><rect width="1930" height="1090" fill="#05070a"/>${cells.join("")}</svg>`,
    join(out, "2880-splash-live-storyboard.png"),
    96,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
