import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  FIRST_CAPE,
  PLAYER_APPLIES,
  isInvalidGuildTag,
  loadGuildCape,
  loadGuildTag,
  loadPlayerName,
  pickCape,
  playerGuild,
  playerGuildTag,
  playerSection,
  saveGuildCape,
  saveGuildTag,
  showsCapeDesigner,
} from "./player-section.js";

describe("the guild tag field (#1406)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows as invalid only what is typed and is no tag", () => {
    expect(isInvalidGuildTag("")).toBe(false);
    expect(isInvalidGuildTag("  ")).toBe(false);
    expect(isInvalidGuildTag("VIBE")).toBe(false);
    expect(isInvalidGuildTag("V")).toBe(true);
    expect(isInvalidGuildTag("V B")).toBe(true);
    expect(isInvalidGuildTag("[V]")).toBe(true);
  });

  it("remembers what was typed, and plays it only when it is a tag", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(loadGuildTag()).toBe("");
    expect(playerGuildTag()).toBeNull();
    saveGuildTag("V!");
    expect(loadGuildTag()).toBe("V!");
    expect(playerGuildTag()).toBeNull();
    saveGuildTag("Vb ");
    expect(playerGuildTag()).toBe("Vb");
  });

  it("plays untagged when the browser keeps nothing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    saveGuildTag("VIBE");
    expect(playerGuildTag()).toBeNull();
  });
});

describe("the cape designer (#1422)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A localStorage on a map, as the browser keeps one. */
  function storage(): Map<string, string> {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    return stored;
  }

  it("shows only while the tag is a valid one", () => {
    expect(showsCapeDesigner("")).toBe(false);
    expect(showsCapeDesigner("V")).toBe(false);
    expect(showsCapeDesigner("[VB]")).toBe(false);
    expect(showsCapeDesigner(" Vb ")).toBe(true);
  });

  it("starts a first pick from the sample, changes one part a pick, and No cape clears it", () => {
    const gold = pickCape(null, { part: "main", colour: "gold" });
    expect(gold).toEqual({ ...FIRST_CAPE, main: "gold" });
    expect(pickCape(gold, { part: "trim", colour: "gold" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      trim: "gold",
    });
    expect(pickCape(gold, { part: "emblem", emblem: "ring" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      emblem: "ring",
    });
    expect(pickCape(gold, { part: "none" })).toBeNull();
  });

  it("remembers the cape, and wears it only with a valid tag", () => {
    storage();
    expect(loadGuildCape()).toBeNull();
    saveGuildCape(FIRST_CAPE);
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    expect(playerGuild()).toEqual({ guildTag: null, guildCape: null });
    saveGuildTag("VIBE");
    expect(playerGuild()).toEqual({ guildTag: "VIBE", guildCape: FIRST_CAPE });
    // Cleared, the tag takes the cape off but keeps it for when it is back.
    saveGuildTag("");
    expect(playerGuild().guildCape).toBeNull();
    expect(loadGuildCape()).toEqual(FIRST_CAPE);
    saveGuildCape(null);
    expect(loadGuildCape()).toBeNull();
  });

  it("reads anything stored that is no cape as none", () => {
    const stored = storage();
    for (const corrupt of [
      "{",
      "null",
      '"violet"',
      JSON.stringify({ ...FIRST_CAPE, main: "red" }),
    ]) {
      stored.set(`${STORAGE_NAMESPACE}.guildCape`, corrupt);
      expect(loadGuildCape()).toBeNull();
    }
  });
});

/** Just enough DOM for the Player section; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  title = "";
  maxLength = -1;
  hidden = false;
  type = "";
  src = "";
  alt = "";
  width = 0;
  height = 0;
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: () => undefined };
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  readonly getContext = (): null => null;
  readonly toDataURL = (): string => "";

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  remove(): void {
    // Detached by the container's owner; nothing to do here.
  }

  /** Every element under this one, in document order. */
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  /** Type `text` into this input, as one input event. */
  typeIn(text: string): void {
    this.value = text;
    this.listeners.get("input")?.();
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the Player section of Options (#1513)", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Mount the section; its name and tag fields, its cape designer, and all of it. */
  function mount() {
    const container = new FakeElement("div");
    playerSection.mount(container as unknown as HTMLElement);
    const shown = container.all();
    const [name, tag] = shown.filter((node) => node.tagName === "input");
    const cape = shown.find((node) => node.className === "player-cape");
    if (name === undefined || tag === undefined || cape === undefined) {
      throw new Error("no name, tag or cape designer");
    }
    return { name, tag, cape, shown };
  }

  it("says when a change applies", () => {
    expect(mount().shown.some((node) => node.textContent === PLAYER_APPLIES)).toBe(true);
  });

  it("shows what is saved, and saves the name and tag on every keystroke", () => {
    stored.set(`${STORAGE_NAMESPACE}.playerName`, "Rurik");
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { name, tag } = mount();
    expect(name.value).toBe("Rurik");
    expect(name.placeholder).toBe("Player");
    expect(tag.value).toBe("VIBE");
    name.typeIn("Ente");
    expect(loadPlayerName()).toBe("Ente");
    tag.typeIn("VB");
    expect(loadGuildTag()).toBe("VB");
  });

  it("hides the cape designer and shows the hint while the tag is invalid", () => {
    const { tag, cape, shown } = mount();
    const hint = shown.find((node) => node.className === "field-hint");
    expect(cape.hidden).toBe(true);
    tag.typeIn("VIBE");
    expect(cape.hidden).toBe(false);
    expect(hint?.hidden).toBe(true);
    tag.typeIn("V!");
    expect(cape.hidden).toBe(true);
    expect(hint?.hidden).toBe(false);
    expect(tag.attributes.get("aria-invalid")).toBe("true");
  });

  it("saves a cape on every pick", () => {
    stored.set(`${STORAGE_NAMESPACE}.guildTag`, "VIBE");
    const { shown } = mount();
    const gold = shown.find((node) => node.dataset.colour === "gold");
    gold?.click();
    expect(loadGuildCape()).toEqual({ ...FIRST_CAPE, main: "gold" });
    expect(gold?.attributes.get("aria-pressed")).toBe("true");
    shown.find((node) => node.textContent === "No cape")?.click();
    expect(loadGuildCape()).toBeNull();
  });
});
