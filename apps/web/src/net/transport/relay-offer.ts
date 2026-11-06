/**
 * Any lobby member's TURN relay, offered to one joiner at a time (#2091,
 * #2527, ADR-0049). A joiner that needs a relay cannot reach the lobby to
 * be handed one, so it asks over the Nostr relays, as signalling goes:
 * an ephemeral event tagged with the lobby's relay topic. The host admits
 * the ask over the lobby if it would seat that joiner; each member holding
 * a relay mints a login for that joiner's peer id alone and publishes it
 * sealed to the joiner's ephemeral public key (`relay-seal.ts`).
 *
 * Asks and seals both travel inside an outer AES-GCM layer under the
 * lobby's relay key, from the 256-bit lobby key (ADR-0048), which keeps
 * anyone without the invite link off the topic. No credential is ever in
 * that layer alone: only the joiner's private key opens one. A holder's
 * shared secret stays on its device, a joiner keeps its offers in memory
 * only, and nothing here logs a config, a secret, a key or an offer.
 */
import {
  isRelayPub,
  MAX_RELAY_PEER_ID,
  TICKET_HEARTBEAT_MS,
  type PeerRelayAdmit,
  type WireRelayLogin,
} from "@vibewars/game-protocol";
import { RELAY_ADMIT_MS, type TicketKey } from "@vibewars/game-session";

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
import {
  newJoinerKey,
  openRelaySeal,
  rankOffers,
  sealRelayOffer,
  type JoinerKey,
  type RelayOffer,
  type RelaySeal,
} from "./relay-seal.js";
import { newTicketKey } from "./ticket-key.js";
import {
  credentialExpiry,
  mintTurnCredential,
  TURN_CREDENTIAL_TTL_MS,
  type SharedRelay,
} from "./turn-config.js";

/** The ephemeral kind (NIP-01: 20000–29999) asks and seals are: relays forward it and store nothing. */
export const RELAY_OFFER_KIND = 23855;

/** The largest content opened at all: a seal is a few hundred bytes. */
export const MAX_OFFER_CONTENT_BYTES = 2048;

/** The largest relay message parsed: a content and its event around it. */
const MAX_OFFER_MESSAGE_BYTES = 4096;

/**
 * After an author's message was of use (an ask the host heard, a seal
 * that opened for this joiner), nothing more from it is opened for this
 * long. Only use charges it: an event's `pubkey` is not verified here,
 * and anyone can claim another's, so nothing short of that may cost an
 * author anything.
 */
export const OFFER_OPEN_INTERVAL_MS = 5_000;

/**
 * The most messages opened in a second from authors none of whose has
 * been of use yet, and again from authors one of whose has. Opening one
 * is microseconds of AES-GCM, so this bounds a flood's work, and a flood
 * by unproven authors never spends a proven author's budget.
 */
export const MAX_OFFER_OPENS_PER_SECOND = 200;

/**
 * The most new peer ids a holder mints for in a lobby in any hour
 * (#2527): with coturn's per-allocation `max-bps`, what one lobby can
 * draw from a relay. A seated member's login is never refused.
 */
export const MAX_RELAYED_PER_HOLDER = 16;
const RELAYED_WINDOW_MS = 60 * 60 * 1000;

/**
 * A seated member's login is reminted once it has this little left
 * (#2527): more than a guest's refresh threshold, so a guest between maps
 * always finds a newer one.
 */
export const LOGIN_REMINT_LEFT_MS = 40 * 60 * 1000;

/** How often a holder tells its lobby its members' logins may have been reminted. */
export const LOGIN_CHECK_MS = 5 * 60 * 1000;

const IV_BYTES = 12;
const SUBSCRIPTION_ID = "vibewars-relay-offer";
/** Event ids remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 256;
/** Authors remembered by their last use, before forgetting them all. */
const AUTHOR_LIMIT = 1024;

/** The topic asks and seals are tagged with and the key they go under (`LobbyRoom.relay`). */
export interface RelayOfferRoom {
  readonly topic: string;
  readonly key: Uint8Array;
}

/** What goes over the topic, inside the lobby-key layer. */
export type TopicMessage =
  | { readonly kind: "ask"; readonly peerId: string; readonly pub: string }
  | { readonly kind: "seal"; readonly seal: RelaySeal };

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

function aesKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, [usage]);
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** `value` as a topic message, or `undefined` for any other shape. */
function topicMessage(value: unknown): TopicMessage | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.kind === "ask" &&
    typeof raw.peerId === "string" &&
    raw.peerId.length > 0 &&
    raw.peerId.length <= MAX_RELAY_PEER_ID &&
    isRelayPub(raw.pub)
  ) {
    return { kind: "ask", peerId: raw.peerId, pub: raw.pub };
  }
  const seal = raw.seal;
  if (raw.kind !== "seal" || typeof seal !== "object" || seal === null) {
    return undefined;
  }
  const { to, epk, iv, ct } = seal as Record<string, unknown>;
  return typeof to === "string" &&
    /^[0-9a-f]{32}$/.test(to) &&
    typeof epk === "string" &&
    BASE64URL.test(epk) &&
    typeof iv === "string" &&
    BASE64URL.test(iv) &&
    typeof ct === "string" &&
    BASE64URL.test(ct)
    ? { kind: "seal", seal: { to, epk, iv, ct } }
    : undefined;
}

/** `message`, under the lobby relay `key` with the fresh 12-byte `iv`: base64(iv ‖ ciphertext). */
export async function sealEnvelope(
  message: TopicMessage,
  key: Uint8Array,
  iv: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(message));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key, "encrypt"), plain),
  );
  const both = new Uint8Array(iv.length + sealed.length);
  both.set(iv);
  both.set(sealed, iv.length);
  return btoa(String.fromCharCode(...both));
}

/**
 * The topic message `content` carries, or `undefined`: content over the
 * cap, one that does not open under `key`, or not an ask or a seal.
 */
export async function openEnvelope(
  content: string,
  key: Uint8Array,
): Promise<TopicMessage | undefined> {
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
    return topicMessage(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)));
  } catch {
    return undefined;
  }
}

/** One throwaway author publishing on `room`'s topic. */
interface TopicPublisher {
  publish(message: TopicMessage): void;
  close(): void;
}

function topicPublisher(room: RelayOfferRoom, deps: RelayOfferDeps): TopicPublisher {
  const key = deps.newKey();
  // It subscribes to nothing, so nothing it hears is for it.
  const pool = openRelayPool({
    relays: deps.relays,
    openSocket: deps.openSocket,
    hear: () => undefined,
  });
  let closed = false;
  return {
    publish(message) {
      void sealEnvelope(message, room.key, deps.randomBytes(IV_BYTES)).then(
        (content) => {
          if (closed) {
            return;
          }
          pool.send(
            signEvent(
              {
                pubkey: key.ticketId,
                created_at: Math.floor(deps.now() / 1000),
                kind: RELAY_OFFER_KIND,
                tags: [["t", room.topic]],
                content,
              },
              (digest) => key.sign(digest),
            ),
          );
        },
        () => {
          // Sealing failed, which WebCrypto does not do for a good key: the next beat tries again.
        },
      );
    },
    close() {
      closed = true;
      pool.close();
    },
  };
}

/**
 * Listen on `room`'s topic. `use` gets each message that opens and says
 * whether it was of use, which alone charges its author
 * `OFFER_OPEN_INTERVAL_MS`.
 */
function listenTopic(
  room: RelayOfferRoom,
  deps: RelayOfferDeps,
  use: (message: TopicMessage, nowMs: number) => Promise<boolean> | boolean,
): RelayPool {
  const seen = new Set<string>();
  /** When each author's last message was of use: the one proof that it holds the key. */
  const usedAt = new Map<string, number>();
  let windowStart = -Infinity;
  /** Opens this second, by unproven and by proven authors. */
  const windowOpens = { unproven: 0, proven: 0 };
  let closed = false;

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
    // The signature is the relays' business: the inner seal is what says
    // who made an offer, and any code holder can make one either way.
    const { id, pubkey, kind, tags, content } = raw as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof pubkey !== "string" ||
      seen.has(id) ||
      kind !== RELAY_OFFER_KIND ||
      !isTags(tags) ||
      !tags.some(([name, value]) => name === "t" && value === room.topic) ||
      typeof content !== "string"
    ) {
      return;
    }
    const now = deps.now();
    const lastUse = usedAt.get(pubkey);
    if (lastUse !== undefined && now - lastUse < OFFER_OPEN_INTERVAL_MS) {
      return;
    }
    if (now - windowStart >= 1000) {
      windowStart = now;
      windowOpens.unproven = 0;
      windowOpens.proven = 0;
    }
    const bucket = lastUse === undefined ? "unproven" : "proven";
    if (windowOpens[bucket] >= MAX_OFFER_OPENS_PER_SECOND) {
      return;
    }
    windowOpens[bucket] += 1;
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(id);
    void openEnvelope(content, room.key)
      .then(async (opened) => (opened === undefined || closed ? false : use(opened, now)))
      .then((used) => {
        if (!used || closed) {
          return;
        }
        if (usedAt.size >= AUTHOR_LIMIT) {
          usedAt.clear();
        }
        usedAt.set(pubkey, now);
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
    send: (event) => {
      pool.send(event);
    },
    close() {
      closed = true;
      pool.close();
    },
  };
}

/** A lobby host's ear for asks (#2527): on while it is in its room. */
export interface RelayAsks {
  /** Listen while `on`; stop at once when not. */
  follow(on: boolean): void;
  close(): void;
}

/** Hand every ask on `room`'s topic to `ask`, the lobby host's `relayAsk`, while followed. */
export function watchRelayAsks(
  room: RelayOfferRoom,
  ask: (peerId: string, pub: string) => void,
  deps: RelayOfferDeps = BROWSER,
): RelayAsks {
  let pool: RelayPool | undefined;
  let closed = false;
  return {
    follow(on) {
      if (closed || on === (pool !== undefined)) {
        return;
      }
      if (!on) {
        pool?.close();
        pool = undefined;
        return;
      }
      pool = listenTopic(room, deps, (message) => {
        if (message.kind !== "ask") {
          return false;
        }
        ask(message.peerId, message.pub);
        return true;
      });
    },
    close() {
      closed = true;
      pool?.close();
      pool = undefined;
    },
  };
}

/** Where a lobby's holder learns what Options shares now, and hears it change. */
export interface OfferedRelaySource {
  readonly load: () => SharedRelay | undefined;
  readonly onChange: (handler: () => void) => () => void;
}

/** A member's relay, held for one lobby (#2527). */
export interface RelayHold {
  /** Whether it shares a relay now: Options has a `rest` one and sharing is on. */
  holding(): boolean;
  /**
   * The host admitted `admit`: mint its peer id a login and publish it
   * sealed to its key, again each `TICKET_HEARTBEAT_MS` while the admit is
   * live. Nothing when not holding, or past `MAX_RELAYED_PER_HOLDER`.
   */
  admit(admit: PeerRelayAdmit): void;
  /**
   * The login for seated member `peerId` (#2248), as the host tells it
   * over the lobby: reminted once it has `LOGIN_REMINT_LEFT_MS` left, and
   * never refused. `null` when not holding.
   */
  loginFor(peerId: string): WireRelayLogin | null;
  /** `handler` when `holding()` may have changed, and each `LOGIN_CHECK_MS` while it holds. */
  onChange(handler: () => void): () => void;
  /** Stop for good: every login is dropped. */
  close(): void;
}

const sameRelay = (a: SharedRelay, b: SharedRelay): boolean =>
  a.secret === b.secret && a.urls.join("\n") === b.urls.join("\n");

/**
 * Hold the relay Options shares for the lobby `room` is, as member
 * `selfId` named `name()`: following Options while the lobby is open, so
 * a changed relay starts over with fresh logins.
 */
export function holdRelay(
  room: RelayOfferRoom,
  source: OfferedRelaySource,
  selfId: string,
  name: () => string,
  deps: RelayOfferDeps = BROWSER,
): RelayHold {
  const handlers = new Set<() => void>();
  let shared = source.load();
  let publisher: TopicPublisher | undefined;
  /** When each peer id was first minted for by an admit, within the hour. */
  const relayed = new Map<string, number>();
  /** Seated members' logins, by peer id. */
  const logins = new Map<string, WireRelayLogin>();
  /** Live seals, republished each beat until their admit ends. */
  const seals = new Map<string, { readonly seal: RelaySeal; readonly until: number }>();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const tell = (): void => {
    for (const handler of [...handlers]) {
      handler();
    }
  };

  const beat = (): void => {
    const now = deps.now();
    for (const [key, { seal, until }] of seals) {
      if (until <= now) {
        seals.delete(key);
      } else {
        publisher?.publish({ kind: "seal", seal });
      }
    }
    if (seals.size === 0) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  const drop = (): void => {
    clearInterval(heartbeat);
    heartbeat = undefined;
    seals.clear();
    logins.clear();
    relayed.clear();
    publisher?.close();
    publisher = undefined;
  };

  const stopHearing = source.onChange(() => {
    const next = source.load();
    if (shared !== undefined && next !== undefined && sameRelay(shared, next)) {
      return;
    }
    drop();
    shared = next;
    tell();
  });
  const check = setInterval(() => {
    if (shared !== undefined) {
      tell();
    }
  }, LOGIN_CHECK_MS);

  return {
    holding: () => !closed && shared !== undefined,
    admit({ peerId, pub }) {
      if (closed || shared === undefined) {
        return;
      }
      const now = deps.now();
      for (const [id, at] of relayed) {
        if (now - at >= RELAYED_WINDOW_MS) {
          relayed.delete(id);
        }
      }
      if (!relayed.has(peerId) && relayed.size >= MAX_RELAYED_PER_HOLDER) {
        return;
      }
      if (!relayed.has(peerId)) {
        relayed.set(peerId, now);
      }
      const offer: RelayOffer = {
        config: mintTurnCredential(shared, peerId, now, TURN_CREDENTIAL_TTL_MS),
        holder: selfId,
        name: name(),
      };
      const key = `${peerId} ${pub}`;
      void sealRelayOffer(offer, pub, deps.randomBytes(IV_BYTES)).then(
        (seal) => {
          if (closed || shared === undefined) {
            return;
          }
          publisher ??= topicPublisher(room, deps);
          seals.set(key, { seal, until: now + RELAY_ADMIT_MS });
          publisher.publish({ kind: "seal", seal });
          heartbeat ??= setInterval(beat, TICKET_HEARTBEAT_MS);
        },
        () => {
          // Not a key WebCrypto takes: the host checked its shape only.
        },
      );
    },
    loginFor(peerId) {
      if (closed || shared === undefined) {
        return null;
      }
      const now = deps.now();
      const held = logins.get(peerId);
      const expiry = held === undefined ? undefined : credentialExpiry(held);
      if (held !== undefined && expiry !== undefined && expiry - now >= LOGIN_REMINT_LEFT_MS) {
        return held;
      }
      const { urls, username, credential } = mintTurnCredential(
        shared,
        peerId,
        now,
        TURN_CREDENTIAL_TTL_MS,
      );
      const login = { urls, username, credential };
      logins.set(peerId, login);
      return login;
    },
    onChange(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      closed = true;
      stopHearing();
      clearInterval(check);
      drop();
      shared = undefined;
      handlers.clear();
    },
  };
}

/** A joiner's view of a lobby's relays, held in memory only. */
export interface RelayOffers {
  /**
   * The offers sealed to this joiner, live, one per holder, in
   * `rankOffers` order. Empty once `fromHost` has been called.
   */
  ranked(): RelayOffer[];
  /** The login the host told this seated guest (#2248), `undefined` until it has. */
  hostLogin(): WireRelayLogin | undefined;
  /**
   * The login the host told this seated guest over the lobby (#2248),
   * checked by `validateTurnConfig`; `null` for none or a failing one.
   * From the first call on, it asks no more and opens no seal again: the
   * host's lobby messages only the host can send. A later call replaces it.
   */
  fromHost(login: WireRelayLogin | null): void;
  /** An offer opened, or the host's login came: what the getters say may have changed. */
  onOffer(handler: () => void): () => void;
  /** Stop asking and listening, and drop every offer. */
  close(): void;
}

/**
 * Ask for relays into the lobby `room` is, whose room id is `roomId`, as
 * peer `selfId` (#2527): a fresh key pair for this page, an ask on the
 * topic now and every `TICKET_HEARTBEAT_MS` until the host's login comes
 * or it closes, and every seal for that key opened.
 */
export function watchRelayOffers(
  room: RelayOfferRoom,
  roomId: string,
  selfId: string,
  deps: RelayOfferDeps = BROWSER,
  newKey: () => Promise<JoinerKey> = newJoinerKey,
): RelayOffers {
  /** The newest offer per holder: one holder never fills two attempts. */
  const offers = new Map<string, RelayOffer>();
  const handlers = new Set<() => void>();
  let host: WireRelayLogin | null | undefined;
  let key: JoinerKey | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const publisher = topicPublisher(room, deps);

  const tell = (): void => {
    for (const handler of [...handlers]) {
      handler();
    }
  };

  const live = (): RelayOffer[] => {
    const now = deps.now();
    for (const [holder, offer] of offers) {
      if ((credentialExpiry(offer.config) ?? 0) <= now) {
        offers.delete(holder);
      }
    }
    return [...offers.values()];
  };

  const listener = listenTopic(room, deps, async (message, nowMs) => {
    if (message.kind !== "seal" || key === undefined || host !== undefined) {
      return false;
    }
    const offer = await openRelaySeal(message.seal, key, selfId, nowMs);
    if (offer === undefined || closed || host !== undefined) {
      return false;
    }
    const held = offers.get(offer.holder);
    if (
      held === undefined ||
      (credentialExpiry(held.config) ?? 0) < (credentialExpiry(offer.config) ?? 0)
    ) {
      offers.set(offer.holder, offer);
      tell();
    }
    return true;
  });

  const stopAsking = (): void => {
    clearInterval(heartbeat);
    heartbeat = undefined;
    publisher.close();
  };

  void newKey().then((made) => {
    if (closed || host !== undefined) {
      return;
    }
    key = made;
    const ask = (): void => {
      publisher.publish({ kind: "ask", peerId: selfId, pub: made.pub });
    };
    ask();
    heartbeat = setInterval(ask, TICKET_HEARTBEAT_MS);
  });

  return {
    ranked() {
      return host === undefined ? rankOffers(roomId, live()) : [];
    },
    hostLogin() {
      return host ?? undefined;
    },
    fromHost(login) {
      if (closed) {
        return;
      }
      if (host === undefined) {
        // Nothing from the Nostr relays is wanted any more.
        stopAsking();
        listener.close();
        offers.clear();
      }
      host = login;
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
      stopAsking();
      listener.close();
      offers.clear();
      key = undefined;
      host = undefined;
      handlers.clear();
    },
  };
}
