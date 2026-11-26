import { describe, expect, it } from "vitest";

import { PLAYER_ADJECTIVES, PLAYER_NOUNS, randomPlayerName } from "./player-names.js";

/** `values` in turn, round and round. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] ?? 0;
    i += 1;
    return value;
  };
}

describe("player names (#2653)", () => {
  it("has at least 40 unique capitalised words of at most 8 letters in each list", () => {
    for (const words of [PLAYER_ADJECTIVES, PLAYER_NOUNS]) {
      expect(words.length).toBeGreaterThanOrEqual(40);
      expect(new Set(words).size).toBe(words.length);
      for (const word of words) {
        expect(word).toMatch(/^[A-Z][a-z]{1,7}$/);
      }
    }
  });

  it("joins an adjective and a noun by `random`, the same each time", () => {
    expect(randomPlayerName(sequence(0, 0.999))).toBe(
      [PLAYER_ADJECTIVES[0], PLAYER_NOUNS.at(-1)].join(""),
    );
    expect(randomPlayerName(sequence(0.4, 0.6))).toBe(randomPlayerName(sequence(0.4, 0.6)));
  });
});
