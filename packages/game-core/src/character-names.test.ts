import { describe, expect, it } from "vitest";

import {
  FIRST_NAMES,
  PLAYER_ADJECTIVES,
  PLAYER_NOUNS,
  SURNAMES,
  randomCharacterName,
  randomPlayerName,
} from "./character-names.js";

/** `values` in turn, round and round. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] ?? 0;
    i += 1;
    return value;
  };
}

/** The name drawn as the `first`th first name and the `last`th surname. */
function fullName(first: number, last: number): string {
  return [FIRST_NAMES[first], SURNAMES[last]].join(" ");
}

describe("character names (#1149)", () => {
  it("has 32 unique one-word names in each list", () => {
    for (const names of [FIRST_NAMES, SURNAMES]) {
      expect(names).toHaveLength(32);
      expect(new Set(names).size).toBe(32);
      for (const name of names) {
        expect(name).toMatch(/^[A-Z][a-z]{2,8}$/);
      }
    }
  });

  it("draws a first name, then a surname", () => {
    expect(randomCharacterName(() => 0, new Set())).toBe(fullName(0, 0));
    expect(randomCharacterName(sequence(0.9999999, 0.5), new Set())).toBe(fullName(31, 16));
  });

  it("skips a taken name, whatever its case", () => {
    const first = fullName(0, 0);
    const name = randomCharacterName(sequence(0, 0, 0.5, 0.5), new Set([first.toLowerCase()]));
    expect(name).toBe(fullName(16, 16));
  });

  it("still names a character when every name is taken", () => {
    const taken = new Set(
      FIRST_NAMES.flatMap((first) => SURNAMES.map((last) => `${first} ${last}`.toLowerCase())),
    );
    expect(randomCharacterName(() => 0.25, taken)).toBe(fullName(8, 8));
  });
});

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
