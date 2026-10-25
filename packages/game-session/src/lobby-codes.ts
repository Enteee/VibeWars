import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";

/**
 * A new lobby code from `random`, in [0, 1) (#379). In a page that is
 * `crypto.getRandomValues`: in peer-to-peer play the code is the room's
 * password, so a guessable one is an open door.
 */
export function generateLobbyCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
    code += LOBBY_CODE_ALPHABET[Math.floor(random() * LOBBY_CODE_ALPHABET.length)] ?? "A";
  }
  return code;
}
