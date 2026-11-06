import type { TicketKey } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signEvent, type OpenRelaySocket } from "./nostr-relays.js";
import {
  MAX_OFFER_CONTENT_BYTES,
  MAX_OFFER_OPENS_PER_SECOND,
  OFFER_OPEN_INTERVAL_MS,
  RELAY_OFFER_KIND,
  REMINT_LEFT_MS,
  followOfferedRelay,
  openOffer,
  sealOffer,
  shareRelay,
  watchRelayOffers,
  type RelayOfferDeps,
  type RelayOfferRoom,
} from "./relay-offer.js";
import { newTicketKey } from "./ticket-key.js";
import {
  TURN_CREDENTIAL_TTL_MS,
  credentialExpiry,
  type SharedRelay,
  type TurnConfig,
} from "./turn-config.js";

/** A lobby's relay topic and key (#2091), as `deriveLobbyRoom` would give them. */
const ROOM: RelayOfferRoom = { topic: "ab".repeat(32), key: new Uint8Array(32).fill(7) };
const OTHER_KEY = new Uint8Array(32).fill(8);
const NOW = 1_700_000_000_000;
const SHARED: SharedRelay = { urls: ["turns:relay.example:5349"], secret: "s" };

function minted(urls: readonly string[], nowMs = NOW): TurnConfig {
  const expiry = Math.floor((nowMs + TURN_CREDENTIAL_TTL_MS) / 1000);
  return { urls: [...urls], username: `${String(expiry)}:0011223344556677`, credential: "c" };
}

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
  /** Hand `event` to every subscriber, as a relay watcher republishing on the topic would. */
  const publish = (event: object): void => {
    for (const subscriber of [...subscribers]) {
      subscriber(JSON.stringify(event));
    }
  };
  return { openSocket, publish };
}

const hex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/**
 * An event on `ROOM`'s topic that no key opens, by a fresh author or one
 * it claims: what anyone watching can send, since no signature is checked
 * before an offer opens.
 */
function garbage(pubkey = hex(32)): object {
  return {
    id: hex(32),
    pubkey,
    kind: RELAY_OFFER_KIND,
    tags: [["t", ROOM.topic]],
    content: btoa("x".repeat(64)),
  };
}

/** `config`, sealed under `ROOM`'s key, claiming `pubkey` and signed by `signer`. */
async function signedOffer(config: TurnConfig, pubkey: string, signer: TicketKey): Promise<object> {
  return signEvent(
    {
      pubkey,
      created_at: Math.floor(NOW / 1000),
      kind: RELAY_OFFER_KIND,
      tags: [["t", ROOM.topic]],
      content: await sealOffer(config, ROOM.key, iv()),
    },
    (digest) => signer.sign(digest),
  );
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

/** Lets sealing, opening and the sockets' microtasks run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("a lobby's relay offer, sealed (#2091)", () => {
  it("opens to the relay it was sealed with", async () => {
    const config = minted(SHARED.urls);
    expect(await openOffer(await sealOffer(config, ROOM.key, iv()), ROOM.key, NOW)).toEqual(config);
  });

  it("does not open under another lobby's key", async () => {
    const sealed = await sealOffer(minted(SHARED.urls), ROOM.key, iv());
    expect(await openOffer(sealed, OTHER_KEY, NOW)).toBeUndefined();
  });

  it("does not open with one byte changed", async () => {
    const bytes = Uint8Array.from(
      atob(await sealOffer(minted(SHARED.urls), ROOM.key, iv())),
      (char) => char.charCodeAt(0),
    );
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    expect(await openOffer(tampered, ROOM.key, NOW)).toBeUndefined();
  });

  it("ignores an expired offer, and one that outlasts a fresh credential", async () => {
    const stale = minted(SHARED.urls, NOW - TURN_CREDENTIAL_TTL_MS - 1000);
    expect(await openOffer(await sealOffer(stale, ROOM.key, iv()), ROOM.key, NOW)).toBeUndefined();
    const far = minted(SHARED.urls, NOW + 60 * 60 * 1000);
    expect(await openOffer(await sealOffer(far, ROOM.key, iv()), ROOM.key, NOW)).toBeUndefined();
  });

  it("refuses content over the cap before it decrypts", async () => {
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    expect(await openOffer("A".repeat(MAX_OFFER_CONTENT_BYTES + 4), ROOM.key, NOW)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
    decrypt.mockRestore();
  });

  it("ignores an offer for a LAN relay once opened", async () => {
    const lan = minted(["turn:192.168.1.2:3478"]);
    expect(await openOffer(await sealOffer(lan, ROOM.key, iv()), ROOM.key, NOW)).toBeUndefined();
  });
});

describe("a host's relay offers, heard by a joiner (#2091)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A storage that records every touch: the joiner side must make none. */
  function watchedStorage() {
    const touch = vi.fn();
    const storage = {
      getItem: touch,
      setItem: touch,
      removeItem: touch,
      clear: touch,
      key: touch,
      length: 0,
    };
    return { storage, touch };
  }

  it("reaches a joiner with the key, minted from the secret, and logs nothing", async () => {
    const local = watchedStorage();
    const session = watchedStorage();
    vi.stubGlobal("localStorage", local.storage);
    vi.stubGlobal("sessionStorage", session.storage);
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const share = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    share.follow(true);
    await settle();

    const heard = offers.latest();
    expect(heard?.urls).toEqual(SHARED.urls);
    expect(heard?.username).toMatch(/^\d+:[0-9a-f]{16}$/);
    // The secret itself never travels.
    expect(heard?.credential).not.toBe(SHARED.secret);
    // Nothing is kept on the joiner's device.
    expect(local.touch).not.toHaveBeenCalled();
    expect(session.touch).not.toHaveBeenCalled();
    for (const log of logs) {
      expect(log).not.toHaveBeenCalled();
    }
    share.close();
    offers.close();
    expect(offers.latest()).toBeUndefined();
  });

  it("mints a fresh 4 h credential once the last has 2 h left, not before (#2245)", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => now),
    );
    await settle();
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => now),
    );
    host.follow(true);
    await settle();
    const first = offers.latest();
    expect(first === undefined ? undefined : credentialExpiry(first)).toBe(
      NOW + 4 * 60 * 60 * 1000,
    );

    // A minute more than 2 h left: the same credential, sealed again.
    now += 2 * 60 * 60 * 1000 - 60 * 1000;
    host.follow(false);
    host.follow(true);
    await settle();
    expect(offers.latest()?.username).toBe(first?.username);

    // Under 2 h left: a fresh one, good for 4 h from now.
    now += 2 * 60 * 1000;
    host.follow(false);
    host.follow(true);
    await settle();
    const second = offers.latest();
    expect(second?.username).not.toBe(first?.username);
    expect(second === undefined ? undefined : credentialExpiry(second)).toBe(
      now + 4 * 60 * 60 * 1000,
    );
    host.close();
    offers.close();
  });

  it("never puts the secret in an offer, sealed or before it is (#2240)", async () => {
    const linked: SharedRelay = { urls: SHARED.urls, secret: "cd".repeat(32) };
    const plains: string[] = [];
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementation((algorithm, key, data) => {
      plains.push(new TextDecoder().decode(data));
      return encrypt(algorithm, key, data);
    });
    const relay = fakeRelay();
    const sent: string[] = [];
    const recording: OpenRelaySocket = (url, handlers) => {
      const socket = relay.openSocket(url, handlers);
      return {
        send(data) {
          sent.push(data);
          socket.send(data);
        },
        close() {
          socket.close();
        },
      };
    };
    const share = shareRelay(
      ROOM,
      linked,
      deps(recording, () => NOW),
    );
    share.follow(true);
    await settle();
    share.close();

    expect(plains).toHaveLength(1);
    expect(sent.some((data) => data.startsWith('["EVENT"'))).toBe(true);
    for (const bytes of [...plains, ...sent]) {
      expect(bytes).not.toContain(linked.secret);
    }
    // What is sealed is the minted login, and only that.
    expect(Object.keys(JSON.parse(plains[0] ?? "{}") as object)).toEqual([
      "urls",
      "username",
      "credential",
    ]);
  });

  it("is heard by no joiner of another lobby", async () => {
    const relay = fakeRelay();
    const other = watchRelayOffers(
      { topic: ROOM.topic, key: OTHER_KEY },
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const share = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    share.follow(true);
    await settle();
    expect(other.latest()).toBeUndefined();
    share.close();
    other.close();
  });

  it("opens the host's offer through a flood of unopenable ones by fresh authors", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    for (let i = 0; i < MAX_OFFER_OPENS_PER_SECOND - 1; i += 1) {
      relay.publish(garbage());
    }
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    host.follow(true);
    await settle();
    expect(offers.latest()?.urls).toEqual(SHARED.urls);
    host.close();
    offers.close();
  });

  it("keeps hearing a host it has heard, however hard the topic is flooded", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => now),
    );
    await settle();
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => now),
    );
    host.follow(true);
    await settle();
    const first = offers.latest();
    expect(first?.urls).toEqual(SHARED.urls);

    // Two hours on, the host mints again while the topic is flooded.
    now += TURN_CREDENTIAL_TTL_MS - REMINT_LEFT_MS + 60 * 1000;
    for (let i = 0; i < MAX_OFFER_OPENS_PER_SECOND * 2; i += 1) {
      relay.publish(garbage());
    }
    host.follow(false);
    host.follow(true);
    await settle();
    expect(offers.latest()?.username).not.toBe(first?.username);
    host.close();
    offers.close();
  });

  it("still opens the host's offer right after a member's own, and uses neither", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const hostile = shareRelay(
      ROOM,
      { urls: ["turn:hostile.example:3478"], secret: "x" },
      deps(relay.openSocket, () => NOW),
    );
    hostile.follow(true);
    await settle();
    expect(offers.latest()?.urls).toEqual(["turn:hostile.example:3478"]);
    // Within the same 5 s: the member spent its own slot, not the host's.
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    host.follow(true);
    await settle();
    expect(offers.latest()).toBeUndefined();
    host.close();
    hostile.close();
    offers.close();
  });

  it("opens the host's offer through garbage that claims the host's key", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const hostKey = newTicketKey();
    const hostDeps = (): RelayOfferDeps => ({
      ...deps(relay.openSocket, () => now),
      newKey: () => hostKey,
    });
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => now),
    );
    await settle();
    for (let i = 0; i < 3; i += 1) {
      relay.publish(garbage(hostKey.ticketId));
    }
    await settle();
    const host = shareRelay(ROOM, SHARED, hostDeps());
    host.follow(true);
    await settle();
    const first = offers.latest();
    expect(first?.urls).toEqual(SHARED.urls);

    // Garbage under the host's key, again and again, after its first open.
    now += OFFER_OPEN_INTERVAL_MS;
    for (let i = 0; i < 50; i += 1) {
      relay.publish(garbage(hostKey.ticketId));
    }
    await settle();
    now += TURN_CREDENTIAL_TTL_MS - REMINT_LEFT_MS + 60 * 1000;
    relay.publish(garbage(hostKey.ticketId));
    host.follow(false);
    host.follow(true);
    await settle();
    expect(offers.latest()?.username).not.toBe(first?.username);
    host.close();
    offers.close();
  });

  it("drops an invite holder's offer claiming the host's key, and keeps the host's slot (#2553)", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const host = newTicketKey();
    const member = newTicketKey();
    relay.publish(await signedOffer(minted(["turn:hostile.example:3478"]), host.ticketId, member));
    await settle();
    expect(offers.latest()).toBeUndefined();

    // Within the same 5 s: the forgery charged nobody.
    relay.publish(await signedOffer(minted(SHARED.urls), host.ticketId, host));
    await settle();
    expect(offers.latest()?.urls).toEqual(SHARED.urls);
    offers.close();
  });

  it("charges a genuine offer to its author: a second within 5 s is dropped (#2553)", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => now),
    );
    await settle();
    const host = newTicketKey();
    relay.publish(await signedOffer(minted(SHARED.urls), host.ticketId, host));
    await settle();
    const first = offers.latest();
    expect(first?.urls).toEqual(SHARED.urls);

    now += OFFER_OPEN_INTERVAL_MS - 1;
    relay.publish(await signedOffer(minted(SHARED.urls), host.ticketId, host));
    await settle();
    expect(offers.latest()).toBe(first);
    offers.close();
  });

  it("drops an offer whose content changed after it was signed (#2553)", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const host = newTicketKey();
    const signed = await signedOffer(minted(SHARED.urls), host.ticketId, host);
    relay.publish({
      ...signed,
      content: await sealOffer(minted(["turn:hostile.example:3478"]), ROOM.key, iv()),
    });
    await settle();
    expect(offers.latest()).toBeUndefined();
    offers.close();
  });

  it("uses no relay when two offers on one topic name different relays", async () => {
    const relay = fakeRelay();
    let now = NOW;
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => now),
    );
    await settle();
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => now),
    );
    host.follow(true);
    await settle();
    expect(offers.latest()?.urls).toEqual(SHARED.urls);

    now += OFFER_OPEN_INTERVAL_MS;
    const hostile = shareRelay(
      ROOM,
      { urls: ["turn:hostile.example:3478"], secret: "x" },
      deps(relay.openSocket, () => now),
    );
    hostile.follow(true);
    await settle();
    expect(offers.latest()).toBeUndefined();
    host.close();
    hostile.close();
    offers.close();
  });

  it("follows Options while the lobby is open: ticked, changed, unticked, closed", async () => {
    const relay = fakeRelay();
    let openSockets = 0;
    const sent: string[] = [];
    const counting: OpenRelaySocket = (url, handlers) => {
      const socket = relay.openSocket(url, handlers);
      openSockets += 1;
      return {
        send(data) {
          if (data.startsWith('["EVENT"')) {
            sent.push(data);
          }
          socket.send(data);
        },
        close() {
          openSockets -= 1;
          socket.close();
        },
      };
    };
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    let offered: SharedRelay | undefined;
    const watchers = new Set<() => void>();
    const setOptions = (next: SharedRelay | undefined): void => {
      offered = next;
      for (const watcher of watchers) {
        watcher();
      }
    };
    const share = followOfferedRelay(
      ROOM,
      {
        load: () => offered,
        onChange: (handler) => {
          watchers.add(handler);
          return () => watchers.delete(handler);
        },
      },
      deps(counting, () => NOW),
    );
    share.follow(true);
    await settle();
    expect(sent).toHaveLength(0);

    // Ticked in Options with the lobby already open: offered at once.
    setOptions(SHARED);
    await settle();
    expect(offers.latest()?.urls).toEqual(SHARED.urls);
    expect(openSockets).toBe(1);

    // Another relay saved: the first share stops, a fresh one offers it.
    const before = sent.length;
    setOptions({ urls: ["turns:other.example:5349"], secret: "t" });
    await settle();
    expect(sent.length).toBeGreaterThan(before);
    expect(openSockets).toBe(1);

    // Unticked: nothing is offered any more.
    setOptions(undefined);
    await settle();
    expect(openSockets).toBe(0);

    // Out of the room and ticked again: it waits for the room.
    share.follow(false);
    setOptions(SHARED);
    await settle();
    expect(openSockets).toBe(0);
    share.follow(true);
    await settle();
    expect(openSockets).toBe(1);

    share.close();
    expect(openSockets).toBe(0);
    expect(watchers.size).toBe(0);
    offers.close();
  });
});

describe("a seated guest's relay login, from its host (#2248)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** What any member can seal: the host's URLs, a junk login, the latest expiry allowed. */
  async function forged(urls: readonly string[]): Promise<object> {
    const expiry = Math.floor((NOW + TURN_CREDENTIAL_TTL_MS) / 1000);
    const junk: TurnConfig = {
      urls,
      username: `${String(expiry)}:ffffffffffffffff`,
      credential: "junk",
    };
    return { ...garbage(), content: await sealOffer(junk, ROOM.key, iv()) };
  }

  it("keeps the host's login through a member's forged offer, and never opens it", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    host.follow(true);
    await settle();
    const real = host.current();
    expect(real?.urls).toEqual(SHARED.urls);
    offers.fromHost(real ?? null);

    // Before #2248 this replaced the host's offer: same URLs, newer expiry.
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    const event = await forged(SHARED.urls);
    relay.publish(event);
    await settle();
    expect(decrypt).not.toHaveBeenCalled();
    expect(offers.latest()).toEqual(real);
    host.close();
    offers.close();
  });

  it("is none for the host's null, and a later login replaces the earlier", async () => {
    const relay = fakeRelay();
    const offers = watchRelayOffers(
      ROOM,
      deps(relay.openSocket, () => NOW),
    );
    await settle();
    const host = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => NOW),
    );
    host.follow(true);
    await settle();
    expect(offers.latest()?.urls).toEqual(SHARED.urls);
    let told = 0;
    offers.onOffer(() => {
      told += 1;
    });
    offers.fromHost(null);
    expect(offers.latest()).toBeUndefined();
    const next = minted(["turn:next.example:3478"], NOW + 1000);
    offers.fromHost(next);
    expect(offers.latest()).toEqual(next);
    expect(told).toBe(2);
    host.close();
    offers.close();
  });

  it("is what a host's share offers now: minted, reminted, stopped", () => {
    const relay = fakeRelay();
    let now = NOW;
    const share = shareRelay(
      ROOM,
      SHARED,
      deps(relay.openSocket, () => now),
    );
    const seen: (TurnConfig | undefined)[] = [];
    share.onChange(() => seen.push(share.current()));
    expect(share.current()).toBeUndefined();
    share.follow(true);
    const first = share.current();
    expect(first?.urls).toEqual(SHARED.urls);
    // Back in its room long after: the old credential is reminted.
    share.follow(false);
    now += TURN_CREDENTIAL_TTL_MS;
    share.follow(true);
    const second = share.current();
    expect(second?.username).not.toBe(first?.username);
    share.follow(false);
    expect(seen).toEqual([first, undefined, second, undefined]);
    share.close();
  });

  it("follows Options for the login it tells: another relay, then none", () => {
    const relay = fakeRelay();
    let offered: SharedRelay | undefined = SHARED;
    const watchers = new Set<() => void>();
    const share = followOfferedRelay(
      ROOM,
      {
        load: () => offered,
        onChange: (handler) => {
          watchers.add(handler);
          return () => watchers.delete(handler);
        },
      },
      deps(relay.openSocket, () => NOW),
    );
    const seen: (readonly string[] | undefined)[] = [];
    share.onChange(() => seen.push(share.current()?.urls));
    share.follow(true);
    offered = { urls: ["turns:other.example:5349"], secret: "t" };
    for (const watcher of [...watchers]) {
      watcher();
    }
    offered = undefined;
    for (const watcher of [...watchers]) {
      watcher();
    }
    expect(seen).toEqual([SHARED.urls, ["turns:other.example:5349"], undefined]);
    share.close();
  });
});
