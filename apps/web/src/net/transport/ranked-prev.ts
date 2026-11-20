/**
 * The chain of ranked receipts (ADR-0055, #3680): each start a player
 * signs names, as `prev`, the hash of the last receipt it published. Kept
 * apart from `ranked-receipts.ts`, which e2e loads without the build's
 * storage namespace.
 */

import { ZERO_HASH, receiptHash, type RankedReceipt, type Sha256 } from "@vibewars/ranking";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";

/** Where the hash of this browser's last receipt is kept, beside its player key. */
const RANKED_PREV_KEY = `${STORAGE_NAMESPACE}.rankedPrev`;

const HEX_32 = /^[0-9a-f]{64}$/;

/**
 * `receiptHash` of the last receipt `pubkey` published from this browser,
 * the next start's `prev`; `ZERO_HASH` for none, for one kept for another
 * key, or for anything malformed.
 */
export function loadRankedPrev(storage: Storage, pubkey: string): string {
  let stored: string | null;
  try {
    stored = storage.getItem(RANKED_PREV_KEY);
  } catch {
    return ZERO_HASH;
  }
  if (stored === null) {
    return ZERO_HASH;
  }
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return ZERO_HASH;
  }
  if (typeof value !== "object" || value === null) {
    return ZERO_HASH;
  }
  const { pubkey: kept, prev } = value as Record<string, unknown>;
  return kept === pubkey && typeof prev === "string" && HEX_32.test(prev) ? prev : ZERO_HASH;
}

/** Keep `receipt`'s hash as `pubkey`'s next `prev`. Storage that cannot be written forgets it. */
export function saveRankedPrev(
  storage: Storage,
  pubkey: string,
  receipt: RankedReceipt,
  sha256: Sha256,
): void {
  try {
    storage.setItem(
      RANKED_PREV_KEY,
      JSON.stringify({ pubkey, prev: receiptHash(receipt, sha256) }),
    );
  } catch {
    // Private browsing can throw: the chain starts again from zero.
  }
}
