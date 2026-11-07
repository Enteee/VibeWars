import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { LOBBY_ICON } from "./icons.js";
import { h } from "./kit.js";

/**
 * The Lobby window (#1526, ADR-0041, #2385): dropped from the top bar's
 * Lobby, under the lobby's controls, who is in this lobby with you. The
 * lobby is the party. While it is queued, the top bar's queue icon says so (#2743).
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
}

/** Beside a member whose connection dropped, while its seat is held (#1764). */
export const PARTY_RECONNECTING = "Reconnecting…";
/** A guest's word that its host has the lobby closed (#1682). */
export const PARTY_CLOSED = "Lobby closed";
/** The window with nobody else in the lobby (#2385): it always has something to say. */
export const PARTY_ALONE = "Just you.";

/**
 * `snapshot`'s party, queued for `queuedMs` or not: its people, in lobby
 * order.
 */
export function partyOf(snapshot: LobbySnapshot, queuedMs: number | null): RailParty {
  return {
    queuedMs,
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

/** What the Lobby window shows of `party`; none in a lobby yet reads as alone. */
export function lobbyWindowBody(party: RailParty | undefined): HTMLElement {
  const body = h("div", "lobby-window-body");
  if (party === undefined || isAlone(party)) {
    body.appendChild(h("p", "lobby-window-alone", PARTY_ALONE));
  } else {
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
    body.appendChild(list);
  }
  if (party !== undefined && showsClosed(party)) {
    // The host's closed padlock (#2382): host and guest see the same sign.
    const glyph = document.createElement("img");
    glyph.className = "party-closed-glyph";
    glyph.alt = "";
    glyph.src = LOBBY_ICON.closed;
    const closed = body.appendChild(h("span", "party-closed"));
    closed.append(glyph, PARTY_CLOSED);
  }
  return body;
}
