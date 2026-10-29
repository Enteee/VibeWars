import { afterEach, describe, expect, it, vi } from "vitest";

import { isTouchOnly, needsTouchNotice } from "./touch-notice.js";
import { loadTouchNoticeDismissed, saveTouchNoticeDismissed } from "./touch-notice-preference.js";

/** `matchMedia` for a device that matches exactly `queries`. */
function device(...queries: string[]): (query: string) => boolean {
  return (query) => queries.includes(query);
}

const PHONE = device("(pointer: coarse)", "(hover: none)", "(any-pointer: coarse)");
const DESKTOP = device("(pointer: fine)", "(hover: hover)", "(any-pointer: fine)");
const TABLET_WITH_MOUSE = device(
  "(pointer: coarse)",
  "(hover: none)",
  "(any-pointer: coarse)",
  "(any-pointer: fine)",
);

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe("the keyboard-and-mouse notice (#1392)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is for a touch-only device: not a desktop, however narrow, nor a tablet with a mouse", () => {
    expect(isTouchOnly(PHONE)).toBe(true);
    // A narrow window changes no pointer query: width is never asked.
    expect(isTouchOnly(DESKTOP)).toBe(false);
    expect(isTouchOnly(TABLET_WITH_MOUSE)).toBe(false);
  });

  it("holds the menu back on a touch-only device until gone past once", () => {
    expect(needsTouchNotice(PHONE, () => false)).toBe(true);
    expect(needsTouchNotice(PHONE, () => true)).toBe(false);
    expect(needsTouchNotice(DESKTOP, () => false)).toBe(false);
  });

  it("remembers it was gone past, across a reload", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadTouchNoticeDismissed()).toBe(false);
    saveTouchNoticeDismissed();
    expect(loadTouchNoticeDismissed()).toBe(true);
  });

  it("shows again when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadTouchNoticeDismissed()).toBe(false);
    expect(() => {
      saveTouchNoticeDismissed();
    }).not.toThrow();
  });
});
