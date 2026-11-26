import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { signetBits, signetParams, signetSvg, signetWord } from "./signet.js";

const KEY = "02" + "ab".repeat(32);

describe("signet", () => {
  it("is the same for the same key", () => {
    expect(signetWord(KEY)).toBe(signetWord(KEY));
    expect(signetSvg(signetParams(signetWord(KEY)), 16)).toBe(
      signetSvg(signetParams(signetWord(KEY)), 16),
    );
  });

  it("derives a fixed word from a fixed key (golden)", () => {
    expect(signetWord(KEY)).toBe(2269575928);
  });

  it("covers every field value and 900 of 1000 random keys differ", () => {
    const seen = new Set<string>();
    const values: Record<string, Set<number>> = {};
    for (let i = 0; i < 1000; i++) {
      const key = bytesToHex(
        Uint8Array.from({ length: 33 }, (_, j) => (i * 31 + j * 7 + (i >> 3) * j) & 255),
      );
      const p = signetParams(signetWord(key));
      seen.add(JSON.stringify(p));
      for (const [k, v] of Object.entries(p)) (values[k] ??= new Set()).add(v);
    }
    expect(seen.size).toBeGreaterThanOrEqual(900);
    const sizes = { shape: 4, division: 8, ground: 4, ink: 4, charge: 8, chargeColour: 2 };
    for (const [k, n] of Object.entries(sizes)) expect(values[k]?.size).toBe(n);
  });

  it("params cover all 13 bits", () => {
    for (let word = 0; word < 1 << 13; word += 37) {
      expect(signetBits(signetParams(word))).toBe(word);
    }
    expect(signetBits(signetParams(0x1fff))).toBe(0x1fff);
  });

  it("draws an svg of the asked size", () => {
    const svg = signetSvg(signetParams(signetWord(KEY)), 11);
    expect(svg).toContain('width="11"');
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
