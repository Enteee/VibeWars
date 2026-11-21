import { sha256 } from "@noble/hashes/sha2.js";
import { findWork, resultDigest, startDigest, type ReceiptCrypto } from "@vibewars/ranking";

import type { LobbyProofFields, PlayerKey, VerifyPlayerProof } from "./player-key.js";

/**
 * Player keys for tests (#2706), with no curve code: a key's "signature"
 * is fresh random hex, and the verifier looks up what it was made of.
 * Each signature is good for its key and its fields alone, as a real one.
 */
const made = new Map<string, string>();

const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const proofOf = (pubkey: string, fields: LobbyProofFields): string =>
  JSON.stringify([pubkey, fields.hostPeerId, fields.joinerPeerId, fields.roomId, fields.nonce]);

/** What a ranked signature (ADR-0055) is of: its key and the digest, already tagged. */
const digestOf = (pubkey: string, digest: Uint8Array): string =>
  JSON.stringify(["ranked", pubkey, hex(digest)]);

/** A fresh signature of `pubkey` over `digest`, which `testReceiptCrypto` verifies. */
function signDigest(pubkey: string, digest: Uint8Array): string {
  const sig = randomHex(64);
  made.set(sig, digestOf(pubkey, digest));
  return sig;
}

/** A key of `pubkey`, a fresh one by default. */
export function testPlayerKey(pubkey: string = randomHex(32)): PlayerKey {
  return {
    pubkey,
    signLobbyProof(fields) {
      const sig = randomHex(64);
      made.set(sig, proofOf(pubkey, fields));
      return sig;
    },
    signRankedStart: (start) => signDigest(pubkey, startDigest(start, sha256)),
    signRankedResult: (result) => signDigest(pubkey, resultDigest(result, sha256)),
  };
}

/** The stamp bits tests ask for (#3746): 16 hashes or so, not millions. */
export const TEST_WORK_BITS = 4;

/** `pubkey`'s stamp of `TEST_WORK_BITS` for the start `startHash`: one long search. */
export function testWork(startHash: string, pubkey: string): string {
  const found = findWork(startHash, pubkey, sha256, {
    from: 0,
    budgetMs: Number.POSITIVE_INFINITY,
    now: () => 0,
    bits: TEST_WORK_BITS,
  });
  if (!("work" in found)) {
    throw new Error("an unbounded search always ends in a stamp");
  }
  return found.work;
}

export const verifyTestProof: VerifyPlayerProof = (pubkey, fields, sig) =>
  made.get(sig) === proofOf(pubkey, fields);

/**
 * What ranked receipts are checked with in tests (#3573): the real sha256,
 * so digests and hashes are the client's, and the test keys' signatures.
 */
export const testReceiptCrypto: ReceiptCrypto = {
  workBits: TEST_WORK_BITS,
  sha256,
  verify: (pubkey, digest, sig) => made.get(sig) === digestOf(pubkey, digest),
};
