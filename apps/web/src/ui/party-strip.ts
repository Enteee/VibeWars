import type { ProfessionId } from "@vibewars/game-core";
import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { createProfessionDot, professionLabel } from "./character-preview.js";
import { h } from "./kit.js";
import { displayLobbyCode } from "./lobby-screen.js";
import { waitedLabel } from "./queue-screen.js";

/**
 * The party strip (#1526, ADR-0041): on top of every mode screen, who is
 * in this lobby with you, and its code. The lobby is the party.
 */

/** One person in the party: a bot is the lobby's, not the party's. */
export interface PartyMember {
  readonly name: string;
  /** The active character's; `null` for a starter build. */
  readonly primary: ProfessionId | null;
  readonly isHost: boolean;
  readonly self: boolean;
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
}

/** A guest's word that its host has the lobby closed (#1682). */
export const PARTY_CLOSED = "Lobby closed";

/** The strip's line while the party is queued (#1766): "Looking for a team… 1:05". */
export function lookingLabel(queuedMs: number): string {
  return `Looking for a team… ${waitedLabel(queuedMs)}`;
}

/** `snapshot`'s party, queued for `queuedMs` or not: its people, in lobby order. */
export function partyOf(snapshot: LobbySnapshot, queuedMs: number | null): RailParty {
  return {
    queuedMs,
    code: snapshot.code,
    mode: snapshot.mode,
    isHost: snapshot.isHost,
    open: snapshot.open,
    members: snapshot.players
      .filter((player) => !player.bot)
      .map((player) => ({
        name: player.name,
        primary: player.character?.primary ?? null,
        isHost: player.isHost,
        self: player.sessionId === snapshot.selfSessionId,
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

/** Whether nobody but this player is in the party. */
export function isAlone(party: RailParty | undefined): boolean {
  return party === undefined || party.members.length <= 1;
}

export function partyStrip(party: RailParty): HTMLElement {
  const strip = h("div", "party-strip");
  strip.setAttribute("aria-label", "Party");
  const list = h("ul", "party-members");
  for (const member of party.members) {
    const row = h("li", member.self ? "party-member is-self" : "party-member");
    if (member.primary !== null) {
      const dot = createProfessionDot(member.primary, undefined);
      dot.title = professionLabel(member.primary, undefined);
      row.appendChild(dot);
    }
    row.appendChild(h("span", "party-member-name", member.name));
    if (member.isHost) {
      row.appendChild(h("span", "party-host-mark", "Host"));
    }
    list.appendChild(row);
  }
  strip.appendChild(list);
  if (party.queuedMs !== null) {
    strip.appendChild(h("span", "party-queued", lookingLabel(party.queuedMs)));
  }
  if (showsClosed(party)) {
    strip.appendChild(h("span", "party-closed", PARTY_CLOSED));
  }
  strip.appendChild(h("span", "party-code", displayLobbyCode(party.code)));
  return strip;
}
