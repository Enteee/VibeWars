import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSfxVolume, parseSfxVolume, saveSfxVolume } from "./sfx-volume-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe("the sound effects volume preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is full until the player changes it, and survives a reload once they do", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadSfxVolume()).toBe(1);
    saveSfxVolume(0.35);
    expect(loadSfxVolume()).toBe(0.35);
    saveSfxVolume(0);
    expect(loadSfxVolume()).toBe(0);
  });

  it("reads anything that is not a number in 0–1 as full volume", () => {
    for (const text of [null, "", " ", "loud", "NaN", "Infinity", "-0.1", "1.5", "[0.5]"]) {
      expect(parseSfxVolume(text), String(text)).toBe(1);
    }
    expect(parseSfxVolume("0.5")).toBe(0.5);
  });

  it("means full volume when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadSfxVolume()).toBe(1);
    expect(() => {
      saveSfxVolume(0.2);
    }).not.toThrow();
  });
});
