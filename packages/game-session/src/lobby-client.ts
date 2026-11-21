import {
  LOBBY_REFUSALS,
  MAX_WIRE_CHAT_TEXT,
  PROTOCOL_VERSION,
  parseWireChatLine,
  parseWireSharedTrack,
  MAX_LOBBY_PLAYERS,
  type WireSharedTrack,
  parseWireLobbyNote,
  parseWireTeamProposalBuilds,
  parseWireLobbyState,
  parseWireLobbyWelcome,
  parsePeerLobbyChallenge,
  parseWireMatchStart,
  parseWirePartyFormed,
  parseWirePartyProposal,
  parseWirePartySplit,
  parseWireLobbyMove,
  parsePeerLobbySeat,
  parsePeerRelayAdmit,
  parsePeerRelayCredIn,
  parsePeerRelayOffers,
  parseWireRankedCancel,
  parseWireRankedReceipt,
  parseWireRankedResult,
  parseWireRankedStart,
  parseWireRankedStartSigs,
  parseWireEnded,
  teamQueueModeOf,
  type JsonValue,
  type LobbyRefusal,
  type PeerPartyConsent,
  type TicketClaim,
  type PeerStayTogether,
  type PeerLobbyHello,
  type PeerLobbyProof,
  type PeerLobbyLeave,
  type PeerLobbyJoin,
  type WireCape,
  type WireLobbyCommand,
  type WireLobbyState,
  type WireProposalBuild,
  type WirePartyFormed,
  type PeerRelayAdmit,
  type PeerRelayHolding,
  type PeerRelayCredIn,
  type PeerRelayCredOut,
  type PeerRelayOffers,
  type PeerRankedResultSig,
  type PeerRankedStartSig,
  type WireTeam,
} from "@vibewars/game-protocol";
import {
  ZERO_HASH,
  startDigest,
  startHash,
  validateReceipt,
  type RankedReceipt,
  type RankedResult,
  type RankedStart,
  type ReceiptCrypto,
} from "@vibewars/ranking";

import { MessageBudget } from "./intent-budget.js";
import { keyGated } from "./key-gate.js";
import type {
  ChatLine,
  LobbyClosedReason,
  LobbyConnection,
  LobbySnapshot,
  MatchStarting,
} from "./lobby-connection.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import type { PlayerKey } from "./player-key.js";
import { claimsHold, type LeaderboardSource } from "./ranked-claims.js";
import { sanitizeChatText, sanitizeName } from "./names.js";
import { admissionDigest, partyGroupId, type QueuedSeat } from "./queue-admission.js";
import type { TicketKey } from "./queue-client.js";

/** Who a chat line is from when nothing of its name is left to show (#479). */
const UNNAMED_SPEAKER = "Unnamed";
/**
 * Shares a host relays to this player a second, at most (#2745): every
 * other member's one in ten seconds, with room for a full lobby's burst.
 * Past it, a share is dropped before it is parsed.
 */
const SHARED_TRACKS_PER_SECOND = MAX_LOBBY_PLAYERS / 10;
import { scopeTransport } from "./scoped-transport.js";
import type { Transport, TransportTrouble } from "./transport.js";

/**
 * A lobby on another peer's browser, as the lobby screen sees every
 * lobby: a `LobbyConnection` (#379). The host is the peer that sends the
 * first state listing this player; from then on, only its messages count.
 *
 * During a match, the host's peer going is a drop the match waits out
 * (#515), so the lobby waits as long before it closes, and when the peer
 * is back, joins again: the host dropped this player from the lobby as it
 * went, and the match's end would otherwise find nobody to return to.
 *
 * A queued lobby's joiner (#871) says only hello to the room and to each
 * peer as it arrives. A peer whose welcome proves it holds the planned
 * host's ticket gets the join, with this ticket's proof, to it alone;
 * lobby messages count only from such a peer.
 */

/** Nobody answered: a wrong code, or a host that cannot be reached. */
export class LobbyNoAnswerError extends Error {
  /**
   * The last trouble the transport said before the timeout (#707): how
   * far the join got, so the player is told which part failed. `null`
   * when it said none.
   */
  public readonly trouble: TransportTrouble | null;

  public constructor(timeoutMs: number, trouble: TransportTrouble | null) {
    super(`No lobby answered within ${String(timeoutMs / 1000)} s.`);
    this.name = "LobbyNoAnswerError";
    this.trouble = trouble;
  }
}

/** The host turned this player away, and said why. */
export class LobbyRefusedError extends Error {
  public readonly reason: LobbyRefusal;

  public constructor(reason: LobbyRefusal) {
    super(`The lobby refused to let this player in: ${reason}.`);
    this.name = "LobbyRefusedError";
    this.reason = reason;
  }
}

export interface JoinLobbyOptions {
  /** The room named by the code. */
  readonly transport: Transport;
  readonly code: string;
  /**
   * What this peer proves the lobby key with (#1681, `LobbyRoom`), and
   * what the host must prove it with back. `null` for the host's own
   * player, on its local link, and for a queued lobby.
   */
  readonly proofKey: Uint8Array | null;
  readonly name: string;
  /** The guild tag the player set (#1406); `null` for none. */
  readonly guildTag: string | null;
  /** The player's hero rank (#2702). */
  readonly heroRank: number;
  /** The guild cape the player designed (#1422); `null` for none. */
  readonly guildCape: WireCape | null;
  /** How long to wait for a state that lists this player. */
  readonly timeoutMs: number;
  /** The queue's lobby, joined with this seat's ticket; not a coded one. */
  readonly queued?: QueuedSeat;
  /**
   * A coded lobby's derived room id (`deriveLobbyRoom`, #1766): its party
   * group is worked out from it, so this player consents to no other.
   * Without it, this player consents to no party of its lobby.
   */
  readonly roomId?: string;
  /**
   * This page's relay key (#2529, `PeerLobbyJoin.relayPub`): what
   * members seal its relay logins to. `null` for none.
   */
  readonly relayPub: string | null;
  /** This browser's player key (#2706): every join proves it to the host. */
  readonly playerKey: PlayerKey;
  /**
   * This player's claim from its own copy of the leaderboard (#3575),
   * read when it consents to a party: the party's ticket carries it.
   */
  readonly claim: () => TicketClaim;
  /**
   * How this player plays a ranked match (ADR-0055, #3573): only a queued
   * group that is `ranked` uses it. Without it, this player signs nothing,
   * and the host cancels a ranked match it is seated in.
   */
  readonly ranked?: RankedPlay;
}

/** What this player plays a ranked match with (ADR-0055, #3573), when its queued group is ranked. */
export interface RankedPlay {
  /** The character it plays: its seat's `characterId`. */
  readonly characterId: string;
  /** `receiptHash` of this player's own last receipt, or `ZERO_HASH` for its first. */
  readonly prev: string;
  /** This page's build: a start naming another is not signed. */
  readonly buildHash: string;
  /** What the host's and the other seats' signatures are checked with. */
  readonly crypto: ReceiptCrypto;
  /** The leaderboard every seat's claim is checked against (#3575): see `claimsHold`. */
  readonly leaderboard: LeaderboardSource;
  /**
   * This player's proof-of-work stamp for the start whose hash is
   * `startHash` (#3746), asked once, when every seat signed it: the app
   * computes it off the main thread. Its result signatures wait for it.
   */
  readonly work: (startHash: string) => Promise<string>;
  /**
   * The match's receipt, `partial` false: the host's, every signature in
   * and valid. Or, `partial` true, the `host-left` one this player built
   * and signed alone when its host went mid-match: every remaining player
   * hands on its own, and `mergeReceipts` joins them into one that holds.
   * At most once a lobby.
   */
  readonly onReceipt: (receipt: RankedReceipt, partial: boolean) => void;
  /**
   * This player signed `partial`'s result, a round of it: the start, every
   * start signature, that result and this player's signature alone. Every
   * round it signs, at once, for the app to publish: should a later round
   * name this player a leaver, it is the evidence that it did sign.
   * `round` counts the results this player signed for the match, from 0,
   * so the app can publish each partial under its own address: a later
   * round must not replace an earlier one's evidence.
   */
  readonly onResultSigned: (partial: RankedReceipt, round: number) => void;
  /**
   * This player signed the host's start (#3680): the match waits on every
   * other seat's signature now, for up to `RANKED_START_TIMEOUT_MS`.
   */
  readonly onStartSigned: () => void;
  /** The host cancelled the match before it began: some seat never signed its start. */
  readonly onCancel: () => void;
}

/** Whether `a` is `b`, its leavers in any order. */
function sameRankedResult(a: RankedResult, b: RankedResult | undefined): boolean {
  if (b === undefined) {
    return false;
  }
  const leavers = new Set(a.leavers);
  return (
    a.startHash === b.startHash &&
    a.winningTeam === b.winningTeam &&
    a.endReason === b.endReason &&
    a.durationSeconds === b.durationSeconds &&
    a.replayHash === b.replayHash &&
    leavers.size === new Set(b.leavers).size &&
    b.leavers.every((pubkey) => leavers.has(pubkey))
  );
}

/**
 * `start`'s problem as `seat` of `group` sees it, signing with `pubkey`
 * (ADR-0055): `undefined` when it names this lobby's group, its seed,
 * map and mode, `play`'s build, the formed teams seat for
 * seat with each seat key's claim, and this player in its own seat as it
 * joined. Its claims are checked against the leaderboard apart, by
 * `claimsHold` (#3575), which fetches the boards they name.
 */
function rankedStartFault(
  start: RankedStart,
  seat: QueuedSeat,
  play: RankedPlay,
  pubkey: string,
): string | undefined {
  const { group } = seat;
  if (
    start.matchId !== group.groupId ||
    start.buildHash !== play.buildHash ||
    start.seed !== group.seed ||
    start.mode !== group.mode ||
    start.map !== group.mapId ||
    start.teams.length !== group.teams.length
  ) {
    return "not this group's match";
  }
  const pubkeys = new Set<string>();
  for (const [t, team] of group.teams.entries()) {
    const seats = start.teams[t] ?? [];
    if (seats.length !== team.length) {
      return "not the formed teams";
    }
    for (const [i, seatKey] of team.entries()) {
      const ranked = seats[i];
      const claim = group.claims[seatKey];
      if (
        ranked === undefined ||
        ranked.claimedRating !== claim?.rating ||
        ranked.leaderboardAsOf !== claim.asOf
      ) {
        return "a claim not its ticket's";
      }
      const own = seatKey === seat.key.ticketId;
      if (
        own &&
        (ranked.pubkey !== pubkey ||
          ranked.characterId !== play.characterId ||
          ranked.prev !== play.prev)
      ) {
        return "not this player's seat";
      }
      // Only this player's own key may be in its seat, and no key twice.
      if ((!own && ranked.pubkey === pubkey) || pubkeys.has(ranked.pubkey)) {
        return "a key seated twice";
      }
      pubkeys.add(ranked.pubkey);
    }
  }
  return undefined;
}

function isRefusal(reason: string): reason is LobbyRefusal {
  return LOBBY_REFUSALS.some((refusal) => refusal === reason);
}

export function joinLobby(options: JoinLobbyOptions): Promise<LobbyConnection> {
  const { timeoutMs, queued } = options;
  let hostId: string | undefined;
  /**
   * The host's token for this player's seat (#2157), sent back only to the
   * host, only on a return after a drop. `hostId` never changes once set,
   * so a token is never told to another host.
   */
  let rejoinToken: string | null = null;
  // Once the host is known, no other peer in the room is heard or told
  // anything (#1682): Trystero connects every key holder to the guests too.
  const transport =
    options.proofKey === null
      ? options.transport
      : keyGated(options.transport, options.proofKey, "guest", () => hostId);
  const selfId = transport.selfId;
  const code = options.code;
  /** What this player plays its ranked match with: only in a ranked group. */
  const rankedPlay = queued?.group.ranked === true ? options.ranked : undefined;
  const base = {
    protocolVersion: PROTOCOL_VERSION,
    name: options.name,
    guildTag: options.guildTag,
    heroRank: options.heroRank,
    guildCape: options.guildCape,
    relayPub: options.relayPub,
    playerPubkey: options.playerKey.pubkey,
  };
  /** A coded lobby's join; a queued one's is made with its proof. */
  const codedJoin: Omit<PeerLobbyJoin, "rejoinToken"> = {
    ...base,
    admission: null,
    ascentMorale: 0,
    ranked: null,
  };
  /** A queued join, and what the planned host's welcome to this peer signs. */
  const proof =
    queued === undefined
      ? undefined
      : Promise.all([
          admissionDigest(
            "vibewars-admit",
            queued.group.groupId,
            queued.group.hostTicketId,
            selfId,
          ),
          admissionDigest("vibewars-host", queued.group.groupId, queued.group.hostTicketId, selfId),
        ]).then(([admit, hostDigest]) => ({
          join: {
            ...base,
            admission: { seatKey: queued.key.ticketId, admissionSig: queued.key.sign(admit) },
            ascentMorale: queued.ascentMorale,
            ranked:
              rankedPlay === undefined
                ? null
                : { characterId: rankedPlay.characterId, prev: rankedPlay.prev },
          } satisfies Omit<PeerLobbyJoin, "rejoinToken">,
          hostDigest,
        }));
  /** Peers whose welcome proved them the planned host; each got the join once. */
  const provenHosts = new Set<string>();
  /** Peers whose welcome was checked, proven or not. */
  const checkedWelcomes = new Set<string>();
  const unsubscribe: (() => void)[] = [];
  let latest: WireLobbyState | undefined;
  /** What the host sent of each proposal on this side (#1811), by proposer. */
  const proposalBuilds = new Map<string, readonly WireProposalBuild[]>();
  /** The match whose start was already handed on, so a repeat is not. */
  let startedMatch: string | null = null;
  let closed = false;
  /** `disconnect` ran: a second, as a page going away after a Leave, does nothing. */
  let left = false;
  const changeHandlers: (() => void)[] = [];
  const startingHandlers: ((start: MatchStarting) => void)[] = [];
  const rejectedHandlers: ((reason: string) => void)[] = [];
  const noticeHandlers: ((text: string) => void)[] = [];
  const refusedHandlers: ((reason: LobbyRefusal) => void)[] = [];
  const closedHandlers: ((reason: LobbyClosedReason) => void)[] = [];
  const moveHandlers: ((code: string) => void)[] = [];
  const offersHandlers = new Set<(offers: PeerRelayOffers) => void>();
  /** The host's last `relay-offers`, for a handler added after it came. */
  let relayOffers: PeerRelayOffers | undefined;
  const credHandlers = new Set<(cred: PeerRelayCredIn) => void>();
  const admitHandlers = new Set<(admit: PeerRelayAdmit) => void>();
  const chatHandlers: ((line: ChatLine) => void)[] = [];
  const throttledHandlers: (() => void)[] = [];
  const sharedHandlers: ((share: WireSharedTrack) => void)[] = [];
  const shareThrottledHandlers: (() => void)[] = [];
  const sharedBudget = new MessageBudget(
    SHARED_TRACKS_PER_SECOND,
    MAX_LOBBY_PLAYERS,
    () => undefined,
  );
  const partyHandlers: ((party: WirePartyFormed | null) => void)[] = [];
  const proposalHandlers: (() => void)[] = [];
  /** The host answered a Stay together; a second answer is not heard. */
  let partyAnswered = false;
  /** This player voted on Stay together; the host counts that first vote alone. */
  let voted = false;
  /** The key this player said yes with, which signs its consent (#1078). */
  let partyKey: TicketKey | undefined;
  /** It signed a proposal: one consent a vote. */
  let consented = false;
  /**
   * The queueing this player last saw (#1766), and the group its party
   * makes, which it works out for itself: a proposal of any other is not
   * consented to.
   */
  let queueing: { readonly nonce: string; readonly groupId: Promise<string> } | undefined;
  /** Until the join settles: how a refusal or the timeout ends it. */
  let failJoin: ((error: Error) => void) | undefined;
  /** When the host's peer went mid-match, by `Date.now`, while waiting for it back. */
  let droppedAt: number | undefined;
  let closeTimer: unknown;
  let stopped = false;
  /**
   * The ranked start this player signed (#3573), its hash, and the host's
   * key in it; then every seat's signature of it, once the host sent them
   * all and they verify: the match is on.
   */
  let ranked:
    | {
        readonly start: RankedStart;
        readonly hash: string;
        readonly hostPubkey: string;
        startSigs: Readonly<Record<string, string>> | undefined;
        /** This player's stamp for the start (#3746), once its worker found it. */
        work: string | undefined;
      }
    | undefined;
  /** What signs, once this player's stamp is ready (#3746): the latest result, or `host-left`. */
  let rankedWaiting: (() => void) | undefined;
  /** This player's ranked match is over for it: a receipt was handed on, or the match cancelled. */
  let rankedOver = false;
  /** A ranked start's claims are being checked (#3575): a second start waits for no fetch. */
  let checkingStart = false;
  /**
   * The seats of the ranked match this player saw go once it signed the
   * start (ADR-0055), by pubkey: a peer that left the room, a member the
   * lobby listed away, or one it stopped listing. A result naming any
   * other leaver is not signed, unless a re-round named it (see
   * `rankedLeaversHold`).
   */
  const seenGone = new Set<string>();
  /** The winner the host's `ended` told this player, once it came: what a result must say. */
  let endedWinner: WireTeam | null | undefined;
  /** The last ranked result this player signed: a re-round's is compared with it. */
  let signedResult: RankedResult | undefined;
  /** This player's signature of `signedResult`, sent again if the host asks again. */
  let signedSig: string | undefined;
  /** How many results this player signed: the next partial's round. */
  let resultsSigned = 0;

  /** Note the seats `state` lists away, or no longer lists, as gone. */
  const noteGone = (state: WireLobbyState): void => {
    if (ranked === undefined) {
      return;
    }
    const listed = new Map(state.players.map((player) => [player.playerPubkey, player]));
    for (const seat of ranked.start.teams.flat()) {
      const player = listed.get(seat.pubkey);
      const wasListed = latest?.players.some((each) => each.playerPubkey === seat.pubkey) === true;
      if (player?.away === true || (player === undefined && wasListed)) {
        seenGone.add(seat.pubkey);
      }
    }
  };

  /**
   * Whether `result`'s leavers are ones this player may sign for
   * (ADR-0055, "What a host decides"). Before it signed any, each must be
   * one it saw go. After, only a re-round of the result it signed: that
   * result with strictly more leavers, each a seat of the start, which the
   * host says did not sign it, and nothing else changed, so a host gets at
   * most a round per seat. Refusing to sign is leaving, and nobody else can
   * see a refusal, so the new ones are taken on the host's word. A host
   * that names a seat that did sign is caught by that seat's published
   * signature of the earlier round (`onResultSigned`); a result this
   * player refused is never an earlier round, so it can leave none.
   */
  const rankedLeaversHold = (result: RankedResult): boolean => {
    if (signedResult === undefined) {
      return result.leavers.every((pubkey) => seenGone.has(pubkey));
    }
    const leavers = new Set(result.leavers);
    const seated = new Set(ranked?.start.teams.flat().map((seat) => seat.pubkey));
    return (
      result.leavers.every((pubkey) => seated.has(pubkey)) &&
      leavers.size > new Set(signedResult.leavers).size &&
      signedResult.leavers.every((pubkey) => leavers.has(pubkey)) &&
      result.winningTeam === signedResult.winningTeam &&
      result.endReason === signedResult.endReason &&
      result.durationSeconds === signedResult.durationSeconds &&
      result.replayHash === signedResult.replayHash
    );
  };

  /**
   * The host went mid-match, its start signed by every seat (ADR-0055): the
   * match is over, and the host lost. This player builds the `host-left`
   * result every remaining player builds alike, signs it, and hands on its
   * partial receipt. Not the host's own player, which is the leaver.
   */
  const rankedHostLeft = (): void => {
    const signed = ranked;
    if (
      rankedPlay === undefined ||
      signed?.startSigs === undefined ||
      rankedOver ||
      latest?.phase !== "in-match" ||
      queued?.key.ticketId === queued?.group.hostTicketId
    ) {
      return;
    }
    const { work } = signed;
    if (work === undefined) {
      // Signed once this player's stamp is ready (#3746).
      rankedWaiting = rankedHostLeft;
      return;
    }
    rankedOver = true;
    const result: RankedResult = {
      startHash: signed.hash,
      winningTeam: null,
      endReason: "host-left",
      leavers: [signed.hostPubkey],
      durationSeconds: 0,
      replayHash: ZERO_HASH,
    };
    rankedPlay.onReceipt(
      {
        start: signed.start,
        startSigs: signed.startSigs,
        result,
        resultSigs: {
          [options.playerKey.pubkey]: { sig: options.playerKey.signRankedResult(result), work },
        },
      },
      true,
    );
  };

  /**
   * The result to sign (#3573): of this start, and not one naming this
   * player a leaver, whose signature nobody needs. A host never writes
   * `host-left`. Signed once this player's stamp is ready (#3746): until
   * then the latest result waits, and is checked again when it is.
   */
  const onRankedResult = (data: unknown, from: string): void => {
    const said = parseWireRankedResult(data);
    const signed = ranked;
    if (
      from !== hostId ||
      said === undefined ||
      signed?.startSigs === undefined ||
      rankedOver ||
      said.result.startHash !== signed.hash ||
      said.result.endReason === "host-left"
    ) {
      return;
    }
    const { work } = signed;
    if (work === undefined) {
      rankedWaiting = () => {
        onRankedResult(data, from);
      };
      return;
    }
    if (signedSig !== undefined && sameRankedResult(said.result, signedResult)) {
      // The host lost this player's signature: the one it has, again,
      // with nothing new signed or handed on to publish.
      const again: PeerRankedResultSig = { startHash: signed.hash, sig: signedSig, work };
      transport.send("ranked-result-sig", again, from);
      return;
    }
    const holds =
      !said.result.leavers.includes(options.playerKey.pubkey) &&
      said.result.winningTeam === endedWinner &&
      rankedLeaversHold(said.result);
    if (!holds) {
      return;
    }
    signedResult = said.result;
    const reply: PeerRankedResultSig = {
      startHash: signed.hash,
      sig: options.playerKey.signRankedResult(said.result),
      work,
    };
    signedSig = reply.sig;
    transport.send("ranked-result-sig", reply, from);
    rankedPlay?.onResultSigned(
      {
        start: signed.start,
        startSigs: signed.startSigs,
        result: said.result,
        resultSigs: { [options.playerKey.pubkey]: { sig: reply.sig, work } },
      },
      resultsSigned,
    );
    resultsSigned += 1;
  };

  const stop = (): void => {
    stopped = true;
    rankedWaiting = undefined;
    clearTimeout(closeTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    changeHandlers.length = 0;
    startingHandlers.length = 0;
    rejectedHandlers.length = 0;
    noticeHandlers.length = 0;
    refusedHandlers.length = 0;
    closedHandlers.length = 0;
    moveHandlers.length = 0;
    offersHandlers.clear();
    credHandlers.clear();
    chatHandlers.length = 0;
    throttledHandlers.length = 0;
    sharedHandlers.length = 0;
    shareThrottledHandlers.length = 0;
    partyHandlers.length = 0;
    proposalHandlers.length = 0;
  };

  /** The host's answer to this player's Stay together, once. */
  const answerParty = (party: WirePartyFormed | null): void => {
    if (partyAnswered) {
      return;
    }
    partyAnswered = true;
    for (const handler of [...partyHandlers]) {
      handler(party);
    }
  };

  const close = (reason: LobbyClosedReason): void => {
    if (closed) {
      return;
    }
    if (reason === "host-left" || reason === "connection-lost") {
      rankedHostLeft();
    }
    closed = true;
    const handlers = [...closedHandlers];
    stop();
    for (const handler of handlers) {
      handler(reason);
    }
  };

  /**
   * Join through `to`; a coded lobby's first join may go to the whole room.
   * Only a join to the known host, a return after a drop, carries the seat's
   * token (#2157): to anyone else it would hand the seat over.
   */
  const sendJoin = (to?: string): void => {
    const token = (): PeerLobbyJoin["rejoinToken"] =>
      to !== undefined && to === hostId ? rejoinToken : null;
    if (proof === undefined) {
      transport.send(
        "lobby-join",
        { ...codedJoin, rejoinToken: token() } satisfies PeerLobbyJoin,
        to,
      );
    } else if (to !== undefined) {
      void proof.then(({ join }) => {
        if (!stopped) {
          transport.send(
            "lobby-join",
            { ...join, rejoinToken: token() } satisfies PeerLobbyJoin,
            to,
          );
        }
      });
    }
  };

  /**
   * Make this peer known to `to`, or to the room: a coded lobby's join,
   * or a queued one's hello, which carries nothing and asks a host to
   * prove itself before the join goes to it.
   */
  const knock = (to?: string): void => {
    if (queued === undefined) {
      sendJoin(to);
    } else {
      transport.send("lobby-hello", {} satisfies PeerLobbyHello, to);
    }
  };

  /** Whether lobby messages from `from` count before the host is known. */
  const mayHost = (from: string): boolean => queued === undefined || provenHosts.has(from);

  const send = (command: WireLobbyCommand): void => {
    if (hostId !== undefined && !closed) {
      transport.send("lobby-cmd", command, hostId);
    }
  };

  const snapshot = (state: WireLobbyState): LobbySnapshot => ({
    selfSessionId: selfId,
    code: state.code,
    phase: state.phase,
    mode: state.mode,
    mapId: state.mapId,
    teamSize: state.teamSize,
    open: state.open,
    hostId: state.hostId,
    players: state.players.map((player) => ({
      sessionId: player.id,
      name: player.name,
      guildTag: player.guildTag,
      heroRank: player.heroRank,
      team: player.team,
      ready: player.ready,
      isHost: player.isHost,
      bot: player.bot,
      away: player.away,
      playerPubkey: player.playerPubkey,
    })),
    isHost: state.players.some((player) => player.id === selfId && player.isHost),
    countdownSeconds: state.countdownSeconds,
    teamLobby: state.teamLobby,
    proposalBuilds: new Map(proposalBuilds),
    queueNonce: state.queueNonce,
    ascentRound: state.ascentRound,
    ascentLock: state.ascentLock,
  });

  /**
   * Forget the builds of a proposal `state` no longer lists (#1811). The
   * claim lists none but the chosen one, which keeps the vote's for its
   * faded cards; the Team Lobby over, none are kept.
   */
  const forgetProposals = (state: WireLobbyState): void => {
    const team = state.players.find((player) => player.id === selfId)?.team ?? null;
    const side = team === null || team === 2 ? null : (state.teamLobby?.sides[team] ?? null);
    if (side === null) {
      proposalBuilds.clear();
      return;
    }
    if (state.teamLobby?.stage !== "vote") {
      return;
    }
    const listed = new Set(side.proposals.map(({ proposerId }) => proposerId));
    for (const proposerId of proposalBuilds.keys()) {
      if (!listed.has(proposerId)) {
        proposalBuilds.delete(proposerId);
      }
    }
  };

  /** A new queueing (#1766) is a new party: its key, consent and answer start over. */
  const noteQueueing = (state: WireLobbyState): void => {
    const nonce = state.phase === "queued" ? state.queueNonce : null;
    if (nonce === (queueing?.nonce ?? null)) {
      return;
    }
    queueing =
      nonce === null || options.roomId === undefined
        ? undefined
        : { nonce, groupId: partyGroupId(options.roomId, nonce) };
    partyKey = undefined;
    consented = false;
    partyAnswered = false;
  };

  return new Promise((resolve, reject) => {
    /** Until the join settles; trouble after it is the match's to handle (#596). */
    let trouble: TransportTrouble | null = null;
    const timer = setTimeout(() => {
      failJoin?.(new LobbyNoAnswerError(timeoutMs, trouble));
    }, timeoutMs);
    failJoin = (error) => {
      failJoin = undefined;
      clearTimeout(timer);
      stop();
      reject(error);
    };

    const connection: LobbyConnection = {
      selfSessionId: selfId,
      getSnapshot() {
        if (latest === undefined) {
          throw new Error("a lobby connection exists only once a state has listed it");
        }
        return snapshot(latest);
      },
      chooseTeam(team) {
        send({ kind: "choose-team", team });
      },
      setReady(ready) {
        send({ kind: "ready", ready });
      },
      selectMap(mapId) {
        send({ kind: "select-map", mapId });
      },
      selectTeamSize(size) {
        send({ kind: "select-team-size", size });
      },
      selectMode(mode) {
        send({ kind: "select-mode", mode });
      },
      startMatch() {
        send({ kind: "start" });
      },
      removeMember(id) {
        send({ kind: "remove-member", id });
      },
      findMatch(ascentRound) {
        send({ kind: "find-match", ascentRound });
      },
      leaveQueue() {
        send({ kind: "leave-queue" });
      },
      playAgainstBots() {
        send({ kind: "play-bots" });
      },
      queueParty(key) {
        if (hostId !== undefined && !closed && queueing !== undefined && partyKey === undefined) {
          partyKey = key;
          const said: PeerStayTogether = { memberKey: key.ticketId };
          transport.send("stay-together", said, hostId);
        }
      },
      sendTeamPlan(seats) {
        // One a message, as `propose`: the match host checks each build.
        seats.forEach(({ memberKey, build }, slot) => {
          send({
            kind: "team-plan",
            slot,
            size: seats.length,
            memberKey,
            build: JSON.parse(JSON.stringify(build)) as JsonValue,
          });
        });
      },
      propose(members) {
        if (members === null) {
          send({ kind: "propose", slot: null });
          return;
        }
        // One a message, so large builds still fit; plain JSON, as a
        // hello's build: the host parses and checks each.
        members.forEach((build, slot) => {
          send({
            kind: "propose",
            slot,
            size: members.length,
            build: JSON.parse(JSON.stringify(build)) as JsonValue,
          });
        });
      },
      vote(proposerId) {
        send({ kind: "vote", proposerId });
      },
      claim(slot) {
        send({ kind: "claim", slot });
      },
      sendChat(channel, text) {
        if (hostId !== undefined && !closed) {
          // Past the wire's bound the host would drop it whole; it cuts to a line itself.
          transport.send("chat", { channel, text: text.slice(0, MAX_WIRE_CHAT_TEXT) }, hostId);
        }
      },
      shareTrack(trackId, source) {
        send({ kind: "share-track", trackId, source });
      },
      setProfile(profile) {
        send({ kind: "set-profile", ...profile });
      },
      onChange(handler) {
        changeHandlers.push(handler);
      },
      onMatchStarting(handler) {
        startingHandlers.push(handler);
      },
      watchMatch() {
        return latest?.phase === "in-match" && latest.matchId !== null
          ? { matchId: latest.matchId, transport: scopeTransport(transport) }
          : undefined;
      },
      onStartRejected(handler) {
        rejectedHandlers.push(handler);
      },
      onNotice(handler) {
        noticeHandlers.push(handler);
      },
      onRefused(handler) {
        refusedHandlers.push(handler);
      },
      onClosed(handler) {
        closedHandlers.push(handler);
      },
      onMove(handler) {
        moveHandlers.push(handler);
      },
      onRelayOffers(handler) {
        offersHandlers.add(handler);
        // The host sends it on admission, which can beat the handler here.
        if (relayOffers !== undefined) {
          handler(relayOffers);
        }
        return () => {
          offersHandlers.delete(handler);
        };
      },
      onRelayCred(handler) {
        credHandlers.add(handler);
        return () => {
          credHandlers.delete(handler);
        };
      },
      sendRelayCred(to, seal) {
        if (hostId !== undefined) {
          transport.send("relay-cred", { to, seal } satisfies PeerRelayCredOut, hostId);
        }
      },
      onRelayAdmit(handler) {
        admitHandlers.add(handler);
        return () => {
          admitHandlers.delete(handler);
        };
      },
      setRelayHolding(on) {
        if (hostId !== undefined) {
          transport.send("relay-holding", { on } satisfies PeerRelayHolding, hostId);
        }
      },
      onChat(handler) {
        chatHandlers.push(handler);
      },
      onChatThrottled(handler) {
        throttledHandlers.push(handler);
      },
      onSharedTrack(handler) {
        sharedHandlers.push(handler);
      },
      onShareThrottled(handler) {
        shareThrottledHandlers.push(handler);
      },
      stayTogether(key) {
        if (hostId !== undefined && !closed) {
          if (!voted) {
            voted = true;
            partyKey = key ?? undefined;
          }
          const said: PeerStayTogether = { memberKey: key === null ? null : key.ticketId };
          transport.send("stay-together", said, hostId);
        }
      },
      onParty(handler) {
        partyHandlers.push(handler);
      },
      onPartyProposal(handler) {
        proposalHandlers.push(handler);
      },
      async disconnect() {
        if (left) {
          return;
        }
        left = true;
        // Its seat is freed now, not held as for a drop (#1764).
        if (!closed && hostId !== undefined) {
          transport.send("lobby-leave", {} satisfies PeerLobbyLeave, hostId);
        }
        closed = true;
        stop();
        await transport.leave();
      },
    };

    unsubscribe.push(
      transport.onTrouble((said) => {
        if (failJoin !== undefined) {
          trouble = said;
        }
      }),
      // Answered from the host once it is known, before that from any peer
      // the join went to: the proof names that peer, so it is good with
      // no other host (#2706).
      transport.on("lobby-challenge", (data, from) => {
        const challenge = parsePeerLobbyChallenge(data);
        if (challenge === undefined || (hostId === undefined ? !mayHost(from) : from !== hostId)) {
          return;
        }
        const sig = options.playerKey.signLobbyProof({
          hostPeerId: from,
          joinerPeerId: selfId,
          roomId: code,
          nonce: challenge.nonce,
        });
        transport.send("lobby-proof", { sig } satisfies PeerLobbyProof, from);
      }),
      transport.on("lobby-welcome", (data, from) => {
        const welcome = parseWireLobbyWelcome(data);
        // A signature check costs milliseconds and an honest host welcomes
        // once, so one welcome per peer is checked; the rest are ignored.
        if (
          queued === undefined ||
          proof === undefined ||
          welcome === undefined ||
          hostId !== undefined ||
          checkedWelcomes.has(from)
        ) {
          return;
        }
        checkedWelcomes.add(from);
        void proof.then(({ hostDigest }) => {
          if (
            stopped ||
            hostId !== undefined ||
            !queued.verifyTicketSig(queued.group.hostTicketId, hostDigest, welcome.hostSig)
          ) {
            return;
          }
          // Proven the planned host: the join, with its proof, goes to it alone.
          provenHosts.add(from);
          sendJoin(from);
        });
      }),
      transport.on("lobby-state", (data, from) => {
        // Only the host's, once it is known; before that, only a state the
        // sender says it hosts, and that lists this player.
        if (hostId === undefined ? !mayHost(from) : from !== hostId) {
          return;
        }
        const state = parseWireLobbyState(data);
        if (state?.hostId !== from || state.code !== code) {
          return;
        }
        if (hostId === undefined) {
          if (!state.players.some((player) => player.id === selfId)) {
            return;
          }
          hostId = from;
          latest = state;
          forgetProposals(state);
          noteQueueing(state);
          failJoin = undefined;
          clearTimeout(timer);
          resolve(connection);
          return;
        }
        noteGone(state);
        latest = state;
        forgetProposals(state);
        noteQueueing(state);
        for (const handler of [...changeHandlers]) {
          handler();
        }
      }),
      transport.on("lobby-seat", (data, from) => {
        // The host's alone, and only once it is known; a newer one replaces it.
        const seat = parsePeerLobbySeat(data);
        if (hostId !== undefined && from === hostId && seat !== undefined) {
          rejoinToken = seat.rejoinToken;
        }
      }),
      transport.on("relay-offers", (data, from) => {
        // The host's alone, and only once it is known (#2529).
        const offers = parsePeerRelayOffers(data);
        if (hostId !== undefined && from === hostId && offers !== undefined) {
          relayOffers = offers;
          for (const handler of [...offersHandlers]) {
            handler(offers);
          }
        }
      }),
      transport.on("relay-cred", (data, from) => {
        // Forwarded by the host alone, which stamped the sender (#2529).
        const cred = parsePeerRelayCredIn(data);
        if (hostId !== undefined && from === hostId && cred !== undefined) {
          for (const handler of [...credHandlers]) {
            handler(cred);
          }
        }
      }),
      transport.on("relay-admit", (data, from) => {
        // The host's alone, and only once it is known (#2527).
        const admit = parsePeerRelayAdmit(data);
        if (hostId !== undefined && from === hostId && admit !== undefined) {
          for (const handler of [...admitHandlers]) {
            handler(admit);
          }
        }
      }),
      transport.on("lobby-note", (data, from) => {
        // A refusal can come before the host is known: it is why it never is.
        if (hostId === undefined ? !mayHost(from) : from !== hostId) {
          return;
        }
        const note = parseWireLobbyNote(data);
        if (note === undefined) {
          return;
        }
        if (note.kind === "start-rejected") {
          for (const handler of [...rejectedHandlers]) {
            handler(note.reason);
          }
        } else if (note.kind === "notice") {
          for (const handler of [...noticeHandlers]) {
            handler(note.reason);
          }
        } else if (note.kind === "chat-throttled") {
          for (const handler of [...throttledHandlers]) {
            handler();
          }
        } else if (note.kind === "share-throttled") {
          for (const handler of [...shareThrottledHandlers]) {
            handler();
          }
        } else if (isRefusal(note.reason)) {
          if (failJoin !== undefined) {
            failJoin(new LobbyRefusedError(note.reason));
          } else if (
            note.reason === "host-left" ||
            note.reason === "fell-through" ||
            note.reason === "removed"
          ) {
            close(note.reason);
          } else {
            for (const handler of [...refusedHandlers]) {
              handler(note.reason);
            }
          }
        }
      }),
      transport.on("team-proposal-builds", (data, from) => {
        if (hostId === undefined || from !== hostId) {
          return;
        }
        const message = parseWireTeamProposalBuilds(data);
        if (message === undefined) {
          return;
        }
        proposalBuilds.set(message.proposerId, message.builds);
        for (const handler of [...changeHandlers]) {
          handler();
        }
      }),
      transport.on("chat-line", (data, from) => {
        const wire = parseWireChatLine(data);
        if (from !== hostId || wire === undefined) {
          return;
        }
        // The host cleaned it, but a host can be anyone: shown only as
        // clean as it would have made it.
        const text = sanitizeChatText(wire.text);
        if (text === "") {
          return;
        }
        const line = { ...wire, name: sanitizeName(wire.name, UNNAMED_SPEAKER), text };
        for (const handler of [...chatHandlers]) {
          handler(line);
        }
      }),
      // A host can be anyone: what it relays is held to what an honest one sends.
      transport.on("shared-track", (data, from) => {
        if (from !== hostId || !sharedBudget.take(from, Date.now())) {
          return;
        }
        const share = parseWireSharedTrack(data);
        if (share === undefined) {
          return;
        }
        for (const handler of [...sharedHandlers]) {
          handler(share);
        }
      }),
      transport.on("party-proposal", (data, from) => {
        const proposal = parseWirePartyProposal(data);
        const key = partyKey;
        if (
          from !== hostId ||
          proposal === undefined ||
          key === undefined ||
          consented ||
          !proposal.members.includes(key.ticketId)
        ) {
          return;
        }
        const { groupId, members, mode } = proposal;
        const consent = (): void => {
          consented = true;
          for (const handler of [...proposalHandlers]) {
            handler();
          }
          void admissionDigest("vibewars-party", groupId, members.join(""), mode).then((digest) => {
            if (hostId !== undefined && !closed) {
              const said: PeerPartyConsent = {
                memberKey: key.ticketId,
                consent: key.sign(digest),
                claim: options.claim(),
              };
              transport.send("party-consent", said, hostId);
            }
          });
        };
        // A queued lobby's: the group this lobby is, the one they won (#1078).
        if (queued !== undefined) {
          if (groupId === queued.group.groupId && mode === queued.group.mode) {
            consent();
          }
          return;
        }
        // A party lobby's (#1766): the group this player worked out, for
        // the lobby's own mode, and still this queueing when it is known.
        const current = queueing;
        if (
          current === undefined ||
          latest === undefined ||
          mode !== teamQueueModeOf(latest.mode, latest.teamSize)
        ) {
          return;
        }
        void current.groupId.then((expected) => {
          if (expected === groupId && queueing === current && partyKey === key && !consented) {
            consent();
          }
        });
      }),
      transport.on("party-formed", (data, from) => {
        const formed = parseWirePartyFormed(data);
        if (from === hostId && formed !== undefined) {
          answerParty(formed);
        }
      }),
      transport.on("party-split", (data, from) => {
        if (from === hostId && parseWirePartySplit(data) !== undefined) {
          answerParty(null);
        }
      }),
      // The host leaving for another lobby, its guests to follow (#1553):
      // from anyone else in the room, it is nothing.
      transport.on("lobby-move", (data, from) => {
        const move = parseWireLobbyMove(data);
        if (from === hostId && move !== undefined && !closed) {
          for (const handler of [...moveHandlers]) {
            handler(move.code);
          }
        }
      }),
      // A ranked start (#3573): signed only once checked against this
      // player's own group and seat, and its claims against the
      // leaderboard (#3575), and only the first.
      transport.on("ranked-start", (data, from) => {
        const said = parseWireRankedStart(data);
        if (
          from !== hostId ||
          said === undefined ||
          rankedPlay === undefined ||
          queued === undefined ||
          ranked !== undefined ||
          rankedOver ||
          checkingStart ||
          rankedStartFault(said.start, queued, rankedPlay, options.playerKey.pubkey) !== undefined
        ) {
          return;
        }
        checkingStart = true;
        void claimsHold(said.start, rankedPlay.leaderboard).then((hold) => {
          checkingStart = false;
          // The lobby may have closed or moved on while the leaderboard was
          // fetched; `queued` is this client's for its life, so its group holds.
          if (!hold || closed || ranked !== undefined || rankedOver) {
            return;
          }
          const hostSeat = queued.group.teams.flatMap((team, t) =>
            team.flatMap((seatKey, i) =>
              seatKey === queued.group.hostTicketId ? (said.start.teams[t]?.[i] ?? []) : [],
            ),
          )[0];
          if (hostSeat === undefined) {
            return;
          }
          ranked = {
            start: said.start,
            hash: startHash(said.start, rankedPlay.crypto.sha256),
            hostPubkey: hostSeat.pubkey,
            startSigs: undefined,
            work: undefined,
          };
          const signed: PeerRankedStartSig = {
            matchId: said.start.matchId,
            sig: options.playerKey.signRankedStart(said.start),
          };
          transport.send("ranked-start-sig", signed, from);
          rankedPlay.onStartSigned();
        });
      }),
      // Every seat's start signature: kept only if each verifies.
      transport.on("ranked-start-sigs", (data, from) => {
        const said = parseWireRankedStartSigs(data);
        const signed = ranked;
        if (
          from !== hostId ||
          said === undefined ||
          rankedPlay === undefined ||
          signed === undefined ||
          signed.startSigs !== undefined ||
          said.matchId !== signed.start.matchId
        ) {
          return;
        }
        const digest = startDigest(signed.start, rankedPlay.crypto.sha256);
        const seats = signed.start.teams.flat();
        if (
          Object.keys(said.sigs).length !== seats.length ||
          !seats.every(({ pubkey }) => {
            const sig = said.sigs[pubkey];
            return sig !== undefined && rankedPlay.crypto.verify(pubkey, digest, sig);
          })
        ) {
          return;
        }
        signed.startSigs = said.sigs;
        // The start is fixed: this player's stamp runs from now, through
        // the match, so it is ready long before the result (#3746).
        void rankedPlay.work(signed.hash).then((work) => {
          signed.work = work;
          const waiting = rankedWaiting;
          rankedWaiting = undefined;
          waiting?.();
        });
      }),
      transport.on("ranked-result", (data, from) => {
        onRankedResult(data, from);
      }),
      // How the ranked match ended, as the host told this player: a result
      // naming another winner is not signed.
      transport.on("ended", (data, from) => {
        const signed = ranked;
        if (from !== hostId || signed?.startSigs === undefined || endedWinner !== undefined) {
          return;
        }
        const ended = parseWireEnded(data, signed.start.teams.length === 3 ? 3 : 2);
        if (ended !== undefined && ended.endReason !== "host-left") {
          endedWinner = ended.winningTeam;
        }
      }),
      // The receipt: handed on only if it is of this start and valid.
      transport.on("ranked-receipt", (data, from) => {
        const said = parseWireRankedReceipt(data);
        const signed = ranked;
        if (
          from !== hostId ||
          said === undefined ||
          rankedPlay === undefined ||
          signed === undefined ||
          rankedOver ||
          startHash(said.receipt.start, rankedPlay.crypto.sha256) !== signed.hash ||
          !validateReceipt(said.receipt, rankedPlay.crypto).ok
        ) {
          return;
        }
        rankedOver = true;
        rankedPlay.onReceipt(said.receipt, false);
      }),
      transport.on("ranked-cancel", (data, from) => {
        const said = parseWireRankedCancel(data);
        if (
          from !== hostId ||
          said === undefined ||
          rankedPlay === undefined ||
          queued === undefined ||
          rankedOver ||
          said.matchId !== queued.group.groupId
        ) {
          return;
        }
        rankedOver = true;
        rankedPlay.onCancel();
      }),
      transport.on("match-start", (data, from) => {
        const start = parseWireMatchStart(data);
        // Only for the match the lobby says is on, and only once: a late
        // one, from a match already over, is ignored.
        if (
          from !== hostId ||
          start === undefined ||
          latest?.phase !== "in-match" ||
          start.matchId !== latest.matchId ||
          start.matchId === startedMatch
        ) {
          return;
        }
        startedMatch = start.matchId;
        const starting: MatchStarting = {
          mapId: start.mapId,
          matchId: start.matchId,
          teamPlanRejected: start.teamPlanRejected,
          transport: scopeTransport(transport),
        };
        for (const handler of [...startingHandlers]) {
          handler(starting);
        }
      }),
      transport.onPeerJoin((peerId) => {
        // Said to every peer in the room: until one answers, any might host.
        if (hostId === undefined) {
          knock(peerId);
          return;
        }
        if (peerId !== hostId || droppedAt === undefined) {
          return;
        }
        clearTimeout(closeTimer);
        // Measured on the clock: a hidden tab's timer may fire late.
        const late = Date.now() - droppedAt >= RECONNECT_WINDOW_SECONDS * 1000;
        droppedAt = undefined;
        if (late) {
          close("connection-lost");
          return;
        }
        sendJoin(hostId);
      }),
      transport.onPeerLeave((peerId) => {
        // A seat of the ranked match gone from the room, as this player saw it.
        const gone = latest?.players.find((player) => player.id === peerId)?.playerPubkey;
        if (ranked !== undefined && peerId !== hostId && gone !== undefined && gone !== null) {
          seenGone.add(gone);
        }
        // A blip, in the lobby or a match (#1764): a host that goes on
        // purpose says `host-left` first, and that closes at once.
        if (peerId !== hostId || droppedAt !== undefined) {
          return;
        }
        droppedAt = Date.now();
        closeTimer = setTimeout(() => {
          close("connection-lost");
        }, RECONNECT_WINDOW_SECONDS * 1000);
      }),
    );
    // And to those already here, in case their joins were told before now.
    knock();
  });
}
