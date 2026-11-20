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

import { MAX_RECEIPT_BYTES, parseReceipt, type RankedReceipt } from "@vibewars/ranking";

import { MATCH_RECORD_EVENT_KIND, publishEvent } from "./match-records.js";
import { byteLength, signEvent, type NostrEvent } from "./nostr-relays.js";
import { newTicketKey } from "./ticket-key.js";

/** The tag every ranked receipt carries, for the leaderboard job (#3574) to ask for. */
export const RANKED_TOPIC = "vibewars-ranked";

/**
 * The character id a ranked receipt names for a player with no character,
 * who plays a host starter. Rating is per player key: the id only labels it.
 */
export const RANKED_STARTER_ID = "starter";

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
