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

const proofOf = (pubkey: string, fields: LobbyProofFields): string =>
  JSON.stringify([pubkey, fields.hostPeerId, fields.joinerPeerId, fields.roomId, fields.nonce]);

/** A key of `pubkey`, a fresh one by default. */
export function testPlayerKey(pubkey: string = randomHex(32)): PlayerKey {
  return {
    pubkey,
    signLobbyProof(fields) {
      const sig = randomHex(64);
      made.set(sig, proofOf(pubkey, fields));
      return sig;
    },
  };
}

export const verifyTestProof: VerifyPlayerProof = (pubkey, fields, sig) =>
  made.get(sig) === proofOf(pubkey, fields);
