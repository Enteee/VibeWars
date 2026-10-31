import type { ProfessionId } from "@vibewars/game-core";
import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { createProfessionDot, professionLabel } from "./character-preview.js";
import { h } from "./kit.js";
import { displayLobbyCode } from "./lobby-screen.js";

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
  readonly members: readonly PartyMember[];
}

/** Shown while nobody else is here. */
export const PARTY_ALONE = "Share your key to play together";

/** `snapshot`'s party: its people, in lobby order. */
export function partyOf(snapshot: LobbySnapshot): RailParty {
  return {
    code: snapshot.code,
    mode: snapshot.mode,
    isHost: snapshot.isHost,
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
  if (isAlone(party)) {
    strip.appendChild(h("span", "party-alone", PARTY_ALONE));
  }
  strip.appendChild(h("span", "party-code", displayLobbyCode(party.code)));
  return strip;
}
