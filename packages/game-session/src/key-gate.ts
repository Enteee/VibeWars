import {
  MAX_LOBBY_PLAYERS,
  parseWireKeyChallenge,
  parseWireKeyProof,
  parseWireKeyProven,
  type Channel,
  type WireKeyChallenge,
  type WireKeyProof,
  type WireKeyProven,
} from "@vibewars/game-protocol";

import type { Json, Transport } from "./transport.js";

/**
 * The lobby's own gate (#1681, ADR-0043): a `Transport` on which a peer
 * exists only once it has proven it holds the lobby key. Relays already
 * cannot hand the key out, and Trystero's password already keeps out
 * offers made without it; this does not rely on either, and runs on
 * every transport, e2e's too.
 *
 * The host sends a new peer `key-challenge` and nothing else. The guest
 * answers `key-proof`, an HMAC keyed by the key's proof key over both
 * nonces and both peer ids; the host answers `key-proven`, the same with
 * its own side named, which the guest checks before it hears the host.
 * Until then neither side sees the other join, hears what it sends or
 * sends it anything. A wrong or malformed proof, or none in
 * `KEY_PROOF_TIMEOUT_MS`, drops the peer for good; a guest drops a host
 * whose `key-proven` fails. A peer id lasts one page load, so a proven
 * peer that drops and comes back is the same page: it is not asked
 * again.
 */

/** How long a challenged peer has to prove the key. */
export const KEY_PROOF_TIMEOUT_MS = 5000;

const KEY_CHANNELS: readonly Channel[] = ["key-challenge", "key-proof", "key-proven"];

const encoder = new TextEncoder();

/** 128 fresh random bits, as 32 lowercase hex digits. */
function nonce(): string {
  return hexOf(crypto.getRandomValues(new Uint8Array(16)));
}

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 64 lowercase hex digits, as the parsers let through, to bytes. */
function bytesOf(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/**
 * What `side`'s MAC signs. Host and guest both build it here, so they
 * cannot disagree on the layout; every field is fixed-width hex or a
 * peer id, which has no newline.
 */
function macInput(
  side: "guest" | "host",
  hostNonce: string,
  guestNonce: string,
  guestPeerId: string,
  hostPeerId: string,
): Uint8Array {
  return encoder.encode(
    `vibewars-key\n${side}\n${hostNonce}\n${guestNonce}\n${guestPeerId}\n${hostPeerId}`,
  );
}

type Handler = (data: unknown, from: string) => void;

/** One peer, as the gate knows it. */
type Peer =
  /** Host: challenged with `nonce`, which it may answer once. */
  | { readonly stage: "challenged"; readonly nonce: string; readonly since: number }
  /** Guest: answered a challenge; waiting for the host's side. */
  | { readonly stage: "answered"; readonly hostNonce: string; readonly guestNonce: string }
  /** A MAC from it is being checked; a guest keeps what the host sends meanwhile. */
  | { readonly stage: "checking"; readonly held: [Channel, unknown][]; readonly since: number }
  | { readonly stage: "proven" };

/**
 * `transport`, gated on the key `proofKey` stands for, as `side` sees
 * it: a host challenges whoever arrives, a guest answers and hears only
 * a host that proved itself. The gate owns the `key-*` channels.
 */
export function keyGated(
  transport: Transport,
  proofKey: Uint8Array,
  side: "host" | "guest",
): Transport {
  const selfId = transport.selfId;
  const key = crypto.subtle.importKey("raw", proofKey, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  const sign = async (input: Uint8Array): Promise<string> =>
    hexOf(new Uint8Array(await crypto.subtle.sign("HMAC", await key, input)));
  const verify = async (mac: string, input: Uint8Array): Promise<boolean> =>
    crypto.subtle.verify("HMAC", await key, bytesOf(mac), input);

  /** Every peer met, in the order met; a dropped one is gone from it. */
  const peers = new Map<string, Peer>();
  /** Peers in the room now, as the transport says. */
  const present = new Set<string>();
  const timers = new Map<string, unknown>();
  const handlers = new Map<Channel, Set<Handler>>();
  const joins = new Set<(peerId: string) => void>();
  const leaves = new Set<(peerId: string) => void>();
  let order = 0;
  let left = false;

  const proven = (peerId: string): boolean =>
    present.has(peerId) && peers.get(peerId)?.stage === "proven";

  const deliver = (channel: Channel, data: unknown, from: string): void => {
    for (const handler of [...(handlers.get(channel) ?? [])]) {
      handler(data, from);
    }
  };

  const drop = (peerId: string): void => {
    peers.delete(peerId);
    clearTimeout(timers.get(peerId));
    timers.delete(peerId);
  };

  /** `peerId` proved the key: it joins, and hears what was held for it. */
  const admit = (peerId: string, held: readonly [Channel, unknown][]): void => {
    peers.set(peerId, { stage: "proven" });
    clearTimeout(timers.get(peerId));
    timers.delete(peerId);
    if (!present.has(peerId)) {
      return;
    }
    for (const handler of [...joins]) {
      handler(peerId);
    }
    for (const [channel, data] of held) {
      if (proven(peerId)) {
        deliver(channel, data, peerId);
      }
    }
  };

  const challenge = (peerId: string): void => {
    const waiting = [...peers].filter(([, peer]) => peer.stage !== "proven");
    if (waiting.length >= MAX_LOBBY_PLAYERS) {
      const [oldest] = waiting.sort(([, a], [, b]) => sinceOf(a) - sinceOf(b));
      if (oldest !== undefined) {
        drop(oldest[0]);
      }
    }
    const fresh = nonce();
    peers.set(peerId, { stage: "challenged", nonce: fresh, since: (order += 1) });
    timers.set(
      peerId,
      setTimeout(() => {
        if (peers.get(peerId)?.stage !== "proven") {
          drop(peerId);
        }
      }, KEY_PROOF_TIMEOUT_MS),
    );
    transport.send("key-challenge", { nonce: fresh } satisfies WireKeyChallenge, peerId);
  };

  const offs = [
    transport.onPeerJoin((peerId) => {
      present.add(peerId);
      if (proven(peerId)) {
        for (const handler of [...joins]) {
          handler(peerId);
        }
      } else if (side === "host" && !peers.has(peerId)) {
        challenge(peerId);
      }
    }),
    transport.onPeerLeave((peerId) => {
      const was = proven(peerId);
      present.delete(peerId);
      if (was) {
        for (const handler of [...leaves]) {
          handler(peerId);
        }
      } else {
        drop(peerId);
      }
    }),
    transport.on("key-proof", (data, from) => {
      const peer = peers.get(from);
      if (side !== "host" || peer?.stage !== "challenged") {
        return;
      }
      const proof = parseWireKeyProof(data);
      if (proof === undefined) {
        drop(from);
        return;
      }
      // The nonce is spent: whatever comes of this, it is not answered twice.
      const checking: Peer = { stage: "checking", held: [], since: peer.since };
      peers.set(from, checking);
      /** It left, was dropped or the gate was, while a MAC was being worked. */
      const stale = (): boolean => peers.get(from) !== checking || left;
      void (async () => {
        const holds = await verify(
          proof.mac,
          macInput("guest", peer.nonce, proof.nonce, from, selfId),
        );
        if (stale()) {
          return;
        }
        if (!holds) {
          drop(from);
          return;
        }
        const mac = await sign(macInput("host", peer.nonce, proof.nonce, from, selfId));
        if (stale()) {
          return;
        }
        transport.send("key-proven", { mac } satisfies WireKeyProven, from);
        admit(from, []);
      })();
    }),
    transport.on("key-challenge", (data, from) => {
      const asked = parseWireKeyChallenge(data);
      if (side !== "guest" || asked === undefined || peers.has(from)) {
        return;
      }
      const answered: Peer = { stage: "answered", hostNonce: asked.nonce, guestNonce: nonce() };
      peers.set(from, answered);
      void (async () => {
        const mac = await sign(
          macInput("guest", answered.hostNonce, answered.guestNonce, selfId, from),
        );
        if (peers.get(from) === answered && !left) {
          transport.send(
            "key-proof",
            { nonce: answered.guestNonce, mac } satisfies WireKeyProof,
            from,
          );
        }
      })();
    }),
    transport.on("key-proven", (data, from) => {
      const peer = peers.get(from);
      if (side !== "guest" || peer?.stage !== "answered") {
        return;
      }
      const said = parseWireKeyProven(data);
      if (said === undefined) {
        drop(from);
        return;
      }
      const checking = { stage: "checking", held: [], since: 0 } satisfies Peer;
      peers.set(from, checking);
      void (async () => {
        const holds = await verify(
          said.mac,
          macInput("host", peer.hostNonce, peer.guestNonce, selfId, from),
        );
        if (peers.get(from) !== checking || left) {
          return;
        }
        if (holds) {
          admit(from, checking.held);
        } else {
          drop(from);
        }
      })();
    }),
  ];

  const subscribed = new Set<Channel>();
  const listen = (channel: Channel): void => {
    if (subscribed.has(channel)) {
      return;
    }
    subscribed.add(channel);
    offs.push(
      transport.on(channel, (data, from) => {
        const peer = peers.get(from);
        if (proven(from)) {
          deliver(channel, data, from);
        } else if (side === "guest" && peer?.stage === "checking") {
          // Sent by the host right after its `key-proven`, before that checked.
          peer.held.push([channel, data]);
        }
      }),
    );
  };

  return {
    selfId,
    send<T>(channel: Channel, data: Json<T>, to?: string | readonly string[]) {
      if (KEY_CHANNELS.includes(channel)) {
        return;
      }
      const targets =
        to === undefined
          ? [...present].filter(proven)
          : (typeof to === "string" ? [to] : to).filter(proven);
      transport.send(channel, data, targets);
    },
    on(channel, handler) {
      if (KEY_CHANNELS.includes(channel)) {
        return () => undefined;
      }
      listen(channel);
      let set = handlers.get(channel);
      if (set === undefined) {
        set = new Set();
        handlers.set(channel, set);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    onPeerJoin(handler) {
      joins.add(handler);
      return () => {
        joins.delete(handler);
      };
    },
    onPeerLeave(handler) {
      leaves.add(handler);
      return () => {
        leaves.delete(handler);
      };
    },
    onTrouble: (handler) => transport.onTrouble(handler),
    leave() {
      left = true;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      for (const off of offs.splice(0)) {
        off();
      }
      return transport.leave();
    },
  };
}

/** When a peer still proving the key was met, to drop the oldest first. */
function sinceOf(peer: Peer): number {
  return peer.stage === "challenged" || peer.stage === "checking" ? peer.since : 0;
}
