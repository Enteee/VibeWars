import { RATING } from "@vibewars/ranking";

import { t } from "../i18n/index.js";
import { keySignet } from "../identity/key-signet.js";
import {
  LEADERBOARD_TOP,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardStore,
} from "../net/leaderboard.js";
import { h, iconButton } from "./kit.js";
import { leaderboardIcon } from "./icons.js";
import { signedNameElement } from "./player-label.js";
import { attachTopbarPopover } from "./topbar-popover.js";

/**
 * Where this player stands on the leaderboard (#3575): their rating in
 * the queue, their rank on the menu, and the bar's Leaderboard flyout of
 * the top 100.
 */

/** This player's place on the leaderboard as this page holds it. */
export type Standing =
  | { readonly kind: "ranked"; readonly rank: number; readonly rating: number }
  | { readonly kind: "rated"; readonly rating: number }
  | { readonly kind: "provisional"; readonly matches: number }
  /** No leaderboard yet: it was never fetched, or the fetch failed. */
  | { readonly kind: "unknown" };

/** `pubkey`'s standing on `board`: a key it does not list has played no rated match. */
export function standingOf(board: Leaderboard | undefined, pubkey: string): Standing {
  if (board === undefined) {
    return { kind: "unknown" };
  }
  const entry = board.entries.find((each) => each.pubkey === pubkey);
  if (entry === undefined || entry.provisional) {
    return { kind: "provisional", matches: entry?.matches ?? 0 };
  }
  const rating = Math.round(entry.rating);
  return entry.rank === null
    ? { kind: "rated", rating }
    : { kind: "ranked", rank: entry.rank, rating };
}

/** The queue's line for `standing`: the rating, or why there is none. */
export function ratingLine(standing: Standing): string {
  switch (standing.kind) {
    case "ranked":
    case "rated":
      return t("leaderboard.yourRating", { rating: standing.rating });
    case "provisional":
      return t("leaderboard.provisional", {
        matches: standing.matches,
        needed: RATING.provisionalMatches,
      });
    case "unknown":
      return t("leaderboard.ratingUnknown");
  }
}

/** The menu's line for `standing`: only a ranked player has one. */
export function rankLine(standing: Standing): string | undefined {
  return standing.kind === "ranked"
    ? t("leaderboard.rankLine", { rank: standing.rank, rating: standing.rating })
    : undefined;
}

/** The flyout's rows: the ranked, best first, up to `LEADERBOARD_TOP`. */
export function topRows(board: Leaderboard): readonly LeaderboardEntry[] {
  return board.entries
    .filter((entry): entry is LeaderboardEntry & { readonly rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, LEADERBOARD_TOP);
}

/**
 * The menu's rank line, painted from `store` as each copy arrives; once
 * the menu that shows it is gone, it stops listening.
 */
export function rankLineElement(store: LeaderboardStore, pubkey: string): HTMLElement {
  const line = h("p", "menu-rank");
  const paint = (board: Leaderboard | undefined): void => {
    const text = rankLine(standingOf(board, pubkey));
    line.textContent = text ?? "";
    line.hidden = text === undefined;
  };
  paint(store.current());
  const stop = store.onChange((board) => {
    if (!line.isConnected) {
      stop();
      return;
    }
    paint(board);
  });
  return line;
}

/** The flyout's body for `board`: a table of the top 100, this player's row marked. */
function boardTable(board: Leaderboard | undefined, pubkey: string): HTMLElement {
  if (board === undefined) {
    return h("p", "leaderboard-note", t("leaderboard.unavailable"));
  }
  const rows = topRows(board);
  if (rows.length === 0) {
    return h("p", "leaderboard-note", t("leaderboard.empty"));
  }
  const table = h("table", "leaderboard-table");
  const head = table.appendChild(h("thead")).appendChild(h("tr"));
  head.append(
    h("th", "leaderboard-rank", t("leaderboard.rank")),
    h("th", "leaderboard-name", t("leaderboard.name")),
    h("th", "leaderboard-rating", t("leaderboard.rating")),
  );
  const body = table.appendChild(h("tbody"));
  for (const entry of rows) {
    const row = body.appendChild(h("tr"));
    row.classList.toggle("is-self", entry.pubkey === pubkey);
    const name = h("td", "leaderboard-name");
    name.appendChild(signedNameElement({ name: entry.name, signet: keySignet(entry.pubkey) }));
    row.append(
      h("td", "leaderboard-rank", `#${String(entry.rank)}`),
      name,
      h("td", "leaderboard-rating", String(Math.round(entry.rating))),
    );
  }
  return table;
}

/**
 * The bar's Leaderboard button, its flyout dropping into `parent`: the
 * copy held at once, and a fresh one if it is older than the cache.
 */
export function leaderboardButton(
  parent: HTMLElement,
  store: LeaderboardStore,
  pubkey: string,
): HTMLButtonElement {
  const element = iconButton("topbar-leaderboard", t("leaderboard.title"), leaderboardIcon());
  attachTopbarPopover(element, parent, () => {
    const panel = h("div", "screen leaderboard-window");
    panel.setAttribute("aria-label", t("leaderboard.title"));
    panel.tabIndex = -1;
    const title = h("h3", "leaderboard-window-title", t("leaderboard.title"));
    const standing = h("p", "leaderboard-standing");
    const list = h("div", "leaderboard-list");
    panel.append(title, standing, list);
    const paint = (board: Leaderboard | undefined): void => {
      standing.textContent = ratingLine(standingOf(board, pubkey));
      list.replaceChildren(boardTable(board, pubkey));
    };
    const held = store.current();
    if (held === undefined) {
      standing.textContent = "";
      list.replaceChildren(h("p", "leaderboard-note", t("leaderboard.loading")));
    } else {
      paint(held);
    }
    let open = true;
    void store.load().then((board) => {
      if (open) {
        paint(board);
      }
    });
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
