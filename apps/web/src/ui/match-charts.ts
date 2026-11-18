import type { WireChartEvent, WireChartSeries, WireMatchChart } from "@vibewars/game-protocol";

import { skillName } from "../i18n/game-names.js";
import { t, type MessageKey } from "../i18n/index.js";
import { markedForTeam, teamColour, teamSide } from "../render/arena-snapshot.js";
import { cssColour } from "./character-preview.js";
import { button, h } from "./kit.js";
import type { SummaryTable } from "./match-summary.js";

/**
 * The post-match charts (#3565): what you did over the match, and how
 * the teams did, as two line charts of inline SVG with the match's
 * events on a strip under the time axis. The host recorded them (#3564);
 * this only draws them.
 */

const SVG = "http://www.w3.org/2000/svg";

/** Who played, as the summary tables know them. */
export interface ChartRoster {
  /** `undefined` for a spectator, or if you are not in the summary. */
  readonly selfId: string | undefined;
  readonly selfTeam: number | undefined;
  readonly players: ReadonlyMap<string, { readonly name: string; readonly team: number }>;
}

/** The roster of the summary's tables: names, teams, and your row. */
export function chartRoster(tables: readonly SummaryTable[]): ChartRoster {
  const players = new Map<string, { name: string; team: number }>();
  let self: { id: string; team: number } | undefined;
  for (const { lines } of tables) {
    for (const { row, self: mine } of lines) {
      players.set(row.id, { name: row.name, team: row.team });
      if (mine) {
        self = { id: row.id, team: row.team };
      }
    }
  }
  return { selfId: self?.id, selfTeam: self?.team, players };
}

/** A plotted series: its points, its look, and which axis it reads. */
export interface ChartLine {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** The first sample it has: a guest who joined late starts there. */
  readonly start: number;
  /** A CSS colour. */
  readonly colour: string;
  /** An SVG `stroke-dasharray`; `""` is solid. */
  readonly dash: string;
  /** Read against the 0-100 axis on the right, not the left one. */
  readonly percent: boolean;
}

export type MarkKind = "kill" | "death" | "interrupt" | "objective" | "resurrection";

/** One event on the strip under the time axis. */
export interface ChartMark {
  readonly t: number;
  readonly kind: MarkKind;
  /** A CSS colour. */
  readonly colour: string;
  /** The tooltip: "2:14 — Mira died (killed by Bot Ash)". */
  readonly text: string;
}

/** The size of a mark, and the height of a strip row: crowded marks go up one. */
export const MARK_PX = 14;
const ROW_PX = 12;

/** The series' colours and dashes (asset-designer, #3565); the hues are the UI's. */
const DEALT = { colour: "#ff7b72", dash: "" };
const TAKEN = { colour: "#e3b341", dash: "7 4" };
const HEALED = { colour: "#7ee787", dash: "2 3" };
const ENERGY = { colour: "#d2a8ff", dash: "8 3 2 3" };
const INK = "#d7dee8";
const GOLD = "#d4a72c";

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

/** Maps `[d0, d1]` onto `[r0, r1]`; an empty domain maps to `r0`. */
export function scale(d0: number, d1: number, r0: number, r1: number): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** The smallest of 1, 2, 2.5, 5 times a power of ten that is at least `value`, and 1 at least. */
export function niceCeil(value: number): number {
  if (value <= 1) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((each) => each * power >= value) ?? 10;
  return step * power;
}

/** Seconds since the match began of sample `index`: one is taken every `period`. */
export function sampleSeconds(index: number, period: number): number {
  return (index + 1) * period;
}

/** An SVG path through `values` from `start` on; `""` when fewer than two points. */
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
    .map((value, offset) => {
      const command = offset === 0 ? "M" : "L";
      return `${command}${x(start + offset).toFixed(1)} ${y(value).toFixed(1)}`;
    })
    .join(" ");
}

/** The first sample a player was in the match: before it every value is 0. */
export function firstSample(series: WireChartSeries): number {
  const keys = ["dealt", "taken", "healed", "health", "energy"] as const;
  const index = series.health.findIndex((_, i) => keys.some((key) => (series[key][i] ?? 0) > 0));
  return index === -1 ? 0 : index;
}

/**
 * The strip row of each mark, by x: the lowest row where it sits at least
 * `MARK_PX` from the last mark in that row, so no two marks overlap.
 */
export function markRows(xs: readonly number[]): number[] {
  const order = xs.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x);
  const lastInRow: number[] = [];
  const rows = new Array<number>(xs.length).fill(0);
  for (const { x, index } of order) {
    let row = lastInRow.findIndex((last) => x - last >= MARK_PX);
    if (row === -1) {
      row = lastInRow.length;
    }
    lastInRow[row] = x;
    rows[index] = row;
  }
  return rows;
}

/** A team as the tables call it: yours, theirs, or by number with the third team's ◆. */
export function teamName(team: number, roster: ChartRoster, teamCount: number): string {
  if (team === roster.selfTeam) {
    return t("summary.yourTeam");
  }
  if (roster.selfTeam !== undefined && teamCount === 2) {
    return t("summary.theirTeam");
  }
  return markedForTeam(teamSide(team, roster.selfTeam ?? 0), t("summary.team", { team: team + 1 }));
}

/** The colour team `team` wears to you, as in the arena. */
export function teamCss(team: number, roster: ChartRoster): string {
  return cssColour(teamColour(teamSide(team, roster.selfTeam ?? 0)));
}

/** The teams in the chart's roster: yours first, then the rest in order. */
export function chartTeams(roster: ChartRoster): number[] {
  const teams = new Set<number>();
  for (const { team } of roster.players.values()) {
    teams.add(team);
  }
  return [...teams].sort((a, b) =>
    a === roster.selfTeam ? -1 : b === roster.selfTeam ? 1 : a - b,
  );
}

const OBJECTIVE_TEXT: Readonly<Record<"point" | "stand" | "altar", MessageKey>> = {
  point: "charts.tookPoint",
  stand: "charts.tookStand",
  altar: "charts.tookAltar",
};

/** The tooltip for `event`. */
export function eventText(event: WireChartEvent, roster: ChartRoster): string {
  const name = (id: string): string => roster.players.get(id)?.name ?? id;
  const time = clock(event.t);
  switch (event.kind) {
    case "death":
      return event.by === null
        ? t("charts.died", { time, name: name(event.id) })
        : t("charts.killed", { time, name: name(event.id), killer: name(event.by) });
    case "resurrected":
      return t("charts.raised", { time, name: name(event.id) });
    case "interrupt":
      return t("charts.interrupted", {
        time,
        by: name(event.by),
        name: name(event.id),
        skill: skillName(event.skillId),
      });
    case "objective":
      return t(OBJECTIVE_TEXT[event.what], {
        time,
        team: teamName(event.team, roster, chartTeams(roster).length),
      });
  }
}

/** Your marks: your deaths and kills, raisings and interrupts by or of you, and every objective. */
export function youMarks(chart: WireMatchChart, roster: ChartRoster): ChartMark[] {
  const self = roster.selfId;
  const marks: ChartMark[] = [];
  for (const event of chart.events) {
    const text = eventText(event, roster);
    if (event.kind === "death" && event.id === self) {
      marks.push({ t: event.t, kind: "death", colour: "#ff7b72", text });
    } else if (event.kind === "death" && event.by === self) {
      marks.push({ t: event.t, kind: "kill", colour: INK, text });
    } else if (event.kind === "resurrected" && event.id === self) {
      marks.push({ t: event.t, kind: "resurrection", colour: HEALED.colour, text });
    } else if (event.kind === "interrupt" && (event.by === self || event.id === self)) {
      marks.push({ t: event.t, kind: "interrupt", colour: GOLD, text });
    } else if (event.kind === "objective") {
      marks.push({ t: event.t, kind: "objective", colour: teamCss(event.team, roster), text });
    }
  }
  return marks;
}

/** The teams' marks: every death, in the dying team's colour, and every objective. */
export function teamMarks(chart: WireMatchChart, roster: ChartRoster): ChartMark[] {
  const marks: ChartMark[] = [];
  for (const event of chart.events) {
    if (event.kind === "death") {
      const team = roster.players.get(event.id)?.team;
      if (team !== undefined) {
        const colour = teamCss(team, roster);
        marks.push({ t: event.t, kind: "death", colour, text: eventText(event, roster) });
      }
    } else if (event.kind === "objective") {
      const colour = teamCss(event.team, roster);
      marks.push({ t: event.t, kind: "objective", colour, text: eventText(event, roster) });
    }
  }
  return marks;
}

/** Your four lines; none if you have no series. */
export function youLines(chart: WireMatchChart, roster: ChartRoster): ChartLine[] {
  const series = chart.players.find(({ id }) => id === roster.selfId);
  if (series === undefined) {
    return [];
  }
  const start = firstSample(series);
  const line = (
    key: "dealt" | "taken" | "healed" | "energy",
    label: MessageKey,
    look: { colour: string; dash: string },
  ): ChartLine => ({
    key,
    label: t(label),
    values: series[key],
    start,
    ...look,
    percent: key === "energy",
  });
  return [
    line("dealt", "charts.dealt", DEALT),
    line("taken", "charts.taken", TAKEN),
    line("healed", "charts.healed", HEALED),
    line("energy", "charts.energy", ENERGY),
  ];
}

/**
 * Each team's health pool, the mean health % of the members in the match
 * at that sample, and its damage dealt, summed. Keyed by team number.
 */
export function teamLines(
  chart: WireMatchChart,
  roster: ChartRoster,
): { readonly team: number; readonly pool: ChartLine; readonly dealt: ChartLine }[] {
  const samples = Math.max(0, ...chart.players.map(({ health }) => health.length));
  const teams = chartTeams(roster);
  return teams.map((team, order) => {
    const members = chart.players.filter(({ id }) => roster.players.get(id)?.team === team);
    const starts = members.map(firstSample);
    const pool: number[] = [];
    const dealt: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const present = members.filter((_, m) => (starts[m] ?? 0) <= i);
      const health = present.reduce((sum, { health: h }) => sum + (h[i] ?? 0), 0);
      pool.push(present.length === 0 ? 0 : Math.round(health / present.length));
      dealt.push(members.reduce((sum, { dealt: d }) => sum + (d[i] ?? 0), 0));
    }
    const label = teamName(team, roster, teams.length);
    // A third team is told apart by its dash as well as its colour.
    const look = { colour: teamCss(team, roster), dash: order < 2 ? "" : "7 4" };
    const key = `team-${String(team)}`;
    return {
      team,
      pool: { key, label, values: pool, start: 0, ...look, percent: true },
      dealt: { key, label, values: dealt, start: 0, ...look, percent: false },
    };
  });
}

/** Whether `chart` can be drawn for `roster`: a sample and someone the tables know. */
export function chartUsable(chart: WireMatchChart | undefined): chart is WireMatchChart {
  return (
    chart !== undefined &&
    chart.period > 0 &&
    chart.players.length > 0 &&
    chart.players.some(({ health }) => health.length > 0)
  );
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

/** Each mark's shape, centred on 0,0 in a `MARK_PX` box: filled, or stroked like the cross and the pole. */
const GLYPHS: Readonly<
  Record<MarkKind, readonly { readonly d: string; readonly stroke?: number }[]>
> = {
  kill: [{ d: "M0 -6 L6 0 L0 6 L-6 0 Z" }],
  death: [{ d: "M-5 -5 L5 5 M5 -5 L-5 5", stroke: 3 }],
  interrupt: [{ d: "M2 -6 L-3 1 L1 1 L-2 6 L4 -1 L0 -1 Z" }],
  objective: [{ d: "M-4 6 L-4 -6", stroke: 1.5 }, { d: "M-4 -6 L6 -3 L-4 0 Z" }],
  resurrection: [{ d: "M0 -6 L6 6 L-6 6 Z" }],
};

/** A mark's glyph in `colour`, with a hairline of the background around it. */
function glyph(kind: MarkKind, colour: string): SVGElement {
  const g = svg("g", { class: "chart-glyph" });
  for (const { d, stroke } of GLYPHS[kind]) {
    g.appendChild(
      stroke === undefined
        ? svg("path", { d, fill: colour, stroke: "#0e1116", "stroke-width": 1 })
        : svg("path", { d, stroke: colour, "stroke-width": stroke, "stroke-linecap": "round" }),
    );
  }
  return g;
}

/** A panel of lines over a shared time axis. */
interface Panel {
  readonly lines: readonly ChartLine[];
  /** The left axis reads percent too: the teams' health pool. */
  readonly leftPercent: boolean;
  /** Named in its corner when there are two. */
  readonly title?: string;
}

const PAD_LEFT = 44;
const PAD_RIGHT = 36;
const AXIS_PX = 16;

/** What the plot is drawn from. */
export interface PlotInput {
  readonly width: number;
  /** Each panel's height, plot only. */
  readonly panelHeight: number;
  readonly period: number;
  readonly samples: number;
  readonly panels: readonly Panel[];
  readonly marks: readonly ChartMark[];
  /** Keys of the hidden lines. */
  readonly hidden: ReadonlySet<string>;
}

/** Where the plot puts things, for the cursor and the tooltips. */
export interface PlotGeometry {
  readonly x: (seconds: number) => number;
  readonly left: number;
  readonly right: number;
  /** Where the panels end and the time axis begins. */
  readonly panelsBottom: number;
}

/** The time axis's end: the last sample or the last event, whichever is later. */
export function plotSeconds(period: number, samples: number, marks: readonly ChartMark[]): number {
  return Math.max(sampleSeconds(samples - 1, period), ...marks.map(({ t: at }) => at), 1);
}

/** Draw the plot: panels stacked, one time axis, then the event strip. */
export function renderPlot(input: PlotInput): { svg: SVGSVGElement; geometry: PlotGeometry } {
  const { width, panelHeight, period, samples, panels, marks, hidden } = input;
  const left = PAD_LEFT;
  const right = Math.max(left + 1, width - PAD_RIGHT);
  const x = scale(0, plotSeconds(period, samples, marks), left, right);
  const xAt = (index: number): number => x(sampleSeconds(index, period));
  const markX = marks.map(({ t: at }) => x(at));
  const rows = markRows(markX);
  const stripRows = Math.max(1, ...rows.map((row) => row + 1));
  const panelsPx = panels.length * (panelHeight + 8);
  const height = panelsPx + AXIS_PX + stripRows * ROW_PX + 6;
  const root = svg("svg", {
    class: "match-charts-svg",
    width,
    height,
    viewBox: `0 0 ${String(width)} ${String(height)}`,
  });

  panels.forEach((panel, p) => {
    const top = 4 + p * (panelHeight + 8);
    const bottom = top + panelHeight;
    const shown = panel.lines.filter(({ key }) => !hidden.has(key));
    const leftMax = panel.leftPercent
      ? 100
      : niceCeil(Math.max(0, ...shown.filter((l) => !l.percent).flatMap((l) => l.values)));
    const yLeft = scale(0, leftMax, bottom, top);
    const yPercent = scale(0, 100, bottom, top);
    const grid = root.appendChild(svg("g", { class: "chart-grid" }));
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (leftMax * tick) / 4;
      const y = yLeft(value);
      grid.appendChild(svg("line", { x1: left, x2: right, y1: y, y2: y }));
      const label = svg("text", { x: left - 6, y: y + 3, "text-anchor": "end" });
      label.textContent = panel.leftPercent ? `${String(value)} %` : shortNumber(value);
      grid.appendChild(label);
      if (!panel.leftPercent && shown.some((l) => l.percent)) {
        const percent = svg("text", { x: right + 6, y: y + 3 });
        percent.textContent = `${String(tick * 25)} %`;
        grid.appendChild(percent);
      }
    }
    if (panel.title !== undefined) {
      const title = svg("text", { class: "chart-title", x: left + 6, y: top + 12 });
      title.textContent = panel.title;
      root.appendChild(title);
    }
    for (const line of shown) {
      const y = line.percent ? yPercent : yLeft;
      const look = {
        class: `chart-line chart-line-${line.key}`,
        stroke: line.colour,
        "stroke-dasharray": line.dash,
        "data-key": line.key,
      };
      const d = linePath(line.values, line.start, xAt, y);
      if (d === "") {
        // One sample: its point, and no line.
        line.values.slice(line.start).forEach((value, offset) => {
          root.appendChild(
            svg("circle", {
              ...look,
              cx: xAt(line.start + offset),
              cy: y(value),
              r: 2.5,
              fill: line.colour,
            }),
          );
        });
      } else {
        root.appendChild(svg("path", { ...look, d, fill: "none" }));
      }
    }
  });

  const axisTop = panelsPx;
  const axis = root.appendChild(svg("g", { class: "chart-grid chart-axis" }));
  const end = plotSeconds(period, samples, marks);
  const step = Math.max(1, niceCeil(end / 4));
  for (let at = 0; at <= end; at += step) {
    const label = svg("text", { x: x(at), y: axisTop + 11, "text-anchor": "middle" });
    label.textContent = clock(at);
    axis.appendChild(label);
  }

  const stripBottom = height - 4;
  marks.forEach((mark, index) => {
    const g = svg("g", {
      class: `chart-mark chart-mark-${mark.kind}`,
      transform: `translate(${(markX[index] ?? 0).toFixed(1)} ${String(stripBottom - MARK_PX / 2 - (rows[index] ?? 0) * ROW_PX)})`,
      tabindex: 0,
      role: "img",
      "aria-label": mark.text,
      "data-row": rows[index] ?? 0,
    });
    g.appendChild(svg("circle", { class: "chart-mark-ring", r: MARK_PX / 2 + 1 }));
    g.appendChild(glyph(mark.kind, mark.colour));
    root.appendChild(g);
  });
  return { svg: root, geometry: { x, left, right, panelsBottom: panelsPx - 4 } };
}

/** 1200 as 1.2 k, so the axis stays narrow. */
function shortNumber(value: number): string {
  return value >= 1000 ? `${String(Math.round(value / 100) / 10)} k` : String(Math.round(value));
}

/** The sample nearest `px` across the plot. */
export function sampleAt(
  px: number,
  geometry: PlotGeometry,
  period: number,
  samples: number,
): number {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < samples; i += 1) {
    const d = Math.abs(geometry.x(sampleSeconds(i, period)) - px);
    if (d < distance) {
      best = i;
      distance = d;
    }
  }
  return best;
}

const MARK_LEGEND: readonly {
  readonly kind: MarkKind;
  readonly key: MessageKey;
  readonly colour: string;
}[] = [
  { kind: "kill", key: "charts.kill", colour: INK },
  { kind: "death", key: "charts.death", colour: "#ff7b72" },
  { kind: "interrupt", key: "charts.interrupt", colour: GOLD },
  { kind: "objective", key: "charts.capture", colour: "#59c2ff" },
  { kind: "resurrection", key: "charts.resurrection", colour: HEALED.colour },
];

type Tab = "you" | "teams";

/**
 * Mount the charts into a new `.match-charts` panel appended to `parent`:
 * tabs You | Teams, a legend of toggles, the plot with its cursor and the
 * event strip. Without a usable chart the tabs are disabled and say so.
 */
export function renderMatchCharts(
  parent: HTMLElement,
  chart: WireMatchChart | undefined,
  roster: ChartRoster,
): HTMLElement {
  const root = parent.appendChild(h("section", "match-charts"));
  root.setAttribute("aria-label", t("charts.label"));
  const tabs = root.appendChild(h("div", "match-charts-tabs"));
  tabs.setAttribute("role", "tablist");
  const usable = chartUsable(chart);
  const you = usable ? youLines(chart, roster) : [];
  let tab: Tab = you.length > 0 ? "you" : "teams";
  const tabButtons: Record<Tab, HTMLButtonElement> = {
    you: button(t("charts.you"), "match-charts-tab", () => {
      choose("you");
    }),
    teams: button(t("charts.teams"), "match-charts-tab", () => {
      choose("teams");
    }),
  };
  for (const [name, each] of Object.entries(tabButtons)) {
    each.setAttribute("role", "tab");
    each.disabled = !usable || (name === "you" && you.length === 0);
    tabs.appendChild(each);
  }
  if (!usable) {
    root.appendChild(h("p", "match-charts-none", t("charts.none")));
    return root;
  }
  const view = root.appendChild(h("div", "match-charts-view"));
  view.setAttribute("role", "tabpanel");
  const plot = view.appendChild(h("div", "match-charts-plot"));
  plot.tabIndex = 0;
  plot.setAttribute("aria-label", t("charts.label"));
  // Under the event strip, as in mockup A.
  const legend = view.appendChild(h("div", "match-charts-legend"));
  const readout = view.appendChild(h("div", "match-charts-readout"));
  readout.setAttribute("aria-live", "polite");
  const tip = view.appendChild(h("div", "match-charts-tip"));
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const marksLegend = view.appendChild(h("div", "match-charts-marks"));
  for (const { kind, key, colour } of MARK_LEGEND) {
    const item = marksLegend.appendChild(h("span", "match-charts-mark-key"));
    const icon = item.appendChild(
      svg("svg", { width: MARK_PX, height: MARK_PX, "aria-hidden": "true" }),
    );
    const centre = svg("g", {
      transform: `translate(${String(MARK_PX / 2)} ${String(MARK_PX / 2)})`,
    });
    centre.appendChild(glyph(kind, colour));
    icon.appendChild(centre);
    item.appendChild(document.createTextNode(t(key)));
  }

  const teams = teamLines(chart, roster);
  const samples = Math.max(0, ...chart.players.map(({ health }) => health.length));
  const hidden = new Set<string>();
  let cursor: number | undefined;
  let geometry: PlotGeometry | undefined;
  let cursorLine: SVGLineElement | undefined;

  const panels = (): Panel[] =>
    tab === "you"
      ? [{ lines: you, leftPercent: false }]
      : [
          { lines: teams.map(({ pool }) => pool), leftPercent: true, title: t("charts.pool") },
          {
            lines: teams.map(({ dealt }) => dealt),
            leftPercent: false,
            title: t("charts.teamDamage"),
          },
        ];
  const marks = (): ChartMark[] =>
    tab === "you" ? youMarks(chart, roster) : teamMarks(chart, roster);

  const draw = (): void => {
    const width = Math.max(240, Math.floor(plot.clientWidth) || 600);
    const panelHeight = tab === "you" ? (width < 480 ? 160 : 200) : width < 480 ? 100 : 120;
    const drawn = renderPlot({
      width,
      panelHeight,
      period: chart.period,
      samples,
      panels: panels(),
      marks: marks(),
      hidden,
    });
    geometry = drawn.geometry;
    cursorLine = drawn.svg.appendChild(
      svg("line", { class: "chart-cursor", y1: 4, y2: geometry.panelsBottom }),
    );
    plot.replaceChildren(drawn.svg);
    for (const mark of drawn.svg.querySelectorAll<SVGGElement>(".chart-mark")) {
      const show = (): void => {
        tip.textContent = mark.getAttribute("aria-label");
        tip.hidden = false;
        const box = mark.getBoundingClientRect();
        const host = view.getBoundingClientRect();
        tip.style.left = `${String(Math.max(0, box.left - host.left - 40))}px`;
        tip.style.top = `${String(box.top - host.top - 28)}px`;
      };
      const hide = (): void => {
        tip.hidden = true;
      };
      mark.addEventListener("pointerenter", show);
      mark.addEventListener("focus", show);
      mark.addEventListener("pointerleave", hide);
      mark.addEventListener("blur", hide);
    }
    moveCursor(cursor);
  };

  /** The cursor at sample `at`, and the values there; none for `undefined`. */
  const moveCursor = (at: number | undefined): void => {
    cursor = at;
    if (cursorLine !== undefined && geometry !== undefined) {
      cursorLine.style.display = at === undefined ? "none" : "";
      const cx = geometry.x(sampleSeconds(at ?? 0, chart.period)).toFixed(1);
      cursorLine.setAttribute("x1", cx);
      cursorLine.setAttribute("x2", cx);
    }
    readout.replaceChildren();
    if (cursor !== undefined) {
      const at = cursor;
      readout.appendChild(
        h("span", "match-charts-readout-time", clock(sampleSeconds(at, chart.period))),
      );
      for (const line of panels().flatMap(({ lines }) => lines)) {
        if (!hidden.has(line.key) && at >= line.start) {
          const value = line.values[at] ?? 0;
          const item = readout.appendChild(h("span", "match-charts-readout-item"));
          item.style.setProperty("--chart-colour", line.colour);
          item.textContent = `${line.label} ${line.percent ? `${String(value)} %` : String(value)}`;
        }
      }
    }
  };

  const fillLegend = (): void => {
    legend.replaceChildren();
    const lines = tab === "you" ? you : teams.map(({ pool }) => pool);
    for (const line of lines) {
      const chip = legend.appendChild(
        button("", "match-charts-chip", () => {
          if (hidden.has(line.key)) {
            hidden.delete(line.key);
          } else {
            hidden.add(line.key);
          }
          chip.setAttribute("aria-pressed", String(!hidden.has(line.key)));
          draw();
        }),
      );
      chip.setAttribute("aria-pressed", String(!hidden.has(line.key)));
      chip.dataset.key = line.key;
      const swatch = chip.appendChild(svg("svg", { width: 18, height: 8, "aria-hidden": "true" }));
      swatch.appendChild(
        svg("line", {
          x1: 1,
          x2: 17,
          y1: 4,
          y2: 4,
          stroke: line.colour,
          "stroke-width": 2,
          "stroke-dasharray": line.dash,
        }),
      );
      chip.appendChild(document.createTextNode(line.label));
    }
  };

  const choose = (next: Tab): void => {
    tab = next;
    for (const [name, each] of Object.entries(tabButtons)) {
      each.setAttribute("aria-selected", String(name === tab));
      each.classList.toggle("is-active", name === tab);
    }
    hidden.clear();
    cursor = undefined;
    fillLegend();
    draw();
  };

  plot.addEventListener("pointermove", (event) => {
    if (geometry === undefined || samples === 0) {
      return;
    }
    const box = plot.getBoundingClientRect();
    moveCursor(sampleAt(event.clientX - box.left, geometry, chart.period, samples));
  });
  plot.addEventListener("pointerleave", () => {
    moveCursor(undefined);
  });
  plot.addEventListener("keydown", (event) => {
    if (samples === 0 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    moveCursor(Math.min(samples - 1, Math.max(0, (cursor ?? (step > 0 ? -1 : samples)) + step)));
  });

  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = Math.floor(plot.clientWidth);
    if (width !== lastWidth) {
      lastWidth = width;
      draw();
    }
  }).observe(plot);

  choose(tab);
  return root;
}
