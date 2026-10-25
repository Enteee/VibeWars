import { createRng, seedFromString } from "@vibewars/game-core";
import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, isLobbyCode } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { generateLobbyCode } from "./lobby-codes.js";

/** A seeded `random`, as a test wants it. */
function seeded(seed: number): () => number {
  const rng = createRng(seed);
  return () => rng.nextFloat();
}

describe("generateLobbyCode", () => {
  it("produces a code of the expected length from the code alphabet", () => {
    const code = generateLobbyCode(seeded(seedFromString("seed")));
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

  it("is deterministic for a given seed, so a match can be reproduced", () => {
    expect(generateLobbyCode(seeded(42))).toBe(generateLobbyCode(seeded(42)));
  });

  it("produces varied codes across draws rather than repeating one", () => {
    const random = seeded(seedFromString("variety"));
    const codes = new Set(Array.from({ length: 50 }, () => generateLobbyCode(random)));
    expect(codes.size).toBeGreaterThan(40);
  });

  it("uses the last letter of the alphabet too, for a draw just under 1", () => {
    expect(generateLobbyCode(() => 0.999999)).toBe(
      LOBBY_CODE_ALPHABET.at(-1)?.repeat(LOBBY_CODE_LENGTH),
    );
  });
});
