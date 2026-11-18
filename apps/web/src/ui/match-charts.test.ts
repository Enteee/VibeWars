import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WireChartSeries, WireMatchChart } from "@vibewars/game-protocol";

import { FakeElement } from "./fake-dom.test-support.js";
import {
  MARK_PX,
  chartUsable,
  clock,
  eventText,
  firstSample,
  linePath,
  markRows,
  niceCeil,
  renderMatchCharts,
  renderPlot,
  scale,
  teamLines,
  youMarks,
  type ChartRoster,
} from "./match-charts.js";

const roster: ChartRoster = {
  selfId: "mira",
  selfTeam: 0,
  players: new Map([
    ["mira", { name: "Mira", team: 0 }],
    ["tam", { name: "Tam", team: 0 }],
    ["ash", { name: "Bot Ash", team: 1 }],
  ]),
};

function series(id: string, values: Partial<WireChartSeries> = {}): WireChartSeries {
  const flat = [10, 20, 30, 40];
  return { id, dealt: flat, taken: flat, healed: flat, health: flat, energy: flat, ...values };
}

const chart: WireMatchChart = {
  period: 10,
  players: [series("mira"), series("tam"), series("ash")],
  events: [
    { t: 14, kind: "death", id: "ash", by: "mira" },
    { t: 15, kind: "interrupt", by: "ash", id: "mira", skillId: "monk.healing-breeze" },
    { t: 30, kind: "death", id: "mira", by: "ash" },
    { t: 33, kind: "resurrected", id: "mira" },
    { t: 38, kind: "objective", team: 1, what: "point" },
    { t: 39, kind: "death", id: "tam", by: null },
  ],
  dropped: 0,
};

const fake = (element: Element): FakeElement => element as unknown as FakeElement;

describe("match chart helpers (#3565)", () => {
  it("scales a domain onto a range, an empty domain onto its start", () => {
    expect(scale(0, 100, 40, 240)(50)).toBe(140);
    expect(scale(0, 100, 200, 0)(25)).toBe(150);
    expect(scale(5, 5, 7, 99)(5)).toBe(7);
  });

  it("rounds an axis maximum up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect([0, 1, 7, 13, 22, 240, 4100].map(niceCeil)).toEqual([1, 1, 10, 20, 25, 250, 5000]);
  });

  it("writes times as m:ss", () => {
    expect([0, 9, 134, 600].map(clock)).toEqual(["0:00", "0:09", "2:14", "10:00"]);
  });

  it("draws a path through a known series, and none under two points", () => {
    const x = (index: number): number => index * 10;
    const y = (value: number): number => 100 - value;
    expect(linePath([0, 50, 100], 0, x, y)).toBe("M0.0 100.0 L10.0 50.0 L20.0 0.0");
    expect(linePath([0, 50, 100], 1, x, y)).toBe("M10.0 50.0 L20.0 0.0");
    expect(linePath([42], 0, x, y)).toBe("");
  });

  it("starts a late guest's series at their first sample", () => {
    const late = series("tam", {
      dealt: [0, 0, 5, 9],
      taken: [0, 0, 0, 0],
      healed: [0, 0, 0, 0],
      health: [0, 0, 100, 90],
      energy: [0, 0, 80, 70],
    });
    expect(firstSample(late)).toBe(2);
    expect(firstSample(series("mira"))).toBe(0);
  });

  it("nudges a crowding mark up one row, and back down once there is room", () => {
    expect(markRows([100, 100 + MARK_PX - 1, 100 + MARK_PX, 300])).toEqual([0, 1, 0, 0]);
    expect(markRows([50, 52, 54])).toEqual([0, 1, 2]);
    expect(markRows([54, 50, 52])).toEqual([2, 0, 1]);
  });

  it("says what each event was, with names from the tables", () => {
    const [kill, interrupt, death, raised, objective, alone] = chart.events.map((event) =>
      eventText(event, roster),
    );
    expect(kill).toBe("0:14 — Bot Ash died (killed by Mira)");
    expect(death).toBe("0:30 — Mira died (killed by Bot Ash)");
    expect(raised).toBe("0:33 — Mira was resurrected");
    expect(objective).toBe("0:38 — Their team took a shrine");
    expect(alone).toBe("0:39 — Tam died");
    expect(interrupt).toBe("0:15 — Bot Ash interrupted Mira: Healing Breeze");
  });

  it("shows your own events on the You chart, not a teammate's death", () => {
    expect(youMarks(chart, roster).map(({ kind, t }) => `${kind}@${String(t)}`)).toEqual([
      "kill@14",
      "interrupt@15",
      "death@30",
      "resurrection@33",
      "objective@38",
    ]);
  });

  it("pools a team's health as its members' mean and sums its damage", () => {
    const pools = teamLines(
      {
        ...chart,
        players: [
          series("mira", { health: [100, 50], dealt: [3, 6] }),
          series("tam", { health: [80, 0], dealt: [1, 2] }),
          series("ash", { health: [90, 90], dealt: [4, 4] }),
        ],
      },
      roster,
    );
    expect(pools.map(({ team }) => team)).toEqual([0, 1]);
    expect(pools[0]?.pool.values).toEqual([90, 25]);
    expect(pools[0]?.dealt.values).toEqual([4, 8]);
  });

  it("only draws a chart with a period and a sample", () => {
    expect(chartUsable(chart)).toBe(true);
    expect(chartUsable(undefined)).toBe(false);
    expect(chartUsable({ ...chart, period: 0 })).toBe(false);
    expect(chartUsable({ ...chart, players: [series("mira", { health: [] })] })).toBe(false);
  });
});

describe("the match charts panel (#3565)", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createElementNS: () => new FakeElement(),
      createTextNode: (text: string) => Object.assign(new FakeElement(), { textContent: text }),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {
          // The fake has no layout to watch.
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mount = (data: WireMatchChart | undefined): FakeElement =>
    fake(renderMatchCharts(new FakeElement() as unknown as HTMLElement, data, roster));

  it("disables both tabs and says so when no chart arrived", () => {
    const root = mount(undefined);
    expect(root.all("match-charts-tab").map(({ disabled }) => disabled)).toEqual([true, true]);
    expect(root.querySelector(".match-charts-none")?.textContent).toBe("No charts for this match");
    expect(root.querySelector(".match-charts-plot")).toBeNull();
  });

  it("hides a series' line when its legend chip is pressed, and shows it again", () => {
    const root = mount(chart);
    const chip = root.all("match-charts-chip").find(({ dataset }) => dataset.key === "dealt");
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(root.all("chart-line-dealt")).toHaveLength(1);
    chip?.click();
    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    expect(root.all("chart-line-dealt")).toHaveLength(0);
    expect(root.all("chart-line-taken")).toHaveLength(1);
    chip?.click();
    expect(root.all("chart-line-dealt")).toHaveLength(1);
  });

  it("puts each mark at its time on the axis, crowded ones a row up, labelled", () => {
    const { svg, geometry } = renderPlot({
      width: 600,
      panelHeight: 160,
      period: 10,
      samples: 4,
      panels: [{ lines: [], leftPercent: false }],
      marks: youMarks(chart, roster),
      hidden: new Set(),
    });
    const marks = fake(svg).all("chart-mark");
    expect(marks.map((mark) => mark.getAttribute("data-row"))).toEqual(["0", "1", "0", "0", "0"]);
    const kill = marks[0];
    expect(kill?.getAttribute("transform")).toContain(geometry.x(14).toFixed(1));
    expect(kill?.getAttribute("aria-label")).toBe("0:14 — Bot Ash died (killed by Mira)");
    expect(kill?.getAttribute("tabindex")).toBe("0");
  });
});
