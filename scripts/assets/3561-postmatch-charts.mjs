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
  const left = o.left ?? 46,
    right = 14,
    top = 14,
    strip = o.strip ?? 34,
    bottom = o.labels === false ? 4 : o.compact ? 16 : 22;
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
  for (let t = 0; t <= DURATION; t += o.compact ? 120 : 60) {
    if (o.labels !== false)
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

// Same data in every option.
const poolSeries = (start, drops) => {
  const out = [];
  let v = start;
  for (let t = 0; t <= DURATION; t += 4) {
    for (const [at, d] of drops) if (t === at) v -= d;
    v += 0.0015;
    out.push(Math.max(0, Math.min(1, v)));
  }
  return out;
};
const cumulative = (rate) => {
  let acc = 0;
  return burst(1, beats).map((v) => (acc += v * rate));
};
const POOL1 = poolSeries(1, [
  [44, 0.1],
  [84, 0.25],
  [120, 0.1],
  [180, 0.2],
  [196, 0.15],
]);
const POOL2 = poolSeries(1, [
  [40, 0.05],
  [80, 0.2],
  [96, 0.2],
  [186, 0.25],
  [196, 0.2],
  [212, 0.1],
]);
const CUM1 = cumulative(0.012);
const CUM2 = cumulative(0.01);
const CUMMAX = Math.max(CUM1.at(-1), CUM2.at(-1));
const TEAM_HEALTH = [
  { colour: C.team1, values: POOL1, area: true },
  { colour: C.team2, values: POOL2, area: true },
];
const TEAM_DAMAGE = [
  { colour: C.team1, dash: "7 4", values: CUM1.map((v) => v / CUMMAX) },
  { colour: C.team2, dash: "7 4", values: CUM2.map((v) => v / CUMMAX) },
];
const EVENT_TEXT = {
  kill: "Aria killed Oswin",
  death: "Brom died",
  interrupt: "Aria interrupted Mistral",
  capture: "Shrine captured",
  raise: "Calindra raised Brom",
};
const LEGEND = [
  ["kill", "Kill"],
  ["death", "Death"],
  ["interrupt", "Interrupt"],
  ["capture", "Capture"],
  ["raise", "Resurrection"],
];
const PANEL = { x: 420, y: 104, w: 1280 - 24 - 420, h: 596 };

/** A segmented control of `labels`, the `on`th selected. */
function segmented(x, y, labels, on, width = 96) {
  let g = "";
  labels.forEach((t, i) => {
    const sx = x + i * (width + 8);
    g += rect(sx, y, width, 28, {
      r: 14,
      fill: i === on ? "#1b3a52" : C.bg,
      stroke: i === on ? C.team1 : C.line,
    });
    g += text(sx + width / 2, y + 19, t, {
      anchor: "middle",
      size: 12,
      fill: i === on ? C.team1 : C.dim,
    });
  });
  return g;
}

function chips(x, y, on = [true, true, true, false]) {
  let g = "";
  let cx = x;
  SERIES.forEach((s, i) => {
    const c = chip(cx, y, s.label, s.colour, on[i], s.dash);
    g += c.svg;
    cx += c.w;
  });
  return g;
}

function shell(title, label) {
  let g = header(1280, "Victory", C.team1) + scoreboard(24, 104, 380);
  g += rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  g += text(PANEL.x + 18, 134, label, { size: 15, weight: "bold" });
  return g;
}

// ---- A. Stacked: You on top, Teams below, ONE event lane for both ----
function optionA() {
  let g = shell("A", "Option A · one page, two stacked charts, one event lane");
  const { x, w } = PANEL;
  g += chips(x + 18, 150);
  const cx = x + 12,
    cw = w - 24;
  const you = chart(
    cx,
    190,
    cw,
    190,
    SERIES.filter((s) => s.id !== "energy"),
    {
      ticks: ["800", "600", "400", "200", "0"],
      strip: 0,
      events: [],
      labels: false,
    },
  );
  g += you.svg;
  g +=
    rect(cx + 50, 194, 40, 18, { r: 4, fill: C.panel, stroke: C.panel }) +
    text(cx + 56, 207, "You", { size: 12, fill: C.ink, weight: "bold" });
  const teams = chart(
    cx,
    388,
    cw,
    150,
    [...TEAM_HEALTH, ...TEAM_DAMAGE.map((s) => ({ ...s }))].slice(0, 2),
    {
      ticks: ["100 %", "75 %", "50 %", "25 %", "0"],
      strip: 0,
      events: [],
      labels: false,
    },
  );
  g += teams.svg;
  g +=
    rect(cx + 50, 392, 188, 18, { r: 4, fill: C.panel, stroke: C.panel }) +
    text(cx + 56, 405, "Both teams · health pool", { size: 12, fill: C.ink, weight: "bold" });
  // The lane: events at the foot, rules up through both charts.
  g += rect(cx, 546, cw, 100);
  const laneY = 580;
  g += `<line x1="${you.X(0)}" x2="${you.X(DURATION)}" y1="${laneY}" y2="${laneY}" stroke="${C.line}"/>`;
  for (const [t, kind] of events) {
    g += `<line x1="${you.X(t)}" x2="${you.X(t)}" y1="${you.py}" y2="${laneY - 9}" stroke="${C.dim}" stroke-width="1" opacity="0.28"/>`;
    g += marker(kind, you.X(t), laneY);
  }
  for (let t = 0; t <= DURATION; t += 60) {
    g += text(you.X(t), 612, `${Math.floor(t / 60)}:00`, {
      anchor: "middle",
      fill: C.dim,
      size: 11,
    });
  }
  g += legend(cx + 14, 624, LEGEND);
  g += text(
    cx,
    672,
    "One shared time axis: the same moment lines up in both charts. The lane carries every event.",
    { size: 11, fill: C.dim },
  );
  g += text(
    cx,
    690,
    "Energy and cumulative damage sit behind chips. Phone: the two charts stack as they are.",
    { size: 11, fill: C.dim },
  );
  return frame(1280, 720, g, "Option A");
}

// ---- B. Small multiples: a card per measure, each with its own total ----
function optionB() {
  let g = shell("B", "Option B · a grid of small charts, one measure each");
  const { x, w } = PANEL;
  const pad = 12,
    gap = 8;
  const cols = 4;
  const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
  g += text(x + 18, 160, "You", { size: 12, fill: C.dim, weight: "bold" });
  const cards = [
    ["Damage dealt", "4 812", dealt, C.dealt, undefined],
    ["Damage taken", "3 190", taken, C.taken, "7 4"],
    ["Healing", "1 044", heal, C.heal, "2 3"],
    ["Energy", "avg 62 %", SERIES[3].values, C.energy, "10 3 2 3"],
  ];
  cards.forEach(([label, total, values, colour, dash], i) => {
    const cx = x + pad + i * (cw + gap);
    g += rect(cx, 168, cw, 186, { stroke: colour });
    g += text(cx + 12, 190, label, { size: 12, fill: colour, weight: "bold" });
    g += text(cx + 12, 214, total, { size: 20 });
    const c = chart(cx + 2, 220, cw - 4, 130, [{ colour, dash, values, area: i === 0 }], {
      left: 22,
      strip: 16,
      compact: true,
      events: events.filter((e) => e[1] === "kill" || e[1] === "death"),
    });
    g += c.svg.replace(/^<rect[^>]*\/>/, "");
  });
  g += text(x + 18, 384, "Teams", { size: 12, fill: C.dim, weight: "bold" });
  const wide = cw * 2 + gap;
  const team = [
    ["Health pool", "29 % · 34 %", TEAM_HEALTH, ["100 %", "75 %", "50 %", "25 %", "0"], true],
    [
      "Cumulative damage",
      "10.0 k · 8.4 k",
      TEAM_DAMAGE,
      ["10 k", "7.5 k", "5 k", "2.5 k", "0"],
      false,
    ],
  ];
  team.forEach(([label, total, series, ticks, withEvents], i) => {
    const cx = x + pad + i * (wide + gap);
    g += rect(cx, 392, wide, 218, { stroke: C.accent ?? C.team1 });
    g += text(cx + 12, 414, label, { size: 12, weight: "bold" });
    g += text(cx + wide - 12, 414, total, { size: 12, anchor: "end", fill: C.dim });
    const c = chart(cx + 2, 420, wide - 4, 186, series, {
      ticks,
      strip: 24,
      compact: true,
      events: withEvents ? events : [],
    });
    g += c.svg.replace(/^<rect[^>]*\/>/, "");
  });
  g += legend(x + 18, 630, LEGEND);
  g += text(
    x + 18,
    666,
    "Every measure has its own scale and its own total: nothing to toggle, nothing hidden.",
    { size: 11, fill: C.dim },
  );
  g += text(x + 18, 684, "Tap a card to open it full width. Phone: two columns, then one.", {
    size: 11,
    fill: C.dim,
  });
  return frame(1280, 720, g, "Option B");
}

// ---- C. One big chart, overlay chips, an event list beside it ----
function optionC() {
  let g = shell("C", "Option C · one big chart, overlays by chips, the events as a list");
  const { x, w } = PANEL;
  const listW = 250;
  g += segmented(x + 18, 150, ["You", "Teams", "Overlay"], 0, 84);
  g += chips(x + 18, 190);
  const cw = w - listW - 30;
  const c = chart(
    x + 12,
    232,
    cw,
    330,
    SERIES.filter((s) => s.id !== "energy"),
    {
      ticks: ["800", "600", "400", "200", "0"],
      hover: 186,
    },
  );
  g += c.svg;
  g += rect(x + 12 + c.X(186) - (x + 12) - 90 + 6, 246, 0, 0, { fill: "none", stroke: "none" });
  // The teams view as a one-tap preview underneath.
  g += rect(x + 12, 574, cw, 114, { fill: C.bg });
  g += text(x + 26, 592, "Teams · tap to open", { size: 11, fill: C.dim });
  const mini = chart(x + 120, 596, cw - 116, 88, TEAM_HEALTH, {
    left: 6,
    strip: 0,
    events: [],
    labels: false,
  });
  g += mini.svg.replace(/^<rect[^>]*\/>/, "");
  // The event list.
  const lx = x + w - listW - 12;
  g += rect(lx, 150, listW, 538, { fill: C.bg });
  g += text(lx + 14, 174, "Events", { size: 13, weight: "bold" });
  events.forEach(([t, kind], i) => {
    const ry = 188 + i * 54;
    const on = t === 186;
    g += rect(lx + 6, ry, listW - 12, 48, {
      r: 5,
      fill: on ? "#1c232d" : C.bg,
      stroke: on ? C.ink : C.bg,
    });
    g += marker(kind, lx + 26, ry + 24);
    g += text(lx + 46, ry + 20, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, {
      size: 12,
      fill: C.dim,
    });
    g += text(lx + 46, ry + 37, EVENT_TEXT[kind].slice(0, 26), { size: 11 });
  });
  g += text(x + 18, 700, "", {});
  return frame(1280, 720, g, "Option C");
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, svg] of [
  ["a-stacked", optionA()],
  ["b-grid", optionB()],
  ["c-list", optionC()],
]) {
  const file = path.join(OUT, `3561-postmatch-${name}`);
  fs.writeFileSync(`${file}.svg`, svg);
  execFileSync("inkscape", [`${file}.svg`, "-o", `${file}.png`]);
  execFileSync("convert", [`${file}.png`, "-strip", "-colors", "96", `PNG8:${file}.png`]);
  console.log(`${file}.png ${String(fs.statSync(`${file}.png`).size)} bytes`);
}
