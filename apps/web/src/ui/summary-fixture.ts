import type { WireChartEvent, WireMatchChart } from "@vibewars/game-protocol";
import type { MatchSummaryRow } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { mountEndLine } from "./end-line.js";
import { createHud, describeOutcome, placeEnd } from "./hud.js";
import { renderSummary, summaryTables } from "./match-summary.js";
import { mountQueueScreen } from "./queue-screen.js";

/**
 * `?summary-fixture` in an e2e build (#3563): the real HUD's end of a match,
 * over no arena, from a fixed three-team 8v8 summary with the names that
 * are hardest to fit, so a spec can measure the layout at any viewport
 * without playing a match. A player's build never loads this module.
 */
export function mountSummaryFixture(parent: HTMLElement): void {
  // Nothing here is a match: the HUD's controls do nothing.
  const noop = (): void => undefined;
  const hud = createHud(parent, noop, noop, noop);
  // A match ends with your last foe still targeted, a bot here.
  hud.targetText.textContent = seat(1, 3).name;
  new ResizeObserver(() => {
    placeEnd(hud);
  }).observe(hud.top);
  hud.result.style.display = "";
  hud.result.textContent = describeOutcome(1, "time", 0, []);
  const line = mountEndLine(hud.end, noop);
  line.text.textContent = t("queue.backToLobbyIn", { seconds: 9 });
  line.press.textContent = t("queue.now");
  const bots = new Set(FIXTURE.filter((row) => row.signet === null).map((row) => row.id));
  renderSummary(hud.end, summaryTables(FIXTURE, "p0-0", 0, 1, bots)).classList.add("hud-summary");
}

/**
 * `?summary-fixture=queue` (#3565): the queue screen after the same
 * match, its scores beside its charts, so a spec can check that neither
 * the charts nor the scores reach the buttons at any viewport.
 */
export function mountQueueFixture(parent: HTMLElement): void {
  const noop = (): void => undefined;
  const bots = new Set(FIXTURE.filter((row) => row.signet === null).map((row) => row.id));
  const screen = mountQueueScreen(
    parent,
    { mode: "team-arena-8v8", characterName: seat(0, 0).name, mapName: (id) => id },
    { onBack: noop, onQueueAgain: noop, onStayTogether: noop },
  );
  screen.show({
    kind: "ended",
    outcome: describeOutcome(0, "time", 0, []),
    streak: 1,
    summary: summaryTables(FIXTURE, "p0-0", 0, 0, bots),
    chart: fixtureChart(),
  });
}

/** A whole match's charts for `FIXTURE`: 120 samples, events bunched where marks crowd. */
function fixtureChart(): WireMatchChart {
  const samples = 120;
  const ramp = (rate: number): number[] =>
    Array.from({ length: samples }, (_, i) =>
      Math.round(rate * (i + 1) * (1 + Math.sin(i / 7) / 4)),
    );
  const wave = (phase: number): number[] =>
    Array.from({ length: samples }, (_, i) =>
      Math.round(60 + 40 * Math.sin(i / 9 + phase) * Math.cos(i / 23)),
    );
  const events: WireChartEvent[] = [];
  for (let i = 0; i < 24; i += 1) {
    const at = 60 + i * 45;
    events.push({ t: at, kind: "death", id: `p${String(i % 3)}-${String(i % 8)}`, by: "p0-0" });
    events.push({
      t: at + 3,
      kind: "interrupt",
      by: "p1-2",
      id: "p0-0",
      skillId: "monk.healing-breeze",
    });
  }
  events.push({ t: 400, kind: "death", id: "p0-0", by: "p1-3" });
  events.push({ t: 404, kind: "resurrected", id: "p0-0" });
  events.push({ t: 410, kind: "objective", team: 2, what: "point" });
  return {
    period: 10,
    players: FIXTURE.map((row, index) => ({
      id: row.id,
      dealt: ramp(9 + (index % 5)),
      taken: ramp(7 + (index % 4)),
      healed: ramp(index % 3),
      health: wave(index),
      energy: wave(index + 2),
    })),
    events,
    dropped: 0,
  };
}

/** Seat `index` of `team`: every fourth a bot with a long preset name. */
function seat(team: number, index: number): MatchSummaryRow {
  const bot = index % 4 === 3;
  const names = [
    "Abcdefghijklmnop",
    "Short",
    "Fifteen Letters",
    "GvG Dual Elementalist Spike Backline 2",
  ];
  return {
    id: `p${String(team)}-${String(index)}`,
    name: names[index % 4] ?? "Seat",
    guildTag: index % 4 === 1 || index % 4 === 0 ? "WXYZ" : null,
    heroRank: index % 4 === 0 ? 7 : 0,
    team,
    signet: bot ? null : index + 1,
    damage: 12345 - index * 1000 - team * 7,
    healing: index * 1500,
    taken: 9000 + index * 321,
    kills: index,
    deaths: 8 - index,
    interrupts: index % 3,
  };
}

const FIXTURE: readonly MatchSummaryRow[] = [0, 1, 2].flatMap((team) =>
  Array.from({ length: 8 }, (_, index) => seat(team, index)),
);
