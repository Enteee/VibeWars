import { PROTOCOL_MISMATCH_MESSAGE, PROTOCOL_VERSION } from "@vibewars/game-protocol";

import { MessageBudget } from "./message-budget.js";

/**
 * Read one field from a client-supplied message, safely.
 *
 * A client can send literally anything — including `null`, `undefined`,
 * a number or a string — and `(message as {x?: unknown}).x` THROWS on the
 * nullish cases, which crashed the whole server process. Found by the
 * fuzz tests in `fuzz.test.ts`; never dereference a client payload
 * directly again (brief §27, §32).
 */
export function field(message: unknown, name: string): unknown {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  return (message as Record<string, unknown>)[name];
}

/**
 * Refuse a join whose `protocolVersion` is absent or not ours.
 *
 * Throwing from `onJoin` makes Colyseus reject the join and hand the
 * message to the client, which is the loud failure a stale tab needs.
 * Call it first, before the room touches any state, so a refused client
 * leaves no trace.
 */
export function assertProtocolVersion(options: unknown): void {
  if (field(options, "protocolVersion") !== PROTOCOL_VERSION) {
    throw new Error(PROTOCOL_MISMATCH_MESSAGE);
  }
}

/**
 * How many messages per second one client may have handled, sustained
 * (#43). Every handler runs as the message arrives, outside the tick, so
 * without a limit one client could spend the whole room's tick budget.
 * Real play peaks near 25 a second.
 */
export const MESSAGES_PER_SECOND = 60;

/**
 * How many may be handled at once: what an honest client queues behind a
 * network stall and then sends in one go. The server gives up on a silent
 * socket after about 9 s (Colyseus pings every 3 s, twice), and 9 s of
 * frantic play is about 225 messages.
 */
export const MESSAGE_BURST = 300;

/**
 * Past this many in one second Colyseus drops the client outright. Far
 * above any burst a stall can build, so only a flooder meets it; it stops
 * the flood costing even a decode per message.
 */
export const FLOOD_MESSAGES_PER_SECOND = 1000;

/** A room's handling budget, one bucket per client. */
export function messageBudget(): MessageBudget {
  return new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST);
}
