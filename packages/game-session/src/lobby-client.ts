import {
  LOBBY_REFUSALS,
  MAX_WIRE_CHAT_TEXT,
  PROTOCOL_VERSION,
  normalizeLobbyCode,
  parseWireChatLine,
  parseWireLobbyNote,
  parseWireTeamProposalBuilds,
  parseWireLobbyState,
  parseWireLobbyWelcome,
  parseWireMatchStart,
  parseWirePartyFormed,
  parseWirePartyProposal,
  parseWirePartySplit,
  parseWireLobbyMove,
  teamQueueModeOf,
  type JsonValue,
  type LobbyRefusal,
  type PeerPartyConsent,
  type PeerStayTogether,
  type PeerLobbyHello,
  type PeerLobbyLeave,
  type PeerLobbyJoin,
  type WireCape,
  type WireLobbyCommand,
  type WireLobbyState,
  type WireProposalBuild,
  type WirePartyFormed,
} from "@vibewars/game-protocol";

import { keyGated } from "./key-gate.js";
import type {
  ChatLine,
  LobbyClosedReason,
  LobbyConnection,
  LobbySnapshot,
  MatchStarting,
} from "./lobby-connection.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { sanitizeChatText, sanitizeName } from "./names.js";
import { admissionDigest, partyGroupId, type QueuedSeat } from "./queue-admission.js";
import type { TicketKey } from "./queue-client.js";

/** Who a chat line is from when nothing of its name is left to show (#479). */
const UNNAMED_SPEAKER = "Unnamed";
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
}

function isRefusal(reason: string): reason is LobbyRefusal {
  return LOBBY_REFUSALS.some((refusal) => refusal === reason);
}

export function joinLobby(options: JoinLobbyOptions): Promise<LobbyConnection> {
  const { timeoutMs, queued } = options;
  let hostId: string | undefined;
  // Once the host is known, no other peer in the room is heard or told
  // anything (#1682): Trystero connects every key holder to the guests too.
  const transport =
    options.proofKey === null
      ? options.transport
      : keyGated(options.transport, options.proofKey, "guest", () => hostId);
  const selfId = transport.selfId;
  const code = normalizeLobbyCode(options.code);
  const base = {
    protocolVersion: PROTOCOL_VERSION,
    name: options.name,
    guildTag: options.guildTag,
    guildCape: options.guildCape,
  };
  /** A coded lobby's join; a queued one's is made with its proof. */
  const codedJoin: PeerLobbyJoin = { ...base, admission: null };
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
          } satisfies PeerLobbyJoin,
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
  const refusedHandlers: ((reason: LobbyRefusal) => void)[] = [];
  const closedHandlers: ((reason: LobbyClosedReason) => void)[] = [];
  const moveHandlers: ((code: string) => void)[] = [];
  const chatHandlers: ((line: ChatLine) => void)[] = [];
  const throttledHandlers: (() => void)[] = [];
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

  const stop = (): void => {
    stopped = true;
    clearTimeout(closeTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    changeHandlers.length = 0;
    startingHandlers.length = 0;
    rejectedHandlers.length = 0;
    refusedHandlers.length = 0;
    closedHandlers.length = 0;
    moveHandlers.length = 0;
    chatHandlers.length = 0;
    throttledHandlers.length = 0;
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
    closed = true;
    const handlers = [...closedHandlers];
    stop();
    for (const handler of handlers) {
      handler(reason);
    }
  };

  /** Join through `to`; a coded lobby's first join may go to the whole room. */
  const sendJoin = (to?: string): void => {
    if (proof === undefined) {
      transport.send("lobby-join", codedJoin, to);
    } else if (to !== undefined) {
      void proof.then(({ join }) => {
        if (!stopped) {
          transport.send("lobby-join", join, to);
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
    open: state.open,
    hostId: state.hostId,
    players: state.players.map((player) => ({
      sessionId: player.id,
      name: player.name,
      guildTag: player.guildTag,
      team: player.team,
      ready: player.ready,
      isHost: player.isHost,
      bot: player.bot,
      away: player.away,
    })),
    isHost: state.players.some((player) => player.id === selfId && player.isHost),
    countdownSeconds: state.countdownSeconds,
    teamLobby: state.teamLobby,
    proposalBuilds: new Map(proposalBuilds),
    queueNonce: state.queueNonce,
    ascentRound: state.ascentRound,
  });

  /**
   * Forget the builds of a proposal `state` no longer lists (#1811). The
   * claim lists none but the chosen one, which keeps the vote's for its
   * faded cards; the Team Lobby over, none are kept.
   */
  const forgetProposals = (state: WireLobbyState): void => {
    const team = state.players.find((player) => player.id === selfId)?.team ?? null;
    const side = team === null ? null : (state.teamLobby?.sides[team] ?? null);
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
      selectMode(mode) {
        send({ kind: "select-mode", mode });
      },
      startMatch() {
        send({ kind: "start" });
      },
      findMatch(ascentRound) {
        send({ kind: "find-match", ascentRound });
      },
      leaveQueue() {
        send({ kind: "leave-queue" });
      },
      playHouseTeam() {
        send({ kind: "house-team" });
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
      onRefused(handler) {
        refusedHandlers.push(handler);
      },
      onClosed(handler) {
        closedHandlers.push(handler);
      },
      onMove(handler) {
        moveHandlers.push(handler);
      },
      onChat(handler) {
        chatHandlers.push(handler);
      },
      onChatThrottled(handler) {
        throttledHandlers.push(handler);
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
        if (state?.hostId !== from || normalizeLobbyCode(state.code) !== code) {
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
        latest = state;
        forgetProposals(state);
        noteQueueing(state);
        for (const handler of [...changeHandlers]) {
          handler();
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
        } else if (note.kind === "chat-throttled") {
          for (const handler of [...throttledHandlers]) {
            handler();
          }
        } else if (isRefusal(note.reason)) {
          if (failJoin !== undefined) {
            failJoin(new LobbyRefusedError(note.reason));
          } else if (note.reason === "host-left" || note.reason === "fell-through") {
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
              const said: PeerPartyConsent = { memberKey: key.ticketId, consent: key.sign(digest) };
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
          mode !== teamQueueModeOf(latest.mode)
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
