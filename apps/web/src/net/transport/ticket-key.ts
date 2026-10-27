/**
 * Random Arena ticket keys (ADR-0032 §5–§7): a throwaway secp256k1 key per
 * ticket, its x-only public key the ticket id, BIP-340 Schnorr signatures.
 * The one file that imports `@noble/secp256k1`; game-session is handed
 * these as functions, so it carries no curve code of its own.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { hashes, schnorr } from "@noble/secp256k1";
import type { TicketKey } from "@vibewars/game-session";

// `TicketKey.sign` is synchronous, and secp256k1 signs synchronously only
// with a sha256 of the same kind: WebCrypto's is async only.
hashes.sha256 = sha256;

const HEX = /^(?:[0-9a-f]{2})+$/;

/** A fresh key from the CSPRNG; the private half never leaves `sign`. */
export function newTicketKey(): TicketKey {
  const { secretKey, publicKey } = schnorr.keygen();
  return {
    ticketId: bytesToHex(publicKey),
    sign: (digest) => bytesToHex(schnorr.sign(digest, secretKey)),
  };
}

/**
 * Whether `sig` is `ticketId`'s signature of `digest`. Anything malformed,
 * a bad id or a signature of the wrong length, is simply not one.
 */
export function verifyTicketSig(ticketId: string, digest: Uint8Array, sig: string): boolean {
  if (!HEX.test(ticketId) || !HEX.test(sig)) {
    return false;
  }
  try {
    return schnorr.verify(hexToBytes(sig), digest, hexToBytes(ticketId));
  } catch {
    return false;
  }
}
