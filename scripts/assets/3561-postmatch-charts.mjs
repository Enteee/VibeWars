#!/usr/bin/env node
/* eslint-disable -- an SVG mockup generator: untyped numbers go into strings everywhere. */
/**
 * Mockups of the post-match screen's charts (#3561), written as SVG and
 * rendered to PNG with inkscape:
 *
 *   node scripts/assets/3561-postmatch-charts.mjs
 *
 * Writes docs/art/3561-postmatch-{player,teams,phone}.{svg,png}. The data is
 * invented (seeded), the palette and panels are the UI's own (`--bg`,
 * `--panel`, `--line`, `--ink`, `--ink-dim`, `--accent`, `--damage`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "..", "docs", "art");
const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  dim: "#7d8899",
  team1: "#59c2ff",
  team2: "#ff7b72",
  dealt: "#ff7b72",
  taken: "#e3b341",
  heal: "#7ee787",
  energy: "#d2a8ff",
  elite: "#d4a72c",
};
const FONT = "font-family=\"ui-monospace, 'DejaVu Sans Mono', monospace\"";
const DURATION = 240; // seconds

let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

/** A per-second series: bursts around the fight beats, smoothed. */
function burst(peak, beats) {
  const out = [];
  for (let t = 0; t <= DURATION; t += 4) {
    let v = 0.08 + rnd() * 0.12;
    for (const [at, width, h] of beats) v += h * Math.exp(-(((t - at) / width) ** 2));
    out.push(Math.min(1, v) * peak);
  }
  return out;
}
const beats = [
  [30, 14, 0.6],
  [78, 10, 0.9],
  [130, 16, 0.7],
  [182, 9, 1],
  [214, 7, 0.5],
];

/** Events: [t, kind, who]. kinds: kill, death, interrupt, capture, raise. */
const events = [
  [34, "interrupt"],
  [82, "kill"],
  [96, "death"],
  [118, "capture"],
  [135, "raise"],
  [158, "interrupt"],
  [186, "kill"],
  [196, "kill"],
  [212, "capture"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size ?? 13}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(s)}</text>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 6}" fill="${o.fill ?? C.panel}" stroke="${o.stroke ?? C.line}" stroke-width="1"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;

/** One marker shape per kind: shape differs, not only colour. */
function marker(kind, x, y, s = 7) {
  switch (kind) {
    case "kill": // diamond, ink
      return `<path d="M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z" fill="${C.ink}"/>`;
    case "death": // cross, damage red
      return `<path d="M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}" stroke="${C.team2}" stroke-width="3"/>`;
    case "interrupt": // zigzag bolt, elite gold
      return `<path d="M${x + 2} ${y - s}L${x - 4} ${y + 1}L${x} ${y + 1}L${x - 2} ${y + s}L${x + 5} ${y - 2}L${x + 1} ${y - 2}Z" fill="${C.elite}"/>`;
    case "capture": // flag square on a pole
      return `<path d="M${x - 5} ${y + s}V${y - s}H${x + 6}V${y}H${x - 5}" fill="${C.team1}" stroke="${C.team1}" stroke-width="2"/>`;
    default: // raise: up triangle, healing green
      return `<path d="M${x} ${y - s}L${x + s} ${y + s - 1}L${x - s} ${y + s - 1}Z" fill="${C.heal}"/>`;
  }
}

/**
 * A chart panel: gridlines, time axis, series polylines, event strip.
 * series: [{ label, colour, dash, values, area }]
 */
function chart(x, y, w, h, series, o = {}) {
  const left = 46,
    right = 14,
    top = 14,
    strip = 34,
    bottom = 22;
  const px = x + left,
    pw = w - left - right,
    py = y + top,
    ph = h - top - strip - bottom;
  const X = (t) => px + (t / DURATION) * pw;
  const Y = (v) => py + ph - v * ph;
  let g = rect(x, y, w, h);
  for (let i = 0; i <= 4; i += 1) {
    const yy = py + (ph * i) / 4;
    g += `<line x1="${px}" x2="${px + pw}" y1="${yy}" y2="${yy}" stroke="${C.line}" stroke-width="1"${i === 4 ? "" : ' stroke-dasharray="2 4"'}/>`;
    g += text(px - 8, yy + 4, o.ticks?.[i] ?? "", { anchor: "end", fill: C.dim, size: 11 });
  }
  for (let t = 0; t <= DURATION; t += 60) {
    g += text(X(t), y + h - 6, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, {
      anchor: "middle",
      fill: C.dim,
      size: 11,
    });
    g += `<line x1="${X(t)}" x2="${X(t)}" y1="${py}" y2="${py + ph + 4}" stroke="${C.line}" stroke-width="1"/>`;
  }
  for (const s of series) {
    const pts = s.values.map((v, i) => `${X(i * 4).toFixed(1)},${Y(v).toFixed(1)}`);
    if (s.area) {
      g += `<polygon points="${X(0)},${Y(0)} ${pts.join(" ")} ${X(DURATION)},${Y(0)}" fill="${s.colour}" opacity="0.14"/>`;
    }
    g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.colour}" stroke-width="2.2" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
  }
  // Event strip under the axis plot: markers sit on the time axis.
  const sy = py + ph + 4 + strip / 2;
  g += `<line x1="${px}" x2="${px + pw}" y1="${sy}" y2="${sy}" stroke="${C.line}" stroke-width="1"/>`;
  for (const [t, kind] of o.events ?? events) {
    g += `<line x1="${X(t)}" x2="${X(t)}" y1="${py}" y2="${sy - 8}" stroke="${C.dim}" stroke-width="1" opacity="0.28"/>`;
    g += marker(kind, X(t), sy);
  }
  if (o.hover !== undefined) {
    g += `<line x1="${X(o.hover)}" x2="${X(o.hover)}" y1="${py}" y2="${py + ph}" stroke="${C.ink}" stroke-width="1"/>`;
  }
  return { svg: g, X, Y, py, ph };
}

/** A toggle chip: filled swatch + label when on; hollow, struck dim when off. */
function chip(x, y, label, colour, on, dash) {
  const w = 22 + label.length * 8.2 + 8;
  let g = rect(x, y, w, 28, { r: 14, fill: on ? "#1c232d" : C.bg, stroke: on ? colour : C.line });
  g += `<line x1="${x + 10}" x2="${x + 26}" y1="${y + 14}" y2="${y + 14}" stroke="${on ? colour : C.dim}" stroke-width="3"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  g += text(x + 32, y + 18, label, { fill: on ? C.ink : C.dim, size: 12 });
  return { svg: g, w: w + 8 };
}

function legend(x, y, items) {
  let g = "";
  let cx = x;
  for (const [kind, label] of items) {
    g += marker(kind, cx + 8, y + 7, 6) + text(cx + 22, y + 11, label, { fill: C.dim, size: 11 });
    cx += 34 + label.length * 7;
  }
  return g;
}

function button(x, y, w, label, primary) {
  return (
    rect(x, y, w, 38, {
      r: 6,
      fill: primary ? "#1b3a52" : C.panel,
      stroke: primary ? C.team1 : C.line,
    }) +
    text(x + w / 2, y + 24, label, { anchor: "middle", size: 14, fill: primary ? C.team1 : C.ink })
  );
}

function nameRow(x, y, w, name, bot, colour, stat, mine) {
  let g = mine ? rect(x, y, w, 30, { r: 5, fill: "#1c232d", stroke: colour }) : "";
  g += `<rect x="${x + 8}" y="${y + 8}" width="4" height="14" rx="2" fill="${colour}"/>`;
  g += text(x + 20, y + 20, name, { size: 13 });
  if (bot) {
    const bx = x + 20 + name.length * 7.9 + 8;
    g += rect(bx, y + 8, 32, 15, { r: 7, fill: C.bg, stroke: C.dim });
    g += text(bx + 16, y + 19, "BOT", { anchor: "middle", size: 10, fill: C.dim });
  }
  g += text(x + w - 10, y + 20, stat, { anchor: "end", size: 13, fill: C.dim });
  return g;
}

const dealt = burst(1, beats).map((v) => v * 0.9);
const taken = burst(
  0.8,
  beats.map(([a, b, c]) => [a + 8, b, c * 0.8]),
);
const heal = burst(0.5, [
  [60, 20, 0.5],
  [150, 22, 0.6],
  [200, 12, 0.4],
]);
const energy = dealt.map(
  (_, i) =>
    0.55 + 0.35 * Math.sin(i / 3.5) * Math.exp(-i / 70) - dealt[i] * 0.15 + (i > 40 ? 0.1 : 0),
);

const SERIES = [
  { id: "dealt", label: "Damage dealt", colour: C.dealt, values: dealt, area: true },
  { id: "taken", label: "Damage taken", colour: C.taken, dash: "7 4", values: taken },
  { id: "heal", label: "Healing", colour: C.heal, dash: "2 3", values: heal },
  {
    id: "energy",
    label: "Energy",
    colour: C.energy,
    dash: "10 3 2 3",
    values: energy.map((v) => Math.max(0.05, Math.min(1, v))),
  },
];

function frame(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(title)}</title><rect width="${w}" height="${h}" fill="${C.bg}"/>${body}</svg>`;
}

/** Desktop header: result banner + buttons, never overlapping (flex row). */
function header(w, result, colour) {
  let g = rect(24, 20, w - 48, 64, { fill: C.panel, stroke: colour });
  g += text(48, 60, result, { size: 28, fill: colour, weight: "bold" });
  g += text(190, 52, "Team Arena · Ember Pits · 4:00", { fill: C.dim, size: 13 });
  g += text(190, 71, "Your team won 12 – 9 on kills", { fill: C.ink, size: 13 });
  g += button(w - 24 - 24 - 150 - 12 - 150, 31, 150, "Rematch", true);
  g += button(w - 24 - 24 - 150, 31, 150, "Back to lobby", false);
  return g;
}

function scoreboard(x, y, w) {
  let g = rect(x, y, w, 468);
  g += text(x + 16, y + 28, "Your team", { size: 13, fill: C.team1, weight: "bold" });
  const rows1 = [
    ["Aria Stormveil (you)", false, "12 / 3"],
    ["Brom Ironhide", false, "7 / 5"],
    ["Wandering Ember Knight", true, "4 / 6"],
    ["Sister Calindra Pale-Veil", true, "2 / 4"],
  ];
  rows1.forEach(
    ([n, b, s], i) => (g += nameRow(x + 8, y + 40 + i * 34, w - 16, n, b, C.team1, s, i === 0)),
  );
  g += text(x + 16, y + 214, "Opponents", { size: 13, fill: C.team2, weight: "bold" });
  const rows2 = [
    ["Kerrigan Voss", false, "6 / 8"],
    ["Hollow Warden Tharn", true, "5 / 7"],
    ["Mistral", true, "3 / 9"],
    ["Pale Rider Oswin the Unbroken", true, "2 / 6"],
  ];
  rows2.forEach(
    ([n, b, s], i) => (g += nameRow(x + 8, y + 226 + i * 34, w - 16, n, b, C.team2, s, false)),
  );
  g += text(x + 16, y + 400, "A long name wraps to a second line; the", { size: 11, fill: C.dim });
  g += text(x + 16, y + 416, "BOT chip is its own element and", { size: 11, fill: C.dim });
  g += text(x + 16, y + 432, "never takes the name's room.", { size: 11, fill: C.dim });
  return g;
}

// ---- 1. Player chart, desktop ----
function player() {
  const W = 1280,
    H = 720;
  let g = header(W, "Victory", C.team1);
  g += scoreboard(24, 104, 380);
  const cx = 420,
    cw = W - 24 - cx;
  g += rect(cx, 104, cw, 596);
  g += text(cx + 18, 134, "Aria Stormveil · your match", { size: 15, weight: "bold" });
  // Tabs
  const tabs = ["You", "Teams", "By skill"];
  tabs.forEach((t, i) => {
    const x = cx + cw - 18 - (tabs.length - i) * 104;
    g += rect(x, 114, 96, 28, {
      r: 14,
      fill: i === 0 ? "#1b3a52" : C.bg,
      stroke: i === 0 ? C.team1 : C.line,
    });
    g += text(x + 48, 133, t, { anchor: "middle", size: 12, fill: i === 0 ? C.team1 : C.dim });
  });
  // Chips
  let chx = cx + 18;
  SERIES.forEach((s, i) => {
    const c = chip(chx, 156, s.label, s.colour, i !== 3, s.dash);
    g += c.svg;
    chx += c.w;
  });
  const ch = chart(
    cx + 12,
    196,
    cw - 24,
    360,
    SERIES.filter((s) => s.id !== "energy"),
    {
      ticks: ["800", "600", "400", "200", "0"],
      hover: 186,
    },
  );
  g += ch.svg;
  // Hover readout
  const hx = ch.X(186) + 12;
  g += rect(hx, 214, 190, 82, { r: 6, fill: "#0e1116", stroke: C.ink });
  g += text(hx + 12, 234, "3:06", { size: 12, fill: C.dim });
  g += text(hx + 12, 252, "Damage dealt   612", { size: 12, fill: C.dealt });
  g += text(hx + 12, 268, "Damage taken   240", { size: 12, fill: C.taken });
  g += text(hx + 12, 284, "Kill: Pale Rider Oswin", { size: 12, fill: C.ink });
  g += legend(cx + 18, 572, [
    ["kill", "Kill"],
    ["death", "Death"],
    ["interrupt", "Interrupt"],
    ["capture", "Capture"],
    ["raise", "Resurrection"],
  ]);
  g += text(cx + 18, 612, "Totals: dealt 4 812 · taken 3 190 · healed 1 044", {
    size: 12,
    fill: C.dim,
  });
  g += text(
    cx + 18,
    632,
    "Chips toggle a series; off = hollow and dim. Lines differ by dash, not only colour.",
    { size: 11, fill: C.dim },
  );
  g += text(
    cx + 18,
    650,
    "Energy is off here and one click away; its axis is 0–100 %, scaled to the same height.",
    { size: 11, fill: C.dim },
  );
  return frame(W, H, g, "Post-match: your chart");
}

// ---- 2. Team chart, desktop ----
function teams() {
  const W = 1280,
    H = 720;
  let g = header(W, "Victory", C.team1);
  g += scoreboard(24, 104, 380);
  const cx = 420,
    cw = W - 24 - cx;
  g += rect(cx, 104, cw, 596);
  g += text(cx + 18, 134, "Both teams", { size: 15, weight: "bold" });
  const tabs = ["You", "Teams", "By skill"];
  tabs.forEach((t, i) => {
    const x = cx + cw - 18 - (tabs.length - i) * 104;
    g += rect(x, 114, 96, 28, {
      r: 14,
      fill: i === 1 ? "#1b3a52" : C.bg,
      stroke: i === 1 ? C.team1 : C.line,
    });
    g += text(x + 48, 133, t, { anchor: "middle", size: 12, fill: i === 1 ? C.team1 : C.dim });
  });
  let chx = cx + 18;
  for (const c of [
    chip(chx, 156, "Your team", C.team1, true),
    chip(chx + 130, 156, "Opponents", C.team2, true),
  ])
    g += c.svg;
  // Metric segmented control
  g += rect(cx + cw - 18 - 330, 156, 330, 28, { r: 14, fill: C.bg });
  g += rect(cx + cw - 18 - 330 + 2, 158, 160, 24, { r: 12, fill: "#1b3a52", stroke: C.team1 });
  g += text(cx + cw - 18 - 330 + 82, 175, "Health pool", {
    anchor: "middle",
    size: 12,
    fill: C.team1,
  });
  g += text(cx + cw - 18 - 330 + 250, 175, "Cumulative damage", {
    anchor: "middle",
    size: 12,
    fill: C.dim,
  });
  const pool = (start, drops) => {
    const out = [];
    let v = start;
    for (let t = 0; t <= DURATION; t += 4) {
      for (const [at, d] of drops) if (t === at) v -= d;
      v += 0.0015;
      out.push(Math.max(0, Math.min(1, v)));
    }
    return out;
  };
  const dmg = (rate) => {
    let acc = 0;
    return burst(1, beats).map((v) => (acc += v * rate));
  };
  const half = { top: 196, height: 250 };
  const a = chart(
    cx + 12,
    half.top,
    cw - 24,
    half.height,
    [
      {
        label: "t1",
        colour: C.team1,
        values: pool(1, [
          [44, 0.1],
          [84, 0.25],
          [120, 0.1],
          [180, 0.2],
          [196, 0.15],
        ]),
        area: true,
      },
      {
        label: "t2",
        colour: C.team2,
        values: pool(1, [
          [40, 0.05],
          [80, 0.2],
          [96, 0.2],
          [186, 0.25],
          [196, 0.2],
          [212, 0.1],
        ]),
        area: true,
      },
    ],
    {
      ticks: ["100 %", "75 %", "50 %", "25 %", "0"],
      events: events.filter((e) => e[1] !== "interrupt" || true),
    },
  );
  g += a.svg;
  const raw1 = dmg(0.012),
    raw2 = dmg(0.01);
  const mx = Math.max(raw1.at(-1), raw2.at(-1));
  const b = chart(
    cx + 12,
    half.top + half.height + 12,
    cw - 24,
    220,
    [
      { label: "t1", colour: C.team1, dash: "7 4", values: raw1.map((v) => v / mx) },
      { label: "t2", colour: C.team2, dash: "7 4", values: raw2.map((v) => v / mx) },
    ],
    { ticks: ["10 k", "7.5 k", "5 k", "2.5 k", "0"], events: [] },
  );
  g += b.svg;
  g += text(cx + 28, half.top + half.height + 4, "", {});
  g += legend(cx + 18, 680, [
    ["kill", "Kill"],
    ["death", "Death"],
    ["interrupt", "Interrupt"],
    ["capture", "Capture"],
    ["raise", "Resurrection"],
  ]);
  g += text(cx + cw - 18, 691, "Top: health pool, solid · bottom: cumulative damage, dashed", {
    anchor: "end",
    size: 11,
    fill: C.dim,
  });
  return frame(W, H, g, "Post-match: both teams");
}

// ---- 3. Phone, fixed layout ----
function phone() {
  const W = 390,
    H = 844;
  let g = rect(10, 10, W - 20, 96, { fill: C.panel, stroke: C.team1 });
  g += text(26, 48, "Victory", { size: 24, fill: C.team1, weight: "bold" });
  g += text(26, 70, "Team Arena · Ember Pits · 4:00", { size: 11, fill: C.dim });
  g += text(26, 90, "Your team won 12 – 9 on kills", { size: 11 });
  // Scoreboard collapsed
  g += rect(10, 116, W - 20, 150);
  g += text(24, 138, "Scores", { size: 12, fill: C.dim });
  const rr = [
    ["Aria Stormveil (you)", false, "12 / 3", C.team1, true],
    ["Brom Ironhide", false, "7 / 5", C.team1, false],
    ["Wandering Ember Knight", true, "4 / 6", C.team1, false],
  ];
  rr.forEach(
    ([n, bt, s, col, me], i) => (g += nameRow(14, 146 + i * 32, W - 28, n, bt, col, s, me)),
  );
  g += text(W / 2, 252, "Show all 8 ▾", { anchor: "middle", size: 12, fill: C.team1 });
  // Chart card
  g += rect(10, 276, W - 20, 486);
  const tabs = ["You", "Teams", "By skill"];
  tabs.forEach((t, i) => {
    const x = 20 + i * 118;
    g += rect(x, 286, 112, 30, {
      r: 15,
      fill: i === 0 ? "#1b3a52" : C.bg,
      stroke: i === 0 ? C.team1 : C.line,
    });
    g += text(x + 56, 306, t, { anchor: "middle", size: 12, fill: i === 0 ? C.team1 : C.dim });
  });
  let cx = 20,
    cy = 328;
  SERIES.forEach((s, i) => {
    const c = chip(cx, cy, s.label.replace("Damage ", "Dmg "), s.colour, i !== 3, s.dash);
    if (cx + c.w > W - 20) {
      cx = 20;
      cy += 34;
    }
    g += chip(cx, cy, s.label.replace("Damage ", "Dmg "), s.colour, i !== 3, s.dash).svg;
    cx += c.w;
  });
  const ch = chart(
    14,
    cy + 40,
    W - 28,
    270,
    SERIES.filter((s) => s.id !== "energy"),
    {
      ticks: ["800", "600", "400", "200", "0"],
    },
  );
  g += ch.svg;
  g += legend(20, cy + 322, [
    ["kill", "Kill"],
    ["death", "Death"],
    ["interrupt", "Int."],
  ]);
  g += legend(20, cy + 344, [
    ["capture", "Capture"],
    ["raise", "Resurrect"],
  ]);
  g += text(20, cy + 378, "Tap the chart for a readout; chips toggle.", { size: 11, fill: C.dim });
  // Sticky footer, clear of every chart
  g += `<rect x="0" y="${H - 72}" width="${W}" height="72" fill="${C.bg}"/><line x1="0" x2="${W}" y1="${H - 72}" y2="${H - 72}" stroke="${C.line}"/>`;
  g += button(12, H - 58, 170, "Rematch", true);
  g += button(W - 12 - 170, H - 58, 170, "Back to lobby", false);
  return frame(W, H, g, "Post-match: phone");
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, svg] of [
  ["player", player()],
  ["teams", teams()],
  ["phone", phone()],
]) {
  const file = path.join(OUT, `3561-postmatch-${name}`);
  fs.writeFileSync(`${file}.svg`, svg);
  execFileSync("inkscape", [`${file}.svg`, "-o", `${file}.png`]);
  execFileSync("convert", [`${file}.png`, "-strip", "-colors", "96", `PNG8:${file}.png`]);
  console.log(`${file}.png ${String(fs.statSync(`${file}.png`).size)} bytes`);
}
