import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCosmeticsStore } from "../cosmetics/store.js";
import { cosmeticsSection } from "./cosmetics-section.js";
import { FakeElement } from "./fake-dom.test-support.js";

/** The slots the section shows, mounted over an empty store, `wearsCape` as given. */
function slotsShown(wearsCape: boolean): string[] {
  const stored = new Map<string, string>();
  const store = createCosmeticsStore({
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  });
  const container = new FakeElement();
  cosmeticsSection(store, () => wearsCape).mount(container as unknown as HTMLElement);
  return container.all("cosmetics-slot").map((group) => group.dataset.slot ?? "");
}

describe("Options > Cosmetics (#3577)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers the emblem frame only to a player with a guild cape for it to frame (#3581)", () => {
    expect(slotsShown(true)).toContain("emblemFrame");
    expect(slotsShown(false)).not.toContain("emblemFrame");
    expect(slotsShown(false)).toContain("frame");
  });
});
