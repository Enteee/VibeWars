/**
 * Where peers find each other (#15, #392): the one place to change the
 * relay list or the app id. A relay that dies is fixed here and nowhere
 * else.
 */
import { PROTOCOL_VERSION } from "@vibewars/game-protocol";

/** Builds of different protocols never meet: their rooms differ (#15). */
export const APP_ID = `vibewars-p${PROTOCOL_VERSION}`;

/**
 * Nostr relays from Trystero 0.26.0's default list, kept only where a
 * probe from the sandbox opened a socket and got an answer to a `REQ`
 * (2026-10-25, PR for #392).
 */
export const NOSTR_RELAYS: readonly string[] = [
  "wss://nos.lol",
  "wss://cdn.satellite.earth",
  "wss://relay.degmods.com",
  "wss://nostr.stakey.net",
  "wss://relay.layer.systems",
  "wss://nostr.rblb.it",
  "wss://relay.kaleidoswap.com",
  "wss://relay.agentry.com",
];

/** How many of `NOSTR_RELAYS` a peer connects to at once. */
export const RELAY_REDUNDANCY = 4;

/** The largest message a peer accepts from another (#15). */
export const MAX_RECEIVE_BYTES = 64 * 1024;
