import type { MatchSummaryRow } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { mountEndLine } from "./end-line.js";
import { createHud, describeOutcome, placeEnd } from "./hud.js";
import { renderSummary, summaryTables } from "./match-summary.js";

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
