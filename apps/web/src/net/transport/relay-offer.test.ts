import { TICKET_HEARTBEAT_MS } from "@vibewars/game-protocol";
import { RELAY_ADMIT_MS, type TicketKey } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bytesToHex } from "@noble/hashes/utils.js";
import { eventId, type NostrEvent, type OpenRelaySocket } from "./nostr-relays.js";
import {
  LOGIN_REMINT_LEFT_MS,
  MAX_OFFER_CONTENT_BYTES,
  MAX_KEPT_OFFERS,
  MAX_OFFER_OPENS_PER_SECOND,
  MAX_RELAYED_PER_HOLDER,
  OFFER_OPEN_INTERVAL_MS,
  RELAY_OFFER_KIND,
  holdRelay,
  openEnvelope,
  sealEnvelope,
  watchRelayAsks,
  watchRelayOffers,
  type OfferedRelaySource,
  type RelayOfferDeps,
  type RelayOfferRoom,
  type TopicMessage,
} from "./relay-offer.js";
import { newJoinerKey, rankOffers, sealRelayOffer, type JoinerKey } from "./relay-seal.js";
import { newTicketKey } from "./ticket-key.js";
import {
  TURN_CREDENTIAL_TTL_MS,
  credentialExpiry,
  mintTurnCredential,
  type SharedRelay,
} from "./turn-config.js";

/** A lobby's relay topic and key (#2091), as `deriveLobbyRoom` would give them. */
const ROOM: RelayOfferRoom = { topic: "ab".repeat(32), key: new Uint8Array(32).fill(7) };
const OTHER_KEY = new Uint8Array(32).fill(8);
const ROOM_ID = "room-1";
const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const SHARED: SharedRelay = { urls: ["turns:relay.example:5349"], secret: "s" };
const OTHER: SharedRelay = { urls: ["turns:other.example:5349"], secret: "t" };
const HOLDER = "holder-peer-id";
const JOINER = "joiner-peer-id";

const iv = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(12));

/** One relay that hands every event it is sent to every socket subscribed. */
function fakeRelay() {
  const subscribers = new Set<(data: string) => void>();
  const openSocket: OpenRelaySocket = (_url, handlers) => {
    queueMicrotask(() => {
      handlers.open();
    });
    const deliver = (data: string): void => {
      handlers.message(data);
    };
    const mine = new Set<(data: string) => void>();
    return {
      send(data) {
        const message: unknown = JSON.parse(data);
        if (!Array.isArray(message)) {
          return;
        }
        if (message[0] === "REQ") {
          const id = String(message[1]);
          const subscriber = (event: string): void => {
            deliver(JSON.stringify(["EVENT", id, JSON.parse(event)]));
          };
          mine.add(subscriber);
          subscribers.add(subscriber);
        } else if (message[0] === "EVENT") {
          for (const subscriber of [...subscribers]) {
            subscriber(JSON.stringify(message[1]));
          }
        }
      },
      close() {
        for (const subscriber of mine) {
          subscribers.delete(subscriber);
        }
      },
    };
  };
  /** Hand `event` to every subscriber, as anyone publishing on the topic could. */
  const publish = (event: object): void => {
    for (const subscriber of [...subscribers]) {
      subscriber(JSON.stringify(event));
    }
  };
  return { openSocket, publish };
}

/** `relay`'s sockets, counting those open and recording every event sent. */
function recording(relay: ReturnType<typeof fakeRelay>) {
  const sent: string[] = [];
  let open = 0;
  const openSocket: OpenRelaySocket = (url, handlers) => {
    const socket = relay.openSocket(url, handlers);
    open += 1;
    return {
      send(data) {
        if (data.startsWith('["EVENT"')) {
          sent.push(data);
        }
        socket.send(data);
      },
      close() {
        open -= 1;
        socket.close();
      },
    };
  };
  return { openSocket, sent, open: () => open };
}

const hex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/**
 * An event on `ROOM`'s topic whose id is its hash, with `content` that no
 * key opens unless given, by a fresh author or one it claims: what anyone
 * watching can send, since no signature is checked before it opens.
 */
function garbage(pubkey = hex(32), content = btoa("x".repeat(64))): NostrEvent {
  const unsigned = {
    pubkey,
    created_at: Math.floor(NOW / 1000),
    kind: RELAY_OFFER_KIND,
    tags: [["t", ROOM.topic]],
    content,
  };
  return { ...unsigned, id: bytesToHex(eventId(unsigned)), sig: hex(64) };
}

/** `message` on `ROOM`'s topic under `key`, by a fresh author or one it claims. */
async function topicEvent(
  message: TopicMessage,
  key = ROOM.key,
  pubkey = hex(32),
): Promise<NostrEvent> {
  return garbage(pubkey, await sealEnvelope(message, key, iv()));
}

/** Any JSON under the lobby key, as `sealEnvelope` lays it out: what a member could send. */
async function sealRaw(value: unknown): Promise<string> {
  const aes = await crypto.subtle.importKey("raw", new Uint8Array(ROOM.key), "AES-GCM", false, [
    "encrypt",
  ]);
  const nonce = iv();
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain),
  );
  return btoa(String.fromCharCode(...nonce, ...sealed));
}

function deps(openSocket: OpenRelaySocket, now: () => number): RelayOfferDeps {
  return {
    relays: ["wss://relay.example"],
    openSocket,
    now,
    newKey: newTicketKey,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  };
}

/** Options' shared relay, as the test sets it. */
function options(initial: SharedRelay | undefined) {
  let current = initial;
  const watchers = new Set<() => void>();
  const source: OfferedRelaySource = {
    load: () => current,
    onChange: (handler) => {
      watchers.add(handler);
      return () => {
        watchers.delete(handler);
      };
    },
  };
  const set = (next: SharedRelay | undefined): void => {
    current = next;
    for (const watcher of [...watchers]) {
      watcher();
    }
  };
  return { source, set, watchers };
}

/** A joiner's key, made ahead so its holder can be told the public half. */
const joiner = (key: JoinerKey) => (): Promise<JoinerKey> => Promise.resolve(key);

/** Lets sealing, opening and the sockets' microtasks run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what goes over a lobby's relay topic (#2527)", () => {
  it("opens an ask and a seal under the lobby key they went under", async () => {
    const { pub } = await newJoinerKey();
    const ask: TopicMessage = { kind: "ask", peerId: JOINER, pub };
    expect(await openEnvelope(await sealEnvelope(ask, ROOM.key, iv()), ROOM.key)).toEqual(ask);
    const seal: TopicMessage = {
      kind: "seal",
      seal: await sealRelayOffer(
        {
          config: mintTurnCredential(SHARED, JOINER, NOW, TURN_CREDENTIAL_TTL_MS),
          holder: HOLDER,
          name: "Ann",
        },
        pub,
        iv(),
      ),
    };
    expect(await openEnvelope(await sealEnvelope(seal, ROOM.key, iv()), ROOM.key)).toEqual(seal);
  });

  it("does not open under another lobby's key, or with one byte changed", async () => {
    const { pub } = await newJoinerKey();
    const content = await sealEnvelope({ kind: "ask", peerId: JOINER, pub }, ROOM.key, iv());
    expect(await openEnvelope(content, OTHER_KEY)).toBeUndefined();
    const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    expect(await openEnvelope(btoa(String.fromCharCode(...bytes)), ROOM.key)).toBeUndefined();
  });

  it("refuses content over the cap before it decrypts", async () => {
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    expect(await openEnvelope("A".repeat(MAX_OFFER_CONTENT_BYTES + 4), ROOM.key)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("refuses an inner message of any other shape", async () => {
    const { pub } = await newJoinerKey();
    const seal = { to: "0".repeat(32), epk: "AAAA", iv: "AAAA", ct: "AAAA" };
    const malformed: unknown[] = [
      { kind: "ask", peerId: "", pub },
      { kind: "ask", peerId: "p".repeat(65), pub },
      { kind: "ask", peerId: JOINER, pub: pub.slice(1) },
      { kind: "ask", peerId: JOINER, pub: `${pub.slice(1)}+` },
      { kind: "seal", seal: { ...seal, to: "z".repeat(32) } },
      { kind: "seal", seal: { ...seal, to: "0".repeat(31) } },
      { kind: "seal", seal: { ...seal, ct: "not base64url!" } },
      { kind: "seal" },
      { kind: "offer", peerId: JOINER, pub },
      [],
      null,
    ];
    // The well-formed ones open, so it is the shape that is refused.
    expect(
      await openEnvelope(await sealRaw({ kind: "ask", peerId: JOINER, pub }), ROOM.key),
    ).toBeDefined();
    expect(await openEnvelope(await sealRaw({ kind: "seal", seal }), ROOM.key)).toBeDefined();
    for (const value of malformed) {
      expect(await openEnvelope(await sealRaw(value), ROOM.key)).toBeUndefined();
    }
  });
});

describe("a lobby host's ear for asks (#2527)", () => {
  it("hears asks only while followed, and no seal", async () => {
    const relay = fakeRelay();
    const { pub } = await newJoinerKey();
    const heard: [string, string][] = [];
    const asks = watchRelayAsks(
      ROOM,
      (peerId, joinerPub) => heard.push([peerId, joinerPub]),
      deps(relay.openSocket, () => NOW),
    );
    const ask: TopicMessage = { kind: "ask", peerId: JOINER, pub };
    relay.publish(await topicEvent(ask));
    await settle();
    expect(heard).toEqual([]);

    asks.follow(true);
    await settle();
    relay.publish(await topicEvent(ask));
    relay.publish(await topicEvent({ kind: "ask", peerId: "other", pub }, OTHER_KEY));
    relay.publish(
      await topicEvent({
        kind: "seal",
        seal: { to: "0".repeat(32), epk: "AAAA", iv: "AAAA", ct: "AAAA" },
      }),
    );
    await settle();
    expect(heard).toEqual([[JOINER, pub]]);

    asks.follow(false);
    relay.publish(await topicEvent(ask));
    await settle();
    expect(heard).toHaveLength(1);

    asks.follow(true);
    await settle();
    asks.close();
    asks.follow(true);
    await settle();
    relay.publish(await topicEvent(ask));
    await settle();
    expect(heard).toHaveLength(1);
  });
});

describe("a member's relay, held for its lobby (#2527)", () => {
  it("follows Options: ticked, changed, unticked, closed", () => {
    const relay = fakeRelay();
    const opts = options(undefined);
    const hold = holdRelay(
      ROOM,
      opts.source,
      HOLDER,
      () => "Ann",
      deps(relay.openSocket, () => NOW),
    );
    let told = 0;
    hold.onChange(() => {
      told += 1;
    });
    expect(hold.holding()).toBe(false);
    opts.set(SHARED);
    expect(hold.holding()).toBe(true);
    // The same relay saved again changes nothing.
    opts.set({ urls: [...SHARED.urls], secret: SHARED.secret });
    expect(told).toBe(1);
    opts.set(OTHER);
    expect(hold.holding()).toBe(true);
    expect(told).toBe(2);
    opts.set(undefined);
    expect(hold.holding()).toBe(false);
    expect(told).toBe(3);
    opts.set(SHARED);
    hold.close();
    expect(hold.holding()).toBe(false);
    expect(opts.watchers.size).toBe(0);
  });

  it("seals an admitted joiner a login for its peer id alone, and logs or keeps nothing", async () => {
    const touch = vi.fn();
    const storage = {
      getItem: touch,
      setItem: touch,
      removeItem: touch,
      clear: touch,
      key: touch,
      length: 0,
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level),
    );
    const linked: SharedRelay = { urls: SHARED.urls, secret: "cd".repeat(32) };
    const plains: string[] = [];
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementation((algorithm, key, data) => {
      plains.push(new TextDecoder().decode(data));
      return encrypt(algorithm, key, data);
    });

    const relay = fakeRelay();
    const holderSockets = recording(relay);
    const key = await newJoinerKey();
    const otherKey = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
      joiner(key),
    );
    const unadmitted = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
      joiner(otherKey),
    );
    await settle();
    const hold = holdRelay(
      ROOM,
      options(linked).source,
      HOLDER,
      () => "Ann",
      deps(holderSockets.openSocket, () => NOW),
    );
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();

    const ranked = offers.ranked();
    expect(ranked).toHaveLength(1);
    const [offer] = ranked;
    expect(offer?.holder).toBe(HOLDER);
    expect(offer?.name).toBe("Ann");
    expect(offer?.config.urls).toEqual(linked.urls);
    expect(offer?.config.username).toBe(
      `${String((NOW + TURN_CREDENTIAL_TTL_MS) / 1000)}:${JOINER}`,
    );
    expect(offer === undefined ? undefined : credentialExpiry(offer.config)).toBe(NOW + HOUR);
    expect(offer?.config.credential).not.toBe(linked.secret);
    // Another key, even with the same peer id, opens nothing.
    expect(unadmitted.ranked()).toEqual([]);

    // The secret never travels, sealed or before it is.
    expect(holderSockets.sent).toHaveLength(1);
    for (const bytes of [...plains, ...holderSockets.sent]) {
      expect(bytes).not.toContain(linked.secret);
    }
    expect(touch).not.toHaveBeenCalled();
    for (const log of logs) {
      expect(log).not.toHaveBeenCalled();
    }
    hold.close();
    offers.close();
    unadmitted.close();
    expect(offers.ranked()).toEqual([]);
    expect(holderSockets.open()).toBe(0);
  });

  it("seals nothing while it holds no relay, or for a relay Options replaced meanwhile", async () => {
    const relay = fakeRelay();
    const sockets = recording(relay);
    const key = await newJoinerKey();
    const opts = options(undefined);
    const hold = holdRelay(
      ROOM,
      opts.source,
      HOLDER,
      () => "Ann",
      deps(sockets.openSocket, () => NOW),
    );
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(sockets.sent).toHaveLength(0);

    opts.set(SHARED);
    hold.admit({ peerId: JOINER, pub: key.pub });
    opts.set(OTHER);
    await settle();
    expect(sockets.sent).toHaveLength(0);
    hold.close();
  });

  it("seals again each heartbeat until the admit ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const relay = fakeRelay();
    const sockets = recording(relay);
    let now = NOW;
    const key = await newJoinerKey();
    const hold = holdRelay(
      ROOM,
      options(SHARED).source,
      HOLDER,
      () => "Ann",
      deps(sockets.openSocket, () => now),
    );
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(sockets.sent).toHaveLength(1);
    for (
      let at = TICKET_HEARTBEAT_MS;
      at <= RELAY_ADMIT_MS + TICKET_HEARTBEAT_MS;
      at += TICKET_HEARTBEAT_MS
    ) {
      now = NOW + at;
      vi.advanceTimersByTime(TICKET_HEARTBEAT_MS);
      await settle();
    }
    expect(sockets.sent).toHaveLength(RELAY_ADMIT_MS / TICKET_HEARTBEAT_MS);
    hold.close();
  });

  it("holds at most 8 peer ids at once, seated or in a live admit, and never refuses a remint", async () => {
    const relay = fakeRelay();
    const sockets = recording(relay);
    let now = NOW;
    const { pub } = await newJoinerKey();
    const hold = holdRelay(
      ROOM,
      options(SHARED).source,
      HOLDER,
      () => "Ann",
      deps(sockets.openSocket, () => now),
    );
    for (let i = 0; i < MAX_RELAYED_PER_HOLDER; i += 1) {
      hold.admit({ peerId: `peer-${String(i)}`, pub });
    }
    await settle();
    expect(sockets.sent).toHaveLength(MAX_RELAYED_PER_HOLDER);

    // A 9th live peer id is refused; one it holds is sealed for again.
    hold.admit({ peerId: "one-too-many", pub });
    await settle();
    expect(sockets.sent).toHaveLength(MAX_RELAYED_PER_HOLDER);
    hold.admit({ peerId: "peer-3", pub });
    await settle();
    expect(sockets.sent).toHaveLength(MAX_RELAYED_PER_HOLDER + 1);
    // A seated member's login is never refused.
    expect(hold.loginFor("one-too-many")?.username).toMatch(/:one-too-many$/);

    // Seated: peer-0, peer-1, and the member it minted a login for. Once
    // the admits expire, only the unseated ids free their slots.
    hold.seated(new Set(["peer-0", "peer-1", "one-too-many"]));
    now += RELAY_ADMIT_MS;
    for (let i = 0; i < MAX_RELAYED_PER_HOLDER - 3; i += 1) {
      hold.admit({ peerId: `late-${String(i)}`, pub });
    }
    await settle();
    expect(sockets.sent).toHaveLength(2 * MAX_RELAYED_PER_HOLDER - 2);
    hold.admit({ peerId: "late-full", pub });
    await settle();
    expect(sockets.sent).toHaveLength(2 * MAX_RELAYED_PER_HOLDER - 2);

    // Members that leave free their slots, a login's too.
    hold.seated(new Set(["peer-0"]));
    now += RELAY_ADMIT_MS;
    for (let i = 0; i < MAX_RELAYED_PER_HOLDER; i += 1) {
      hold.admit({ peerId: `last-${String(i)}`, pub });
    }
    await settle();
    expect(sockets.sent).toHaveLength(3 * MAX_RELAYED_PER_HOLDER - 3);
    hold.close();
  });

  it("tells a seated member one login until it runs low, then a fresh one", () => {
    const relay = fakeRelay();
    let now = NOW;
    const opts = options(SHARED);
    const hold = holdRelay(
      ROOM,
      opts.source,
      HOLDER,
      () => "Ann",
      deps(relay.openSocket, () => now),
    );
    const first = hold.loginFor(JOINER);
    expect(first?.urls).toEqual(SHARED.urls);
    expect(first?.username).toBe(`${String((NOW + HOUR) / 1000)}:${JOINER}`);
    expect(Object.keys(first ?? {})).toEqual(["urls", "username", "credential"]);
    expect(hold.loginFor("someone-else")?.username).not.toBe(first?.username);

    now = NOW + HOUR - LOGIN_REMINT_LEFT_MS;
    expect(hold.loginFor(JOINER)).toBe(first);
    now += 1000;
    const second = hold.loginFor(JOINER);
    expect(second?.username).toBe(`${String(now / 1000 + HOUR / 1000)}:${JOINER}`);
    expect(hold.loginFor(JOINER)).toBe(second);

    // Another relay saved: the logins for the first are dropped.
    opts.set(OTHER);
    expect(hold.loginFor(JOINER)?.urls).toEqual(OTHER.urls);
    opts.set(undefined);
    expect(hold.loginFor(JOINER)).toBeNull();
    opts.set(SHARED);
    hold.close();
    expect(hold.loginFor(JOINER)).toBeNull();
  });
});

describe("a joiner's relay offers (#2527)", () => {
  /** A holder of `shared` named after its peer id, at `now()`. */
  function holder(
    relay: ReturnType<typeof fakeRelay>,
    peerId: string,
    now: () => number,
    shared = SHARED,
    newKey = newTicketKey,
  ) {
    return holdRelay(ROOM, options(shared).source, peerId, () => peerId, {
      ...deps(relay.openSocket, now),
      newKey,
    });
  }

  it("asks at once and each heartbeat, until the host's login comes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const relay = fakeRelay();
    let now = NOW;
    const key = await newJoinerKey();
    const heard: [string, string][] = [];
    const asks = watchRelayAsks(
      ROOM,
      (peerId, pub) => heard.push([peerId, pub]),
      deps(relay.openSocket, () => now),
    );
    asks.follow(true);
    await settle();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    expect(heard).toEqual([[JOINER, key.pub]]);
    now += TICKET_HEARTBEAT_MS;
    vi.advanceTimersByTime(TICKET_HEARTBEAT_MS);
    await settle();
    expect(heard).toEqual([
      [JOINER, key.pub],
      [JOINER, key.pub],
    ]);

    const login = mintTurnCredential(SHARED, JOINER, now, TURN_CREDENTIAL_TTL_MS);
    offers.fromHost(login);
    now += TICKET_HEARTBEAT_MS;
    vi.advanceTimersByTime(TICKET_HEARTBEAT_MS * 3);
    await settle();
    expect(heard).toHaveLength(2);
    expect(offers.hostLogin()).toEqual(login);
    asks.close();
    offers.close();
  });

  it("answers an ask end to end: heard by the host, admitted, sealed by a member", async () => {
    const relay = fakeRelay();
    const hold = holder(relay, HOLDER, () => NOW);
    const asks = watchRelayAsks(
      ROOM,
      (peerId, pub) => {
        hold.admit({ peerId, pub });
      },
      deps(relay.openSocket, () => NOW),
    );
    asks.follow(true);
    await settle();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
    );
    let told = 0;
    offers.onOffer(() => {
      told += 1;
    });
    await settle();
    expect(offers.ranked().map((offer) => offer.holder)).toEqual([HOLDER]);
    expect(told).toBe(1);
    asks.close();
    hold.close();
    offers.close();
  });

  it("keeps the later-expiring offer per holder, drops expired ones, and ranks them", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    const early = holder(relay, HOLDER, () => NOW);
    const late = holder(relay, HOLDER, () => NOW + OFFER_OPEN_INTERVAL_MS);
    now += OFFER_OPEN_INTERVAL_MS;
    late.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    early.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked().map((offer) => offer.config.username)).toEqual([
      `${String((NOW + OFFER_OPEN_INTERVAL_MS + HOUR) / 1000)}:${JOINER}`,
    ]);

    const others = ["b", "c", "d"].map((peerId, i) =>
      holder(relay, peerId, () => now, {
        urls: [`turns:relay-${String(i)}.example:5349`],
        secret: "x",
      }),
    );
    for (const other of others) {
      other.admit({ peerId: JOINER, pub: key.pub });
    }
    await settle();
    const ranked = offers.ranked();
    expect(ranked.map((offer) => offer.holder).sort()).toEqual(["b", "c", "d", HOLDER]);
    expect(ranked).toEqual(rankOffers(ROOM_ID, [...ranked].reverse()));

    now = NOW + OFFER_OPEN_INTERVAL_MS + HOUR;
    expect(offers.ranked()).toEqual([]);
    for (const hold of [early, late, ...others]) {
      hold.close();
    }
    offers.close();
  });

  it("keeps only the best-ranked few of a flood of valid seals", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    // One invite holder, every seal valid, each a fresh holder, relay and author.
    const all = Array.from({ length: 1000 }, (_, i) => ({
      config: mintTurnCredential(
        { urls: [`turns:relay-${String(i)}.example:5349`], secret: "x" },
        JOINER,
        NOW,
        TURN_CREDENTIAL_TTL_MS,
      ),
      holder: `holder-${String(i)}`,
      name: "Mallory",
    }));
    const events = await Promise.all(
      all.map(async (offer) =>
        topicEvent({ kind: "seal", seal: await sealRelayOffer(offer, key.pub, iv()) }),
      ),
    );
    for (let i = 0; i < events.length; i += MAX_OFFER_OPENS_PER_SECOND) {
      now += 1000;
      for (const event of events.slice(i, i + MAX_OFFER_OPENS_PER_SECOND)) {
        relay.publish(event);
      }
      await settle();
    }
    const ranked = offers.ranked();
    expect(ranked).toHaveLength(MAX_KEPT_OFFERS);
    expect(ranked).toEqual(rankOffers(ROOM_ID, all).slice(0, MAX_KEPT_OFFERS));
    offers.close();
  });

  it("keeps one offer per relay host name, the newest seal's", async () => {
    const relay = fakeRelay();
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
      joiner(key),
    );
    await settle();
    const holders = ["b", "c"].map((peerId, i) =>
      holder(relay, peerId, () => NOW, {
        urls: [`turns:Relay.example:${String(5349 + i)}`],
        secret: "x",
      }),
    );
    for (const hold of holders) {
      hold.admit({ peerId: JOINER, pub: key.pub });
      await settle();
    }
    expect(offers.ranked().map((offer) => offer.holder)).toEqual(["c"]);
    for (const hold of holders) {
      hold.close();
    }
    offers.close();
  });

  it("opens no seal addressed to another key", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const { pub } = await newJoinerKey();
    const seal = await sealRelayOffer(
      {
        config: mintTurnCredential(SHARED, JOINER, NOW, TURN_CREDENTIAL_TTL_MS),
        holder: HOLDER,
        name: "Ann",
      },
      pub,
      iv(),
    );
    const event = await topicEvent({ kind: "seal", seal });
    const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");
    relay.publish(event);
    await settle();
    expect(deriveBits).not.toHaveBeenCalled();
    expect(offers.ranked()).toEqual([]);
    offers.close();
  });

  it("ignores an offer for a LAN relay", async () => {
    const relay = fakeRelay();
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
      joiner(key),
    );
    await settle();
    const hold = holder(relay, HOLDER, () => NOW, { urls: ["turn:192.168.1.2:3478"], secret: "x" });
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked()).toEqual([]);
    hold.close();
    offers.close();
  });

  it("is charged only by a seal that opens for it, so one holder reaches two joiners at once", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const [a, b] = await Promise.all([newJoinerKey(), newJoinerKey()]);
    const forA = watchRelayOffers(
      ROOM,
      ROOM_ID,
      "joiner-a",
      deps(relay.openSocket, () => now),
      joiner(a),
    );
    const forB = watchRelayOffers(
      ROOM,
      ROOM_ID,
      "joiner-b",
      deps(relay.openSocket, () => now),
      joiner(b),
    );
    await settle();
    const hold = holder(relay, HOLDER, () => now);
    hold.admit({ peerId: "joiner-a", pub: a.pub });
    hold.admit({ peerId: "joiner-b", pub: b.pub });
    await settle();
    expect(forA.ranked()).toHaveLength(1);
    expect(forB.ranked()).toHaveLength(1);
    const first = forA.ranked()[0]?.config.username;

    // Its newer seal within the interval is not opened; one after it is.
    now += OFFER_OPEN_INTERVAL_MS - 1000;
    hold.admit({ peerId: "joiner-a", pub: a.pub });
    await settle();
    expect(forA.ranked()[0]?.config.username).toBe(first);
    now += 1000;
    hold.admit({ peerId: "joiner-a", pub: a.pub });
    await settle();
    expect(forA.ranked()[0]?.config.username).toBe(
      `${String((NOW + OFFER_OPEN_INTERVAL_MS + HOUR) / 1000)}:joiner-a`,
    );
    hold.close();
    forA.close();
    forB.close();
  });

  it("opens a holder's seal through a flood of unopenable ones by fresh authors", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    // A second on from its own ask, so the flood has the whole budget.
    now += 1000;
    for (let i = 0; i < MAX_OFFER_OPENS_PER_SECOND - 1; i += 1) {
      relay.publish(garbage());
    }
    const hold = holder(relay, HOLDER, () => now);
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked().map((offer) => offer.holder)).toEqual([HOLDER]);
    // The budget is spent: a second fresh holder's waits for the next second.
    const late = holder(relay, "late", () => now);
    late.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked()).toHaveLength(1);
    hold.close();
    late.close();
    offers.close();
  });

  it("keeps hearing a holder it has heard, however hard fresh authors flood the topic", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    const hold = holder(relay, HOLDER, () => now);
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    const first = offers.ranked()[0]?.config.username;
    expect(first).toBeDefined();

    now += OFFER_OPEN_INTERVAL_MS;
    for (let i = 0; i < MAX_OFFER_OPENS_PER_SECOND * 2; i += 1) {
      relay.publish(garbage());
    }
    const fresh = holder(relay, "fresh", () => now);
    fresh.admit({ peerId: JOINER, pub: key.pub });
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked().map((offer) => offer.holder)).toEqual([HOLDER]);
    expect(offers.ranked()[0]?.config.username).not.toBe(first);
    hold.close();
    fresh.close();
    offers.close();
  });

  it("opens a holder's seal through garbage that claims the holder's key", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const holderKey = newTicketKey();
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => now),
      joiner(key),
    );
    await settle();
    for (let i = 0; i < 3; i += 1) {
      relay.publish(garbage(holderKey.ticketId));
    }
    await settle();
    const hold = holder(
      relay,
      HOLDER,
      () => now,
      SHARED,
      () => holderKey,
    );
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    const first = offers.ranked()[0]?.config.username;
    expect(first).toBeDefined();

    // Garbage under the holder's key, again and again, after its first open.
    now += OFFER_OPEN_INTERVAL_MS;
    for (let i = 0; i < 50; i += 1) {
      relay.publish(garbage(holderKey.ticketId));
    }
    await settle();
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked()[0]?.config.username).not.toBe(first);
    hold.close();
    offers.close();
  });

  // An invite holder's own seal for the joiner, put on the topic claiming
  // the victim's key: either with its id left over its own key, or with the
  // id recomputed over the victim's key and signed by its own.
  it.each([
    {
      forgery: "an id over another key",
      // Not its hash, so never opened (#2588).
      opened: [],
      forge: (event: NostrEvent, victim: string) => ({ ...event, pubkey: victim }),
    },
    {
      forgery: "a signature by another key",
      opened: ["mallory"],
      forge: (event: NostrEvent, victim: string, signer: TicketKey) => {
        const { created_at, kind, tags, content } = event;
        const digest = eventId({ pubkey: victim, created_at, kind, tags, content });
        return { ...event, pubkey: victim, id: bytesToHex(digest), sig: signer.sign(digest) };
      },
    },
  ])(
    "charges no holder for a seal that claims its key with $forgery (#2553)",
    async ({ forge, opened }) => {
      const relay = fakeRelay();
      const aside = recording(fakeRelay());
      const now = NOW;
      const victim = newTicketKey();
      const malloryKey = newTicketKey();
      const key = await newJoinerKey();
      const offers = watchRelayOffers(
        ROOM,
        ROOM_ID,
        JOINER,
        deps(relay.openSocket, () => now),
        joiner(key),
      );
      await settle();
      // Sealed where only mallory hears, then forged onto the topic.
      const mallory = holdRelay(ROOM, options(OTHER).source, "mallory", () => "mallory", {
        ...deps(aside.openSocket, () => now),
        newKey: () => malloryKey,
      });
      mallory.admit({ peerId: JOINER, pub: key.pub });
      await settle();
      const [sent] = aside.sent;
      if (sent === undefined) throw new Error("nothing sealed");
      const [, event] = JSON.parse(sent) as [string, NostrEvent];
      expect(event.pubkey).toBe(malloryKey.ticketId);
      relay.publish(forge(event, victim.ticketId, malloryKey));
      await settle();
      // A well-formed one is of use all the same: any invite holder can
      // seal one under its own key.
      expect(offers.ranked().map((offer) => offer.holder)).toEqual(opened);

      // Within the same interval, the victim's own seal opens: the forgery
      // charged nobody.
      const hold = holder(
        relay,
        HOLDER,
        () => now,
        SHARED,
        () => victim,
      );
      hold.admit({ peerId: JOINER, pub: key.pub });
      await settle();
      expect(offers.ranked().map((offer) => offer.holder)).toContain(HOLDER);
      mallory.close();
      hold.close();
      offers.close();
    },
  );

  it("opens an event delivered twice once, and none too big to be a seal", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    const event = garbage();
    relay.publish(event);
    relay.publish(event);
    await settle();
    expect(decrypt).toHaveBeenCalledTimes(1);
    relay.publish(garbage(hex(32), "A".repeat(MAX_OFFER_CONTENT_BYTES + 4)));
    relay.publish(garbage(hex(32), "A".repeat(8192)));
    await settle();
    expect(decrypt).toHaveBeenCalledTimes(1);
    offers.close();
  });

  it("opens a real seal that another relay echoed first under its id with junk (#2588)", async () => {
    const hostile = fakeRelay();
    const honest = fakeRelay();
    const aside = recording(fakeRelay());
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      {
        ...deps(honest.openSocket, () => NOW),
        relays: ["wss://hostile.example", "wss://honest.example"],
        openSocket: (url, handlers) =>
          (url === "wss://hostile.example" ? hostile : honest).openSocket(url, handlers),
      },
      joiner(key),
    );
    await settle();
    const hold = holdRelay(
      ROOM,
      options(SHARED).source,
      HOLDER,
      () => HOLDER,
      deps(aside.openSocket, () => NOW),
    );
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    const [sent] = aside.sent;
    if (sent === undefined) throw new Error("nothing sealed");
    const [, event] = JSON.parse(sent) as [string, NostrEvent];

    hostile.publish({ ...event, content: garbage().content });
    honest.publish(event);
    await settle();
    expect(offers.ranked().map((offer) => offer.holder)).toEqual([HOLDER]);
    hold.close();
    offers.close();
  });

  it("never opens an event whose id is not its hash (#2588)", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    relay.publish({ ...garbage(), id: hex(32) });
    relay.publish({
      ...garbage(),
      tags: [
        ["t", ROOM.topic],
        ["x", "1"],
      ],
    });
    await settle();
    expect(decrypt).not.toHaveBeenCalled();
    offers.close();
  });

  it("takes the host's login instead, and opens no seal from then on", async () => {
    const relay = fakeRelay();
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(relay.openSocket, () => NOW),
      joiner(key),
    );
    await settle();
    const hold = holder(relay, HOLDER, () => NOW);
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked()).toHaveLength(1);
    let told = 0;
    offers.onOffer(() => {
      told += 1;
    });

    offers.fromHost(null);
    expect(offers.ranked()).toEqual([]);
    expect(offers.hostLogin()).toBeUndefined();
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    const later = holder(relay, "later", () => NOW);
    later.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(decrypt).not.toHaveBeenCalled();
    expect(offers.ranked()).toEqual([]);

    const login = mintTurnCredential(OTHER, JOINER, NOW, TURN_CREDENTIAL_TTL_MS);
    offers.fromHost(login);
    expect(offers.hostLogin()).toEqual(login);
    expect(told).toBe(2);
    hold.close();
    later.close();
    offers.close();
  });

  it("stops asking, listening and keeping offers once closed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const relay = fakeRelay();
    const sockets = recording(relay);
    const key = await newJoinerKey();
    const offers = watchRelayOffers(
      ROOM,
      ROOM_ID,
      JOINER,
      deps(sockets.openSocket, () => NOW),
      joiner(key),
    );
    await settle();
    const hold = holder(relay, HOLDER, () => NOW);
    hold.admit({ peerId: JOINER, pub: key.pub });
    await settle();
    expect(offers.ranked()).toHaveLength(1);
    expect(sockets.sent).toHaveLength(1);
    offers.close();
    expect(sockets.open()).toBe(0);
    expect(offers.ranked()).toEqual([]);
    vi.advanceTimersByTime(TICKET_HEARTBEAT_MS * 3);
    await settle();
    expect(sockets.sent).toHaveLength(1);
    hold.close();
  });
});
