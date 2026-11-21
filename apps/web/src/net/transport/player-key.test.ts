import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { schnorr } from "@noble/secp256k1";
import {
  type RankedResult,
  type RankedStart,
  resultDigest,
  startDigest,
  startHash,
  ZERO_HASH,
} from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";
import * as playerKeyModule from "./player-key.js";
import { loadPlayerKey, verifyPlayerProof } from "./player-key.js";

/** The player key (#2706): one per browser, proving a lobby join. */

const KEY = `${STORAGE_NAMESPACE}.playerKey`;

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

const FIELDS = {
  hostPeerId: "host-peer",
  joinerPeerId: "joiner-peer",
  roomId: "ACDEFG",
  nonce: "5c".repeat(32),
};

/** A ranked 1v1 of `pubkey` (ADR-0055). */
function rankedStart(pubkey: string): RankedStart {
  const seat = {
    pubkey,
    characterId: "char-1",
    name: "Seat",
    claimedRating: 800,
    leaderboardAsOf: 1_794_999_000,
    prev: ZERO_HASH,
  };
  return {
    matchId: "group-1",
    buildHash: "build-abc",
    mode: "team-arena",
    map: "isle-of-the-nameless",
    seed: 7,
    startedAt: 1_795_000_000,
    teams: [[seat], [{ ...seat, pubkey: "ab".repeat(32) }]],
  };
}

/** The ui and render modules' sources, to check none reaches the key. */
const shown = import.meta.glob<string>(["../../ui/**/*.ts", "../../render/**/*.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("the player key (#2706)", () => {
  it("is made once, and is the same key on every load after", () => {
    const storage = memoryStorage();
    const first = loadPlayerKey(storage);
    const stored = storage.getItem(KEY);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(first.pubkey).toMatch(/^[0-9a-f]{64}$/);
    // The stored secret is not the public key.
    expect(stored).not.toBe(first.pubkey);
    const again = loadPlayerKey(storage);
    expect(again.pubkey).toBe(first.pubkey);
    expect(storage.getItem(KEY)).toBe(stored);
  });

  it("replaces a malformed stored key with a new one", () => {
    for (const bad of ["", "zz".repeat(32), "AB".repeat(32), "ab".repeat(31), "00".repeat(32)]) {
      const storage = memoryStorage({ [KEY]: bad });
      const key = loadPlayerKey(storage);
      expect(key.pubkey).toMatch(/^[0-9a-f]{64}$/);
      expect(storage.getItem(KEY)).not.toBe(bad);
      expect(loadPlayerKey(storage).pubkey).toBe(key.pubkey);
    }
  });

  it("still makes a key when storage throws, for this page alone", () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error("denied");
    };
    broken.setItem = () => {
      throw new Error("denied");
    };
    expect(loadPlayerKey(broken).pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exposes its key and purpose-named signers, never a raw sign or the secret", () => {
    expect(Object.keys(playerKeyModule).sort()).toEqual([
      "loadPlayerKey",
      "receiptCrypto",
      "verifyCosmetics",
      "verifyPlayerProof",
    ]);
    const key = loadPlayerKey(memoryStorage());
    expect(Object.keys(key).sort()).toEqual([
      "pubkey",
      "signCosmetics",
      "signLobbyProof",
      "signRankedResult",
      "signRankedStart",
    ]);
    expect("sign" in key).toBe(false);
  });

  it("proves a lobby join that verifies for exactly the fields it names", () => {
    const key = loadPlayerKey(memoryStorage());
    const sig = key.signLobbyProof(FIELDS);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyPlayerProof(key.pubkey, FIELDS, sig)).toBe(true);
    for (const other of [
      { ...FIELDS, hostPeerId: "other-host" },
      { ...FIELDS, joinerPeerId: "other-joiner" },
      { ...FIELDS, roomId: "OTHERS" },
      { ...FIELDS, nonce: "5d".repeat(32) },
      // The length prefixes: the same bytes split another way are another proof.
      { ...FIELDS, hostPeerId: "host-peerj", joinerPeerId: "oiner-peer" },
    ]) {
      expect(verifyPlayerProof(key.pubkey, other, sig)).toBe(false);
    }
    expect(verifyPlayerProof(loadPlayerKey(memoryStorage()).pubkey, FIELDS, sig)).toBe(false);
  });

  it("signs a ranked start and result under their own tags, neither a lobby proof (ADR-0055)", () => {
    const key = loadPlayerKey(memoryStorage());
    const start = rankedStart(key.pubkey);
    const result: RankedResult = {
      startHash: startHash(start, sha256),
      winningTeam: 0,
      endReason: "annihilation",
      leavers: [],
      durationSeconds: 300,
      replayHash: "cd".repeat(32),
    };
    const pubkey = hexToBytes(key.pubkey);
    const startSig = key.signRankedStart(start);
    const resultSig = key.signRankedResult(result);
    expect(startSig).toMatch(/^[0-9a-f]{128}$/);
    expect(schnorr.verify(hexToBytes(startSig), startDigest(start, sha256), pubkey)).toBe(true);
    expect(schnorr.verify(hexToBytes(resultSig), resultDigest(result, sha256), pubkey)).toBe(true);
    expect(schnorr.verify(hexToBytes(startSig), resultDigest(result, sha256), pubkey)).toBe(false);
    expect(verifyPlayerProof(key.pubkey, FIELDS, startSig)).toBe(false);
    expect(verifyPlayerProof(key.pubkey, FIELDS, resultSig)).toBe(false);
  });

  it("verifies nothing malformed, and never throws", () => {
    const key = loadPlayerKey(memoryStorage());
    const sig = key.signLobbyProof(FIELDS);
    for (const [pubkey, fields, proof] of [
      // No x-only key: x = 0 is on no point, and x >= p is no field element.
      ["00".repeat(32), FIELDS, sig],
      ["f".repeat(64), FIELDS, sig],
      ["AB".repeat(32), FIELDS, sig],
      [key.pubkey, FIELDS, sig.toUpperCase()],
      [key.pubkey, FIELDS, sig.slice(2)],
      [key.pubkey, { ...FIELDS, nonce: "5c" }, sig],
      [key.pubkey, { ...FIELDS, roomId: "x".repeat(256) }, sig],
    ] as const) {
      expect(verifyPlayerProof(pubkey, fields, proof)).toBe(false);
    }
  });

  it("is never imported by a module that renders", () => {
    expect(Object.keys(shown).length).toBeGreaterThan(0);
    for (const [path, source] of Object.entries(shown)) {
      expect(source.includes("player-key"), path).toBe(false);
    }
  });
});
