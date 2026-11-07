import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { LOBBY_ICON } from "./icons.js";
import { h } from "./kit.js";
import { ascentLine, waitedLabel } from "./queue-screen.js";

/**
 * The Lobby window (#1526, ADR-0041, #2385): dropped from the top bar's
 * Lobby, under the lobby's controls, who is in this lobby with you. The
 * lobby is the party. While it is queued, the mode screen says so instead.
 */

/** One person in the party: a bot is the lobby's, not the party's. */
export interface PartyMember {
  readonly name: string;
  readonly isHost: boolean;
  readonly self: boolean;
  /** Dropped, its seat held while it may come back (#1764). */
  readonly away: boolean;
}

/** The lobby as the rail screens show it. */
export interface RailParty {
  readonly code: string;
  readonly mode: LobbyMode;
  /** Whether this player hosts it: only the host picks the mode. */
  readonly isHost: boolean;
  /** Whether friends with the key may join (#1682). */
  readonly open: boolean;
  readonly members: readonly PartyMember[];
  /** How long the party has looked for a team (#1766); `null` while not queued. */
  readonly queuedMs: number | null;
  /** Its players a side (#2104): in a Hosted Game, the host's pick. */
  readonly teamSize: number;
  /** Teams its queue hears searching, its own included (#1881); `undefined` until it says. */
  readonly teams: number | undefined;
  /** The Heroes' Ascent round it is queued at (#1996); `null` otherwise. */
  readonly ascentRound: number | null;
}

/**
 * The mode screen's line while the party is queued (#1766): "Looking for a
 * team… 1:05 · 2 teams searching", the time alone until the queue says
 * how many (#1881). Its own team always counts, so none means none heard
 * yet: a leader before its first tick, or a follower before it hears its
 * leader's ticket. A Team Arena's names its size (#2107): "Team Arena
 * 2v2 — searching… 1:05".
 */
export function lookingLabel(
  mode: LobbyMode,
  teamSize: number,
  queuedMs: number,
  teams: number | undefined,
): string {
  const size = `${String(teamSize)}v${String(teamSize)}`;
  const waited = waitedLabel(queuedMs);
  const looking =
    mode === "team-arena"
      ? t("lobbyWindow.teamArenaSearching", { size, waited })
      : t("lobbyWindow.looking", { waited });
  if (teams === undefined || teams === 0) {
    return looking;
  }
  return `${looking} · ${t("lobbyWindow.teamsSearching", { count: teams })}`;
}

/**
 * `snapshot`'s party, queued for `queuedMs` among `teams` or not: its
 * people, in lobby order.
 */
export function partyOf(
  snapshot: LobbySnapshot,
  queuedMs: number | null,
  teams: number | undefined,
): RailParty {
  return {
    queuedMs,
    teams,
    ascentRound: snapshot.ascentRound,
    teamSize: snapshot.teamSize,
    code: snapshot.code,
    mode: snapshot.mode,
    isHost: snapshot.isHost,
    open: snapshot.open,
    members: snapshot.players
      .filter((player) => !player.bot)
      .map((player) => ({
        name: player.name,
        isHost: player.isHost,
        self: player.sessionId === snapshot.selfSessionId,
        away: player.away,
      })),
  };
}

/**
 * Whether the window says the lobby is closed (#1682): to a guest, while
 * its host has it so. The host has the toggle above it instead.
 */
export function showsClosed(party: RailParty): boolean {
  return !party.isHost && !party.open;
}

/** `member`'s row's classes: greyed while it is away (#1764). */
export function memberClass(member: PartyMember): string {
  return [
    "party-member",
    ...(member.self ? ["is-self"] : []),
    ...(member.away ? ["is-away"] : []),
  ].join(" ");
}

/** Whether nobody but this player is in the party. */
export function isAlone(party: RailParty | undefined): boolean {
  return party === undefined || party.members.length <= 1;
}

/**
 * The mode screen's status line while `party` is queued (#1766, #2385):
 * the Heroes' Ascent round it is at (#1996) and how long it has looked,
 * the only queue timer a queued party sees; none while it is not queued.
 */
export function queueLine(party: RailParty): HTMLElement | undefined {
  if (party.queuedMs === null) {
    return undefined;
  }
  const line = h("div", "party-status");
  if (party.ascentRound !== null) {
    line.appendChild(h("span", "party-ascent", ascentLine(party.ascentRound)));
  }
  line.appendChild(
    h(
      "span",
      "party-queued",
      lookingLabel(party.mode, party.teamSize, party.queuedMs, party.teams),
    ),
  );
  return line;
}

/** What the Lobby window shows of `party`; none in a lobby yet reads as alone. */
export function lobbyWindowBody(party: RailParty | undefined): HTMLElement {
  const body = h("div", "lobby-window-body");
  if (party === undefined || isAlone(party)) {
    // The window with nobody else in the lobby (#2385): it always has something to say.
    body.appendChild(h("p", "lobby-window-alone", t("lobbyWindow.alone")));
  } else {
    const list = h("ul", "party-members");
    for (const member of party.members) {
      const row = h("li", memberClass(member));
      row.appendChild(h("span", "party-member-name", member.name));
      if (member.isHost) {
        row.appendChild(h("span", "party-host-mark", t("lobbyWindow.host")));
      }
      if (member.away) {
        // Beside a member whose connection dropped, while its seat is held (#1764).
        row.appendChild(h("span", "party-member-away", t("lobbyWindow.reconnecting")));
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  }
  if (party !== undefined && showsClosed(party)) {
    // The host's closed padlock (#2382): host and guest see the same sign.
    const glyph = document.createElement("img");
    glyph.className = "party-closed-glyph";
    glyph.alt = "";
    glyph.src = LOBBY_ICON.closed;
    const closed = body.appendChild(h("span", "party-closed"));
    closed.append(glyph, t("lobbyWindow.closed"));
  }
  return body;
}
