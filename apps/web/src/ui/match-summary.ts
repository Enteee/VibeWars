import type { MatchSummaryRow } from "@vibewars/game-session";

import { t, type MessageKey } from "../i18n/index.js";
import { markedForTeam, teamSide } from "../render/arena-snapshot.js";
import { botTagElement } from "./bot-tag.js";
import { SIGNET_ROW_PX, playerLabelElement, signetElement } from "./player-label.js";
import { h } from "./kit.js";

/**
 * The match summary (#1057): at the end of a match, one table per team,
 * one row per player who held a seat, with what each did in it. The host
 * tallied it; this only orders and draws it.
 */

/** The numeric columns, in the order they are drawn. */
export const SUMMARY_COLUMNS = [
  "damage",
  "healing",
  "taken",
  "kills",
  "deaths",
  "interrupts",
] as const;
export type SummaryColumn = (typeof SUMMARY_COLUMNS)[number];

const COLUMN_LABELS: Readonly<Record<SummaryColumn, MessageKey>> = {
  damage: "summary.damage",
  healing: "summary.healing",
  taken: "summary.taken",
  kills: "summary.kills",
  deaths: "summary.deaths",
  interrupts: "summary.interrupts",
};

export interface SummaryLine {
  readonly row: MatchSummaryRow;
  /** Your own row, marked with the `friend` border. */
  readonly self: boolean;
  /** A lobby bot (#1194): its name wears the BOT tag (#1241). */
  readonly bot: boolean;
  /** The columns where this row holds the match's highest value, ties included. */
  readonly top: ReadonlySet<SummaryColumn>;
}

export interface SummaryTable {
  readonly caption: string;
  readonly lines: readonly SummaryLine[];
}

/**
 * A table a team, two or three (#2684): your team first, then the winner,
 * then the rest in order; a spectator's from the winner, or team 1 on a
 * draw. Each in the order the host sent its rows. A column's highest value
 * is the whole match's, so it is flagged in whichever table holds it; a
 * column that is zero throughout flags nobody.
 *
 * @param selfTeam `undefined` for a spectator
 * @param winningTeam `undefined` for a draw
 * @param bots the ids the match roster marks as bots; an id not in it is a player
 */
export function summaryTables(
  summary: readonly MatchSummaryRow[],
  selfId: string | undefined,
  selfTeam: number | undefined,
  winningTeam: number | undefined,
  bots: ReadonlySet<string>,
): readonly SummaryTable[] {
  const best = new Map(
    SUMMARY_COLUMNS.map((column) => [column, Math.max(0, ...summary.map((row) => row[column]))]),
  );
  const line = (row: MatchSummaryRow): SummaryLine => ({
    row,
    self: row.id === selfId,
    bot: bots.has(row.id),
    top: new Set(
      SUMMARY_COLUMNS.filter((column) => row[column] > 0 && row[column] === best.get(column)),
    ),
  });
  const teamCount = Math.max(2, ...summary.map((row) => row.team + 1));
  const rank = (team: number): number =>
    team === selfTeam ? 0 : team === winningTeam ? 1 : 2 + team;
  const teams = Array.from({ length: teamCount }, (_, team) => team).sort(
    (a, b) => rank(a) - rank(b),
  );
  const caption = (team: number): string => {
    if (team === selfTeam) {
      return t("summary.yourTeam");
    }
    if (selfTeam !== undefined && teamCount === 2) {
      return t("summary.theirTeam");
    }
    return markedForTeam(teamSide(team, selfTeam ?? 0), t("summary.team", { team: team + 1 }));
  };
  return teams.map((team) => ({
    caption: caption(team),
    lines: summary.filter((row) => row.team === team).map(line),
  }));
}

/** Build the tables once, into a new `.match-summary` element appended to `parent`. */
export function renderSummary(parent: HTMLElement, tables: readonly SummaryTable[]): HTMLElement {
  const root = h("div", "match-summary");
  for (const { caption, lines } of tables) {
    const table = document.createElement("table");
    table.className = "match-summary-table";
    table.appendChild(h("caption", undefined, caption));
    const head = table.createTHead().insertRow();
    for (const label of [
      t("summary.name"),
      ...SUMMARY_COLUMNS.map((column) => t(COLUMN_LABELS[column])),
    ]) {
      const cell = h("th", undefined, label);
      cell.setAttribute("scope", "col");
      head.appendChild(cell);
    }
    const body = table.createTBody();
    for (const { row, self, top, bot } of lines) {
      const tr = body.insertRow();
      tr.classList.toggle("is-self", self);
      const name = h("th", "match-summary-name");
      name.appendChild(signetElement(row.signet ?? undefined, SIGNET_ROW_PX));
      name.appendChild(playerLabelElement("player-label", row.name, row.guildTag));
      if (bot) {
        name.appendChild(botTagElement("match-summary-bot"));
      }
      // A bot's is its build's, up to 40 characters (#2636): cut, whole here.
      name.title = row.name;
      name.setAttribute("scope", "row");
      tr.appendChild(name);
      for (const column of SUMMARY_COLUMNS) {
        const value = Math.round(row[column]);
        const cell = h("td", undefined, String(value));
        cell.classList.toggle("is-top", top.has(column));
        cell.classList.toggle("is-zero", value === 0);
        tr.appendChild(cell);
      }
    }
    root.appendChild(table);
  }
  parent.appendChild(root);
  return root;
}
