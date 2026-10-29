import type { MatchMode } from "@vibewars/game-core";

import { ARENA_MAPS } from "../net/maps.js";
import type { MatchResult, StoredMatchRecord } from "../storage/schema.js";
import { h, screenBar } from "./kit.js";

/** How many matches the Record screen lists (#1404), newest first. */
export const RECORD_SCREEN_ROWS = 50;

/** What the Record screen says with nothing to list. */
export const NO_MATCHES = "No matches yet. Finished matches appear here.";

/** The muted line under the title: the record is nobody else's to trust. */
export const LOCAL_ONLY = "Kept in this browser only. Nobody else sees or checks it.";

/** Each mode by name, as the lobby's line starts (#476). */
const MODE_NAMES: Readonly<Record<MatchMode, string>> = {
  annihilation: "Annihilation",
  "kill-count": "Kill Count",
  "priest-annihilation": "Priest Annihilation",
  "guild-battle": "Guild Battle",
  "relic-run": "Relic Run",
};

const RESULT_NAMES: Readonly<Record<MatchResult, string>> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

/** Whether `mode` is one this build names. */
function isMatchMode(mode: string): mode is MatchMode {
  return mode in MODE_NAMES;
}

/**
 * A row's cells: when (local, short), who, where, what mode and how it
 * went. A map or mode this build does not have shows its id.
 */
export function recordCells(record: StoredMatchRecord): readonly string[] {
  const when = new Date(record.finishedAt).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const map = ARENA_MAPS.find((candidate) => candidate.id === record.mapId)?.name ?? record.mapId;
  const mode = isMatchMode(record.mode) ? MODE_NAMES[record.mode] : record.mode;
  return [when, record.characterName, map, mode, RESULT_NAMES[record.result]];
}

export interface RecordScreenCallbacks {
  readonly onBack: () => void;
}

/**
 * The Record screen (#1404): the last `RECORD_SCREEN_ROWS` matches, newest
 * first, one row each. A record whose character is gone still shows, by
 * the name it was played under.
 */
export function renderRecordScreen(
  root: HTMLElement,
  records: readonly StoredMatchRecord[],
  problems: readonly string[],
  callbacks: RecordScreenCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen record-screen");
  screenBar({
    crumbs: ["VibeWars", "Record"],
    back: { label: "Back", onBack: callbacks.onBack },
    actions: [],
  });
  panel.appendChild(h("p", "record-local-only", LOCAL_ONLY));

  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  if (records.length === 0) {
    panel.appendChild(h("p", "empty-state-message", NO_MATCHES));
    root.appendChild(panel);
    return;
  }

  const table = document.createElement("table");
  table.className = "record-table";
  const head = document.createElement("tr");
  for (const label of ["When", "Character", "Map", "Mode", "Result"]) {
    head.appendChild(h("th", undefined, label));
  }
  table.createTHead().appendChild(head);
  const body = table.createTBody();
  for (const record of records.slice(0, RECORD_SCREEN_ROWS)) {
    const row = document.createElement("tr");
    for (const cell of recordCells(record)) {
      row.appendChild(h("td", undefined, cell));
    }
    body.appendChild(row);
  }
  panel.appendChild(table);
  root.appendChild(panel);
}
