// Draws a study of how companions and summoned creatures look (#1158). It is
// a design reference for that decision, not a game asset. The operator picked C.
//
//   node scripts/assets/creature-study.mjs
//
// Writes docs/art/creature-study.svg. Three directions, A, B and C, each for
// four creatures (wolf, bone minion, bone horror, spirit) beside a player,
// ally and foe, alive and dead, at true arena size and at 4x. Palette and
// radii mirror docs/art/art-direction.md and the arena (player 14, creature
// 10 world units). Body drawing mirrors scripts/assets/player-mark.mjs.
//
//   A: a silhouette per family, team colour solid.
//   B: a ghost body: a team outline round a dim fill, a kind glyph inside.
//   C: a hexagon plate for every creature, the glyph cut out of it.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "creature-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  friend: "#59c2ff",
  foe: "#ff7b72",
  dead: "#4a5464",
  edge: "#0b0f14",
};

const PLAYER_R = 14;
const CREATURE_R = 10;
/** The default camera: view height 1100 on a 1080 px canvas. */
const TRUE = 1080 / 1100;
const BIG = 4;

/** @typedef {"wolf" | "minion" | "horror" | "spirit"} Kind */
const KINDS = /** @type {const} */ (["wolf", "minion", "horror", "spirit"]);
const LABEL = {
  wolf: "wolf (pet)",
  minion: "bone minion",
  horror: "bone horror",
  spirit: "spirit",
};

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * A polygon around the origin, `n` points alternating two radii.
 * @param {number} n @param {number} outer @param {number} inner @param {number} turn
 */
function star(n, outer, inner, turn) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n + turn;
    const r = i % 2 === 0 ? outer : inner;
    return `${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`;
  }).join(" ");
}

/**
 * The kind glyph in a 12-unit box around the origin.
 * @param {Kind} kind @param {string} ink @param {string} cut the body colour behind it
 */
function glyph(kind, ink, cut) {
  if (kind === "wolf") {
    return (
      `<ellipse cx="0" cy="2.4" rx="3.2" ry="2.6" fill="${ink}"/>` +
      [-4.2, -1.5, 1.5, 4.2]
        .map(
          (x, i) =>
            `<circle cx="${f(x)}" cy="${f(i % 3 === 0 ? -1 : -3.9)}" r="1.35" fill="${ink}"/>`,
        )
        .join("")
    );
  }
  if (kind === "spirit") {
    return `<path d="M0-5.6C3-2.4 4.2 0 4.2 2.2A4.2 4.2 0 0 1-4.2 2.2C-4.2 0-2.2-1.2 0-5.6Z" fill="${ink}"/>`;
  }
  const skull =
    `<path d="M0-4.6A4.2 4.2 0 0 1 3 2.6V4.8H-3V2.6A4.2 4.2 0 0 1 0-4.6Z" fill="${ink}"/>` +
    `<circle cx="-1.6" cy="-0.3" r="1.1" fill="${cut}"/><circle cx="1.6" cy="-0.3" r="1.1" fill="${cut}"/>`;
  if (kind === "minion") return skull;
  return (
    skull +
    `<path d="M-3.2-2.8C-5.4-3.4-5.8-5-5.4-6.4M3.2-2.8C5.4-3.4 5.8-5 5.4-6.4" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`
  );
}

/**
 * One body at the origin, facing +x, radius `r`.
 * @param {"A" | "B" | "C" | "player"} dir @param {Kind | "player"} kind
 * @param {string} team @param {boolean} dead @param {number} r
 */
function body(dir, kind, team, dead, r) {
  const k = r / CREATURE_R;
  const sw = (/** @type {number} */ w) => f(w / k);
  const outline = dead ? C.dead : team;
  if (dir === "player") {
    return dead
      ? `<circle r="${f(r)}" fill="none" stroke="${C.dead}" stroke-width="${f(2)}"/>`
      : `<circle r="${f(r)}" fill="${team}" stroke="${C.edge}" stroke-width="1.5"/>`;
  }
  /** @type {string} */
  let shape;
  if (dir === "A") {
    const fill = dead ? "none" : team;
    const paint = `fill="${fill}" stroke="${dead ? C.dead : C.edge}" stroke-width="${sw(dead ? 1.5 : 1.5)}" stroke-linejoin="round"${dead ? ' stroke-dasharray="3 2"' : ""}`;
    if (kind === "wolf") {
      shape = `<path d="M14.5 0L5-8.7A10 10 0 1 0 5 8.7Z" ${paint}/>`;
    } else if (kind === "minion") {
      shape = `<polygon points="${star(4, 12.5, 6.5, -Math.PI / 4)}" ${paint}/>`;
    } else if (kind === "horror") {
      shape = `<polygon points="${star(6, 13, 7.5, 0)}" ${paint}/>`;
    } else {
      shape = dead
        ? `<circle r="7" ${paint}/>`
        : `<circle r="7.2" fill="none" stroke="${team}" stroke-width="3.2"/><path d="M-6.5 2L-14 6L-8.5 8Z" fill="${team}"/>`;
    }
    return `<g transform="scale(${f(k)})">${shape}</g>`;
  }
  if (dir === "B") {
    const fill = dead ? "none" : team;
    return (
      `<g transform="scale(${f(k)})">` +
      `<circle r="9" fill="${fill}" fill-opacity="0.28" stroke="${outline}" stroke-width="2"${dead ? ' stroke-dasharray="3 2"' : ""}/>` +
      `<g transform="scale(0.95)">${glyph(/** @type {Kind} */ (kind), dead ? C.dead : C.ink, C.bg)}</g></g>`
    );
  }
  // C
  const fill = dead ? "none" : team;
  return (
    `<g transform="scale(${f(k)})">` +
    `<polygon points="${hex(11)}" fill="${fill}" stroke="${dead ? C.dead : C.edge}" stroke-width="1.5" stroke-linejoin="round"${dead ? ' stroke-dasharray="3 2"' : ""}/>` +
    `<g transform="scale(0.95)">${glyph(/** @type {Kind} */ (kind), dead ? C.dead : C.edge, dead ? C.bg : team)}</g></g>`
  );
}

/** @param {number} r */
function hex(r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`;
  }).join(" ");
}

/**
 * A row of bodies: per kind ally, foe, dead; then a player ally and foe.
 * @param {"A" | "B" | "C"} dir @param {number} x0 @param {number} y @param {number} s
 */
function row(dir, x0, y, s) {
  const out = [];
  let x = x0;
  const gap = s === BIG ? 96 : 30;
  /** @param {string} svg @param {string} [cap] */
  const put = (svg, cap) => {
    out.push(`<g transform="translate(${f(x)},${f(y)}) scale(${f(s)})">${svg}</g>`);
    if (cap !== undefined && s === BIG)
      out.push(
        `<text x="${f(x)}" y="${f(y + 62)}" text-anchor="middle" font-size="11" fill="${C.inkDim}">${cap}</text>`,
      );
    x += gap;
  };
  for (const kind of KINDS) {
    put(body(dir, kind, C.friend, false, CREATURE_R), "ally");
    put(body(dir, kind, C.foe, false, CREATURE_R), "foe");
    put(body(dir, kind, C.friend, true, CREATURE_R), "dead");
    x += gap / 2;
  }
  put(body("player", "player", C.friend, false, PLAYER_R), "player");
  x += s === BIG ? 40 : 0;
  put(body("player", "player", C.foe, false, PLAYER_R), "player");
  return out.join("");
}

const W = 1560;
/** @type {string[]} */
const parts = [];
const titles = {
  A: "A: a silhouette per family (wolf teardrop, minion and horror spiked, spirit a ringed wisp)",
  B: "B: a ghost body: a team outline round a dim fill, a kind glyph inside",
  C: "C: a hexagon plate for every creature, the glyph cut out of it",
};
let y = 40;
parts.push(
  `<text x="20" y="${String(y)}" font-size="18" fill="${C.ink}">Creatures: study, not decided (#1158). True size at the default camera, then 4x. Ally, foe, dead; a player beside them.</text>`,
);
y += 30;
for (const dir of /** @type {const} */ (["A", "B", "C"])) {
  parts.push(`<text x="20" y="${String(y)}" font-size="14" fill="${C.ink}">${titles[dir]}</text>`);
  y += 40;
  parts.push(row(dir, 40, y, TRUE));
  y += 70;
  parts.push(row(dir, 60, y, BIG));
  y += 110;
}
// Names under the first 4x row of each kind are in the key.
parts.push(
  `<text x="20" y="${String(y)}" font-size="12" fill="${C.inkDim}">Order in every row: ${KINDS.map((k) => LABEL[k]).join(", ")}; then player ally, player foe. Dead: dashed outline in dead, no fill (a player corpse is a hollow solid circle).</text>`,
);
y += 20;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(y)}" viewBox="0 0 ${String(W)} ${String(y)}" font-family="sans-serif">` +
  `<rect width="${String(W)}" height="${String(y)}" fill="${C.bg}"/>` +
  parts.join("") +
  "</svg>\n";
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
