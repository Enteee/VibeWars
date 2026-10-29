// Draws a study of where Teams lives once the title bar drops [Music] and
// [Teams] (#1439). It is a design reference for that decision, not a game
// asset. Study, not decided.
//
//   node scripts/assets/teams-menu-study.mjs
//
// Writes docs/art/teams-menu-study.svg. Three variants, A, B and C, each the
// main menu at 1280 px wide, twice: with no teams, and with three teams, one of
// them chosen. The title bar is #1251's pick A: `VibeWars`, then Record, then
// the global icons. Palette and type mirror docs/art/art-direction.md and
// apps/web/src/styles.css (monospace, `--accent` for what is chosen).
//
//   A: a third column, Teams, between the roster and Play.
//   B: Teams under the roster, in the same left column.
//   C: no list on the menu; Play gets "Solo / With team" and a team picker.
//
// The three teams show the edge cases: a long name that is cut with an
// ellipsis, and a team whose character was deleted (the red problem line).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "teams-menu-study.svg");

const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  accent: "#59c2ff",
  damage: "#ff7b72",
  problemInk: "#ffb3ae",
};

const W = 1280;
const BODY_H = 450;
const BAR_H = 44;
const FS = 13;
const CH = 7.8;
const GAP = 40;
const LABEL_H = 34;
const PANEL_H = BAR_H + BODY_H;

/** @param {string} s */
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** @param {number} n */
const f = (n) => String(Math.round(n * 10) / 10);

/**
 * @param {number} x @param {number} y @param {string} s
 * @param {{ size?: number, fill?: string, bold?: boolean, anchor?: string }} [o]
 */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${String(o.size ?? FS)}" fill="${o.fill ?? C.ink}"` +
  `${o.bold === true ? ' font-weight="700"' : ""}${o.anchor === undefined ? "" : ` text-anchor="${o.anchor}"`}>${esc(s)}</text>`;

/**
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{ fill?: string, stroke?: string, r?: number, dash?: boolean, sw?: number }} [o]
 */
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${String(o.r ?? 3)}" fill="${o.fill ?? "none"}"` +
  `${o.stroke === undefined ? "" : ` stroke="${o.stroke}"`}${o.sw === undefined ? "" : ` stroke-width="${String(o.sw)}"`}${o.dash === true ? ' stroke-dasharray="4 3"' : ""}/>`;

/** @param {string} d @param {string} [c] @param {number} [w] */
const path = (d, c = C.ink, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * @param {number} x @param {number} cy @param {string} label
 * @param {{ primary?: boolean, h?: number, w?: number }} [o]
 */
function button(x, cy, label, o = {}) {
  const h = o.h ?? 26;
  const w = o.w ?? label.length * CH + 22;
  const colour = o.primary === true ? C.accent : C.ink;
  return {
    w,
    svg:
      rect(x, cy - h / 2, w, h, {
        fill: C.panel,
        stroke: o.primary === true ? C.accent : C.line,
      }) + text(x + w / 2, cy + 4.5, label, { fill: colour, anchor: "middle" }),
  };
}

/** A character's figure: a body disc and its facing tick. @param {number} cx @param {number} cy @param {string} fill */
const figure = (cx, cy, fill) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="8" fill="${fill}" stroke="#0b0f14" stroke-width="1.5"/>` +
  path(`M${f(cx)} ${f(cy)}L${f(cx + 11)} ${f(cy)}`, C.ink, 1.8);

const HUES = ["#59c2ff", "#d4a72c", "#9b6bff", "#5fd08a"];

/** The global icons of the bar, 26 px squares, right to left from `right`. @param {number} right @param {number} cy */
function globals(right, cy) {
  /** @type {((x: number) => string)[]} */
  const glyphs = [
    (x) =>
      `<circle cx="${f(x + 13)}" cy="${f(cy)}" r="3.4" fill="none" stroke="${C.ink}" stroke-width="1.6"/>` +
      path(
        `M${f(x + 13)} ${f(cy - 8)}V${f(cy - 5.6)}M${f(x + 13)} ${f(cy + 5.6)}V${f(cy + 8)}M${f(x + 5)} ${f(cy)}H${f(x + 7.4)}M${f(x + 18.6)} ${f(cy)}H${f(x + 21)}`,
      ),
    (x) =>
      path(`M${f(x + 9)} ${f(cy + 4)}V${f(cy - 7)}L${f(x + 18)} ${f(cy - 9)}V${f(cy + 2)}`) +
      `<ellipse cx="${f(x + 7.6)}" cy="${f(cy + 5)}" rx="2.6" ry="2" fill="${C.ink}"/>` +
      `<ellipse cx="${f(x + 16.6)}" cy="${f(cy + 3)}" rx="2.6" ry="2" fill="${C.ink}"/>`,
    (x) =>
      path(
        `M${f(x + 6)} ${f(cy - 3)}H${f(x + 9.5)}L${f(x + 14)} ${f(cy - 7)}V${f(cy + 7)}L${f(x + 9.5)} ${f(cy + 3)}H${f(x + 6)}Z`,
      ) + path(`M${f(x + 17)} ${f(cy - 3.5)}Q${f(x + 20)} ${f(cy)} ${f(x + 17)} ${f(cy + 3.5)}`),
    (x) =>
      path(
        `M${f(x + 6)} ${f(cy - 3)}V${f(cy - 7)}H${f(x + 10)}M${f(x + 16)} ${f(cy - 7)}H${f(x + 20)}V${f(cy - 3)}M${f(x + 20)} ${f(cy + 3)}V${f(cy + 7)}H${f(x + 16)}M${f(x + 10)} ${f(cy + 7)}H${f(x + 6)}V${f(cy + 3)}`,
      ),
  ];
  let x = right;
  let svg = "";
  for (const g of [...glyphs].reverse()) {
    x -= 26;
    svg += rect(x, cy - 13, 26, 26, { stroke: C.line }) + g(x);
    x -= 6;
  }
  return { svg, left: x + 6 };
}

/** The title bar: `VibeWars`, Record, then the global icons. No Teams, no Music. */
function titleBar() {
  const cy = BAR_H / 2;
  const g = globals(W - 12, cy);
  const record = button(0, cy, "Record");
  return (
    rect(0, 0, W, BAR_H, { fill: C.panel, r: 0 }) +
    `<path d="M0 ${String(BAR_H)}H${String(W)}" stroke="${C.line}"/>` +
    text(16, cy + 4.5, "VibeWars", { bold: true, size: FS + 1 }) +
    g.svg +
    `<path d="M${f(g.left - 7)} ${f(cy - 11)}V${f(cy + 11)}" stroke="${C.line}"/>` +
    `<g transform="translate(${f(g.left - 12 - record.w)},0)">${record.svg}</g>`
  );
}

/** @param {number} x @param {number} y @param {string} s */
const columnTitle = (x, y, s) => text(x, y, s, { bold: true, size: FS + 2 });

const SUBTITLE = "A minimalist tactical PvP arena. Built for LAN parties. source";

/**
 * A row in a list: a figure, a name, a dim line, an optional tag.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{ name: string, sub: string, hue: string, tag?: string, chosen?: boolean, dots?: readonly string[], bad?: boolean }} r
 */
function row(x, y, w, h, r) {
  const cy = y + h / 2;
  let svg = rect(x, y, w, h, {
    fill: C.panel,
    stroke: r.chosen === true ? C.accent : C.line,
    sw: r.chosen === true ? 2 : 1,
    dash: r.tag === "RANDOM",
  });
  const dots = r.dots ?? [r.hue];
  dots.forEach((d, i) => {
    svg += figure(x + 22 + i * 22, cy, d);
  });
  const tx = x + 22 + dots.length * 22 + 8;
  const room = Math.floor((x + w - 12 - tx) / CH);
  const name = r.name.length > room ? `${r.name.slice(0, room - 1)}…` : r.name;
  svg += text(tx, h >= 44 ? cy - 3 : cy + 4.5, name, { bold: true });
  if (h >= 44) {
    svg += text(tx, cy + 12, r.sub, {
      fill: r.bad === true ? C.problemInk : C.inkDim,
      size: FS - 1,
    });
  }
  if (r.tag !== undefined) {
    const tw = r.tag.length * 7 + 12;
    svg += rect(x + w - tw - 10, y + 6, tw, 16, { stroke: C.inkDim, r: 3 });
    svg += text(x + w - tw / 2 - 10, y + 18, r.tag, { size: 10, anchor: "middle" });
  }
  return svg;
}

const CHARS = [
  { name: "Aria", sub: "Elementalist / Monk · 5/8 skills · 12W 7L", hue: HUES[0] },
  { name: "Brann", sub: "Warrior / Paragon · 8/8 skills · 3W 4L", hue: HUES[1] },
  { name: "Cass", sub: "Ritualist / Necromancer · 8/8 skills", hue: HUES[2], tag: "RANDOM" },
];

const LONG = "The Long-Named Hunters of the Frozen Wastes";
/** @type {readonly { name: string, sub: string, dots: readonly string[], bad?: boolean }[]} */
const TEAMS = [
  { name: "Sunrise Vanguard", sub: "3 members", dots: [HUES[0], HUES[1], HUES[2]] },
  { name: LONG, sub: "2 members", dots: [HUES[1], HUES[2]] },
  { name: "Duo", sub: "1 member, 1 missing", dots: [HUES[0]], bad: true },
];

/** The problem strip, as the real screen shows it. @param {number} x @param {number} y @param {number} w @param {string} s */
const problem = (x, y, w, s) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="28" fill="${C.damage}" fill-opacity="0.08"/>` +
  `<rect x="${f(x)}" y="${f(y)}" width="3" height="28" fill="${C.damage}"/>` +
  text(x + 12, y + 18, s, { fill: C.problemInk, size: FS - 1 });

/** The empty state: a line and its one button. @param {number} x @param {number} y @param {number} w @param {number} [h] */
function emptyTeams(x, y, w, h = 120) {
  const b = button(0, 0, "New team", { primary: true });
  return (
    rect(x, y, w, h, { stroke: C.line, dash: true }) +
    text(x + w / 2, y + h * 0.4, "No teams yet.", { fill: C.inkDim, anchor: "middle" }) +
    `<g transform="translate(${f(x + w / 2 - b.w / 2)},${f(y + h * 0.68)})">${b.svg}</g>`
  );
}

/** The Play column, drawn at x with width w from y. `picker` sits above Host. @param {number} x @param {number} y @param {number} w @param {string} [picker] */
function playColumn(x, y, w, picker = "") {
  let svg = columnTitle(x, y, "Play");
  let cy = y + 28;
  svg += text(x, cy, "NAME", { size: 10, fill: C.inkDim });
  svg += rect(x, cy + 6, w, 28, { fill: C.bg, stroke: C.line });
  svg += text(x + 10, cy + 25, "Aria", {});
  cy += 54;
  svg += text(x, cy, "RANDOM ARENA", { size: 10, fill: C.inkDim });
  ["Duel", "Capture", "Hill"].forEach((m, i) => {
    const b = button(x + i * 74, cy + 20, m, { w: 68 });
    svg += b.svg;
  });
  cy += 52;
  svg += picker;
  const pickerH = picker === "" ? 0 : 74;
  cy += pickerH;
  svg += button(x, cy + 14, "Host a lobby", { primary: true, h: 30, w: 150 }).svg;
  cy += 44;
  svg += rect(x, cy, 100, 30, { fill: C.bg, stroke: C.line });
  svg += text(x + 10, cy + 20, "CODE", { fill: C.inkDim });
  svg += button(x + 108, cy + 15, "Join", { primary: true, h: 30, w: 60 }).svg;
  cy += 54;
  svg += text(x, cy, "Hosting shows your address to the guests.", { size: FS - 2, fill: C.inkDim });
  return svg;
}

/**
 * Variant A: three columns.
 * @param {boolean} some
 */
function bodyA(some) {
  const y0 = BAR_H + 28;
  let svg = text(24, y0, SUBTITLE, { fill: C.inkDim });
  const top = y0 + 36;
  // roster
  svg += columnTitle(24, top, "Play as");
  CHARS.forEach((c, i) => {
    svg += row(24, top + 14 + i * 62, 360, 54, { ...c, chosen: i === 0 });
  });
  svg += button(24, top + 14 + 3 * 62 + 18, "New character").svg;
  // teams
  const tx = 424;
  svg += columnTitle(tx, top, "Teams");
  if (some) {
    TEAMS.forEach((t, i) => {
      svg += row(tx, top + 14 + i * 62, 360, 54, { ...t, hue: HUES[0], chosen: i === 0 });
    });
    svg += problem(tx, top + 14 + 3 * 62, 360, "Duo: Dax was deleted.");
    svg += button(tx, top + 14 + 3 * 62 + 52, "New team", { primary: true }).svg;
  } else {
    svg += emptyTeams(tx, top + 14, 360);
  }
  svg += playColumn(824, top, 420);
  return svg;
}

/**
 * Variant B: Teams under the roster, one left column.
 * @param {boolean} some
 */
function bodyB(some) {
  const y0 = BAR_H + 26;
  let svg = text(24, y0, SUBTITLE, { fill: C.inkDim });
  const top = y0 + 32;
  svg += columnTitle(24, top, "Play as");
  CHARS.forEach((c, i) => {
    svg += row(24, top + 12 + i * 50, 520, 44, { ...c, chosen: i === 0 });
  });
  svg += button(24, top + 12 + 3 * 50 + 14, "New character").svg;
  const ty = top + 12 + 3 * 50 + 46;
  svg += `<path d="M24 ${f(ty - 14)}H544" stroke="${C.line}"/>`;
  svg += columnTitle(24, ty + 8, "Teams");
  if (some) {
    const nb = button(544 - 96, ty + 2, "New team", { primary: true, h: 24 });
    svg += nb.svg;
    TEAMS.forEach((t, i) => {
      svg += row(24, ty + 20 + i * 36, 520, 30, { ...t, hue: HUES[0], chosen: i === 0 });
    });
    svg += text(24, ty + 20 + 3 * 36 + 14, "Duo: Dax was deleted.", {
      fill: C.problemInk,
      size: FS - 2,
    });
  } else {
    svg += emptyTeams(24, ty + 20, 520, 84);
  }
  svg += playColumn(640, top, 420);
  return svg;
}

/**
 * Variant C: a Play-side picker, no list.
 * @param {boolean} some
 */
function bodyC(some) {
  const y0 = BAR_H + 28;
  let svg = text(24, y0, SUBTITLE, { fill: C.inkDim });
  const top = y0 + 36;
  svg += columnTitle(24, top, "Play as");
  CHARS.forEach((c, i) => {
    svg += row(24, top + 14 + i * 62, 520, 54, { ...c, chosen: i === 0 });
  });
  svg += button(24, top + 14 + 3 * 62 + 18, "New character").svg;
  const px = 640;
  const w = 420;
  // the picker: two segments, then the team field under them
  const py = top + 156;
  let pick = "";
  pick += rect(px, py - 22, 100, 28, {
    stroke: some ? C.accent : C.line,
    sw: some ? 2 : 1,
    fill: C.panel,
  });
  pick += text(px + 50, py - 3, "Play solo", { anchor: "middle", fill: some ? C.ink : C.accent });
  pick += rect(px + 100, py - 22, 140, 28, { stroke: C.line, fill: C.panel });
  pick += text(px + 170, py - 3, some ? "With team ▾" : "With team", {
    anchor: "middle",
    fill: some ? C.accent : C.inkDim,
  });
  if (!some) {
    pick += text(px, py + 26, "No teams yet.", { fill: C.inkDim });
    pick += button(px + 110, py + 22, "New team", { primary: true, h: 24 }).svg;
  }
  svg += playColumn(px, top, w, pick);
  if (some) {
    // the open picker, over the Host button
    const ox = px;
    const oy = py + 10;
    let list = rect(ox, oy, w, 4 * 34 + 8, { fill: C.bg, stroke: C.accent });
    TEAMS.forEach((t, i) => {
      list += row(ox + 6, oy + 6 + i * 34, w - 12, 30, { ...t, hue: HUES[0], chosen: i === 0 });
    });
    list += text(ox + 12, oy + 6 + 3 * 34 + 20, "Edit teams…", { fill: C.accent });
    svg += list;
  }
  return svg;
}

/** @param {number} y @param {string} label @param {string} body */
function panel(y, label, body) {
  return (
    text(20, y + 22, label, { bold: true, size: FS + 1 }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, PANEL_H, { fill: C.bg, stroke: C.line, r: 0 }) +
    titleBar() +
    body +
    `</g>`
  );
}

const VARIANTS = /** @type {const} */ ([
  ["A: a Teams column", bodyA],
  ["B: Teams under the roster", bodyB],
  ["C: a team picker in Play", bodyC],
]);

let y = 20;
let svg = "";
for (const [name, body] of VARIANTS) {
  svg += text(20, y + 16, name, { bold: true, size: 18 });
  y += 28;
  svg += panel(y, "no teams", body(false));
  y += LABEL_H + PANEL_H + GAP / 2;
  svg += panel(y, "three teams, Sunrise Vanguard chosen", body(true));
  y += LABEL_H + PANEL_H + GAP;
}
const H = y;
const out =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W + 40)} ${String(H)}" ` +
  `width="${String(W + 40)}" height="${String(H)}" font-family="ui-monospace, Menlo, Consolas, monospace">` +
  rect(0, 0, W + 40, H, { fill: "#0b0f14", r: 0 }) +
  svg +
  `</svg>\n`;
writeFileSync(outFile, out);
console.log(`${outFile}: ${String(out.length)} bytes`);
