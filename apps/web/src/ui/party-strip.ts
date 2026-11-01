import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { h } from "./kit.js";
import { waitedLabel } from "./queue-screen.js";

/**
 * The party strip (#1526, ADR-0041): on top of every mode screen, who is
 * in this lobby with you, and its code. The lobby is the party.
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
  /** Teams its queue hears searching, its own included (#1881); `undefined` until it says. */
  readonly teams: number | undefined;
}

/** Beside a member whose connection dropped, while its seat is held (#1764). */
export const PARTY_RECONNECTING = "Reconnecting…";
/** A guest's word that its host has the lobby closed (#1682). */
export const PARTY_CLOSED = "Lobby closed";

/**
 * The strip's line while the party is queued (#1766): "Looking for a
 * team… 1:05 · 2 teams searching", the time alone until the queue says
 * how many (#1881). Its own team always counts, so none means none heard
 * yet: a leader before its first tick, or a follower before it hears its
 * leader's ticket.
 */
export function lookingLabel(queuedMs: number, teams: number | undefined): string {
  const looking = `Looking for a team… ${waitedLabel(queuedMs)}`;
  if (teams === undefined || teams === 0) {
    return looking;
  }
  return `${looking} · ${String(teams)} ${teams === 1 ? "team" : "teams"} searching`;
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
 * Whether the strip says the lobby is closed (#1682): to a guest, while
 * its host has it so. The host has the title bar's toggle instead.
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

export function partyStrip(party: RailParty): HTMLElement {
  const strip = h("div", "party-strip");
  strip.setAttribute("aria-label", "Party");
  const list = h("ul", "party-members");
  for (const member of party.members) {
    const row = h("li", memberClass(member));
    row.appendChild(h("span", "party-member-name", member.name));
    if (member.isHost) {
      row.appendChild(h("span", "party-host-mark", "Host"));
    }
    if (member.away) {
      row.appendChild(h("span", "party-member-away", PARTY_RECONNECTING));
    }
    list.appendChild(row);
  }
  strip.appendChild(list);
  if (party.queuedMs !== null) {
    strip.appendChild(h("span", "party-queued", lookingLabel(party.queuedMs, party.teams)));
  }
  if (showsClosed(party)) {
    strip.appendChild(h("span", "party-closed", PARTY_CLOSED));
  }
  return strip;
}
