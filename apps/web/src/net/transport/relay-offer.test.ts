import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenRelaySocket } from "./nostr-relays.js";
import {
  MAX_OFFER_CONTENT_BYTES,
  OFFER_OPEN_INTERVAL_MS,
  openOffer,
  sealOffer,
  shareRelay,
  watchRelayOffers,
  type RelayOfferDeps,
  type RelayOfferRoom,
} from "./relay-offer.js";
import { newTicketKey } from "./ticket-key.js";
import { TURN_CREDENTIAL_TTL_MS, type SharedRelay, type TurnConfig } from "./turn-config.js";

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
    return {
      send(data) {
        const message: unknown = JSON.parse(data);
        if (!Array.isArray(message)) {
          return;
        }
        if (message[0] === "REQ") {
          const id = String(message[1]);
          subscribers.add((event) => {
            deliver(JSON.stringify(["EVENT", id, JSON.parse(event)]));
          });
        } else if (message[0] === "EVENT") {
          for (const subscriber of [...subscribers]) {
            subscriber(JSON.stringify(message[1]));
          }
        }
      },
      close() {
        subscribers.clear();
      },
    };
  };
  return { openSocket };
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
});
