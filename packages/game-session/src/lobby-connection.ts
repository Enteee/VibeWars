import type { PlayerBuild, ProfessionId } from "@vibewars/game-core";
import type {
  ChatChannel,
  LobbyMode,
  LobbyPhase,
  LobbyRefusal,
  WirePartyFormed,
  WireProposalBuild,
  WireTeamLobby,
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
  /** A bot the host added (#1193): no peer behind it. */
  readonly bot: boolean;
  /** Dropped, its seat held while it may come back (#1764). */
  readonly away: boolean;
}

export interface LobbySnapshot {
  readonly selfSessionId: string;
  readonly code: string;
  readonly phase: LobbyPhase;
  /** The host's mode (#1526): every member's rail follows it. */
  readonly mode: LobbyMode;
  readonly mapId: string;
  /** Whether a peer with the key may join (#1682): a guest's party strip says when not. */
  readonly open: boolean;
  /** The peer the lobby and its match are hosted on. */
  readonly hostId: string;
  readonly players: readonly LobbyPlayerSnapshot[];
  /** Whether this player is the host's own: the one who picks the map and starts. */
  readonly isHost: boolean;
  /** Whole seconds until a queued lobby's match starts (#871); `null` when none is counting. */
  readonly countdownSeconds: number | null;
  /**
   * The Team Lobby (#1458), while `phase` is `"team-lobby"`, else `null`:
   * this player's side only, the other side `null`.
   */
  readonly teamLobby: WireTeamLobby | null;
  /**
   * The skills and weapons of each proposal of this player's side the
   * host has sent (#1811), by proposer: the vote's, and the chosen one's
   * in the claim. A proposal not here yet shows its balls only.
   */
  readonly proposalBuilds: ReadonlyMap<string, readonly WireProposalBuild[]>;
  /** While `phase` is `"queued"` (#1766), this queueing's nonce; `null` otherwise. */
  readonly queueNonce: string | null;
  /** While `phase` is `"queued"` in Heroes' Ascent (#1996), the party's round; `null` otherwise. */
  readonly ascentRound: number | null;
}

/** A seat of a party's team plan as its host sends it (ADR-0042): its human's member key, `null` for a bot. */
export interface PartyPlanSeat {
  readonly memberKey: string | null;
  readonly build: PlayerBuild;
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
  /** This peer's party sent a team plan that was not whole: the house team plays. */
  readonly teamPlanRejected: boolean;
  /**
   * The room, for this match alone: hand it to `connectMatch`. Leaving it
   * leaves the match, not the lobby.
   */
  readonly transport: Transport;
}

/** The lobby's match, to watch from no team (#480): hand it to `connectObserver`. */
export interface MatchToWatch {
  readonly matchId: string;
  /** The room, for this match alone: leaving it leaves the match, not the lobby. */
  readonly transport: Transport;
}

export interface LobbyConnection {
  readonly selfSessionId: string;
  getSnapshot(): LobbySnapshot;
  chooseTeam(team: 0 | 1 | null): void;
  setReady(ready: boolean): void;
  selectMap(mapId: string): void;
  /** Host only (#1526): the lobby's mode, and a map of it. */
  selectMode(mode: LobbyMode): void;
  startMatch(): void;
  /**
   * Host only, in a team mode (#1766): the party's Team Lobby, then the
   * queue; in Heroes' Ascent at `ascentRound` (#1996), `null` otherwise.
   */
  findMatch(ascentRound: number | null): void;
  /** Host only (#1766): the queued party back in its lobby. */
  leaveQueue(): void;
  /** Host only (#1766): the queued party plays the house team, here. */
  playHouseTeam(): void;
  /**
   * The party is queued (#1766): this member's `key`, fresh, which signs
   * its consent to the party, once per queueing. The answer comes through
   * `onParty`, unless the party leaves the queue first.
   */
  queueParty(key: TicketKey): void;
  /** A team mode's party host, in its match's lobby (ADR-0042): its side's seats, in order. */
  sendTeamPlan(seats: readonly PartyPlanSeat[]): void;
  /** In a Team Lobby's vote (#1458): propose `members` for this side, or withdraw with `null`. */
  propose(members: readonly PlayerBuild[] | null): void;
  /** In a Team Lobby's vote: vote for `proposerId`'s proposal, or withdraw with `null`. */
  vote(proposerId: string | null): void;
  /** In a Team Lobby's claim: take slot `slot` of the chosen build, or let it go with `null`. */
  claim(slot: number | null): void;
  /** Say `text` on `channel` (#479), in the lobby or its match; the host cleans and routes it. */
  sendChat(channel: ChatChannel, text: string): void;
  onChange(handler: () => void): void;
  onMatchStarting(handler: (start: MatchStarting) => void): void;
  /** The match on now, to watch (#480); `undefined` while none is. */
  watchMatch(): MatchToWatch | undefined;
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
   * The host left for the lobby `code` (#1553): follow it there. Its
   * `onClosed` comes next, as for any host leaving.
   */
  onMove(handler: (code: string) => void): void;
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
