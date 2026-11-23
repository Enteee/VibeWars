import { t, locale, type MessageKey } from "../i18n/index.js";
import { mapName } from "../i18n/game-names.js";
import type { MatchHistoryStore, MatchRecord } from "../storage/match-history.js";
import { h, iconButton } from "./kit.js";
import { matchHistoryIcon } from "./icons.js";
import { chartRoster, chartUsable, renderMatchCharts } from "./match-charts.js";
import { MATCH_KINDS } from "./matches-filter.js";
import { renderSummary, summaryTables } from "./match-summary.js";
import { attachTopbarPopover } from "./topbar-popover.js";

/**
 * The bar's Match history (#3848): this browser's last ended matches,
 * each opening on the score table and charts its end panel showed.
 */

/** How a kept match ended for the player who kept it. */
export function matchResult(record: MatchRecord): MessageKey {
  const winner = record.ended.winningTeam;
  return winner === null
    ? "hud.outcomeDraw"
    : winner === record.selfTeam
      ? "hud.outcomeVictory"
      : "hud.outcomeDefeat";
}

/** One line of the list, as it reads. */
export interface HistoryRow {
  readonly record: MatchRecord;
  readonly when: string;
  readonly map: string;
  readonly mode: string;
  readonly result: string;
}

/**
 * The list's lines, newest first as `records` comes, and what it says
 * when it has none. With `mine`, only the matches kept under `ownKey`.
 */
export function historyRows(
  records: readonly MatchRecord[],
  mine: boolean,
  ownKey: string,
): { readonly rows: readonly HistoryRow[]; readonly empty: string | undefined } {
  const shown = mine ? records.filter((record) => record.pubkey === ownKey) : records;
  const when = new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short" });
  return {
    rows: shown.map((record) => ({
      record,
      when: when.format(record.endedAt),
      map: mapName(record.mapId),
      mode: t(MATCH_KINDS[record.mode]),
      result: t(matchResult(record)),
    })),
    empty:
      shown.length > 0
        ? undefined
        : records.length > 0
          ? t("history.emptyMine")
          : t("history.empty"),
  };
}

/** The match's score table and, if they came, its charts: the end panel again. */
function matchDetail(record: MatchRecord): HTMLElement {
  const tables = summaryTables(
    record.ended.summary,
    record.selfId,
    record.selfTeam,
    record.ended.winningTeam ?? undefined,
    new Set(record.bots),
  );
  const detail = h("div", "match-history-detail");
  const panel = renderSummary(detail, tables);
  const chart = record.chart ?? undefined;
  if (chartUsable(chart)) {
    renderMatchCharts(panel, chart, chartRoster(tables));
  }
  return detail;
}

/** The bar's Match history button, opening the list over the screen. */
export function matchHistoryButton(
  parent: HTMLElement,
  store: MatchHistoryStore,
  ownKey: string,
): HTMLButtonElement {
  const element = iconButton("topbar-match-history", t("history.open"), matchHistoryIcon());
  attachTopbarPopover(element, parent, () => {
    const panel = h("div", "screen match-history-window");
    panel.setAttribute("aria-label", t("history.title"));
    panel.tabIndex = -1;
    const title = h("h3", "match-history-title", t("history.title"));
    const body = h("div", "match-history-body");
    panel.append(title, body);
    let records: readonly MatchRecord[] = [];
    // Checked each time the window opens: the choice is not kept.
    let mine = true;
    const showList = (): void => {
      const filter = h("label", "match-history-mine");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = mine;
      box.addEventListener("change", () => {
        mine = box.checked;
        showList();
        body.querySelector<HTMLInputElement>(".match-history-mine input")?.focus();
      });
      filter.append(box, document.createTextNode(t("history.mine")));
      const { rows, empty } = historyRows(records, mine, ownKey);
      const list = h("div", "match-history-list");
      if (empty !== undefined) {
        list.append(h("p", "match-history-empty", empty));
      }
      for (const row of rows) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "match-history-row";
        button.append(
          h("span", "match-history-when", row.when),
          h("span", "match-history-map", row.map),
          h("span", "match-history-mode", row.mode),
          h("span", "match-history-result", row.result),
        );
        button.addEventListener("click", () => {
          showMatch(row);
        });
        list.append(button);
      }
      body.replaceChildren(filter, list);
    };
    const showMatch = (row: HistoryRow): void => {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "match-history-back";
      back.textContent = t("history.back");
      back.addEventListener("click", () => {
        showList();
      });
      const heading = h(
        "p",
        "match-history-heading",
        `${row.when} · ${row.map} · ${row.mode} · ${row.result}`,
      );
      body.replaceChildren(back, heading, matchDetail(row.record));
      back.focus();
    };
    let open = true;
    store.list().then(
      (kept) => {
        records = kept;
        if (open) {
          showList();
        }
      },
      (error: unknown) => {
        // The history is a convenience: unreadable, it is empty.
        console.warn("[web] could not read the match history", error);
        if (open) {
          showList();
        }
      },
    );
    return {
      element: panel,
      focus: panel,
      dispose() {
        open = false;
      },
    };
  });
  return element;
}
