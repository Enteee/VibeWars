import type { WireChartEvent, WireChartSeries, WireMatchChart } from "@vibewars/game-protocol";

import { t, type MessageKey } from "../i18n/index.js";
import { markedForTeam, teamSide } from "../render/arena-snapshot.js";
import type { SummaryTable } from "./match-summary.js";
import { button, h } from "./kit.js";

/**
 * The post-match charts (#3565): beside the summary's tables, a panel with
 * tabs *You* and *Teams*, each a line chart of the match the host recorded
 * (#3564) over one strip of event marks. Inline SVG, no chart library: the
 * helpers here are pure, `renderMatchCharts` draws what they give.
 */

const SVG = "http://www.w3.org/2000/svg";

/** The plot's own units; it is stretched to its box, its strokes are not. */
const PLOT = 1000;

/** A mark's width in pixels, and the least room between two in one row. */
const MARK_PX = 12;

/** The most rows the strip nudges marks into; past it they share the top row. */
export const MARK_ROWS = 3;

/** How a line is drawn, besides its colour, so it reads without colour. */
export type Dash = "solid" | "dashed" | "dotted" | "dash-dot";

const DASH_ARRAYS: Readonly<Record<Dash, string | undefined>> = {
  solid: undefined,
  dashed: "8 5",
  dotted: "2 4",
  "dash-dot": "9 4 2 4",
};

/** A team's line dash, by its order in the chart. */
const TEAM_DASHES: readonly Dash[] = ["solid", "dashed", "dotted"];

/** An event mark's glyph (operator option A on #3561). */
export type MarkShape = "kill" | "death" | "interrupt" | "objective" | "resurrected";

const MARK_SHAPES: readonly MarkShape[] = [
  "kill",
  "death",
  "interrupt",
  "objective",
  "resurrected",
];

/** Each glyph in a 10 by 10 box: filled, or stroked where it is a cross. */
const GLYPHS: Readonly<Record<MarkShape, { readonly d: string; readonly filled: boolean }>> = {
  kill: { d: "M5 0L10 5L5 10L0 5Z", filled: true },
  death: { d: "M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5", filled: false },
  interrupt: { d: "M6.5 0L1 6H4.5L3.5 10L9 4H5.5Z", filled: true },
  objective: { d: "M2 10V0.5L9 3L2 5.5", filled: true },
  resurrected: { d: "M5 0.5L9.5 9.5H0.5Z", filled: true },
};

const MARK_LABELS: Readonly<Record<MarkShape, MessageKey>> = {
  kill: "matchCharts.kill",
  death: "matchCharts.death",
  interrupt: "matchCharts.interrupt",
  objective: "matchCharts.objective",
  resurrected: "matchCharts.resurrection",
};

/** A mark's colour where it is not a team's. */
const MARK_COLOURS: Readonly<Record<MarkShape, string>> = {
  kill: "var(--ink)",
  death: "var(--damage)",
  interrupt: "var(--elite)",
  objective: "var(--accent)",
  resurrected: "var(--scaled)",
};

/** Who was in the match: the summary's rows, as the charts name them. */
export interface ChartRoster {
  /** `undefined` for a spectator. */
  readonly selfId: string | undefined;
  readonly selfTeam: number | undefined;
  readonly players: ReadonlyMap<string, { readonly name: string; readonly team: number }>;
}

/** The roster the summary's tables hold. */
export function chartRoster(tables: readonly SummaryTable[]): ChartRoster {
  const players = new Map<string, { readonly name: string; readonly team: number }>();
  let self: { readonly id: string; readonly team: number } | undefined;
  for (const { lines } of tables) {
    for (const { row, self: isSelf } of lines) {
      players.set(row.id, { name: row.name, team: row.team });
      if (isSelf) {
        self = { id: row.id, team: row.team };
      }
    }
  }
  return { selfId: self?.id, selfTeam: self?.team, players };
}

/** One line of a panel. */
export interface ChartLine {
  /** The legend entry that shows or hides it. */
  readonly legend: string;
  readonly label: string;
  readonly colour: string;
  readonly dash: Dash;
  readonly values: readonly number[];
  /** The first sample drawn: a guest who joined late has none before it. */
  readonly start: number;
  /** The right axis is a percentage, 0 to 100; the left one fits the lines on it. */
  readonly axis: "left" | "right";
  /** A percentage on the left axis too, as a team's health pool is. */
  readonly percent?: boolean;
}

/** One plot; the *Teams* chart stacks two on one time axis. */
export interface ChartPanel {
  readonly label: string;
  readonly lines: readonly ChartLine[];
}

export interface LegendEntry {
  readonly key: string;
  readonly label: string;
  readonly colour: string;
  readonly dash: Dash;
}

/** One event on the strip, at `t` seconds. */
export interface ChartMark {
  readonly t: number;
  readonly shape: MarkShape;
  readonly colour: string;
  readonly text: string;
}

/** What one tab draws. */
export interface ChartView {
  readonly title: string;
  readonly legend: readonly LegendEntry[];
  readonly panels: readonly ChartPanel[];
  readonly marks: readonly ChartMark[];
  readonly samples: number;
  readonly period: number;
}

/** `seconds` as m:ss. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

/** Maps `[d0, d1]` onto `[r0, r1]`; a domain of no width maps to `r0`. */
export function scale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** The least round number at or over `value`, for an axis's top: 1, 2 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= value) ?? 10;
  return step * power;
}

/** Seconds at the end of sample `index`; the time axis runs from 0 to the last. */
export function sampleTime(index: number, period: number): number {
  return (index + 1) * period;
}

/**
 * An SVG path through `values` from `start` on, `x` and `y` in plot units;
 * empty when fewer than two samples are drawn, which get points instead.
 */
export function linePath(
  values: readonly number[],
  start: number,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  if (values.length - start < 2) {
    return "";
  }
  return values
    .slice(start)
    .map((value, i) => `${i === 0 ? "M" : "L"}${fix(x(start + i))} ${fix(y(value))}`)
    .join("");
}

function fix(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * Each mark's row on the strip, in order of `xs` (pixels): row 0 unless it
 * would touch an earlier mark there, then one row up, up to `MARK_ROWS`.
 */
export function layoutMarks(xs: readonly number[], gap = MARK_PX + 2): number[] {
  const order = xs.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x || a.index - b.index);
  const last: number[] = [];
  const rows = new Array<number>(xs.length).fill(0);
  for (const { x, index } of order) {
    let row = last.findIndex((end) => x - end >= gap);
    if (row === -1) {
      row = last.length < MARK_ROWS ? last.length : 0;
    }
    last[row] = x;
    rows[index] = row;
  }
  return rows;
}

/** The first sample a player is in: before it they had not joined. */
export function firstSample(series: WireChartSeries): number {
  const at = series.health.findIndex(
    (health, i) =>
      health > 0 ||
      (series.energy[i] ?? 0) > 0 ||
      (series.dealt[i] ?? 0) > 0 ||
      (series.taken[i] ?? 0) > 0 ||
      (series.healed[i] ?? 0) > 0,
  );
  return at === -1 ? series.health.length : at;
}

/** A team's name as the summary captions it. */
function teamName(team: number, roster: ChartRoster): string {
  if (team === roster.selfTeam) {
    return t("summary.yourTeam");
  }
  const teams = new Set([...roster.players.values()].map((player) => player.team));
  if (roster.selfTeam !== undefined && teams.size <= 2) {
    return t("summary.theirTeam");
  }
  return markedForTeam(teamSide(team, roster.selfTeam ?? 0), t("summary.team", { team: team + 1 }));
}

/** A team's colour, as the game shows it to you. */
function teamColour(team: number, roster: ChartRoster): string {
  const side = teamSide(team, roster.selfTeam ?? 0);
  return side === "ally"
    ? "var(--accent)"
    : side === "enemy"
      ? "var(--damage)"
      : "var(--third-team)";
}

/** What a mark says on hover: "2:14 — Mira died (killed by Bot Ash)". */
export function eventText(event: WireChartEvent, roster: ChartRoster): string {
  const name = (id: string): string => roster.players.get(id)?.name ?? id;
  const time = clock(event.t);
  switch (event.kind) {
    case "death":
      return event.by === null
        ? t("matchCharts.died", { time, name: name(event.id) })
        : t("matchCharts.killed", { time, name: name(event.id), killer: name(event.by) });
    case "resurrected":
      return t("matchCharts.resurrected", { time, name: name(event.id) });
    case "interrupt":
      return t("matchCharts.interrupted", { time, by: name(event.by), name: name(event.id) });
    case "objective": {
      const team = teamName(event.team, roster);
      const key: MessageKey =
        event.what === "point"
          ? "matchCharts.tookPoint"
          : event.what === "stand"
            ? "matchCharts.tookStand"
            : "matchCharts.tookAltar";
      return t(key, { time, team });
    }
  }
}

/** The *You* chart: your damage, taken and healing, and your energy; your own events. */
export function youView(chart: WireMatchChart, roster: ChartRoster): ChartView | undefined {
  const selfId = roster.selfId;
  const series = chart.players.find(({ id }) => id === selfId);
  if (selfId === undefined || series === undefined) {
    return undefined;
  }
  const start = firstSample(series);
  const line = (
    legend: "dealt" | "taken" | "healed" | "energy",
    colour: string,
    dash: Dash,
  ): ChartLine => ({
    legend,
    label: t(`matchCharts.${legend}`),
    colour,
    dash,
    values: series[legend],
    start,
    axis: legend === "energy" ? "right" : "left",
  });
  const lines = [
    line("dealt", "var(--damage)", "solid"),
    line("taken", "var(--elite)", "dashed"),
    line("healed", "var(--scaled)", "dotted"),
    line("energy", "var(--accent)", "dash-dot"),
  ];
  const marks: ChartMark[] = [];
  for (const event of chart.events) {
    const shape = youShape(event, selfId);
    if (shape !== undefined) {
      const colour =
        event.kind === "objective" ? teamColour(event.team, roster) : MARK_COLOURS[shape];
      marks.push({ t: event.t, shape, colour, text: eventText(event, roster) });
    }
  }
  return {
    title: roster.players.get(selfId)?.name ?? selfId,
    legend: lines.map(({ legend, label, colour, dash }) => ({ key: legend, label, colour, dash })),
    panels: [{ label: t("matchCharts.you"), lines }],
    marks,
    samples: series.health.length,
    period: chart.period,
  };
}

/** The glyph an event is on *You*, or `undefined` when it is not yours. */
function youShape(event: WireChartEvent, selfId: string): MarkShape | undefined {
  switch (event.kind) {
    case "death":
      return event.id === selfId ? "death" : event.by === selfId ? "kill" : undefined;
    case "resurrected":
      return event.id === selfId ? "resurrected" : undefined;
    case "interrupt":
      return event.id === selfId || event.by === selfId ? "interrupt" : undefined;
    case "objective":
      return "objective";
  }
}

/** The *Teams* chart: each team's health pool over its damage dealt; deaths and objectives. */
export function teamsView(chart: WireMatchChart, roster: ChartRoster): ChartView {
  const teams = [...new Set([...roster.players.values()].map(({ team }) => team))].sort((a, b) =>
    a === roster.selfTeam ? -1 : b === roster.selfTeam ? 1 : a - b,
  );
  const samples = Math.max(0, ...chart.players.map(({ health }) => health.length));
  const legend: LegendEntry[] = teams.map((team, order) => ({
    key: `team-${String(team)}`,
    label: teamName(team, roster),
    colour: teamColour(team, roster),
    dash: TEAM_DASHES[order % TEAM_DASHES.length] ?? "solid",
  }));
  const members = (team: number): readonly WireChartSeries[] =>
    chart.players.filter(({ id }) => roster.players.get(id)?.team === team);
  const pool: ChartLine[] = [];
  const dealt: ChartLine[] = [];
  teams.forEach((team, order) => {
    const entry = legend[order];
    if (entry === undefined) {
      return;
    }
    const of = members(team);
    const starts = of.map(firstSample);
    const start = Math.min(samples, ...starts);
    const health: number[] = [];
    const damage: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const present = of.filter((_, m) => (starts[m] ?? samples) <= i);
      const sum = (key: "health" | "dealt"): number =>
        present.reduce((total, series) => total + (series[key][i] ?? 0), 0);
      health.push(present.length === 0 ? 0 : Math.round(sum("health") / present.length));
      damage.push(sum("dealt"));
    }
    const base = { legend: entry.key, label: entry.label, colour: entry.colour, dash: entry.dash };
    pool.push({ ...base, values: health, start, axis: "left", percent: true });
    dealt.push({ ...base, values: damage, start, axis: "left" });
  });
  const marks: ChartMark[] = [];
  for (const event of chart.events) {
    if (event.kind === "death") {
      const team = roster.players.get(event.id)?.team;
      if (team !== undefined) {
        const colour = teamColour(team, roster);
        marks.push({ t: event.t, shape: "death", colour, text: eventText(event, roster) });
      }
    } else if (event.kind === "objective") {
      const colour = teamColour(event.team, roster);
      marks.push({ t: event.t, shape: "objective", colour, text: eventText(event, roster) });
    }
  }
  return {
    title: t("matchCharts.everyTeam"),
    legend,
    panels: [
      { label: t("matchCharts.pool"), lines: pool },
      { label: t("matchCharts.dealt"), lines: dealt },
    ],
    marks,
    samples,
    period: chart.period,
  };
}

/** The time axis's ticks, in seconds: at most five, on a round step. */
export function timeTicks(end: number): number[] {
  const step = [15, 30, 60, 120, 300, 600, 1200].find((s) => end / s <= 5) ?? 1800;
  const ticks: number[] = [];
  for (let at = 0; at <= end; at += step) {
    ticks.push(at);
  }
  return ticks;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  return node;
}

/** A glyph or a line sample, `size` pixels square, for the strip and the legend. */
function glyph(shape: MarkShape, colour: string): SVGSVGElement {
  const icon = svg("svg", { viewBox: "-1 -1 12 12", "aria-hidden": "true", class: "chart-glyph" });
  const { d, filled } = GLYPHS[shape];
  icon.appendChild(
    svg("path", {
      d,
      style: filled
        ? `fill: ${colour}; stroke: ${colour}; stroke-width: 0.6`
        : `fill: none; stroke: ${colour}; stroke-width: 2`,
    }),
  );
  return icon;
}

function swatch(colour: string, dash: Dash): SVGSVGElement {
  const icon = svg("svg", { viewBox: "0 0 24 6", "aria-hidden": "true", class: "chart-swatch" });
  const line = svg("line", { x1: "0", y1: "3", x2: "24", y2: "3" });
  line.setAttribute("style", `stroke: ${colour}`);
  const dashes = DASH_ARRAYS[dash];
  if (dashes !== undefined) {
    line.setAttribute("stroke-dasharray", dashes);
  }
  icon.appendChild(line);
  return icon;
}

/** One panel's plot: grid, axis labels, lines or points, and the cursor's line. */
/** One shape a panel draws: a series' line, or a dot where it has too few samples. */
export interface PanelShape {
  readonly legend: string;
  readonly kind: "line" | "point";
  readonly d: string;
  readonly colour: string;
  readonly dash: Dash;
}

/**
 * What one panel draws in plot units, the series in `hidden` left out:
 * the left axis's top, whether it is a percentage, and the shapes.
 */
export function panelShapes(
  panel: ChartPanel,
  hidden: ReadonlySet<string>,
  x: (index: number) => number,
): {
  readonly top: number;
  readonly percent: boolean;
  readonly right: boolean;
  readonly shapes: readonly PanelShape[];
} {
  const lines = panel.lines.filter(({ legend }) => !hidden.has(legend));
  const left = lines.filter(({ axis }) => axis === "left");
  const percent = panel.lines.some((line) => line.axis === "left" && line.percent === true);
  const top = percent ? 100 : niceMax(Math.max(0, ...left.flatMap(({ values }) => values)));
  const yLeft = scale([0, top], [PLOT, 0]);
  const yRight = scale([0, 100], [PLOT, 0]);
  const shapes: PanelShape[] = [];
  for (const line of lines) {
    const y = line.axis === "left" ? yLeft : yRight;
    const { legend, colour, dash } = line;
    const d = linePath(line.values, line.start, x, y);
    if (d === "") {
      // Too short for a line: each sample a round dot, unstretched.
      line.values.slice(line.start).forEach((value, i) => {
        const at = `M${fix(x(line.start + i))} ${fix(y(value))}h0.01`;
        shapes.push({ legend, kind: "point", d: at, colour, dash });
      });
    } else {
      shapes.push({ legend, kind: "line", d, colour, dash });
    }
  }
  return { top, percent, right: lines.some(({ axis }) => axis === "right"), shapes };
}

function drawPanel(
  panel: ChartPanel,
  hidden: ReadonlySet<string>,
  x: (index: number) => number,
): { readonly root: HTMLElement; readonly cursor: HTMLElement } {
  const root = h("div", "match-chart-panel");
  const { top, percent, right: hasRight, shapes } = panelShapes(panel, hidden, x);
  const plot = svg("svg", {
    viewBox: `0 0 ${String(PLOT)} ${String(PLOT)}`,
    preserveAspectRatio: "none",
    class: "match-chart-plot",
    "aria-hidden": "true",
  });
  const axis = h("div", "match-chart-axis");
  for (const step of [0, 1, 2, 3, 4]) {
    const at = (step / 4) * PLOT;
    plot.appendChild(
      svg("line", {
        x1: "0",
        x2: String(PLOT),
        y1: String(at),
        y2: String(at),
        class: "match-chart-grid",
      }),
    );
    const value = (top * (4 - step)) / 4;
    const label = h("span", "match-chart-tick", percent ? `${String(value)}%` : compact(value));
    label.style.top = `${String((step / 4) * 100)}%`;
    axis.appendChild(label);
  }
  for (const shape of shapes) {
    const path = svg("path", {
      d: shape.d,
      class: `match-chart-${shape.kind}`,
      "data-legend": shape.legend,
      style: `stroke: ${shape.colour}`,
    });
    const dashes = DASH_ARRAYS[shape.dash];
    if (shape.kind === "line" && dashes !== undefined) {
      path.setAttribute("stroke-dasharray", dashes);
    }
    plot.appendChild(path);
  }
  const area = h("div", "match-chart-area");
  const cursor = h("div", "match-chart-cursor");
  cursor.hidden = true;
  area.append(plot, cursor, h("span", "match-chart-panel-label", panel.label));
  // Every panel has the column, so their plots line up on the time axis.
  const right = h("div", "match-chart-axis is-right");
  if (hasRight) {
    for (const step of [0, 2, 4]) {
      const label = h("span", "match-chart-tick", `${String(100 - step * 25)}%`);
      label.style.top = `${String((step / 4) * 100)}%`;
      right.appendChild(label);
    }
  }
  root.append(axis, area, right);
  return { root, cursor };
}

/** 12345 as "12.3k", for an axis label. */
function compact(value: number): string {
  return value >= 1000 ? `${String(Math.round(value / 100) / 10)}k` : String(Math.round(value));
}

/**
 * Draw `view` into `host`: its panels on one time axis, the strip of
 * marks, the legend's toggles and the hover readout. Redrawn whole when a
 * series is shown or hidden; the cursor only moves.
 */
function drawView(host: HTMLElement, view: ChartView): void {
  const hidden = new Set<string>();
  const end = timeEnd(view);
  const xPlot = (index: number): number =>
    scale([0, end], [0, PLOT])(sampleTime(index, view.period));
  const draw = (focusKey?: string): void => {
    host.replaceChildren();
    host.appendChild(h("div", "match-charts-title", view.title));
    const panels = view.panels.map((panel) => drawPanel(panel, hidden, xPlot));
    const stack = h("div", "match-chart-stack");
    stack.tabIndex = 0;
    stack.setAttribute("role", "group");
    stack.setAttribute("aria-label", t("matchCharts.plotHelp"));
    const readout = h("div", "match-chart-readout");
    readout.hidden = true;
    readout.setAttribute("aria-live", "polite");
    for (const { root } of panels) {
      stack.appendChild(root);
    }
    stack.appendChild(readout);
    const times = h("div", "match-chart-times");
    for (const at of timeTicks(end)) {
      const tick = h("span", "match-chart-tick", clock(at));
      tick.style.left = `${String((at / end) * 100)}%`;
      times.appendChild(tick);
    }
    const strip = h("div", "match-chart-strip");
    strip.setAttribute("aria-label", t("matchCharts.events"));
    strip.setAttribute("role", "group");
    const marks = view.marks.map((mark) => {
      const node = h("button", "match-chart-mark");
      node.setAttribute("type", "button");
      node.dataset.shape = mark.shape;
      node.setAttribute("aria-label", mark.text);
      node.style.left = `${String(markX(mark.t, view) * 100)}%`;
      node.appendChild(glyph(mark.shape, mark.colour));
      const tip = h("span", "match-chart-tip", mark.text);
      tip.setAttribute("role", "tooltip");
      node.appendChild(tip);
      strip.appendChild(node);
      return { mark, node };
    });
    const place = (): void => {
      const width = strip.clientWidth > 0 ? strip.clientWidth : 600;
      const rows = layoutMarks(marks.map(({ mark }) => markX(mark.t, view) * width));
      marks.forEach(({ node }, i) => {
        node.style.setProperty("--row", String(rows[i] ?? 0));
      });
    };
    const legend = h("div", "match-chart-legend");
    for (const entry of view.legend) {
      const toggle = button("", "match-chart-toggle", () => {
        if (hidden.has(entry.key)) {
          hidden.delete(entry.key);
        } else {
          hidden.add(entry.key);
        }
        draw(entry.key);
      });
      toggle.dataset.key = entry.key;
      toggle.setAttribute("aria-pressed", String(!hidden.has(entry.key)));
      toggle.append(swatch(entry.colour, entry.dash), h("span", undefined, entry.label));
      legend.appendChild(toggle);
    }
    const key = h("div", "match-chart-key");
    for (const shape of MARK_SHAPES) {
      if (view.marks.some((mark) => mark.shape === shape)) {
        const item = h("span", "match-chart-key-item");
        item.append(glyph(shape, MARK_COLOURS[shape]), h("span", undefined, t(MARK_LABELS[shape])));
        key.appendChild(item);
      }
    }
    host.append(stack, times, strip, legend, key);
    place();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(place).observe(strip);
    }

    let at: number | undefined;
    const show = (index: number | undefined): void => {
      at = index;
      readout.hidden = index === undefined;
      for (const { cursor } of panels) {
        cursor.hidden = index === undefined;
      }
      if (index === undefined) {
        return;
      }
      const left = `${String((xPlot(index) / PLOT) * 100)}%`;
      for (const { cursor } of panels) {
        cursor.style.left = left;
      }
      readout.replaceChildren(
        h("div", "match-chart-readout-time", clock(sampleTime(index, view.period))),
      );
      for (const panel of view.panels) {
        for (const line of panel.lines) {
          if (hidden.has(line.legend) || index < line.start) {
            continue;
          }
          const value = line.values[index] ?? 0;
          const shown =
            line.axis === "right" || line.percent === true ? `${String(value)}%` : String(value);
          const row = h("div", "match-chart-readout-row", `${line.label} ${shown}`);
          row.style.color = line.colour;
          readout.appendChild(row);
        }
      }
      readout.classList.toggle("is-left", xPlot(index) > PLOT / 2);
    };
    const last = Math.max(0, view.samples - 1);
    stack.addEventListener("pointermove", (event) => {
      const box = stack.getBoundingClientRect();
      const area =
        panels[0]?.root.querySelector(".match-chart-area")?.getBoundingClientRect() ?? box;
      if (area.width <= 0) {
        return;
      }
      const seconds = ((event.clientX - area.left) / area.width) * end;
      show(Math.max(0, Math.min(last, Math.round(seconds / view.period) - 1)));
    });
    stack.addEventListener("pointerleave", () => {
      if (document.activeElement !== stack) {
        show(undefined);
      }
    });
    stack.addEventListener("focus", () => {
      show(at ?? last);
    });
    stack.addEventListener("blur", () => {
      show(undefined);
    });
    stack.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        show(undefined);
        return;
      }
      const next = cursorStep(at, event.key, last);
      if (next !== undefined) {
        event.preventDefault();
        show(next);
      }
    });
    if (focusKey !== undefined) {
      legend.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    }
  };
  draw();
}

/**
 * Where a key moves the cursor from `at` (the last sample when it is not
 * shown): a sample left or right, or to either end. `undefined` for a key
 * that does not move it.
 */
export function cursorStep(at: number | undefined, key: string, last: number): number | undefined {
  const from = at ?? last;
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, from - 1);
    case "ArrowRight":
      return Math.min(last, from + 1);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return undefined;
  }
}

/**
 * The views behind the tabs, *You* then *Teams*; `undefined` when there are
 * no charts to show: none arrived, no summary names their players, or not
 * one sample was taken. A spectator has no *You*.
 */
export function chartViews(
  chart: WireMatchChart | undefined,
  roster: ChartRoster | undefined,
): { readonly you: ChartView | undefined; readonly teams: ChartView } | undefined {
  if (chart === undefined || roster === undefined) {
    return undefined;
  }
  const teams = teamsView(chart, roster);
  return teams.samples === 0 ? undefined : { you: youView(chart, roster), teams };
}

/** Where on the time axis, 0 to 1, a mark at `seconds` sits. */
export function markX(seconds: number, view: Pick<ChartView, "samples" | "period">): number {
  return Math.min(1, Math.max(0, seconds / timeEnd(view)));
}

/** The time axis's end: the last sample's time, at least a second. */
function timeEnd({ samples, period }: Pick<ChartView, "samples" | "period">): number {
  return Math.max(1, sampleTime(samples - 1, period));
}

/**
 * The charts' panel, appended to `parent`: tabs *You* and *Teams* over the
 * chosen chart. With no chart, or no summary to name its players, the
 * tabs are off and a note says so; a spectator's *You* tab is off.
 */
export function renderMatchCharts(
  parent: HTMLElement,
  chart: WireMatchChart | undefined,
  roster: ChartRoster | undefined,
): HTMLElement {
  const root = h("section", "match-charts");
  const head = h("div", "match-charts-head");
  const tabs = h("div", "match-charts-tabs");
  tabs.setAttribute("role", "tablist");
  const body = h("div", "match-charts-body");
  body.setAttribute("role", "tabpanel");
  head.appendChild(tabs);
  root.append(head, body);
  parent.appendChild(root);
  const shown = chartViews(chart, roster);
  const views: readonly [string, ChartView | undefined][] = [
    [t("matchCharts.you"), shown?.you],
    [t("matchCharts.teams"), shown?.teams],
  ];
  const buttons = views.map(([label, view]) => {
    const tab = button(label, "match-charts-tab", () => {
      if (view !== undefined) {
        select(tab, view);
      }
    });
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.disabled = view === undefined;
    tabs.appendChild(tab);
    return { tab, view };
  });
  const select = (tab: HTMLButtonElement, view: ChartView): void => {
    for (const other of buttons) {
      other.tab.setAttribute("aria-selected", String(other.tab === tab));
    }
    drawView(body, view);
  };
  const first = buttons.find(({ view }) => view !== undefined);
  if (first?.view === undefined) {
    root.classList.add("is-empty");
    body.appendChild(h("p", "match-charts-none", t("matchCharts.none")));
  } else {
    select(first.tab, first.view);
  }
  return root;
}
