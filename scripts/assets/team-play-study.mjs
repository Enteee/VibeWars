// Draws a study of Solo Play / Team Play and the Team Lobby (#1449). It is a
// design reference for that decision, not a game asset. Study, not decided.
//
//   node scripts/assets/team-play-study.mjs
//
// Writes docs/art/team-play-study.svg. Three variants, A, B and C, each at
// 1280 px wide, each showing the same seven frames:
//
//   1. Team Play main screen, with Team Builds saved
//   2. Team Play main screen, with none saved
//   3. the lobby (sides, bots per side, Ready), shared by all three variants
//   4. Team Lobby, phase 1: proposals and the vote
//   5. Team Lobby, the result of the vote (a three-way tie, the captain picks)
//   6. Team Lobby, phase 2: claiming the chosen build's slots
//   7. Team Lobby, a side of one player: nobody to vote with
//
// A Team Build holds its own characters; it is not made of the Solo roster
// (the operator's correction, #1449). The title bar is #1251's pick A with
// `Solo Play` and `Team Play` after `VibeWars`. Palette and type mirror
// docs/art/art-direction.md and apps/web/src/styles.css (monospace, `--accent`
// for what is chosen).
//
//   A: one long page per phase, list-heavy.
//   B: a card table: proposals are cards you click to vote, slots are seats.
//   C: two panes: proposals left, the chosen build's slots right.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "team-play-study.svg");

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
const BAR_H = 44;
const BODY_H = 400;
const FRAME_H = BAR_H + BODY_H;
const LABEL_H = 30;
const FS = 13;
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
 * @param {{ fill?: string, stroke?: string, r?: number, dash?: boolean, sw?: number, op?: number }} [o]
 */
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${String(o.r ?? 3)}" fill="${o.fill ?? "none"}"` +
  (o.op === undefined ? "" : ` fill-opacity="${String(o.op)}"`) +
  `${o.stroke === undefined ? "" : ` stroke="${o.stroke}"`}${o.sw === undefined ? "" : ` stroke-width="${String(o.sw)}"`}${o.dash === true ? ' stroke-dasharray="4 3"' : ""}/>`;

/** @param {string} d @param {string} [c] @param {number} [w] */
const path = (d, c = C.ink, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Cut `s` to fit `w` px, ending in an ellipsis. @param {string} s @param {number} w */
const fit = (s, w) => {
  const room = Math.max(1, Math.floor(w / CH));
  return s.length > room ? `${s.slice(0, room - 1)}…` : s;
};

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

/**
 * A profession chip: its disc and its three letters.
 * @param {number} x @param {number} cy @param {keyof typeof PROF} p @param {number} [op]
 */
const chip = (x, cy, p, op = 1) =>
  `<circle cx="${f(x + 8)}" cy="${f(cy)}" r="7.5" fill="${PROF[p]}" fill-opacity="${String(op)}" stroke="#0b0f14" stroke-width="1.2"/>` +
  text(x + 20, cy + 3.5, p, { size: 10, fill: C.inkDim });

/** @typedef {{ name: string, prof: keyof typeof PROF }} Char */
/** @typedef {{ name: string, chars: readonly Char[] }} Build */

const LONG = "The Long-Named Hunters of the Frozen Wastes";
/** @type {readonly Build[]} A Team Build holds its own characters. */
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
    name: LONG,
    chars: [
      { name: "Lund", prof: "Ran" },
      { name: "Ysa", prof: "Ele" },
      { name: "Ketil", prof: "Mon" },
      { name: "Rask", prof: "War" },
    ],
  },
];
const [SUN, IRON, HUNT] = /** @type {[Build, Build, Build]} */ (BUILDS);

/** The chips of a build, left to right. @param {number} x @param {number} cy @param {Build} b @param {number} [op] */
function chips(x, cy, b, op = 1) {
  return b.chars.map((c, i) => chip(x + i * 46, cy, c.prof, op)).join("");
}

// ---------------------------------------------------------------------------
// The title bar and the frame.
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
  return svg;
}

/**
 * `VibeWars | [Solo Play] [Team Play]`, the active one filled and underlined.
 * @param {"solo" | "team"} active
 */
function titleBar(active) {
  const cy = BAR_H / 2;
  let svg =
    rect(0, 0, W, BAR_H, { fill: C.panel, r: 0 }) +
    `<path d="M0 ${String(BAR_H)}H${String(W)}" stroke="${C.line}"/>` +
    text(16, cy + 4.5, "VibeWars", { bold: true, size: FS + 1 });
  let x = 120;
  for (const [id, label] of /** @type {const} */ ([
    ["solo", "Solo Play"],
    ["team", "Team Play"],
  ])) {
    const b = button(x, cy, label, { on: id === active, w: label.length * CH + 26 });
    svg += b.svg;
    if (id === active) {
      svg += `<path d="M${f(x)} ${f(BAR_H - 1)}H${f(x + b.w)}" stroke="${C.accent}" stroke-width="3"/>`;
    }
    x += b.w + 8;
  }
  return svg + globals(W - 12, cy);
}

/**
 * One frame: the bar and its body, with a label above it.
 * @param {number} y @param {string} label @param {"solo" | "team"} active @param {string} body
 */
function frame(y, label, active, body) {
  return (
    text(20, y + 20, label, { bold: true }) +
    `<g transform="translate(20,${f(y + LABEL_H)})">` +
    rect(0, 0, W, FRAME_H, { fill: C.bg, stroke: C.line, r: 0 }) +
    titleBar(active) +
    `<g transform="translate(0,${String(BAR_H)})">${body}</g>` +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Pieces the three variants share.
// ---------------------------------------------------------------------------

/** @param {number} x @param {number} y @param {string} s */
const heading = (x, y, s) => text(x, y, s, { bold: true, size: FS + 2 });
/** @param {number} x @param {number} y @param {string} s */
const dim = (x, y, s) => text(x, y, s, { fill: C.inkDim, size: FS - 1 });

/**
 * The phase clock: a bar that drains, and the seconds.
 * @param {number} x @param {number} cy @param {number} w @param {number} sec
 */
function timer(x, cy, w, sec) {
  const left = Math.max(0, Math.min(1, sec / 60));
  return (
    rect(x, cy - 5, w, 10, { stroke: C.line, r: 5 }) +
    rect(x, cy - 5, w * left, 10, { fill: sec <= 10 ? C.elite : C.accent, r: 5 }) +
    text(x + w + 10, cy + 5, `0:${String(sec).padStart(2, "0")}`, { bold: true, size: FS + 1 })
  );
}

/**
 * A READY button, lit when pressed.
 * @param {number} x @param {number} cy @param {boolean} on
 */
const ready = (x, cy, on) =>
  button(x, cy, on ? "READY ✓" : "READY", { primary: true, on, h: 30, w: 100 }).svg;

/** A small tag: CAPTAIN, YOU. @param {number} x @param {number} y @param {string} s @param {string} [c] */
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

/** @typedef {{ name: string, captain?: boolean, you?: boolean, ready?: boolean }} Player */
/** @type {readonly Player[]} My side, Blue. Dax proposes nothing. */
const BLUE = [
  { name: "Aria", captain: true, you: true },
  { name: "Brann" },
  { name: "Cass" },
  { name: "Dax" },
];

/**
 * The proposals of Blue: who proposed what, who voted for it. A three-way tie
 * in `tie`, a lead in the others.
 * @param {boolean} tie
 * @returns {readonly { by: string, build: Build | null, votes: readonly string[] }[]}
 */
const proposals = (tie) => [
  { by: "Aria", build: SUN, votes: tie ? ["Aria"] : ["Aria", "Cass"] },
  { by: "Brann", build: IRON, votes: ["Brann"] },
  { by: "Cass", build: HUNT, votes: tie ? ["Cass"] : [] },
  { by: "Dax", build: null, votes: [] },
];

/**
 * The slots of a build, claimed as in frame 6: Brann and Aria took theirs, the
 * other two are left for Cass and Dax, who are seated automatically in the
 * lowest free seats; a seat no human is left to take would become a bot.
 * @param {Build} b @param {boolean} claimed
 * @returns {readonly { c: Char, by: string | null, bot?: boolean }[]}
 */
const slotsOf = (b, claimed) =>
  b.chars.map((c, i) => ({
    c,
    by: claimed ? (["Brann", "Aria", null, null][i] ?? null) : null,
    bot: undefined,
  }));

/** The rules, as a legend: one lit. @param {number} x @param {number} y @param {number} lit */
function rules(x, y, lit) {
  const items = [
    "most votes wins",
    "a tie: the captain picks",
    "time runs out: a random proposal wins",
  ];
  let cx = x;
  let svg = "";
  items.forEach((s, i) => {
    const w = s.length * 7 + 22;
    svg += rect(cx, y - 11, w, 22, {
      stroke: i === lit ? C.accent : C.line,
      dash: i !== lit,
      r: 11,
    });
    svg += text(cx + w / 2, y + 4, s, {
      size: FS - 2,
      fill: i === lit ? C.accent : C.inkDim,
      anchor: "middle",
    });
    cx += w + 8;
  });
  return svg;
}

// ---------------------------------------------------------------------------
// Frame 3, the lobby, the same in A, B and C: the operator's design fixes it.
// ---------------------------------------------------------------------------

/** A stepper: − n +. @param {number} x @param {number} cy @param {number} n */
function stepper(x, cy, n) {
  return (
    button(x, cy, "−", { w: 28 }).svg +
    text(x + 46, cy + 5, String(n), { bold: true, size: FS + 2, anchor: "middle" }) +
    button(x + 64, cy, "+", { w: 28 }).svg
  );
}

function lobbyBody() {
  let svg = heading(24, 34, "Lobby ABQ7");
  svg += dim(
    24,
    54,
    "Pick a side. The host sets how many bots fill each side. Everyone Ready starts the Team Lobby.",
  );
  /** @type {readonly { side: string, players: readonly { n: string, host?: boolean, ready: boolean }[], bots: number }[]} */
  const sides = [
    {
      side: "Blue",
      players: [
        { n: "Aria", host: true, ready: true },
        { n: "Brann", ready: true },
        { n: "Cass", ready: false },
        { n: "Dax", ready: true },
      ],
      bots: 0,
    },
    { side: "Red", players: [{ n: "Eli", ready: true }], bots: 3 },
  ];
  sides.forEach((s, i) => {
    const x = 24 + i * 620;
    svg += rect(x, 76, 590, 268, { fill: C.panel, stroke: C.line });
    svg += text(x + 16, 102, `${s.side} side`, { bold: true, size: FS + 1 });
    svg += dim(x + 16, 122, "Bots on this side");
    svg += stepper(x + 470, 118, s.bots);
    s.players.forEach((p, j) => {
      const cy = 156 + j * 36;
      svg +=
        text(x + 16, cy + 4.5, p.n) +
        (p.host === true ? tag(x + 16 + p.n.length * CH + 8, cy - 8, "HOST").svg : "");
      svg += p.ready
        ? tick(x + 540, cy) +
          text(x + 530, cy + 4.5, "Ready", { fill: C.ok, anchor: "end", size: FS - 1 })
        : text(x + 552, cy + 4.5, "…", { fill: C.inkDim, anchor: "end" });
    });
    svg += dim(
      x + 16,
      156 + s.players.length * 36 + 4,
      `+ ${String(s.bots)} bot${s.bots === 1 ? "" : "s"}`,
    );
  });
  svg += button(24, 372, "Switch side").svg;
  svg += ready(1136, 372, false);
  return svg;
}

// ---------------------------------------------------------------------------
// Variant A: one long page per phase, list-heavy.
// ---------------------------------------------------------------------------

/** A Team Build row: name, its characters, optional right-hand text. @param {number} x @param {number} y @param {number} w @param {number} h @param {Build} b @param {{ chosen?: boolean, fade?: boolean, right?: string }} [o] */
function buildRow(x, y, w, h, b, o = {}) {
  const op = o.fade === true ? 0.45 : 1;
  const cy = y + h / 2;
  return (
    rect(x, y, w, h, {
      fill: C.panel,
      stroke: o.chosen === true ? C.accent : C.line,
      sw: o.chosen === true ? 2 : 1,
    }) +
    text(x + 14, cy - 3, fit(b.name, 250), {
      bold: true,
      fill: o.fade === true ? C.inkDim : C.ink,
    }) +
    `<g opacity="${String(op)}">${chips(x + 14, cy + 14, b)}</g>` +
    (o.right === undefined
      ? ""
      : text(x + w - 14, cy + 4.5, o.right, { anchor: "end", fill: C.inkDim }))
  );
}

/** @param {boolean} some */
function teamPlayA(some) {
  let svg = heading(24, 34, "Team Build");
  svg += dim(24, 52, "Optional. Leave it, and your team decides in the Team Lobby.");
  const none = rect(24, 64, 560, 36, { fill: C.panel, stroke: C.accent, sw: 2 });
  svg += none + tick(38, 82, C.accent) + text(60, 86.5, "None, the team decides", { bold: true });
  if (some) {
    BUILDS.forEach((b, i) => {
      svg += buildRow(24, 108 + i * 58, 560, 50, b, { right: "Edit" });
    });
    svg += button(24, 108 + 3 * 58 + 20, "New team build", { primary: true }).svg;
  } else {
    svg += rect(24, 108, 560, 110, { stroke: C.line, dash: true });
    svg += text(304, 150, "No team builds yet.", { fill: C.inkDim, anchor: "middle" });
    svg += button(304 - 62, 184, "New team build", { primary: true }).svg;
  }
  svg += heading(660, 34, "Play");
  const modes = [
    ["Hosted Lobby", "host a lobby, or join one by code"],
    ["Team Arena", "queue as a team"],
    ["Heroes' Ascent", "relics, altars, capture points"],
    ["GvG", "guild against guild"],
  ];
  modes.forEach(([n, d], i) => {
    const y = 52 + i * 62;
    svg += button(660, y + 25, n ?? "", { primary: i === 0, w: 220, h: 44 }).svg;
    svg += dim(900, y + 29, d ?? "");
  });
  svg += rect(660, 52 + 4 * 62 + 4, 100, 28, { fill: C.bg, stroke: C.line });
  svg += text(670, 52 + 4 * 62 + 23, "CODE", { fill: C.inkDim });
  svg += button(768, 52 + 4 * 62 + 18, "Join", { primary: true }).svg;
  return svg;
}

/**
 * Phase header of the long page.
 * @param {string} phase @param {number} sec
 */
function pageHead(phase, sec) {
  return (
    heading(24, 34, "Team Lobby · Blue") +
    dim(24, 52, phase) +
    text(840, 40, "Time left", { fill: C.inkDim, size: FS - 1 }) +
    timer(910, 36, 240, sec)
  );
}

/** @param {number} y @param {{ by: string, build: Build | null, votes: readonly string[] }} p @param {{ me?: boolean, win?: boolean, fade?: boolean, canVote: boolean }} o */
function proposalRowA(y, p, o) {
  const h = 54;
  const x = 24;
  const w = 1232;
  const cy = y + h / 2;
  let svg = rect(x, y, w, h, {
    fill: C.panel,
    stroke: o.win === true ? C.accent : C.line,
    sw: o.win === true ? 2 : 1,
    dash: p.build === null,
  });
  const player = BLUE.find((b) => b.name === p.by);
  svg += text(x + 14, cy + 4.5, p.by, { bold: true });
  if (player?.captain === true) {
    svg += tag(x + 14 + p.by.length * CH + 8, cy - 8, "CAPTAIN", C.elite).svg;
  }
  if (p.build === null) {
    svg += text(280, cy + 4.5, "proposed nothing", { fill: C.inkDim });
  } else {
    const op = o.fade === true ? 0.5 : 1;
    svg += text(280, cy + 4.5, fit(p.build.name, 330), {
      bold: true,
      fill: o.fade === true ? C.inkDim : C.ink,
    });
    svg += `<g opacity="${String(op)}">${chips(640, cy, p.build)}</g>`;
    svg += text(900, cy + 6, String(p.votes.length), {
      bold: true,
      size: 20,
      fill: o.win === true ? C.accent : C.ink,
    });
    svg += dim(920, cy + 4.5, p.votes.length === 1 ? "vote" : "votes");
    svg += dim(990, cy + 4.5, p.votes.length > 0 ? p.votes.join(", ") : "");
    if (o.canVote) {
      svg += button(1130, cy, o.me === true ? "Voted ✓" : "Vote", {
        on: o.me === true,
        w: 100,
      }).svg;
    }
  }
  return svg;
}

/** @param {number} y @param {boolean} active @param {ReturnType<typeof slotsOf>} slots */
function slotsA(y, active, slots) {
  let svg = heading(24, y, "Slots");
  svg += dim(
    24,
    y + 18,
    active
      ? "Claim a character. Players who do not claim are seated automatically; only a seat nobody takes gets a bot."
      : "Opens when the vote ends.",
  );
  slots.forEach((s, i) => {
    const cy = y + 40;
    const x = 24 + i * 310;
    const fade = active ? 1 : 0.35;
    svg +=
      `<g opacity="${String(fade)}">` +
      rect(x, cy, 298, 64, {
        fill: C.panel,
        stroke: s.by === "Aria" ? C.accent : C.line,
        sw: s.by === "Aria" ? 2 : 1,
        dash: s.bot === true,
      }) +
      chip(x + 14, cy + 22, s.c.prof) +
      text(x + 14, cy + 48, s.c.name, { bold: true });
    const who = s.by ?? (s.bot === true ? "Bot" : "free");
    svg +=
      text(x + 284, cy + 28, who, {
        anchor: "end",
        fill: s.by === null ? C.inkDim : C.ink,
        bold: s.by !== null,
      }) + "</g>";
    if (active && s.by === null && s.bot !== true) {
      svg += button(x + 200, cy + 48, "Claim", { primary: true, w: 84, h: 22 }).svg;
    }
  });
  return svg;
}

/** @param {"vote" | "result" | "claim" | "one"} kind */
function teamLobbyA(kind) {
  if (kind === "one") {
    let svg =
      heading(24, 34, "Team Lobby · Red") +
      dim(24, 52, "Phase 1 of 2 · Propose and vote") +
      text(840, 40, "Time left", { fill: C.inkDim, size: FS - 1 }) +
      timer(910, 36, 240, 52);
    svg += rect(24, 76, 1232, 54, { fill: C.panel, stroke: C.accent, sw: 2 });
    svg += text(38, 108, "Eli", { bold: true }) + tag(38 + 3 * CH + 8, 94, "YOU", C.accent).svg;
    svg += text(280, 108, "Iron Wall", { bold: true }) + chips(640, 103, IRON);
    svg += dim(
      24,
      160,
      "You are alone on this side: there is no vote, your proposal stands. The clock only ends the phase early for everyone who is Ready.",
    );
    svg += dim(24, 180, "Propose nothing, and the house team plays.");
    svg += slotsA(230, false, slotsOf(IRON, false));
    svg += ready(1136, 372, false);
    return svg;
  }
  const tie = kind !== "vote";
  const ps = proposals(tie);
  let svg = pageHead(
    kind === "claim" ? "Phase 2 of 2 · Claim a character" : "Phase 1 of 2 · Propose and vote",
    kind === "vote" ? 38 : kind === "result" ? 0 : 41,
  );
  if (kind === "claim") {
    svg += rect(24, 70, 1232, 44, { fill: C.panel, stroke: C.accent, sw: 2 });
    svg +=
      text(38, 97, "Chosen: Sunrise Vanguard", { bold: true }) +
      chips(340, 92, SUN) +
      dim(640, 97, "captain's pick, a three-way tie");
    svg += slotsA(150, true, slotsOf(SUN, true));
    svg += ready(1136, 372, false);
    return svg;
  }
  ps.forEach((p, i) => {
    svg += proposalRowA(70 + i * 62, p, {
      me: kind === "vote" && p.by === "Aria",
      win: kind === "result" && p.by === "Aria",
      fade: kind === "result" && p.by !== "Aria",
      canVote: kind === "vote",
    });
  });
  if (kind === "result") {
    svg += rect(24, 70 + 4 * 62, 1232, 40, { fill: C.accent, op: 0.12, stroke: C.accent });
    svg += text(
      38,
      70 + 4 * 62 + 25,
      "Sunrise Vanguard wins: a three-way tie, so the captain picked it.",
      { bold: true, fill: C.accent },
    );
    svg += rules(24, 70 + 4 * 62 + 62, 1);
  } else {
    svg += dim(
      24,
      70 + 4 * 62 + 14,
      "Dax has not voted. Votes can change until the clock ends or everyone is Ready.",
    );
    svg += rules(24, 70 + 4 * 62 + 42, 0);
  }
  svg += ready(1136, 372, kind === "result");
  return svg;
}

// ---------------------------------------------------------------------------
// Variant B: a card table, proposals as cards, slots as seats.
// ---------------------------------------------------------------------------

/** @param {boolean} some */
function teamPlayB(some) {
  const modes = [
    ["Hosted Lobby", "host or join by code", true],
    ["Team Arena", "queue as a team", false],
    ["Heroes' Ascent", "relics and altars", false],
    ["GvG", "guild vs guild", false],
  ];
  let svg = "";
  modes.forEach(([n, d, hot], i) => {
    const x = 24 + i * 310;
    svg += rect(x, 24, 298, 80, {
      fill: C.panel,
      stroke: hot === true ? C.accent : C.line,
      sw: hot === true ? 2 : 1,
    });
    svg += text(x + 16, 58, String(n), {
      bold: true,
      size: FS + 2,
      fill: hot === true ? C.accent : C.ink,
    });
    svg += dim(x + 16, 82, String(d));
  });
  svg += heading(24, 146, "Team Build") + dim(160, 146, "optional: leave it, and the team decides");
  /** @type {readonly { b?: Build }[]} The first card is "None". */
  const cards = [{}, ...(some ? BUILDS.map((b) => ({ b })) : [])];
  cards.forEach((c, i) => {
    const x = 24 + i * 250;
    const y = 164;
    svg += rect(x, y, 238, 150, {
      fill: C.panel,
      stroke: i === 0 ? C.accent : C.line,
      sw: i === 0 ? 2 : 1,
      dash: i === 0,
    });
    if (c.b !== undefined) {
      svg += text(x + 14, y + 26, fit(c.b.name, 210), { bold: true });
      c.b.chars.forEach((ch, j) => {
        svg +=
          chip(x + 14 + (j % 2) * 108, y + 54 + Math.floor(j / 2) * 24, ch.prof) +
          text(x + 14 + (j % 2) * 108 + 52, y + 58 + Math.floor(j / 2) * 24, ch.name, {
            size: FS - 2,
          });
      });
      svg += button(x + 160, y + 128, "Edit", { w: 70, h: 22 }).svg;
    } else {
      svg += text(x + 119, y + 66, "None", { bold: true, anchor: "middle", size: FS + 3 });
      svg += text(x + 119, y + 86, "the team decides", { fill: C.inkDim, anchor: "middle" });
      svg += tick(x + 112, y + 100, C.accent) + dim(x + 130, y + 104, "picked");
    }
  });
  const nx = 24 + cards.length * 250;
  svg += rect(nx, 164, 238, 150, { stroke: C.accent, dash: true });
  svg += text(nx + 119, 244, "+ New team build", { fill: C.accent, anchor: "middle", bold: true });
  if (!some) {
    svg += dim(24, 346, "No team builds yet. Make one, or play on and let the team decide.");
  }
  return svg;
}

/** A vote token: a small disc in the voter's initial. @param {number} cx @param {number} cy @param {string} who */
const token = (cx, cy, who) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="10" fill="${C.accent}" fill-opacity="0.2" stroke="${C.accent}"/>` +
  text(cx, cy + 4, who.slice(0, 1), { size: 11, anchor: "middle", bold: true });

/** @param {"vote" | "result" | "claim" | "one"} kind */
function teamLobbyB(kind) {
  let svg = heading(24, 30, kind === "one" ? "Team Lobby · Red" : "Team Lobby · Blue");
  const sec = kind === "vote" ? 38 : kind === "result" ? 0 : kind === "claim" ? 41 : 52;
  svg += dim(
    24,
    48,
    kind === "claim" ? "Phase 2 of 2 · pick a seat" : "Phase 1 of 2 · click a card to vote",
  );
  svg += timer(960, 34, 240 - 20, sec);
  if (kind === "one") {
    svg += rect(24, 70, 298, 200, { fill: C.panel, stroke: C.accent, sw: 2 });
    svg += text(40, 98, "Eli", { bold: true }) + tag(40 + 3 * CH + 8, 85, "YOU", C.accent).svg;
    svg += text(40, 124, "Iron Wall", { bold: true }) + chips(40, 152, IRON);
    svg += dim(350, 100, "You are alone on this side: no vote, your proposal stands.");
    svg += dim(350, 120, "Propose nothing, and the house team plays.");
    svg += ready(1136, 372, false);
    return svg;
  }
  if (kind === "claim") {
    svg += rect(24, 62, 1232, 36, { fill: C.panel, stroke: C.accent });
    svg +=
      text(38, 85, "Chosen: Sunrise Vanguard", { bold: true }) +
      dim(300, 85, "captain's pick, a three-way tie");
    slotsOf(SUN, true).forEach((s, i) => {
      const x = 60 + i * 300;
      const y = 150 + (i === 1 || i === 2 ? 20 : 0);
      svg += rect(x, y, 260, 150, {
        fill: C.panel,
        stroke: s.by === "Aria" ? C.accent : C.line,
        sw: s.by === "Aria" ? 2 : 1,
        dash: s.bot === true,
      });
      svg += chip(x + 16, y + 28, s.c.prof) + text(x + 16, y + 56, s.c.name, { bold: true });
      svg +=
        s.by !== null
          ? text(x + 130, y + 104, s.by, { bold: true, anchor: "middle", size: FS + 3 })
          : s.bot === true
            ? text(x + 130, y + 104, "Bot", { fill: C.inkDim, anchor: "middle", size: FS + 3 })
            : button(x + 60, y + 100, "Sit here", { primary: true, w: 140 }).svg;
    });
    svg += ready(1136, 372, false);
    return svg;
  }
  const tie = kind === "result";
  const ps = proposals(tie);
  ps.forEach((p, i) => {
    const x = 24 + i * 310;
    const y = tie ? (p.by === "Aria" ? 66 : 80) : 70;
    const win = tie && p.by === "Aria";
    const fade = tie && !win;
    svg += `<g opacity="${fade ? "0.5" : "1"}">`;
    svg += rect(x, y, 298, 232, {
      fill: C.panel,
      stroke: win ? C.accent : C.line,
      sw: win ? 3 : 1,
      dash: p.build === null,
    });
    svg += text(x + 14, y + 24, p.by, { bold: true });
    const cap = BLUE.find((b) => b.name === p.by)?.captain === true;
    if (cap) {
      svg += tag(x + 14 + p.by.length * CH + 8, y + 11, "CAPTAIN", C.elite).svg;
    }
    if (p.build === null) {
      svg += text(x + 149, y + 120, "proposed nothing", { fill: C.inkDim, anchor: "middle" });
    } else {
      svg += text(x + 14, y + 52, fit(p.build.name, 270), { bold: true });
      p.build.chars.forEach((ch, j) => {
        svg +=
          chip(x + 14, y + 80 + j * 24, ch.prof) +
          text(x + 66, y + 84 + j * 24, ch.name, { size: FS - 2 });
      });
      p.votes.forEach((v, j) => {
        svg += token(x + 230 + (j % 2) * 26, y + 90 + Math.floor(j / 2) * 26, v);
      });
      svg += text(x + 270, y + 176, String(p.votes.length), {
        bold: true,
        size: 22,
        anchor: "end",
        fill: win ? C.accent : C.ink,
      });
      if (!tie) {
        svg += button(x + 14, y + 214, p.by === "Aria" ? "Your vote ✓" : "Vote", {
          on: p.by === "Aria",
          w: 270,
          h: 24,
        }).svg;
      }
    }
    svg += "</g>";
  });
  if (tie) {
    svg += rect(24, 332, 1232, 26, { fill: C.accent, op: 0.12, stroke: C.accent });
    svg += text(38, 349, "Sunrise Vanguard wins: a three-way tie, so the captain picked it.", {
      bold: true,
      fill: C.accent,
    });
    svg += rules(24, 372, 1);
  } else {
    svg += rules(24, 340, 0);
  }
  svg += ready(1136, 372, tie);
  return svg;
}

// ---------------------------------------------------------------------------
// Variant C: two panes, proposals left, the chosen build's slots right.
// ---------------------------------------------------------------------------

/** @param {boolean} some */
function teamPlayC(some) {
  let svg = "";
  const modes = ["Hosted Lobby", "Team Arena", "Heroes' Ascent", "GvG"];
  modes.forEach((n, i) => {
    svg += button(24, 50 + i * 52, n, { on: i === 0, w: 250, h: 40 }).svg;
  });
  svg += rect(300, 24, 956, 340, { fill: C.panel, stroke: C.line });
  svg += heading(320, 56, "Hosted Lobby");
  svg += dim(320, 76, "Host a lobby for your friends, or join one by its code.");
  svg += text(320, 112, "TEAM BUILD, OPTIONAL", { size: 10, fill: C.inkDim });
  svg += rect(320, 120, 400, 32, { fill: C.bg, stroke: C.accent });
  svg += text(334, 141, "None, the team decides", {});
  svg += text(702, 141, "▾", { fill: C.accent, anchor: "end" });
  if (some) {
    BUILDS.forEach((b, i) => {
      svg += buildRow(320, 160 + i * 52, 400, 46, b, { right: "" });
    });
    svg += button(320, 160 + 3 * 52 + 14, "New team build", { primary: true, w: 140 }).svg;
    svg += button(470, 160 + 3 * 52 + 14, "Edit team builds", { w: 150 }).svg;
  } else {
    svg += rect(320, 160, 400, 90, { stroke: C.line, dash: true });
    svg += text(520, 196, "No team builds yet.", { fill: C.inkDim, anchor: "middle" });
    svg += button(520 - 62, 226, "New team build", { primary: true }).svg;
  }
  svg += button(800, 140, "Host a lobby", { primary: true, h: 34, w: 160 }).svg;
  svg +=
    rect(800, 172, 100, 28, { fill: C.bg, stroke: C.line }) +
    text(810, 191, "CODE", { fill: C.inkDim });
  svg += button(908, 186, "Join", { primary: true }).svg;
  return svg;
}

/** The slots pane of variant C. @param {number} x @param {number} y @param {number} w @param {"locked" | "open" | "unlocking"} state @param {Build} [b] */
function slotsC(x, y, w, state, b = SUN) {
  const on = state === "open";
  let svg = rect(x, y, w, 306, {
    fill: C.panel,
    stroke: on ? C.accent : C.line,
    sw: on ? 2 : 1,
    dash: state === "locked",
  });
  const title = state === "locked" ? `Slots · leading: ${fit(b.name, 200)}` : `Slots · ${b.name}`;
  svg += text(x + 16, y + 28, title, {
    bold: true,
    fill: on || state === "unlocking" ? C.ink : C.inkDim,
  });
  svg += dim(
    x + 16,
    y + 46,
    on
      ? "Claim a character. Players who do not claim are seated automatically; only a seat nobody takes gets a bot."
      : state === "locked"
        ? "A preview. Locked until the vote ends."
        : "Opens the moment the vote is decided.",
  );
  slotsOf(b, on).forEach((s, i) => {
    const cy = y + 62 + i * 58;
    const op = on ? 1 : 0.4;
    svg +=
      `<g opacity="${String(op)}">` +
      rect(x + 16, cy, w - 32, 52, {
        stroke: s.by === "Aria" ? C.accent : C.line,
        sw: s.by === "Aria" ? 2 : 1,
        dash: s.bot === true,
        fill: C.bg,
      }) +
      chip(x + 30, cy + 20, s.c.prof) +
      text(x + 30, cy + 40, s.c.name, { bold: true, size: FS - 1 });
    const who = on ? (s.by ?? (s.bot === true ? "Bot" : "")) : "";
    svg += text(x + w - 30, cy + 31, who, { anchor: "end", bold: s.by !== null }) + "</g>";
    if (on && s.by === null && s.bot !== true) {
      svg += button(x + w - 110, cy + 26, "Claim", { primary: true, w: 84, h: 26 }).svg;
    }
  });
  return svg;
}

/** @param {"vote" | "result" | "claim" | "one"} kind */
function teamLobbyC(kind) {
  const sec = kind === "vote" ? 38 : kind === "result" ? 0 : kind === "claim" ? 41 : 52;
  let svg = heading(24, 30, kind === "one" ? "Team Lobby · Red" : "Team Lobby · Blue");
  svg += dim(
    24,
    48,
    kind === "claim" ? "Phase 2 of 2 · claim a character" : "Phase 1 of 2 · propose and vote",
  );
  svg += timer(960, 34, 220, sec);
  if (kind === "one") {
    svg += rect(24, 62, 600, 54, { fill: C.panel, stroke: C.accent, sw: 2 });
    svg +=
      text(38, 94, "Eli", { bold: true }) +
      tag(38 + 3 * CH + 8, 80, "YOU", C.accent).svg +
      text(200, 94, "Iron Wall", { bold: true }) +
      chips(380, 89, IRON);
    svg += dim(24, 144, "You are alone on this side: no vote, your proposal stands.");
    svg += dim(24, 164, "Propose nothing, and the house team plays.");
    svg += slotsC(660, 56, 596, "locked", IRON).replace("Slots · leading: ", "Slots · ");
    svg += ready(1136, 372, false);
    return svg;
  }
  const tie = kind !== "vote";
  const ps = proposals(tie);
  if (kind === "claim") {
    svg += rect(24, 62, 600, 64, { fill: C.panel, stroke: C.accent, sw: 2 });
    svg += text(38, 88, "Chosen: Sunrise Vanguard", { bold: true }) + chips(38, 108, SUN);
    svg += dim(24, 150, "Captain's pick, a three-way tie:");
    ps.forEach((p, i) => {
      svg += dim(
        24,
        172 + i * 20,
        p.build === null
          ? `${p.by}: no proposal`
          : `${p.by}: ${fit(p.build.name, 260)}, ${String(p.votes.length)} vote${p.votes.length === 1 ? "" : "s"}`,
      );
    });
  } else {
    ps.forEach((p, i) => {
      const y = 62 + i * 62;
      const win = kind === "result" && p.by === "Aria";
      svg +=
        `<g opacity="${kind === "result" && !win ? "0.5" : "1"}">` +
        rect(24, y, 600, 54, {
          fill: C.panel,
          stroke: win ? C.accent : C.line,
          sw: win ? 2 : 1,
          dash: p.build === null,
        });
      svg += text(38, y + 22, p.by, { bold: true });
      if (BLUE.find((b) => b.name === p.by)?.captain === true) {
        svg += tag(38 + p.by.length * CH + 8, y + 9, "CAPTAIN", C.elite).svg;
      }
      if (p.build === null) {
        svg += text(38, y + 42, "proposed nothing", { fill: C.inkDim, size: FS - 1 });
      } else {
        svg +=
          text(180, y + 22, fit(p.build.name, 250), { bold: true }) + chips(180, y + 40, p.build);
        svg += text(560, y + 34, String(p.votes.length), {
          bold: true,
          size: 20,
          anchor: "end",
          fill: win ? C.accent : C.ink,
        });
        if (kind === "vote") {
          svg += button(570, y + 27, p.by === "Aria" ? "✓" : "Vote", {
            on: p.by === "Aria",
            w: 44,
          }).svg;
        }
      }
      svg += "</g>";
    });
    svg +=
      kind === "result"
        ? text(24, 62 + 4 * 62 + 12, "A three-way tie: the captain picked Sunrise Vanguard.", {
            bold: true,
            fill: C.accent,
          })
        : dim(24, 62 + 4 * 62 + 12, "Dax has not voted.");
    svg += rules(24, 62 + 4 * 62 + 42, kind === "result" ? 1 : 0);
  }
  svg += slotsC(
    660,
    56,
    596,
    kind === "claim" ? "open" : kind === "result" ? "unlocking" : "locked",
  );
  if (kind === "result") {
    svg += text(642, 220, "→", { fill: C.accent, size: 22, anchor: "middle", bold: true });
  }
  svg += ready(1136, 382, kind === "result");
  return svg;
}

// ---------------------------------------------------------------------------

const VARIANTS = /** @type {const} */ ([
  ["A: one long page per phase", teamPlayA, teamLobbyA],
  ["B: a card table", teamPlayB, teamLobbyB],
  ["C: two panes", teamPlayC, teamLobbyC],
]);

let y = 20;
let svg = "";
for (const [name, teamPlay, teamLobby] of VARIANTS) {
  svg += text(20, y + 16, name, { bold: true, size: 18 });
  y += 30;
  /** @type {readonly [string, "solo" | "team", string][]} */
  const frames = [
    ["1. Team Play, with team builds saved", "team", teamPlay(true)],
    ["2. Team Play, no team builds yet", "team", teamPlay(false)],
    ["3. Lobby: sides, bots per side, Ready (the same in A, B and C)", "team", lobbyBody()],
    ["4. Team Lobby, phase 1: propose and vote", "team", teamLobby("vote")],
    ["5. Team Lobby: the vote ends in a tie, the captain picks", "team", teamLobby("result")],
    ["6. Team Lobby, phase 2: claim a character", "team", teamLobby("claim")],
    ["7. Team Lobby, a side of one player", "team", teamLobby("one")],
  ];
  for (const [label, active, body] of frames) {
    svg += frame(y, label, active, body);
    y += LABEL_H + FRAME_H + 14;
  }
  y += 30;
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
