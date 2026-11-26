import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { hashes, schnorr } from "@noble/secp256k1";

import { findWork, type ReceiptCrypto, type ResultSignature } from "./receipt.js";

// Signing is synchronous only with a synchronous sha256, as in the client.
hashes.sha256 = sha256;

/** The stamp bits the tests ask for: 16 hashes or so, not millions. */
export const TEST_WORK_BITS = 4;

/**
 * The curve code receipts are checked with in tests (ADR-0055), wired to
 * @noble as the client wires its player key: the real hash and the real
 * BIP-340 check, so a test signature is good for its key and digest alone.
 */
export const nobleReceiptCrypto: ReceiptCrypto = {
  workBits: TEST_WORK_BITS,
  sha256,
  verify: (pubkey, digest, sig) => {
    try {
      return schnorr.verify(hexToBytes(sig), digest, hexToBytes(pubkey));
    } catch {
      return false;
    }
  },
};

/** A fresh key that signs any digest it is handed: the tests' seats. */
export interface TestSigner {
  readonly pubkey: string;
  sign(digest: Uint8Array): string;
}

export function testSigner(): TestSigner {
  const { secretKey, publicKey } = schnorr.keygen();
  return {
    pubkey: bytesToHex(publicKey),
    sign: (digest) => bytesToHex(schnorr.sign(digest, secretKey)),
  };
}

/** A stamp for `pubkey` under start `started` with `bits` zero bits: one long search. */
export function testWork(started: string, pubkey: string, bits: number = TEST_WORK_BITS): string {
  const found = findWork(started, pubkey, sha256, {
    from: 0,
    budgetMs: Number.POSITIVE_INFINITY,
    now: () => 0,
    bits,
  });
  if (!("work" in found)) {
    throw new Error("an unbounded search always ends in a stamp");
  }
  return found.work;
}

/** `signer`'s result signature of `digest` under start `started`, stamped with `TEST_WORK_BITS`. */
export function testResultSig(
  signer: TestSigner,
  started: string,
  digest: Uint8Array,
): ResultSignature {
  return { sig: signer.sign(digest), work: testWork(started, signer.pubkey) };
}
