// Mockup for #1902: the Team Builder and Character Builder top bars, today
// and proposed. A design reference, not a game asset.
//
//   node scripts/assets/button-bars-mockup.mjs
//
// Writes docs/art/button-bars-mockup.svg.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "button-bars-mockup.svg");

const PANEL = "#161b22";
const LINE = "#2b3440";
const INK = "#d7dee8";
const DIM = "#7d8899";
const ACC = "#59c2ff";
const BG = "#0e1116";
const BAD = "#ff7b72";
const W = 1000;
const H = 940;
const BAR = 44;

/** @type {string[]} */
const out = [];

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 * @param {string} [body]
 */
const el = (tag, attrs, body) => {
  const list = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${String(v)}"`)
    .join("");
  out.push(body === undefined ? `<${tag}${list}/>` : `<${tag}${list}>${body}</${tag}>`);
};

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {string} [fill]
 * @param {number} [size]
 * @param {string} [weight]
 * @param {string} [anchor]
 */
const text = (x, y, s, fill = INK, size = 14, weight = "400", anchor = "start") => {
  el(
    "text",
    {
      x,
      y,
      fill,
      "font-size": size,
      "font-weight": weight,
      "text-anchor": anchor,
      "font-family": "DejaVu Sans, sans-serif",
    },
    s,
  );
};

/** @param {string} label */
const width = (label) => 28 + 8 * label.length;

/**
 * @param {number} x
 * @param {number} y
 * @param {string} label
 * @param {boolean} [primary]
 * @returns {number} where the next button starts
 */
const btn = (x, y, label, primary = false) => {
  const w = width(label);
  el("rect", {
    x,
    y,
    width: w,
    height: 30,
    rx: 4,
    fill: primary ? ACC : "#21262d",
    stroke: primary ? ACC : LINE,
  });
  text(x + w / 2, y + 20, label, primary ? BG : INK, 13, primary ? "700" : "400", "middle");
  return x + w + 8;
};

/**
 * @param {number} y
 * @param {string} title
 * @param {string} crumbs
 * @param {string | null} back
 * @param {[string, string][]} status
 * @param {[string, boolean][]} actions
 * @param {string[]} notes
 */
const bar = (y, title, crumbs, back, status, actions, notes) => {
  text(20, y - 12, title, INK, 15, "700");
  el("rect", { x: 0, y, width: W, height: BAR, fill: PANEL });
  el("line", { x1: 0, y1: y + BAR, x2: W, y2: y + BAR, stroke: LINE });
  let x = 16;
  text(x, y + 27, crumbs, INK, 13);
  x += 7.2 * crumbs.length + 18;
  if (back !== null) {
    x = btn(x, y + 7, `‹ ${back}`);
  }
  for (const [s, col] of status) {
    text(x, y + 27, s, col, 12);
    x += 7 * s.length + 14;
  }
  let ax = W - 12 - actions.reduce((n, [l]) => n + width(l), 0) - 8 * (actions.length - 1);
  for (const [label, primary] of actions) {
    ax = btn(ax, y + 7, label, primary);
  }
  notes.forEach((n, i) => {
    text(20, y + BAR + 20 + 18 * i, n, DIM, 12);
  });
};

out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(H)}" viewBox="0 0 ${String(W)} ${String(H)}">`,
);
el("rect", { width: W, height: H, fill: BG });
text(
  20,
  34,
  "#1902 mockup: one button bar for the Team Builder and the Character Builder",
  INK,
  18,
  "700",
);

text(20, 70, "TODAY", ACC, 13, "700");
bar(
  104,
  "Team Builder (editing a team)",
  "VibeWars / Team Builder / Edit",
  "Back",
  [
    ["2 problems", BAD],
    ["● unsaved", DIM],
  ],
  [
    ["Save", true],
    ["Share", false],
    ["Duplicate", false],
    ["Delete", false],
  ],
  ["Save stays on the screen; Back leaves. Share / Duplicate / Delete are loose buttons."],
);
bar(
  210,
  "Character Builder",
  "VibeWars / Kestrel",
  "Close",
  [
    ["Ranger / Monk", INK],
    ["38/200", DIM],
    ["● unsaved", DIM],
  ],
  [
    ["Save", true],
    ["⋯", false],
  ],
  ["Save stays on the screen; Close leaves. Share / Duplicate / Delete are behind ⋯."],
);

text(20, 330, "PROPOSED (same bar on both screens)", ACC, 13, "700");
bar(
  364,
  "Team Builder",
  "VibeWars / Team Builder / Edit",
  null,
  [
    ["2 problems", BAD],
    ["● unsaved", DIM],
  ],
  [
    ["Save", true],
    ["⋯", false],
  ],
  ["No Back. Save stores the team and returns to the screen you came from."],
);
bar(
  470,
  "Character Builder",
  "VibeWars / Kestrel",
  null,
  [
    ["Ranger / Monk", INK],
    ["38/200", DIM],
    ["● unsaved", DIM],
  ],
  [
    ["Save", true],
    ["⋯", false],
  ],
  [
    "Same bar: crumbs and status left, Save then ⋯ right.",
    "(Its Close is not in #1902's scope; dropped here only to show the aligned shape. Say if it should stay.)",
  ],
);

text(20, 590, "THE ⋯ MENU (same place on both screens)", ACC, 13, "700");
/** @type {[string, string[]][]} */
const menus = [
  ["Team Builder ⋯", ["Share", "Duplicate", "Delete"]],
  ["Character Builder ⋯", ["Share", "Share as GW1 code", "Duplicate", "Delete"]],
];
menus.forEach(([title, items], i) => {
  const x0 = 20 + i * 330;
  text(x0, 620, title, INK, 13, "700");
  items.forEach((it, j) => {
    el("rect", { x: x0, y: 632 + j * 34, width: 200, height: 30, fill: "#21262d", stroke: LINE });
    text(x0 + 12, 652 + j * 34, it, it === "Delete" ? BAD : INK, 13);
  });
});

text(20, 820, "Edge cases", ACC, 13, "700");
[
  "Invalid team: Save is disabled, its tooltip gives the reason, you stay on the screen (the red chip lists the problems).",
  "Esc and the browser's back button leave exactly as today (unsaved-changes handling unchanged).",
  "Phone width: crumbs shrink to the place name; Save and ⋯ stay visible on the right.",
].forEach((s, i) => {
  text(20, 846 + 22 * i, `• ${s}`, DIM, 12);
});
out.push("</svg>");
writeFileSync(outFile, `${out.join("\n")}\n`);
