// #2880: five splash-screen proposals, each at 1920x1080 and 390x844 on one
// sheet (docs/art/2880-splash-N.png). Study, not decided. All original, drawn
// from the palette in docs/art/art-direction.md; fonts are DejaVu, as the
// rest of the art. Run: node scripts/assets/splash-proposals.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../docs/art");
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  dim: "#7d8899",
  friend: "#59c2ff",
  foe: "#ff7b72",
  target: "#ffd866",
  altar: "#c8a45a",
  floor: "#26303f",
  deck: "#a0b2c7",
  wall: "#4b5a70",
  page: "#10151c",
};
const SANS = "DejaVu Sans, sans-serif";
const SERIF = "DejaVu Serif, serif";
/** @type {(n: number) => number} */
const f = (n) => Math.round(n * 10) / 10;
/** Tagged template: numbers are rounded to a tenth, everything else is printed as is.
 * @type {(strs: TemplateStringsArray, ...v: (string | number)[]) => string} */
const q = (strs, ...v) =>
  strs.reduce(
    (a, x, i) => a + x + (i < v.length ? String(typeof v[i] === "number" ? f(v[i]) : v[i]) : ""),
    "",
  );

/** Name size: fits `w` at ~0.70 em per glyph, 8 glyphs, plus tracking. */
/** @type {(w: number, track?: number) => number} */
const fit = (w, track = 0) => Math.floor(w / (8 * 0.7 + 7 * track));
/** @type {(x: number, y: number, s: string, size: number, fill: string, extra?: string) => string} */
const text = (x, y, s, size, fill, extra = "") =>
  q`<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${fill}" text-anchor="middle" ${extra}>${s}</text>`;
/** @type {(cx: number, cy: number, r: number, n: number, fill: string) => string} */
const star = (cx, cy, r, n, fill) =>
  q`<polygon fill="${fill}" points="${Array.from({ length: n * 2 }, (_, i) => {
    const a = (i * Math.PI) / n - Math.PI / 2,
      rr = i % 2 ? r * 0.4 : r;
    return `${String(f(cx + rr * Math.cos(a)))},${String(f(cy + rr * Math.sin(a)))}`;
  }).join(" ")}"/>`;
/** @type {(w: number, h: number, step: number, op?: number) => string} */
const gridBg = (w, h, step, op = 1) => {
  const o = [q`<rect width="${w}" height="${h}" fill="${C.bg}"/>`];
  for (let x = 0; x <= w; x += step)
    o.push(
      q`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${C.grid}" stroke-width="2" opacity="${op}"/>`,
    );
  for (let y = 0; y <= h; y += step)
    o.push(
      q`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${C.grid}" stroke-width="2" opacity="${op}"/>`,
    );
  return o.join("");
};
/** @type {(w: number, y: number, size: number) => string} */
const prompt = (w, y, size) =>
  text(
    w / 2,
    y,
    "PRESS ANY KEY TO BEGIN",
    size,
    C.dim,
    q`font-family="${SANS}" letter-spacing="${f(size * 0.3)}"`,
  );
const defs = q`<defs>
<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".75"/></radialGradient>
<linearGradient id="nm" x1="0" x2="1"><stop offset="0" stop-color="${C.friend}"/><stop offset="1" stop-color="${C.foe}"/></linearGradient></defs>`;

/** 1: pure typography. Vibe in friend blue, Wars in foe coral, a slash between. */
/** @type {(w: number, h: number) => string} */
function p1(w, h) {
  const land = w > h,
    size = land ? 270 : fit(w * 0.9, 0.02);
  const cx = w / 2,
    cy = land ? h * 0.52 : h * 0.45,
    tr = size * 0.02;
  const o = [gridBg(w, h, land ? 60 : 39)];
  const tspan = q`<text x="${cx}" y="${cy}" font-size="${size}" font-weight="bold" font-family="${SANS}" text-anchor="middle" letter-spacing="${f(tr)}"><tspan fill="${C.friend}">Vibe</tspan><tspan fill="${C.foe}">Wars</tspan></text>`;
  o.push(
    q`<g opacity=".35" transform="translate(${f(size * 0.04)},${f(size * 0.04)})">${tspan.replace(/fill="[^"]+"/g, 'fill="#000"')}</g>`,
    tspan,
  );
  const lw = land ? 1100 : w * 0.8;
  o.push(
    q`<rect x="${cx - lw / 2}" y="${cy + size * 0.14}" width="${lw / 2}" height="${size * 0.03}" fill="${C.friend}"/><rect x="${cx}" y="${cy + size * 0.14}" width="${lw / 2}" height="${size * 0.03}" fill="${C.foe}"/>`,
  );
  o.push(prompt(w, land ? h * 0.88 : h * 0.86, land ? 28 : 15));
  return o.join("");
}

/** 2: the emblem: the game's own marks (ring = friend, triangle = foe) as a logo. */
/** @type {(w: number, h: number) => string} */
function p2(w, h) {
  const land = w > h,
    R = land ? 250 : 105,
    cx = w / 2,
    cy = land ? h * 0.4 : h * 0.34,
    size = land ? 130 : fit(w * 0.88);
  const o = [q`<rect width="${w}" height="${h}" fill="${C.page}"/>`];
  for (const k of [1.9, 1.5])
    o.push(
      q`<circle cx="${cx}" cy="${cy}" r="${R * k}" fill="none" stroke="${C.line}" stroke-width="${land ? 3 : 2}" stroke-dasharray="${land ? "6 18" : "4 12"}"/>`,
    );
  const g = R * 0.55;
  o.push(
    q`<circle cx="${cx - g}" cy="${cy}" r="${R}" fill="${C.friend}"/><circle cx="${cx - g}" cy="${cy}" r="${R * 0.78}" fill="none" stroke="#fff" stroke-width="${R * 0.07}"/>`,
  );
  o.push(
    q`<circle cx="${cx - g}" cy="${cy}" r="${R * 0.3}" fill="none" stroke="#fff" stroke-width="${R * 0.09}"/>`,
  );
  const t = R * 0.62,
    tx = cx + g;
  o.push(
    q`<circle cx="${tx}" cy="${cy}" r="${R}" fill="${C.foe}" opacity=".92"/><circle cx="${tx}" cy="${cy}" r="${R * 0.78}" fill="none" stroke="#fff" stroke-width="${R * 0.07}"/>`,
  );
  o.push(
    q`<polygon points="${tx},${cy - t * 0.7} ${tx + t * 0.65},${cy + t * 0.5} ${tx - t * 0.65},${cy + t * 0.5}" fill="#fff"/>`,
  );
  o.push(
    q`<ellipse cx="${cx}" cy="${cy + R * 1.08}" rx="${R * 1.6}" ry="${R * 0.1}" fill="#000" opacity=".4"/>`,
  );
  o.push(
    text(
      cx,
      cy + R * 1.65 + (land ? 60 : 30),
      "VibeWars",
      size,
      C.ink,
      q`font-family="${SANS}" font-weight="bold" letter-spacing="${f(size * 0.04)}"`,
    ),
  );
  o.push(prompt(w, land ? h * 0.94 : h * 0.93, land ? 26 : 14));
  return o.join("");
}

/** 3: the arena in direction D: a deck with a hard shadow, two discs duel. */
/** @type {(w: number, h: number) => string} */
function p3(w, h) {
  const land = w > h,
    u = land ? 80 : 36,
    o = [q`<rect width="${w}" height="${h}" fill="${C.page}"/>`];
  const fy = land ? h * 0.12 : h * 0.34,
    fh = h - fy;
  o.push(q`<rect x="0" y="${fy}" width="${w}" height="${fh}" fill="${C.floor}"/>`);
  for (let x = 0; x <= w; x += u)
    o.push(q`<line x1="${x}" y1="${fy}" x2="${x}" y2="${h}" stroke="#34415a" stroke-width="1.5"/>`);
  for (let y = fy; y <= h; y += u)
    o.push(q`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#34415a" stroke-width="1.5"/>`);
  const dw = land ? 14 * u : 8 * u,
    dh = land ? 4 * u : 4 * u,
    dx = (w - dw) / 2,
    dy = land ? h * 0.58 : h * 0.6,
    lift = land ? 90 : 40;
  const sx = u * 1.3;
  o.push(
    q`<rect x="${dx + sx}" y="${dy + sx}" width="${dw}" height="${dh}" fill="#080b10" opacity=".55"/>`,
  );
  o.push(
    q`<rect x="${dx}" y="${dy + lift * 0.0}" width="${dw}" height="${dh}" fill="#0d131c" opacity=".55"/>`,
  );
  for (const px of [dx + u * 0.5, dx + dw - u * 1.1])
    o.push(
      q`<rect x="${px}" y="${dy + dh - lift * 0.2}" width="${u * 0.6}" height="${lift * 1.2}" fill="#62748c"/>`,
    );
  o.push(q`<rect x="${dx}" y="${dy - lift}" width="${dw}" height="${dh}" fill="${C.deck}"/>`);
  for (let i = 1; i < dh / (u * 0.5); i++)
    o.push(
      q`<line x1="${dx}" y1="${dy - lift + i * u * 0.5}" x2="${dx + dw}" y2="${dy - lift + i * u * 0.5}" stroke="#8a9cb3" stroke-width="1.5"/>`,
    );
  o.push(
    q`<rect x="${dx}" y="${dy - lift + dh}" width="${dw}" height="${lift * 0.5}" fill="#5a6c82"/><rect x="${dx}" y="${dy - lift + dh}" width="${dw}" height="${u * 0.08}" fill="#fff"/>`,
  );
  const r = land ? 110 : 44,
    ey = dy - lift + dh / 2;
  /** @type {[number, string, string][]} */
  const discs = [
    [dx + dw * 0.28, C.friend, "ring"],
    [dx + dw * 0.72, C.foe, "tri"],
  ];
  for (const [x, fill, mark] of discs) {
    o.push(
      q`<circle cx="${x + r * 0.3}" cy="${ey + r * 0.3}" r="${r}" fill="#000" opacity=".35"/><circle cx="${x}" cy="${ey}" r="${r}" fill="${fill}"/><circle cx="${x}" cy="${ey}" r="${r * 0.82}" fill="none" stroke="#fff" stroke-width="${r * 0.08}"/>`,
    );
    o.push(
      mark === "ring"
        ? q`<circle cx="${x}" cy="${ey}" r="${r * 0.3}" fill="none" stroke="#fff" stroke-width="${r * 0.1}"/>`
        : q`<polygon fill="#fff" points="${x},${ey - r * 0.4} ${x + r * 0.36},${ey + r * 0.28} ${x - r * 0.36},${ey + r * 0.28}"/>`,
    );
  }
  const size = land ? 200 : fit(w * 0.9, 0.02);
  const ty = land ? fy + size * 0.85 : fy - 70;
  o.push(
    text(
      w / 2 + size * 0.03,
      ty + size * 0.03,
      "VibeWars",
      size,
      "#000",
      q`font-family="${SANS}" font-weight="bold" letter-spacing="${f(size * 0.02)}" opacity=".5"`,
    ),
  );
  o.push(
    text(
      w / 2,
      ty,
      "VibeWars",
      size,
      "#fff",
      q`font-family="${SANS}" font-weight="bold" letter-spacing="${f(size * 0.02)}"`,
    ),
  );
  o.push(prompt(w, land ? h * 0.95 : h * 0.93, land ? 26 : 14).replace(C.dim, "#c9d4e2"));
  return o.join("");
}

/** 4: Vibe as vibration: two ripple fields, one per team, meet on a centre line. */
/** @type {(w: number, h: number) => string} */
function p4(w, h) {
  const land = w > h,
    cx = w / 2,
    cy = land ? h * 0.45 : h * 0.4,
    size = land ? 220 : fit(w * 0.9, 0.01);
  const o = [q`<rect width="${w}" height="${h}" fill="#0a0d12"/>`];
  const step = land ? 54 : 34,
    n = land ? 26 : 14;
  for (let i = 1; i <= n; i++) {
    const rr = i * step,
      op = Math.max(0.08, 1 - i / n);
    o.push(
      q`<circle cx="${cx - (land ? 480 : 0)}" cy="${cy - (land ? 0 : 260 * 0.0)}" r="${rr}" fill="none" stroke="${C.friend}" stroke-width="${land ? 4 : 3}" opacity="${f(op)}" clip-path="url(#L)"/>`,
    );
    o.push(
      q`<circle cx="${cx + (land ? 480 : 0)}" cy="${cy}" r="${rr}" fill="none" stroke="${C.foe}" stroke-width="${land ? 4 : 3}" opacity="${f(op)}" clip-path="url(#R)"/>`,
    );
  }
  const clipL = land
    ? q`<rect x="0" y="0" width="${cx}" height="${h}"/>`
    : q`<rect x="0" y="0" width="${w}" height="${cy}"/>`;
  const clipR = land
    ? q`<rect x="${cx}" y="0" width="${cx}" height="${h}"/>`
    : q`<rect x="0" y="${cy}" width="${w}" height="${h}"/>`;
  o.unshift(
    q`<defs><clipPath id="L">${clipL}</clipPath><clipPath id="R">${clipR}</clipPath></defs>`,
  );
  o.push(q`<rect x="0" y="${cy - 2}" width="${w}" height="4" fill="${C.ink}" opacity=".5"/>`);
  o.push(
    q`<rect x="${cx - size * 2.3}" y="${cy - size * 0.62}" width="${size * 4.6}" height="${size * 0.86}" fill="#0a0d12" opacity=".78"/>`,
  );
  o.push(
    text(
      cx,
      cy + size * 0.12,
      "VibeWars",
      size,
      C.ink,
      q`font-family="${SANS}" font-weight="bold" letter-spacing="${f(size * 0.01)}"`,
    ),
  );
  o.push(prompt(w, land ? h * 0.9 : h * 0.9, land ? 26 : 14));
  return o.join("");
}

/** 5: heraldry: a polygon crest, V cut from two team blades, laurel of rings. */
/** @type {(w: number, h: number) => string} */
function p5(w, h) {
  const land = w > h,
    cx = w / 2,
    s = land ? 1 : 0.6,
    top = land ? 90 : 120,
    size = land ? 120 : fit(w * 0.86);
  const o = [
    q`<rect width="${w}" height="${h}" fill="${C.page}"/>`,
    q`<rect width="${w}" height="${h}" fill="url(#vig)"/>`,
  ];
  const W = 300 * s,
    H = 380 * s;
  const crest = q`${cx - W},${top} ${cx + W},${top} ${cx + W},${top + H * 0.62} ${cx},${top + H * 1.25} ${cx - W},${top + H * 0.62}`;
  o.push(
    q`<polygon points="${crest}" fill="${C.panel}" stroke="${C.altar}" stroke-width="${8 * s}" stroke-linejoin="round"/>`,
  );
  o.push(
    q`<polygon points="${crest}" fill="none" stroke="${C.line}" stroke-width="${3 * s}" transform="translate(${cx} ${top + H * 0.6}) scale(.9) translate(${-cx} ${-(top + H * 0.6)})"/>`,
  );
  const vy = top + 70 * s,
    vb = top + H * 1.0;
  o.push(
    q`<polygon fill="${C.friend}" points="${cx - 230 * s},${vy} ${cx - 120 * s},${vy} ${cx + 10 * s},${vb - 40 * s} ${cx - 10 * s},${vb}"/>`,
  );
  o.push(
    q`<polygon fill="${C.foe}" points="${cx + 230 * s},${vy} ${cx + 120 * s},${vy} ${cx - 10 * s},${vb - 40 * s} ${cx + 10 * s},${vb}"/>`,
  );
  o.push(star(cx, top + H * 0.2, 46 * s, 4, C.target));
  for (const sg of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const a = 0.5 + i * 0.28,
        x = cx + sg * (W + 60 * s + Math.sin(a * 2) * 6 * s),
        y = top + 40 * s + i * 62 * s;
      o.push(
        q`<circle cx="${f(x + sg * i * 4 * s)}" cy="${f(y)}" r="${f((22 - i * 1.4) * s)}" fill="none" stroke="${C.altar}" stroke-width="${6 * s}"/>`,
      );
    }
  const ty = top + H * 1.25 + size * 1.25;
  o.push(
    text(
      cx,
      ty,
      "VibeWars",
      size,
      C.altar,
      q`font-family="${SERIF}" font-weight="bold" letter-spacing="${f(size * 0.05)}"`,
    ),
  );
  o.push(prompt(w, land ? h * 0.95 : h * 0.94, land ? 24 : 13));
  return o.join("");
}

/** @type {(fn: (w: number, h: number) => string, w: number, h: number) => string} */
const make = (fn, w, h) => q`<g>${fn(w, h)}</g>`;
const tmp = mkdtempSync(join(tmpdir(), "splash-"));
try {
  [p1, p2, p3, p4, p5].forEach((fn, i) => {
    const W = 1920 + 60 + 390,
      H = 1080;
    const svg = q`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<rect width="${W}" height="${H}" fill="#05070a"/>
<svg x="0" y="0" width="1920" height="1080" viewBox="0 0 1920 1080">${make(fn, 1920, 1080)}</svg>
<svg x="1980" y="118" width="390" height="844" viewBox="0 0 390 844">${make(fn, 390, 844)}</svg>
<rect x="1978" y="116" width="394" height="848" fill="none" stroke="${C.line}" stroke-width="4"/></svg>`;
    const file = join(tmp, q`${i + 1}.svg`);
    writeFileSync(file, svg);
    const png = join(out, q`2880-splash-${i + 1}.png`);
    execFileSync("inkscape", [file, "-o", join(tmp, q`${i + 1}.png`)]);
    execFileSync("magick", [join(tmp, q`${i + 1}.png`), "-colors", "96", "-strip", png]);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
