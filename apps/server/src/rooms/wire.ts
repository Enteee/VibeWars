import type { Client, Room } from "colyseus";
import type { CombatEvent } from "@vibewars/game-core";
import type { ServerMessages } from "@vibewars/game-protocol";

/**
 * The only way the rooms send (#303). Each message's payload is typed by
 * its name in the protocol's table, which the wire schema snapshot hashes,
 * so a payload changed here changes `PROTOCOL_VERSION`. A raw
 * `client.send` or `this.broadcast` in a room fails
 * `wire-snapshot.test.ts`.
 */

/** The server's messages, its combat events game-core's. */
export type ServerMessage = ServerMessages<CombatEvent>;

/** Send one message to one client. */
export function send<K extends keyof ServerMessage>(
  client: Client,
  type: K,
  message: ServerMessage[K],
): void {
  client.send(type, message);
}

/** Send one message to every client in `room`. */
export function broadcast<K extends keyof ServerMessage>(
  room: Room,
  type: K,
  message: ServerMessage[K],
): void {
  room.broadcast(type, message);
}
