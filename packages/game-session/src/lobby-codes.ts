import { LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";

/** A lobby key's 32 bytes, 256 bits (#2100, ADR-0048). */
export const LOBBY_KEY_BYTES = 32;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** `bytes` as base64url without padding. */
function base64url(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let out = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += BASE64URL[(buffer >> bits) & 63] ?? "";
    }
  }
  if (bits > 0) out += BASE64URL[(buffer << (6 - bits)) & 63] ?? "";
  return out;
}

/**
 * A lobby key's bytes back from its text, which `isLobbyCode` has
 * already accepted.
 */
export function lobbyKeyBytes(code: string): Uint8Array {
  const bytes = new Uint8Array(LOBBY_KEY_BYTES);
  let bits = 0;
  let buffer = 0;
  let at = 0;
  for (const char of code) {
    buffer = ((buffer << 6) | BASE64URL.indexOf(char)) & 0xfff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (at < bytes.length) bytes[at++] = (buffer >> bits) & 255;
    }
  }
  return bytes;
}

/**
 * A new lobby key from `randomBytes` (#379, #2100). In a page that is
 * `crypto.getRandomValues`: the key is the lobby's only secret, so a
 * guessable one is an open door. 32 bytes as base64url: 43 characters
 * nobody types, carried in an invite URL.
 */
export function generateLobbyCode(randomBytes: (n: number) => Uint8Array): string {
  const code = base64url(randomBytes(LOBBY_KEY_BYTES));
  if (code.length !== LOBBY_CODE_LENGTH) throw new Error("short random source");
  return code;
}
