import type { ProfessionId } from "@vibewars/game-core";
import type {
  ChatChannel,
  LobbyPhase,
  LobbyRefusal,
  WirePartyFormed,
} from "@vibewars/game-protocol";

import type { TicketKey } from "./queue-client.js";
import type { Transport } from "./transport.js";

/**
 * A lobby as the lobby screen sees it (#379): plain snapshots and
 * callbacks, whoever hosts it.
 */

/** The character a member brings (#580): its name and professions, never its build. */
export interface LobbyCharacter {
  readonly name: string;
  readonly primary: ProfessionId;
  readonly secondary: ProfessionId | null;
}

export interface LobbyPlayerSnapshot {
  readonly sessionId: string;
  readonly name: string;
  /** The member's guild tag (#1406), after its name; `null` for none. */
  readonly guildTag: string | null;
  /** `null` spectates. */
  readonly team: 0 | 1 | null;
  readonly ready: boolean;
  readonly isHost: boolean;
  /** `null` brings a starter build. */
  readonly character: LobbyCharacter | null;
  /** A bot the host added (#1193): no peer behind it. */
  readonly bot: boolean;
}

export interface LobbySnapshot {
  readonly selfSessionId: string;
  readonly code: string;
  readonly phase: LobbyPhase;
  readonly mapId: string;
  /** The peer the lobby and its match are hosted on. */
  readonly hostId: string;
  readonly players: readonly LobbyPlayerSnapshot[];
  /** Whether this player is the host's own: the one who picks the map and starts. */
  readonly isHost: boolean;
  /** Whole seconds until a queued lobby's match starts (#871); `null` when none is counting. */
  readonly countdownSeconds: number | null;
}

/**
 * Why a lobby closed: the host closed it or left, or its peer was gone
 * for the whole reconnect window, which this side cannot tell from its
 * own connection dropping, or a queued lobby's group never filled (#871).
 */
export type LobbyClosedReason = "host-left" | "connection-lost" | "fell-through";

/** A chat line (#479), with its sender's name and team as it was sent. */
export interface ChatLine {
  readonly channel: ChatChannel;
  readonly fromId: string;
  readonly name: string;
  /** `null`: a spectator. */
  readonly team: 0 | 1 | null;
  readonly text: string;
}

/** The lobby's match is on, and this player is seated in it. */
export interface MatchStarting {
  readonly mapId: string;
  readonly matchId: string;
  /**
   * The room, for this match alone: hand it to `connectMatch`. Leaving it
   * leaves the match, not the lobby.
   */
  readonly transport: Transport;
}

export interface LobbyConnection {
  readonly selfSessionId: string;
  getSnapshot(): LobbySnapshot;
  chooseTeam(team: 0 | 1 | null): void;
  setReady(ready: boolean): void;
  selectMap(mapId: string): void;
  startMatch(): void;
  /** Host only (#1194): seat a bot playing `profession`'s starter build on `team`. */
  addBot(team: 0 | 1, profession: ProfessionId): void;
  /** Host only (#1194): unseat bot `botId`. */
  removeBot(botId: string): void;
  /** Say `text` on `channel` (#479), in the lobby or its match; the host cleans and routes it. */
  sendChat(channel: ChatChannel, text: string): void;
  onChange(handler: () => void): void;
  onMatchStarting(handler: (start: MatchStarting) => void): void;
  /** The host's own player alone: why the start it asked for did not happen. */
  onStartRejected(handler: (reason: string) => void): void;
  /** Once joined: the host refused something this player asked for, such as a bot (#1194). */
  onRefused(handler: (reason: LobbyRefusal) => void): void;
  /** A chat line reached this player. */
  onChat(handler: (line: ChatLine) => void): void;
  /** The host is dropping this player's lines, too many too fast: once a burst. */
  onChatThrottled(handler: () => void): void;
  /** The lobby is over for this player, and why. */
  onClosed(handler: (reason: LobbyClosedReason) => void): void;
  /**
   * After a queued match this player's side won (#882): stay together as
   * a party with `key`, fresh, which signs its consent to the party
   * (#1078), or `null` for no.
   */
  stayTogether(key: TicketKey | null): void;
  /**
   * The host's answer to a yes, once: every winner's key, sorted, with
   * each one's consent, when they all stay together, or `null` when the
   * team split up.
   */
  onParty(handler: (party: WirePartyFormed | null) => void): void;
  /**
   * This player signed the host's party proposal (#1078): its answer
   * comes up to the host's `PARTY_CONSENT_MS` after this, once.
   */
  onPartyProposal(handler: () => void): void;
  disconnect(): Promise<void>;
}
