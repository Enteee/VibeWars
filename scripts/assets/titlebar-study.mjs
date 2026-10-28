// Draws a study of the title bar when it carries every menu screen's title and
// controls (#1251). It is a design reference for that decision, not a game
// asset. Study, not decided.
//
//   node scripts/assets/titlebar-study.mjs
//
// Writes docs/art/titlebar-study.svg. Three variants, A, B and C, each showing
// the same five screens (main menu, Options, Music, Team and character, the
// build editor) at 1280 px wide, then the same five at 390 px (a phone).
// Palette and type mirror docs/art/art-direction.md and apps/web/src/styles.css
// (monospace, `--accent` for the way back, `--ink-dim` for what is not here).
//
//   A: a plain breadcrumb, a Back button after it, the screen's buttons right.
//   B: breadcrumb segments are chips; clicking a parent is Back; no Back button.
//   C: a slim bar for place and global buttons, a context dock under it.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "titlebar-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  panel: "#161b22",
  dock: "#1c232d",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  accent: "#59c2ff",
  elite: "#d4a72c",
};

const DESK = 1280;
const PHONE = 390;
const SHEET_W = 5 * PHONE + 4 * 20 + 40;
const FS = 13;
/** Width of a monospace character at the study's type size. */
const CH = 7.8;

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
 * @param {{ fill?: string, stroke?: string, r?: number, dash?: boolean }} [o]
 */
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${String(o.r ?? 3)}" fill="${o.fill ?? "none"}"` +
  `${o.stroke === undefined ? "" : ` stroke="${o.stroke}"`}${o.dash === true ? ' stroke-dasharray="4 3"' : ""}/>`;

/** @param {string} d @param {string} [c] @param {number} [w] */
const path = (d, c = C.ink, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * A button: bordered, a label; `primary` in accent. Returns its svg and width.
 * @param {number} x @param {number} cy centre line @param {string} label
 * @param {{ primary?: boolean, ghost?: boolean, h?: number }} [o]
 */
function button(x, cy, label, o = {}) {
  const h = o.h ?? 26;
  const w = label.length * CH + 22;
  const colour = o.primary === true ? C.accent : C.ink;
  return {
    w,
    svg:
      rect(x, cy - h / 2, w, h, {
        fill: o.ghost === true ? "none" : C.panel,
        stroke: o.primary === true ? C.accent : C.line,
      }) + text(x + w / 2, cy + 4.5, label, { fill: colour, anchor: "middle" }),
  };
}

/** The glyphs of the bar's global buttons, in a 26 px square at (x, cy). */
const ICONS = {
  options: (/** @type {number} */ x, /** @type {number} */ cy) =>
    `<circle cx="${f(x + 13)}" cy="${f(cy)}" r="3.4" fill="none" stroke="${C.ink}" stroke-width="1.6"/>` +
    path(
      `M${f(x + 13)} ${f(cy - 8)}V${f(cy - 5.6)}M${f(x + 13)} ${f(cy + 5.6)}V${f(cy + 8)}M${f(x + 5)} ${f(cy)}H${f(x + 7.4)}M${f(x + 18.6)} ${f(cy)}H${f(x + 21)}`,
    ),
  music: (/** @type {number} */ x, /** @type {number} */ cy) =>
    path(`M${f(x + 9)} ${f(cy + 4)}V${f(cy - 7)}L${f(x + 18)} ${f(cy - 9)}V${f(cy + 2)}`) +
    `<ellipse cx="${f(x + 7.6)}" cy="${f(cy + 5)}" rx="2.6" ry="2" fill="${C.ink}"/>` +
    `<ellipse cx="${f(x + 16.6)}" cy="${f(cy + 3)}" rx="2.6" ry="2" fill="${C.ink}"/>`,
  mute: (/** @type {number} */ x, /** @type {number} */ cy) =>
    path(
      `M${f(x + 6)} ${f(cy - 3)}H${f(x + 9.5)}L${f(x + 14)} ${f(cy - 7)}V${f(cy + 7)}L${f(x + 9.5)} ${f(cy + 3)}H${f(x + 6)}Z`,
    ) + path(`M${f(x + 17)} ${f(cy - 3.5)}Q${f(x + 20)} ${f(cy)} ${f(x + 17)} ${f(cy + 3.5)}`),
  fullscreen: (/** @type {number} */ x, /** @type {number} */ cy) =>
    path(
      `M${f(x + 6)} ${f(cy - 3)}V${f(cy - 7)}H${f(x + 10)}M${f(x + 16)} ${f(cy - 7)}H${f(x + 20)}V${f(cy - 3)}M${f(x + 20)} ${f(cy + 3)}V${f(cy + 7)}H${f(x + 16)}M${f(x + 10)} ${f(cy + 7)}H${f(x + 6)}V${f(cy + 3)}`,
    ),
  more: (/** @type {number} */ x, /** @type {number} */ cy) =>
    [7, 13, 19]
      .map((dx) => `<circle cx="${f(x + dx)}" cy="${f(cy)}" r="1.7" fill="${C.ink}"/>`)
      .join(""),
};

/** @typedef {"options" | "music" | "mute" | "fullscreen" | "more"} IconId */

/**
 * One 26 px square icon button.
 * @param {number} x @param {number} cy @param {IconId} id
 */
const iconButton = (x, cy, id) =>
  rect(x, cy - 13, 26, 26, { stroke: C.line, fill: "none" }) + ICONS[id](x, cy);

/**
 * The global buttons laid out right to left from `right`; the screen's own
 * place (Options, Music) is not offered on itself.
 * @param {number} right @param {number} cy @param {readonly IconId[]} ids
 * @returns {{ svg: string, left: number }}
 */
function globals(right, cy, ids) {
  let x = right;
  let svg = "";
  for (const id of [...ids].reverse()) {
    x -= 26;
    svg += iconButton(x, cy, id);
    x -= 6;
  }
  return { svg, left: x + 6 };
}

/**
 * What each screen asks of the bar.
 * @typedef {{
 *   crumbs: readonly string[],
 *   actions: readonly { label: string, primary?: boolean }[],
 *   status?: string,
 *   edit?: string,
 *   hide: readonly IconId[],
 *   dock: readonly { label: string, primary?: boolean }[],
 * }} Screen
 */
/** @type {Record<string, Screen>} */
const SCREENS = {
  menu: {
    crumbs: ["VibeWars"],
    actions: [],
    hide: [],
    dock: [{ label: "New character" }, { label: "Host a lobby", primary: true }],
  },
  options: { crumbs: ["VibeWars", "Options"], actions: [], hide: ["options"], dock: [] },
  music: {
    crumbs: ["VibeWars", "Music"],
    actions: [{ label: "Sound settings" }],
    hide: ["music"],
    dock: [{ label: "Sound settings" }],
  },
  team: {
    crumbs: ["VibeWars", "Team"],
    actions: [{ label: "New team", primary: true }],
    hide: [],
    dock: [{ label: "New team", primary: true }, { label: "Edit character" }],
  },
  editor: {
    crumbs: ["VibeWars", "Team", "Aria"],
    actions: [{ label: "Save", primary: true }, { label: "Share" }],
    status: "8 of 8 skills · unsaved",
    edit: "Aria",
    hide: [],
    dock: [{ label: "Save", primary: true }, { label: "Share" }, { label: "Duplicate" }],
  },
};
const ORDER = /** @type {const} */ (["menu", "options", "music", "team", "editor"]);
const NAMES = {
  menu: "Main menu",
  options: "Options",
  music: "Music",
  team: "Team and character",
  editor: "Build editor",
};
/** @type {readonly IconId[]} */
const GLOBAL_IDS = ["options", "music", "mute", "fullscreen"];

// ---------------------------------------------------------------------------
// The bar, per variant, desktop and phone. Each returns { svg, h }.
// ---------------------------------------------------------------------------

/**
 * A breadcrumb in plain text: parents in accent, the place in ink.
 * @param {number} x @param {number} cy @param {readonly string[]} crumbs
 * @param {string | undefined} edit a name field in place of the last crumb
 * @returns {{ svg: string, w: number }}
 */
function plainCrumbs(x, cy, crumbs, edit) {
  let svg = "";
  let cx = x;
  crumbs.forEach((c, i) => {
    const last = i === crumbs.length - 1;
    if (last && edit !== undefined) {
      const w = c.length * CH + 34;
      svg += rect(cx, cy - 13, w, 26, { stroke: C.line, fill: C.bg });
      svg += text(cx + 9, cy + 4.5, c, { fill: C.ink });
      cx += w;
      return;
    }
    const brand = i === 0;
    svg += text(cx, cy + 4.5, c, {
      fill: last ? C.ink : C.accent,
      bold: brand || last,
      size: brand ? FS + 1 : FS,
    });
    cx += c.length * CH + (brand ? 6 : 0);
    if (!last) {
      svg += text(cx + 9, cy + 4.5, ">", { fill: C.inkDim });
      cx += 26;
    }
  });
  return { svg, w: cx - x };
}

/**
 * Crumbs as chips: a parent is a bordered link, the place a filled chip.
 * @param {number} x @param {number} cy @param {readonly string[]} crumbs
 * @param {string | undefined} edit
 * @returns {{ svg: string, w: number }}
 */
function chipCrumbs(x, cy, crumbs, edit) {
  let svg = "";
  let cx = x;
  crumbs.forEach((c, i) => {
    const last = i === crumbs.length - 1;
    const w = c.length * CH + (last && edit !== undefined ? 34 : 22);
    svg += rect(cx, cy - 13, w, 26, {
      r: 13,
      fill: last ? C.bg : "none",
      stroke: last ? C.ink : C.accent,
    });
    svg += text(cx + (last && edit !== undefined ? 12 : w / 2), cy + 4.5, c, {
      fill: last ? C.ink : C.accent,
      anchor: last && edit !== undefined ? "start" : "middle",
      bold: last,
    });
    cx += w;
    if (!last) {
      svg += path(
        `M${f(cx + 3)} ${f(cy - 4)}L${f(cx + 8)} ${f(cy)}L${f(cx + 3)} ${f(cy + 4)}`,
        C.inkDim,
      );
      cx += 11;
    }
  });
  return { svg, w: cx - x };
}

/**
 * The screen's own buttons, right to left from `right`.
 * @param {number} right @param {number} cy @param {Screen["actions"]} actions
 * @returns {{ svg: string, left: number }}
 */
function actionsRight(right, cy, actions) {
  let x = right;
  let svg = "";
  for (const a of [...actions].reverse()) {
    const b = button(0, cy, a.label, { primary: a.primary === true });
    x -= b.w;
    svg += `<g transform="translate(${f(x)},0)">${b.svg}</g>`;
    x -= 8;
  }
  return { svg, left: x + 8 };
}

/** @param {number} x @param {number} h */
const divider = (x, h, top = 0) =>
  `<path d="M${f(x)} ${f(top + h / 2 - 11)}V${f(top + h / 2 + 11)}" stroke="${C.line}" stroke-width="1"/>`;

/**
 * @param {"A" | "B" | "C"} v @param {keyof typeof SCREENS} id @param {number} w
 * @returns {{ svg: string, h: number }}
 */
function desktopBar(v, id, w) {
  const s = /** @type {Screen} */ (SCREENS[id]);
  const ids = GLOBAL_IDS.filter((g) => !s.hide.includes(g));
  const isHome = s.crumbs.length === 1;
  if (v === "C") {
    const top = 34;
    const cy = top / 2;
    const g = globals(w - 12, cy, ids);
    const crumbs = plainCrumbs(16, cy, s.crumbs, undefined);
    let svg = rect(0, 0, w, top, { fill: C.panel, r: 0 }) + crumbs.svg + g.svg;
    if (s.status !== undefined) {
      svg += text(crumbs.w + 40, cy + 4.5, s.status, { fill: C.inkDim });
    }
    const dh = 46;
    const dcy = top + dh / 2;
    svg += rect(0, top, w, dh, { fill: C.dock, r: 0 });
    svg += `<path d="M0 ${String(top)}H${String(w)}M0 ${String(top + dh)}H${String(w)}" stroke="${C.line}"/>`;
    let x = 16;
    if (!isHome) {
      const b = button(x, dcy, "← Back");
      svg += b.svg;
      x += b.w + 14;
    }
    if (s.edit !== undefined) {
      svg += rect(x, dcy - 13, s.edit.length * CH + 34, 26, { stroke: C.line, fill: C.bg });
      svg += text(x + 9, dcy + 4.5, s.edit);
      x += s.edit.length * CH + 48;
    }
    if (s.dock.length > 0) {
      svg += divider(x - 6, dh, top);
      x += 8;
      for (const a of s.dock) {
        const b = button(x, dcy, a.label, { primary: a.primary === true });
        svg += b.svg;
        x += b.w + 8;
      }
    }
    return { svg, h: top + dh };
  }
  const h = 44;
  const cy = h / 2;
  let svg = rect(0, 0, w, h, { fill: C.panel, r: 0 });
  svg += `<path d="M0 ${String(h)}H${String(w)}" stroke="${C.line}"/>`;
  const g = globals(w - 12, cy, ids);
  svg += g.svg;
  const a = actionsRight(g.left - 12, cy, s.actions);
  if (s.actions.length > 0) {
    svg += divider(g.left - 7, h) + a.svg;
  }
  const crumbs = (v === "A" ? plainCrumbs : chipCrumbs)(16, cy, s.crumbs, s.edit);
  svg += crumbs.svg;
  let x = 16 + crumbs.w + 16;
  if (v === "A" && !isHome) {
    const b = button(x, cy, "← Back");
    svg += b.svg;
    x += b.w + 16;
  }
  if (s.status !== undefined) {
    svg += text(x, cy + 4.5, s.status, { fill: C.inkDim });
  }
  return { svg, h };
}

/**
 * @param {"A" | "B" | "C"} v @param {keyof typeof SCREENS} id @param {number} w
 * @returns {{ svg: string, h: number }}
 */
function phoneBar(v, id, w) {
  const s = /** @type {Screen} */ (SCREENS[id]);
  const isHome = s.crumbs.length === 1;
  const last = /** @type {string} */ (s.crumbs[s.crumbs.length - 1]);
  const parent = s.crumbs[s.crumbs.length - 2];
  const primary = s.actions.find((a) => a.primary === true);
  const h = v === "C" ? 78 : 44;
  const cy = 22;
  let svg = rect(0, 0, w, v === "C" ? 34 : h, { fill: C.panel, r: 0 });
  svg += `<path d="M0 ${String(v === "C" ? 34 : h)}H${String(w)}" stroke="${C.line}"/>`;
  const cyTop = v === "C" ? 17 : cy;
  const more = iconButton(w - 38, cyTop, "more");
  svg += more;
  let x = 10;
  if (v === "A") {
    if (!isHome) {
      svg += path(
        `M${f(x + 7)} ${f(cy - 6)}L${f(x)} ${f(cy)}L${f(x + 7)} ${f(cy + 6)}`,
        C.accent,
        2,
      );
      x += 18;
    }
    svg += text(x, cy + 4.5, last, { bold: true, size: FS + 1 });
    if (isHome) {
      let gx = w - 12;
      for (const id2 of /** @type {IconId[]} */ (["fullscreen", "mute", "music"])) {
        gx -= 32;
        svg += iconButton(gx + 6, cy, id2);
      }
      svg = svg.replace(more, "");
      svg += iconButton(w - 38, cy, "more");
    } else if (primary !== undefined) {
      const b = button(0, cy, primary.label);
      svg += `<g transform="translate(${f(w - 38 - 10 - b.w)},0)">${b.svg}</g>`;
    }
  } else if (v === "B") {
    if (!isHome && parent !== undefined) {
      const pw = parent.length * CH + 34;
      svg += rect(x, cy - 13, pw, 26, { r: 13, stroke: C.accent });
      svg += path(
        `M${f(x + 14)} ${f(cy - 5)}L${f(x + 8)} ${f(cy)}L${f(x + 14)} ${f(cy + 5)}`,
        C.accent,
        1.8,
      );
      svg += text(x + 21, cy + 4.5, parent, { fill: C.accent });
      x += pw + 6;
    }
    const lw = last.length * CH + 22;
    svg += rect(x, cy - 13, lw, 26, { r: 13, stroke: C.ink, fill: C.bg });
    svg += text(x + lw / 2, cy + 4.5, last, { anchor: "middle", bold: true });
    if (primary !== undefined) {
      const b = button(0, cy, primary.label, { primary: true });
      svg += `<g transform="translate(${f(w - 38 - 10 - b.w)},0)">${b.svg}</g>`;
    }
  } else {
    svg += text(x, cyTop + 4.5, s.crumbs.length > 1 ? `…> ${last}` : last, {
      bold: true,
      size: FS + 1,
    });
    const dcy = 34 + 22;
    svg += rect(0, 34, w, 44, { fill: C.dock, r: 0 });
    svg += `<path d="M0 78H${String(w)}" stroke="${C.line}"/>`;
    let dx = 10;
    if (!isHome) {
      const b = button(dx, dcy, "← Back");
      svg += b.svg;
      dx += b.w + 8;
    }
    for (const a of s.dock) {
      const b = button(dx, dcy, a.label, { primary: a.primary === true });
      if (dx + b.w > w - 20) {
        svg += `<path d="M${f(w - 28)} 35V77" stroke="${C.dock}" stroke-width="28" opacity="0.9"/>`;
        svg += path(
          `M${f(w - 16)} ${f(dcy - 5)}L${f(w - 10)} ${f(dcy)}L${f(w - 16)} ${f(dcy + 5)}`,
          C.inkDim,
        );
        break;
      }
      svg += b.svg;
      dx += b.w + 8;
    }
  }
  return { svg, h };
}

// ---------------------------------------------------------------------------
// Content under the bar: the screen as it is, drawn as a wireframe so the bar
// reads in context. Not a design of the screens themselves.
// ---------------------------------------------------------------------------

/**
 * A wireframe card with a title line and some grey lines.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} title @param {number} [lines]
 */
function card(x, y, w, h, title, lines = 2) {
  let svg = rect(x, y, w, h, { fill: C.panel, stroke: C.line });
  svg += text(x + 12, y + 20, title, { bold: true });
  for (let i = 0; i < lines; i += 1) {
    svg += rect(x + 12, y + 32 + i * 14, Math.max(30, (w - 24) * (i % 2 === 0 ? 0.7 : 0.45)), 6, {
      fill: C.line,
      r: 3,
    });
  }
  return svg;
}

/**
 * @param {keyof typeof SCREENS} id @param {number} x @param {number} y
 * @param {number} w @param {number} h @param {boolean} phone
 */
function content(id, x, y, w, h, phone) {
  const pad = phone ? 10 : 24;
  const ix = x + pad;
  const iw = w - pad * 2;
  let svg = "";
  if (id === "menu") {
    if (phone) {
      svg += card(ix, y + 12, iw, 62, "Play as · Aria, warrior / monk", 1);
      svg += rect(ix, y + 84, iw, 36, { stroke: C.accent, fill: C.panel });
      svg += text(ix + iw / 2, y + 107, "Random Arena", { fill: C.accent, anchor: "middle" });
    } else {
      svg += text(ix, y + 30, "PLAY AS", { size: 11, fill: C.inkDim });
      svg += card(ix, y + 40, 300, 62, "Aria · warrior / monk", 1);
      svg += card(ix, y + 110, 300, 62, "Brann · ranger / mesmer", 1);
      svg += text(ix + 340, y + 30, "PLAY", { size: 11, fill: C.inkDim });
      svg += rect(ix + 340, y + 40, 250, 44, { stroke: C.accent, fill: C.panel });
      svg += text(ix + 465, y + 67, "Random Arena", { fill: C.accent, anchor: "middle" });
      svg += rect(ix + 340, y + 92, 250, 44, { stroke: C.line, fill: C.panel });
      svg += text(ix + 465, y + 119, "Host a lobby", { anchor: "middle" });
    }
  } else if (id === "options") {
    const nav = phone ? 0 : 160;
    if (!phone) {
      ["Sound", "Graphics", "Controls", "Gameplay"].forEach((n, i) => {
        svg += text(ix + 8, y + 32 + i * 28, n, { fill: i === 0 ? C.accent : C.inkDim });
      });
    }
    ["Master volume", "Effects", "Music"].forEach((n, i) => {
      const yy = y + (phone ? 28 : 32) + i * (phone ? 34 : 36);
      svg += text(ix + nav, yy, n, { fill: C.inkDim });
      svg += rect(ix + nav + (phone ? 120 : 160), yy - 8, phone ? iw - 120 : 320, 6, {
        fill: C.line,
        r: 3,
      });
    });
  } else if (id === "music") {
    svg += text(ix, y + 26, "Click a track to hear it. Changes save at once.", { fill: C.inkDim });
    ["Lobby", "Training", "Match"].forEach((n, i) => {
      const yy = y + 40 + i * (phone ? 40 : 44);
      svg += rect(ix, yy, phone ? iw : 560, phone ? 32 : 36, { fill: C.panel, stroke: C.line });
      svg += path(
        `M${f(ix + 14)} ${f(yy + (phone ? 10 : 12))}L${f(ix + 14)} ${f(yy + (phone ? 22 : 24))}L${f(ix + 24)} ${f(yy + (phone ? 16 : 18))}Z`,
        C.accent,
      );
      svg += text(ix + 40, yy + (phone ? 21 : 23), n);
    });
  } else if (id === "team") {
    svg += card(ix, y + 14, phone ? iw : 420, 60, "Aria · warrior / monk", 1);
    svg += text(ix, y + 100, "TEAM", { size: 11, fill: C.inkDim });
    ["Aria", "Brann", "Cade"].forEach((n, i) => {
      const yy = y + 108 + i * 30;
      if (yy + 26 > y + h) {
        return;
      }
      svg += rect(ix, yy, phone ? iw : 420, 24, { fill: C.panel, stroke: C.line });
      svg += text(ix + 10, yy + 16, n);
    });
  } else {
    const slots = phone ? 4 : 8;
    for (let i = 0; i < slots; i += 1) {
      const sw = phone ? (iw - 3 * 8) / 4 : 56;
      svg += rect(ix + i * (sw + 8), y + 16, sw, 56, {
        fill: C.panel,
        stroke: i === 7 ? C.elite : C.line,
      });
    }
    svg += text(ix, y + 100, "ATTRIBUTES", { size: 11, fill: C.inkDim });
    ["Strength 12", "Tactics 9", "Healing prayers 10"].forEach((n, i) => {
      const yy = y + 118 + i * 20;
      if (yy + 8 < y + h) {
        svg += text(ix, yy, n, { fill: C.inkDim });
      }
    });
  }
  return svg;
}

// ---------------------------------------------------------------------------
// The sheet.
// ---------------------------------------------------------------------------

const TITLES = {
  A: "A: a plain breadcrumb, Back after it, the screen's buttons right",
  B: "B: breadcrumb chips; a parent chip is Back; no Back button",
  C: "C: a slim place-and-global bar over a context dock",
};
/** One line per screen: where Back, the screen's actions and the globals go. */
const NOTES = {
  A: {
    menu: [
      "No Back at the root.",
      "Options and Music are in the global icons;",
      "Teams moves under the character.",
    ],
    options: [
      "Back sits after the crumb.",
      "No screen buttons; the ⚙ icon is hidden",
      "on its own screen.",
    ],
    music: [
      "Back after the crumb.",
      "Sound settings is the screen button,",
      "right, before the global icons.",
    ],
    team: [
      "Back after the crumb.",
      "New team is the screen button.",
      "The team list sits under the character.",
    ],
    editor: [
      "Name field replaces the last crumb.",
      "Status (skills, unsaved) after Back;",
      "Save and Share right of a divider.",
    ],
  },
  B: {
    menu: ["One chip: you are home.", "No screen buttons; Options and Music", "are icons."],
    options: ["Click the VibeWars chip to go back;", "Esc does the same. No Back button."],
    music: ["Parent chip is Back.", "Sound settings right, then the globals."],
    team: ["Parent chip is Back.", "New team right."],
    editor: ["Two parent chips: Team goes back one,", "VibeWars goes home. Name is the last chip."],
  },
  C: {
    menu: ["Dock holds the home actions", "(New character, Host a lobby)."],
    options: ["Dock is only Back: the screen has", "no buttons of its own."],
    music: ["Back and Sound settings together", "in the dock, away from the global icons."],
    team: ["Back, New team and Edit character", "in the dock."],
    editor: ["Name field then Save, Share, Duplicate", "in the dock; status stays in the top bar."],
  },
};

/** @type {string[]} */
const parts = [];
let y = 30;
parts.push(
  text(
    20,
    y,
    "Title bar: study, not decided (#1251). Three variants, each on the same five screens. 1280 px wide, then 390 px (phone).",
    { size: 16 },
  ),
);
y += 14;

for (const v of /** @type {const} */ (["A", "B", "C"])) {
  y += 40;
  parts.push(text(20, y, TITLES[v], { size: 16, fill: C.accent, bold: true }));
  y += 22;
  for (const id of ORDER) {
    parts.push(text(20, y + 4, NAMES[id], { size: 11, fill: C.inkDim }));
    y += 12;
    const bar = desktopBar(v, id, DESK);
    const H = bar.h + 190;
    parts.push(
      `<g transform="translate(20,${f(y)})"><clipPath id="d${v}${id}"><rect width="${String(DESK)}" height="${f(H)}"/></clipPath><g clip-path="url(#d${v}${id})">` +
        rect(0, 0, DESK, H, { fill: C.bg, r: 0 }) +
        bar.svg +
        content(id, 0, bar.h, DESK, H - bar.h, false) +
        "</g>" +
        rect(0, 0, DESK, H, { stroke: C.line, r: 0 }) +
        "</g>",
    );
    NOTES[v][id].forEach((line, i) => {
      parts.push(text(20 + DESK + 24, y + 22 + i * 18, line, { fill: C.inkDim }));
    });
    y += H + 22;
  }
  parts.push(
    text(20, y + 4, "Phone, 390 px: Main menu, Options, Music, Team and character, Build editor", {
      size: 11,
      fill: C.inkDim,
    }),
  );
  y += 14;
  ORDER.forEach((id, i) => {
    const bar = phoneBar(v, id, PHONE);
    const H = 78 + 130;
    const x = 20 + i * (PHONE + 20);
    parts.push(
      `<g transform="translate(${f(x)},${f(y)})"><clipPath id="p${v}${id}"><rect width="${String(PHONE)}" height="${f(H)}"/></clipPath><g clip-path="url(#p${v}${id})">` +
        rect(0, 0, PHONE, H, { fill: C.bg, r: 0 }) +
        bar.svg +
        content(id, 0, bar.h, PHONE, H - bar.h, true) +
        "</g>" +
        rect(0, 0, PHONE, H, { stroke: C.line, r: 0 }) +
        "</g>",
    );
  });
  y += 78 + 130 + 20;
}

const totalH = y + 20;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(SHEET_W)}" height="${String(totalH)}" viewBox="0 0 ${String(SHEET_W)} ${String(totalH)}" font-family="ui-monospace, Menlo, Consolas, monospace">` +
  `<rect width="${String(SHEET_W)}" height="${String(totalH)}" fill="${C.bg}"/>` +
  parts.join("") +
  "</svg>\n";
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
