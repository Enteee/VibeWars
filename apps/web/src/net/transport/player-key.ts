/**
 * The player key (#2706): one long-lived secp256k1 key per browser, the
 * player's identity, kept in localStorage. Its secret half stays in this
 * module: it is never rendered, logged, sent or put in a URL, and the
 * `PlayerKey` handed out signs only digests built here, each under its
 * purpose's own BIP-340 tag. A key of its own, never the ticket key's.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { hashes, schnorr, utils } from "@noble/secp256k1";
import type { LobbyProofFields, PlayerKey } from "@vibewars/game-session";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";

// `PlayerKey`'s signing is synchronous, and secp256k1 signs synchronously
// only with a sha256 of the same kind: WebCrypto's is async only.
hashes.sha256 = sha256;

const PLAYER_KEY = `${STORAGE_NAMESPACE}.playerKey`;
const LOBBY_PROOF_TAG = "vibewars/lobby-proof";
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
