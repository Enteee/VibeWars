import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { loadShowCorpus, saveShowCorpus } from "./corpus-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe("the corpus preference (#1220)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off until the player turns it on, and survives a reload once they do", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadShowCorpus()).toBe(false);
    saveShowCorpus(true);
    expect(loadShowCorpus()).toBe(true);
    saveShowCorpus(false);
    expect(loadShowCorpus()).toBe(false);
  });

  it('reads any value but "true" as off', () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    for (const value of ["1", "TRUE", "yes", ""]) {
      storage.setItem(`${STORAGE_NAMESPACE}.showCorpus`, value);
      expect(loadShowCorpus()).toBe(false);
    }
  });

  it("means off when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadShowCorpus()).toBe(false);
    expect(() => {
      saveShowCorpus(true);
    }).not.toThrow();
  });
});
