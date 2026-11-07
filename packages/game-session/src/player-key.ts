/**
 * A player's key (#2706): one per browser, its identity. Game-session is
 * handed it, and the verifier, as `TicketKey` is: it carries no curve
 * code of its own, and never holds the secret half.
 */

/**
 * What a lobby proof names (#2706), each from the prover's or verifier's
 * own connection, never from the challenge: the host the joiner is
 * talking to, the joiner, the lobby's code, and the host's nonce.
 */
export interface LobbyProofFields {
  /** The host's transport id, as the joiner sees it: the host's own `selfId`. */
  readonly hostPeerId: string;
  /** The joiner's own transport `selfId`: the host's `from`. */
  readonly joinerPeerId: string;
  /** The lobby's code, as the joiner dialled it and the host hosts it. */
  readonly roomId: string;
  /** `PeerLobbyChallenge.nonce`: 64 lowercase hex digits. */
  readonly nonce: string;
}

/**
 * A player key, the secret half shut inside: it signs only what one of
 * its purpose-named methods builds, under that purpose's own tag, so no
 * caller can have it sign arbitrary bytes.
 */
export interface PlayerKey {
  /** The x-only secp256k1 public key, as 64 lowercase hex digits. */
  readonly pubkey: string;
  /** A BIP-340 signature of the `vibewars/lobby-proof` digest of `fields`, as 128 lowercase hex digits. */
  signLobbyProof(fields: LobbyProofFields): string;
}

/**
 * Whether `sig` is `pubkey`'s lobby proof of `fields`. Total: anything
 * malformed, a key off the curve included, is simply not one.
 */
export type VerifyPlayerProof = (pubkey: string, fields: LobbyProofFields, sig: string) => boolean;
