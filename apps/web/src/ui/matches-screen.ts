/**
 * The Matches page (#2532): the finished matches hosts publish on Nostr
 * (#2528), newest first, live while the page is open. Every record is
 * the host's word only, and every row says so.
 */

import { decodeTemplateCode, type MatchEndReason } from "@vibewars/game-core";
import { LOBBY_MODES, type LobbyMode } from "@vibewars/game-protocol";
import type { MatchRecord, MatchRecordPlayer, MatchRecordTeam } from "@vibewars/game-session";

import { mapName } from "../i18n/game-names.js";
import { t, type MessageKey } from "../i18n/index.js";
import { keySignet } from "../identity/key-signet.js";
import type {
  HeardMatchRecord,
  MatchRecordWatch,
  MatchRecordWatchHandlers,
} from "../net/transport/match-records.js";
import { decodeTemplate } from "../storage/gw1-template.js";
import { isTeamBuildSize } from "../storage/schema.js";
import { lookOfCharacter, teamFigureCard, type TeamFigureMember } from "./character-card.js";
import { professionLabel } from "./character-preview.js";
import { formatClock } from "./hud.js";
import { professionIcon } from "./icons.js";
import { button, h, screenBar, syncList } from "./kit.js";
import { MATCH_KINDS, MATCH_SIZES, matchesFilter, sessionFilter } from "./matches-filter.js";
import { playerLabelText, signetElement } from "./player-label.js";
import { railIconUrl, railLabel, railScreen, type RailEntry } from "./rail.js";
import { hallHolds, type HallHold } from "./vault-screen.js";

/** The most records the page holds; the oldest goes first. */
export const MATCHES_KEPT = 50;

/** How long ago a match may have ended and still be on the page (#3133). */
export const MATCHES_MAX_AGE_SECONDS = 7 * 24 * 3600;

/** How often the page redraws its relative times, and lets aged-out matches go. */
const MATCHES_REFRESH_MS = 60_000;

const END_REASONS = {
  score: "matches.endScore",
  time: "matches.endTime",
  annihilation: "matches.endAnnihilation",
  morale: "matches.endMorale",
  "guild-lord": "matches.endGuildLord",
  aggression: "matches.endAggression",
} as const satisfies Readonly<Record<MatchEndReason, MessageKey>>;

export interface MatchesScreenOptions {
  readonly onSwitch: (entry: RailEntry) => void;
  /** Starts the relays' records coming; `index.ts`'s `watchRecords` in the app. */
  readonly watch: (on: MatchRecordWatchHandlers) => MatchRecordWatch;
  /** Unix milliseconds. */
  readonly now: () => number;
  /** A team's Clone (#2585): save it as a new Team Build and open it. */
  readonly onCloneTeam: (team: MatchRecordTeam) => void;
}

export interface MatchesScreen {
  /** Stops listening: the page is gone. */
  close(): void;
}

/**
 * The records the page shows (#3133): none that ended more than
 * `MATCHES_MAX_AGE_SECONDS` before `nowSeconds`, newest first, at most
 * `MATCHES_KEPT`.
 */
export function recentMatches(
  records: readonly HeardMatchRecord[],
  nowSeconds: number,
): HeardMatchRecord[] {
  return records
    .filter((heard) => heard.record.endedAt >= nowSeconds - MATCHES_MAX_AGE_SECONDS)
    .sort((a, b) => b.record.endedAt - a.record.endedAt)
    .slice(0, MATCHES_KEPT);
}

/** `endedAt` (unix seconds) as how long before `nowSeconds` it was. */
export function relativeTime(endedAt: number, nowSeconds: number): string {
  const ago = Math.max(0, nowSeconds - endedAt);
  if (ago < 60) {
    return t("matches.justNow");
  }
  if (ago < 3600) {
    return t("matches.minutesAgo", { count: Math.floor(ago / 60) });
  }
  if (ago < 86_400) {
    return t("matches.hoursAgo", { count: Math.floor(ago / 3600) });
  }
  return t("matches.daysAgo", { count: Math.floor(ago / 86_400) });
}

/** "Won", "Lost" or "Draw", for team `team` of `record`. */
function teamResult(record: MatchRecord, team: number): string {
  if (record.winningTeam === null) {
    return t("matches.draw");
  }
  return t(record.winningTeam === team ? "matches.won" : "matches.lost");
}

/**
 * A team on the closed row (#2585): one primary profession icon per
 * player, the name and both professions on hover, and the winner's
 * underlined. A build it can't read is a question mark.
 */
function teamIcons(record: MatchRecord, team: number, players: MatchRecordTeam): HTMLElement {
  const icons = h("span", record.winningTeam === team ? "match-team is-winner" : "match-team");
  for (const player of players.players) {
    const name = playerLabelText(player.name, player.guildTag, 0);
    const label = player.bot ? t("matches.bot", { name }) : name;
    if (player.pubkey !== null) {
      icons.appendChild(signetElement(keySignet(player.pubkey), 12));
    }
    const decoded = decodeTemplateCode(player.template);
    if (!decoded.ok) {
      const unknown = icons.appendChild(h("span", "match-player-icon is-unknown", "?"));
      unknown.title = t("matches.playerBuild", {
        player: label,
        build: t("matches.buildUnreadable"),
      });
      continue;
    }
    const { primaryProfession, secondaryProfession } = decoded.build;
    const icon = document.createElement("img");
    icon.className = "match-player-icon";
    icon.src = professionIcon(primaryProfession);
    icon.alt = t("matches.playerBuild", {
      player: label,
      build: professionLabel(primaryProfession, secondaryProfession),
    });
    icon.title = icon.alt;
    icons.appendChild(icon);
  }
  return icons;
}

/**
 * Between two teams: which side won, or a draw. Three teams (#2684) are
 * just set apart: the winner's underline says who won.
 */
function resultMark(record: MatchRecord): string {
  if (record.winningTeam === null) {
    return t("matches.draw");
  }
  if (record.teams.length > 2) {
    return t("matches.versus");
  }
  return t(record.winningTeam === 0 ? "matches.wonLeft" : "matches.wonRight");
}

/** A player as a team card's member row: its name, and the look its template says. */
function playerMember(player: MatchRecordPlayer): TeamFigureMember {
  const name = playerLabelText(player.name, player.guildTag, 0);
  const decoded = decodeTemplate(player.template, "", 0);
  const label = player.bot ? t("matches.bot", { name }) : name;
  const heading = h("span", "match-player-heading");
  heading.title = label;
  if (player.pubkey !== null) {
    heading.appendChild(signetElement(keySignet(player.pubkey), 18));
  }
  heading.appendChild(h("span", "match-player-name", label));
  return {
    look: decoded.ok ? lookOfCharacter(decoded.character, undefined) : undefined,
    label,
    heading,
  };
}

/**
 * A team's Clone (#2585): a Team Build, or a character for a 1v1's side
 * (#2885). None for any other size, disabled when a build in it can't be
 * read. One press, one copy.
 */
function cloneButton(players: MatchRecordTeam, onClone: () => void): HTMLElement[] {
  const size = players.players.length;
  if (size !== 1 && !isTeamBuildSize(size)) {
    return [];
  }
  const clone = button(t("matches.clone"), "play-card-clone", () => {
    clone.disabled = true;
    onClone();
  });
  if (players.players.some((player) => !decodeTemplateCode(player.template).ok)) {
    clone.disabled = true;
    clone.title = t(size === 1 ? "matches.buildUnreadable" : "matches.teamUnreadable");
  }
  return [clone];
}

function teamDetail(
  record: MatchRecord,
  team: number,
  players: MatchRecordTeam,
  onCloneTeam: (team: MatchRecordTeam) => void,
): HTMLElement {
  const section = h("section", "match-detail-team");
  section.appendChild(
    teamFigureCard({
      title: h(
        "h4",
        "match-detail-result",
        t("matches.teamResult", { team: team + 1, result: teamResult(record, team) }),
      ),
      members: players.players.map(playerMember),
      actions: cloneButton(players, () => {
        onCloneTeam(players);
      }),
    }),
  );
  return section;
}

/** The opened row (#2585): one team at a time, a tab for each. */
function matchDetail(
  record: MatchRecord,
  onCloneTeam: (team: MatchRecordTeam) => void,
): HTMLElement {
  const detail = h("div", "match-detail");
  detail.appendChild(
    h(
      "p",
      "match-detail-summary",
      t("matches.endSummary", {
        reason: t(END_REASONS[record.endReason]),
        duration: formatClock(record.durationSeconds),
      }),
    ),
  );
  const tabs = detail.appendChild(h("div", "match-tabs"));
  tabs.setAttribute("role", "tablist");
  const panel = detail.appendChild(h("div", "match-tab-panel"));
  panel.setAttribute("role", "tabpanel");
  // The winner's tab first, and open (#2637); the rest, or a draw's
  // every team, in order.
  const order = record.teams
    .map((players, team) => ({ players, team }))
    .sort((a, b) => Number(b.team === record.winningTeam) - Number(a.team === record.winningTeam));
  const sections = order.map(({ team, players }) => teamDetail(record, team, players, onCloneTeam));
  const buttons = order.map(({ team }, position) => {
    const tab = button(
      t("matches.teamTab", { team: team + 1, result: teamResult(record, team) }),
      "match-tab",
      () => {
        show(position);
      },
    );
    tab.setAttribute("role", "tab");
    return tabs.appendChild(tab);
  });
  function show(position: number): void {
    buttons.forEach((tab, index) => {
      tab.setAttribute("aria-selected", String(index === position));
    });
    panel.replaceChildren(sections[position] ?? h("div"));
  }
  show(0);
  return detail;
}

/** A kind's icon, a mask in the kind's colour (#2741). */
function kindIcon(mode: LobbyMode): HTMLElement {
  const icon = h("span", "match-kind-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("style", `--icon: url("${railIconUrl(mode)}")`);
  return icon;
}

/** A chip toggling `value` in `chosen` (#2741); `label` follows its icon. */
function filterChip<T>(
  label: string,
  chosen: Set<T>,
  value: T,
  onChange: () => void,
  mode?: LobbyMode,
): HTMLButtonElement {
  const chip = button("", "skill-type-chip match-chip", () => {
    if (!chosen.delete(value)) {
      chosen.add(value);
    }
    chip.setAttribute("aria-pressed", String(chosen.has(value)));
    onChange();
  });
  chip.setAttribute("aria-pressed", String(chosen.has(value)));
  if (mode !== undefined) {
    chip.setAttribute("data-kind", mode);
    chip.append(kindIcon(mode));
  }
  chip.append(h("span", "match-chip-label", label));
  return chip;
}

function hallRow(hold: HallHold, nowSeconds: number): HTMLElement {
  const row = h("li", "matches-hall-row");
  const who = row.appendChild(h("span", "matches-hall-who"));
  const holder = who.appendChild(h("span", "matches-hall-holder", hold.holder));
  holder.dir = "auto";
  holder.title = hold.holder;
  const names = hold.people.join(" · ");
  const people = who.appendChild(h("span", "matches-hall-people", names));
  people.dir = "auto";
  people.title = names;
  const meta = row.appendChild(h("span", "matches-hall-meta"));
  if (hold.wins >= 2) {
    meta.appendChild(
      h("span", "matches-hall-streak", t("matches.hallStreak", { count: hold.wins })),
    );
  }
  meta.appendChild(h("span", "matches-hall-when", relativeTime(hold.endedAt, nowSeconds)));
  return row;
}

/**
 * The two chip groups (#2741): kinds, then sizes. Within a group a match
 * fits any pressed chip; it must fit both groups.
 */
function filterChips(onChange: () => void): HTMLElement {
  const filters = h("div", "match-filters");
  const kinds = filters.appendChild(h("div", "skill-type-chips match-chip-group"));
  kinds.setAttribute("role", "group");
  kinds.setAttribute("aria-label", t("matches.filterKind"));
  for (const mode of LOBBY_MODES) {
    kinds.appendChild(filterChip(t(MATCH_KINDS[mode]), sessionFilter.kinds, mode, onChange, mode));
  }
  const sizes = filters.appendChild(h("div", "skill-type-chips match-chip-group"));
  sizes.setAttribute("role", "group");
  sizes.setAttribute("aria-label", t("matches.filterSize"));
  for (const size of MATCH_SIZES) {
    sizes.appendChild(
      filterChip(t("matches.sizeChip", { size }), sessionFilter.sizes, size, onChange),
    );
  }
  return filters;
}

/** Each row's "when", which a redraw brings up to date. */
const rowWhen = new WeakMap<HTMLElement, HTMLElement>();

/** A record's row: its summary, a button that opens its detail in place. */
function matchRow(
  heard: HeardMatchRecord,
  onCloneTeam: (team: MatchRecordTeam) => void,
): HTMLElement {
  const { record } = heard;
  const row = h("li", "match-row");
  row.setAttribute("data-kind", record.mode);
  const when = h("span", "match-when");
  rowWhen.set(row, when);
  const head = row.appendChild(document.createElement("button"));
  head.type = "button";
  head.className = "match-row-head";
  head.setAttribute("aria-expanded", "false");
  // The closed row is one scoreboard line (#2585): names wait for the opened row.
  head.append(
    kindIcon(record.mode),
    h("span", "match-mode", railLabel(record.mode)),
    ...record.teams.flatMap((players, team) => [
      ...(team === 0 ? [] : [h("span", "match-result", resultMark(record))]),
      teamIcons(record, team, players),
    ]),
    h("span", "match-map", mapName(record.map)),
    h("span", "match-duration", formatClock(record.durationSeconds)),
    when,
  );
  const badge = head.appendChild(h("span", "match-host-reported", t("matches.hostReported")));
  badge.title = t("matches.hostReportedTitle");
  let detail: HTMLElement | undefined;
  head.addEventListener("click", () => {
    if (detail !== undefined) {
      detail.remove();
      detail = undefined;
      head.setAttribute("aria-expanded", "false");
      return;
    }
    detail = row.appendChild(matchDetail(record, onCloneTeam));
    head.setAttribute("aria-expanded", "true");
  });
  return row;
}

/**
 * Render the Matches page into `root` and start listening for records.
 * The page holds `recentMatches`: a record older than all of a full page,
 * or than `MATCHES_MAX_AGE_SECONDS`, is not shown.
 */
export function renderMatchesScreen(
  root: HTMLElement,
  options: MatchesScreenOptions,
): MatchesScreen {
  screenBar({ crumbs: ["VibeWars"], status: [], actions: [], join: true });
  const body = railScreen(root, "matches", options.onSwitch);
  const hall = body.appendChild(h("section", "matches-hall"));
  hall.hidden = true;
  hall.append(
    h("h2", "matches-hall-title", t("matches.hallTitle")),
    h("p", "matches-hall-reported", t("matches.hallReported")),
  );
  const hallList = hall.appendChild(h("ol", "matches-hall-list"));
  body.appendChild(
    filterChips(() => {
      draw();
    }),
  );
  body.appendChild(h("p", "matches-recent", t("matches.recentNote")));
  const note = body.appendChild(h("p", "matches-note", t("matches.noMatches")));
  const list = body.appendChild(h("ol", "match-list"));
  let records: HeardMatchRecord[] = [];
  let offline = false;

  const draw = (): void => {
    const nowSeconds = Math.floor(options.now() / 1000);
    const holds = hallHolds(
      records.map((heard) => heard.record),
      options.now(),
    );
    hall.hidden = holds.length === 0;
    hallList.replaceChildren(...holds.map((hold) => hallRow(hold, nowSeconds)));
    // A row the filter hides leaves the list, so it comes back closed.
    const shown = records.filter((heard) => matchesFilter(heard.record, sessionFilter));
    note.textContent = t(
      offline ? "matches.offline" : records.length === 0 ? "matches.noMatches" : "matches.noneFit",
    );
    note.hidden = !offline && shown.length > 0;
    syncList(
      list,
      shown,
      (heard) => heard.id,
      (heard) => matchRow(heard, options.onCloneTeam),
      (element, heard) => {
        const when = rowWhen.get(element);
        if (when !== undefined) {
          when.textContent = relativeTime(heard.record.endedAt, nowSeconds);
        }
      },
    );
  };

  const secondsNow = (): number => Math.floor(options.now() / 1000);
  const watch = options.watch({
    since: secondsNow() - MATCHES_MAX_AGE_SECONDS,
    record: (heard) => {
      offline = false;
      if (records.some((kept) => kept.id === heard.id)) {
        return;
      }
      records = recentMatches([...records, heard], secondsNow());
      draw();
    },
    noRelay: () => {
      offline = true;
      draw();
    },
  });
  const refresh = setInterval(() => {
    records = recentMatches(records, secondsNow());
    draw();
  }, MATCHES_REFRESH_MS);
  draw();
  return {
    close: () => {
      clearInterval(refresh);
      watch.close();
    },
  };
}
