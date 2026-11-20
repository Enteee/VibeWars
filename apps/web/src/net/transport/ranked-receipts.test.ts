import type { PlayerKey } from "@vibewars/game-session";
import {
  MAX_RECEIPT_BYTES,
  ZERO_HASH,
  receiptHash,
  startHash,
  validateReceipt,
  type RankedReceipt,
  type RankedResult,
  type RankedStart,
} from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";
import { MATCH_RECORD_EVENT_KIND } from "./match-records.js";
import { wellFormedEvent } from "./nostr-relays.js";
import { loadPlayerKey, receiptCrypto } from "./player-key.js";
import {
  RANKED_STARTER_ID,
  RANKED_TOPIC,
  hostLeftAddress,
  loadRankedPrev,
  parseRankedReceiptEvent,
  partialAddress,
  rankedReceiptEvent,
  receiptAddress,
  saveRankedPrev,
} from "./ranked-receipts.js";

/** A `Storage` of a plain map, as a fresh browser's localStorage. */
function memoryStorage(entries: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(entries));
  return {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const NOW = 1_795_000_000_000;

/** A ranked 1v1 of `red` against `blue`, both signed, `blue` with no character, chained on `prev`. */
function receiptOf(red: PlayerKey, blue: PlayerKey, prev = ZERO_HASH): RankedReceipt {
  const seat = (key: PlayerKey, characterId: string, name: string) => ({
    pubkey: key.pubkey,
    characterId,
    name,
    claimedRating: 800,
    prev: key === red ? prev : ZERO_HASH,
  });
  const start: RankedStart = {
    matchId: "group-1",
    buildHash: "build-abc",
    mode: "random-arena-1v1",
    map: "isle-of-the-nameless",
    seed: 1234,
    startedAt: NOW / 1000,
    leaderboardAsOf: 0,
    teams: [[seat(red, "char-red", "Red")], [seat(blue, RANKED_STARTER_ID, "Blue")]],
  };
  const result: RankedResult = {
    startHash: startHash(start, receiptCrypto.sha256),
    winningTeam: 0,
    endReason: "annihilation",
    leavers: [],
    durationSeconds: 300,
    replayHash: "ab".repeat(32),
  };
  const both = [red, blue];
  return {
    start,
    startSigs: Object.fromEntries(both.map((key) => [key.pubkey, key.signRankedStart(start)])),
    result,
    resultSigs: Object.fromEntries(both.map((key) => [key.pubkey, key.signRankedResult(result)])),
  };
}

describe("ranked receipts on Nostr (#3680)", () => {
  const red = loadPlayerKey(memoryStorage());
  const blue = loadPlayerKey(memoryStorage());

  it("round-trips a receipt through a signed event, and it still holds", () => {
    const receipt = receiptOf(red, blue);
    const event = rankedReceiptEvent(receipt, receiptAddress("group-1"), NOW);
    expect(event).toBeDefined();
    if (event === undefined) {
      return;
    }
    expect(event.tags).toEqual([
      ["d", `${RANKED_TOPIC}/group-1`],
      ["t", RANKED_TOPIC],
    ]);
    // A relay's copy passes the same well-formedness check every event does.
    expect(
      wellFormedEvent(JSON.parse(JSON.stringify(event)), MATCH_RECORD_EVENT_KIND),
    ).toBeDefined();
    const parsed = parseRankedReceiptEvent(event);
    expect(parsed).toEqual(receipt);
    expect(parsed && validateReceipt(parsed, receiptCrypto)).toEqual({ ok: true, void: false });
  });

  it("gives each round and each signer a partial receipt of its own address", () => {
    const addresses = [
      receiptAddress("group-1"),
      partialAddress("group-1", 0, red.pubkey),
      partialAddress("group-1", 1, red.pubkey),
      partialAddress("group-1", 0, blue.pubkey),
      hostLeftAddress("group-1", red.pubkey),
    ];
    expect(new Set(addresses).size).toBe(addresses.length);
    const receipt = receiptOf(red, blue);
    for (const address of addresses) {
      const event = rankedReceiptEvent(receipt, address, NOW);
      expect(event && parseRankedReceiptEvent(event)).toEqual(receipt);
    }
  });

  it("refuses an event of another topic, or one filed under another match", () => {
    const receipt = receiptOf(red, blue);
    const elsewhere = rankedReceiptEvent(receipt, receiptAddress("group-2"), NOW);
    expect(elsewhere && parseRankedReceiptEvent(elsewhere)).toBeUndefined();
    const prefix = rankedReceiptEvent(receipt, `${receiptAddress("group-1")}0`, NOW);
    expect(prefix && parseRankedReceiptEvent(prefix)).toBeUndefined();
    const event = rankedReceiptEvent(receipt, receiptAddress("group-1"), NOW);
    expect(event).toBeDefined();
    if (event !== undefined) {
      const untagged = { ...event, tags: event.tags.filter((tag) => tag[0] !== "t") };
      expect(parseRankedReceiptEvent(untagged)).toBeUndefined();
    }
  });

  it("does not publish a receipt over the size cap", () => {
    const receipt = receiptOf(red, blue);
    const huge = {
      ...receipt,
      start: { ...receipt.start, map: "x".repeat(MAX_RECEIPT_BYTES) },
    };
    expect(rankedReceiptEvent(huge, receiptAddress("group-1"), NOW)).toBeUndefined();
  });

  it("chains the next start on the last receipt published, for its own key only", () => {
    const storage = memoryStorage();
    expect(loadRankedPrev(storage, red.pubkey)).toBe(ZERO_HASH);
    const first = receiptOf(red, blue);
    saveRankedPrev(storage, red.pubkey, first, receiptCrypto.sha256);
    const prev = loadRankedPrev(storage, red.pubkey);
    expect(prev).toBe(receiptHash(first, receiptCrypto.sha256));
    // Another key in this browser starts its own chain.
    expect(loadRankedPrev(storage, blue.pubkey)).toBe(ZERO_HASH);
    const second = receiptOf(red, blue, prev);
    expect(second.start.teams[0]?.[0]?.prev).toBe(prev);
    expect(validateReceipt(second, receiptCrypto)).toEqual({ ok: true, void: false });
  });

  it.each(["not json", "null", '{"pubkey":1}', JSON.stringify({ prev: "zz" })])(
    "starts the chain over from a malformed kept hash: %s",
    (kept) => {
      const storage = memoryStorage({ [`${STORAGE_NAMESPACE}.rankedPrev`]: kept });
      expect(loadRankedPrev(storage, red.pubkey)).toBe(ZERO_HASH);
    },
  );

  it("labels a player with no character a starter, and the receipt still holds", () => {
    const receipt = receiptOf(red, blue);
    expect(receipt.start.teams[1]?.[0]?.characterId).toBe("starter");
    expect(validateReceipt(receipt, receiptCrypto).ok).toBe(true);
  });
});
