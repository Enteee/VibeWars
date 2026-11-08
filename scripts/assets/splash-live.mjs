// #2880: the picked splash (A, two-tone wordmark) as a sequence. A big battle
// of small characters plays alone for ~10 s, then music starts; "Vibe" flies in
// from the left and "Wars" from the right, they meet, the screen flashes and
// the music turns into the VibeWars theme; then "press any key" appears.
// Mockup: the final frame on the usual 1920x1080 + phone sheet, and a
// six-frame storyboard. Study, not built. Run: node scripts/assets/splash-live.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../docs/art");
const C = {
  floor: "#1a212c",
  grid: "#232c3a",
  wall: "#2c3748",
  wallStroke: "#3b4759",
  friend: "#59c2ff",
  foe: "#ff7b72",
  dead: "#4a5464",
  ink: "#d7dee8",
  line: "#2b3440",
};
const SANS = "DejaVu Sans, sans-serif";
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
 * The arena: grid, wall blocks and a crowd of small fighters in duels. `fall`
 * is the share of fighters already down (hollow `dead` rings); `join` draws
 * newcomers streaking in from the side edges.
 * @type {(w: number, h: number, seed: number, fall: number, join: boolean) => string}
 */
function arena(w, h, seed, fall, join) {
  const rnd = rng(seed),
    u = Math.round(Math.min(w, h) / 16),
    rad = u * 0.3;
  /** @type {string[]} */
  const o = [q`<rect width="${w}" height="${h}" fill="${C.floor}"/>`];
  for (let x = 0; x <= w; x += u)
    o.push(q`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${C.grid}" stroke-width="2"/>`);
  for (let y = 0; y <= h; y += u)
    o.push(q`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${C.grid}" stroke-width="2"/>`);
  for (let i = 0; i < 9; i++) {
    const bw = (1 + Math.floor(rnd() * 3)) * u * 1.5,
      bh = (1 + Math.floor(rnd() * 2)) * u * 1.5;
    o.push(
      q`<rect x="${Math.floor((rnd() * (w - bw)) / u) * u}" y="${Math.floor((rnd() * (h - bh)) / u) * u}" width="${bw}" height="${bh}" fill="${C.wall}" stroke="${C.wallStroke}" stroke-width="3"/>`,
    );
  }
  /** @type {(x: number, y: number, team: "f" | "e", dead: boolean) => void} */
  const disc = (x, y, team, dead) => {
    if (dead)
      return void o.push(
        q`<circle cx="${x}" cy="${y}" r="${rad}" fill="none" stroke="${C.dead}" stroke-width="2.5"/>`,
      );
    const col = team === "f" ? C.friend : C.foe;
    o.push(
      q`<circle cx="${x + rad * 0.3}" cy="${y + rad * 0.3}" r="${rad}" fill="#000" opacity=".35"/><circle cx="${x}" cy="${y}" r="${rad}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${rad * 0.78}" fill="none" stroke="#fff" stroke-width="${rad * 0.1}"/>`,
    );
    o.push(
      team === "f"
        ? q`<circle cx="${x}" cy="${y}" r="${rad * 0.26}" fill="none" stroke="#fff" stroke-width="${rad * 0.12}"/>`
        : q`<polygon fill="#fff" points="${x},${y - rad * 0.36} ${x + rad * 0.34},${y + rad * 0.26} ${x - rad * 0.34},${y + rad * 0.26}"/>`,
    );
  };
  const pairs = Math.round((w * h) / (u * u * 5));
  for (let i = 0; i < pairs; i++) {
    const mx = rad * 3 + rnd() * (w - rad * 6),
      my = rad * 3 + rnd() * (h - rad * 6),
      gap = rad * (2.1 + rnd() * 1.4),
      a = rnd() * Math.PI;
    const dx = (Math.cos(a) * gap) / 2,
      dy = (Math.sin(a) * gap) / 2;
    const fd = rnd() < fall / 2,
      ed = !fd && rnd() < fall / 2;
    for (const [s, dead] of /** @type {const} */ ([
      [1, fd],
      [-1, ed],
    ])) {
      if (!dead)
        o.push(
          q`<line x1="${mx + s * dx}" y1="${my + s * dy}" x2="${mx - s * dx * 0.2}" y2="${my - s * dy * 0.2}" stroke="#ffd866" stroke-width="3" stroke-linecap="round"/>`,
        );
      disc(mx + s * dx, my + s * dy, s > 0 ? "f" : "e", dead);
    }
  }
  if (join) {
    for (let i = 0; i < 7; i++) {
      for (const team of /** @type {const} */ (["f", "e"])) {
        const y = h * (0.08 + 0.84 * rnd()),
          x = team === "f" ? u * (0.4 + rnd() * 1.4) : w - u * (0.4 + rnd() * 1.4),
          d = team === "f" ? -1 : 1;
        o.push(
          q`<line x1="${x + d * u * 2.2}" y1="${y}" x2="${x + d * rad}" y2="${y}" stroke="${team === "f" ? C.friend : C.foe}" stroke-width="4" opacity=".5" stroke-linecap="round"/>`,
        );
        disc(x, y, team, false);
      }
    }
  }
  return o.join("");
}

/**
 * One frame. stage: 0 battle, 1 battle with fallen and joiners, 2 Vibe and
 * Wars flying in, 3 the meeting flash, 4 the settled wordmark, 5 plus prompt.
 * @type {(w: number, h: number, stage: number) => string}
 */
function frame(w, h, stage) {
  const land = w > h,
    size = land ? 270 : Math.floor((w * 0.9) / (8 * 0.7 + 7 * 0.02)),
    cy = land ? h * 0.52 : h * 0.45;
  const cx = w / 2,
    tr = size * 0.02,
    pf = land ? 28 : 15;
  /** @type {(s: string, x: number, fill: string, extra?: string) => string} */
  const word = (s, x, fill, extra = "") =>
    q`<text x="${x}" y="${cy}" font-size="${size}" font-weight="bold" font-family="${SANS}" text-anchor="${s === "Vibe" ? "end" : "start"}" letter-spacing="${tr}" fill="${fill}" ${extra}>${s}</text>`;
  /** Both halves, shadowed, `off` px apart from their meeting place. @type {(off: number) => string} */
  const both = (off) =>
    [
      word(
        "Vibe",
        cx - off,
        "#000",
        q`opacity=".4" transform="translate(${size * 0.04} ${size * 0.04})"`,
      ),
      word(
        "Wars",
        cx + off,
        "#000",
        q`opacity=".4" transform="translate(${size * 0.04} ${size * 0.04})"`,
      ),
      word("Vibe", cx - off, C.friend),
      word("Wars", cx + off, C.foe),
    ].join("");
  const o = [arena(w, h, 7, stage === 0 ? 0 : 0.5, stage === 1)];
  if (stage >= 2)
    o.push(
      q`<rect width="${w}" height="${h}" fill="#0a0d12" opacity=".3"/>`,
      q`<rect y="${cy - size * 0.95}" width="${w}" height="${size * 1.55}" fill="#0a0d12" opacity=".4"/>`,
    );
  if (stage === 2) {
    const off = w * 0.32;
    for (const [s, col] of /** @type {const} */ ([
      [-1, C.friend],
      [1, C.foe],
    ])) {
      for (let i = 0; i < 4; i++)
        o.push(
          q`<rect x="${s < 0 ? cx - off - size * 2.2 - size * 1.4 : cx + off + size * 2.4}" y="${cy - size * 0.62 + i * size * 0.17}" width="${size * 1.4}" height="${size * 0.04}" fill="${col}" opacity=".45"/>`,
        );
    }
    o.push(both(off));
  }
  if (stage >= 3) o.push(both(0));
  if (stage === 3)
    o.push(
      q`<rect width="${w}" height="${h}" fill="#fff" opacity=".8"/>`,
      word("Vibe", cx, C.friend),
      word("Wars", cx, C.foe),
    );
  if (stage >= 4) {
    const lw = land ? 1100 : w * 0.8,
      ry = cy + size * 0.14,
      rh = size * 0.03;
    o.push(
      q`<rect x="${cx - lw / 2}" y="${ry}" width="${lw / 2}" height="${rh}" fill="${C.friend}"/><rect x="${cx}" y="${ry}" width="${lw / 2}" height="${rh}" fill="${C.foe}"/>`,
    );
  }
  if (stage >= 5)
    o.push(
      q`<text x="${cx}" y="${h * (land ? 0.88 : 0.86)}" font-size="${pf}" fill="${C.ink}" text-anchor="middle" font-family="${SANS}" letter-spacing="${pf * 0.3}">PRESS ANY KEY TO BEGIN</text>`,
    );
  return o.join("");
}

/** @type {(file: string, svg: string, png: string) => void} */
const render = (file, svg, png) => {
  writeFileSync(file, svg);
  execFileSync("inkscape", [file, "-o", `${file}.png`], { stdio: "ignore" });
  execFileSync("magick", [`${file}.png`, "-colors", "96", "-strip", png]);
};

const tmp = mkdtempSync(join(tmpdir(), "splash-live-"));
try {
  const W = 1920 + 60 + 390;
  render(
    join(tmp, "hero.svg"),
    q`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="1080" viewBox="0 0 ${W} 1080"><rect width="${W}" height="1080" fill="#05070a"/>
<svg x="0" width="1920" height="1080" viewBox="0 0 1920 1080">${frame(1920, 1080, 5)}</svg>
<svg x="1980" y="118" width="390" height="844" viewBox="0 0 390 844">${frame(390, 844, 5)}</svg>
<rect x="1978" y="116" width="394" height="848" fill="none" stroke="${C.line}" stroke-width="4"/></svg>`,
    join(out, "2880-splash-live.png"),
  );
  const caps = [
    "0 s  The battle plays alone",
    "6 s  Others fall, new ones join",
    "10 s  Music starts; Vibe and Wars fly in",
    "12 s  They meet: flash, the VibeWars theme",
    "12.5 s  The wordmark settles",
    "13 s  Press any key appears",
  ];
  const stages = [0, 1, 2, 3, 4, 5];
  const cells = stages.map(
    (s) =>
      q`<svg x="${(s % 2) * 970}" y="${Math.floor(s / 2) * 600}" width="960" height="540" viewBox="0 0 1920 1080">${frame(1920, 1080, s)}</svg><text x="${(s % 2) * 970 + 8}" y="${Math.floor(s / 2) * 600 + 575}" font-size="30" fill="${C.ink}" font-family="${SANS}">${caps[s] ?? ""}</text>`,
  );
  render(
    join(tmp, "story.svg"),
    q`<svg xmlns="http://www.w3.org/2000/svg" width="1930" height="1800" viewBox="0 0 1930 1800"><rect width="1930" height="1800" fill="#05070a"/>${cells.join("")}</svg>`,
    join(out, "2880-splash-live-storyboard.png"),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
