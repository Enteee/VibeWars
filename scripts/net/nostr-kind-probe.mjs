#!/usr/bin/env node
/**
 * `node scripts/net/nostr-kind-probe.mjs` — do the relays in `relays.ts`
 * deliver the Random Arena queue's ephemeral events (#872, ADR-0032 §3)?
 * Not part of CI: it needs the internet and the public relays, which a
 * runner does not promise.
 *
 * For each relay, alone, two real queue boards (`nostr-queue.ts`): one
 * subscribes, the other publishes a ticket under a fresh key. Prints, per
 * relay, whether the socket opened, what the relay said to the event
 * (`OK true`, `OK false: <reason>`, nothing), and whether the subscriber
 * heard the ticket. Exit code 0 only if most relays delivered it.
 *
 *   --timeout <s>   how long each relay gets to deliver (default 10)
 */
import "../assets/ts-resolve.mjs";

import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { timeout: { type: "string", default: "10" } } });
const timeoutMs = Number(values.timeout) * 1000;

// Imported once the hook above is in place: their own imports end in ".js".
const { PROTOCOL_VERSION } = await import("../../packages/game-protocol/src/protocol-version.ts");
const { createNostrQueue } = await import("../../apps/web/src/net/transport/nostr-queue.ts");
const { NOSTR_RELAYS } = await import("../../apps/web/src/net/transport/relays.ts");
const { newTicketKey, verifyTicketSig } =
  await import("../../apps/web/src/net/transport/ticket-key.ts");
/** @typedef {{ opened: boolean, ok: string, heard: boolean }} Notes */

/**
 * A board on `url` alone, noting whether it opened and what the relay answered.
 *
 * @param {string} url
 * @param {Notes} notes
 */
function boardOn(url, notes) {
  return createNostrQueue({
    relays: [url],
    now: () => Date.now(),
    newTicketKey,
    verifyTicketSig,
    openSocket: (relayUrl, handlers) => {
      const socket = new WebSocket(relayUrl);
      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          handlers.close();
        }
      };
      socket.onopen = () => {
        notes.opened = true;
        handlers.open();
      };
      socket.onmessage = (event) => {
        /** @type {unknown} */
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          // The board decides what is malformed.
        }
        if (Array.isArray(message) && message[0] === "OK") {
          notes.ok = message[2] === true ? "OK true" : `OK false: ${String(message[3])}`;
        }
        handlers.message(event.data);
      };
      socket.onerror = close;
      socket.onclose = close;
      return socket;
    },
  });
}

/**
 * @param {string} url
 * @returns {Promise<Notes>}
 */
async function probe(url) {
  /** @type {Notes} */
  const notes = { opened: false, ok: "no answer", heard: false };
  const listener = boardOn(url, { opened: false, ok: "", heard: false });
  const publisher = boardOn(url, notes);
  const key = publisher.newTicketKey();
  /** @type {Promise<boolean>} */
  const heard = new Promise((resolve) => {
    listener.board.subscribe("random-arena-1v1", (event) => {
      if (event.kind === "ticket" && event.ticket.ticketId === key.ticketId) {
        resolve(true);
      }
    });
    setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  // Published a second in and once more halfway, as a heartbeat would:
  // the first may still beat the listener's subscription to the relay.
  const publish = () => {
    const at = Date.now();
    publisher.board.publish({
      ticketId: key.ticketId,
      protocol: PROTOCOL_VERSION,
      mode: "random-arena-1v1",
      partySize: 1,
      enteredAt: at,
      heartbeatAt: at,
    });
  };
  const first = setTimeout(publish, 1000);
  const again = setTimeout(publish, timeoutMs / 2);
  notes.heard = await heard;
  clearTimeout(first);
  clearTimeout(again);
  listener.close();
  publisher.close();
  return notes;
}

const results = await Promise.all(NOSTR_RELAYS.map((url) => probe(url)));
let delivered = 0;
results.forEach((notes, index) => {
  if (notes.heard) {
    delivered += 1;
  }
  const url = NOSTR_RELAYS[index] ?? "";
  console.log(
    `${url.padEnd(32)} ${notes.opened ? "open" : "no socket"}  ${notes.ok.padEnd(24)} ${notes.heard ? "delivered" : "NOT delivered"}`,
  );
});
console.log(
  `\n${String(delivered)} of ${String(NOSTR_RELAYS.length)} relays delivered an ephemeral ticket.`,
);
process.exit(delivered * 2 > NOSTR_RELAYS.length ? 0 : 1);
