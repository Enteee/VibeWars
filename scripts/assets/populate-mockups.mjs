/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions -- reads untyped map.json and writes SVG: numbers go into strings everywhere. */
/**
 * #4004: before/after mockups for the populate study. For three of the emptiest
 * maps, a 1200 x 740 u crop around the widest open ground, drawn twice side by
 * side: as the map is, and with kit props scattered over the empty ground (seeded,
 * so it regenerates identically). Props are flat shapes with a contact shadow and
 * a lit top, as visual-style §3 asks; nothing here is game code or final art.
 *
 * Writes docs/art/populate/mockup-<map>.svg, each well under 30 KB.
 * Run: node scripts/assets/populate-mockups.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { survey } from "./populate-survey.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "docs/art/populate");
const CROP = { w: 1200, h: 740 };
const CELL = 20;

/** The kit per biome: kind and how many per 1000 x 1000 u of empty ground. */
const KIT = {
  hall: [
    ["column", 1.2],
    ["brazier", 0.5],
    ["crates", 0.8],
  ],
  volcanic: [
    ["spike", 1.6],
    ["boulder", 1.2],
    ["bones", 0.6],
    ["brazier", 0.4],
  ],
  jungle: [
    ["boulder", 1.0],
    ["reeds", 2.2],
    ["column", 0.7],
    ["tree", 0.9],
  ],
};

/** Seeded PRNG. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const f = (n) => Math.round(n);
/** Each glyph: shadow first (long, toward +x +y: the sun is north-west), then body, then lit top. */
const GLYPH = {
  column: (x, y) =>
    `<ellipse cx="${x + 18}" cy="${y + 6}" rx="40" ry="12" fill="#000" opacity=".35"/><ellipse cx="${x}" cy="${y}" rx="22" ry="9" fill="#8a8478"/><rect x="${x - 18}" y="${y - 70}" width="36" height="70" fill="#a39d90"/><rect x="${x - 18}" y="${y - 70}" width="12" height="70" fill="#c4beb0"/><ellipse cx="${x}" cy="${y - 70}" rx="20" ry="8" fill="#d6d0c2"/>`,
  boulder: (x, y) =>
    `<ellipse cx="${x + 14}" cy="${y + 8}" rx="52" ry="16" fill="#000" opacity=".35"/><polygon points="${x - 44},${y} ${x - 30},${y - 34} ${x + 6},${y - 46} ${x + 40},${y - 22} ${x + 46},${y}" fill="#6f6a62" stroke="#2b2824" stroke-width="3"/><polygon points="${x - 30},${y - 34} ${x + 6},${y - 46} ${x + 10},${y - 24} ${x - 26},${y - 14}" fill="#9a948a"/>`,
  spike: (x, y) =>
    `<ellipse cx="${x + 12}" cy="${y + 5}" rx="30" ry="9" fill="#000" opacity=".4"/><polygon points="${x - 20},${y} ${x - 4},${y - 90} ${x + 20},${y}" fill="#2c2a30" stroke="#0e0d10" stroke-width="3"/><polygon points="${x - 20},${y} ${x - 4},${y - 90} ${x - 3},${y}" fill="#4a4752"/>`,
  bones: (x, y) =>
    `<ellipse cx="${x + 6}" cy="${y + 4}" rx="34" ry="8" fill="#000" opacity=".3"/><path d="M${x - 30} ${y - 4}l60 -6M${x - 24} ${y + 4}l50 -2M${x - 8} ${y - 14}l12 22" stroke="#d9d2bf" stroke-width="7" stroke-linecap="round"/><circle cx="${x + 20}" cy="${y - 10}" r="9" fill="#d9d2bf"/>`,
  brazier: (x, y) =>
    `<circle cx="${x}" cy="${y - 40}" r="130" fill="url(#glow)"/><ellipse cx="${x + 10}" cy="${y + 5}" rx="30" ry="9" fill="#000" opacity=".35"/><rect x="${x - 4}" y="${y - 34}" width="8" height="34" fill="#4b3f34"/><ellipse cx="${x}" cy="${y - 36}" rx="22" ry="8" fill="#5c4d3f"/><polygon points="${x - 14},${y - 38} ${x},${y - 78} ${x + 14},${y - 38}" fill="#ffb347"/><polygon points="${x - 7},${y - 38} ${x},${y - 62} ${x + 7},${y - 38}" fill="#fff0b0"/>`,
  crates: (x, y) =>
    `<ellipse cx="${x + 14}" cy="${y + 6}" rx="46" ry="12" fill="#000" opacity=".35"/><rect x="${x - 30}" y="${y - 38}" width="60" height="38" fill="#7a5a36" stroke="#2f2113" stroke-width="3"/><rect x="${x - 30}" y="${y - 38}" width="60" height="10" fill="#9c7648"/><rect x="${x - 6}" y="${y - 62}" width="40" height="26" fill="#8a6540" stroke="#2f2113" stroke-width="3"/>`,
  reeds: (x, y) =>
    `<ellipse cx="${x + 6}" cy="${y + 3}" rx="26" ry="7" fill="#000" opacity=".25"/><path d="M${x - 16} ${y}l-6 -44M${x - 6} ${y}l0 -52M${x + 4} ${y}l8 -48M${x + 14} ${y}l14 -38" stroke="#6f9a4a" stroke-width="5" stroke-linecap="round"/>`,
  tree: (x, y) =>
    `<ellipse cx="${x + 30}" cy="${y + 8}" rx="70" ry="18" fill="#000" opacity=".35"/><rect x="${x - 8}" y="${y - 90}" width="16" height="90" fill="#4a3826"/><ellipse cx="${x}" cy="${y - 110}" rx="62" ry="40" fill="#2f6a34" stroke="#10260f" stroke-width="3"/><ellipse cx="${x - 14}" cy="${y - 122}" rx="34" ry="20" fill="#4a944a"/>`,
};

/** How far each prop kind reaches from its anchor, u: the spacing it needs. */
const REACH = {
  column: 60,
  boulder: 60,
  spike: 40,
  bones: 40,
  brazier: 40,
  crates: 55,
  reeds: 35,
  tree: 80,
};

function mockup(id) {
  const m = JSON.parse(
    fs.readFileSync(path.join(ROOT, "packages/game-maps/maps", id, "map.json"), "utf8"),
  );
  const s = survey(m);
  // Crop centred on the cell with the most empty ground in a window.
  let best = { score: -1, x: 0, y: 0 };
  const cw = CROP.w / CELL;
  const ch = CROP.h / CELL;
  for (let y = 0; y + ch < s.h; y += 5)
    for (let x = 0; x + cw < s.w; x += 5) {
      let sum = 0;
      for (let yy = y; yy < y + ch; yy += 4)
        for (let xx = x; xx < x + cw; xx += 4) sum += s.empty[yy * s.w + xx];
      if (sum > best.score) best = { score: sum, x, y };
    }
  const ox = best.x * CELL;
  const oy = best.y * CELL;
  const rand = rng([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const kit = KIT[m.biome];
  const area = (best.score * 16 * CELL * CELL) / 1e6;
  const props = [];
  for (const [kind, per] of kit) {
    const want = Math.round(per * area * 4);
    for (let n = 0, tries = 0; n < want && tries < 4000; tries++) {
      const x = ox + rand() * CROP.w;
      const y = oy + rand() * CROP.h;
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      if (!s.empty[cy * s.w + cx]) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.y - y) < (REACH[p.kind] + REACH[kind]) * 1.4))
        continue;
      if ((m.spawnPoints ?? []).some((sp) => Math.hypot(sp.x - x, sp.y - y) < 300)) continue;
      props.push({ kind, x, y });
      n++;
    }
  }
  props.sort((a, b) => a.y - b.y);
  const panel = (withProps, dx) => {
    const g = [`<g transform="translate(${dx} 0)" clip-path="url(#clip)">`];
    g.push(`<rect width="${CROP.w}" height="${CROP.h}" fill="#1b1f24"/>`);
    g.push(`<g transform="translate(${-ox} ${-oy})">`);
    const pts = (p) => p.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
    g.push(
      s.outline
        ? `<polygon points="${pts(s.outline)}" fill="#4a5a44"/>`
        : `<rect width="${m.width}" height="${m.height}" fill="#4a5a44"/>`,
    );
    for (const p of s.solids)
      g.push(`<polygon points="${pts(p)}" fill="#20252b" stroke="#0c0e10" stroke-width="6"/>`);
    if (withProps) for (const p of props) g.push(GLYPH[p.kind](f(p.x), f(p.y)));
    g.push("</g></g>");
    return g.join("");
  };
  const W = CROP.w * 2 + 40;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${CROP.h + 80}" width="1000" height="${Math.round((1000 * (CROP.h + 80)) / W)}">
<defs><clipPath id="clip"><rect width="${CROP.w}" height="${CROP.h}"/></clipPath><radialGradient id="glow"><stop offset="0" stop-color="#ffb347" stop-opacity=".45"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${CROP.h + 80}" fill="#0e1013"/>
<g transform="translate(0 70)">${panel(false, 0)}${panel(true, CROP.w + 40)}</g>
<g fill="#e8e6e1" font-family="sans-serif" font-size="44"><text x="10" y="50">${id}: today</text><text x="${CROP.w + 50}" y="50">with ${props.length} kit props</text></g>
</svg>
`;
  fs.writeFileSync(path.join(OUT, `mockup-${id}.svg`), out);
  console.log(id, props.length, "props,", out.length, "bytes");
}

for (const id of ["ashen-courtyard", "cinder-sanctum", "jungle-ruins"]) mockup(id);
