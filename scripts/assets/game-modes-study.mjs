// Draws a study of the game-mode title bar and the per-mode screens (#1522).
// It is a design reference for the operator's decision, not a game asset.
// Study, not decided.
//
//   node scripts/assets/game-modes-study.mjs
//
// Writes docs/art/game-modes-study.svg. Three variants, A, B and C, each at
// 1280 px wide (desktop only), each showing the same frames:
//
//   1. the title bar in three states: your own code, a friend's code being
//      typed, and being a guest in a friend's lobby
//   2. the five mode icons at 24 px and 32 px on the bar's background
//   3. Random Arena, with a character and with none
//   4. Team Arena (it stands for Heroes' Ascent and GvG), alone and with
//      three friends joined by code
//   5. Hosted Game
//
// Palette and type mirror docs/art/art-direction.md and apps/web/src/styles.css
// (monospace, `--accent` for what is chosen). The cards are #1449's pick B.
//
//   A: icons and code on one row, as the operator sketched.
//   B: icons with labels under them, the code at the right.
//   C: a mode rail on the left, the code in the title bar.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "game-modes-study.svg");

const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  accent: "#59c2ff",
  elite: "#d4a72c",
  ok: "#5fd08a",
};

/** Menu profession colours, art-direction.md "Professions". */
const PROF = {
  War: "#e3b341",
  Ran: "#8fd36b",
  Mon: "#9ecbff",
  Nec: "#3fb68b",
  Ele: "#ff6e5a",
  Par: "#f0883e",
};

const W = 1280;
const BODY_H = 400;
const LABEL_H = 30;
const FS = 13;
const CH = 7.8;
const RAIL_W = 76;

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
 * @param {{ fill?: string, stroke?: string, r?: number, dash?: boolean, sw?: number, op?: number }} [o]
 */
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${String(o.r ?? 3)}" fill="${o.fill ?? "none"}"` +
  (o.op === undefined ? "" : ` fill-opacity="${String(o.op)}"`) +
  `${o.stroke === undefined ? "" : ` stroke="${o.stroke}"`}${o.sw === undefined ? "" : ` stroke-width="${String(o.sw)}"`}${o.dash === true ? ' stroke-dasharray="4 3"' : ""}/>`;

/** @param {string} d @param {string} [c] @param {number} [w] */
const path = (d, c = C.ink, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** @param {number} x @param {number} y @param {string} s */
const dim = (x, y, s) => text(x, y, s, { fill: C.inkDim, size: FS - 1 });
/** @param {number} x @param {number} y @param {string} s */
const heading = (x, y, s) => text(x, y, s, { bold: true, size: FS + 2 });

/**
 * @param {number} x @param {number} cy @param {string} label
 * @param {{ primary?: boolean, h?: number, w?: number, dim?: boolean, on?: boolean }} [o]
 */
function button(x, cy, label, o = {}) {
  const h = o.h ?? 26;
  const w = o.w ?? label.length * CH + 22;
  const colour = o.primary === true || o.on === true ? C.accent : o.dim === true ? C.inkDim : C.ink;
  return {
    w,
    svg:
      rect(x, cy - h / 2, w, h, {
        fill: o.on === true ? C.accent : C.panel,
        op: o.on === true ? 0.14 : undefined,
        stroke: o.primary === true || o.on === true ? C.accent : C.line,
        dash: o.dim === true,
      }) + text(x + w / 2, cy + 4.5, label, { fill: colour, anchor: "middle" }),
  };
}

/** A small tag: HOST, GUEST. @param {number} x @param {number} y @param {string} s @param {string} [c] */
function tag(x, y, s, c = C.inkDim) {
  const w = s.length * 6.4 + 10;
  return {
    w,
    svg:
      rect(x, y, w, 15, { stroke: c, r: 3 }) +
      text(x + w / 2, y + 11, s, { size: 9.5, fill: c, anchor: "middle" }),
  };
}

/** A tick mark. @param {number} x @param {number} cy @param {string} [c] */
const tick = (x, cy, c = C.ok) =>
  path(`M${f(x)} ${f(cy)}L${f(x + 4)} ${f(cy + 4)}L${f(x + 11)} ${f(cy - 5)}`, c, 2);

/**
 * A profession disc.
 * @param {number} cx @param {number} cy @param {keyof typeof PROF} p @param {number} [r]
 */
const disc = (cx, cy, p, r = 7.5) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${PROF[p]}" stroke="#0b0f14" stroke-width="1.2"/>`;

/** @typedef {{ name: string, prof: keyof typeof PROF }} Char */
/** @type {readonly Char[]} */
const CHARS = [
  { name: "Bram", prof: "War" },
  { name: "Mira", prof: "Mon" },
  { name: "Ash", prof: "Ele" },
  { name: "Tove", prof: "Ran" },
];
/** @typedef {{ name: string, chars: readonly Char[] }} Build */
/** @type {readonly Build[]} */
const BUILDS = [
  {
    name: "Sunrise Vanguard",
    chars: [
      { name: "Bram", prof: "War" },
      { name: "Mira", prof: "Mon" },
      { name: "Ash", prof: "Ele" },
      { name: "Tove", prof: "Ran" },
    ],
  },
  {
    name: "Iron Wall",
    chars: [
      { name: "Gunn", prof: "War" },
      { name: "Hild", prof: "Par" },
      { name: "Orm", prof: "Mon" },
      { name: "Sif", prof: "Nec" },
    ],
  },
  {
    name: "Frozen Hunters",
    chars: [
      { name: "Lund", prof: "Ran" },
      { name: "Ysa", prof: "Ele" },
      { name: "Ketil", prof: "Mon" },
      { name: "Rask", prof: "War" },
    ],
  },
];
const [SUN, IRON, HUNT] = /** @type {[Build, Build, Build]} */ (BUILDS);

/** The discs of a build. @param {number} x @param {number} cy @param {Build} b */
const discs = (x, cy, b) => b.chars.map((c, i) => disc(x + 8 + i * 20, cy, c.prof, 7)).join("");

// ---------------------------------------------------------------------------
// The five mode icons: 24 px grid, one set per variant (line, tile, solid).
// ---------------------------------------------------------------------------

/**
 * `body` is the silhouette (stroked, or filled in the solid set), `inside` is
 * cut out of it in the solid set, `outer` is always a stroke.
 * @typedef {{ name: string, body: readonly string[], inside: readonly string[], outer: readonly string[] }} Glyph
 */
/** @type {Record<string, Glyph>} */
const GLYPHS = {
  random: {
    name: "Random Arena",
    body: ["M7 4H17A3 3 0 0 1 20 7V17A3 3 0 0 1 17 20H7A3 3 0 0 1 4 17V7A3 3 0 0 1 7 4Z"],
    inside: ["M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"],
    outer: [],
  },
  team: {
    name: "Team Arena",
    body: [
      "M3.5 19.5C3.5 15.5 6 14 9 14S14.5 15.5 14.5 19.5Z",
      "M9 5.5a2.7 2.7 0 1 1 0 5.4a2.7 2.7 0 1 1 0-5.4Z",
    ],
    inside: [],
    outer: ["M16.5 6.5a2.3 2.3 0 1 1 0 4.6", "M16.5 14.2C19.2 14.4 20.8 16 20.8 19.5H17.5"],
  },
  ascent: {
    name: "Heroes' Ascent",
    body: ["M2.5 21L10 8.5L14 15L16.5 11.5L21.5 21Z"],
    inside: [],
    outer: ["M10 8.5V2.8L15.5 4.8L10 6.8"],
  },
  gvg: {
    name: "GvG",
    body: ["M6 20.5V6H9V8.5H11V6H13V8.5H15V6H18V20.5Z"],
    inside: ["M10.4 20.5V16A1.6 1.6 0 0 1 13.6 16V20.5"],
    outer: ["M3 20.5H21"],
  },
  hosted: {
    name: "Hosted Game",
    body: ["M4 19L3.2 8L8.4 12.2L12 4.8L15.6 12.2L20.8 8L20 19Z"],
    inside: ["M7.5 15.8H16.5"],
    outer: [],
  },
};
const RAIL_NAME = /** @type {Record<string, string>} */ ({
  random: "Random",
  team: "Team",
  ascent: "Ascent",
  gvg: "GvG",
  hosted: "Hosted",
});
const MODES = /** @type {const} */ (["random", "team", "ascent", "gvg", "hosted"]);

/**
 * @param {string} id @param {number} x @param {number} y @param {number} size
 * @param {{ solid?: boolean, colour?: string, bg?: string, op?: number }} [o]
 */
function icon(id, x, y, size, o = {}) {
  const g = /** @type {Glyph} */ (GLYPHS[id]);
  const col = o.colour ?? C.ink;
  const sw = o.solid === true ? 1.4 : 1.8;
  const body = g.body
    .map((d) =>
      o.solid === true
        ? `<path d="${d}" fill="${col}" stroke="${col}" stroke-width="1.2" stroke-linejoin="round"/>`
        : path(d, col, sw),
    )
    .join("");
  const inside = g.inside
    .map((d) => path(d, o.solid === true ? (o.bg ?? C.panel) : col, 2.2))
    .join("");
  const outer = g.outer.map((d) => path(d, col, sw)).join("");
  return `<g transform="translate(${f(x)},${f(y)}) scale(${f(size / 24)})" opacity="${String(o.op ?? 1)}">${body}${inside}${outer}</g>`;
}

// ---------------------------------------------------------------------------
// The title bar.
// ---------------------------------------------------------------------------

/** @param {number} right @param {number} cy */
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
  ];
  let x = right;
  let svg = "";
  for (const g of [...glyphs].reverse()) {
    x -= 26;
    svg += rect(x, cy - 13, 26, 26, { stroke: C.line }) + g(x);
    x -= 6;
  }
  return svg;
}

/** @typedef {"own" | "typing" | "guest"} CodeState */
const OWN = "ABC-DEF";
const THEIRS = "QRT-9ZP";

/**
 * The Lobby Code field and its button, left edge at `x`.
 * @param {number} x @param {number} cy @param {CodeState} state @param {boolean} label
 */
function codeBlock(x, cy, state, label) {
  let svg = "";
  let cx = x;
  if (label) {
    svg += text(cx, cy + 4.5, "Lobby Code:", { fill: C.inkDim });
    cx += 11 * CH + 12;
  }
  const shown = state === "own" ? OWN : THEIRS;
  svg += rect(cx, cy - 13, 100, 26, {
    fill: C.bg,
    stroke: state === "typing" ? C.accent : state === "guest" ? C.elite : C.line,
    sw: state === "own" ? 1 : 2,
  });
  svg += text(cx + 10, cy + 5, shown, {
    bold: true,
    size: FS + 1,
    fill: state === "own" ? C.ink : state === "guest" ? C.elite : C.accent,
  });
  if (state === "typing")
    svg += `<path d="M${f(cx + 10 + 7 * 8.4)} ${f(cy - 8)}V${f(cy + 8)}" stroke="${C.accent}" stroke-width="1.5"/>`;
  cx += 108;
  if (state === "own") {
    svg += button(cx, cy, "Copy").svg;
  } else if (state === "typing") {
    const b = button(cx, cy, "Join", { primary: true, on: true });
    svg += b.svg;
  } else {
    svg += tag(cx, cy - 8, "GUEST", C.elite).svg;
    svg += button(cx + 56, cy, `Leave → ${OWN}`, { primary: true }).svg;
  }
  return svg;
}

/** @typedef {"A" | "B" | "C"} Variant */
const BAR_H = /** @type {Record<Variant, number>} */ ({ A: 44, B: 66, C: 44 });

/**
 * The bar of one variant. `active` is the mode in play, `locked` greys the
 * icons a guest may not use. `tip` shows the hover name of the active icon.
 * @param {Variant} v @param {CodeState} state @param {string} active @param {boolean} tip
 */
function titleBar(v, state, active, tip) {
  const h = BAR_H[v];
  const cy = h / 2;
  const locked = state === "guest";
  let svg =
    rect(0, 0, W, h, { fill: C.panel, r: 0 }) +
    `<path d="M0 ${String(h)}H${String(W)}" stroke="${C.line}"/>` +
    text(16, cy + 4.5, "VibeWars", { bold: true, size: FS + 1 });
  let tipSvg = "";
  if (v === "A") {
    MODES.forEach((m, i) => {
      const x = 130 + i * 38;
      const on = m === active;
      svg +=
        rect(x, cy - 16, 34, 32, {
          stroke: on ? C.accent : C.line,
          fill: on ? C.accent : C.panel,
          op: on ? 0.14 : undefined,
        }) +
        icon(m, x + 5, cy - 11, 24, {
          colour: on ? C.accent : C.ink,
          op: locked && !on ? 0.35 : 1,
        });
      if (on)
        svg += `<path d="M${f(x)} ${f(h - 1)}H${f(x + 34)}" stroke="${C.accent}" stroke-width="3"/>`;
      if (on && tip) {
        const name = /** @type {Glyph} */ (GLYPHS[m]).name;
        const w = name.length * CH + 16;
        tipSvg +=
          rect(x + 17 - w / 2, h + 6, w, 22, { fill: C.bg, stroke: C.line }) +
          text(x + 17, h + 21, name, { anchor: "middle", size: FS - 1 });
      }
    });
    svg += codeBlock(130 + 5 * 38 + 24, cy, state, true);
  } else if (v === "B") {
    MODES.forEach((m, i) => {
      const x = 130 + i * 92;
      const on = m === active;
      svg +=
        rect(x, 5, 86, h - 10, {
          stroke: on ? C.accent : C.line,
          fill: on ? C.accent : C.panel,
          op: on ? 0.14 : undefined,
        }) +
        icon(m, x + 31, 9, 24, { colour: on ? C.accent : C.ink, op: locked && !on ? 0.35 : 1 }) +
        text(x + 43, h - 12, /** @type {Glyph} */ (GLYPHS[m]).name, {
          size: 10,
          anchor: "middle",
          fill: on ? C.accent : C.inkDim,
        });
      if (on)
        svg += `<path d="M${f(x)} ${f(h - 1)}H${f(x + 86)}" stroke="${C.accent}" stroke-width="3"/>`;
    });
    svg += codeBlock(770, cy, state, true);
  } else {
    svg += codeBlock(130, cy, state, true);
  }
  return { h, svg: svg + globals(W - 12, cy) + tipSvg };
}

/**
 * The mode rail of C, as tall as the body.
 * @param {string} active @param {boolean} locked @param {boolean} tip
 */
function rail(active, locked, tip) {
  let svg =
    rect(0, 0, RAIL_W, BODY_H, { fill: C.panel, r: 0 }) +
    `<path d="M${String(RAIL_W)} 0V${String(BODY_H)}" stroke="${C.line}"/>`;
  let tipSvg = "";
  MODES.forEach((m, i) => {
    const y = 14 + i * 58;
    const on = m === active;
    svg +=
      rect(10, y, 56, 50, {
        stroke: on ? C.accent : C.line,
        fill: on ? C.accent : "none",
        op: on ? 0.14 : undefined,
      }) +
      icon(m, 22, y + 5, 32, {
        solid: true,
        colour: on ? C.accent : C.ink,
        bg: C.panel,
        op: locked && !on ? 0.35 : 1,
      }) +
      text(38, y + 46, RAIL_NAME[m] ?? "", {
        size: 9,
        anchor: "middle",
        fill: on ? C.accent : C.inkDim,
      });
    if (on)
      svg += `<path d="M${f(RAIL_W - 1)} ${f(y)}V${f(y + 50)}" stroke="${C.accent}" stroke-width="3"/>`;
    if (on && tip) {
      const name = /** @type {Glyph} */ (GLYPHS[m]).name;
      const w = name.length * CH + 16;
      tipSvg +=
        rect(RAIL_W + 6, y + 14, w, 22, { fill: C.bg, stroke: C.line }) +
        text(RAIL_W + 14, y + 29, name, { size: FS - 1 });
    }
  });
  return svg + tipSvg;
}

/**
 * One frame: the bar, the rail of C, and the body, with a label above it.
 * @param {number} y @param {string} label @param {Variant} v @param {CodeState} state
 * @param {string} active @param {(w: number) => string} body @param {boolean} [tip]
 */
function frame(y, label, v, state, active, body, tip = false) {
  const bar = titleBar(v, state, active, tip);
  const railW = v === "C" ? RAIL_W : 0;
  const h = bar.h + BODY_H;
  const svg =
    text(20, y + 20, label, { bold: true }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, h, { fill: C.bg, stroke: C.line, r: 0 }) +
    `<g transform="translate(0,${String(bar.h)})">${v === "C" ? rail(active, state === "guest", tip) : ""}` +
    `<g transform="translate(${String(railW)},0)">${body(W - railW)}</g></g>` +
    bar.svg +
    `</g>`;
  return { svg, h: LABEL_H + h + 14 };
}

// ---------------------------------------------------------------------------
// Frame 1 and 2: the bar's states and the icon strips.
// ---------------------------------------------------------------------------

/** @param {number} y @param {Variant} v */
function barStates(y, v) {
  /** @type {readonly [CodeState, string, boolean][]} */
  const states = [
    ["own", "a. your own code, with Copy (hover shows a mode's name)", true],
    ["typing", "b. a friend's code being typed: Join is lit", false],
    ["guest", "c. a guest in a friend's lobby: their code, and the way back to your own", false],
  ];
  const slot = BAR_H[v] + 56;
  const h = states.length * slot + 40;
  let svg =
    text(20, y + 20, "1. Title bar, three states", { bold: true }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, h, { fill: C.bg, stroke: C.line, r: 0 });
  states.forEach(([state, note, tip], i) => {
    const sy = 14 + i * slot;
    svg += dim(8, sy + 6, note);
    svg += `<g transform="translate(0,${f(sy + 14)})">${titleBar(v, state, "team", tip).svg}</g>`;
  });
  svg += `</g>`;
  return { svg, h: LABEL_H + h + 14 };
}

/** @param {number} y @param {Variant} v */
function iconStrip(y, v) {
  const solid = v === "C";
  const h = 190;
  let svg =
    text(20, y + 20, "2. The five mode icons at 24 px and 32 px, on the title bar's background", {
      bold: true,
    }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, h, { fill: C.bg, stroke: C.line, r: 0 });
  svg += rect(0, 0, W, 130, { fill: C.panel, r: 0 });
  MODES.forEach((m, i) => {
    const x = 40 + i * 240;
    const name = /** @type {Glyph} */ (GLYPHS[m]).name;
    svg += icon(m, x, 20, 24, { solid, colour: C.ink });
    svg += icon(m, x + 44, 14, 32, { solid, colour: C.ink });
    svg += icon(m, x + 100, 14, 32, { solid, colour: C.accent });
    svg += text(x, 84, name, { bold: true, size: FS - 1 });
    svg += dim(x, 102, "24 · 32 · active");
  });
  svg += dim(
    20,
    154,
    v === "A"
      ? "Line icons, 1.8 px strokes, in a 34 px button."
      : v === "B"
        ? "The same line glyphs, with the name under them in the bar."
        : "Solid glyphs, so they hold up in the narrow rail.",
  );
  svg += dim(
    20,
    174,
    "Placeholder art for the study. Hover names the mode; the legend above does too. The final set is drawn on the implementation card.",
  );
  svg += `</g>`;
  return { svg, h: LABEL_H + h + 14 };
}

// ---------------------------------------------------------------------------
// Screens.
// ---------------------------------------------------------------------------

/**
 * Random Arena: character cards, the picked one marked, one way to queue.
 * @param {Variant} v @param {boolean} has
 * @returns {(w: number) => string}
 */
const randomArena = (v, has) => (w) => {
  let svg = heading(24, 34, "Random Arena");
  svg += dim(24, 54, "Pick a character, then queue: random allies and foes from the server.");
  if (!has) {
    svg += rect(24, 80, 360, 150, { fill: C.panel, stroke: C.line, dash: true });
    svg += text(204, 140, "No characters yet", { bold: true, anchor: "middle" });
    svg += dim(110, 166, "Make one to play.");
    svg += button(124, 200, "Create a character", { primary: true }).svg;
    svg += button(w - 230, 372, "Find a match", { dim: true, w: 206, h: 32 }).svg;
    svg += dim(w - 230, 396, "Pick a character first.");
    return svg;
  }
  const cardW = 190;
  const cols = v === "C" ? 2 : 4;
  CHARS.forEach((c, i) => {
    const x = 24 + (i % cols) * (cardW + 14);
    const y = 80 + Math.floor(i / cols) * 150;
    const on = i === 0;
    svg += rect(x, y, cardW, 136, {
      fill: C.panel,
      stroke: on ? C.accent : C.line,
      sw: on ? 2 : 1,
    });
    svg += disc(x + cardW / 2, y + 44, c.prof, 24);
    svg += text(x + cardW / 2, y + 96, c.name, { bold: true, anchor: "middle" });
    svg += text(x + cardW / 2, y + 114, `${c.prof} / ${CHARS[(i + 1) % 4]?.prof ?? ""}`, {
      size: FS - 2,
      fill: C.inkDim,
      anchor: "middle",
    });
    if (on) svg += tick(x + 12, y + 16, C.accent);
  });
  if (v === "B") {
    svg += rect(w - 330, 80, 306, 190, { fill: C.panel, stroke: C.line });
    svg += heading(w - 314, 108, "Queue");
    svg += disc(w - 302, 134, "War", 9) + text(w - 284, 139, "Bram, Warrior / Monk");
    svg += dim(w - 314, 168, "4 v 4, random teammates");
    svg += button(w - 314, 232, "Find a match", { primary: true, w: 274, h: 32 }).svg;
  } else {
    svg += button(w - 230, 372, "Find a match", { primary: true, w: 206, h: 32 }).svg;
  }
  return svg;
};

/**
 * Members of your team lobby: who joined by code, the open seats.
 * @param {number} x @param {number} y @param {number} w @param {number} friends
 */
function members(x, y, w, friends) {
  let svg = heading(x, y + 14, "Your team") + dim(x + 100, y + 14, `lobby ${OWN}`);
  const names = ["Aria", "Brann", "Cass", "Dax"];
  names.forEach((n, i) => {
    const cy = y + 42 + i * 28;
    if (i <= friends) {
      svg += rect(x, cy - 12, w, 24, { fill: C.panel, stroke: C.line });
      svg +=
        text(x + 10, cy + 4.5, n) +
        (i === 0
          ? tag(x + 14 + n.length * CH, cy - 8, "HOST").svg
          : tag(x + 14 + n.length * CH, cy - 8, "BY CODE").svg);
      svg += tick(x + w - 22, cy, C.ok);
    } else {
      svg += rect(x, cy - 12, w, 24, { stroke: C.line, dash: true });
      svg += dim(x + 10, cy + 4, fitText(`open seat · share ${OWN}`, w - 20));
    }
  });
  return svg;
}

/** @param {string} s @param {number} w */
const fitText = (s, w) =>
  s.length * CH > w ? `${s.slice(0, Math.max(1, Math.floor(w / CH) - 1))}…` : s;

/**
 * The Team Lobby of #1460, compact: proposals with votes, then the claimed slots.
 * @param {number} x @param {number} y @param {number} w @param {number} friends
 */
function teamLobby(x, y, w, friends) {
  let svg =
    heading(x, y + 14, "Team Lobby") +
    dim(
      x + 112,
      y + 14,
      friends === 0 ? "alone: your proposal is the build" : "propose, vote, claim · 0:34",
    );
  /** @type {readonly { by: string, b: Build, votes: number }[]} */
  const ps =
    friends === 0
      ? [{ by: "Aria", b: SUN, votes: 1 }]
      : [
          { by: "Aria", b: SUN, votes: 2 },
          { by: "Brann", b: IRON, votes: 1 },
          { by: "Cass", b: HUNT, votes: 1 },
        ];
  ps.forEach((p, i) => {
    const cy = y + 42 + i * 34;
    const win = i === 0;
    svg += rect(x, cy - 15, w, 30, {
      fill: C.panel,
      stroke: win ? C.accent : C.line,
      sw: win ? 2 : 1,
    });
    svg += text(x + 10, cy + 4.5, fitText(p.b.name, 170), { bold: true }) + discs(x + 190, cy, p.b);
    svg += dim(x + 290, cy + 4, p.by);
    svg += text(x + w - 14, cy + 6, String(p.votes), {
      bold: true,
      size: 16,
      anchor: "end",
      fill: win ? C.accent : C.ink,
    });
  });
  const sy = y + 42 + ps.length * 34 + 10;
  svg += dim(x, sy, "Seats of Sunrise Vanguard");
  SUN.chars.forEach((c, i) => {
    const sx = x + i * Math.floor(w / 4);
    const sw = Math.floor(w / 4) - 8;
    const taken = friends > 0 ? ["Aria", "Brann", "Cass", "Dax"][i] : i === 0 ? "You" : undefined;
    svg += rect(sx, sy + 8, sw, 38, {
      fill: C.panel,
      stroke: taken === undefined ? C.line : C.accent,
      dash: taken === undefined,
    });
    svg +=
      disc(sx + 14, sy + 27, c.prof, 7) +
      text(sx + 28, sy + 24, fitText(c.name, sw - 34), { size: FS - 1 });
    svg += text(sx + 28, sy + 39, fitText(taken ?? "open", sw - 34), {
      size: 10,
      fill: taken === undefined ? C.inkDim : C.accent,
    });
  });
  return svg;
}

/**
 * The Team Builder: Team Build cards, New and Edit.
 * @param {number} x @param {number} y @param {number} w @param {boolean} row
 */
function builder(x, y, w, row) {
  let svg = heading(x, y + 14, "Team Builder");
  svg += button(x + w - 130, y + 10, "New").svg + button(x + w - 76, y + 10, "Edit").svg;
  BUILDS.forEach((b, i) => {
    const on = i === 0;
    if (row) {
      const cw = Math.floor((w - 24) / 3);
      const cx = x + i * (cw + 12);
      svg += rect(cx, y + 34, cw, 52, {
        fill: C.panel,
        stroke: on ? C.accent : C.line,
        sw: on ? 2 : 1,
      });
      svg +=
        text(cx + 10, y + 56, fitText(b.name, cw - 20), { bold: true }) + discs(cx + 10, y + 72, b);
    } else {
      const cy = y + 54 + i * 50;
      svg += rect(x, cy - 22, w, 44, {
        fill: C.panel,
        stroke: on ? C.accent : C.line,
        sw: on ? 2 : 1,
      });
      svg +=
        text(x + 10, cy - 3, fitText(b.name, w - 20), { bold: true }) + discs(x + 10, cy + 12, b);
    }
  });
  return svg;
}

/**
 * The action that sends the team into matchmaking.
 * @param {number} x @param {number} y @param {number} friends
 */
function matchAction(x, y, friends) {
  const b = button(
    x,
    y,
    friends === 0 ? "Find a match · bots fill 3 seats" : "Find a match · 4 of 4 ready",
    { primary: true, w: 290, h: 34 },
  );
  return b.svg;
}

/**
 * Team Arena; Heroes' Ascent and GvG open the same screen.
 * @param {Variant} v @param {number} friends
 * @returns {(w: number) => string}
 */
const teamArena = (v, friends) => (w) => {
  let svg = "";
  const note =
    "Heroes' Ascent and GvG open this screen too: the side size and the goal line (relic and altars, guild banner) change, nothing else.";
  if (v === "A") {
    const lw = w - 380;
    svg += members(24, 8, 300, friends);
    svg += teamLobby(350, 8, lw - 330, friends);
    svg += builder(w - 330, 8, 306, false);
    svg += matchAction(w - 330, 330, friends);
    svg += dim(24, 392, note);
  } else if (v === "B") {
    svg +=
      rect(24, 8, 150, 28, { fill: C.panel, stroke: C.accent, sw: 2 }) +
      text(99, 27, "Team Lobby", { anchor: "middle", bold: true, fill: C.accent });
    svg +=
      rect(180, 8, 150, 28, { stroke: C.line }) +
      text(255, 27, "Team Builder", { anchor: "middle", fill: C.inkDim }) +
      dim(344, 27, "Sunrise Vanguard, 3 builds");
    svg += members(24, 48, 340, friends);
    svg += teamLobby(400, 48, w - 424, friends);
    svg += matchAction(w - 314, 340, friends);
    svg += dim(24, 392, note);
  } else {
    svg += members(24, 8, 300, friends);
    svg += teamLobby(350, 8, w - 374, friends);
    svg += builder(24, 232, w - 48, true);
    svg += matchAction(w - 600, 244, friends);
    svg += dim(24, 392, note);
  }
  return svg;
};

/** Hosted Game: today's lobby, both teams. @param {number} w */
const hostedGame = (w) => {
  let svg = heading(24, 34, `Hosted Game · lobby ${OWN}`);
  svg += dim(
    24,
    54,
    "Pick a side. The host sets how many bots fill each side. Everyone Ready starts the match.",
  );
  const half = Math.floor((w - 72) / 2);
  /** @type {readonly { side: string, players: readonly { n: string, host?: boolean, ready: boolean }[], bots: number }[]} */
  const sides = [
    {
      side: "Blue",
      players: [
        { n: "Aria", host: true, ready: true },
        { n: "Brann", ready: true },
        { n: "Cass", ready: false },
      ],
      bots: 1,
    },
    { side: "Red", players: [{ n: "Eli", ready: true }], bots: 3 },
  ];
  sides.forEach((s, i) => {
    const x = 24 + i * (half + 24);
    svg += rect(x, 76, half, 250, { fill: C.panel, stroke: C.line });
    svg += text(x + 16, 102, `${s.side} side`, { bold: true, size: FS + 1 });
    svg += dim(x + 16, 122, "Bots on this side");
    svg +=
      button(x + half - 130, 118, "−", { w: 28 }).svg +
      text(x + half - 82, 123, String(s.bots), { bold: true, anchor: "middle" }) +
      button(x + half - 64, 118, "+", { w: 28 }).svg;
    s.players.forEach((p, j) => {
      const cy = 156 + j * 34;
      svg +=
        text(x + 16, cy + 4.5, p.n) +
        (p.host === true ? tag(x + 20 + p.n.length * CH, cy - 8, "HOST").svg : "");
      svg += p.ready
        ? tick(x + half - 24, cy)
        : text(x + half - 16, cy + 4.5, "…", { fill: C.inkDim, anchor: "end" });
    });
  });
  svg += button(24, 358, "Switch side").svg;
  svg += button(w - 124, 358, "READY", { primary: true, w: 100, h: 30 }).svg;
  svg += dim(
    24,
    392,
    "Unchanged from today, but the title bar now carries the code, so the lobby heading drops its own Copy button.",
  );
  return svg;
};

// ---------------------------------------------------------------------------
// The answers, per variant, and the page.
// ---------------------------------------------------------------------------

/** @type {Record<Variant, readonly string[]>} */
const ANSWERS = {
  A: [
    "Who picks the mode: the host only. A guest's icons are dimmed and locked; the active one shows what the host chose.",
    "Joining someone else's lobby: your own lobby closes. The friends in it fall back to their own lobbies, and Leave takes you back to yours.",
    "Team Builder: a side pane at the right of the Team Lobby, both always in view.",
  ],
  B: [
    "Who picks the mode: anyone in the lobby. The last click wins and the lobby shows who switched it, so a party can not be locked out by an idle host.",
    "Joining someone else's lobby: your own lobby stays open with its friends, run by nobody until you come back; Leave returns you to it.",
    "Team Builder: a tab beside the Team Lobby, so each gets the full width; the tab shows the lit build's name.",
  ],
  C: [
    "Who picks the mode: the host only. A guest sees the rail lit on the host's mode and dimmed, and can look but not click.",
    "Joining someone else's lobby: your whole party goes with you, as a party does in the games this is copied from. Leave brings it back to your code.",
    "Team Builder: below the Team Lobby, a strip of build cards that scrolls down the page.",
  ],
};

/** @param {number} y @param {Variant} v */
function answers(y, v) {
  const lines = ANSWERS[v];
  const h = 30 + lines.length * 26;
  let svg =
    text(20, y + 20, "What this variant answers", { bold: true }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, h, { fill: C.panel, stroke: C.line, r: 0 });
  lines.forEach((l, i) => {
    svg += text(16, 26 + i * 26, `${String(i + 1)}. ${l}`, { size: FS - 1 });
  });
  svg += `</g>`;
  return { svg, h: LABEL_H + h + 14 };
}

/** @type {readonly [Variant, string][]} */
const VARIANTS = [
  ["A", "A: icons and code on one row"],
  ["B", "B: labelled icons, the code at the right"],
  ["C", "C: a mode rail on the left"],
];

let y = 20;
let svg = "";
for (const [v, name] of VARIANTS) {
  svg += text(20, y + 16, name, { bold: true, size: 18 });
  y += 30;
  /** @type {readonly { svg: string, h: number }[]} */
  const parts = [barStates(y, v)];
  let cur = y + /** @type {{ h: number }} */ (parts[0]).h;
  /** @type {{ svg: string, h: number }[]} */
  const rest = [iconStrip(cur, v)];
  cur += /** @type {{ h: number }} */ (rest[0]).h;
  /** @type {readonly [string, string, Parameters<typeof frame>[5]][]} */
  const screens = [
    ["3a. Random Arena, a character picked", "random", randomArena(v, true)],
    ["3b. Random Arena, no character yet", "random", randomArena(v, false)],
    ["4a. Team Arena, alone", "team", teamArena(v, 0)],
    ["4b. Team Arena, three friends joined by code", "team", teamArena(v, 3)],
    ["5. Hosted Game, both teams", "hosted", hostedGame],
  ];
  for (const [label, mode, body] of screens) {
    const fr = frame(cur, label, v, "own", mode, body);
    rest.push(fr);
    cur += fr.h;
  }
  const ans = answers(cur, v);
  rest.push(ans);
  cur += ans.h;
  for (const p of [...parts, ...rest]) svg += p.svg;
  y = cur + 40;
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
