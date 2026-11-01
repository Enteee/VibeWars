/**
 * A lobby host's TURN relay, offered to whoever knows the lobby code
 * (#2091, ADR-0048). A joiner who needs a relay cannot reach the host to
 * be handed one, so the offer goes over the Nostr relays, as signalling
 * does: an ephemeral event, tagged with the lobby's relay topic, its
 * content a short-lived credential sealed with AES-GCM under the lobby's
 * relay key. Both come from the lobby key's slow derivation (ADR-0043),
 * so the public ciphertext costs as much to open as the key does to
 * guess.
 *
 * Only a credential minted from the host's shared secret is ever sealed:
 * the secret stays on the host's device. A joiner keeps an offer in
 * memory only, for as long as it is in the lobby, and nothing here logs
 * a config, a secret or an offer.
 */
import { TICKET_HEARTBEAT_MS } from "@vibewars/game-protocol";
import type { TicketKey } from "@vibewars/game-session";

import {
  byteLength,
  isTags,
  openRelayPool,
  signEvent,
  webSocket,
  type OpenRelaySocket,
  type RelayPool,
} from "./nostr-relays.js";
import { NOSTR_RELAYS } from "./relays.js";
import { newTicketKey } from "./ticket-key.js";
import {
  credentialExpiry,
  mintTurnCredential,
  TURN_CREDENTIAL_TTL_MS,
  validateTurnConfig,
  type SharedRelay,
  type TurnConfig,
} from "./turn-config.js";

/** The ephemeral kind (NIP-01: 20000–29999) a relay offer is: relays forward it and store nothing. */
export const RELAY_OFFER_KIND = 23855;

/** The largest offer content opened at all: a sealed config is a few hundred bytes. */
export const MAX_OFFER_CONTENT_BYTES = 2048;

/** The largest relay message parsed: an offer's content and its event around it. */
const MAX_OFFER_MESSAGE_BYTES = 4096;

/** A joiner opens at most one offer this often, so a flood of forged ones costs it nothing. */
export const OFFER_OPEN_INTERVAL_MS = 5_000;

/** A host mints a fresh credential once its current one has this little left. */
export const REMINT_LEFT_MS = 30 * 60 * 1000;

/** How far past a fresh credential's expiry an offer's may lie: clocks differ a little. */
const EXPIRY_SLACK_MS = 60 * 1000;

const IV_BYTES = 12;
const TAG_BYTES = 8;
const SUBSCRIPTION_ID = "vibewars-relay-offer";
/** Event ids remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 256;

/** The topic offers are tagged with and the key they are sealed under (`LobbyRoom.relay`). */
export interface RelayOfferRoom {
  readonly topic: string;
  readonly key: Uint8Array;
}

/** What offers take from the world; the unit test hands in fakes. */
export interface RelayOfferDeps {
  readonly relays: readonly string[];
  readonly openSocket: OpenRelaySocket;
  /** ms since the epoch. */
  readonly now: () => number;
  readonly newKey: () => TicketKey;
  readonly randomBytes: (length: number) => Uint8Array<ArrayBuffer>;
}

const BROWSER: RelayOfferDeps = {
  relays: NOSTR_RELAYS,
  openSocket: webSocket,
  now: () => Date.now(),
  newKey: newTicketKey,
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function aesKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, [usage]);
}

/** `config`, sealed under `key` with the fresh 12-byte `iv`: base64(iv ‖ ciphertext). */
export async function sealOffer(
  config: TurnConfig,
  key: Uint8Array,
  iv: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const plain = new TextEncoder().encode(
    JSON.stringify({ urls: config.urls, username: config.username, credential: config.credential }),
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key, "encrypt"), plain),
  );
  const both = new Uint8Array(iv.length + sealed.length);
  both.set(iv);
  both.set(sealed, iv.length);
  return btoa(String.fromCharCode(...both));
}

/**
 * The relay `content` offers, or `undefined`: content over the cap, one
 * that does not open under `key`, is not a valid config once opened, or
 * whose credential is expired at `nowMs` or lasts longer than a fresh
 * one could.
 */
export async function openOffer(
  content: string,
  key: Uint8Array,
  nowMs: number,
): Promise<TurnConfig | undefined> {
  if (byteLength(content) > MAX_OFFER_CONTENT_BYTES || !/^[A-Za-z0-9+/]*=*$/.test(content)) {
    return undefined;
  }
  try {
    const both = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
    if (both.length <= IV_BYTES) {
      return undefined;
    }
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: both.subarray(0, IV_BYTES) },
      await aesKey(key, "decrypt"),
      both.subarray(IV_BYTES),
    );
    const config = validateTurnConfig(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)),
    );
    const expiry = config === undefined ? undefined : credentialExpiry(config);
    if (
      expiry === undefined ||
      expiry <= nowMs ||
      expiry > nowMs + TURN_CREDENTIAL_TTL_MS + EXPIRY_SLACK_MS
    ) {
      return undefined;
    }
    return config;
  } catch {
    return undefined;
  }
}

/** A host's offers for one lobby: in its room's rhythm, on while it is there. */
export interface RelayShare {
  /** Publish while `on`, every `TICKET_HEARTBEAT_MS`; stop at once when not. */
  follow(on: boolean): void;
  /** Stop for good: the credential is dropped. */
  close(): void;
}

/**
 * Offer `shared` to the lobby `room` is, as the queue board heartbeats a
 * ticket: every `TICKET_HEARTBEAT_MS` on the same relay sockets, a fresh
 * IV each time, a fresh credential once the last has `REMINT_LEFT_MS`
 * left. One throwaway signing key and one log tag for the lobby's life.
 */
export function shareRelay(
  room: RelayOfferRoom,
  shared: SharedRelay,
  deps: RelayOfferDeps = BROWSER,
): RelayShare {
  const key = deps.newKey();
  const tag = hex(deps.randomBytes(TAG_BYTES));
  let credential: TurnConfig | undefined;
  let pool: RelayPool | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const publish = async (): Promise<void> => {
    const now = deps.now();
    const expiry = credential === undefined ? undefined : credentialExpiry(credential);
    if (credential === undefined || expiry === undefined || expiry - now < REMINT_LEFT_MS) {
      credential = mintTurnCredential(shared, tag, now);
    }
    const content = await sealOffer(credential, room.key, deps.randomBytes(IV_BYTES));
    pool?.send(
      signEvent(
        {
          pubkey: key.ticketId,
          created_at: Math.floor(now / 1000),
          kind: RELAY_OFFER_KIND,
          tags: [["t", room.topic]],
          content,
        },
        (digest) => key.sign(digest),
      ),
    );
  };
  const beat = (): void => {
    publish().catch(() => {
      // Sealing failed, which WebCrypto does not do for a good key: the next beat tries again.
    });
  };
  const stop = (): void => {
    clearInterval(heartbeat);
    heartbeat = undefined;
    pool?.close();
    pool = undefined;
  };

  return {
    follow(on) {
      if (closed || on === (pool !== undefined)) {
        return;
      }
      if (!on) {
        stop();
        return;
      }
      // It subscribes to nothing, so nothing it hears is for it.
      pool = openRelayPool({
        relays: deps.relays,
        openSocket: deps.openSocket,
        hear: () => undefined,
      });
      beat();
      heartbeat = setInterval(beat, TICKET_HEARTBEAT_MS);
    },
    close() {
      closed = true;
      stop();
      credential = undefined;
    },
  };
}

/** A joiner's view of a lobby's offers, held in memory only. */
export interface RelayOffers {
  /**
   * The newest live offer; `undefined` when there is none, or when two
   * live offers name different relays. Offers are not bound to the host:
   * any code holder can seal one, and a second relay is how a hostile
   * member would learn each joiner's address. Using neither turns that
   * into a denied relay only (ADR-0048).
   */
  latest(): TurnConfig | undefined;
  /** An offer opened; `latest()` may have changed. */
  onOffer(handler: () => void): () => void;
  /** Unsubscribe, and drop every offer. */
  close(): void;
}

/** Subscribe to the offers for `room`, from the moment the code is entered. */
export function watchRelayOffers(
  room: RelayOfferRoom,
  deps: RelayOfferDeps = BROWSER,
): RelayOffers {
  /** The newest offer per relay, by its URLs. */
  const offers = new Map<string, TurnConfig>();
  const handlers = new Set<() => void>();
  const seen = new Set<string>();
  let openedAt = -Infinity;
  let closed = false;

  const live = (): TurnConfig[] => {
    const now = deps.now();
    for (const [urls, config] of offers) {
      if ((credentialExpiry(config) ?? 0) <= now) {
        offers.delete(urls);
      }
    }
    return [...offers.values()];
  };

  const take = (config: TurnConfig): void => {
    const urls = JSON.stringify(config.urls);
    const held = offers.get(urls);
    if (held !== undefined && (credentialExpiry(held) ?? 0) >= (credentialExpiry(config) ?? 0)) {
      return;
    }
    offers.set(urls, config);
    for (const handler of [...handlers]) {
      handler();
    }
  };

  const hear = (data: unknown): void => {
    if (closed || typeof data !== "string" || byteLength(data) > MAX_OFFER_MESSAGE_BYTES) {
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!Array.isArray(message) || message[0] !== "EVENT" || message[1] !== SUBSCRIPTION_ID) {
      return;
    }
    const raw: unknown = message[2];
    if (typeof raw !== "object" || raw === null) {
      return;
    }
    // The signature is the relays' business: the seal is what says who
    // made an offer, and any code holder can make one either way.
    const { id, kind, tags, content } = raw as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      seen.has(id) ||
      kind !== RELAY_OFFER_KIND ||
      !isTags(tags) ||
      !tags.some(([name, value]) => name === "t" && value === room.topic) ||
      typeof content !== "string"
    ) {
      return;
    }
    const now = deps.now();
    if (now - openedAt < OFFER_OPEN_INTERVAL_MS) {
      return;
    }
    openedAt = now;
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(id);
    void openOffer(content, room.key, now).then((config) => {
      if (!closed && config !== undefined) {
        take(config);
      }
    });
  };

  const pool = openRelayPool({
    relays: deps.relays,
    openSocket: deps.openSocket,
    request: JSON.stringify([
      "REQ",
      SUBSCRIPTION_ID,
      { kinds: [RELAY_OFFER_KIND], "#t": [room.topic] },
    ]),
    hear,
  });

  return {
    latest() {
      const [only, other] = live();
      return other === undefined ? only : undefined;
    },
    onOffer(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      closed = true;
      pool.close();
      offers.clear();
      handlers.clear();
    },
  };
}
