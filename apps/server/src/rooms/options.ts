import { PROTOCOL_MISMATCH_MESSAGE, PROTOCOL_VERSION } from "@vibewars/game-protocol";

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
