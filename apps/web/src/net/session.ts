import { MATCH_MODES, type PlayerBuild } from "@vibewars/game-core";
import {
  FORMATION_TIMEOUT_MS,
  MAX_LOBBY_PLAYERS,
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  isLobbyCode,
  isTeamQueueMode,
  normalizeLobbyCode,
  type JsonValue,
  type LobbyRefusal,
  type PeerHello,
  type QueueMode,
} from "@vibewars/game-protocol";
import {
  LobbyNoAnswerError,
  LobbyRefusedError,
  MatchRefusedError,
  PARTY_CONSENT_MS,
  connectMatch,
  connectObserver,
  createLobbyHost,
  createMatchHost,
  createQueueClient,
  deriveLobbyRoom,
  generateLobbyCode,
  joinLobby,
  publicRoom,
  startingQueueState,
  type FormedGroup,
  type Guild,
  type LobbyClosedReason,
  type LobbyConnection,
  type MatchPlan,
  type MatchStarting,
  type MatchToWatch,
  type ObserverConnection,
  type PartyPlanSeat,
  type PeerMatchConnection,
  type QueueClient,
  type QueueParty,
  type QueueState,
  type QueuedPlan,
  type QueuedSeat,
  type TicketKey,
} from "@vibewars/game-session";

import { NEW_VERSION_NOTICE, isStaleChunkError } from "../build-check.js";
import { linkLobbyRoom } from "./lobby-room.js";
import { arenaIds, hostMap, modeMapIds, queueMapPool } from "./maps.js";
import { startHostClock } from "./transport/host-clock.js";
import { checkTransportNat, joinQueueBoard, joinRoom, roomSelfId } from "./transport/index.js";
import type { NostrQueue } from "./transport/nostr-queue.js";
import { verifyTicketSig } from "./transport/ticket-key.js";
import { loadTurnConfig } from "./transport/turn-config.js";

/**
 * The glue between the app shell and a peer-to-peer lobby (#15, #403):
 * host one in this tab, join one by its key, and play its match. The
 * shell sees a `LobbyConnection` either way; only `hostLobby` knows the
 * lobby is here.
 */

/**
 * How long a joiner waits for the lobby host to answer: longer than
 * Trystero's own 15 s for ICE (#707), so a slow but working path is not cut
 * off before it gives up. The menu says "Connecting…" meanwhile.
 */
export const JOIN_TIMEOUT_MS = 20_000;
/** How long a seated player waits for the match host to let them in. */
const MATCH_TIMEOUT_MS = 10_000;

/**
 * #15's wording: a wrong key, an unreachable host and a closed, empty
 * lobby, whose host is in no room (#1682), cannot be told apart.
 */
export const NO_ANSWER_MESSAGE =
  "Couldn't reach that lobby. Check the key, and ask the host to open it.";
/** Typed wrong: not 12 symbols of the key alphabet (#1681). Nothing was sent anywhere. */
export const NOT_A_KEY_MESSAGE = "That is not a lobby key.";

/** What was typed cannot be a lobby key, so it was never looked for (#1681). */
export class NotALobbyKeyError extends Error {
  public constructor() {
    super("That is not a lobby key.");
    this.name = "NotALobbyKeyError";
  }
}
/** No relay socket opened: the joiner never got as far as looking (#707). */
export const NO_RELAY_MESSAGE = "Couldn't reach the lobby servers. Check your internet connection.";
/** A host was found and offered a connection that never came up (#707). */
export const PEER_UNREACHABLE_MESSAGE =
  "Found the lobby, but couldn't connect to its host. One of your networks blocks direct connections.";
/** Its second line when no TURN relay is saved (#972). */
export const TURN_RELAY_HINT =
  "A TURN relay link from a friend can fix this: open it, or enter the relay in Options.";
export const LOBBY_FULL_MESSAGE = "That lobby is full.";
/** Told only after the key proof (#1682): a closed lobby with guests is still in its room. */
export const LOBBY_CLOSED_MESSAGE = "That lobby is closed. Ask the host to open it.";
export const HOST_CLOSED_MESSAGE = "The host closed the lobby.";
/** True whichever side dropped: a guest cannot tell its own drop from the host's. */
export const CONNECTION_LOST_MESSAGE = "Lost the connection to the host.";
/** A queued lobby (#871) turned this ticket away: its proof did not hold, or it is seated already. */
export const NOT_ADMITTED_MESSAGE = "The match would not let this ticket in.";
export const TICKET_USED_MESSAGE = "This ticket is already in the match, in another tab.";
/** #854 C7's wording. */
export const FELL_THROUGH_MESSAGE = "Match fell through, searching again.";
/** A queued party's team plan (ADR-0042) was not whole at the start (#1822). */
export const TEAM_PLAN_REJECTED_NOTICE =
  "Your party's team plan was not accepted; the house team plays for you.";
/** A joined player's ask the host turned down (#1194). */
export const REFUSED_MESSAGE = "The host turned that down.";
export const NOT_HOST_MESSAGE = "Only the host can do that.";
/** A map picked outside a Hosted Game (#1994). */
export const NOT_PICKABLE_MESSAGE = "Only a Hosted Game lets the host pick the map.";
/** A Team Lobby's refusals (#1460). */
export const PROPOSAL_REFUSED_MESSAGE =
  "That team build cannot be proposed: it needs your side's size and legal builds.";
export const VOTE_REFUSED_MESSAGE = "That proposal is gone: vote for another.";
export const SEAT_TAKEN_MESSAGE = "Someone took that seat first.";
export const SEAT_REFUSED_MESSAGE = "That seat is not one of the chosen team build's.";

/** A lobby hosted in this tab, and how to end it for everyone. */
export interface HostedLobby {
  readonly lobby: LobbyConnection;
  /**
   * Let friends with the key join, or stop them (#1682): a coded lobby
   * starts closed. Closing keeps the guests already in.
   */
  setOpen(open: boolean): void;
  /**
   * A queued lobby's match is over and nobody waits on it (#882): its
   * winners have their Stay together answer, or its window ran out. A
   * coded lobby's never settles.
   */
  readonly done: Promise<void>;
  /**
   * End it for everyone. With `moveTo`, the key of the lobby this tab
   * just joined, its guests follow there (#1553).
   */
  close(moveTo?: string): Promise<void>;
  /**
   * A queued team mode's party (#1766): its side's seats, in order, the
   * host's own under `selfKey`; `undefined` while not queued.
   */
  teamPlan(selfKey: string): readonly PartyPlanSeat[] | undefined;
}

/** `n` bytes from `crypto`: a lobby key is only as good as its randomness (#1681). */
function secureBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** A queue nonce (#1766): 32 bytes from `crypto`, as 64 lowercase hex digits. */
function newQueueNonce(): string {
  return [...secureBytes(32)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** In [0, 1), from `crypto`: a rejoin token is only as good as its randomness. */
function secureRandom(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value / 2 ** 32;
}

/** Build the match the lobby planned, on its map and by its mode. Throws for a map it does not have. */
function startMatch(plan: MatchPlan) {
  const map = hostMap(plan.mapId);
  if (map === undefined) {
    throw new Error(`no arena named ${JSON.stringify(plan.mapId)}`);
  }
  return createMatchHost({
    transport: plan.transport,
    map,
    // A match is reproducible from its seed; the lobby's match id is
    // unique only within the lobby, so the code goes in too.
    seed: `${plan.transport.selfId}:${plan.matchId}`,
    matchRules: MATCH_MODES[map.mode],
    random: secureRandom,
    maxPlayers: MAX_LOBBY_PLAYERS,
    seats: plan.seats,
    matchId: plan.matchId,
    isSpectator: plan.isSpectator,
  });
}

/**
 * Host a lobby in this tab: a fresh key, the room derived from it, the
 * lobby host on it, and this player joined to it as one more peer. A
 * coded lobby starts closed, and its host is in its room only while it
 * is open or has guests (#1682); its room is derived once, here, for the
 * lobby's life.
 *
 * One clock runs the whole lobby, from now until `close()`: the lobby's
 * message budget counts on it, and its match runs on it.
 *
 * `queued` hosts a Random Arena group's lobby (#880) in the group's room
 * instead of under a fresh code.
 */
export async function hostLobby(
  name: string,
  guild: Guild,
  teamLobby: boolean,
  queued?: Omit<QueuedPlan, "onDone">,
): Promise<HostedLobby> {
  // A queued lobby meets in its group's room, which no lobby key can
  // name, and goes by the group's id, as every member of it knows it.
  const code = queued?.group.groupId ?? generateLobbyCode(secureBytes);
  const lobbyRoom =
    queued === undefined ? await deriveLobbyRoom(code) : publicRoom(queued.group.room);
  let settle: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  // Best effort: a page going away tells its guests, rather than leaving
  // them to wait out a dropped host's reconnect window (#515). Added
  // before the room exists, so it runs before a transport's own pagehide
  // leave, while there is still a room to say it in.
  const onPageHide = (): void => {
    void close();
  };
  window.addEventListener("pagehide", onPageHide);
  // A queued lobby is open from the start, and its group is on its way.
  const link =
    queued === undefined
      ? linkLobbyRoom({ selfId: roomSelfId(), join: () => joinRoom(lobbyRoom) })
      : undefined;
  const host = createLobbyHost({
    transport: link ?? joinRoom(lobbyRoom),
    code,
    proofKey: lobbyRoom.proofKey,
    mapIds: arenaIds(),
    modeMaps: modeMapIds(),
    startMatch,
    teamLobby,
    random: secureRandom,
    ...(queued === undefined
      ? // Its party queues for a team mode under a group its room id names (#1766).
        { matchmaking: { roomId: lobbyRoom.roomId, verifyTicketSig, newNonce: newQueueNonce } }
      : {
          queued: {
            ...queued,
            onDone: () => {
              settle();
            },
          },
        }),
  });
  const stopFollowing =
    link === undefined
      ? () => undefined
      : host.onReach((reach) => {
          link.follow(reach);
        });
  const stopClock = startHostClock((seconds) => {
    host.advance(seconds);
  });
  let closed = false;
  const close = async (moveTo?: string): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener("pagehide", onPageHide);
    stopFollowing();
    stopClock();
    await host.close(moveTo);
  };
  try {
    const lobby = await joinLobby({
      transport: host.local,
      code,
      // On its local link, inside the host's key gate.
      proofKey: null,
      name,
      ...guild,
      timeoutMs: JOIN_TIMEOUT_MS,
      // The host is one of its own group: it proves its ticket like the rest.
      ...(queued === undefined ? { roomId: lobbyRoom.roomId } : { queued }),
    });
    return {
      lobby,
      done,
      close,
      setOpen: (open) => {
        host.setOpen(open);
      },
      teamPlan: (selfKey) => host.teamPlan(selfKey),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Join the lobby `code` names, hosted on another peer's browser; with
 * `queued`, a Random Arena group's lobby in the group's room, `code` the
 * group's id.
 */
export async function joinLobbyByCode(
  code: string,
  name: string,
  guild: Guild,
  queued?: QueuedSeat,
): Promise<LobbyConnection> {
  // Refused before any derivation or relay traffic.
  if (queued === undefined && !isLobbyCode(normalizeLobbyCode(code))) {
    throw new NotALobbyKeyError();
  }
  const lobbyRoom =
    queued === undefined ? await deriveLobbyRoom(code) : publicRoom(queued.group.room);
  // Best effort, as a host's: a page going away frees its seat now, rather
  // than having it held as for a drop (#1764). Added before the room
  // exists, so it runs before the transport's own pagehide leave.
  let joined: LobbyConnection | undefined;
  const onPageHide = (): void => {
    void joined?.disconnect();
  };
  window.addEventListener("pagehide", onPageHide);
  const room = joinRoom(lobbyRoom);
  try {
    joined = await joinLobby({
      transport: room,
      code,
      proofKey: lobbyRoom.proofKey,
      name,
      ...guild,
      timeoutMs: JOIN_TIMEOUT_MS,
      ...(queued === undefined ? { roomId: lobbyRoom.roomId } : { queued }),
    });
    joined.onClosed(() => {
      window.removeEventListener("pagehide", onPageHide);
    });
    return joined;
  } catch (error) {
    window.removeEventListener("pagehide", onPageHide);
    await room.leave();
    throw error;
  }
}

/** A queued lobby's countdown, from everyone seated to the match: the versus splash's time. */
export const QUEUED_COUNTDOWN_SECONDS = 5;
/** How long a queued match's result stays on the HUD before the queue's ended view (#881). */
export const QUEUED_RESULT_SECONDS = 4;
/** How long a team match's result stays, counting down to its next match or the menu (#1997). */
export const TEAM_RESULT_SECONDS = 20;
/** How long the ended view offers *Stay together* to a winning team (#882). */
export const STAY_TOGETHER_SECONDS = 15;
/**
 * The host's window for Stay together runs from the result: the HUD's
 * seconds, the offer's, and this much for the last vote to arrive.
 */
export const STAY_TOGETHER_GRACE_SECONDS = 2;
export const STAY_TOGETHER_WINDOW_SECONDS =
  QUEUED_RESULT_SECONDS + STAY_TOGETHER_SECONDS + STAY_TOGETHER_GRACE_SECONDS;
/**
 * From signing the host's party proposal (#1078), how long a member waits
 * for its answer: the host's consent window, and the same grace.
 */
export const PARTY_ANSWER_MS = PARTY_CONSENT_MS + STAY_TOGETHER_GRACE_SECONDS * 1000;
/** #882's wording, for a party that did not form or did not last. */
export const TEAM_SPLIT_MESSAGE = "The team split up";
/**
 * How often the queue client ticks, in seconds of the host clock: often
 * enough that the wait reads smoothly, and a settle window ends close to
 * on time, without a formation hash every beat.
 */
const QUEUE_TICK_SECONDS = 0.25;

/** What the shell hears from a Random Arena queue. */
export interface RandomArenaEvents {
  /** The queue moved on: every state, `searching` again after a group fell through. */
  readonly onState: (state: QueueState) => void;
  /** Seated in the group's lobby; `hosted` when this tab hosts it. The shell owns both now. */
  readonly onLobby: (lobby: LobbyConnection, hosted: HostedLobby | undefined) => void;
  /** The group's lobby would not have this ticket: the queue is over, and this says why. */
  readonly onRefused: (notice: string) => void;
  /** A party member's leader is gone from the queue (#882): this place is over. */
  readonly onPartyGone: () => void;
}

/**
 * A board, and a fresh member key made on it, for a winner who presses
 * *Stay together* (#882): the key goes to the host, and the board to the
 * party's queue if it forms. Closed by whoever drops it.
 */
export function openPartyBoard(): { readonly board: NostrQueue; readonly key: TicketKey } {
  const board = joinQueueBoard();
  return { board, key: board.newTicketKey() };
}

/** A team that stayed together (#882), as this member brings it to the queue. */
export interface PartyPlace {
  readonly party: QueueParty;
  /** The board `party.key` was made on: the Nostr board signs only with its own keys. */
  readonly board: NostrQueue;
}

/** This page's `checkTransportNat`, once it was asked for: a NAT does not change under a tab. */
let natCheck: Promise<boolean> | undefined;

/**
 * Start this page's NAT check (#2090) if it has not been, so it runs
 * while the player is still on their way into the queue.
 */
export function startNatCheck(): void {
  void natHint();
}

function natChecked(): Promise<boolean> {
  natCheck ??= checkTransportNat();
  return natCheck;
}

/**
 * The `hardNat` this tab's tickets carry (#2090): never with a relay of
 * the player's own (#972), which makes them reachable, else `checkTransportNat`.
 */
function natHint(): Promise<boolean> {
  return loadTurnConfig() === undefined ? natChecked() : Promise.resolve(false);
}

/** One player's place in the Random Arena queue (#880). */
export interface RandomArenaQueue {
  /**
   * Withdraw at once and close the board. A lobby already handed to the
   * shell is the shell's to leave; one still being joined is left here.
   */
  leave(): void;
}

/**
 * Call `leave` when `target`'s page goes away (#1881), so a closed tab
 * withdraws its ticket rather than leaving others to match it until it
 * expires. Best effort; the returned call stops listening.
 */
export function leaveOnPageHide(target: EventTarget, leave: () => void): () => void {
  const onPageHide = (): void => {
    leave();
  };
  target.addEventListener("pagehide", onPageHide);
  return () => {
    target.removeEventListener("pagehide", onPageHide);
  };
}

/**
 * Queue for a Random Arena of `mode` as `name` of `guild`
 * (#854 C1–C7): a ticket on the board `joinQueueBoard` picks, ticked from
 * the host clock so a background tab keeps its place. When a group
 * settles, this tab hosts its lobby or joins it; a lobby that never fills,
 * or loses its host before the match, puts the player back in the queue
 * with their place. The board closes when the player leaves or the match
 * starts, not on entering the lobby, since a lobby that falls through
 * queues again on it. With `party`, it queues as a member of a team that
 * stayed together, or of a team mode's party (#1766); with `teamPlan`,
 * as that party's host, which sends the match's host its side's seats
 * once in the match's lobby (ADR-0042).
 */
export function enterQueue(
  mode: QueueMode,
  name: string,
  guild: Guild,
  events: RandomArenaEvents,
  party?: PartyPlace,
  teamPlan?: HostedLobby["teamPlan"],
): RandomArenaQueue {
  const queue = party?.board ?? joinQueueBoard();
  /** Made once the NAT hint is in (#2090), unless the player left first. */
  let client: QueueClient | undefined;
  let done = false;
  let sinceTick = 0;
  const stopClock = startHostClock((seconds) => {
    sinceTick += seconds;
    if (sinceTick >= QUEUE_TICK_SECONDS) {
      sinceTick = 0;
      void client?.tick();
    }
  });
  const stopPageHide = leaveOnPageHide(window, () => {
    finish();
  });

  /** Stop queueing for good; whether this call was the one that stopped it. */
  const finish = (): boolean => {
    if (done) {
      return false;
    }
    done = true;
    stopClock();
    stopPageHide();
    client?.leave();
    queue.close();
    return true;
  };

  /** Host the group's lobby, or join it, and hand it to the shell. */
  const meet = async (
    group: FormedGroup,
    key: TicketKey,
    queueClient: QueueClient,
  ): Promise<void> => {
    queueClient.enteredLobby();
    let lobby: LobbyConnection;
    let hosted: HostedLobby | undefined;
    try {
      if (group.hostTicketId === key.ticketId) {
        hosted = await hostLobby(name, guild, false, {
          group,
          key,
          verifyTicketSig,
          countdownSeconds: QUEUED_COUNTDOWN_SECONDS,
          timeoutSeconds: FORMATION_TIMEOUT_MS / 1000,
          stayTogetherSeconds: STAY_TOGETHER_WINDOW_SECONDS,
          onFellThrough: (noShows) => {
            if (!done) {
              queueClient.fellThrough(noShows);
            }
          },
        });
        lobby = hosted.lobby;
      } else {
        lobby = await joinLobbyByCode(group.groupId, name, guild, {
          group,
          key,
          verifyTicketSig,
        });
      }
    } catch (error) {
      if (done) {
        return;
      }
      if (
        error instanceof LobbyRefusedError &&
        (error.reason === "not-admitted" || error.reason === "ticket-used")
      ) {
        finish();
        events.onRefused(joinFailureNotice(error, location, loadTurnConfig() !== undefined));
        return;
      }
      // A host that never answered is skipped next time, as a no-show is.
      queueClient.fellThrough(error instanceof LobbyNoAnswerError ? [group.hostTicketId] : []);
      return;
    }
    if (done) {
      await lobby.disconnect();
      await hosted?.close();
      return;
    }
    if (isTeamQueueMode(mode)) {
      const seats = teamPlan?.(key.ticketId);
      if (seats !== undefined) {
        lobby.sendTeamPlan(seats);
      }
    }
    lobby.onMatchStarting(() => {
      finish();
    });
    lobby.onClosed((reason) => {
      if (done) {
        return;
      }
      if (hosted !== undefined) {
        void hosted.close();
        if (reason === "fell-through") {
          // `onFellThrough` has queued again, naming who never came.
          return;
        }
      }
      // The group is gone before its match: queue again, keeping the place.
      queueClient.fellThrough([]);
    });
    events.onLobby(lobby, hosted);
  };

  const start = async (): Promise<void> => {
    const hardNat = await natHint();
    if (done) {
      return;
    }
    const started = createQueueClient({
      board: queue.board,
      mode,
      ...(party === undefined ? {} : { party: party.party }),
      now: () => Date.now(),
      newTicketKey: () => queue.newTicketKey(),
      mapPool: queueMapPool(mode),
      hardNat,
    });
    client = started;
    started.onChange((state) => {
      if (state.kind === "party-gone") {
        finish();
        events.onPartyGone();
        return;
      }
      events.onState(state);
      if (state.kind === "in-lobby") {
        void meet(state.group, state.key, started);
      }
    });
    events.onState(started.state);
  };
  // The screen is searching at once, not once the NAT hint is in (#2090).
  events.onState(startingQueueState(mode));
  void start();

  return {
    leave: () => {
      finish();
    },
  };
}

/**
 * The second line of `PEER_UNREACHABLE_MESSAGE` on a page that may have
 * come over IPv6 loopback (#707): Firefox gathers no ICE candidates there,
 * and `localhost` goes to `::1` first when something listens on it.
 * Nothing redirects, since saved characters live with the origin and
 * would seem lost.
 */
export function loopbackHint(port: string): string {
  return `Firefox can't connect over IPv6 loopback (::1). Open http://127.0.0.1${port === "" ? "" : `:${port}`} instead.`;
}

/** Hostnames a page may have reached over `::1`. */
const IPV6_LOOPBACK_NAMES: readonly string[] = ["localhost", "[::1]"];

/**
 * What the menu says when hosting or joining failed with `error`, on the
 * page at `where` (the app passes `location`). `relayed` is whether the
 * player has a TURN relay saved (#972): without one, an unreachable host
 * is the thing a relay fixes, so the notice says so.
 */
export function joinFailureNotice(
  error: unknown,
  where: { readonly hostname: string; readonly port: string },
  relayed: boolean,
): string {
  if (error instanceof NotALobbyKeyError) {
    return NOT_A_KEY_MESSAGE;
  }
  if (error instanceof LobbyNoAnswerError) {
    // As far as the join got: past that, a wrong key and an unreachable
    // host still cannot be told apart.
    switch (error.trouble) {
      case "no-relay":
        return NO_RELAY_MESSAGE;
      case "peer-unreachable":
        return [
          PEER_UNREACHABLE_MESSAGE,
          ...(relayed ? [] : [TURN_RELAY_HINT]),
          ...(IPV6_LOOPBACK_NAMES.includes(where.hostname) ? [loopbackHint(where.port)] : []),
        ].join("\n");
      case null:
        return NO_ANSWER_MESSAGE;
    }
  }
  if (error instanceof LobbyRefusedError) {
    switch (error.reason) {
      case "protocol-mismatch":
        return PROTOCOL_MISMATCH_MESSAGE;
      case "lobby-full":
        return LOBBY_FULL_MESSAGE;
      case "closed":
        return LOBBY_CLOSED_MESSAGE;
      case "host-left":
        return HOST_CLOSED_MESSAGE;
      case "not-admitted":
        return NOT_ADMITTED_MESSAGE;
      case "ticket-used":
        return TICKET_USED_MESSAGE;
      case "fell-through":
        return FELL_THROUGH_MESSAGE;
    }
  }
  return "Could not join the lobby.";
}

/** Where a guest's host went (#1553): the key it left for, and who it is. */
export interface HostMove {
  readonly code: string;
  readonly host: string;
}

/**
 * Note where `lobby`'s host goes if it moves on (#1553). The returned
 * function, called once the lobby has closed, says where to follow and
 * forgets it: a lobby that closed after a move gets no host-left notice,
 * since its guests are already on their way.
 */
export function watchHostMove(lobby: {
  onMove(handler: (code: string) => void): void;
  getSnapshot(): {
    readonly players: readonly { readonly name: string; readonly isHost: boolean }[];
  };
}): () => HostMove | undefined {
  let moved: HostMove | undefined;
  lobby.onMove((code) => {
    const host = lobby.getSnapshot().players.find((p) => p.isHost)?.name ?? "";
    moved = { code, host };
  });
  return () => {
    const taken = moved;
    moved = undefined;
    return taken;
  };
}

/** What following a host takes from the shell (#1553); `T` is a joined lobby. */
export interface FollowSteps<T> {
  /** Join the lobby `code`; rejects when it cannot. */
  readonly join: (code: string) => Promise<T>;
  /** Whether the tab moved on while the join waited. */
  readonly movedOn: () => boolean;
  /** In: the tab sits in it. */
  readonly seat: (joined: T) => void;
  /** In, but the tab moved on meanwhile: leave it again. */
  readonly drop: (joined: T) => Promise<void>;
  /**
   * Not in: the tab opens a fresh own lobby, Closed as every new one is,
   * and shows `notice`, unless it moved on and there is none to show.
   */
  readonly fallBack: (notice: string | undefined) => void;
}

/**
 * Follow a guest's host to the lobby it moved to (#1553). A join that
 * fails, or is refused because that lobby is closed, falls back to a
 * fresh own lobby and says whom it could not follow; `where` and
 * `relayed` are as for `joinFailureNotice`.
 */
export async function followHost<T>(
  move: HostMove,
  steps: FollowSteps<T>,
  where: { readonly hostname: string; readonly port: string },
  relayed: boolean,
): Promise<void> {
  let joined: T;
  try {
    joined = await steps.join(move.code);
  } catch (error) {
    console.warn("[web] could not follow the host", error);
    steps.fallBack(
      steps.movedOn()
        ? undefined
        : `Could not follow ${move.host}: ${joinFailureNotice(error, where, relayed)}`,
    );
    return;
  }
  if (steps.movedOn()) {
    await steps.drop(joined);
    return;
  }
  steps.seat(joined);
}

/** What the lobby says when the host refused something this player asked for, once joined (#1194). */
export function lobbyRefusalNotice(reason: LobbyRefusal): string {
  switch (reason) {
    case "lobby-full":
      return LOBBY_FULL_MESSAGE;
    case "not-host":
      return NOT_HOST_MESSAGE;
    case "not-pickable":
      return NOT_PICKABLE_MESSAGE;
    case "invalid-proposal":
      return PROPOSAL_REFUSED_MESSAGE;
    case "invalid-vote":
      return VOTE_REFUSED_MESSAGE;
    case "slot-taken":
      return SEAT_TAKEN_MESSAGE;
    case "invalid-slot":
      return SEAT_REFUSED_MESSAGE;
    default:
      return REFUSED_MESSAGE;
  }
}

/** What the menu says when the lobby closed for `reason`. */
export function lobbyClosedNotice(reason: LobbyClosedReason): string {
  switch (reason) {
    case "host-left":
      return HOST_CLOSED_MESSAGE;
    case "connection-lost":
      return CONNECTION_LOST_MESSAGE;
    case "fell-through":
      return FELL_THROUGH_MESSAGE;
  }
}

/**
 * What the player is told when the match would not let them in. A
 * lazy import that failed is a newer deploy that removed this build's
 * chunks (#1268), not a lost connection.
 */
export function matchFailureNotice(error: unknown): string | undefined {
  if (error instanceof MatchRefusedError) {
    return error.message;
  }
  if (isStaleChunkError(error)) {
    return NEW_VERSION_NOTICE;
  }
  return undefined;
}

/**
 * `build` as the plain JSON a `hello` carries: an absent secondary
 * profession is dropped, which the host's parser reads as none.
 */
function wireBuild(build: PlayerBuild | undefined): JsonValue {
  return build === undefined ? null : (JSON.parse(JSON.stringify(build)) as JsonValue);
}

/** Play the lobby's match `start` announced, as `name` of `guild`, with `build`. */
export function connectMatchFor(
  lobby: LobbyConnection,
  start: MatchStarting,
  name: string,
  guild: Guild,
  build: PlayerBuild | undefined,
): Promise<PeerMatchConnection> {
  const hello: PeerHello = {
    protocolVersion: PROTOCOL_VERSION,
    name,
    ...guild,
    build: wireBuild(build),
    rejoin: null,
  };
  return connectMatch({
    transport: start.transport,
    hostId: lobby.getSnapshot().hostId,
    hello,
    timeoutMs: MATCH_TIMEOUT_MS,
  });
}

/** Watch the lobby's match `watch` names (#480), from no team. */
export function observeMatchFor(
  lobby: LobbyConnection,
  watch: MatchToWatch,
): Promise<ObserverConnection> {
  return connectObserver({
    transport: watch.transport,
    hostId: lobby.getSnapshot().hostId,
    matchId: watch.matchId,
    timeoutMs: MATCH_TIMEOUT_MS,
  });
}
