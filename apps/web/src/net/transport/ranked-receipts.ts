/**
 * Ranked receipts, published on Nostr (ADR-0055, #3680): every player of
 * a ranked match publishes the match's receipt, the host first, so a host
 * that vanishes does not lose it; and each round of a result it signs,
 * under an address of its own, as the evidence that it did sign.
 *
 * The event is signed by a key made for it alone, as a match record is:
 * the trust is in the player signatures inside the receipt, which anyone
 * checks with `validateReceipt`.
 */

import {
  MAX_RECEIPT_BYTES,
  ZERO_HASH,
  parseReceipt,
  receiptHash,
  type RankedReceipt,
  type Sha256,
} from "@vibewars/ranking";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";
import { MATCH_RECORD_EVENT_KIND, publishEvent } from "./match-records.js";
import { byteLength, signEvent, type NostrEvent } from "./nostr-relays.js";
import { newTicketKey } from "./ticket-key.js";

/** The tag every ranked receipt carries, for the leaderboard job (#3574) to ask for. */
export const RANKED_TOPIC = "vibewars-ranked";

/** Where the hash of this browser's last receipt is kept, beside its player key. */
const RANKED_PREV_KEY = `${STORAGE_NAMESPACE}.rankedPrev`;

const HEX_32 = /^[0-9a-f]{64}$/;

/** The `d` of match `matchId`'s receipt: one per match, every copy of it the same. */
export function receiptAddress(matchId: string): string {
  return `${RANKED_TOPIC}/${matchId}`;
}

/**
 * The `d` of `signer`'s partial receipt for the `round`th result it signed
 * in match `matchId`. Kind 30078 is replaceable per `d`, so every round
 * has its own: a later one must not replace an earlier one's evidence.
 */
export function partialAddress(matchId: string, round: number, signer: string): string {
  return `${receiptAddress(matchId)}/r${String(round)}/${signer}`;
}

/**
 * The `d` of `signer`'s own `host-left` receipt for match `matchId`: the
 * remaining players each publish one, for the job to merge.
 */
export function hostLeftAddress(matchId: string, signer: string): string {
  return `${receiptAddress(matchId)}/host-left/${signer}`;
}

/** `receipt` as a signed event under `address`, or `undefined` for one too big to publish. */
export function rankedReceiptEvent(
  receipt: RankedReceipt,
  address: string,
  now: number,
): NostrEvent | undefined {
  const content = JSON.stringify(receipt);
  if (byteLength(content) > MAX_RECEIPT_BYTES) {
    return undefined;
  }
  const key = newTicketKey();
  return signEvent(
    {
      pubkey: key.ticketId,
      created_at: Math.floor(now / 1000),
      kind: MATCH_RECORD_EVENT_KIND,
      tags: [
        ["d", address],
        ["t", RANKED_TOPIC],
      ],
      content,
    },
    (digest) => key.sign(digest),
  );
}

/**
 * The receipt `event` carries, or `undefined` for anything else: another
 * kind or topic, or a `d` that is neither its match's own address nor one
 * under it. Whether it is valid is `validateReceipt`'s question.
 */
export function parseRankedReceiptEvent(event: NostrEvent): RankedReceipt | undefined {
  const tag = (name: string): string | undefined =>
    event.tags.find((parts) => parts[0] === name)?.[1];
  if (event.kind !== MATCH_RECORD_EVENT_KIND || tag("t") !== RANKED_TOPIC) {
    return undefined;
  }
  const receipt = parseReceipt(event.content);
  const address = tag("d");
  if (receipt === undefined || address === undefined) {
    return undefined;
  }
  const own = receiptAddress(receipt.start.matchId);
  return address === own || address.startsWith(`${own}/`) ? receipt : undefined;
}

/** Send `receipt` to the relays under `address`, once; one too big is not sent. */
export function publishRankedReceipt(receipt: RankedReceipt, address: string): void {
  const event = rankedReceiptEvent(receipt, address, Date.now());
  if (event !== undefined) {
    publishEvent(event);
  }
}

/**
 * `receiptHash` of the last receipt `pubkey` published from this browser,
 * the next start's `prev`; `ZERO_HASH` for none, for one kept for another
 * key, or for anything malformed.
 */
export function loadRankedPrev(storage: Storage, pubkey: string): string {
  let stored: string | null = null;
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
