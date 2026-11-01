/**
 * A Random Arena queue client (#870, #854 C1, C3, C4, C7): one player's
 * or one party's place in the queue. It publishes its ticket to a
 * `QueueBoard`, reads everyone else's, and forms matches from them with
 * `formGroups`, as every other client does, so they agree without a word.
 *
 * `searching -> forming -> in-lobby`, and `fell-through -> searching` when
 * the lobby never fills. It has no clock of its own: the caller's `tick()`
 * drives the heartbeat and the settle window, so a web caller can tick it
 * from the host-clock worker and a background tab keeps its place
 * (ADR-0022).
 *
 * A party that stayed together (#882) queues as one ticket its leader
 * publishes; the other members each run a client that publishes nothing,
 * forms groups as everyone does, and meets the group holding the
 * leader's ticket with its own key.
 */
import {
  FORMATION_SETTLE_MS,
  NO_SHOW_IGNORE_MS,
  PROTOCOL_VERSION,
  TICKET_HEARTBEAT_MS,
  TICKET_TTL_MS,
  isTeamQueueMode,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import type { QueueBoard, QueueBoardEvent } from "./queue-board.js";
import { formGroups, groupOf, isLive, type FormedGroup } from "./queue-formation.js";

/**
 * A ticket's throwaway signing key (ADR-0032 §5, §6), with the private
 * half shut inside `sign`: nothing here can read it, so nothing here can
 * hand it out.
 */
export interface TicketKey {
  /** The x-only secp256k1 public key, as 64 lowercase hex digits. */
  readonly ticketId: string;
  /** A BIP-340 Schnorr signature of `digest`, as 128 lowercase hex digits. */
  sign(digest: Uint8Array): string;
}

export type QueueState =
  /**
   * `searching` players are queued, own included, of the `needed` a match
   * takes, in `teams` tickets: a party is one (#1881).
   */
  | {
      readonly kind: "searching";
      readonly searching: number;
      readonly teams: number;
      readonly needed: number;
      readonly waitedMs: number;
    }
  /** A group holds this client; it is waiting out `FORMATION_SETTLE_MS`. */
  | { readonly kind: "forming"; readonly group: FormedGroup }
  /** The group settled: the caller meets in `group.room` and proves its seat with `key`. */
  | { readonly kind: "in-lobby"; readonly group: FormedGroup; readonly key: TicketKey }
  /** The lobby never filled: shown for one tick, then `searching` again. */
  | { readonly kind: "fell-through" }
  /** The board has no relay (#707). */
  | { readonly kind: "unreachable" }
  /**
   * A party member's leader has had no live ticket for `TICKET_TTL_MS`:
   * the party is over, and this client has stopped (#882).
   */
  | { readonly kind: "party-gone" };

/** A party's place, as each of its members brings it (#882). */
export interface QueueParty {
  /** Every member's public key, the leader's first and the rest sorted; `members[0]` is the ticket's id. */
  readonly members: readonly string[];
  /** This member's own key, one of `members`, kept for as long as the party queues. */
  readonly key: TicketKey;
  /** The group the party won, which every member's consent signs (#1078). */
  readonly groupId: string;
  /** `consents[i]` by `members[i]`, as the leader publishes them. */
  readonly consents: readonly string[];
}

export interface QueueClientOptions {
  readonly board: QueueBoard;
  readonly mode: QueueMode;
  /** A party that stayed together, as this member of it; alone without. */
  readonly party?: QueueParty;
  /** ms since the epoch. */
  readonly now: () => number;
  /**
   * A fresh throwaway key, one per ticket. The web layer makes it from a
   * CSPRNG, never `Math.random`: the key is the ticket's credential.
   */
  readonly newTicketKey: () => TicketKey;
  /** As `formGroups` takes it, the same on every client. */
  readonly mapPool: readonly string[];
  /**
   * Whether this client found its own NAT hard (#2090), put on every
   * ticket it publishes as `hardNat`; the web layer's `checkNat` says.
   */
  readonly hardNat: boolean;
}

export interface QueueClient {
  readonly state: QueueState;
  onChange(handler: (state: QueueState) => void): () => void;
  /**
   * Heartbeat when one is due, and form groups from what the board said.
   * Resolves once this tick's formation has landed; a caller on a timer
   * need not wait for it.
   */
  tick(): Promise<void>;
  /** The caller is in `group.room`. */
  enteredLobby(): void;
  /** The lobby timed out without `noShows`: they are skipped, and this client queues again. */
  fellThrough(noShows: readonly string[]): void;
  /** Withdraw at once and stop, whatever the state. */
  leave(): void;
}

/** Whether `a` and `b` say the same, to tell a change from the same state again. */
function same(a: QueueState, b: QueueState): boolean {
  // A key compares by its id: `sign` does not survive JSON.
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createQueueClient(options: QueueClientOptions): QueueClient {
  const { board, mode, party, now, newTicketKey, mapPool, hardNat } = options;
  const needed = 2 * teamSizeOf(mode);
  // A requeue after a fell-through lobby keeps this, and so its place (#854 C7).
  const enteredAt = now();
  const members = party?.members ?? [];
  /** A team mode's side is a whole team: its empty seats are bots (ADR-0042). */
  const bots = isTeamQueueMode(mode) ? teamSizeOf(mode) - Math.max(members.length, 1) : 0;
  /** A party's leader publishes its ticket; a follower only reads the board. */
  const leader = members[0];
  const follower = party !== undefined && leader !== party.key.ticketId;

  const tickets = new Map<string, QueueTicket>();
  /** Ticket id to when it stops being ignored. */
  const ignored = new Map<string, number>();
  const handlers = new Set<(state: QueueState) => void>();

  let state: QueueState = { kind: "searching", searching: 0, teams: 0, needed, waitedMs: 0 };
  /**
   * Replaced on every requeue, so every ticket has a key of its own; a
   * party keeps its member key, since its followers find it by its id.
   */
  let key = party?.key ?? newTicketKey();
  let publishedAt = Number.NEGATIVE_INFINITY;
  let publishing = !follower;
  /**
   * When a follower last knew its leader's ticket live: from its start, so
   * a slow first heartbeat is no split.
   */
  let leaderSeenAt = enteredAt;
  let settling: { readonly group: FormedGroup; readonly since: number } | undefined;
  /** Bumped by anything that makes a formation still in flight stale. */
  let generation = 0;
  let left = false;

  function setState(next: QueueState): void {
    if (same(state, next)) {
      return;
    }
    state = next;
    for (const handler of [...handlers]) {
      handler(state);
    }
  }

  function publish(): void {
    const ticket: QueueTicket = {
      ticketId: key.ticketId,
      protocol: PROTOCOL_VERSION,
      mode,
      members: party === undefined ? [key.ticketId] : members,
      bots,
      enteredAt,
      heartbeatAt: now(),
      // Kept across fall-throughs: the consents sign the group won, not the current one.
      party: party === undefined ? null : { groupId: party.groupId, consents: party.consents },
      hardNat,
    };
    publishedAt = ticket.heartbeatAt;
    // Counted at once, not when the board echoes it back.
    tickets.set(ticket.ticketId, ticket);
    board.publish(ticket);
  }

  /** The ignored ids still ignored at `at`; the rest are forgotten. */
  function stillIgnored(at: number): ReadonlySet<string> {
    for (const [ticketId, until] of ignored) {
      if (at >= until) {
        ignored.delete(ticketId);
      }
    }
    return new Set(ignored.keys());
  }

  /** Players and tickets live in this mode at `at`, own included. */
  function searching(at: number): QueueState {
    const skip = stillIgnored(at);
    let players = 0;
    let teams = 0;
    for (const ticket of tickets.values()) {
      if (
        ticket.protocol === PROTOCOL_VERSION &&
        isLive(ticket, at) &&
        !skip.has(ticket.ticketId)
      ) {
        players += ticket.members.length;
        teams += 1;
      }
    }
    return { kind: "searching", searching: players, teams, needed, waitedMs: at - enteredAt };
  }

  /** Where `groups`, formed at `at`, leave this client. */
  function settle(groups: readonly FormedGroup[], at: number): void {
    const group = groupOf(groups, key.ticketId, party === undefined ? [key.ticketId] : members);
    if (group === undefined) {
      settling = undefined;
      setState(searching(at));
      return;
    }
    if (settling?.group.groupId !== group.groupId) {
      // A new group, or a different one: the window starts again.
      settling = { group, since: at };
      setState({ kind: "forming", group });
      return;
    }
    if (at - settling.since >= FORMATION_SETTLE_MS) {
      publishing = false;
      setState({ kind: "in-lobby", group, key });
    }
  }

  function form(): Promise<void> {
    const at = now();
    const ours = ++generation;
    // A dead ticket costs nothing to keep, but a long queue would keep them all.
    for (const [ticketId, ticket] of tickets) {
      if (!isLive(ticket, at)) {
        tickets.delete(ticketId);
      }
    }
    if (follower && leader !== undefined) {
      if (tickets.has(leader)) {
        leaderSeenAt = at;
      } else if (at - leaderSeenAt >= TICKET_TTL_MS) {
        stop();
        setState({ kind: "party-gone" });
        return Promise.resolve();
      }
    }
    return formGroups({
      tickets: [...tickets.values()],
      now: at,
      mode,
      ignored: stillIgnored(at),
      mapPool,
    }).then((groups) => {
      if (!left && ours === generation && state.kind !== "in-lobby") {
        settle(groups, at);
      }
    });
  }

  /** Off the board for good, without a word to it. */
  function stop(): void {
    left = true;
    unsubscribe();
    untrouble();
  }

  function heard(event: QueueBoardEvent): void {
    if (left) {
      return;
    }
    if (event.kind === "withdrawn") {
      tickets.delete(event.ticketId);
    } else if (event.ticket.mode === mode && isLive(event.ticket, now())) {
      // Not kept if it is not live: a heartbeat from the far future would
      // be the newest copy for ever.
      const known = tickets.get(event.ticket.ticketId);
      if (known === undefined || known.heartbeatAt <= event.ticket.heartbeatAt) {
        tickets.set(event.ticket.ticketId, event.ticket);
      }
    }
    if (state.kind === "unreachable") {
      // The board is talking again.
      setState(searching(now()));
    }
  }

  const unsubscribe = board.subscribe(mode, heard);
  const untrouble = board.onTrouble((trouble) => {
    if (!left && trouble === "no-relay" && state.kind !== "in-lobby") {
      // A formation in flight is stale, and a window from before the
      // outage must not count toward the group met after it.
      generation += 1;
      settling = undefined;
      setState({ kind: "unreachable" });
    }
  });
  if (publishing) {
    publish();
  }

  return {
    get state() {
      return state;
    },
    onChange: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    tick: async () => {
      if (left) {
        return;
      }
      if (state.kind === "fell-through") {
        setState(searching(now()));
      }
      if (publishing && now() - publishedAt >= TICKET_HEARTBEAT_MS) {
        publish();
      }
      if (state.kind !== "in-lobby" && state.kind !== "unreachable") {
        await form();
      }
    },
    enteredLobby: () => {
      // Nothing to withdraw: a peer still settling must keep seeing this
      // ticket until it settles too, so it stays until its TTL runs out.
    },
    fellThrough: (noShows) => {
      if (left || state.kind !== "in-lobby") {
        return;
      }
      const at = now();
      for (const ticketId of noShows) {
        // A party blamed for its own missing member queues on regardless.
        if (ticketId !== leader) {
          ignored.set(ticketId, at + NO_SHOW_IGNORE_MS);
          tickets.delete(ticketId);
        }
      }
      generation += 1;
      settling = undefined;
      if (party === undefined) {
        board.withdraw(key.ticketId);
        tickets.delete(key.ticketId);
        key = newTicketKey();
      }
      // A party keeps its ticket, id and place (ADR-0032 §6); its leader
      // heartbeats it again, and its followers wait for that from now.
      leaderSeenAt = at;
      publishing = !follower;
      if (publishing) {
        publish();
      }
      setState({ kind: "fell-through" });
    },
    leave: () => {
      if (left) {
        return;
      }
      // A follower published nothing to withdraw.
      if (!follower) {
        board.withdraw(key.ticketId);
      }
      stop();
      handlers.clear();
    },
  };
}
