import { describe, expect, it, vi } from "vitest";

import {
  fromBase64Url,
  newJoinerKey,
  openRelaySeal,
  rankOffers,
  recipientTag,
  sealRelayOffer,
  toBase64Url,
  type RelayOffer,
} from "./relay-seal.js";
import { TURN_CREDENTIAL_TTL_MS, type TurnConfig } from "./turn-config.js";

/** A relay login sealed to one joiner (#2527, ADR-0049). */

const NOW = 1_700_000_000_000;
const PEER = "joiner-peer";

function login(peerId = PEER, nowMs = NOW, url = "turns:relay.example:5349"): TurnConfig {
  const expiry = Math.floor((nowMs + TURN_CREDENTIAL_TTL_MS) / 1000);
  return { urls: [url], username: `${String(expiry)}:${peerId}`, credential: "c" };
}

function offer(holder = "holder-a", config = login()): RelayOffer {
  return { config, holder, name: "Ada" };
}

const iv = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(12));

describe("a relay seal (#2527)", () => {
  it("opens with the joiner's key it was sealed to", async () => {
    const key = await newJoinerKey();
    const sealed = await sealRelayOffer(offer(), key.pub, iv());
    expect(sealed.to).toBe(key.to);
    expect(await openRelaySeal(sealed, key, PEER, NOW)).toEqual(offer());
  });

  it("does not open with another key pair, even told it is for it", async () => {
    const key = await newJoinerKey();
    const other = await newJoinerKey();
    const sealed = await sealRelayOffer(offer(), key.pub, iv());
    expect(await openRelaySeal({ ...sealed, to: other.to }, other, PEER, NOW)).toBeUndefined();
  });

  it("does not open once its ciphertext is tampered with", async () => {
    const key = await newJoinerKey();
    const sealed = await sealRelayOffer(offer(), key.pub, iv());
    const ct = fromBase64Url(sealed.ct) ?? new Uint8Array(0);
    ct[0] = (ct[0] ?? 0) ^ 1;
    expect(await openRelaySeal({ ...sealed, ct: toBase64Url(ct) }, key, PEER, NOW)).toBeUndefined();
  });

  it("skips one for another key before any ECDH", async () => {
    const key = await newJoinerKey();
    const other = await newJoinerKey();
    const sealed = await sealRelayOffer(offer(), other.pub, iv());
    const derive = vi.spyOn(crypto.subtle, "deriveBits");
    expect(await openRelaySeal(sealed, key, PEER, NOW)).toBeUndefined();
    expect(derive).not.toHaveBeenCalled();
    derive.mockRestore();
  });

  it("uses a fresh ephemeral key for every seal", async () => {
    const key = await newJoinerKey();
    const one = await sealRelayOffer(offer(), key.pub, iv());
    const two = await sealRelayOffer(offer(), key.pub, iv());
    expect(one.epk).not.toBe(two.epk);
  });

  it("names its joiner by the first 16 bytes of SHA-256 of the raw key", async () => {
    const key = await newJoinerKey();
    const raw = fromBase64Url(key.pub) ?? new Uint8Array(0);
    expect(raw).toHaveLength(65);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
    expect(recipientTag(key.pub)).toBe(
      Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join(""),
    );
  });

  it("refuses a login for another peer, expired, or longer than a fresh one", async () => {
    const key = await newJoinerKey();
    const open = async (config: TurnConfig) =>
      openRelaySeal(await sealRelayOffer(offer("h", config), key.pub, iv()), key, PEER, NOW);
    expect(await open(login("someone-else"))).toBeUndefined();
    expect(await open(login(PEER, NOW - TURN_CREDENTIAL_TTL_MS - 1000))).toBeUndefined();
    expect(await open(login(PEER, NOW + 5 * 60 * 1000))).toBeUndefined();
    expect(await open(login(PEER, NOW + 30 * 1000))).toBeDefined();
  });

  it("refuses an overlong holder name or peer id", async () => {
    const key = await newJoinerKey();
    const open = async (sealed: RelayOffer) =>
      openRelaySeal(await sealRelayOffer(sealed, key.pub, iv()), key, PEER, NOW);
    expect(await open({ ...offer(), name: "n".repeat(41) })).toBeUndefined();
    expect(await open({ ...offer(), holder: "h".repeat(65) })).toBeUndefined();
    expect(await open({ ...offer(), holder: "" })).toBeUndefined();
  });
});

describe("rankOffers (#2527)", () => {
  const offers = [
    offer("a", login(PEER, NOW, "turn:one.example")),
    offer("b", login(PEER, NOW, "turn:two.example")),
    offer("c", login(PEER, NOW, "turn:three.example")),
    offer("d", login(PEER, NOW, "turn:four.example")),
  ];

  /** Every order of `items`. */
  function permutations<T>(items: readonly T[]): T[][] {
    if (items.length <= 1) {
      return [[...items]];
    }
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
  }

  it("gives every permutation of the same set the same order", () => {
    const first = rankOffers("room", offers).map(({ holder }) => holder);
    for (const order of permutations(offers)) {
      expect(rankOffers("room", order).map(({ holder }) => holder)).toEqual(first);
    }
  });

  it("orders by the room as well as the URL", () => {
    const orders = new Set(
      ["r1", "r2", "r3", "r4", "r5", "r6"].map((room) =>
        rankOffers(room, offers)
          .map(({ holder }) => holder)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("breaks a tie by the holder's peer id", () => {
    const same = login(PEER, NOW, "turn:same.example");
    expect(
      rankOffers("room", [offer("z", same), offer("m", same), offer("b", same)]).map(
        ({ holder }) => holder,
      ),
    ).toEqual(["b", "m", "z"]);
  });
});
