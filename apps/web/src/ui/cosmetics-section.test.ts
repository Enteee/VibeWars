import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COSMETIC_CATALOG, type CosmeticEntry } from "../cosmetics/catalog.js";
import { createCosmeticsStore, type CosmeticsStore } from "../cosmetics/store.js";
import {
  cosmeticsSection,
  requirementText,
  swatchStyle,
  type SwatchCape,
} from "./cosmetics-section.js";
import { FakeElement, type FakeEvent } from "./fake-dom.test-support.js";

const CAPE: SwatchCape = { main: "203040", trim: "c0a060" };

/** A store over its own empty storage. */
function emptyStore(): CosmeticsStore {
  const stored = new Map<string, string>();
  return createCosmeticsStore({
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  });
}

/** The section mounted over `store`, the player wearing `cape`. */
function mounted(store: CosmeticsStore, cape: SwatchCape | null = CAPE): FakeElement {
  const container = new FakeElement();
  cosmeticsSection(store, () => cape).mount(container as unknown as HTMLElement);
  return container;
}

/** `slot`'s row as mounted. */
function slotOf(container: FakeElement, slot: string): FakeElement {
  const group = container.all("cosmetics-slot").find((each) => each.dataset.slot === slot);
  if (group === undefined) {
    throw new Error(`no ${slot} slot`);
  }
  return group;
}

/** The first catalog entry of `slot`. */
function firstOf(slot: string): CosmeticEntry {
  const entry = COSMETIC_CATALOG.find((each) => each.slot === slot);
  if (entry === undefined) {
    throw new Error(`no ${slot} item`);
  }
  return entry;
}

/** `key` pressed on `target`, as the row hears it. */
function press(row: FakeElement, target: FakeElement, key: string): void {
  const event: FakeEvent = {
    key,
    target,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  };
  for (const listener of row.listeners.get("keydown") ?? []) {
    listener(event);
  }
}

describe("Options > Cosmetics (#3577, #3988)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers the emblem frame only to a player with a guild cape for it to frame (#3581)", () => {
    const slots = (cape: SwatchCape | null): (string | undefined)[] =>
      mounted(emptyStore(), cape)
        .all("cosmetics-slot")
        .map((group) => group.dataset.slot);
    expect(slots(CAPE)).toContain("emblemFrame");
    expect(slots(null)).not.toContain("emblemFrame");
    expect(slots(null)).toContain("frame");
  });

  it("shows each slot as one row: None, then a swatch per item", () => {
    const container = mounted(emptyStore());
    for (const group of container.all("cosmetics-slot")) {
      const items = COSMETIC_CATALOG.filter((entry) => entry.slot === group.dataset.slot);
      expect(group.all("cosmetics-row")).toHaveLength(1);
      const swatches = group.all("cosmetics-swatch").map((swatch) => swatch.dataset.item);
      expect(swatches).toEqual(["none", ...items.map((entry) => entry.id)]);
    }
    // A slot of one item is still a row: None, and that one.
    expect(slotOf(container, "flame").all("cosmetics-swatch")).toHaveLength(2);
  });

  it("disables a locked swatch, and dims it with a lock, unless it is picked", () => {
    const store = emptyStore();
    const entry = firstOf("aura");
    const swatchOf = (): FakeElement | undefined =>
      slotOf(mounted(store), "aura")
        .all("cosmetics-swatch")
        .find((swatch) => swatch.dataset.item === entry.id);
    // No leaderboard entry known: everything is still to earn.
    expect(swatchOf()?.disabled).toBe(true);
    expect(swatchOf()?.all("cosmetics-swatch-lock")).toHaveLength(1);
    // Picked while earned, then lost: still picked, still unpickable anew.
    store.pick("aura", entry.id);
    expect(swatchOf()?.disabled).toBe(false);
    expect(swatchOf()?.classList.contains("locked")).toBe(true);
    expect(swatchOf()?.getAttribute("aria-pressed")).toBe("true");
  });

  it("picks the swatch clicked", () => {
    const store = emptyStore();
    const entry = firstOf("frame");
    store.pick("frame", entry.id);
    const none = slotOf(mounted(store), "frame").all("cosmetics-swatch")[0];
    none?.click();
    expect(store.choice().frame).toBeUndefined();
  });

  it("names the focused swatch's item and what earns it under the row, else the picked one", () => {
    const group = slotOf(mounted(emptyStore()), "aura");
    const entry = firstOf("aura");
    const detail = group.all("cosmetics-detail")[0];
    expect(detail?.textContent).toBe("None");
    const swatch = group.all("cosmetics-swatch")[1];
    swatch?.fire("focus");
    expect(detail?.textContent).toContain(requirementText(entry));
    expect(detail?.textContent).toContain("Locked");
    expect(swatch?.getAttribute("aria-label")).toBe(detail?.textContent);
    swatch?.fire("blur");
    expect(detail?.textContent).toBe("None");
  });

  it("is one tab stop per row, the arrows moving along it past locked swatches", () => {
    const store = emptyStore();
    const entry = firstOf("frame");
    store.pick("frame", entry.id);
    const group = slotOf(mounted(store), "frame");
    const row = group.all("cosmetics-row")[0];
    const swatches = group.all("cosmetics-swatch");
    const none = swatches[0];
    const picked = swatches.find((swatch) => swatch.dataset.item === entry.id);
    if (row === undefined || none === undefined || picked === undefined) {
      throw new Error("no frame row");
    }
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([picked]);
    // Every other frame is locked: right from the picked one wraps to None.
    press(row, picked, "ArrowRight");
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([none]);
    press(row, none, "ArrowLeft");
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([picked]);
  });

  it("draws a swatch from its catalog entry, a cape's in the player's own colours", () => {
    expect(swatchStyle(firstOf("frame"), null).colours["--swatch"]).toMatch(/^#[0-9a-f]{6}$/);
    const title = swatchStyle(firstOf("title"), null);
    expect(Object.keys(title.colours)).toEqual(["--swatch", "--swatch-glow"]);
    const cape = swatchStyle(firstOf("cape"), CAPE);
    expect(cape.colours).toEqual({ "--swatch": "#203040", "--swatch-trim": "#c0a060" });
    expect(cape.variant).not.toBeNull();
    const trim = COSMETIC_CATALOG.find(
      (entry) => entry.look.kind === "emblemFrame" && entry.look.colour === "trim",
    );
    if (trim === undefined) {
      throw new Error("no trim emblem frame");
    }
    expect(swatchStyle(trim, CAPE).colours["--swatch"]).toBe("#c0a060");
  });
});
