/**
 * Every Nostr relay in `NOSTR_RELAYS`, held open (#872, #2091): the one
 * socket loop the Random Arena board and a lobby's relay offers share.
 * A closed socket opens again `RELAY_RETRY_MS` later, an event sent
 * while one is still opening waits for it, and the subscription is asked
 * for again on each open.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** How long a closed relay socket waits before it opens again. */
export const RELAY_RETRY_MS = 10_000;

/** Messages a socket still opening holds for when it opens; the oldest go first. */
const PENDING_LIMIT = 16;

/** One relay connection, as `openSocket` makes it. */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
}

export interface RelaySocketHandlers {
  open(): void;
  message(data: unknown): void;
  /** Closed or failed; fired once per socket. */
  close(): void;
}

export type OpenRelaySocket = (url: string, handlers: RelaySocketHandlers) => RelaySocket;

export interface NostrEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
  readonly sig: string;
}

export const HEX_64 = /^[0-9a-f]{64}$/;
export const HEX_128 = /^[0-9a-f]{128}$/;

export function webSocket(url: string, handlers: RelaySocketHandlers): RelaySocket {
  const socket = new WebSocket(url);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      handlers.close();
    }
  };
  socket.onopen = () => {
    handlers.open();
  };
  socket.onmessage = (event) => {
    handlers.message(event.data);
  };
  socket.onerror = close;
  socket.onclose = close;
  return socket;
}

/** NIP-01's event id: sha256 of the serialised `[0, pubkey, created_at, kind, tags, content]`. */
export function eventId(event: Omit<NostrEvent, "id" | "sig">): Uint8Array {
  const serialised = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256(new TextEncoder().encode(serialised));
}

/** `unsigned`, with its id and `sign`'s signature of it. */
export function signEvent(
  unsigned: Omit<NostrEvent, "id" | "sig">,
  sign: (digest: Uint8Array) => string,
): NostrEvent {
  const id = eventId(unsigned);
  return { ...unsigned, id: bytesToHex(id), sig: sign(id) };
}

export function isTags(value: unknown): value is readonly (readonly string[])[] {
  return (
    Array.isArray(value) &&
    value.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === "string"))
  );
}

export function byteLength(data: string): number {
  return new TextEncoder().encode(data).length;
}

export interface RelayPoolOptions {
  readonly relays: readonly string[];
  readonly openSocket: OpenRelaySocket;
  /** The `REQ` each socket sends as it opens; none for a pool that only publishes. */
  readonly request?: string;
  /** A message from any relay, still raw. */
  readonly hear: (data: unknown) => void;
  /** Every relay is down: said once, and again only after one has opened since. */
  readonly allDown?: () => void;
}

export interface RelayPool {
  send(event: NostrEvent): void;
  /** Closes every socket; nothing more is heard. */
  close(): void;
}

interface Relay {
  socket: RelaySocket | undefined;
  open: boolean;
  readonly pending: string[];
  retry: ReturnType<typeof setTimeout> | undefined;
}

export function openRelayPool(options: RelayPoolOptions): RelayPool {
  const relays = new Map<string, Relay>();
  let closed = false;
  /** Set while every relay is down and `allDown` has been said. */
  let saidAllDown = false;

  function checkRelays(): void {
    const anyUp = [...relays.values()].some((relay) => relay.socket !== undefined);
    if (!anyUp && !saidAllDown) {
      saidAllDown = true;
      options.allDown?.();
    }
  }

  function connect(url: string, relay: Relay): void {
    relay.retry = undefined;
    relay.socket = options.openSocket(url, {
      open: () => {
        if (closed) {
          return;
        }
        relay.open = true;
        saidAllDown = false;
        if (options.request !== undefined) {
          relay.socket?.send(options.request);
        }
        for (const message of relay.pending.splice(0)) {
          relay.socket?.send(message);
        }
      },
      message: (data) => {
        if (!closed) {
          options.hear(data);
        }
      },
      close: () => {
        relay.socket = undefined;
        relay.open = false;
        if (closed) {
          return;
        }
        relay.retry = setTimeout(() => {
          connect(url, relay);
        }, RELAY_RETRY_MS);
        checkRelays();
      },
    });
  }

  for (const url of options.relays) {
    const relay: Relay = { socket: undefined, open: false, pending: [], retry: undefined };
    relays.set(url, relay);
    connect(url, relay);
  }

  return {
    send(event) {
      if (closed) {
        return;
      }
      const message = JSON.stringify(["EVENT", event]);
      for (const relay of relays.values()) {
        if (relay.open) {
          relay.socket?.send(message);
        } else {
          relay.pending.push(message);
          relay.pending.splice(0, relay.pending.length - PENDING_LIMIT);
        }
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const relay of relays.values()) {
        clearTimeout(relay.retry);
        relay.socket?.close();
      }
    },
  };
}
