import { afterEach, describe, expect, it, vi } from "vitest";

import { loadMuted, saveMuted } from "./mute-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe("the mute preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off until the player mutes, and survives a reload once they do", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadMuted()).toBe(false);
    saveMuted(true);
    expect(loadMuted()).toBe(true);
    saveMuted(false);
    expect(loadMuted()).toBe(false);
  });

  it("means sound on when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadMuted()).toBe(false);
    expect(() => {
      saveMuted(true);
    }).not.toThrow();
  });
});
