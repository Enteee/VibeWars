import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { DEFAULT_KEYMAP, KEYMAP_PRESETS } from "./keymap.js";
import { loadKeymap, saveKeymap } from "./keymap-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe("the keymap preference (#302)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is the default until one is saved, and survives a reload once it is", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadKeymap()).toBe(DEFAULT_KEYMAP);
    saveKeymap(KEYMAP_PRESETS.classic);
    expect(loadKeymap()).toEqual(KEYMAP_PRESETS.classic);
  });

  it("is the default, whole, when the stored value is not JSON or not a keymap", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem(`${STORAGE_NAMESPACE}.keymap`, "{not json");
    expect(loadKeymap()).toBe(DEFAULT_KEYMAP);
    storage.setItem(
      `${STORAGE_NAMESPACE}.keymap`,
      JSON.stringify({ ...KEYMAP_PRESETS.classic, mute: ["ControlLeft"] }),
    );
    expect(loadKeymap()).toBe(DEFAULT_KEYMAP);
  });

  it("is the default when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadKeymap()).toBe(DEFAULT_KEYMAP);
    expect(() => {
      saveKeymap(KEYMAP_PRESETS.classic);
    }).not.toThrow();
  });
});
