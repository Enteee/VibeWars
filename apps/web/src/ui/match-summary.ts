import type { MatchSummaryRow } from "@vibewars/game-session";

import { botTagElement } from "./bot-tag.js";
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

const COLUMN_LABELS: Readonly<Record<SummaryColumn, string>> = {
  damage: "Damage",
  healing: "Healing",
  taken: "Taken",
  kills: "Kills",
  deaths: "Deaths",
  interrupts: "Interrupts",
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
 * The two tables: your team first, or team 1 first for a spectator, each
 * in the order the host sent its rows. A column's highest value is the
 * whole match's, so it is flagged in whichever table holds it; a column
 * that is zero throughout flags nobody.
 *
 * @param selfTeam `undefined` for a spectator
 * @param bots the ids the match roster marks as bots; an id not in it is a player
 */
export function summaryTables(
  summary: readonly MatchSummaryRow[],
  selfId: string | undefined,
  selfTeam: number | undefined,
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
  const ours = selfTeam === 1 ? 1 : 0;
  const table = (team: number, caption: string): SummaryTable => ({
    caption,
    lines: summary.filter((row) => row.team === team).map(line),
  });
  return selfTeam === undefined
    ? [table(0, "Team 1"), table(1, "Team 2")]
    : [table(ours, "Your team"), table(1 - ours, "Their team")];
}

/** Build the tables once, into a new `.match-summary` element appended to `parent`. */
export function renderSummary(parent: HTMLElement, tables: readonly SummaryTable[]): HTMLElement {
  const root = h("div", "match-summary");
  for (const { caption, lines } of tables) {
    const table = document.createElement("table");
    table.className = "match-summary-table";
    table.appendChild(h("caption", undefined, caption));
    const head = table.createTHead().insertRow();
    for (const label of ["Name", ...SUMMARY_COLUMNS.map((column) => COLUMN_LABELS[column])]) {
      const cell = h("th", undefined, label);
      cell.setAttribute("scope", "col");
      head.appendChild(cell);
    }
    const body = table.createTBody();
    for (const { row, self, top, bot } of lines) {
      const tr = body.insertRow();
      tr.classList.toggle("is-self", self);
      const name = h("th", "match-summary-name", row.name);
      if (bot) {
        name.appendChild(botTagElement("match-summary-bot"));
      }
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
