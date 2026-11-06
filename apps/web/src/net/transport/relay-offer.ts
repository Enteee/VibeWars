/**
 * A lobby host's TURN relay, offered to whoever knows the lobby invite link
 * (#2091, ADR-0049). A joiner who needs a relay cannot reach the host to
 * be handed one, so the offer goes over the Nostr relays, as signalling
 * does: an ephemeral event, tagged with the lobby's relay topic, its
 * content a short-lived credential sealed with AES-GCM under the lobby's
 * relay key. Both come from the 256-bit lobby key (ADR-0048), so the
 * public ciphertext cannot be opened by anyone without the invite link.
 *
 * Only a credential minted from the host's shared secret is ever sealed:
 * the secret stays on the host's device. A joiner keeps an offer in
 * memory only, for as long as it is in the lobby, and nothing here logs
 * a config, a secret or an offer.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { TICKET_HEARTBEAT_MS } from "@vibewars/game-protocol";
import type { TicketKey } from "@vibewars/game-session";

import {
  byteLength,
  eventId,
  isTags,
  openRelayPool,
  signEvent,
  webSocket,
  type OpenRelaySocket,
  type RelayPool,
} from "./nostr-relays.js";
import { NOSTR_RELAYS } from "./relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";
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

/**
 * After an author's offer opens, a joiner opens no other from it for this
 * long. Only an open whose event is signed by its `pubkey` charges it:
 * anyone can claim the host's pubkey, and an invite holder can seal an
 * offer that opens, so nothing short of an open with a valid signature
 * may cost an author anything.
 */
export const OFFER_OPEN_INTERVAL_MS = 5_000;

/**
 * The most offers a joiner opens in a second from authors none of whose
 * offers has opened yet, and again from authors one of whose has. Opening
 * one is microseconds of AES-GCM, so this bounds a flood's work, and a
 * flood by unproven authors never spends a proven host's budget.
 */
export const MAX_OFFER_OPENS_PER_SECOND = 200;

/** A host mints a fresh credential once its current one has this little left. */
export const REMINT_LEFT_MS = 2 * 60 * 60 * 1000;

/** How far past a fresh credential's expiry an offer's may lie: clocks differ a little. */
const EXPIRY_SLACK_MS = 60 * 1000;

const IV_BYTES = 12;
const TAG_BYTES = 8;
const SUBSCRIPTION_ID = "vibewars-relay-offer";
/** Event ids remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 256;
/** Authors remembered by their last open, before forgetting them all. */
const AUTHOR_LIMIT = 1024;

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
  /**
   * The credential offered now, while it publishes (#2248): what the host
   * tells each seated member over the lobby. `undefined` when it is not on.
   */
  current(): TurnConfig | undefined;
  /** `handler` each time `current()` changes, until the returned function is called. */
  onChange(handler: () => void): () => void;
  /** Stop for good: the credential is dropped. */
  close(): void;
}

/** `current()` and `onChange` for a share: `changed()` tells the handlers only when it did. */
function currentRelay(current: () => TurnConfig | undefined): {
  readonly onChange: (handler: () => void) => () => void;
  readonly changed: () => void;
} {
  const handlers = new Set<() => void>();
  let told = current();
  return {
    onChange(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    changed() {
      const now = current();
      if (now === told) {
        return;
      }
      told = now;
      for (const handler of [...handlers]) {
        handler();
      }
    },
  };
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
  const current = (): TurnConfig | undefined => (pool === undefined ? undefined : credential);
  const relay = currentRelay(current);

  const publish = async (): Promise<void> => {
    const now = deps.now();
    const expiry = credential === undefined ? undefined : credentialExpiry(credential);
    if (credential === undefined || expiry === undefined || expiry - now < REMINT_LEFT_MS) {
      credential = mintTurnCredential(shared, tag, now);
      relay.changed();
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
        relay.changed();
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
      relay.changed();
    },
    current,
    onChange: relay.onChange,
    close() {
      closed = true;
      stop();
      credential = undefined;
    },
  };
}

/** Where a lobby's share learns what Options offers now, and hears it change. */
export interface OfferedRelaySource {
  readonly load: () => SharedRelay | undefined;
  readonly onChange: (handler: () => void) => () => void;
}

const sameRelay = (a: SharedRelay, b: SharedRelay): boolean =>
  a.secret === b.secret && a.urls.join("\n") === b.urls.join("\n");

/**
 * A lobby's share that follows Options while the lobby is open (#2091):
 * ticking the box starts offering at once, unticking it or forgetting the
 * relay stops, and a changed relay is offered from a fresh share.
 */
export function followOfferedRelay(
  room: RelayOfferRoom,
  source: OfferedRelaySource,
  deps: RelayOfferDeps = BROWSER,
): RelayShare {
  let on = false;
  let closed = false;
  let current:
    | { readonly shared: SharedRelay; readonly share: RelayShare; readonly off: () => void }
    | undefined;
  const credential = (): TurnConfig | undefined => current?.share.current();
  const relay = currentRelay(credential);

  const sync = (): void => {
    if (closed) {
      return;
    }
    const shared = source.load();
    if (current !== undefined && (shared === undefined || !sameRelay(shared, current.shared))) {
      current.off();
      current.share.close();
      current = undefined;
    }
    if (current === undefined && shared !== undefined) {
      const share = shareRelay(room, shared, deps);
      current = { shared, share, off: share.onChange(relay.changed) };
    }
    current?.share.follow(on);
    relay.changed();
  };
  const stopHearing = source.onChange(sync);
  sync();

  return {
    follow(next) {
      on = next;
      sync();
    },
    current: credential,
    onChange: relay.onChange,
    close() {
      closed = true;
      stopHearing();
      current?.off();
      current?.share.close();
      current = undefined;
    },
  };
}

/** A joiner's view of a lobby's offers, held in memory only. */
export interface RelayOffers {
  /**
   * The host's login once `fromHost` has been called, `undefined` for its
   * `null`. Before that, the newest live offer; `undefined` when there is
   * none, or when two live offers name different relays. Offers are not
   * bound to the host: any code holder can seal one, and a second relay is
   * how a hostile member would learn each joiner's address. Using neither
   * turns that into a denied relay only (ADR-0049).
   */
  latest(): TurnConfig | undefined;
  /**
   * The login the host told this seated guest over the lobby (#2248),
   * checked by `validateTurnConfig`; `null` for none or a failing one.
   * From the first call on, no offer is opened again: a member can seal
   * one, the host's lobby messages only the host can send. A later call
   * replaces it.
   */
  fromHost(login: TurnConfig | null): void;
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
  /** When each author's last offer opened: the one proof that it holds the key. */
  const openedAt = new Map<string, number>();
  let windowStart = -Infinity;
  /** Opens this second, by unproven and by proven authors. */
  const windowOpens = { unproven: 0, proven: 0 };
  /** What the host said, once it has: `undefined` until then. */
  let hostLogin: TurnConfig | null | undefined;
  let closed = false;

  const tell = (): void => {
    for (const handler of [...handlers]) {
      handler();
    }
  };

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
    tell();
  };

  const hear = (data: unknown): void => {
    if (
      closed ||
      hostLogin !== undefined ||
      typeof data !== "string" ||
      byteLength(data) > MAX_OFFER_MESSAGE_BYTES
    ) {
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
    // The signature is checked only once the offer opens: verifying is
    // far dearer than opening, and only a code holder's offer opens.
    const { id, pubkey, created_at, kind, tags, content, sig } = raw as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof pubkey !== "string" ||
      typeof created_at !== "number" ||
      seen.has(id) ||
      kind !== RELAY_OFFER_KIND ||
      !isTags(tags) ||
      !tags.some(([name, value]) => name === "t" && value === room.topic) ||
      typeof content !== "string"
    ) {
      return;
    }
    const now = deps.now();
    const lastOpen = openedAt.get(pubkey);
    if (lastOpen !== undefined && now - lastOpen < OFFER_OPEN_INTERVAL_MS) {
      return;
    }
    if (now - windowStart >= 1000) {
      windowStart = now;
      windowOpens.unproven = 0;
      windowOpens.proven = 0;
    }
    const bucket = lastOpen === undefined ? "unproven" : "proven";
    if (windowOpens[bucket] >= MAX_OFFER_OPENS_PER_SECOND) {
      return;
    }
    windowOpens[bucket] += 1;
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(id);
    void openOffer(content, room.key, now).then((config) => {
      if (closed || hostLogin !== undefined || config === undefined) {
        return;
      }
      // An offer is charged to its pubkey, so it must be that pubkey's:
      // otherwise an invite holder could claim a real host's and mute it.
      const digest = eventId({ pubkey, created_at, kind, tags, content });
      if (
        typeof sig !== "string" ||
        id !== bytesToHex(digest) ||
        !verifyTicketSig(pubkey, digest, sig)
      ) {
        return;
      }
      if (openedAt.size >= AUTHOR_LIMIT) {
        openedAt.clear();
      }
      openedAt.set(pubkey, now);
      take(config);
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
      if (hostLogin !== undefined) {
        return hostLogin ?? undefined;
      }
      const [only, other] = live();
      return other === undefined ? only : undefined;
    },
    fromHost(login) {
      if (closed) {
        return;
      }
      if (hostLogin === undefined) {
        // Nothing from the Nostr relays is wanted any more.
        pool.close();
        offers.clear();
      }
      hostLogin = login;
      tell();
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
      hostLogin = undefined;
      handlers.clear();
    },
  };
}
