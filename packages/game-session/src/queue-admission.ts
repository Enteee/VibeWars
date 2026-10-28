/**
 * Admission to a queued lobby (#871, ADR-0032 §6): what a joiner and the
 * host sign to prove their tickets to each other. Host and joiner both
 * call `admissionDigest`, so they cannot disagree on the layout. Nothing
 * secret is sent: each side signs with its ticket key, and the signature
 * names the group, the planned host and the joiner's peer id, so it is
 * good for that seat alone. game-session has no secp256k1 of its own; the
 * caller injects the verifying, and signs with its `TicketKey`.
 */

import type { FormedGroup } from "./queue-formation.js";
import type { TicketKey } from "./queue-client.js";

/**
 * Whose proof a digest is for: a joiner's, the host's welcome to one, or a
 * party member's consent to the party (#1078), which signs
 * `("vibewars-party", groupId, memberKey, "")`: the group it won.
 */
export type AdmissionTag = "vibewars-admit" | "vibewars-host" | "vibewars-party";

/**
 * Whether `sig`, 128 hex digits, is a BIP-340 signature of `digest` by
 * the key whose x-only public key is `ticketId`. Never throws: anything
 * malformed is `false`.
 */
export type VerifyTicketSig = (ticketId: string, digest: Uint8Array, sig: string) => boolean;

/** A queued lobby's seat, as its holder brings it to the lobby, host or joiner. */
export interface QueuedSeat {
  readonly group: FormedGroup;
  /** This player's own seat key: one of `group`'s teams', the host ticket's for the host. */
  readonly key: TicketKey;
  readonly verifyTicketSig: VerifyTicketSig;
}

/**
 * What `admissionDigest` hashes: `tag ‖ len(groupId) ‖ groupId ‖
 * len(hostTicketId) ‖ hostTicketId ‖ len(peerId) ‖ peerId`, each `len` the
 * field's UTF-8 byte count as 4 bytes big-endian, so no two splits of the
 * same characters collide. For a caller that must hash it at once, as the
 * queue board does (#1078); everyone else calls `admissionDigest`.
 */
export function admissionBytes(
  tag: AdmissionTag,
  groupId: string,
  hostTicketId: string,
  peerId: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const fields = [groupId, hostTicketId, peerId].map((field) => encoder.encode(field));
  const head = encoder.encode(tag);
  const bytes = new Uint8Array(
    head.length + fields.reduce((total, field) => total + 4 + field.length, 0),
  );
  bytes.set(head);
  const view = new DataView(bytes.buffer);
  let at = head.length;
  for (const field of fields) {
    view.setUint32(at, field.length);
    bytes.set(field, at + 4);
    at += 4 + field.length;
  }
  return bytes;
}

/** `sha256` of `admissionBytes`. */
export async function admissionDigest(
  tag: AdmissionTag,
  groupId: string,
  hostTicketId: string,
  peerId: string,
): Promise<Uint8Array> {
  const bytes = admissionBytes(tag, groupId, hostTicketId, peerId);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
