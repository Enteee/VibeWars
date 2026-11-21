/**
 * The player key (#2706): one long-lived secp256k1 key per browser, the
 * player's identity, kept in localStorage. Its secret half stays in this
 * module: it is never rendered, logged, sent or put in a URL, and the
 * `PlayerKey` handed out signs only digests built here or in
 * `@vibewars/ranking`, each under its purpose's own BIP-340 tag. A key of
 * its own, never the ticket key's.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { hashes, schnorr, utils } from "@noble/secp256k1";
import { MAX_COSMETIC_IDS, MAX_COSMETIC_ID_LENGTH } from "@vibewars/game-protocol";
import type { CosmeticSelection, LobbyProofFields, PlayerKey } from "@vibewars/game-session";
import { resultDigest, startDigest, type ReceiptCrypto } from "@vibewars/ranking";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";

import { WORK_BITS } from "./ranked-work.js";

// `PlayerKey`'s signing is synchronous, and secp256k1 signs synchronously
// only with a sha256 of the same kind: WebCrypto's is async only.
hashes.sha256 = sha256;

const PLAYER_KEY = `${STORAGE_NAMESPACE}.playerKey`;
const LOBBY_PROOF_TAG = "vibewars/lobby-proof";
const COSMETICS_TAG = "vibewars/cosmetics";
const HEX_32 = /^[0-9a-f]{64}$/;
const HEX_64 = /^[0-9a-f]{128}$/;

/** BIP-340's tagged hash: `sha256(sha256(tag) ‖ sha256(tag) ‖ message)`. */
function taggedHash(tag: string, message: Uint8Array): Uint8Array {
  const tagHash = sha256(utf8ToBytes(tag));
  return sha256(concatBytes(tagHash, tagHash, message));
}

/**
 * The lobby proof's digest: each variable field after its one-byte
 * length, so no two sets of fields read the same; `undefined` for fields
 * that cannot be, a field over 255 bytes or a key or nonce not 32.
 */
function lobbyProofDigest(pubkey: string, fields: LobbyProofFields): Uint8Array | undefined {
  if (!HEX_32.test(pubkey) || !HEX_32.test(fields.nonce)) {
    return undefined;
  }
  const parts: Uint8Array[] = [];
  for (const field of [fields.hostPeerId, fields.joinerPeerId, fields.roomId]) {
    const bytes = utf8ToBytes(field);
    if (bytes.length > 255) {
      return undefined;
    }
    parts.push(Uint8Array.of(bytes.length), bytes);
  }
  return taggedHash(
    LOBBY_PROOF_TAG,
    concatBytes(...parts, hexToBytes(pubkey), hexToBytes(fields.nonce)),
  );
}

/**
 * A cosmetic selection's digest (ADR-0056): the key, `at` as eight bytes,
 * then each id after its one-byte length; `undefined` for a selection no
 * key can sign, too many or too long ids, or an `at` that is not a
 * whole, non-negative ms count.
 */
function cosmeticsDigest(selection: CosmeticSelection): Uint8Array | undefined {
  const { pubkey, ids, at } = selection;
  if (
    !HEX_32.test(pubkey) ||
    ids.length > MAX_COSMETIC_IDS ||
    !Number.isSafeInteger(at) ||
    at < 0
  ) {
    return undefined;
  }
  const parts: Uint8Array[] = [Uint8Array.of(ids.length)];
  for (const id of ids) {
    const bytes = utf8ToBytes(id);
    if (id.length > MAX_COSMETIC_ID_LENGTH || bytes.length > 255) {
      return undefined;
    }
    parts.push(Uint8Array.of(bytes.length), bytes);
  }
  const time = new Uint8Array(8);
  new DataView(time.buffer).setBigUint64(0, BigInt(at));
  return taggedHash(COSMETICS_TAG, concatBytes(hexToBytes(pubkey), time, ...parts));
}

function keyOf(secretKey: Uint8Array): PlayerKey {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  return {
    pubkey,
    signLobbyProof: (fields) => {
      const digest = lobbyProofDigest(pubkey, fields);
      if (digest === undefined) {
        throw new Error("a lobby proof of fields no proof can name");
      }
      return bytesToHex(schnorr.sign(digest, secretKey));
    },
    signRankedStart: (start) => bytesToHex(schnorr.sign(startDigest(start, sha256), secretKey)),
    signRankedResult: (result) => bytesToHex(schnorr.sign(resultDigest(result, sha256), secretKey)),
    signCosmetics: (selection) => {
      const digest = selection.pubkey === pubkey ? cosmeticsDigest(selection) : undefined;
      if (digest === undefined) {
        throw new Error("a cosmetic selection no key of this one can sign");
      }
      return bytesToHex(schnorr.sign(digest, secretKey));
    },
  };
}

/**
 * This browser's player key: the one in `storage`, or, for none or a
 * malformed one, a fresh one put there. Storage that cannot be read or
 * written still gets a key, for this page alone.
 */
export function loadPlayerKey(storage: Storage): PlayerKey {
  let stored: string | null = null;
  try {
    stored = storage.getItem(PLAYER_KEY);
  } catch {
    // Private browsing can throw on access: a key for this page alone.
  }
  if (stored !== null && HEX_32.test(stored)) {
    const secretKey = hexToBytes(stored);
    if (utils.isValidSecretKey(secretKey)) {
      return keyOf(secretKey);
    }
  }
  const { secretKey } = schnorr.keygen();
  try {
    storage.setItem(PLAYER_KEY, bytesToHex(secretKey));
  } catch {
    // Not remembered: the next page makes another.
  }
  return keyOf(secretKey);
}

/**
 * The curve code ranked receipts are checked with (ADR-0055, #3680): the
 * hash player keys sign with, and BIP-340's check. Total, as
 * `verifyPlayerProof` is. A stamp needs `WORK_BITS` (#3746).
 */
export const receiptCrypto: ReceiptCrypto = {
  workBits: WORK_BITS,
  sha256,
  verify: (pubkey, digest, sig) => {
    if (!HEX_32.test(pubkey) || !HEX_64.test(sig)) {
      return false;
    }
    try {
      return schnorr.verify(hexToBytes(sig), digest, hexToBytes(pubkey));
    } catch {
      return false;
    }
  },
};

/**
 * Whether `sig` is `pubkey`'s lobby proof of `fields`. Total: anything
 * malformed, a key off the curve included, is simply not one.
 */
export function verifyPlayerProof(pubkey: string, fields: LobbyProofFields, sig: string): boolean {
  const digest = lobbyProofDigest(pubkey, fields);
  if (digest === undefined || !HEX_64.test(sig)) {
    return false;
  }
  try {
    return schnorr.verify(hexToBytes(sig), digest, hexToBytes(pubkey));
  } catch {
    return false;
  }
}

/**
 * Whether `sig` is `selection.pubkey`'s signature of `selection`
 * (ADR-0056). Total, as `verifyPlayerProof` is.
 */
export function verifyCosmetics(selection: CosmeticSelection, sig: string): boolean {
  const digest = cosmeticsDigest(selection);
  if (digest === undefined || !HEX_64.test(sig)) {
    return false;
  }
  try {
    return schnorr.verify(hexToBytes(sig), digest, hexToBytes(selection.pubkey));
  } catch {
    return false;
  }
}
