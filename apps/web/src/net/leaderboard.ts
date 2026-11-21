/**
 * The leaderboard as this page holds it (ADR-0055, #3575): the
 * `ranking/leaderboard.json` the hourly job publishes next to the site,
 * fetched once a visit and again on every bot-free queue entry, kept for
 * ten minutes. What it says steers matchmaking only: a player's claim is
 * read from it, and every other seat checks that claim against the very
 * board it names, `ranking/boards/<asOf>.json`. A failed fetch is
 * "rating unknown", never a reason not to queue.
 */

import { UNLISTED_CLAIM, type TicketClaim } from "@vibewars/game-protocol";
import type { LeaderboardCopy, LeaderboardSource } from "@vibewars/game-session";

/**
 * How many past boards a page keeps: a party's claims name a few, and
 * the hourly job publishes one more an hour, so the oldest is let go.
 */
export const BOARDS_KEPT = 8;

/** How long a fetched copy is fresh enough to read without fetching again. */
export const LEADERBOARD_CACHE_MS = 10 * 60 * 1000;

/** How many entries the Leaderboard flyout lists. */
export const LEADERBOARD_TOP = 100;

/** One identity the leaderboard lists, as much of it as this page reads. */
export interface LeaderboardEntry {
  readonly pubkey: string;
  /** Its place, from 1; `null` while it is provisional, or has no rank otherwise. */
  readonly rank: number | null;
  readonly name: string;
  readonly rating: number;
  /** `rating − 2·rd`: what it is ranked by, and what its claim is. */
  readonly conservative: number;
  /** Rated matches played. */
  readonly matches: number;
  readonly provisional: boolean;
}

/** One `leaderboard.json`. */
export interface Leaderboard {
  /** Unix seconds. */
  readonly asOf: number;
  /** Ranked first, best first, then the unranked: as the job writes them. */
  readonly entries: readonly LeaderboardEntry[];
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { pubkey, rank, name, rating, conservative, matches, provisional } = value as Record<
    string,
    unknown
  >;
  return (
    typeof pubkey === "string" &&
    (rank === null || (typeof rank === "number" && Number.isSafeInteger(rank) && rank > 0)) &&
    typeof name === "string" &&
    Number.isFinite(rating) &&
    Number.isFinite(conservative) &&
    typeof matches === "number" &&
    Number.isSafeInteger(matches) &&
    matches >= 0 &&
    typeof provisional === "boolean"
  );
}

/** `raw` as a leaderboard, or `undefined` if it is not one. */
export function parseLeaderboard(raw: unknown): Leaderboard | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { asOf, entries } = raw as Record<string, unknown>;
  if (
    typeof asOf !== "number" ||
    !Number.isSafeInteger(asOf) ||
    asOf <= 0 ||
    !Array.isArray(entries) ||
    !entries.every(isEntry)
  ) {
    return undefined;
  }
  return {
    asOf,
    entries: entries.map(({ pubkey, rank, name, rating, conservative, matches, provisional }) => ({
      pubkey,
      rank,
      name,
      rating,
      conservative,
      matches,
      provisional,
    })),
  };
}

/**
 * The claim `pubkey` makes from `board` (ADR-0055): its conservative
 * value, rounded, or `UNLISTED_CLAIM` where it is not listed. With no
 * board at all, `asOf` 0: an unlisted claim from no leaderboard.
 */
export function claimFrom(board: Leaderboard | undefined, pubkey: string): TicketClaim {
  const entry = board?.entries.find((each) => each.pubkey === pubkey);
  return {
    rating: entry === undefined ? UNLISTED_CLAIM : Math.round(entry.conservative),
    asOf: board?.asOf ?? 0,
  };
}

/** What this page knows of its leaderboard: what claims and checks read. */
export interface LeaderboardStore extends LeaderboardSource {
  /** The copy held, as fetched; `undefined` while there is none. */
  readonly current: () => Leaderboard | undefined;
  /** This page's claim as `pubkey`, from the copy held. */
  readonly claim: (pubkey: string) => TicketClaim;
  /** Fetch it unless the copy held is fresh: on a visit, or opening the flyout. */
  readonly load: () => Promise<Leaderboard | undefined>;
  /** Fetch it past the cache: on a bot-free queue entry. A failed fetch is the copy held. */
  readonly refetch: () => Promise<Leaderboard | undefined>;
  /** Called with every copy fetched; returns its unsubscribe. */
  readonly onChange: (handler: (board: Leaderboard) => void) => () => void;
}

export interface LeaderboardDeps {
  /** Resolves to the parsed JSON, or rejects: a failure is "rating unknown". */
  readonly fetchJson: (url: string) => Promise<unknown>;
  /** ms since the epoch. */
  readonly now: () => number;
  /** `import.meta.env.BASE_URL`: the site root, ending in `/`. */
  readonly baseUrl: string;
}

export function createLeaderboardStore(deps: LeaderboardDeps): LeaderboardStore {
  const url = `${deps.baseUrl}ranking/leaderboard.json`;
  const handlers = new Set<(board: Leaderboard) => void>();
  let held: { readonly board: Leaderboard; readonly at: number } | undefined;
  let inFlight: Promise<Leaderboard | undefined> | undefined;
  /** The `BOARDS_KEPT` past boards last fetched, by asOf: a published one never changes. */
  const boards = new Map<number, Promise<LeaderboardCopy | undefined>>();

  /** Fetch it now, past the cache; one fetch at a time. */
  const fetchNow = (): Promise<Leaderboard | undefined> => {
    inFlight ??= deps
      .fetchJson(url)
      .then(parseLeaderboard, () => undefined)
      .then((board) => {
        inFlight = undefined;
        if (board === undefined) {
          return held?.board;
        }
        held = { board, at: deps.now() };
        for (const handler of [...handlers]) {
          handler(board);
        }
        return board;
      });
    return inFlight;
  };

  const copyOf = (board: Leaderboard | undefined): LeaderboardCopy | undefined =>
    board === undefined
      ? undefined
      : { asOf: board.asOf, claimOf: (pubkey) => claimFrom(board, pubkey).rating };

  return {
    current: () => held?.board,
    claim: (pubkey) => claimFrom(held?.board, pubkey),
    load: () =>
      held !== undefined && deps.now() - held.at < LEADERBOARD_CACHE_MS
        ? Promise.resolve(held.board)
        : fetchNow(),
    copy: () => copyOf(held?.board),
    refetch: fetchNow,
    board: (asOf) => {
      if (held?.board.asOf === asOf) {
        return Promise.resolve(copyOf(held.board));
      }
      let named = boards.get(asOf);
      if (named === undefined) {
        named = deps
          .fetchJson(`${deps.baseUrl}ranking/boards/${String(asOf)}.json`)
          .then(parseLeaderboard, () => undefined)
          .then((board) => {
            if (board?.asOf !== asOf) {
              // Not published, or not reached: asked again next time.
              boards.delete(asOf);
              return undefined;
            }
            return copyOf(board);
          });
        boards.set(asOf, named);
        const [oldest] = boards.keys();
        if (boards.size > BOARDS_KEPT && oldest !== undefined) {
          boards.delete(oldest);
        }
      }
      return named;
    },
    onChange: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

/** This page's leaderboard. */
export const leaderboard: LeaderboardStore = createLeaderboardStore({
  fetchJson: async (url) => {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`leaderboard: HTTP ${String(response.status)}`);
    }
    return (await response.json()) as unknown;
  },
  now: () => Date.now(),
  baseUrl: import.meta.env.BASE_URL,
});
