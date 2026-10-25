import type { ClientMessages } from "@vibewars/game-protocol";

/** A Colyseus room, or a test's stand-in for one: whatever can send. */
interface Sender {
  send(type: string, message: unknown): void;
}

/**
 * The only way the client sends (#303): each payload typed by its name in
 * the protocol's table, which the wire schema snapshot hashes.
 */
export function sendMessage<K extends keyof ClientMessages>(
  room: Sender,
  type: K,
  message: ClientMessages[K],
): void {
  room.send(type, message);
}
