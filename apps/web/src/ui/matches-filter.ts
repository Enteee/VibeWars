/**
 * The Matches page's filter chips (#2741): which kinds and sizes of match
 * the list shows. Nothing here is stored; the choice lasts the page's
 * session.
 */
import type { LobbyMode } from "@vibewars/game-protocol";
import type { MatchRecord } from "@vibewars/game-session";

import type { MessageKey } from "../i18n/index.js";

/** Each kind's chip label. */
export const MATCH_KINDS = {
  "random-arena": "matches.kindRandom",
  "team-arena": "matches.kindTeam",
  "heroes-ascent": "matches.kindAscent",
  gvg: "matches.kindGvg",
  "hosted-game": "matches.kindHosted",
} as const satisfies Readonly<Record<LobbyMode, MessageKey>>;

export const MATCH_SIZES = [1, 2, 4, 8] as const;

export type MatchSize = (typeof MATCH_SIZES)[number];

/** A group with nothing in it is all of that group. */
export interface MatchFilter {
  readonly kinds: Set<LobbyMode>;
  readonly sizes: Set<MatchSize>;
}

/** The page's filter, kept while the page is open, gone on reload. */
export const sessionFilter: MatchFilter = { kinds: new Set(), sizes: new Set() };

/** A record's size: its largest team's player count, bots included. */
export function matchSize(record: MatchRecord): number {
  return Math.max(...record.teams.map((team) => team.players.length));
}

/** Kinds OR'd, sizes OR'd, the two AND'd. */
export function matchesFilter(record: MatchRecord, filter: MatchFilter): boolean {
  const size = matchSize(record);
  return (
    (filter.kinds.size === 0 || filter.kinds.has(record.mode)) &&
    (filter.sizes.size === 0 || MATCH_SIZES.some((s) => s === size && filter.sizes.has(s)))
  );
}
