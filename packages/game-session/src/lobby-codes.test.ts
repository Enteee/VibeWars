import { createRng, seedFromString } from "@vibewars/game-core";
import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, isLobbyCode } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { generateLobbyCode } from "./lobby-codes.js";

/** Seeded random bytes, as a test wants them. */
function seeded(seed: number): (n: number) => Uint8Array {
  const rng = createRng(seed);
  return (n) => Uint8Array.from({ length: n }, () => Math.floor(rng.nextFloat() * 256));
}

/** These bytes, in order, then the test fails: no more were asked for. */
function bytes(...values: number[]): (n: number) => Uint8Array {
  return (n) => {
    if (values.length < n) {
      throw new Error(`asked for ${String(n)} bytes, ${String(values.length)} left`);
    }
    return Uint8Array.from(values.splice(0, n));
  };
}

describe("generateLobbyCode (#1681)", () => {
  it("is a 12-symbol key from the code alphabet", () => {
    const code = generateLobbyCode(seeded(seedFromString("seed")));
    expect(LOBBY_CODE_LENGTH).toBe(12);
    expect(code).toHaveLength(LOBBY_CODE_LENGTH);
    expect(isLobbyCode(code)).toBe(true);
  });

  it("uses only characters from the unambiguous alphabet", () => {
    const random = seeded(seedFromString("alphabet"));
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateLobbyCode(random)) {
        expect(LOBBY_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("produces varied codes across draws rather than repeating one", () => {
    const random = seeded(seedFromString("variety"));
    const codes = new Set(Array.from({ length: 50 }, () => generateLobbyCode(random)));
    expect(codes.size).toBe(50);
  });

  it("is byte % 23, and draws a byte of 230 or more again", () => {
    const last = LOBBY_CODE_ALPHABET.length - 1;
    // 229 = 9 × 23 + 22 is the last symbol; 230 and 255 are drawn again.
    const code = generateLobbyCode(
      bytes(0, 1, 22, 23, 229, 230, 255, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11),
    );
    expect(code).toBe(
      [0, 1, 22, 0, last, 2, 3, 4, 5, 6, 7, 8]
        .map((index) => LOBBY_CODE_ALPHABET[index] ?? "?")
        .join(""),
    );
  });
});
