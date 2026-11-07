/**
 * The Matches page (#2532): the finished matches hosts publish on Nostr
 * (#2528), newest first, live while the page is open. Every record is
 * the host's word only, and every row says so.
 */

import { decodeTemplateCode, type MatchEndReason } from "@vibewars/game-core";
import type { MatchRecord, MatchRecordPlayer, MatchRecordTeam } from "@vibewars/game-session";

import { ARENA_MAPS } from "../net/maps.js";
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
import { playerLabelText } from "./player-label.js";
import { railLabel, railScreen, type RailEntry } from "./rail.js";

/** The most records the page holds; the oldest goes first. */
export const MATCHES_KEPT = 100;

export const MATCHES_GOAL = "Matches as their hosts report them, the newest first.";
export const NO_MATCHES = "No matches yet. Finished matches appear here as they are played.";
export const MATCHES_OFFLINE = "Can't reach the match relays right now.";
export const HOST_REPORTED = "Published by the match's host; not verified by anyone else.";
export const BUILD_UNREADABLE = "Build unreadable";
/** A Clone's title when a build in its team can't be read (#2585). */
export const TEAM_UNREADABLE = "A build in this team can't be read";

const END_REASONS: Readonly<Record<MatchEndReason, string>> = {
  score: "Score",
  time: "Time ran out",
  annihilation: "Annihilation",
  morale: "Morale",
  "guild-lord": "Guild Lord slain",
  aggression: "Aggression at time",
};

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

/** `endedAt` (unix seconds) as how long before `nowSeconds` it was. */
export function relativeTime(endedAt: number, nowSeconds: number): string {
  const ago = Math.max(0, nowSeconds - endedAt);
  if (ago < 60) {
    return "just now";
  }
  if (ago < 3600) {
    return `${String(Math.floor(ago / 60))} min ago`;
  }
  if (ago < 86_400) {
    return `${String(Math.floor(ago / 3600))} h ago`;
  }
  return `${String(Math.floor(ago / 86_400))} d ago`;
}

function mapName(mapId: string): string {
  return ARENA_MAPS.find((map) => map.id === mapId)?.name ?? mapId;
}

/** "Won", "Lost" or "Draw", for team `team` of `record`. */
function teamResult(record: MatchRecord, team: 0 | 1): string {
  if (record.winningTeam === null) {
    return "Draw";
  }
  return record.winningTeam === team ? "Won" : "Lost";
}

/**
 * A team on the closed row (#2585): one primary profession icon per
 * player, the name and both professions on hover, and the winner's
 * underlined. A build it can't read is a question mark.
 */
function teamIcons(record: MatchRecord, team: 0 | 1): HTMLElement {
  const icons = h("span", record.winningTeam === team ? "match-team is-winner" : "match-team");
  for (const player of record.teams[team].players) {
    const name = playerLabelText(player.name, player.guildTag);
    const label = player.bot ? `${name} (bot)` : name;
    const decoded = decodeTemplateCode(player.template);
    if (!decoded.ok) {
      const unknown = icons.appendChild(h("span", "match-player-icon is-unknown", "?"));
      unknown.title = `${label}: ${BUILD_UNREADABLE}`;
      continue;
    }
    const { primaryProfession, secondaryProfession } = decoded.build;
    const icon = document.createElement("img");
    icon.className = "match-player-icon";
    icon.src = professionIcon(primaryProfession);
    icon.alt = `${label}: ${professionLabel(primaryProfession, secondaryProfession)}`;
    icon.title = icon.alt;
    icons.appendChild(icon);
  }
  return icons;
}

/** Between the two teams: which side won, or a draw. */
function resultMark(record: MatchRecord): string {
  if (record.winningTeam === null) {
    return "Draw";
  }
  return record.winningTeam === 0 ? "◂ Won" : "Won ▸";
}

/** A player as a team card's member row: its name, and the look its template says. */
function playerMember(player: MatchRecordPlayer): TeamFigureMember {
  const name = playerLabelText(player.name, player.guildTag);
  const decoded = decodeTemplate(player.template, "", 0);
  return {
    look: decoded.ok ? lookOfCharacter(decoded.character, undefined) : undefined,
    label: player.bot ? `${name} (bot)` : name,
  };
}

/**
 * A team's Clone (#2585): none for a size no Team Build has, disabled
 * when a build in it can't be read. One press, one copy.
 */
function cloneButton(players: MatchRecordTeam, onClone: () => void): HTMLElement[] {
  if (!isTeamBuildSize(players.players.length)) {
    return [];
  }
  const clone = button("Clone", "play-card-clone", () => {
    clone.disabled = true;
    onClone();
  });
  if (players.players.some((player) => !decodeTemplateCode(player.template).ok)) {
    clone.disabled = true;
    clone.title = TEAM_UNREADABLE;
  }
  return [clone];
}

function teamDetail(
  record: MatchRecord,
  team: 0 | 1,
  players: MatchRecordTeam,
  onCloneTeam: (team: MatchRecordTeam) => void,
): HTMLElement {
  const section = h("section", "match-detail-team");
  section.appendChild(
    teamFigureCard({
      title: h(
        "h4",
        "match-detail-result",
        `Team ${String(team + 1)}: ${teamResult(record, team)}`,
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
      `${END_REASONS[record.endReason]} after ${formatClock(record.durationSeconds)}`,
    ),
  );
  const tabs = detail.appendChild(h("div", "match-tabs"));
  tabs.setAttribute("role", "tablist");
  const panel = detail.appendChild(h("div", "match-tab-panel"));
  panel.setAttribute("role", "tabpanel");
  // The winner's tab first, and open (#2637); a draw keeps Team 1, Team 2.
  const order: readonly (0 | 1)[] = record.winningTeam === 1 ? [1, 0] : [0, 1];
  const sections = order.map((team) => teamDetail(record, team, record.teams[team], onCloneTeam));
  const buttons = order.map((team, position) => {
    const tab = button(
      `Team ${String(team + 1)} · ${teamResult(record, team)}`,
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

/** Each row's "when", which a redraw brings up to date. */
const rowWhen = new WeakMap<HTMLElement, HTMLElement>();

/** A record's row: its summary, a button that opens its detail in place. */
function matchRow(
  heard: HeardMatchRecord,
  onCloneTeam: (team: MatchRecordTeam) => void,
): HTMLElement {
  const { record } = heard;
  const row = h("li", "match-row");
  const when = h("span", "match-when");
  rowWhen.set(row, when);
  const head = row.appendChild(document.createElement("button"));
  head.type = "button";
  head.className = "match-row-head";
  head.setAttribute("aria-expanded", "false");
  // The closed row is one scoreboard line (#2585): names wait for the opened row.
  head.append(
    h("span", "match-mode", railLabel(record.mode)),
    teamIcons(record, 0),
    h("span", "match-result", resultMark(record)),
    teamIcons(record, 1),
    h("span", "match-map", mapName(record.map)),
    h("span", "match-duration", formatClock(record.durationSeconds)),
    when,
  );
  const badge = head.appendChild(h("span", "match-host-reported", "host-reported"));
  badge.title = HOST_REPORTED;
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
 * The page holds `MATCHES_KEPT` at most, newest `endedAt` first; a record
 * older than all of a full page is not shown.
 */
export function renderMatchesScreen(
  root: HTMLElement,
  options: MatchesScreenOptions,
): MatchesScreen {
  screenBar({ crumbs: ["VibeWars"], status: [], actions: [], join: true });
  const body = railScreen(root, "matches", MATCHES_GOAL, options.onSwitch);
  const note = body.appendChild(h("p", "matches-note", NO_MATCHES));
  const list = body.appendChild(h("ol", "match-list"));
  let records: HeardMatchRecord[] = [];
  let offline = false;

  const draw = (): void => {
    const nowSeconds = Math.floor(options.now() / 1000);
    note.textContent = offline ? MATCHES_OFFLINE : NO_MATCHES;
    note.hidden = !offline && records.length > 0;
    syncList(
      list,
      records,
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

  const watch = options.watch({
    record: (heard) => {
      offline = false;
      if (records.some((kept) => kept.id === heard.id)) {
        return;
      }
      records = [...records, heard]
        .sort((a, b) => b.record.endedAt - a.record.endedAt)
        .slice(0, MATCHES_KEPT);
      draw();
    },
    noRelay: () => {
      offline = true;
      draw();
    },
  });
  draw();
  return {
    close: () => {
      watch.close();
    },
  };
}
