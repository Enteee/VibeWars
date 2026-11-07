import type { Message } from "./message.js";

/**
 * English, the source of truth (#2648, ADR-0050): every player-facing
 * string, keyed `<screen or area>.<camelCase>`. Keys stay sorted and
 * grouped by screen, here and in every locale: insert in place, never
 * append, so parallel PRs touch different hunks.
 */
export const en = {
  "matches.bot": "{name} (bot)",
  "matches.buildUnreadable": "Build unreadable",
  "matches.clone": "Clone",
  "matches.daysAgo": { one: "{count} d ago", other: "{count} d ago" },
  "matches.draw": "Draw",
  "matches.endAggression": "Aggression at time",
  "matches.endAnnihilation": "Annihilation",
  "matches.endGuildLord": "Guild Lord slain",
  "matches.endMorale": "Morale",
  "matches.endScore": "Score",
  "matches.endSummary": "{reason} after {duration}",
  "matches.endTime": "Time ran out",
  "matches.hostReported": "host-reported",
  "matches.hostReportedTitle": "Published by the match's host; not verified by anyone else.",
  "matches.hoursAgo": { one: "{count} h ago", other: "{count} h ago" },
  "matches.justNow": "just now",
  "matches.lost": "Lost",
  "matches.minutesAgo": { one: "{count} min ago", other: "{count} min ago" },
  "matches.noMatches": "No matches yet.",
  "matches.offline": "Can't reach the match relays right now.",
  "matches.playerBuild": "{player}: {build}",
  "matches.teamResult": "Team {team}: {result}",
  "matches.teamTab": "Team {team} · {result}",
  "matches.teamUnreadable": "A build in this team can't be read",
  "matches.won": "Won",
  "matches.wonLeft": "◂ Won",
  "matches.wonRight": "Won ▸",

  "options.language": "language",
  "options.languageBusy": "Leave the lobby or match first: changing the language reloads the page.",
  "options.languageLabel": "Language",
} as const satisfies Readonly<Record<string, Message>>;

export type MessageKey = keyof typeof en;

/** A translation: every key English has, no other, each a `Message`. */
export type Catalog = Readonly<Record<MessageKey, Message>>;
