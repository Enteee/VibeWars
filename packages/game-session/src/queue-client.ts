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
 */
import {
  FORMATION_SETTLE_MS,
  NO_SHOW_IGNORE_MS,
  PROTOCOL_VERSION,
  TICKET_HEARTBEAT_MS,
  TICKET_TTL_MS,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import type { QueueBoard, QueueBoardEvent } from "./queue-board.js";
import { formGroups, groupOf, type FormedGroup } from "./queue-formation.js";

export type QueueState =
  /** `searching` players are queued, own included, of the `needed` a match takes. */
  | {
      readonly kind: "searching";
      readonly searching: number;
      readonly needed: number;
      readonly waitedMs: number;
    }
  /** A group holds this client; it is waiting out `FORMATION_SETTLE_MS`. */
  | { readonly kind: "forming"; readonly group: FormedGroup }
  /** The group settled: `secret` is what the caller hosts or joins `group.room` with. */
  | { readonly kind: "in-lobby"; readonly group: FormedGroup; readonly secret: string }
  /** The lobby never filled: shown for one tick, then `searching` again. */
  | { readonly kind: "fell-through" }
  /** The board has no relay (#707). */
  | { readonly kind: "unreachable" };

export interface QueueClientOptions {
  readonly board: QueueBoard;
  readonly mode: QueueMode;
  /** 1, or `teamSizeOf(mode)` for a party that queues together. */
  readonly partySize: number;
  /** ms since the epoch. */
  readonly now: () => number;
  /** In `[0, 1)`, as `Math.random`; the secret is drawn from it. */
  readonly random: () => number;
  /** sha256 of `text`, as lowercase hex. */
  readonly sha256: (text: string) => Promise<string> | string;
  /** As `formGroups` takes it, the same on every client. */
  readonly mapPool: readonly string[];
}

export interface QueueClient {
  readonly state: QueueState;
  onChange(handler: (state: QueueState) => void): () => void;
  /** Heartbeat when one is due, and form groups from what the board said. */
  tick(): void;
  /** The caller is in `group.room`. */
  enteredLobby(): void;
  /** The lobby timed out without `noShows`: they are skipped, and this client queues again. */
  fellThrough(noShows: readonly string[]): void;
  /** Withdraw at once and stop, whatever the state. */
  leave(): void;
}

const SECRET_BYTES = 32;

/** The settled form of a state, to tell a change from the same state again. */
function same(a: QueueState, b: QueueState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createQueueClient(options: QueueClientOptions): QueueClient {
  const { board, mode, partySize, now, random, sha256, mapPool } = options;
  const needed = 2 * teamSizeOf(mode);
  // A requeue after a fell-through lobby keeps this, and so its place (#854 C7).
  const enteredAt = now();

  const tickets = new Map<string, QueueTicket>();
  /** Ticket id to when it stops being ignored. */
  const ignored = new Map<string, number>();
  const handlers = new Set<(state: QueueState) => void>();

  let state: QueueState = { kind: "searching", searching: 0, needed, waitedMs: 0 };
  /** Own secret and, once hashed, ticket id; replaced on every requeue. */
  let own: { readonly secret: string; ticketId: string | undefined } = fresh();
  let publishedAt = Number.NEGATIVE_INFINITY;
  let publishing = true;
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

  function randomHex(bytes: number): string {
    return Array.from({ length: bytes }, () =>
      Math.floor(random() * 256)
        .toString(16)
        .padStart(2, "0"),
    ).join("");
  }

  /** A new secret, published as soon as its ticket id is hashed. */
  function fresh(): { readonly secret: string; ticketId: string | undefined } {
    const next: { readonly secret: string; ticketId: string | undefined } = {
      secret: randomHex(SECRET_BYTES),
      ticketId: undefined,
    };
    void Promise.resolve(sha256(next.secret)).then((ticketId) => {
      if (left || own !== next) {
        return;
      }
      next.ticketId = ticketId;
      publish();
    });
    return next;
  }

  function publish(): void {
    if (own.ticketId === undefined) {
      return;
    }
    const ticket: QueueTicket = {
      ticketId: own.ticketId,
      protocol: PROTOCOL_VERSION,
      mode,
      partySize,
      enteredAt,
      heartbeatAt: now(),
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

  /** Players in live tickets of this mode at `at`, own included. */
  function searching(at: number): QueueState {
    const skip = stillIgnored(at);
    let players = 0;
    for (const ticket of tickets.values()) {
      if (
        ticket.protocol === PROTOCOL_VERSION &&
        at - ticket.heartbeatAt <= TICKET_TTL_MS &&
        !skip.has(ticket.ticketId)
      ) {
        players += ticket.partySize;
      }
    }
    return { kind: "searching", searching: players, needed, waitedMs: at - enteredAt };
  }

  /** Where `groups`, formed at `at`, leave this client. */
  function settle(groups: readonly FormedGroup[], at: number): void {
    const group = own.ticketId === undefined ? undefined : groupOf(groups, own.ticketId);
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
      setState({ kind: "in-lobby", group, secret: own.secret });
    }
  }

  function form(): void {
    const at = now();
    const ours = ++generation;
    // Dead tickets cost nothing to keep, but a long queue would keep them all.
    for (const [ticketId, ticket] of tickets) {
      if (at - ticket.heartbeatAt > TICKET_TTL_MS) {
        tickets.delete(ticketId);
      }
    }
    void formGroups({
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

  function heard(event: QueueBoardEvent): void {
    if (left) {
      return;
    }
    if (event.kind === "withdrawn") {
      tickets.delete(event.ticketId);
    } else if (event.ticket.mode === mode) {
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
      setState({ kind: "unreachable" });
    }
  });

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
    tick: () => {
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
        form();
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
        ignored.set(ticketId, at + NO_SHOW_IGNORE_MS);
        tickets.delete(ticketId);
      }
      if (own.ticketId !== undefined) {
        board.withdraw(own.ticketId);
        tickets.delete(own.ticketId);
      }
      generation += 1;
      settling = undefined;
      publishing = true;
      publishedAt = Number.NEGATIVE_INFINITY;
      own = fresh();
      setState({ kind: "fell-through" });
    },
    leave: () => {
      if (left) {
        return;
      }
      left = true;
      if (own.ticketId !== undefined) {
        board.withdraw(own.ticketId);
      }
      unsubscribe();
      untrouble();
      handlers.clear();
    },
  };
}
