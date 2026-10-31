import {
  MAX_LOBBY_PLAYERS,
  parseWireKeyChallenge,
  parseWireKeyProof,
  parseWireKeyProven,
  type Channel,
  type WireKeyAsk,
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
 * whose `key-proven` fails. A peer that leaves is forgotten, proven or
 * not: a peer id is the peer's own to choose and shows on the relays, so
 * one coming back proves the key again, and so does the host. A guest
 * challenged again by a host it had proven sees that host leave first;
 * one back from a drop the host may not have seen sends `key-ask`, and
 * a host that still holds it proven challenges it again. That stays
 * inside the gate: above it, the peer neither leaves nor joins, so a
 * `key-ask` is no way to the fresh rate-limit budgets a leave brings.
 *
 * Trystero is a mesh (#1682): a key holder who comes into a lobby's room
 * connects to its guests too, not only to its host. A guest that knows
 * its host answers no other peer's challenge, hears nothing from one it
 * proved before and sends nothing to it.
 */

/** How long a challenged peer has to prove the key. */
export const KEY_PROOF_TIMEOUT_MS = 5000;

const KEY_CHANNELS: readonly Channel[] = ["key-challenge", "key-proof", "key-proven", "key-ask"];

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
 * a host that proved itself, and only `hostId()` once that says one.
 * The gate owns the `key-*` channels.
 */
export function keyGated(
  transport: Transport,
  proofKey: Uint8Array,
  side: "host" | "guest",
  hostId: () => string | undefined = () => undefined,
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
  /** Guest: hosts it had proven that left; one back is asked to challenge again. */
  const lapsed = new Set<string>();
  /** Guest: hosts sent a key-ask, whose next challenge it asked for. */
  const asking = new Set<string>();
  /** Peers in the room now, as the transport says. */
  const present = new Set<string>();
  const timers = new Map<string, unknown>();
  const handlers = new Map<Channel, Set<Handler>>();
  const joins = new Set<(peerId: string) => void>();
  const leaves = new Set<(peerId: string) => void>();
  /**
   * Peers the layers above were told joined and not yet told left. A
   * peer proving the key again stays in it: what is above never sees a
   * key-ask, so a leave cannot be had for one message (a leave refills
   * the rate-limit budgets).
   */
  const told = new Set<string>();
  let order = 0;
  let left = false;

  /** Whether `peerId` may be this guest's host: any, until it knows its own. */
  const mayHost = (peerId: string): boolean => {
    const host = hostId();
    return host === undefined || host === peerId;
  };

  const proven = (peerId: string): boolean =>
    present.has(peerId) && peers.get(peerId)?.stage === "proven" && mayHost(peerId);

  const deliver = (channel: Channel, data: unknown, from: string): void => {
    for (const handler of [...(handlers.get(channel) ?? [])]) {
      handler(data, from);
    }
  };

  const tellJoin = (peerId: string): void => {
    if (told.has(peerId)) {
      return;
    }
    told.add(peerId);
    for (const handler of [...joins]) {
      handler(peerId);
    }
  };

  const tellLeave = (peerId: string): void => {
    if (!told.delete(peerId)) {
      return;
    }
    for (const handler of [...leaves]) {
      handler(peerId);
    }
  };

  /** Forgotten, and gone as far as the layers above know. */
  const drop = (peerId: string): void => {
    peers.delete(peerId);
    clearTimeout(timers.get(peerId));
    timers.delete(peerId);
    tellLeave(peerId);
  };

  /** `peerId` proved the key: it joins, and hears what was held for it. */
  const admit = (peerId: string, held: readonly [Channel, unknown][]): void => {
    peers.set(peerId, { stage: "proven" });
    clearTimeout(timers.get(peerId));
    timers.delete(peerId);
    if (!present.has(peerId)) {
      return;
    }
    tellJoin(peerId);
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
    clearTimeout(timers.get(peerId));
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

  const ask = (peerId: string): void => {
    asking.add(peerId);
    transport.send("key-ask", {} satisfies WireKeyAsk, peerId);
  };

  const offs = [
    transport.onPeerJoin((peerId) => {
      present.add(peerId);
      if (lapsed.delete(peerId) && mayHost(peerId)) {
        // A host that may not have seen us go still holds us proven, and
        // would never challenge again: ask it to.
        ask(peerId);
      } else if (proven(peerId) && !told.has(peerId)) {
        // Proven before the transport said it joined.
        tellJoin(peerId);
      } else if (proven(peerId)) {
        // Joined again with no leave: an id is no credential, so it proves
        // the key again, inside the gate as a key-ask is.
        if (side === "host") {
          challenge(peerId);
        } else {
          peers.delete(peerId);
          ask(peerId);
        }
      } else if (side === "host" && !peers.has(peerId)) {
        challenge(peerId);
      }
    }),
    transport.onPeerLeave((peerId) => {
      if (side === "guest" && proven(peerId)) {
        lapsed.add(peerId);
      }
      present.delete(peerId);
      asking.delete(peerId);
      // Forgotten, proven or not: a peer id is the peer's own choice and
      // shows on the relays, so one coming back proves the key again.
      drop(peerId);
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
    transport.on("key-ask", (_data, from) => {
      if (side !== "host" || !proven(from)) {
        return;
      }
      // It saw us drop and forgot us: unheard until it proves the key
      // again, though still here for what is above; failing, it is dropped.
      challenge(from);
    }),
    transport.on("key-challenge", (data, from) => {
      const asked = parseWireKeyChallenge(data);
      // A host that challenges again has forgotten this guest, as one that
      // saw it leave does: it proves the key again, and so must the host.
      if (
        side !== "guest" ||
        asked === undefined ||
        !mayHost(from) ||
        (peers.has(from) && !proven(from))
      ) {
        return;
      }
      const answered: Peer = { stage: "answered", hostNonce: asked.nonce, guestNonce: nonce() };
      peers.set(from, answered);
      // Unheard until it proves itself again. Unasked, it forgot us: it left.
      if (!asking.delete(from)) {
        tellLeave(from);
      }
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
