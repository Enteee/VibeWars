import { describe, expect, it } from "vitest";

import type { WireChartSeries, WireMatchChart } from "@vibewars/game-protocol";

import { t } from "../i18n/index.js";
import {
  MARK_ROWS,
  chartViews,
  clock,
  cursorStep,
  eventText,
  firstSample,
  layoutMarks,
  linePath,
  markX,
  niceMax,
  panelShapes,
  scale,
  teamsView,
  timeTicks,
  youView,
  type ChartRoster,
} from "./match-charts.js";

function series(id: string, values: Partial<WireChartSeries> = {}): WireChartSeries {
  return {
    id,
    dealt: [100, 300, 600],
    taken: [0, 50, 200],
    healed: [0, 0, 40],
    health: [100, 80, 60],
    energy: [90, 40, 70],
    ...values,
  };
}

const ROSTER: ChartRoster = {
  selfId: "ann",
  selfTeam: 0,
  players: new Map([
    ["ann", { name: "Ann", team: 0 }],
    ["bob", { name: "Bob", team: 1 }],
    ["cat", { name: "Cat", team: 0 }],
  ]),
};

const CHART: WireMatchChart = {
  period: 10,
  players: [
    series("ann"),
    series("bob", { dealt: [50, 100, 150], health: [100, 100, 0] }),
    // Cat joined late: nothing before her second sample.
    series("cat", {
      dealt: [0, 20, 40],
      taken: [0, 0, 0],
      healed: [0, 0, 0],
      health: [0, 100, 50],
      energy: [0, 80, 80],
    }),
  ],
  events: [
    { t: 12, kind: "death", id: "bob", by: "ann" },
    { t: 14, kind: "interrupt", by: "bob", id: "ann", skillId: "healing-breeze" },
    { t: 20, kind: "death", id: "ann", by: null },
    { t: 22, kind: "resurrected", id: "ann" },
    { t: 25, kind: "interrupt", by: "bob", id: "cat", skillId: "healing-breeze" },
    { t: 27, kind: "objective", team: 1, what: "point" },
  ],
  dropped: 0,
};

describe("match-charts helpers (#3565)", () => {
  it("scales a domain onto a range, and a domain of no width onto its start", () => {
    const x = scale([0, 30], [0, 1000]);
    expect(x(0)).toBe(0);
    expect(x(15)).toBe(500);
    expect(x(30)).toBe(1000);
    const y = scale([0, 100], [1000, 0]);
    expect(y(25)).toBe(750);
    expect(scale([5, 5], [10, 20])(5)).toBe(10);
  });

  it("rounds an axis's top up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(612)).toBe(1000);
    expect(niceMax(180)).toBe(200);
    expect(niceMax(2100)).toBe(2500);
    expect(niceMax(4000)).toBe(5000);
  });

  it("writes time as m:ss, and ticks at most five on a round step", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(134)).toBe("2:14");
    expect(clock(600.9)).toBe("10:00");
    expect(timeTicks(240)).toEqual([0, 60, 120, 180, 240]);
    expect(timeTicks(30)).toEqual([0, 15, 30]);
  });

  it("builds a path for a known series from its start, and none for one sample", () => {
    const x = (index: number): number => index * 100;
    const y = (value: number): number => 1000 - value;
    expect(linePath([10, 20, 30], 0, x, y)).toBe("M0 990L100 980L200 970");
    expect(linePath([10, 20, 30], 1, x, y)).toBe("M100 980L200 970");
    expect(linePath([10], 0, x, y)).toBe("");
    expect(linePath([10, 20], 1, x, y)).toBe("");
  });

  it("puts marks in row 0 and nudges one that would touch another up a row", () => {
    expect(layoutMarks([0, 100, 200])).toEqual([0, 0, 0]);
    expect(layoutMarks([100, 105, 110, 300])).toEqual([0, 1, 2, 0]);
    // Past the last row a crowded mark shares the first.
    const crowded = layoutMarks([50, 51, 52, 53]);
    expect(Math.max(...crowded)).toBe(MARK_ROWS - 1);
    expect(crowded[3]).toBe(0);
    // In the order given, laid out left to right.
    expect(layoutMarks([110, 100])).toEqual([1, 0]);
  });

  it("starts a late joiner's series at their first sample", () => {
    expect(firstSample(series("ann"))).toBe(0);
    expect(firstSample(CHART.players[2] ?? series("x"))).toBe(1);
    const never = series("x", {
      dealt: [0],
      taken: [0],
      healed: [0],
      health: [0],
      energy: [0],
    });
    expect(firstSample(never)).toBe(1);
  });

  it("says what an event was, with its time and names", () => {
    expect(eventText({ t: 134, kind: "death", id: "bob", by: "ann" }, ROSTER)).toBe(
      t("matchCharts.killed", { time: "2:14", name: "Bob", killer: "Ann" }),
    );
    expect(eventText({ t: 134, kind: "death", id: "bob", by: null }, ROSTER)).toBe(
      t("matchCharts.died", { time: "2:14", name: "Bob" }),
    );
    expect(eventText({ t: 5, kind: "resurrected", id: "ann" }, ROSTER)).toBe(
      t("matchCharts.resurrected", { time: "0:05", name: "Ann" }),
    );
    expect(eventText({ t: 5, kind: "interrupt", by: "bob", id: "ann", skillId: "x" }, ROSTER)).toBe(
      t("matchCharts.interrupted", { time: "0:05", by: "Bob", name: "Ann" }),
    );
    expect(eventText({ t: 61, kind: "objective", team: 1, what: "altar" }, ROSTER)).toBe(
      t("matchCharts.tookAltar", { time: "1:01", team: t("summary.theirTeam") }),
    );
    expect(t("matchCharts.killed", { time: "2:14", name: "Mira", killer: "Bot Ash" })).toBe(
      "2:14 — Mira died (killed by Bot Ash)",
    );
  });
});

describe("youView and teamsView (#3565)", () => {
  it("shows your own events on You: your kill, death, raising, interrupts, and objectives", () => {
    const view = youView(CHART, ROSTER);
    expect(view?.marks.map(({ t: at, shape }) => [at, shape])).toEqual([
      [12, "kill"],
      [14, "interrupt"],
      [20, "death"],
      [22, "resurrected"],
      [27, "objective"],
    ]);
    expect(view?.panels[0]?.lines.map(({ legend, axis }) => [legend, axis])).toEqual([
      ["dealt", "left"],
      ["taken", "left"],
      ["healed", "left"],
      ["energy", "right"],
    ]);
  });

  it("has no You for a spectator", () => {
    expect(youView(CHART, { ...ROSTER, selfId: undefined, selfTeam: undefined })).toBeUndefined();
  });

  it("pools each team's health over its members present, and sums its damage", () => {
    const view = teamsView(CHART, ROSTER);
    const [pool, dealt] = view.panels;
    // Ours first: Ann alone at first, then Ann and Cat.
    expect(pool?.lines[0]?.values).toEqual([100, 90, 55]);
    expect(pool?.lines[1]?.values).toEqual([100, 100, 0]);
    expect(dealt?.lines[0]?.values).toEqual([100, 320, 640]);
    expect(view.legend.map(({ label, dash }) => [label, dash])).toEqual([
      [t("summary.yourTeam"), "solid"],
      [t("summary.theirTeam"), "dashed"],
    ]);
    expect(view.marks.map(({ t: at, shape }) => [at, shape])).toEqual([
      [12, "death"],
      [20, "death"],
      [27, "objective"],
    ]);
  });
});

describe("what the charts draw (#3565)", () => {
  const x = (index: number): number => index * 500;

  it("draws a path per visible series; hiding one removes its path", () => {
    const panel = youView(CHART, ROSTER)?.panels[0];
    if (panel === undefined) {
      throw new Error("no panel");
    }
    const all = panelShapes(panel, new Set(), x);
    expect(all.shapes.map(({ legend, kind }) => [legend, kind])).toEqual([
      ["dealt", "line"],
      ["taken", "line"],
      ["healed", "line"],
      ["energy", "line"],
    ]);
    // Dealt tops out at 600, so the left axis at 1000: 600 is 400 down in 1000.
    expect(all.top).toBe(1000);
    expect(all.shapes[0]?.d).toBe("M0 900L500 700L1000 400");
    const hidden = panelShapes(panel, new Set(["taken", "energy"]), x);
    expect(hidden.shapes.map(({ legend }) => legend)).toEqual(["dealt", "healed"]);
    expect(hidden.right).toBe(false);
  });

  it("draws points and no line for a series of one sample", () => {
    const one: WireMatchChart = {
      ...CHART,
      players: CHART.players.map((player) => ({
        ...player,
        dealt: player.dealt.slice(0, 1),
        taken: player.taken.slice(0, 1),
        healed: player.healed.slice(0, 1),
        health: player.health.slice(0, 1),
        energy: player.energy.slice(0, 1),
      })),
    };
    const panel = youView(one, ROSTER)?.panels[0];
    if (panel === undefined) {
      throw new Error("no panel");
    }
    const { shapes } = panelShapes(panel, new Set(), x);
    expect(shapes.map(({ kind }) => kind)).toEqual(["point", "point", "point", "point"]);
  });

  it("puts a mark at its time's x on an axis that ends at the last sample", () => {
    const view = youView(CHART, ROSTER);
    if (view === undefined) {
      throw new Error("no view");
    }
    // Three samples of 10 s: the axis ends at 30 s.
    expect(markX(12, view)).toBeCloseTo(0.4);
    expect(markX(45, view)).toBe(1);
  });

  it("has no charts, so the tabs are off, when none arrived, no summary names them, or no sample was taken", () => {
    expect(chartViews(undefined, ROSTER)).toBeUndefined();
    expect(chartViews(CHART, undefined)).toBeUndefined();
    expect(
      chartViews({ ...CHART, players: CHART.players.map((p) => ({ ...p, health: [] })) }, ROSTER),
    ).toBeUndefined();
    const views = chartViews(CHART, ROSTER);
    expect(views?.you).toBeDefined();
    expect(views?.teams.panels).toHaveLength(2);
    // A spectator: Teams only.
    expect(chartViews(CHART, { ...ROSTER, selfId: undefined })?.you).toBeUndefined();
  });

  it("moves the cursor a sample at a time with the arrow keys, from the last when hidden", () => {
    expect(cursorStep(undefined, "ArrowLeft", 5)).toBe(4);
    expect(cursorStep(0, "ArrowLeft", 5)).toBe(0);
    expect(cursorStep(4, "ArrowRight", 5)).toBe(5);
    expect(cursorStep(5, "ArrowRight", 5)).toBe(5);
    expect(cursorStep(3, "Home", 5)).toBe(0);
    expect(cursorStep(3, "End", 5)).toBe(5);
    expect(cursorStep(3, "a", 5)).toBeUndefined();
  });
});
