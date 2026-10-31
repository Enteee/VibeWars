import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";

/**
 * 230, ten times the alphabet's 23 (#1681): a byte at or above it is
 * drawn again, so every symbol is as likely.
 */
const UNBIASED_BYTES = 10 * LOBBY_CODE_ALPHABET.length;

/**
 * A new lobby key from `randomBytes` (#379, #1681). In a page that is
 * `crypto.getRandomValues`: the key is the lobby's only secret, so a
 * guessable one is an open door. Rejection sampling, never a float:
 * `byte % 23` of every byte would favour the first symbols.
 */
export function generateLobbyCode(randomBytes: (n: number) => Uint8Array): string {
  let code = "";
  while (code.length < LOBBY_CODE_LENGTH) {
    for (const byte of randomBytes(LOBBY_CODE_LENGTH - code.length)) {
      if (byte < UNBIASED_BYTES) {
        code += LOBBY_CODE_ALPHABET[byte % LOBBY_CODE_ALPHABET.length] ?? "";
      }
    }
  }
  return code;
}
