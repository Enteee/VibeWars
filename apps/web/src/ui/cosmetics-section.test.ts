import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COSMETIC_CATALOG, type CosmeticEntry } from "../cosmetics/catalog.js";
import { bodyFromKey } from "../cosmetics/body.js";
import { createCosmeticsStore, type CosmeticsStore } from "../cosmetics/store.js";
import { setOwnPubkey } from "../cosmetics/view.js";
import { t } from "../i18n/index.js";
import type { WornCosmetics } from "../cosmetics/selection.js";
import type { FigureLook } from "./character-card.js";
import type { CosmeticsPreview } from "./cosmetics-preview.js";
import {
  HOLD_MS,
  NO_PRESS,
  cosmeticsSection,
  previewPress,
  requirementText,
  shownLook,
  swatchStyle,
  type PressEvent,
  type PressState,
  type SwatchCape,
  type SwatchItem,
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

/**
 * What the last mounted section's figure wears, how often it replayed a
 * spawn and dissolve, and the professions it was last set to wear.
 */
const figure: {
  look: () => WornCosmetics;
  replays: number;
  professions: readonly string[] | undefined;
} = { look: () => ({}), replays: 0, professions: undefined };

/** The section mounted over `store`, the player wearing `cape`, playing `character`; its figure a stub. */
function mounted(
  store: CosmeticsStore,
  cape: SwatchCape | null = CAPE,
  character?: FigureLook,
): FakeElement {
  const container = new FakeElement();
  figure.replays = 0;
  figure.professions = undefined;
  cosmeticsSection(store, () => cape, {
    look: () => Promise.resolve(character),
    preview: (look): CosmeticsPreview => {
      figure.look = look;
      return {
        element: new FakeElement() as unknown as HTMLElement,
        start: () => undefined,
        stop: () => undefined,
        replayReactions: () => {
          figure.replays += 1;
        },
        setProfessions: (primary, secondary) => {
          figure.professions = [primary, secondary];
        },
      };
    },
  }).mount(container as unknown as HTMLElement);
  return container;
}

/** A pointer event of the first finger on `target`, at `x`. */
function pointer(target: FakeElement, type: string, x = 0): void {
  const event = {
    pointerId: 1,
    button: 0,
    clientX: x,
    clientY: 0,
    target,
    preventDefault: () => undefined,
  };
  for (const listener of target.listeners.get(type) ?? []) {
    listener(event as unknown as FakeEvent);
  }
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
    vi.restoreAllMocks();
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
    // Height and Build (#4176) are rows of words, not of swatches.
    for (const group of container
      .all("cosmetics-slot")
      .filter((each) => each.all("cosmetics-pill").length === 0)) {
      const items = COSMETIC_CATALOG.filter((entry) => entry.slot === group.dataset.slot);
      expect(group.all("cosmetics-row")).toHaveLength(1);
      const swatches = group.all("cosmetics-swatch").map((swatch) => swatch.dataset.item);
      expect(swatches).toEqual(["none", ...items.map((entry) => entry.id)]);
    }
    // A slot of one item is still a row: None, and that one.
    expect(slotOf(container, "flame").all("cosmetics-swatch")).toHaveLength(2);
  });

  it("marks a locked swatch aria-disabled, not disabled, and dims it with a lock, unless it is picked", () => {
    const store = emptyStore();
    const entry = firstOf("aura");
    const swatchOf = (): FakeElement | undefined =>
      slotOf(mounted(store), "aura")
        .all("cosmetics-swatch")
        .find((swatch) => swatch.dataset.item === entry.id);
    // No leaderboard entry known: everything is still to earn.
    // Not `disabled`: it still takes the press that previews it (#3989).
    expect(swatchOf()?.disabled).toBe(false);
    expect(swatchOf()?.getAttribute("aria-disabled")).toBe("true");
    expect(swatchOf()?.all("cosmetics-swatch-lock")).toHaveLength(1);
    // Picked while earned, then lost: still picked, still unpickable anew.
    store.pick("aura", entry.id);
    expect(swatchOf()?.getAttribute("aria-disabled")).toBeNull();
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

  it("keeps focus on the row picked from the keyboard, on the swatch now picked", () => {
    const page: { activeElement: FakeElement | null; createElement: () => FakeElement } = {
      activeElement: null,
      createElement: () => new FakeElement(),
    };
    vi.stubGlobal("document", page);
    vi.spyOn(FakeElement.prototype, "focus").mockImplementation(function (this: FakeElement) {
      page.activeElement = this;
    });
    const store = emptyStore();
    store.pick("frame", firstOf("frame").id);
    const container = mounted(store);
    const none = slotOf(container, "frame").all("cosmetics-swatch")[0];
    none?.focus();
    // Space or Enter on a focused swatch is its click.
    none?.click();
    const picked = slotOf(container, "frame").all("cosmetics-swatch")[0];
    expect(picked).not.toBe(none);
    expect(picked?.getAttribute("aria-pressed")).toBe("true");
    expect(page.activeElement).toBe(picked);
  });

  it("names the swatch with focus, not the picked one, when the pointer leaves another", () => {
    const page: { activeElement: FakeElement | null; createElement: () => FakeElement } = {
      activeElement: null,
      createElement: () => new FakeElement(),
    };
    vi.stubGlobal("document", page);
    const group = slotOf(mounted(emptyStore()), "aura");
    const [none, focused, hovered] = group.all("cosmetics-swatch");
    const detail = group.all("cosmetics-detail")[0];
    page.activeElement = focused ?? null;
    hovered?.fire("pointerenter");
    expect(detail?.textContent).toBe(hovered?.getAttribute("aria-label"));
    hovered?.fire("pointerleave");
    expect(detail?.textContent).toBe(focused?.getAttribute("aria-label"));
    page.activeElement = null;
    hovered?.fire("pointerleave");
    expect(detail?.textContent).toBe(none?.getAttribute("aria-label"));
  });

  it("is one tab stop per row, the arrows moving along it, locked swatches too (#3989)", () => {
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
    // The next frame is locked, and focused all the same: held Space previews it.
    const next = swatches[swatches.indexOf(picked) + 1] ?? none;
    press(row, picked, "ArrowRight");
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([next]);
    press(row, next, "ArrowLeft");
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([picked]);
  });

  it("draws a swatch from its catalog entry, an emblem frame's in the player's own trim", () => {
    expect(swatchStyle(firstOf("frame"), null).colours["--swatch"]).toMatch(/^#[0-9a-f]{6}$/);
    const title = swatchStyle(firstOf("title"), null);
    expect(Object.keys(title.colours)).toEqual(["--swatch", "--swatch-glow"]);
    const trim = COSMETIC_CATALOG.find(
      (entry) => entry.look.kind === "emblemFrame" && entry.look.colour === "trim",
    );
    if (trim === undefined) {
      throw new Error("no trim emblem frame");
    }
    expect(swatchStyle(trim, CAPE).colours["--swatch"]).toBe("#c0a060");
  });
});

describe("a swatch press (#3989)", () => {
  /** Earned: everything but `locked`. */
  const rules = { unlocked: (item: SwatchItem) => item !== "locked" };
  /** `events` stepped from no press: what was previewed and picked at each. */
  function run(events: readonly PressEvent[]): {
    previews: ({ item: SwatchItem } | null)[];
    picks: ({ item: SwatchItem } | null)[];
    state: PressState;
  } {
    let state = NO_PRESS;
    const previews: ({ item: SwatchItem } | null)[] = [];
    const picks: ({ item: SwatchItem } | null)[] = [];
    for (const event of events) {
      const outcome = previewPress(state, event, rules);
      state = outcome.state;
      previews.push(outcome.preview);
      picks.push(outcome.pick);
    }
    return { previews, picks, state };
  }

  it("previews a held earned item, and picks it on release; its click after is swallowed", () => {
    const { previews, picks, state } = run([
      { kind: "down", item: "earned" },
      { kind: "held" },
      { kind: "up" },
      { kind: "click", item: "earned" },
    ]);
    expect(previews[1]).toEqual({ item: "earned" });
    expect(picks).toEqual([null, null, { item: "earned" }, null]);
    expect(state).toEqual(NO_PRESS);
  });

  it("previews a held locked item, and lets it go on release, picking nothing", () => {
    const { previews, picks, state } = run([
      { kind: "down", item: "locked" },
      { kind: "held" },
      { kind: "up" },
      { kind: "click", item: "locked" },
    ]);
    expect(previews[1]).toEqual({ item: "locked" });
    expect(picks.every((pick) => pick === null)).toBe(true);
    expect(state.pressing).toBeNull();
  });

  it("picks nothing when the held press leaves its swatch or is cancelled", () => {
    for (const end of ["leave", "cancel"] as const) {
      const { picks, state } = run([
        { kind: "down", item: "earned" },
        { kind: "held" },
        { kind: end },
        { kind: "up" },
      ]);
      expect(picks.every((pick) => pick === null)).toBe(true);
      expect(state.pressing).toBeNull();
    }
  });

  it("picks an earned item clicked, and neither picks nor previews a locked one", () => {
    expect(run([{ kind: "click", item: "earned" }]).picks).toEqual([{ item: "earned" }]);
    const locked = run([
      { kind: "down", item: "locked" },
      { kind: "up" },
      { kind: "click", item: "locked" },
    ]);
    expect(locked.picks.every((pick) => pick === null)).toBe(true);
    expect(locked.previews.every((preview) => preview === null)).toBe(true);
    // None is a swatch like the rest.
    expect(run([{ kind: "click", item: undefined }]).picks).toEqual([{ item: undefined }]);
  });

  it("shows the choice with the held item on top, None baring its slot", () => {
    const aura = firstOf("aura");
    const frame = firstOf("frame");
    const choice: WornCosmetics = { frame };
    expect(shownLook(choice, null)).toBe(choice);
    expect(shownLook(choice, { slot: "aura", item: aura.id })).toEqual({ frame, aura });
    expect(shownLook(choice, { slot: "frame", item: undefined })).toEqual({});
  });
});

describe("Options > Cosmetics, held (#3989)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { createElement: () => new FakeElement(), activeElement: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("previews a locked item on the figure while held, says so, and keeps the choice", () => {
    const store = emptyStore();
    const entry = firstOf("aura");
    const group = slotOf(mounted(store), "aura");
    const swatch = group.all("cosmetics-swatch").find((each) => each.dataset.item === entry.id);
    const detail = group.all("cosmetics-detail")[0];
    if (swatch === undefined) {
      throw new Error("no aura swatch");
    }
    pointer(swatch, "pointerdown");
    vi.advanceTimersByTime(HOLD_MS);
    expect(figure.look().aura).toBe(entry);
    expect(detail?.textContent).toContain(`Previewing: ${t(entry.name)}`);
    expect(detail?.textContent).toContain(requirementText(entry));
    pointer(swatch, "pointerup");
    swatch.click();
    expect(figure.look().aura).toBeUndefined();
    expect(store.choice().aura).toBeUndefined();
  });

  it("lets a keyboard click pick after a held press picked and redrew the rows", () => {
    const store = emptyStore();
    store.pick("frame", firstOf("frame").id);
    store.pick("title", firstOf("title").id);
    const container = mounted(store);
    const frameNone = slotOf(container, "frame").all("cosmetics-swatch")[0];
    if (frameNone === undefined) {
      throw new Error("no frame swatches");
    }
    pointer(frameNone, "pointerdown");
    vi.advanceTimersByTime(HOLD_MS);
    // The pick redraws the rows: the click after it reaches no swatch.
    pointer(frameNone, "pointerup");
    expect(store.choice().frame).toBeUndefined();
    // Enter on a swatch is a click with no pointer behind it.
    slotOf(container, "title").all("cosmetics-swatch")[0]?.click();
    expect(store.choice().title).toBeUndefined();
  });

  it("lets a short press on a locked swatch pick and preview nothing", () => {
    const store = emptyStore();
    const group = slotOf(mounted(store), "frame");
    const [none, locked] = group.all("cosmetics-swatch");
    if (none === undefined || locked === undefined) {
      throw new Error("no frame swatches");
    }
    pointer(locked, "pointerdown");
    pointer(locked, "pointerup");
    locked.click();
    expect(store.choice().frame).toBeUndefined();
    expect(figure.look().frame).toBeUndefined();
  });

  it("replays the dissolve and spawn when one is held", () => {
    const entry = firstOf("spawn");
    const swatch = slotOf(mounted(emptyStore()), "spawn")
      .all("cosmetics-swatch")
      .find((each) => each.dataset.item === entry.id);
    if (swatch === undefined) {
      throw new Error("no spawn swatch");
    }
    pointer(swatch, "pointerdown");
    vi.advanceTimersByTime(HOLD_MS);
    expect(figure.replays).toBe(1);
    pointer(swatch, "pointercancel");
    expect(figure.look().spawn).toBeUndefined();
  });
});

describe("Options > Cosmetics, the preview's professions (#4177)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A monk/necromancer, all the section reads of a character. */
  const MONK = { primary: "monk", secondary: "necromancer" } as unknown as FigureLook;

  const picker = (container: FakeElement, which: "primary" | "secondary"): FakeElement => {
    const found = container.all(`cosmetics-${which}`)[0];
    if (found === undefined) {
      throw new Error(`no ${which} picker`);
    }
    return found;
  };
  const offered = (select: FakeElement): string[] => select.children.map((option) => option.value);

  it("shows no note above the figure", () => {
    expect(mounted(emptyStore()).all("cosmetics-note")).toHaveLength(0);
  });

  it("starts on the character's professions, else the first two", async () => {
    const played = mounted(emptyStore(), CAPE, MONK);
    await Promise.resolve();
    expect(picker(played, "primary").value).toBe("monk");
    expect(picker(played, "secondary").value).toBe("necromancer");

    const fresh = mounted(emptyStore());
    await Promise.resolve();
    expect(picker(fresh, "primary").value).toBe("warrior");
    expect(picker(fresh, "secondary").value).toBe("ranger");
    expect(figure.professions).toEqual(["warrior", "ranger"]);
  });

  it("never offers the picked primary as secondary, and moves a clashing secondary off it", async () => {
    const container = mounted(emptyStore(), CAPE, MONK);
    await Promise.resolve();
    const primary = picker(container, "primary");
    const secondary = picker(container, "secondary");
    expect(offered(primary)).toHaveLength(10);
    expect(offered(secondary)).not.toContain("monk");
    expect(offered(secondary)).toHaveLength(9);

    primary.value = "necromancer";
    primary.fire("change");
    expect(offered(secondary)).not.toContain("necromancer");
    expect(secondary.value).toBe("warrior");
    expect(figure.professions).toEqual(["necromancer", "warrior"]);
  });

  it("dresses the figure only: a pick stores nothing", async () => {
    const setItem = vi.fn();
    const store = createCosmeticsStore({ getItem: () => null, setItem, removeItem: setItem });
    const container = mounted(store, CAPE, MONK);
    await Promise.resolve();
    const secondary = picker(container, "secondary");
    secondary.value = "mesmer";
    secondary.fire("change");
    expect(figure.professions).toEqual(["monk", "mesmer"]);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("Options > Cosmetics, Height and Build (#4176)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement(), activeElement: null });
    setOwnPubkey("ab".repeat(32));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** `axis`'s row: each value's label, and the one chosen. */
  const row = (container: FakeElement, axis: string): { labels: string[]; chosen: string[] } => {
    const pills = slotOf(container, axis).all("cosmetics-pill");
    return {
      labels: pills.map((pill) => pill.textContent),
      chosen: pills
        .filter((pill) => pill.getAttribute("aria-checked") === "true")
        .map((pill) => pill.textContent),
    };
  };
  const heightName = (height: string): string =>
    t(
      height === "short"
        ? "cosmetics.heightShort"
        : height === "tall"
          ? "cosmetics.heightTall"
          : "cosmetics.heightAverage",
    );
  const buildName = (build: string): string =>
    t(
      build === "lean"
        ? "cosmetics.buildLean"
        : build === "heavy"
          ? "cosmetics.buildHeavy"
          : "cosmetics.buildAverage",
    );

  it("shows each row's value from your key until you pick, every value free", () => {
    const derived = bodyFromKey("ab".repeat(32));
    const container = mounted(emptyStore());
    expect(row(container, "height").labels).toEqual(["short", "average", "tall"].map(heightName));
    expect(row(container, "height").chosen).toEqual([heightName(derived.height)]);
    expect(row(container, "build").chosen).toEqual([buildName(derived.build)]);
    expect(slotOf(container, "build").all("cosmetics-locked")).toEqual([]);
  });

  it("stores only the row picked, the other still your key's", () => {
    const derived = bodyFromKey("ab".repeat(32));
    const store = emptyStore();
    const container = mounted(store);
    const tall = slotOf(container, "height")
      .all("cosmetics-pill")
      .find((pill) => pill.textContent === heightName("tall"));
    tall?.click();
    expect(store.body()).toEqual({ height: "tall", build: null });
    expect(row(container, "height").chosen).toEqual([heightName("tall")]);
    expect(row(container, "build").chosen).toEqual([buildName(derived.build)]);
  });

  it("walks a row with the arrows, picking as it goes", () => {
    const store = emptyStore();
    store.pickBody({ build: "lean" });
    const container = mounted(store);
    const build = slotOf(container, "build");
    const lean = build.all("cosmetics-pill")[0];
    if (lean === undefined) {
      throw new Error("no lean");
    }
    press(build.all("cosmetics-pills")[0] ?? build, lean, "ArrowRight");
    expect(store.body().build).toBe("average");
  });
});
