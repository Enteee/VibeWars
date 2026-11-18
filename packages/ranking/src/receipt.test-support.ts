import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { hashes, schnorr } from "@noble/secp256k1";

import type { ReceiptCrypto } from "./receipt.js";

// Signing is synchronous only with a synchronous sha256, as in the client.
hashes.sha256 = sha256;

/**
 * The curve code receipts are checked with in tests (ADR-0055), wired to
 * @noble as the client wires its player key: the real hash and the real
 * BIP-340 check, so a test signature is good for its key and digest alone.
 */
export const nobleReceiptCrypto: ReceiptCrypto = {
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
