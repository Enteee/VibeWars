/**
 * A relay login sealed to one joiner (#2527, ADR-0049): ECDH P-256 with a
 * fresh ephemeral key per seal, HKDF-SHA256, AES-256-GCM. Only the
 * joiner's private key, which never leaves its page's memory, opens it.
 * WebCrypto only, and nothing here logs a key, a seal or a login.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  credentialExpiry,
  TURN_CREDENTIAL_TTL_MS,
  validateTurnConfig,
  type TurnConfig,
} from "./turn-config.js";

/** HKDF's fixed `info`: a key derived here is for this and nothing else. */
const SEAL_INFO = new TextEncoder().encode("vibewars relay-seal");

/** A raw uncompressed P-256 public key's length. */
const PUB_BYTES = 65;
const IV_BYTES = 12;

/** How far past a fresh login's expiry a sealed one's may lie: clocks differ a little. */
const EXPIRY_SLACK_MS = 60 * 1000;

/** The longest holder name opened (#2527): the lobby's names are shorter. */
export const MAX_SEAL_NAME = 40;
/** The longest holder peer id opened. */
export const MAX_SEAL_HOLDER = 64;

/** What a seal carries: a login for its joiner, and whose relay it is. */
export interface RelayOffer {
  readonly config: TurnConfig;
  /** The holder's peer id: one offer per holder is kept. */
  readonly holder: string;
  /** The holder's lobby name, untrusted text: render it as text only. */
  readonly name: string;
}

/** A sealed offer as it goes over Nostr, inside the lobby-key layer. */
export interface RelaySeal {
  /** The first 16 bytes of SHA-256 of the joiner's raw public key, hex. */
  readonly to: string;
  /** The seal's own ephemeral raw public key, base64url. */
  readonly epk: string;
  readonly iv: string;
  readonly ct: string;
}

/** A joiner's key pair for one page (#2527): the private key cannot be exported. */
export interface JoinerKey {
  readonly privateKey: CryptoKey;
  /** The raw public key, base64url: what its ask carries. */
  readonly pub: string;
  /** `recipientTag(pub)`: what a seal for it says in `to`. */
  readonly to: string;
}

export function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    return undefined;
  }
  try {
    return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    return undefined;
  }
}

/** What a seal for the raw public key `pub` (base64url) names in `to`: SHA-256 of its bytes, cut to 16. */
export function recipientTag(pub: string): string {
  return bytesToHex(sha256(fromBase64Url(pub) ?? new Uint8Array(0)).subarray(0, 16));
}

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

/** A fresh joiner key pair, in memory only. */
export async function newJoinerKey(): Promise<JoinerKey> {
  const pair = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  const pub = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  return { privateKey: pair.privateKey, pub, to: recipientTag(pub) };
}

/** The AES-256-GCM key `privateKey` and `publicKey` agree on. */
async function sealKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  usage: "encrypt" | "decrypt",
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: SEAL_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function importPub(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, ECDH, false, []);
}

/** `offer` sealed to the joiner whose raw public key is `pub`, under a fresh ephemeral key. */
export async function sealRelayOffer(
  offer: RelayOffer,
  pub: string,
  iv: Uint8Array<ArrayBuffer>,
): Promise<RelaySeal> {
  const raw = fromBase64Url(pub);
  if (raw?.length !== PUB_BYTES) {
    throw new Error("not a P-256 public key");
  }
  const ephemeral = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  const key = await sealKey(ephemeral.privateKey, await importPub(raw), "encrypt");
  const { urls, username, credential } = offer.config;
  const plain = new TextEncoder().encode(
    JSON.stringify({ urls, username, credential, holder: offer.holder, name: offer.name }),
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return {
    to: recipientTag(pub),
    epk: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey))),
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
  };
}

/**
 * `seal`, opened with `key` at `nowMs`, or `undefined`: one for another
 * key (skipped before any ECDH), one that does not open, or whose content
 * is not a valid login for `peerId` that is live and lasts no longer than
 * a fresh one could, from a holder of a sane id and name.
 */
export async function openRelaySeal(
  seal: RelaySeal,
  key: JoinerKey,
  peerId: string,
  nowMs: number,
): Promise<RelayOffer | undefined> {
  if (seal.to !== key.to) {
    return undefined;
  }
  const epk = fromBase64Url(seal.epk);
  const iv = fromBase64Url(seal.iv);
  const ct = fromBase64Url(seal.ct);
  if (epk?.length !== PUB_BYTES || iv?.length !== IV_BYTES || ct === undefined) {
    return undefined;
  }
  try {
    const aes = await sealKey(key.privateKey, await importPub(epk), "decrypt");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, ct);
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const { urls, username, credential, holder, name } = value as Record<string, unknown>;
    const config = validateTurnConfig({ urls, username, credential });
    if (
      config === undefined ||
      typeof holder !== "string" ||
      holder.length === 0 ||
      holder.length > MAX_SEAL_HOLDER ||
      typeof name !== "string" ||
      name.length > MAX_SEAL_NAME ||
      !config.username.endsWith(`:${peerId}`)
    ) {
      return undefined;
    }
    const expiry = credentialExpiry(config);
    if (
      expiry === undefined ||
      expiry <= nowMs ||
      expiry > nowMs + TURN_CREDENTIAL_TTL_MS + EXPIRY_SLACK_MS
    ) {
      return undefined;
    }
    return { config, holder, name };
  } catch {
    return undefined;
  }
}

/** What an offer ranks by: SHA-256(roomId + "\n" + its first URL), hex. */
function rankKey(roomId: string, offer: RelayOffer): string {
  return bytesToHex(sha256(new TextEncoder().encode(`${roomId}\n${offer.config.urls[0] ?? ""}`)));
}

/**
 * `offers` in the order every client tries them (#2527): by
 * SHA-256(roomId + "\n" + first URL) ascending, ties by holder peer id.
 * Pure: the same set gives the same order in any input order. Not a
 * defence: a sealer picks its URL, so it can grind one that ranks first.
 */
export function rankOffers(roomId: string, offers: readonly RelayOffer[]): RelayOffer[] {
  const keyed = offers.map((offer) => ({ offer, key: rankKey(roomId, offer) }));
  keyed.sort((a, b) =>
    a.key !== b.key
      ? a.key < b.key
        ? -1
        : 1
      : a.offer.holder < b.offer.holder
        ? -1
        : a.offer.holder > b.offer.holder
          ? 1
          : 0,
  );
  return keyed.map(({ offer }) => offer);
}
