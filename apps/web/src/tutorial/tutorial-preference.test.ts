import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";

import { loadTutorialRecord, saveTutorialRecord } from "./tutorial-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

describe("the tutorial record", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is absent until one is saved, then reads back", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadTutorialRecord()).toBeUndefined();
    saveTutorialRecord("skipped");
    expect(loadTutorialRecord()).toBe("skipped");
    saveTutorialRecord("done");
    expect(loadTutorialRecord()).toBe("done");
  });

  it("discards a value of another shape, which counts as absent", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem(`${STORAGE_NAMESPACE}.tutorial`, "finished");
    expect(loadTutorialRecord()).toBeUndefined();
    expect(storage.getItem(`${STORAGE_NAMESPACE}.tutorial`)).toBeNull();
  });

  it("counts a storage that throws as absent, and saving to it is no error", () => {
    const refusing = (): never => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: refusing, setItem: refusing, removeItem: refusing });
    expect(loadTutorialRecord()).toBeUndefined();
    expect(() => {
      saveTutorialRecord("done");
    }).not.toThrow();
  });
});
