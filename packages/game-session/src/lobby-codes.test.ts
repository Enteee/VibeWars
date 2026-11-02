import { createRng, seedFromString } from "@vibewars/game-core";
import { LOBBY_CODE_LENGTH, isLobbyCode } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { generateLobbyCode, lobbyKeyBytes } from "./lobby-codes.js";

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

describe("generateLobbyCode (#2100)", () => {
  it("is a 43-character lobby key", () => {
    const code = generateLobbyCode(seeded(seedFromString("seed")));
    expect(LOBBY_CODE_LENGTH).toBe(43);
    expect(code).toHaveLength(LOBBY_CODE_LENGTH);
    expect(isLobbyCode(code)).toBe(true);
  });

  it("is always a key, whatever the bytes", () => {
    const random = seeded(seedFromString("many"));
    for (let i = 0; i < 200; i += 1) {
      expect(isLobbyCode(generateLobbyCode(random))).toBe(true);
    }
  });

  it("draws 32 bytes, once", () => {
    expect(generateLobbyCode(bytes(...Array.from({ length: 32 }, () => 255)))).toBe(
      `${"_".repeat(42)}8`,
    );
  });

  it("is the bytes as base64url, and they come back", () => {
    const values = Array.from({ length: 32 }, (_, i) => i);
    const code = generateLobbyCode(bytes(...values));
    expect(code).toBe("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
    expect(Array.from(lobbyKeyBytes(code))).toEqual(values);
  });

  it("gives a different key each time", () => {
    const random = seeded(seedFromString("unique"));
    const codes = new Set(Array.from({ length: 50 }, () => generateLobbyCode(random)));
    expect(codes.size).toBe(50);
  });
});
